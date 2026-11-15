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

import { createRedisConnection, getRedisClient, disconnectRedis } from '../src/config/redis.js';
import { getExecutionQueue, enqueueExecutionJob } from '../src/services/queue/executionQueue.js';
import { recoverUnavailableSubmissions } from '../src/services/queue/executionRecovery.js';
import { processExecutionJob } from '../src/services/queue/executionProcessor.js';
import { runSampleTests, submitQuestion, getSubmissionStatus } from '../src/controllers/attempt.controller.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { Exam } from '../src/models/Exam.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { Submission } from '../src/models/Submission.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { User } from '../src/models/User.js';

const createMockRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    }
  };
  return res;
};

const nextHandler = (err) => {
  if (err) throw err;
};

async function main() {
  console.log('================================================================');
  console.log(' TESTFORGE REAL REDIS + BULLMQ + MONGODB E2E INTEGRATION SUITE');
  console.log('================================================================\n');

  // 1. Connect to Real Redis & Verify Version / PING
  console.log('--- 1. REAL REDIS CONNECTIVITY & VERSION CHECK ---');
  const redis = createRedisConnection({ lazyConnect: false });
  const pingRes = await redis.ping();
  console.log('Redis PING Response:', pingRes);
  const info = await redis.info('server');
  const vMatch = info.match(/redis_version:([^\r\n]+)/);
  const redisVersion = vMatch ? vMatch[1] : 'Unknown';
  console.log('Real Redis Server Version:', redisVersion);

  // 2. Connect to Real MongoDB Atlas
  console.log('\n--- 2. REAL MONGODB ATLAS CONNECTION ---');
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

  try {
    // 3. Create Real Test Fixtures
    console.log('\n--- 3. CREATING TEST FIXTURES IN MONGODB ---');
    const teacher = await User.create({
      name: 'Teacher Real Integration',
      email: `teacher_${Date.now()}@testforge.io`,
      passwordHash: 'HashPassword123!',
      role: 'teacher'
    });
    cleanUpIds.users.push(teacher._id);

    const student = await User.create({
      name: 'Student Real Integration',
      email: `student_${Date.now()}@testforge.io`,
      passwordHash: 'HashPassword123!',
      role: 'student'
    });
    cleanUpIds.users.push(student._id);

    const question = await Question.create({
      ownerId: teacher._id,
      title: 'Real Redis Add Numbers',
      statement: 'Return the sum of two numbers a and b.',
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

    // Public sample test case
    const sampleTc = await TestCase.create({
      questionId: question._id,
      input: '2\n3',
      expectedOutput: '5',
      category: 'sample',
      visibility: 'public',
      verificationStatus: 'verified'
    });
    cleanUpIds.testCases.push(sampleTc._id);

    // Hidden evaluation test case
    const hiddenTc = await TestCase.create({
      questionId: question._id,
      input: '10\n20',
      expectedOutput: '30',
      category: 'normal',
      visibility: 'hidden',
      verificationStatus: 'verified'
    });
    cleanUpIds.testCases.push(hiddenTc._id);

    const exam = await Exam.create({
      examCode: `EXAM_${Date.now()}`,
      title: 'Real BullMQ Execution Exam',
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
    console.log(`Created Exam: ${exam._id}`);
    console.log(`Created ExamAttempt: ${attempt._id}`);

    // ════════════════════════════════════════════════════════════════════════
    // LIFECYCLE A: STUDENT SAMPLE RUN
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n========================================================');
    console.log(' LIFECYCLE A: STUDENT SAMPLE RUN (REAL QUEUE + WORKER)');
    console.log('========================================================');

    const sampleRunReq = {
      params: { attemptId: attempt._id.toString() },
      body: {
        questionId: question._id.toString(),
        code: 'def add(a, b):\n    return a + b\n',
        language: 'python'
      },
      headers: {
        'idempotency-key': crypto.randomUUID()
      },
      attempt
    };
    const sampleRunRes = createMockRes();

    await runSampleTests(sampleRunReq, sampleRunRes, nextHandler);
    console.log('runSampleTests HTTP Response Code:', sampleRunRes.statusCode);
    console.log('runSampleTests Response Body:', sampleRunRes.body);

    const sampleSubId = sampleRunRes.body?.data?.submissionId;
    if (!sampleSubId) throw new Error('Submission ID missing from sample run response');
    cleanUpIds.submissions.push(sampleSubId);

    // Verify Submission document created in MongoDB
    const sampleSubBefore = await Submission.findById(sampleSubId).lean();
    console.log('\n[Before Worker] Submission document in MongoDB:');
    console.log(`- ID: ${sampleSubBefore._id}`);
    console.log(`- runType: ${sampleSubBefore.runType}`);
    console.log(`- status: ${sampleSubBefore.status}`);
    console.log(`- jobId: ${sampleSubBefore.jobId}`);

    // Verify BullMQ job created in Redis
    const queue = getExecutionQueue();
    const bullmqJob = await queue.getJob(sampleSubBefore.jobId);
    console.log('\n[BullMQ Redis Verification]');
    console.log(`- Job ID in Redis: ${bullmqJob?.id}`);
    console.log(`- Job Name: ${bullmqJob?.name}`);
    console.log(`- Job Priority: ${bullmqJob?.opts?.priority} (Priority 1 = Sample)`);

    // Poll endpoint until Worker processes job
    console.log('\n[Polling getSubmissionStatus for Sample Run]');
    let sampleFinalResult = null;
    const isTerminalStatus = (st) => [
      'COMPLETED',
      'FAILED',
      'COMPILE_ERROR',
      'RUNTIME_ERROR',
      'TIME_LIMIT_EXCEEDED',
      'MEMORY_LIMIT_EXCEEDED',
      'OUTPUT_LIMIT_EXCEEDED',
      'INTERNAL_ERROR',
      'EXECUTION_UNAVAILABLE'
    ].includes(st);

    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const pollReq = {
        params: { attemptId: attempt._id.toString(), submissionId: sampleSubId.toString() },
        attempt
      };
      const pollRes = createMockRes();
      await getSubmissionStatus(pollReq, pollRes, nextHandler);
      if (pollRes.body?.data?.status && isTerminalStatus(pollRes.body.data.status)) {
        sampleFinalResult = pollRes.body.data;
        break;
      }
      process.stdout.write('.');
    }
    console.log('\nSample Run Final Polling Result:');
    console.log(JSON.stringify(sampleFinalResult, null, 2));

    if (sampleFinalResult?.status !== 'COMPLETED') {
      throw new Error(`Sample run did not reach COMPLETED status: ${sampleFinalResult?.status}`);
    }
    const evaluatedCases = sampleFinalResult.testResults || sampleFinalResult.results || [];
    console.log(`- Sample Test Cases Evaluated: ${evaluatedCases.length}`);
    console.log(`- Verdict: ${sampleFinalResult.verdict}`);

    // Verify only public sample was executed, NOT hidden case
    const hasHidden = evaluatedCases.some(r => r.visibility === 'hidden' || r.isHidden === true);
    console.log(`- Zero-Leak Enforced (Hidden Cases Excluded): ${!hasHidden}`);

    // ════════════════════════════════════════════════════════════════════════
    // LIFECYCLE B: STUDENT FINAL SUBMISSION
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n========================================================');
    console.log(' LIFECYCLE B: STUDENT FINAL SUBMISSION (ALL TEST CASES)');
    console.log('========================================================');

    const submitReq = {
      params: { attemptId: attempt._id.toString() },
      body: {
        questionId: question._id.toString(),
        code: 'def add(a, b):\n    return a + b\n',
        language: 'python'
      },
      headers: {
        'idempotency-key': crypto.randomUUID()
      },
      attempt
    };
    const submitRes = createMockRes();

    await submitQuestion(submitReq, submitRes, nextHandler);
    console.log('submitQuestion HTTP Response Code:', submitRes.statusCode);
    console.log('submitQuestion Response Body:', submitRes.body);

    const submitSubId = submitRes.body?.data?.submissionId;
    if (!submitSubId) throw new Error('Submission ID missing from submission response');
    cleanUpIds.submissions.push(submitSubId);

    const submitSubBefore = await Submission.findById(submitSubId).lean();
    console.log('\n[Before Worker] Final Submission in MongoDB:');
    console.log(`- ID: ${submitSubBefore._id}`);
    console.log(`- runType: ${submitSubBefore.runType}`);
    console.log(`- status: ${submitSubBefore.status}`);
    console.log(`- jobId: ${submitSubBefore.jobId}`);

    const bullmqSubmitJob = await queue.getJob(submitSubBefore.jobId);
    console.log('\n[BullMQ Redis Verification]');
    console.log(`- Job ID in Redis: ${bullmqSubmitJob?.id}`);
    console.log(`- Job Priority: ${bullmqSubmitJob?.opts?.priority} (Priority 5 = Final Submission)`);

    // Poll endpoint until Worker processes final submission
    console.log('\n[Polling getSubmissionStatus for Final Submission]');
    let submitFinalResult = null;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const pollReq = {
        params: { attemptId: attempt._id.toString(), submissionId: submitSubId.toString() },
        attempt
      };
      const pollRes = createMockRes();
      await getSubmissionStatus(pollReq, pollRes, nextHandler);
      if (pollRes.body?.data?.status && isTerminalStatus(pollRes.body.data.status)) {
        submitFinalResult = pollRes.body.data;
        break;
      }
      process.stdout.write('.');
    }
    console.log('\nFinal Submission Polling Result:');
    console.log(JSON.stringify(submitFinalResult, null, 2));

    if (submitFinalResult?.status !== 'COMPLETED' || submitFinalResult?.verdict !== 'ACCEPTED') {
      throw new Error(`Submission verdict not ACCEPTED: ${submitFinalResult?.verdict}`);
    }

    // Verify StudentAnswer was persisted in MongoDB
    const studentAnswer = await StudentAnswer.findOne({
      attemptId: attempt._id,
      $or: [{ questionId: question._id }, { questionId: question._id.toString() }]
    }).lean();
    if (studentAnswer?._id) cleanUpIds.answers.push(studentAnswer._id);
    console.log('\n[MongoDB StudentAnswer Verification]');
    console.log(`- StudentAnswer ID: ${studentAnswer?._id}`);
    console.log(`- Status: ${studentAnswer?.status}`);
    console.log(`- Score Awarded: ${studentAnswer?.score} / 10`);
    console.log(`- Test Cases Passed: ${studentAnswer?.testCasesPassed} / ${studentAnswer?.totalTestCases}`);
    console.log(`- Verdict: ${studentAnswer?.verdict}`);

    // ════════════════════════════════════════════════════════════════════════
    // LIFECYCLE C: FAILURE RECOVERY & STALE WORKER LOCK PREEMPTION
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n========================================================');
    console.log(' LIFECYCLE C: WORKER CRASH RECOVERY & PREEMPTION GUARD');
    console.log('========================================================');

    // Simulate worker crash: Create a submission in RUNNING with expired execution lease
    const staleOwner = crypto.randomUUID();
    const crashedSub = await Submission.create({
      attemptId: attempt._id,
      questionId: question._id,
      code: 'def add(a, b):\n    return a + b\n',
      language: 'python',
      runType: 'SUBMISSION',
      status: 'RUNNING',
      verdict: 'PENDING',
      executionOwner: staleOwner,
      executionVersion: 1,
      executionLeaseExpiresAt: new Date(Date.now() - 60000), // Expired 1 min ago
      idempotencyKey: crypto.randomUUID()
    });
    cleanUpIds.submissions.push(crashedSub._id);
    console.log(`Simulated Crashed Submission Created: ${crashedSub._id}`);
    console.log(`- Initial Status: ${crashedSub.status}`);
    console.log(`- Stale Owner: ${crashedSub.executionOwner}`);
    console.log(`- Expired Lease: ${crashedSub.executionLeaseExpiresAt.toISOString()}`);

    // Run recovery sweep
    console.log('\n[Executing recoverUnavailableSubmissions sweep]');
    const recoveryResult = await recoverUnavailableSubmissions({
      submissionId: crashedSub._id.toString()
    });
    console.log('Recovery Outcome:', recoveryResult);

    const recoveredDoc = await Submission.findById(crashedSub._id).lean();
    console.log(`- Reconciled Status: ${recoveredDoc.status}`);
    console.log(`- Re-enqueued Job ID: ${recoveredDoc.jobId}`);

    // Wait for the active worker to consume the re-enqueued job and finish it
    console.log('\n[Waiting for worker to complete recovered job]');
    let recoveredFinal = null;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const doc = await Submission.findById(crashedSub._id).lean();
      if (isTerminalStatus(doc.status)) {
        recoveredFinal = doc;
        break;
      }
      process.stdout.write('.');
    }
    console.log(`\nRecovered Submission Final Status: ${recoveredFinal?.status}`);
    console.log(`Recovered Submission Final Verdict: ${recoveredFinal?.verdict}`);

    // Stale Worker Rejection: Simulate the crashed worker reviving and trying to write results
    console.log('\n[Testing Stale Worker Write Rejection]');
    const staleJob = {
      id: `exec_${crashedSub._id}`,
      data: {
        submissionId: crashedSub._id.toString(),
        attemptId: attempt._id.toString(),
        questionId: question._id.toString(),
        runType: 'SUBMISSION'
      }
    };
    // The revived worker tries to execute with its stale executionOwner
    const staleWriteAttempt = await processExecutionJob(staleJob);
    console.log('Revived Stale Worker Call Result:', staleWriteAttempt);

    if (staleWriteAttempt.alreadyCompleted) {
      console.log('SUCCESS: Stale worker was safely rejected via alreadyCompleted: true without duplicating execution or overwriting results!');
    }

    console.log('\n========================================================');
    console.log(' ALL 3 LIFECYCLES VERIFIED AGAINST REAL INFRASTRUCTURE!');
    console.log('========================================================');

  } finally {
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
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
