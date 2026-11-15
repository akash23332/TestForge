import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'bullmq';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

process.env.USE_REAL_REDIS = 'true';

import { createRedisConnection } from '../src/config/redis.js';
import { MUTATION_QUEUE_NAME } from '../src/services/queue/mutationQueue.js';
import { processMutationJob } from '../src/services/queue/mutationProcessor.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';

async function startChildWorker() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  providerRegistry.register('child_sandbox', {
    name: 'child_sandbox',
    executeCode: async ({ code, inputArgs }) => {
      // Simulate real execution duration (300ms per test case) so we have a realistic window to terminate the process
      await new Promise((r) => setTimeout(r, 200));
      if (code.includes('nums[i] - nums[j]')) {
        return { status: 'success', output: false, runtimeMs: 15 };
      }
      if (code.includes('nums[i] * nums[j]')) {
        return { status: 'success', output: false, runtimeMs: 15 };
      }
      const isPair = JSON.stringify(inputArgs).includes('4');
      return { status: 'success', output: isPair ? true : false, runtimeMs: 15 };
    },
    checkHealth: async () => ({ healthy: true })
  });
  providerRegistry.setActiveProvider('child_sandbox');

  const worker = new Worker(
    MUTATION_QUEUE_NAME,
    async (job) => {
      console.log(`[CHILD_WORKER_PID_${process.pid}] Started job ${job.id}`);
      return await processMutationJob(job);
    },
    {
      connection: createRedisConnection({ maxRetriesPerRequest: null }),
      concurrency: 1,
      lockDuration: 30000,
      stalledInterval: 2000 // Quick stall check
    }
  );

  worker.on('progress', (job, progress) => {
    console.log(`[CHILD_WORKER_PROGRESS] Job ${job.id}: ${progress}% completed`);
    if (process.send) {
      process.send({ type: 'progress', progress, pid: process.pid });
    }
  });

  worker.on('completed', (job, result) => {
    console.log(`[CHILD_WORKER_PID_${process.pid}] Job ${job.id} COMPLETED. Score: ${result.mutationScore}%`);
    if (process.send) {
      process.send({ type: 'completed', result, pid: process.pid });
    }
  });

  worker.on('failed', (job, err) => {
    console.error(`[CHILD_WORKER_PID_${process.pid}] Job failed: ${err.message}`);
  });

  if (process.send) {
    process.send({ type: 'ready', pid: process.pid });
  }

  console.log(`[CHILD_WORKER_PID_${process.pid}] Ready and listening on "${MUTATION_QUEUE_NAME}"`);
}

startChildWorker().catch((err) => {
  console.error(`[CHILD_WORKER_PID_${process.pid}] Fatal error:`, err);
  process.exit(1);
});
