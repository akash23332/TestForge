import { Worker } from 'bullmq';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { createRedisConnection, disconnectRedis } from './config/redis.js';
import { config } from './config/env.js';
import { EXECUTION_QUEUE_NAME } from './services/queue/executionQueue.js';
import { processExecutionJob } from './services/queue/executionProcessor.js';
import { providerRegistry } from './services/execution/providerRegistry.js';
import { recoverUnavailableSubmissions } from './services/queue/executionRecovery.js';

console.log('----------------------------------------------------');
console.log('  TestForge Background Execution Worker Service    ');
console.log('----------------------------------------------------');

const startWorker = async () => {
  // 1. Connect to MongoDB
  try {
    await connectDatabase();
    console.log('[Worker] Connected to MongoDB database.');

    // Startup recovery sweep
    try {
      const rec = await recoverUnavailableSubmissions();
      console.log(`[Worker] Startup recovery sweep: ${rec.recovered} recovered, ${rec.skipped} skipped (${rec.scanned} scanned).`);
    } catch (recErr) {
      console.warn(`[Worker] Startup recovery sweep non-fatal warning: ${recErr.message}`);
    }
  } catch (err) {
    console.error(`[Worker FATAL] Database connection failed: ${err.message}`);
    process.exit(1);
  }

  // 2. Validate Execution Provider
  const activeProvider = providerRegistry.getProvider();
  console.log(`[Worker] Active Execution Provider: '${activeProvider.name}' (isHardenedSandbox: ${activeProvider.getCapabilities().isHardenedSandbox})`);

  if (config.env === 'production' && activeProvider.name === 'local') {
    console.error('[Worker FATAL] Insecure LocalExecutionProvider cannot run in production.');
    process.exit(1);
  }

  // Probe runner availability without falsely reporting healthy if unreachable
  if (typeof activeProvider.checkHealth === 'function') {
    try {
      const probe = await activeProvider.checkHealth({ timeoutMs: 3000 });
      if (probe.healthy) {
        console.log(`[Worker] Remote Execution Runner is ONLINE and healthy (Latency: ${probe.latencyMs}ms, Version: ${probe.details?.version || 'N/A'})`);
      } else {
        console.warn(`[Worker WARN] Remote Execution Runner is OFFLINE or UNREACHABLE (${probe.status}: ${probe.error}). Worker starting in fail-closed state: submissions will transition to EXECUTION_UNAVAILABLE until runner is restored.`);
      }
    } catch (probeErr) {
      console.warn(`[Worker WARN] Remote Execution Runner probe exception: ${probeErr.message}`);
    }
  }

  // 3. Create Redis Connection for Worker
  const redisConnection = createRedisConnection({
    maxRetriesPerRequest: null
  });

  const concurrency = parseInt(process.env.WORKER_CONCURRENCY, 10) || 5;

  // 4. Initialize BullMQ Worker
  const worker = new Worker(
    EXECUTION_QUEUE_NAME,
    async (job) => {
      console.log(`[Worker] Processing Job ${job.id} (${job.name}) for submission ${job.data.submissionId}`);
      return await processExecutionJob(job);
    },
    {
      connection: redisConnection,
      concurrency,
      limiter: {
        max: 50,
        duration: 1000 // Rate limit worker processing to 50 jobs/sec
      }
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[Worker] Job ${job.id} completed. Status: ${result.status}, Verdict: ${result.verdict}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed with error: ${err.message} (Attempt ${job?.attemptsMade}/${job?.opts?.attempts})`);
  });

  worker.on('error', (err) => {
    console.error(`[Worker] Worker runtime error: ${err.message}`);
  });

  console.log(`[Worker] Listening for jobs on '${EXECUTION_QUEUE_NAME}' with bounded concurrency=${concurrency}`);

  // 5. Graceful Shutdown Handlers
  const gracefulShutdown = async (signal) => {
    console.log(`\n[Worker] Received ${signal}. Commencing graceful shutdown...`);
    try {
      await worker.close();
      console.log('[Worker] BullMQ Worker closed.');
      await disconnectDatabase();
      console.log('[Worker] MongoDB disconnected.');
      await disconnectRedis();
      console.log('[Worker] Redis connection closed.');
      process.exit(0);
    } catch (err) {
      console.error(`[Worker] Error during shutdown: ${err.message}`);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

startWorker().catch((err) => {
  console.error(`[Worker Startup Error] ${err.message}`);
  process.exit(1);
});
