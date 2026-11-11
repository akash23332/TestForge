import { Queue } from 'bullmq';
import { createRedisConnection } from '../../config/redis.js';
import { config } from '../../config/env.js';

export const EXECUTION_QUEUE_NAME = 'code-execution';

let executionQueueInstance = null;

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

  const job = await queue.add(
    `execute_${runType.toLowerCase()}`,
    {
      submissionId: submissionId.toString(),
      attemptId: attemptId.toString(),
      questionId: questionId.toString(),
      runType,
      language,
      studentEmail
    },
    {
      jobId,
      priority
    }
  );

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
