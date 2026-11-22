import { MutationReport } from '../../models/MutationReport.js';

export const STALE_MUTATION_RUN_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Recovers orphaned, stalled, or abandoned mutation testing runs.
 * Cleans up unreleased activeLocks and transitions dead runs to FAILED.
 * 
 * @param {Object} [options]
 * @param {number} [options.staleThresholdMs=120000]
 * @returns {Promise<{ recovered: number, unlocked: number }>}
 */
export const recoverStaleMutationRuns = async (options = {}) => {
  const staleThresholdMs = options.staleThresholdMs || STALE_MUTATION_RUN_THRESHOLD_MS;
  const cutoff = new Date(Date.now() - staleThresholdMs);

  let recovered = 0;
  let unlocked = 0;

  try {
    // 1. Recover active runs (PENDING or RUNNING) that have not been touched for > threshold
    const staleRuns = await MutationReport.find({
      status: { $in: ['PENDING', 'RUNNING'] },
      $or: [
        { updatedAt: { $lt: cutoff } },
        { updatedAt: { $exists: false }, createdAt: { $lt: cutoff } }
      ]
    });

    for (const run of staleRuns) {
      run.status = 'FAILED';
      run.activeLock = null;
      run.errorMessage = run.errorMessage || 'Mutation run timed out or was interrupted by a server restart.';
      run.completedAt = new Date();
      await run.save();
      recovered++;
    }

    // 2. Clean up any leaked activeLocks on already completed or failed runs
    const leakedLocksResult = await MutationReport.updateMany(
      {
        status: { $in: ['COMPLETED', 'FAILED'] },
        activeLock: { $ne: null }
      },
      {
        $set: { activeLock: null }
      }
    );
    unlocked = leakedLocksResult.modifiedCount || 0;

  } catch (err) {
    console.warn(`[MutationRecovery] Recovery sweep encountered non-fatal error: ${err.message}`);
  }

  return { recovered, unlocked };
};

export default {
  recoverStaleMutationRuns,
  STALE_MUTATION_RUN_THRESHOLD_MS
};
