import crypto from 'crypto';
import { Submission } from '../../models/Submission.js';
import { getExecutionQueue, enqueueExecutionJob } from './executionQueue.js';
import { providerRegistry } from '../execution/providerRegistry.js';

export const DEFAULT_LEASE_DURATION_MS = 30000; // 30-second recovery lease
export const MAX_WALL_TIME_LIMIT_MS = 15000; // Aligned with deploy/judge0/judge0.conf MAX_WALL_TIME_LIMIT=15.0s
export const ISOLATE_TEARDOWN_BUFFER_MS = 5000;
export const MAX_ISOLATE_EXECUTION_CEILING_MS = MAX_WALL_TIME_LIMIT_MS + ISOLATE_TEARDOWN_BUFFER_MS; // 20000ms
export const DEFAULT_QUARANTINE_BUFFER_MS = MAX_ISOLATE_EXECUTION_CEILING_MS;

/**
 * Safely renews an active recovery lease during long-running recovery workflows.
 * Validates recoveryOwner token and active RECOVERING status.
 * 
 * @param {string|import('mongoose').Types.ObjectId} submissionId
 * @param {string} ownerToken - Cryptographic ownership token
 * @param {number} [extensionMs=DEFAULT_LEASE_DURATION_MS] - Milliseconds to extend lease
 * @returns {Promise<boolean>} True if lease successfully renewed; false if lost, expired, or preempted
 */
export const renewRecoveryLease = async (
  submissionId,
  ownerToken,
  extensionMs = DEFAULT_LEASE_DURATION_MS
) => {
  if (!submissionId || !ownerToken) return false;
  const newExpiry = new Date(Date.now() + extensionMs);
  const updated = await Submission.findOneAndUpdate(
    {
      _id: submissionId,
      status: 'RECOVERING',
      recoveryOwner: ownerToken
    },
    {
      $set: { recoveryLeaseExpiresAt: newExpiry }
    },
    { new: true }
  );
  return Boolean(updated);
};

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
 * Safely recovers submissions that failed due to runner outages (EXECUTION_UNAVAILABLE)
 * or stalled during an uncompleted recovery cycle due to process crash (stale RECOVERING lease).
 * 
 * Distributed Systems & Concurrency Guarantees:
 * 1. LEASE-BASED ATOMIC ACQUISITION: Uses atomic findOneAndUpdate with unique recoveryOwner and lease expiration
 *    to prevent duplicate or race conditions across multiple API instances and reconcilers.
 * 2. STALE LEASE RECONCILIATION: Stale RECOVERING submissions whose lease expired are safely acquired and reconciled.
 * 3. BULLMQ STATE INSPECTION: Inspects the exact state of the BullMQ job before acting:
 *    - active: Never touched or retried; preserved for the working processor.
 *    - completed: Never reset; preserved as completed.
 *    - failed: Uses BullMQ's native job.retry('failed', { resetAttemptsMade: true }).
 *    - waiting/delayed: Already queued; avoids duplicate queuing.
 *    - missing/evicted: Re-enqueued via enqueueExecutionJob with deterministic ID.
 * 4. WORKER-RECOVERY RACE RESOLUTION: Worker transition to RUNNING atomically preempts the recovery lease.
 *    Recovery's transition to QUEUED checks recoveryOwner and status='RECOVERING', preventing state overwrites if worker started early.
 * 5. REDIS FAULT TOLERANCE: If Redis fails during inspection or retry, submission status is safely reverted to
 *    EXECUTION_UNAVAILABLE with failure reason recorded, never leaving a misleading QUEUED or RECOVERING state.
 * 
 * @param {Object} [options]
 * @param {string} [options.submissionId] - Target single submission
 * @param {string} [options.attemptId] - Target attempt session
 * @param {number} [options.limit=100] - Batch size limit
 * @param {number} [options.leaseDurationMs=30000] - Lease timeout in milliseconds
 * 
 * @returns {Promise<{ scanned: number, recovered: number, skipped: number, errors: number, recoveredIds: string[] }>}
 */
export const recoverUnavailableSubmissions = async ({
  submissionId,
  attemptId,
  limit = 100,
  leaseDurationMs = DEFAULT_LEASE_DURATION_MS
} = {}) => {
  const now = new Date();

  // Find submissions that are either EXECUTION_UNAVAILABLE or have a stale, expired RECOVERING lease
  const query = {
    runType: 'SUBMISSION',
    $or: [
      { status: 'EXECUTION_UNAVAILABLE' },
      { status: 'RECOVERING', recoveryLeaseExpiresAt: { $lt: now } }
    ]
  };

  if (submissionId) {
    query._id = submissionId;
  }
  if (attemptId) {
    query.attemptId = attemptId;
  }

  // Scan candidates
  const candidates = await Submission.find(query)
    .limit(limit)
    .select('_id verdict status attemptId questionId runType language recoveryLeaseExpiresAt');

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

    // Safety Gate 2: Atomic Lease Acquisition
    // Generates unique ownership token and lease expiration
    const ownerToken = crypto.randomUUID();
    const leaseExpiresAt = new Date(Date.now() + leaseDurationMs);

    const lockedSub = await Submission.findOneAndUpdate(
      {
        _id: candidate._id,
        $or: [
          { status: 'EXECUTION_UNAVAILABLE' },
          { status: 'RECOVERING', recoveryLeaseExpiresAt: { $lt: new Date() } }
        ]
      },
      {
        $set: {
          status: 'RECOVERING',
          recoveryOwner: ownerToken,
          recoveryStartedAt: new Date(),
          recoveryLeaseExpiresAt: leaseExpiresAt
        },
        $inc: { recoveryAttempts: 1 }
      },
      { new: true }
    );

    if (!lockedSub) {
      // Another concurrent reconciler or active worker already claimed this submission
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
        throw new Error(`Failed to inspect queue job ${jobId}: ${jobErr.message}`);
      }

      if (existingJob) {
        const state = await existingJob.getState();

        // 4a. Active job: currently processing in a worker -> NEVER retry, release lease
        if (state === 'active') {
          await Submission.updateOne(
            { _id: lockedSub._id, status: 'RECOVERING', recoveryOwner: ownerToken },
            {
              $set: {
                status: 'RUNNING',
                recoveryOwner: null,
                recoveryLeaseExpiresAt: null,
                errorMessage: 'Job actively processing in worker.'
              }
            }
          );
          skipped++;
          continue;
        }

        // 4b. Completed job: already finalized in BullMQ -> NEVER reset
        if (state === 'completed') {
          await Submission.updateOne(
            { _id: lockedSub._id, status: 'RECOVERING', recoveryOwner: ownerToken },
            {
              $set: {
                status: 'COMPLETED',
                recoveryOwner: null,
                recoveryLeaseExpiresAt: null
              }
            }
          );
          skipped++;
          continue;
        }

        // 4c. Retained Failed job: use BullMQ's native retry operation to reset attemptsMade and requeue
        if (state === 'failed') {
          if (typeof existingJob.retry === 'function') {
            await existingJob.retry('failed', { resetAttemptsMade: true });
          } else {
            // Fallback for test environments without full BullMQ backend
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
          // 4d. Already queued or waiting: will be processed by worker, no duplicate job needed
        }
      } else {
        // 4e. Missing job (retention expired or never queued): add fresh job with deterministic ID
        await enqueueExecutionJob({
          submissionId: lockedSub._id,
          attemptId: lockedSub.attemptId || '',
          questionId: lockedSub.questionId || '',
          runType: lockedSub.runType || 'SUBMISSION',
          language: lockedSub.language || 'javascript'
        });
      }

      // Safety Gate 5: Atomically transition to QUEUED only if still RECOVERING under our lease!
      // If a fast worker has already picked up the job and transitioned it to RUNNING, or another
      // reconciler re-acquired an expired lease, this update will safely match 0 documents.
      const updateRes = await Submission.updateOne(
        { _id: lockedSub._id, status: 'RECOVERING', recoveryOwner: ownerToken },
        {
          $set: {
            status: 'QUEUED',
            verdict: 'PENDING',
            scoreAwarded: null, // Strictly null until execution completes
            errorMessage: 'Queued for recovery re-execution after runner recovery.',
            recoveryOwner: null,
            recoveryLeaseExpiresAt: null,
            recoveryFailureReason: null
          }
        }
      );

      if ((updateRes.matchedCount ?? updateRes.modifiedCount) > 0) {
        recovered++;
        recoveredIds.push(lockedSub._id.toString());
      } else {
        // Lease was preempted by an active worker or expired and claimed by another process
        skipped++;
      }
    } catch (queueErr) {
      // Safety Gate 6: Redis fault tolerance - revert status back to EXECUTION_UNAVAILABLE on failure
      // Never leaves submission in a misleading QUEUED or locked RECOVERING state
      errors++;
      await Submission.updateOne(
        { _id: lockedSub._id, status: 'RECOVERING', recoveryOwner: ownerToken },
        {
          $set: {
            status: 'EXECUTION_UNAVAILABLE',
            recoveryOwner: null,
            recoveryLeaseExpiresAt: null,
            recoveryFailureReason: queueErr.message,
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

/**
 * Reconciles remote execution tokens and states for abandoned, crashed, or in-flight runner jobs.
 * Enforces quarantine cooldowns for unconfirmed executions to guarantee isolate termination
 * before allowing retry or duplicate submission creation.
 * 
 * @param {Object} [options]
 * @param {string} [options.submissionId]
 * @param {number} [options.limit=50]
 * @param {number} [options.leaseDurationMs=DEFAULT_LEASE_DURATION_MS]
 * @param {number} [options.quarantineBufferMs=DEFAULT_QUARANTINE_BUFFER_MS]
 * @param {Object} [options.provider]
 * @returns {Promise<{ scanned: number, reconciled: number, quarantined: number, errors: number }>}
 */
export const reconcileRemoteSubmissions = async ({
  submissionId,
  limit = 50,
  leaseDurationMs = DEFAULT_LEASE_DURATION_MS,
  quarantineBufferMs = DEFAULT_QUARANTINE_BUFFER_MS,
  provider = null
} = {}) => {
  const query = {
    'remoteExecution.state': {
      $in: ['REQUESTING', 'QUEUED', 'PROCESSING', 'CANCELLATION_REQUESTED', 'CANCELLATION_UNCONFIRMED']
    }
  };

  if (submissionId) {
    query._id = submissionId;
  }

  const candidates = await Submission.find(query).limit(limit);
  let reconciled = 0;
  let quarantined = 0;
  let errors = 0;

  const activeProvider = provider || providerRegistry.getProvider();

  for (const candidate of candidates) {
    const ownerToken = crypto.randomUUID();
    const leaseExpiresAt = new Date(Date.now() + leaseDurationMs);

    // Acquire recovery lease
    const lockedSub = await Submission.findOneAndUpdate(
      {
        _id: candidate._id,
        $or: [
          { status: 'RUNNING', executionLeaseExpiresAt: { $lt: new Date() } },
          { status: 'EXECUTION_UNAVAILABLE' },
          { status: 'RECOVERING', recoveryLeaseExpiresAt: { $lt: new Date() } },
          { 'remoteExecution.state': 'CANCELLATION_REQUESTED' },
          { 'remoteExecution.state': 'CANCELLATION_UNCONFIRMED' }
        ]
      },
      {
        $set: {
          recoveryOwner: ownerToken,
          recoveryStartedAt: new Date(),
          recoveryLeaseExpiresAt: leaseExpiresAt
        }
      },
      { new: true }
    );

    if (!lockedSub) {
      continue;
    }

    try {
      const remote = lockedSub.remoteExecution || {};
      const token = remote.token;

      // Case 1: Worker crashed during submission creation (state is REQUESTING, but no token)
      // If token is null, TestForge cannot poll Judge0 and queue delay is unbounded.
      // Fail-closed policy: Do NOT reset after a simple timer! Mark CANCELLATION_UNCONFIRMED fail-closed.
      if (!token && (remote.state === 'REQUESTING' || remote.state === 'CANCELLATION_UNCONFIRMED')) {
        quarantined++;
        await Submission.updateOne(
          { _id: lockedSub._id, recoveryOwner: ownerToken },
          {
            $set: {
              status: 'EXECUTION_UNAVAILABLE',
              'remoteExecution.state': 'CANCELLATION_UNCONFIRMED',
              'remoteExecution.cancellationStatus': 'ORPHAN_UNTRACKED_TOKEN',
              'remoteExecution.lastObservedState': 'UNRESOLVED_ORPHAN',
              'remoteExecution.quarantineUntil': null, // Cannot be auto-cleared by timer alone
              errorMessage: 'Worker crashed prior to token persistence. Unresolved remote execution preserved fail-closed.',
              recoveryOwner: null,
              recoveryLeaseExpiresAt: null
            }
          }
        );
        continue;
      }

      // Case 2: Token exists; query remote runner for authoritative status
      if (token && typeof activeProvider?.getSubmission === 'function') {
        const remoteInfo = await activeProvider.getSubmission(token);

        if (!remoteInfo || remoteInfo.exists === false || remoteInfo.status === 'not_found') {
          // If remote submission no longer exists in Judge0:
          // Check if previously seen executing in isolate
          const lastObservedAt = remote.lastObservedAt ? new Date(remote.lastObservedAt).getTime() : 0;
          const wasProcessing = remote.lastObservedState === 'PROCESSING' || remote.state === 'PROCESSING';
          const quarantineExpiresAt = wasProcessing ? lastObservedAt + MAX_ISOLATE_EXECUTION_CEILING_MS : 0;

          if (wasProcessing && Date.now() < quarantineExpiresAt) {
            quarantined++;
            await Submission.updateOne(
              { _id: lockedSub._id, recoveryOwner: ownerToken },
              {
                $set: {
                  status: 'EXECUTION_UNAVAILABLE',
                  'remoteExecution.state': 'CANCELLATION_REQUESTED',
                  'remoteExecution.quarantineUntil': new Date(quarantineExpiresAt),
                  recoveryOwner: null,
                  recoveryLeaseExpiresAt: null
                }
              }
            );
            continue;
          }

          reconciled++;
          await Submission.updateOne(
            { _id: lockedSub._id, recoveryOwner: ownerToken },
            {
              $set: {
                status: 'EXECUTION_UNAVAILABLE',
                'remoteExecution.state': 'NOT_FOUND',
                'remoteExecution.lastCheckedAt': new Date(),
                'remoteExecution.confirmedTerminalAt': new Date(),
                'remoteExecution.quarantineUntil': null,
                errorMessage: 'Remote submission confirmed terminated or evicted from runner.',
                recoveryOwner: null,
                recoveryLeaseExpiresAt: null
              }
            }
          );
        } else if (remoteInfo.status === 'in_queue') {
          // Still queued in runner
          await Submission.updateOne(
            { _id: lockedSub._id, recoveryOwner: ownerToken },
            {
              $set: {
                'remoteExecution.state': 'QUEUED',
                'remoteExecution.lastCheckedAt': new Date(),
                'remoteExecution.lastObservedState': 'QUEUED',
                recoveryOwner: null,
                recoveryLeaseExpiresAt: null
              }
            }
          );
        } else if (remoteInfo.status === 'processing') {
          // Still executing in runner: record lastObservedAt and quarantine ceiling
          const now = new Date();
          await Submission.updateOne(
            { _id: lockedSub._id, recoveryOwner: ownerToken },
            {
              $set: {
                'remoteExecution.state': 'PROCESSING',
                'remoteExecution.lastCheckedAt': now,
                'remoteExecution.lastObservedAt': now,
                'remoteExecution.lastObservedState': 'PROCESSING',
                'remoteExecution.quarantineUntil': new Date(now.getTime() + MAX_ISOLATE_EXECUTION_CEILING_MS),
                recoveryOwner: null,
                recoveryLeaseExpiresAt: null
              }
            }
          );
        } else if (remoteInfo.status === 'success' || ['timeout', 'compilation_error', 'runtime_error', 'memory_limit_exceeded'].includes(remoteInfo.status)) {
          // Completed remotely, but TestForge had not saved results: recover completed result
          reconciled++;
          await Submission.updateOne(
            { _id: lockedSub._id, recoveryOwner: ownerToken },
            {
              $set: {
                'remoteExecution.state': 'COMPLETED',
                'remoteExecution.completedAt': new Date(),
                'remoteExecution.lastCheckedAt': new Date(),
                'remoteExecution.confirmedTerminalAt': new Date(),
                'remoteExecution.quarantineUntil': null,
                recoveryOwner: null,
                recoveryLeaseExpiresAt: null
              }
            }
          );
        } else {
          // Runner returned error or unavailable
          await Submission.updateOne(
            { _id: lockedSub._id, recoveryOwner: ownerToken },
            {
              $set: {
                'remoteExecution.lastCheckedAt': new Date(),
                recoveryOwner: null,
                recoveryLeaseExpiresAt: null
              }
            }
          );
        }
      } else {
        // No provider or token: safely release lease
        await Submission.updateOne(
          { _id: lockedSub._id, recoveryOwner: ownerToken },
          {
            $set: {
              recoveryOwner: null,
              recoveryLeaseExpiresAt: null
            }
          }
        );
      }
    } catch (err) {
      errors++;
      console.warn(`[ExecutionRecovery] reconcileRemoteSubmissions error for ${lockedSub._id}: ${err.message}`);
      await Submission.updateOne(
        { _id: lockedSub._id, recoveryOwner: ownerToken },
        {
          $set: {
            recoveryOwner: null,
            recoveryLeaseExpiresAt: null
          }
        }
      );
    }
  }

  return {
    scanned: candidates.length,
    reconciled,
    quarantined,
    errors
  };
};

/**
 * Administrative / Operator clearance for orphaned unconfirmed submissions.
 * Explicitly clears CANCELLATION_UNCONFIRMED state after manual queue drain or verification.
 * 
 * @param {string|import('mongoose').Types.ObjectId} submissionId
 * @param {string} operatorId
 * @param {string} [reason='Operator verified queue drain']
 */
export const clearUnresolvedRemoteExecution = async (submissionId, operatorId, reason = 'Operator verified queue drain') => {
  if (!submissionId || !operatorId) {
    throw new Error('submissionId and operatorId are required to clear an unresolved remote execution.');
  }
  return await Submission.findOneAndUpdate(
    { _id: submissionId, 'remoteExecution.state': { $in: ['CANCELLATION_UNCONFIRMED', 'REQUESTING'] } },
    {
      $set: {
        'remoteExecution.state': 'NOT_CREATED',
        'remoteExecution.quarantineUntil': null,
        'remoteExecution.cancellationStatus': `OPERATOR_CLEARED: ${reason}`,
        'remoteExecution.confirmedTerminalAt': new Date(),
        errorMessage: `Cleared by operator ${operatorId}: ${reason}`
      }
    },
    { new: true }
  );
};

export default {
  DEFAULT_LEASE_DURATION_MS,
  DEFAULT_QUARANTINE_BUFFER_MS,
  MAX_WALL_TIME_LIMIT_MS,
  ISOLATE_TEARDOWN_BUFFER_MS,
  MAX_ISOLATE_EXECUTION_CEILING_MS,
  renewRecoveryLease,
  recoverUnavailableSubmissions,
  reconcileRemoteSubmissions,
  clearUnresolvedRemoteExecution
};
