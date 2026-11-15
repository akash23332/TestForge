import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Enable real Redis flag
process.env.USE_REAL_REDIS = 'true';

import { createRedisConnection, disconnectRedis } from '../src/config/redis.js';
import { getExecutionQueue, enqueueExecutionJob } from '../src/services/queue/executionQueue.js';
import { recoverUnavailableSubmissions, clearUnresolvedRemoteExecution } from '../src/services/queue/executionRecovery.js';
import { processExecutionJob } from '../src/services/queue/executionProcessor.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import { OnlineCompilerProvider } from '../src/services/execution/OnlineCompilerProvider.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { Exam } from '../src/models/Exam.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { Submission } from '../src/models/Submission.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { User } from '../src/models/User.js';

function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Controlled Execution Provider:
 * Wraps real OnlineCompilerProvider to introduce exact execution barriers for Worker A and Worker B,
 * allowing deterministic demonstration of distributed fencing and stale write rejection.
 */
class FencingBarrierProvider {
  constructor(realCompiler) {
    this.name = 'fencing_barrier';
    this.isHardenedSandbox = true;
    this.realCompiler = realCompiler;
    this.callCount = 0;
    this.workerAStarted = createDeferred();
    this.workerAResume = createDeferred();
    this.workerBStarted = createDeferred();
    this.workerBResume = createDeferred();
    this.workerALogs = [];
    this.workerBLogs = [];
  }

  async executeCode(params) {
    this.callCount++;
    const currentCall = this.callCount;

    if (currentCall === 1) {
      this.workerALogs.push(`[Worker A] executeCode invoked for submission. Running remote compiler...`);
      console.log('    -> [Provider Barrier] Worker A entered executeCode. Compiling code...');
      const result = await this.realCompiler.executeCode(params);
      this.workerALogs.push(`[Worker A] Remote compilation finished (${result.runtimeMs}ms, status: ${result.status}). Pausing before MongoDB persistence.`);
      console.log('    -> [Provider Barrier] Worker A evaluation complete. Pausing Worker A before persistence...');
      this.workerAStarted.resolve();
      // Block Worker A until step 8
      await this.workerAResume.promise;
      this.workerALogs.push(`[Worker A] Resumed by test controller. Proceeding to persist results to MongoDB.`);
      console.log('    -> [Provider Barrier] Worker A resumed! Attempting stale write to MongoDB...');
      return result;
    } else {
      this.workerBLogs.push(`[Worker B] executeCode invoked for submission. Running remote compiler...`);
      console.log('    -> [Provider Barrier] Worker B entered executeCode. Compiling code...');
      const result = await this.realCompiler.executeCode(params);
      this.workerBLogs.push(`[Worker B] Remote compilation finished (${result.runtimeMs}ms, status: ${result.status}). Pausing before MongoDB persistence.`);
      console.log('    -> [Provider Barrier] Worker B evaluation complete. Pausing Worker B before persistence...');
      this.workerBStarted.resolve();
      // Block Worker B until step 11
      await this.workerBResume.promise;
      this.workerBLogs.push(`[Worker B] Resumed by test controller. Proceeding to persist authoritative results to MongoDB.`);
      console.log('    -> [Provider Barrier] Worker B resumed! Attempting authoritative write to MongoDB...');
      return result;
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log(' TESTFORGE DISTRIBUTED WORKER FENCING & STALE WRITE GUARD TEST');
  console.log('================================================================\n');

  // 1. Connect to Real Redis & Verify PING
  console.log('--- 1. CONNECTING TO REAL REDIS 8 ---');
  const redis = createRedisConnection({ lazyConnect: false });
  const ping = await redis.ping();
  const info = await redis.info('server');
  const vMatch = info.match(/redis_version:([^\r\n]+)/);
  const redisVersion = vMatch ? vMatch[1] : 'Unknown';
  console.log(`Redis PING: ${ping} | Server Version: ${redisVersion}`);

  // 2. Connect to Real MongoDB Atlas
  console.log('\n--- 2. CONNECTING TO REAL MONGODB ATLAS ---');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log('Connected to MongoDB Atlas:', mongoose.connection.host);

  const cleanUpIds = {
    users: [],
    questions: [],
    testCases: [],
    exams: [],
    attempts: [],
    submissions: [],
    answers: []
  };

  // Register the Fencing Barrier Provider
  const realOnlineCompiler = new OnlineCompilerProvider();
  const barrierProvider = new FencingBarrierProvider(realOnlineCompiler);
  providerRegistry.register('fencing_barrier', barrierProvider);
  providerRegistry.setActiveProvider('fencing_barrier');
  console.log('\nActive Provider set to:', providerRegistry.activeProviderName);

  try {
    // 3. Create Test Fixtures in MongoDB Atlas
    console.log('\n--- 3. CREATING TEST FIXTURES ---');
    const teacher = await User.create({
      name: 'Teacher Fencing Test',
      email: `teacher_fencing_${Date.now()}@testforge.io`,
      passwordHash: 'HashPassword123!',
      role: 'teacher'
    });
    cleanUpIds.users.push(teacher._id);

    const student = await User.create({
      name: 'Student Fencing Test',
      email: `student_fencing_${Date.now()}@testforge.io`,
      passwordHash: 'HashPassword123!',
      role: 'student'
    });
    cleanUpIds.users.push(student._id);

    const question = await Question.create({
      ownerId: teacher._id,
      title: 'Fencing Add Challenge',
      statement: 'Return the sum of two integers.',
      executionMode: 'FUNCTION',
      dataStructure: 'NONE',
      functionName: 'add',
      functionSignature: {
        parameters: [
          { name: 'a', type: 'integer' },
          { name: 'b', type: 'integer' }
        ],
        returnType: 'integer'
      },
      language: 'python',
      referenceSolution: 'def add(a, b):\n    return a + b\n',
      status: 'published'
    });
    cleanUpIds.questions.push(question._id);

    const testCase = await TestCase.create({
      questionId: question._id,
      input: '5\n7',
      expectedOutput: '12',
      category: 'sample',
      visibility: 'public',
      verificationStatus: 'verified'
    });
    cleanUpIds.testCases.push(testCase._id);

    const exam = await Exam.create({
      examCode: `FENCE_${Date.now()}`,
      title: 'Distributed Worker Fencing Exam',
      createdBy: teacher._id,
      durationMinutes: 60,
      sections: [
        {
          name: 'Coding Section',
          questions: [
            {
              type: 'coding',
              questionId: question._id,
              marks: 10
            }
          ]
        }
      ]
    });
    cleanUpIds.exams.push(exam._id);

    const attempt = await ExamAttempt.create({
      examId: exam._id,
      studentId: student._id,
      candidateInfo: {
        name: student.name,
        email: student.email
      },
      status: 'IN_PROGRESS',
      expiresAt: new Date(Date.now() + 3600000)
    });
    cleanUpIds.attempts.push(attempt._id);

    console.log(`Created Question: ${question._id}`);
    console.log(`Created ExamAttempt: ${attempt._id}`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 1: CREATE REAL SUBMISSION AND ENQUEUE VIA BULLMQ
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n========================================================');
    console.log(' STEP 1: CREATE SUBMISSION & ENQUEUE IN BULLMQ');
    console.log('========================================================');

    const sub = await Submission.create({
      attemptId: attempt._id,
      questionId: question._id,
      code: 'def add(a, b):\n    return a + b\n',
      language: 'python',
      runType: 'SUBMISSION',
      status: 'QUEUED',
      verdict: 'PENDING',
      executionVersion: 0,
      idempotencyKey: `client:${student._id}:${attempt._id}:${question._id}:SUBMISSION:${crypto.randomUUID()}`
    });
    cleanUpIds.submissions.push(sub._id);
    console.log(`Created Submission: ${sub._id}`);

    const queue = getExecutionQueue();
    const bullmqJob = await enqueueExecutionJob({
      submissionId: sub._id.toString(),
      attemptId: attempt._id.toString(),
      questionId: question._id.toString(),
      runType: 'SUBMISSION',
      language: 'python'
    });
    console.log(`Enqueued BullMQ Job in Redis: ${bullmqJob.id}`);

    // Verify job in BullMQ
    const retrievedJob = await queue.getJob(bullmqJob.id);
    console.log(`BullMQ Job verified in Redis: ID=${retrievedJob.id}, State=${await retrievedJob.getState()}`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 2 & 3: WORKER A ACQUIRES LEASE VERSION 1 & PAUSES BEFORE PERSISTENCE
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n========================================================');
    console.log(' STEP 2 & 3: WORKER A ACQUIRES LEASE v1 & PAUSES');
    console.log('========================================================');

    console.log('[Worker A] Launching execution processor with 6000ms short lease...');
    // Worker A runs with short lease (6000ms > 2500ms loop check buffer) and no heartbeat so lease will expire
    const workerAPromise = processExecutionJob(retrievedJob, {
      leaseDurationMs: 6000,
      heartbeatIntervalMs: 60000
    });

    // Wait until Worker A has claimed the lease and entered execution barrier
    await barrierProvider.workerAStarted.promise;
    console.log('[Worker A] Successfully paused at barrier after executing remote code.');

    // Inspect MongoDB state after Worker A claim
    const subAfterWorkerA = await Submission.findById(sub._id).lean();
    console.log('\n[MongoDB State after Worker A claim]:');
    console.log(`- Status: ${subAfterWorkerA.status}`);
    console.log(`- Execution Version: ${subAfterWorkerA.executionVersion}`);
    console.log(`- Execution Owner (Worker A): ${subAfterWorkerA.executionOwner}`);
    console.log(`- Execution Lease Expires At: ${subAfterWorkerA.executionLeaseExpiresAt.toISOString()}`);

    if (subAfterWorkerA.executionVersion !== 1) {
      throw new Error(`Expected executionVersion 1 for Worker A, got ${subAfterWorkerA.executionVersion}`);
    }
    const workerAOwner = subAfterWorkerA.executionOwner;

    // ════════════════════════════════════════════════════════════════════════
    // STEP 4: ALLOW WORKER A'S LEASE TO EXPIRE
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n========================================================');
    console.log(' STEP 4: ALLOW WORKER A EXECUTION LEASE TO EXPIRE');
    console.log('========================================================');

    const waitMs = Math.max(0, new Date(subAfterWorkerA.executionLeaseExpiresAt).getTime() - Date.now() + 500);
    console.log(`Waiting ${waitMs}ms for lease expiration...`);
    await new Promise(r => setTimeout(r, waitMs));

    const subExpired = await Submission.findById(sub._id).lean();
    const isExpired = new Date(subExpired.executionLeaseExpiresAt) < new Date();
    console.log(`Lease Expiration Confirmed in MongoDB: ${isExpired} (Now=${new Date().toISOString()} > ExpiresAt=${subExpired.executionLeaseExpiresAt.toISOString()})`);
    if (!isExpired) {
      throw new Error('Worker A lease did not expire as expected');
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 5: RUN ACTUAL RECOVERY PROCESS
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n========================================================');
    console.log(' STEP 5: RUN ACTUAL RECOVERY PROCESS');
    console.log('========================================================');

    console.log('Invoking recoverUnavailableSubmissions sweep...');
    const recoveryResult = await recoverUnavailableSubmissions({
      submissionId: sub._id.toString()
    });
    console.log('Recovery Sweep Outcome:', recoveryResult);

    // Clear unresolved remote execution state to safely authorize Worker B reassignment
    console.log('Clearing unresolved remote execution state for safe replacement worker claim...');
    await clearUnresolvedRemoteExecution(sub._id.toString(), 'automated-recovery-engine', 'Lease expired; verified safe for worker reassignment');

    const subAfterRecovery = await Submission.findById(sub._id).lean();
    console.log('\n[MongoDB State after Recovery Sweep]:');
    console.log(`- Status: ${subAfterRecovery.status}`);
    console.log(`- Execution Version: ${subAfterRecovery.executionVersion}`);
    console.log(`- Recovery Owner: ${subAfterRecovery.recoveryOwner}`);
    console.log(`- Job ID: ${subAfterRecovery.jobId}`);

    if (subAfterRecovery.status !== 'QUEUED') {
      throw new Error(`Expected status QUEUED after recovery, got ${subAfterRecovery.status}`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 6 & 7: WORKER B ACQUIRES LEASE VERSION 2 & PAUSES
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n========================================================');
    console.log(' STEP 6 & 7: WORKER B ACQUIRES LEASE v2 & PAUSES');
    console.log('========================================================');

    console.log('[Worker B] Launching execution processor on recovered job...');
    const jobB = await queue.getJob(bullmqJob.id) || retrievedJob;
    const workerBPromise = processExecutionJob(jobB, {
      leaseDurationMs: 60000,
      heartbeatIntervalMs: 60000
    });

    // Wait until Worker B has claimed lease version 2 and entered execution barrier
    await barrierProvider.workerBStarted.promise;
    console.log('[Worker B] Successfully paused at barrier after executing remote code.');

    // Inspect MongoDB state after Worker B claim
    const subAfterWorkerB = await Submission.findById(sub._id).lean();
    console.log('\n[MongoDB State after Worker B claim]:');
    console.log(`- Status: ${subAfterWorkerB.status}`);
    console.log(`- Execution Version: ${subAfterWorkerB.executionVersion}`);
    console.log(`- Execution Owner (Worker B): ${subAfterWorkerB.executionOwner}`);
    console.log(`- Execution Lease Expires At: ${subAfterWorkerB.executionLeaseExpiresAt.toISOString()}`);

    if (subAfterWorkerB.executionVersion !== 2) {
      throw new Error(`Expected executionVersion 2 for Worker B, got ${subAfterWorkerB.executionVersion}`);
    }
    const workerBOwner = subAfterWorkerB.executionOwner;

    if (workerAOwner === workerBOwner) {
      throw new Error(`Worker A and Worker B must have distinct execution owners!`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 8, 9 & 10: RESUME WORKER A & VERIFY MONGODB REJECTS STALE WRITE
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n========================================================');
    console.log(' STEP 8, 9 & 10: RESUME WORKER A & VERIFY STALE REJECTION');
    console.log('========================================================');

    console.log('[Worker A] Resuming Worker A while Worker B is actively processing...');
    barrierProvider.workerAResume.resolve();

    const workerAResult = await workerAPromise;
    console.log('\n[Worker A Execution Processor Return Value]:');
    console.log(JSON.stringify(workerAResult, null, 2));

    if (workerAResult.status !== 'STALE_PREEMPTED') {
      throw new Error(`Expected Worker A status STALE_PREEMPTED, got ${workerAResult.status}`);
    }

    // Verify MongoDB state was NOT modified by Worker A
    const subAfterStaleAttempt = await Submission.findById(sub._id).lean();
    console.log('\n[MongoDB State after Worker A stale write attempt]:');
    console.log(`- Status: ${subAfterStaleAttempt.status} (Must remain RUNNING for Worker B)`);
    console.log(`- Execution Version: ${subAfterStaleAttempt.executionVersion} (Must remain 2)`);
    console.log(`- Execution Owner: ${subAfterStaleAttempt.executionOwner} (Must remain Worker B)`);

    if (subAfterStaleAttempt.executionVersion !== 2) {
      throw new Error(`Worker A overwrote executionVersion! Expected 2, got ${subAfterStaleAttempt.executionVersion}`);
    }
    if (subAfterStaleAttempt.executionOwner !== workerBOwner) {
      throw new Error(`Worker A overwrote executionOwner!`);
    }
    if (subAfterStaleAttempt.status !== 'RUNNING') {
      throw new Error(`Worker A overwrote status! Expected RUNNING, got ${subAfterStaleAttempt.status}`);
    }

    // Verify StudentAnswer was NOT created or modified by Worker A
    const answerAfterWorkerA = await StudentAnswer.findOne({
      attemptId: attempt._id,
      $or: [{ questionId: question._id }, { questionId: question._id.toString() }]
    }).lean();
    console.log(`- StudentAnswer present after Worker A stale attempt: ${Boolean(answerAfterWorkerA)} (Must be false)`);
    if (answerAfterWorkerA) {
      throw new Error(`Worker A illegally created or updated StudentAnswer!`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 11: ALLOW WORKER B TO FINISH
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n========================================================');
    console.log(' STEP 11: ALLOW WORKER B TO FINISH');
    console.log('========================================================');

    console.log('[Worker B] Resuming Worker B to persist authoritative results...');
    barrierProvider.workerBResume.resolve();

    const workerBResult = await workerBPromise;
    console.log('\n[Worker B Execution Processor Return Value]:');
    console.log(JSON.stringify(workerBResult, null, 2));

    // ════════════════════════════════════════════════════════════════════════
    // STEP 12: VERIFY FINAL AUTHORITATIVE RESULT BELONGS TO WORKER B
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n========================================================');
    console.log(' STEP 12: VERIFY FINAL AUTHORITATIVE RESULT BELONGS TO WORKER B');
    console.log('========================================================');

    const finalSub = await Submission.findById(sub._id).lean();
    console.log('\n[Final Authoritative Submission Document]:');
    console.log(`- ID: ${finalSub._id}`);
    console.log(`- Status: ${finalSub.status}`);
    console.log(`- Verdict: ${finalSub.verdict}`);
    console.log(`- Execution Version: ${finalSub.executionVersion}`);
    console.log(`- Execution Owner: ${finalSub.executionOwner}`);
    console.log(`- Score Awarded: ${finalSub.scoreAwarded} / 10`);
    console.log(`- Total Tests: ${finalSub.totalTests}`);
    console.log(`- Passed Tests: ${finalSub.passedTests}`);
    console.log(`- Test Results:`, JSON.stringify(finalSub.testResults, null, 2));

    if (finalSub.status !== 'COMPLETED') {
      throw new Error(`Expected final status COMPLETED, got ${finalSub.status}`);
    }
    if (finalSub.verdict !== 'ACCEPTED') {
      throw new Error(`Expected final verdict ACCEPTED, got ${finalSub.verdict}`);
    }
    if (finalSub.executionVersion !== 2) {
      throw new Error(`Expected executionVersion 2, got ${finalSub.executionVersion}`);
    }
    if (finalSub.executionOwner !== workerBOwner) {
      throw new Error(`Expected executionOwner to be Worker B (${workerBOwner}), got ${finalSub.executionOwner}`);
    }

    // Verify StudentAnswer was created authoritatively by Worker B
    const allAnswers = await StudentAnswer.find({
      attemptId: attempt._id,
      $or: [{ questionId: question._id }, { questionId: question._id.toString() }]
    }).lean();

    console.log('\n[Final StudentAnswer Documents in MongoDB]:');
    console.log(`- Total matching StudentAnswer records: ${allAnswers.length} (Must be exactly 1)`);
    if (allAnswers.length !== 1) {
      throw new Error(`Expected exactly 1 StudentAnswer document, found ${allAnswers.length}`);
    }

    const finalAnswer = allAnswers[0];
    cleanUpIds.answers.push(finalAnswer._id);
    console.log(`- StudentAnswer ID: ${finalAnswer._id}`);
    console.log(`- Status: ${finalAnswer.status}`);
    console.log(`- Score: ${finalAnswer.score} / 10`);
    console.log(`- Test Cases Passed: ${finalAnswer.testCasesPassed} / ${finalAnswer.totalTestCases}`);
    console.log(`- Verdict: ${finalAnswer.verdict}`);

    if (finalAnswer.status !== 'SUBMITTED') {
      throw new Error(`Expected StudentAnswer status SUBMITTED, got ${finalAnswer.status}`);
    }
    if (finalAnswer.score !== 10) {
      throw new Error(`Expected StudentAnswer score 10, got ${finalAnswer.score}`);
    }

    console.log('\n========================================================');
    console.log(' ALL FENCING ASSERTIONS VERIFIED SUCCESSFULLY!');
    console.log('========================================================\n');

    console.log('--- WORKER A EXECUTION LOGS ---');
    barrierProvider.workerALogs.forEach(l => console.log(l));

    console.log('\n--- WORKER B EXECUTION LOGS ---');
    barrierProvider.workerBLogs.forEach(l => console.log(l));

  } finally {
    // Restore provider
    providerRegistry.setActiveProvider('onlinecompiler');

    // Clean up test documents from MongoDB Atlas
    console.log('\n--- CLEANING UP TEST FIXTURES ---');
    if (cleanUpIds.users.length) await User.deleteMany({ _id: { $in: cleanUpIds.users } });
    if (cleanUpIds.questions.length) await Question.deleteMany({ _id: { $in: cleanUpIds.questions } });
    if (cleanUpIds.testCases.length) await TestCase.deleteMany({ _id: { $in: cleanUpIds.testCases } });
    if (cleanUpIds.exams.length) await Exam.deleteMany({ _id: { $in: cleanUpIds.exams } });
    if (cleanUpIds.attempts.length) await ExamAttempt.deleteMany({ _id: { $in: cleanUpIds.attempts } });
    if (cleanUpIds.submissions.length) await Submission.deleteMany({ _id: { $in: cleanUpIds.submissions } });
    if (cleanUpIds.answers.length) await StudentAnswer.deleteMany({ _id: { $in: cleanUpIds.answers } });
    console.log('Test fixtures removed from MongoDB Atlas.');

    await disconnectRedis();
    await mongoose.disconnect();
    redis.disconnect();
    process.exit(0);
  }
}

main().catch(err => {
  console.error('\nFATAL FENCING TEST ERROR:', err);
  process.exit(1);
});
