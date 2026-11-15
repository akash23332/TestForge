import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'bullmq';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Force real Redis mode
process.env.USE_REAL_REDIS = 'true';

import { createRedisConnection, disconnectRedis } from '../src/config/redis.js';
import {
  MUTATION_QUEUE_NAME,
  getMutationQueue,
  enqueueMutationJob,
  closeMutationQueue
} from '../src/services/queue/mutationQueue.js';
import { processMutationJob } from '../src/services/queue/mutationProcessor.js';
import { MutationReport } from '../src/models/MutationReport.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { User } from '../src/models/User.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';

async function runRealRedisVerification() {
  console.log('================================================================');
  console.log(' TESTFORGE REAL REDIS + BULLMQ MUTATION QUEUE E2E VERIFICATION ');
  console.log('================================================================\n');

  // 1. Connect to Real Redis
  console.log('[Step 1] Connecting to local Redis instance (127.0.0.1:6379)...');
  const redisConn = createRedisConnection({ lazyConnect: false });
  const ping = await redisConn.ping();
  const info = await redisConn.info('server');
  const vMatch = info.match(/redis_version:([^\r\n]+)/);
  const redisVersion = vMatch ? vMatch[1] : 'Unknown';
  console.log(`[Step 1 OK] Redis PING: "${ping}", Redis Server Version: ${redisVersion}`);

  // 2. Connect to MongoDB
  console.log('\n[Step 2] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(`[Step 2 OK] Connected to MongoDB: ${mongoose.connection.host}`);

  // Register deterministic sandbox provider for test
  providerRegistry.register('p2_real_redis_mock', {
    name: 'p2_real_redis_mock',
    executeCode: async ({ code, inputArgs }) => {
      if (code.includes('nums[i] - nums[j]')) {
        return { status: 'success', output: false, runtimeMs: 12 };
      }
      const isPair = JSON.stringify(inputArgs).includes('4');
      return { status: 'success', output: isPair ? true : false, runtimeMs: 10 };
    },
    checkHealth: async () => ({ healthy: true })
  });
  providerRegistry.setActiveProvider('p2_real_redis_mock');

  const cleanups = { users: [], questions: [], testCases: [], reports: [] };

  try {
    // 3. Create real fixtures
    console.log('\n[Step 3] Seeding test teacher, question, and test cases in MongoDB...');
    const teacher = await User.create({
      name: 'Real Redis Mutation Teacher',
      email: `teacher_redis_${Date.now()}@testforge.io`,
      role: 'teacher',
      passwordHash: 'dummy'
    });
    cleanups.users.push(teacher._id);

    const question = await Question.create({
      ownerId: teacher._id,
      title: `E2E_REAL_REDIS_MUTATION_${Date.now()}`,
      statement: 'Return true if two elements sum to target.',
      language: 'javascript',
      executionMode: 'FUNCTION',
      functionName: 'hasPairSum',
      referenceSolution: `function hasPairSum(nums, target) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) {
        return true;
      }
    }
  }
  return false;
}`
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
    console.log(`[Step 3 OK] Created Question: ${question._id}`);

    // 4. Create persistent report and enqueue via BullMQ
    console.log('\n[Step 4] Creating MutationReport in MongoDB and enqueuing job in BullMQ...');
    const report = await MutationReport.create({
      questionId: question._id,
      teacherId: teacher._id,
      status: 'PENDING'
    });
    cleanups.reports.push(report._id);

    const queue = getMutationQueue();
    const job = await enqueueMutationJob({
      reportId: report._id,
      questionId: question._id,
      teacherId: teacher._id
    });
    console.log(`[Step 4 OK] Enqueued BullMQ Job ID: ${job.id} on queue "${MUTATION_QUEUE_NAME}"`);

    // Verify job in Redis BullMQ queue
    const queueJob = await queue.getJob(job.id);
    if (!queueJob) {
      throw new Error(`Job ${job.id} was not found in real Redis queue!`);
    }
    console.log(`[Step 4 OK] Confirmed Job ${queueJob.id} present in Redis BullMQ state: ${await queueJob.getState()}`);

    // 5. Start real BullMQ Worker to process the job
    console.log('\n[Step 5] Spawning real BullMQ Worker connected to Redis to process mutation job...');
    const worker = new Worker(
      MUTATION_QUEUE_NAME,
      async (wJob) => {
        console.log(`[Worker Callback] Processing job ${wJob.id} for report ${wJob.data.reportId}...`);
        return await processMutationJob(wJob);
      },
      {
        connection: createRedisConnection({ maxRetriesPerRequest: null }),
        concurrency: 1
      }
    );

    const completedPromise = new Promise((resolve, reject) => {
      worker.on('completed', (wJob, result) => {
        console.log(`[Worker Callback] Worker completed job ${wJob.id}! Result:`, result);
        resolve(result);
      });
      worker.on('failed', (wJob, err) => {
        console.error(`[Worker Callback] Worker failed on job ${wJob.id}:`, err);
        reject(err);
      });
    });

    const completionResult = await completedPromise;
    await worker.close();
    console.log('[Step 5 OK] Worker successfully finished and shut down cleanly.');

    // 6. Verify final state in MongoDB
    console.log('\n[Step 6] Inspecting persistent MutationReport in MongoDB...');
    const updatedReport = await MutationReport.findById(report._id);
    console.log('Report Status:', updatedReport.status);
    console.log('Mutation Score:', updatedReport.mutationScore + '%');
    console.log('Total Mutants Generated:', updatedReport.totalMutants);
    console.log('Killed Count:', updatedReport.killedCount);
    console.log('Survived Count:', updatedReport.survivedCount);
    console.log('Compilation Error Count:', updatedReport.compilationErrorCount);
    console.log('Runtime Error Count:', updatedReport.runtimeErrorCount);
    console.log('Timeout Count:', updatedReport.timeoutCount);
    console.log('Progress Total/Completed:', `${updatedReport.progress.completed}/${updatedReport.progress.total}`);
    console.log('Candidate Tests Synthesized:', updatedReport.candidateTests.length);

    if (updatedReport.status !== 'COMPLETED') {
      throw new Error(`Expected report status COMPLETED, got ${updatedReport.status}`);
    }
    if (updatedReport.totalMutants === 0) {
      throw new Error('Expected AST mutants to be generated, got 0');
    }
    if (updatedReport.progress.completed !== updatedReport.progress.total) {
      throw new Error('Progress mismatch in report');
    }

    console.log('\n================================================================');
    console.log(' REAL REDIS + BULLMQ MUTATION VERIFICATION PASSED SUCCESSFULLY! ');
    console.log('================================================================\n');
  } finally {
    // Cleanup
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

runRealRedisVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  });
