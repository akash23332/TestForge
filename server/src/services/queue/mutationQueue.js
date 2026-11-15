import { Queue } from 'bullmq';
import { createRedisConnection } from '../../config/redis.js';
import { config } from '../../config/env.js';

export const MUTATION_QUEUE_NAME = 'mutation-execution';

let mutationQueueInstance = null;
let isRedisOffline = false;

/**
 * Returns current Redis offline state flag for mutation queue.
 */
export const getRedisOfflineStatus = () => isRedisOffline;

/**
 * Allows overriding Redis offline status (e.g. for testing offline fail-closed drills).
 * @param {boolean} status
 */
export const setRedisOfflineStatus = (status) => {
  isRedisOffline = Boolean(status);
};

/**
 * Allows injecting or mocking the queue instance (e.g. for testing).
 * @param {Queue|null} queue
 */
export const setMutationQueueInstance = (queue) => {
  mutationQueueInstance = queue;
};

/**
 * Initializes and returns the BullMQ mutation queue singleton.
 * Configured with bounded retries and exponential backoff.
 * @returns {Queue}
 */
export const getMutationQueue = () => {
  if (!mutationQueueInstance) {
    if ((config.env === 'test' || process.env.NODE_ENV === 'test') && !process.env.USE_REAL_REDIS) {
      mutationQueueInstance = {
        add: async (name, data, opts) => ({ id: opts?.jobId || `mock_mut_job_${Date.now()}`, name, data, opts }),
        getJob: async (jobId) => null,
        close: async () => {},
        on: () => {}
      };
      return mutationQueueInstance;
    }

    const connection = createRedisConnection({
      maxRetriesPerRequest: null
    });

    connection.on('error', (err) => {
      if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        isRedisOffline = true;
      }
      if (config.env !== 'test') {
        console.warn(`[MutationQueue] Redis connection issue: ${err.message}`);
      }
    });

    connection.on('connect', () => {
      isRedisOffline = false;
    });

    connection.on('ready', () => {
      isRedisOffline = false;
    });

    connection.on('close', () => {
      isRedisOffline = true;
    });

    connection.on('end', () => {
      isRedisOffline = true;
    });

    mutationQueueInstance = new Queue(MUTATION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 2, // Bounded retries (transient issues only)
        backoff: {
          type: 'exponential',
          delay: 2000 // Exponential backoff: 2s, 4s
        },
        removeOnComplete: {
          age: 3600, // Keep completed job metadata for 1 hour
          count: 1000
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours for triage
          count: 500
        }
      }
    });

    mutationQueueInstance.on('error', (err) => {
      if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        isRedisOffline = true;
      }
      if (config.env !== 'test') {
        console.warn(`[MutationQueue] Redis queue warning: ${err.message}`);
      }
    });
  }

  return mutationQueueInstance;
};

/**
 * Enqueues an asynchronous mutation testing execution run.
 * Idempotent: Job ID is deterministic based on the MutationReport ID (`mut_${reportId}`).
 * 
 * @param {Object} params
 * @param {string} params.reportId - MongoDB MutationReport ID
 * @param {string} params.questionId - Question document ID
 * @param {string} params.teacherId - Teacher User ID
 * @param {Array} [params.customMutants] - Optional pre-synthesized mutants
 * @param {Object} [params.options] - Mutation options (e.g. maxMutants)
 * 
 * @returns {Promise<import('bullmq').Job>}
 */
export const enqueueMutationJob = async ({
  reportId,
  questionId,
  teacherId,
  customMutants = null,
  options = {}
}) => {
  const queue = getMutationQueue();

  // Idempotent Job ID: Prevents duplicate queuing of the same mutation report
  const jobId = `mut_${reportId}`;

  const jobPayload = {
    reportId: reportId.toString(),
    questionId: questionId.toString(),
    teacherId: teacherId.toString(),
    customMutants,
    options
  };

  // Mocked in test environment without real Redis
  if (
    (config.env === 'test' || process.env.NODE_ENV === 'test') &&
    !process.env.USE_REAL_REDIS &&
    !isRedisOffline &&
    config.env !== 'production'
  ) {
    return await queue.add('execute_mutation_run', jobPayload, { jobId });
  }

  // PRODUCTION FAIL-CLOSED GUARD & TEST OFFLINE GUARD
  if (config.env === 'production' || (config.env === 'test' && isRedisOffline)) {
    if (isRedisOffline) {
      throw new Error(`[MutationQueue FAIL-CLOSED] Redis mutation queue is offline. Cannot enqueue job ${jobId}.`);
    }
    return await queue.add('execute_mutation_run', jobPayload, { jobId });
  }

  let job = null;
  let useInMemoryFallback = false;

  if (isRedisOffline) {
    useInMemoryFallback = true;
  } else {
    try {
      const addPromise = queue.add('execute_mutation_run', jobPayload, { jobId });
      const timeoutPromise = new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Redis connection timed out after 500ms')), 500);
        if (typeof timer.unref === 'function') timer.unref();
      });
      job = await Promise.race([addPromise, timeoutPromise]);
    } catch (err) {
      console.warn(`[MutationQueue] Redis unavailable (${err.message}). Using asynchronous in-memory execution fallback.`);
      isRedisOffline = true;
      useInMemoryFallback = true;
    }
  }

  if (useInMemoryFallback) {
    job = {
      id: jobId,
      name: 'execute_mutation_run',
      data: jobPayload
    };

    // Asynchronously dispatch mutation job so the controller immediately returns HTTP 202
    setTimeout(async () => {
      try {
        const { processMutationJob } = await import('./mutationProcessor.js');
        await processMutationJob({
          id: jobId,
          name: 'execute_mutation_run',
          data: jobPayload,
          updateProgress: async () => {}
        });
      } catch (procErr) {
        if (process.env.NODE_ENV !== 'test' && config.env !== 'test') {
          console.error(`[MutationQueue Fallback] In-memory job execution error for ${reportId}:`, procErr.message);
        }
      }
    }, 15);
  } else if (config.env === 'development') {
    // Watchdog in development mode: If Redis accepted the job but no standalone worker is running,
    // check after 2.5s and process locally if still PENDING or RUNNING.
    setTimeout(async () => {
      try {
        const { MutationReport } = await import('../../models/MutationReport.js');
        const rep = await MutationReport.findById(reportId).lean();
        if (rep && (rep.status === 'PENDING' || rep.status === 'RUNNING') && (rep.progress?.total === 0 || !rep.progress)) {
          console.warn(`[MutationQueue Watchdog] Mutation run ${jobId} remained PENDING for 2.5s (no standalone worker active). Triggering local mutation processor.`);
          const { processMutationJob } = await import('./mutationProcessor.js');
          await processMutationJob({
            id: jobId,
            name: 'execute_mutation_run',
            data: jobPayload,
            updateProgress: async () => {}
          });
        }
      } catch {
        // Safe watchdog error ignore
      }
    }, 2500);
  }

  return job;
};

/**
 * Closes the mutation queue instance.
 */
export const closeMutationQueue = async () => {
  if (mutationQueueInstance) {
    try {
      await mutationQueueInstance.close();
    } catch {}
    mutationQueueInstance = null;
  }
};

export default {
  MUTATION_QUEUE_NAME,
  getMutationQueue,
  enqueueMutationJob,
  getRedisOfflineStatus,
  setRedisOfflineStatus,
  setMutationQueueInstance,
  closeMutationQueue
};
