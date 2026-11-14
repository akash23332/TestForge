import { Queue } from 'bullmq';
import { createRedisConnection } from '../../config/redis.js';
import { config } from '../../config/env.js';

export const EXECUTION_QUEUE_NAME = 'code-execution';

let executionQueueInstance = null;
let isRedisOffline = false;

/**
 * Allows injecting or mocking the queue instance (e.g. for testing).
 * @param {Queue|null} queue
 */
export const setExecutionQueueInstance = (queue) => {
  executionQueueInstance = queue;
};

/**
 * Initializes and returns the BullMQ execution queue singleton.
 * Configured with separate priorities: Sample runs (priority 1) vs Final submissions (priority 5).
 * @returns {Queue}
 */
export const getExecutionQueue = () => {
  if (!executionQueueInstance) {
    if ((config.env === 'test' || process.env.NODE_ENV === 'test') && !process.env.USE_REAL_REDIS) {
      executionQueueInstance = {
        add: async (name, data, opts) => ({ id: opts?.jobId || `mock_job_${Date.now()}`, name, data, opts }),
        getJob: async (jobId) => null,
        close: async () => {},
        on: () => {}
      };
      return executionQueueInstance;
    }

    const connection = createRedisConnection({
      maxRetriesPerRequest: null
    });

    connection.on('error', (err) => {
      if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        isRedisOffline = true;
      }
      if (config.env !== 'test') {
        console.warn(`[ExecutionQueue] Redis connection issue: ${err.message}`);
      }
    });

    connection.on('connect', () => {
      isRedisOffline = false;
    });

    executionQueueInstance = new Queue(EXECUTION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3, // Bounded retries for transient infrastructure issues only (3 attempts)
        backoff: {
          type: 'exponential',
          delay: 2000 // Exponential backoff: 2s, 4s, 8s
        },
        removeOnComplete: {
          age: 3600, // Keep completed job metadata for 1 hour
          count: 5000
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours for audit/triage
          count: 1000
        }
      }
    });

    executionQueueInstance.on('error', (err) => {
      if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        isRedisOffline = true;
      }
      if (config.env !== 'test') {
        console.warn(`[ExecutionQueue] Redis queue warning: ${err.message}`);
      }
    });
  }

  return executionQueueInstance;
};

/**
 * Enqueues an execution or grading job with idempotency and priority scheduling.
 * ZERO LEAK: Only submission IDs and minimal identifiers are placed in the queue payload.
 * Source code, test cases, and solutions are fetched securely from MongoDB inside the worker.
 * 
 * If Redis/BullMQ is offline or unavailable (e.g. local dev without Redis),
 * transparently executes the job asynchronously in-memory.
 * 
 * @param {Object} params
 * @param {string} params.submissionId - MongoDB Submission document ID
 * @param {string} params.attemptId - Active ExamAttempt ID
 * @param {string} params.questionId - Question document ID
 * @param {('SAMPLE'|'SUBMISSION')} params.runType - Sample run vs final submit
 * @param {string} [params.language] - Target programming language
 * @param {string} [params.studentEmail] - Identifies student for concurrency tracking
 * 
 * @returns {Promise<import('bullmq').Job>}
 */
export const enqueueExecutionJob = async ({
  submissionId,
  attemptId,
  questionId,
  runType = 'SUBMISSION',
  language = 'javascript',
  studentEmail = ''
}) => {
  const queue = getExecutionQueue();

  // Priority mapping: Interactive sample runs get high priority (1); final batch submissions get standard priority (5)
  const priority = runType === 'SAMPLE' ? 1 : 5;

  // Idempotent Job ID: prevents duplicate queuing of the same submission document
  const jobId = `exec_${submissionId}`;

  const jobPayload = {
    submissionId: submissionId.toString(),
    attemptId: attemptId.toString(),
    questionId: questionId.toString(),
    runType,
    language,
    studentEmail
  };

  // In test environment with mocked queue instance, preserve existing fast synchronous/mock behavior
  if ((config.env === 'test' || process.env.NODE_ENV === 'test') && !process.env.USE_REAL_REDIS) {
    return await queue.add(
      `execute_${runType.toLowerCase()}`,
      jobPayload,
      {
        jobId,
        priority
      }
    );
  }

  let job = null;
  let useInMemoryFallback = false;

  if (isRedisOffline) {
    useInMemoryFallback = true;
  } else {
    try {
      const addPromise = queue.add(
        `execute_${runType.toLowerCase()}`,
        jobPayload,
        {
          jobId,
          priority
        }
      );
      const timeoutPromise = new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Redis connection timed out after 500ms')), 500);
        if (typeof timer.unref === 'function') timer.unref();
      });
      job = await Promise.race([addPromise, timeoutPromise]);
    } catch (err) {
      console.warn(`[ExecutionQueue] Redis unavailable (${err.message}). Using asynchronous in-memory execution fallback.`);
      isRedisOffline = true;
      useInMemoryFallback = true;
    }
  }

  if (useInMemoryFallback) {
    job = {
      id: jobId,
      name: `execute_${runType.toLowerCase()}`,
      data: jobPayload
    };

    // Asynchronously dispatch execution job so the controller immediately returns HTTP 202
    setTimeout(async () => {
      try {
        const { processExecutionJob } = await import('./executionProcessor.js');
        await processExecutionJob({
          id: jobId,
          name: `execute_${runType.toLowerCase()}`,
          data: jobPayload
        });
      } catch (procErr) {
        console.error(`[ExecutionQueue Fallback] In-memory job execution error for ${submissionId}:`, procErr.message);
      }
    }, 15);
  } else {
    // Watchdog: If Redis accepted the job but no standalone worker is running (common in local dev),
    // check after 2.5s and process in-memory if still QUEUED.
    setTimeout(async () => {
      try {
        const { Submission } = await import('../../models/Submission.js');
        const sub = await Submission.findById(submissionId).lean();
        if (sub && sub.status === 'QUEUED') {
          console.warn(`[ExecutionQueue Watchdog] Job ${jobId} remained QUEUED for 2.5s (no standalone worker active). Triggering local execution processor.`);
          const { processExecutionJob } = await import('./executionProcessor.js');
          await processExecutionJob({
            id: jobId,
            name: `execute_${runType.toLowerCase()}`,
            data: jobPayload
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
 * Closes the queue connection gracefully.
 */
export const closeExecutionQueue = async () => {
  if (executionQueueInstance) {
    await executionQueueInstance.close();
    executionQueueInstance = null;
  }
};

export default {
  EXECUTION_QUEUE_NAME,
  getExecutionQueue,
  enqueueExecutionJob,
  closeExecutionQueue
};
