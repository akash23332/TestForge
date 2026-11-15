import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

process.env.USE_REAL_REDIS = 'true';

import { createRedisConnection, disconnectRedis } from '../src/config/redis.js';
import {
  MUTATION_QUEUE_NAME,
  getMutationQueue,
  enqueueMutationJob,
  closeMutationQueue
} from '../src/services/queue/mutationQueue.js';
import { MutationReport } from '../src/models/MutationReport.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { User } from '../src/models/User.js';

async function runCrashAndRecoveryAudit() {
  console.log('========================================================================');
  console.log(' TESTFORGE REAL WORKER SIGKILL CRASH & AUTOMATIC RECOVERY AUDIT ');
  console.log('========================================================================\n');

  // 1. Connect to Real Redis & Real MongoDB
  console.log('[Phase A] Connecting to Redis & MongoDB Atlas...');
  const redisConn = createRedisConnection({ lazyConnect: false });
  const ping = await redisConn.ping();
  console.log(`[Phase A OK] Real Redis connected: PING -> "${ping}"`);

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(`[Phase A OK] Real MongoDB connected: ${mongoose.connection.host}`);

  const cleanups = { users: [], questions: [], testCases: [], reports: [] };

  try {
    // 2. Seed test Question & Test Cases
    console.log('\n[Phase B] Seeding test fixtures in MongoDB...');
    const teacher = await User.create({
      name: 'Crash Audit Teacher',
      email: `crash_teacher_${Date.now()}@testforge.io`,
      role: 'teacher',
      passwordHash: 'dummy'
    });
    cleanups.users.push(teacher._id);

    const question = await Question.create({
      ownerId: teacher._id,
      title: `E2E_CRASH_AUDIT_${Date.now()}`,
      statement: 'Return pair sum check',
      language: 'javascript',
      executionMode: 'FUNCTION',
      functionName: 'hasPairSum',
      referenceSolution: 'function hasPairSum(nums, target) { return true; }'
    });
    cleanups.questions.push(question._id);

    const tc1 = await TestCase.create({
      questionId: question._id,
      category: 'sample',
      visibility: 'public',
      input: '[1, 2, 3, 9], 8',
      expectedOutput: 'false'
    });
    const tc2 = await TestCase.create({
      questionId: question._id,
      category: 'boundary',
      visibility: 'hidden',
      input: '[1, 2, 4, 4], 8',
      expectedOutput: 'true'
    });
    cleanups.testCases.push(tc1._id, tc2._id);

    // 4 Distinct mutants: 2 will be processed before kill, 2 after recovery
    const customMutants = [
      {
        id: 'mut-1-kill',
        operator: 'AOR',
        operatorType: 'AOR',
        mutatedFullCode: 'function hasPairSum() { return nums[i] - nums[j]; }',
        originalSnippet: '+',
        mutatedSnippet: '-'
      },
      {
        id: 'mut-2-surv',
        operator: 'ROR',
        operatorType: 'ROR',
        mutatedFullCode: 'function hasPairSum() { return true; }',
        originalSnippet: '===',
        mutatedSnippet: '==='
      },
      {
        id: 'mut-3-kill',
        operator: 'AOR',
        operatorType: 'AOR',
        mutatedFullCode: 'function hasPairSum() { return nums[i] * nums[j]; }',
        originalSnippet: '+',
        mutatedSnippet: '*'
      },
      {
        id: 'mut-4-surv',
        operator: 'ROR',
        operatorType: 'ROR',
        mutatedFullCode: 'function hasPairSum() { return true; }',
        originalSnippet: '<',
        mutatedSnippet: '>'
      }
    ];

    const report = await MutationReport.create({
      questionId: question._id,
      teacherId: teacher._id,
      status: 'PENDING'
    });
    cleanups.reports.push(report._id);

    // 3. Enqueue job into BullMQ
    console.log('\n[Phase C] Enqueueing mutation job in BullMQ (4 mutants)...');
    const queue = getMutationQueue();
    const job = await enqueueMutationJob({
      reportId: report._id,
      questionId: question._id,
      teacherId: teacher._id,
      customMutants
    });
    console.log(`[Phase C OK] Job ${job.id} enqueued in Redis BullMQ.`);

    // 4. Spawn Worker Process 1
    console.log('\n[Phase D] Spawning Child Worker 1 (PID to be killed)...');
    const childWorkerPath = path.join(__dirname, 'childMutationWorker.mjs');

    const worker1 = fork(childWorkerPath, [], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    const worker1Pid = worker1.pid;
    console.log(`[Phase D] Child Worker 1 spawned with PID: ${worker1Pid}`);

    // Wait for worker 1 to evaluate mutant 2 (50% progress)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for worker 1 progress')), 30000);

      worker1.on('message', async (msg) => {
        if (msg.type === 'progress' && msg.progress >= 50) {
          clearTimeout(timeout);
          console.log(`\n>>> [Phase E] TRIGGERING UNEXPECTED WORKER CRASH (SIGKILL on PID ${worker1Pid}) <<<`);
          // Send SIGKILL (abrupt process termination, uncatchable)
          worker1.kill('SIGKILL');
          resolve();
        }
      });
      worker1.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Wait briefly for OS process cleanup
    await new Promise((r) => setTimeout(r, 1000));
    console.log(`[Phase E OK] Verified Child Worker 1 (PID ${worker1Pid}) was terminated abruptly.`);

    // 5. Inspect MongoDB state right after crash
    console.log('\n[Phase F] Inspecting MongoDB MutationReport state immediately after worker crash...');
    const intermediateReport = await MutationReport.findById(report._id);
    console.log('Report Status after crash:', intermediateReport.status);
    console.log('Completed Progress at crash:', `${intermediateReport.progress.completed}/${intermediateReport.progress.total}`);
    console.log('Evaluated Mutants in DB:', intermediateReport.mutants.filter((m) => m.executionStatus !== 'PENDING').length);
    console.log('Mutant 1 Status:', intermediateReport.mutants.find((m) => m.mutantId === 'mut-1-kill')?.executionStatus);
    console.log('Mutant 2 Status:', intermediateReport.mutants.find((m) => m.mutantId === 'mut-2-surv')?.executionStatus);
    console.log('Mutant 3 Status (not yet evaluated):', intermediateReport.mutants.find((m) => m.mutantId === 'mut-3-kill')?.executionStatus);

    if (intermediateReport.progress.completed !== 2) {
      throw new Error(`Expected exactly 2 mutants completed before crash, got ${intermediateReport.progress.completed}`);
    }

    // 6. Spawn Worker Process 2 (Recovery)
    console.log('\n[Phase G] Spawning Child Worker 2 to resume execution from checkpoint...');
    const worker2 = fork(childWorkerPath, [], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    const worker2Pid = worker2.pid;
    console.log(`[Phase G] Child Worker 2 spawned with PID: ${worker2Pid}`);

    // Wait for Worker 2 to finish the job
    const completedResult = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for worker 2 to complete job')), 45000);

      worker2.on('message', (msg) => {
        if (msg.type === 'completed') {
          clearTimeout(timeout);
          console.log(`[Phase G] Child Worker 2 completed job ${job.id}!`);
          resolve(msg.result);
        }
      });
      worker2.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    worker2.kill('SIGTERM');
    console.log('[Phase G OK] Worker 2 shut down cleanly.');

    // 7. Inspect Final MongoDB state
    console.log('\n[Phase H] Verifying Final MutationReport in MongoDB after recovery...');
    const finalReport = await MutationReport.findById(report._id);
    console.log('Final Status:', finalReport.status);
    console.log('Final Score:', finalReport.mutationScore + '%');
    console.log('Final Progress:', `${finalReport.progress.completed}/${finalReport.progress.total}`);
    console.log('Total Mutants Array Length:', finalReport.mutants.length);
    console.log('Killed Count:', finalReport.killedCount);
    console.log('Survived Count:', finalReport.survivedCount);
    console.log('Compilation Error Count:', finalReport.compilationErrorCount);

    // Assertions
    if (finalReport.status !== 'COMPLETED') {
      throw new Error(`Expected final status COMPLETED, got ${finalReport.status}`);
    }
    if (finalReport.progress.completed !== 4) {
      throw new Error(`Expected all 4 mutants completed, got ${finalReport.progress.completed}`);
    }
    if (finalReport.mutants.length !== 4) {
      throw new Error(`Expected exactly 4 mutant entries without duplication, got ${finalReport.mutants.length}`);
    }
    // 2 killed (mut-1-kill, mut-3-kill), 2 survived (mut-2-surv, mut-4-surv) -> Score = 2 / 4 * 100 = 50%
    if (finalReport.killedCount !== 2 || finalReport.survivedCount !== 2 || finalReport.mutationScore !== 50) {
      throw new Error(`Score mismatch: expected 2 killed, 2 survived, 50% score. Got killed=${finalReport.killedCount}, survived=${finalReport.survivedCount}, score=${finalReport.mutationScore}`);
    }

    console.log('\n========================================================================');
    console.log(' ACTUAL WORKER SIGKILL & RESUMPTION AUDIT PASSED 100% SUCCESSFULLY! ');
    console.log('========================================================================\n');
  } finally {
    console.log('Cleaning up MongoDB test records...');
    await User.deleteMany({ _id: { $in: cleanups.users } });
    await Question.deleteMany({ _id: { $in: cleanups.questions } });
    await TestCase.deleteMany({ _id: { $in: cleanups.testCases } });
    await MutationReport.deleteMany({ _id: { $in: cleanups.reports } });
    await closeMutationQueue();
    await disconnectRedis();
    await mongoose.disconnect();
    console.log('Cleanup complete.');
  }
}

runCrashAndRecoveryAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('AUDIT FAILED:', err);
    process.exit(1);
  });
