import { Submission } from '../../models/Submission.js';
import { getExecutionQueue, enqueueExecutionJob } from './executionQueue.js';

/**
 * Permanent error verdicts that must NEVER enter infrastructure recovery loops.
 * Permanent errors represent valid evaluations of user code (bad syntax, crash, timeout)
 * and must not be retried as if they were runner infrastructure failures.
 */
const PERMANENT_ERROR_VERDICTS = new Set([
  'COMPILATION_ERROR',
  'COMPILE_ERROR',
  'RUNTIME_ERROR',
  'TIME_LIMIT_EXCEEDED',
  'MEMORY_LIMIT_EXCEEDED',
  'WRONG_ANSWER',
  'ACCEPTED',
  'PARTIALLY_ACCEPTED'
]);

/**
 * Safely recovers submissions that failed due to infrastructure runner outages (EXECUTION_UNAVAILABLE).
 * 
 * Concurrency & Recovery Guarantees:
 * 1. ATOMIC STATE TRANSITION: Uses atomic findOneAndUpdate({ status: 'EXECUTION_UNAVAILABLE' }) -> 'RECOVERING'
 *    to prevent duplicate or race conditions across concurrent recovery workers.
 * 2. JOB INSPECTION BEFORE QUEUING: Checks whether a retained BullMQ job exists in Redis with the same deterministic ID.
 * 3. BULLMQ RETRY FOR RETAINED FAILED JOBS: If a job with the same ID failed and is retained, calls job.retry('failed', { resetAttemptsMade: true })
 *    rather than queue.add() (which would be blocked by the existing retained job in Redis).
 * 4. NEVER INTERRUPTS ACTIVE JOBS: If a job is active, recovery strictly skips it without modifying or retrying.
 * 5. NEVER RESETS COMPLETED JOBS: If a submission or job is completed, it is strictly skipped.
 * 6. REDIS RESILIENCE: If Redis is unreachable or the queue operation fails, the submission status is safely reverted to
 *    EXECUTION_UNAVAILABLE and is NEVER left in a misleading QUEUED or RECOVERING state.
 * 7. SCORE INTEGRITY: Keeps scoreAwarded null until execution completes.
 * 
 * @param {Object} [filter]
 * @param {string} [filter.submissionId] - Target single submission
 * @param {string} [filter.attemptId] - Target attempt session
 * @param {number} [filter.limit=100] - Batch size limit
 * 
 * @returns {Promise<{ scanned: number, recovered: number, skipped: number, errors: number, recoveredIds: string[] }>}
 */
export const recoverUnavailableSubmissions = async ({ submissionId, attemptId, limit = 100 } = {}) => {
  const query = {
    status: 'EXECUTION_UNAVAILABLE',
    runType: 'SUBMISSION'
  };

  if (submissionId) {
    query._id = submissionId;
  }
  if (attemptId) {
    query.attemptId = attemptId;
  }

  // Scan candidates
  const candidates = await Submission.find(query).limit(limit).select('_id verdict status attemptId questionId runType language');

  let recovered = 0;
  let skipped = 0;
  let errors = 0;
  const recoveredIds = [];

  const queue = getExecutionQueue();

  for (const candidate of candidates) {
    // Safety Gate 1: Permanent code errors must never enter retry loops
    if (PERMANENT_ERROR_VERDICTS.has(candidate.verdict)) {
      skipped++;
      continue;
    }

    // Safety Gate 2: Concurrency Lock via Atomic State Transition
    // Transition status from EXECUTION_UNAVAILABLE -> RECOVERING atomically
    const lockedSub = await Submission.findOneAndUpdate(
      { _id: candidate._id, status: 'EXECUTION_UNAVAILABLE' },
      { $set: { status: 'RECOVERING' } },
      { new: true }
    );

    if (!lockedSub) {
      // Another concurrent recovery worker or job processor claimed this submission
      skipped++;
      continue;
    }

    // Safety Gate 3: Completed valid submission protection
    if (lockedSub.status === 'COMPLETED') {
      skipped++;
      continue;
    }

    const jobId = `exec_${lockedSub._id}`;

    try {
      // Safety Gate 4: Inspect existing job state in BullMQ before queuing
      let existingJob = null;
      try {
        existingJob = queue.getJob ? await queue.getJob(jobId) : null;
      } catch (jobErr) {
        // If checking job fails due to Redis disconnection, throw to revert state
        throw new Error(`Failed to inspect queue job ${jobId}: ${jobErr.message}`);
      }

      if (existingJob) {
        const state = await existingJob.getState();

        // 4a. Active job: currently processing in worker -> DO NOT TOUCH
        if (state === 'active') {
          await Submission.updateOne(
            { _id: lockedSub._id, status: 'RECOVERING' },
            { $set: { status: 'RUNNING', errorMessage: 'Job currently actively processing in worker.' } }
          );
          skipped++;
          continue;
        }

        // 4b. Completed job: already finalized -> DO NOT TOUCH
        if (state === 'completed') {
          await Submission.updateOne(
            { _id: lockedSub._id, status: 'RECOVERING' },
            { $set: { status: 'COMPLETED' } }
          );
          skipped++;
          continue;
        }

        // 4c. Retained Failed job: use BullMQ's native retry operation to reset attempts and requeue
        if (state === 'failed') {
          if (typeof existingJob.retry === 'function') {
            await existingJob.retry('failed', { resetAttemptsMade: true });
          } else {
            // Fallback if mock queue lacks retry method: remove and re-enqueue
            if (typeof existingJob.remove === 'function') await existingJob.remove();
            await enqueueExecutionJob({
              submissionId: lockedSub._id,
              attemptId: lockedSub.attemptId || '',
              questionId: lockedSub.questionId || '',
              runType: lockedSub.runType || 'SUBMISSION',
              language: lockedSub.language || 'javascript'
            });
          }
        } else if (state === 'waiting' || state === 'delayed' || state === 'paused') {
          // 4d. Already queued or waiting: no need to re-add, will be processed by worker
          // Proceed to update submission status to QUEUED
        }
      } else {
        // 4e. Missing job (job retention expired or never queued): add fresh job with deterministic ID
        await enqueueExecutionJob({
          submissionId: lockedSub._id,
          attemptId: lockedSub.attemptId || '',
          questionId: lockedSub.questionId || '',
          runType: lockedSub.runType || 'SUBMISSION',
          language: lockedSub.language || 'javascript'
        });
      }

      // Safety Gate 5: Only mark submission QUEUED after queue operation has actually succeeded!
      await Submission.updateOne(
        { _id: lockedSub._id, status: 'RECOVERING' },
        {
          $set: {
            status: 'QUEUED',
            verdict: 'PENDING',
            scoreAwarded: null, // Strictly null until execution completes
            errorMessage: 'Queued for recovery re-execution after runner recovery.'
          }
        }
      );

      recovered++;
      recoveredIds.push(lockedSub._id.toString());
    } catch (queueErr) {
      // Safety Gate 6: Redis resilience - revert status back to EXECUTION_UNAVAILABLE on failure
      // Never leave submission in misleading QUEUED or RECOVERING state
      errors++;
      await Submission.updateOne(
        { _id: lockedSub._id, status: 'RECOVERING' },
        {
          $set: {
            status: 'EXECUTION_UNAVAILABLE',
            errorMessage: `Recovery attempt failed: ${queueErr.message}. Preserved for subsequent recovery.`
          }
        }
      );
    }
  }

  return {
    scanned: candidates.length,
    recovered,
    skipped,
    errors,
    recoveredIds
  };
};

export default {
  recoverUnavailableSubmissions
};
