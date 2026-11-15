import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { MutationReport } from '../../src/models/MutationReport.js';

dotenv.config({ path: 'server/.env' });

/**
 * Safe, idempotent migration script for Phase 4A.
 * Updates fields individually without overwriting teacher changes or historical scores.
 * 
 * @param {Object} [options]
 * @param {boolean} [options.silent=false]
 * @returns {Promise<Object>}
 */
export async function migrateHistoricalMutationReports(options = {}) {
  const isSilent = options.silent === true;
  const filter = {
    $or: [
      { 'mutants.baselineExecutionStatus': { $exists: false } },
      { 'mutants.currentClassification': { $exists: false } },
      { 'mutants.auditHistory': { $exists: false } }
    ]
  };

  const reports = await MutationReport.find(filter)
    .select('_id mutants mutationScore killedCount survivedCount equivalentCount')
    .lean();
  
  let reportsScanned = reports.length;
  let baselineUpdatedCount = 0;
  let classificationUpdatedCount = 0;
  let auditHistoryUpdatedCount = 0;

  for (const report of reports) {
    if (!report.mutants || !Array.isArray(report.mutants)) continue;

    for (let idx = 0; idx < report.mutants.length; idx++) {
      const m = report.mutants[idx];
      const execStatus = String(m.executionStatus || '').toUpperCase();

      let targetBaseline = 'UNKNOWN_LEGACY';
      let targetClassification = 'UNKNOWN_LEGACY';

      if (execStatus === 'KILLED') {
        targetBaseline = 'KILLED';
        targetClassification = 'KILLED';
      } else if (execStatus === 'SURVIVED') {
        targetBaseline = 'SURVIVED';
        targetClassification = m.equivalent ? 'EQUIVALENT' : 'SURVIVED';
      } else if (execStatus === 'EQUIVALENT') {
        targetBaseline = 'SURVIVED';
        targetClassification = 'EQUIVALENT';
      } else if (execStatus === 'COMPILATION_ERROR') {
        targetBaseline = 'COMPILATION_ERROR';
        targetClassification = 'COMPILATION_ERROR';
      } else if (execStatus === 'RUNTIME_ERROR') {
        targetBaseline = 'RUNTIME_ERROR';
        targetClassification = 'RUNTIME_ERROR';
      } else if (execStatus === 'TIMEOUT') {
        targetBaseline = 'TIMEOUT';
        targetClassification = 'TIMEOUT';
      } else if (execStatus === 'PENDING') {
        targetBaseline = 'PENDING';
        targetClassification = 'PENDING';
      }

      // 1. Migrate baselineExecutionStatus independently if missing
      if (m.baselineExecutionStatus === undefined) {
        const res = await MutationReport.updateOne(
          { _id: report._id, [`mutants.${idx}.baselineExecutionStatus`]: { $exists: false } },
          { $set: { [`mutants.${idx}.baselineExecutionStatus`]: targetBaseline } }
        );
        if (res.modifiedCount > 0) baselineUpdatedCount++;
      }

      // 2. Migrate currentClassification independently if missing (NEVER overwrites an existing review!)
      if (m.currentClassification === undefined) {
        const res = await MutationReport.updateOne(
          { _id: report._id, [`mutants.${idx}.currentClassification`]: { $exists: false } },
          { $set: { [`mutants.${idx}.currentClassification`]: targetClassification } }
        );
        if (res.modifiedCount > 0) classificationUpdatedCount++;
      }

      // 3. Migrate auditHistory independently if missing
      if (m.auditHistory === undefined || !Array.isArray(m.auditHistory)) {
        const res = await MutationReport.updateOne(
          { _id: report._id, [`mutants.${idx}.auditHistory`]: { $exists: false } },
          { $set: { [`mutants.${idx}.auditHistory`]: [] } }
        );
        if (res.modifiedCount > 0) auditHistoryUpdatedCount++;
      }
    }
  }

  const summary = {
    reportsScanned,
    baselineUpdatedCount,
    classificationUpdatedCount,
    auditHistoryUpdatedCount
  };

  if (!isSilent) {
    console.log('[Migration Phase 4A] Historical reports migration summary:', summary);
  }

  return summary;
}

// Standalone execution entrypoint
if (process.argv[1] && process.argv[1].endsWith('migrateMutationReportsPhase4.mjs')) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/testforge';
  console.log('[Migration Phase 4A] Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  const result = await migrateHistoricalMutationReports();
  console.log('[Migration Phase 4A] Result:', result);
  await mongoose.disconnect();
  console.log('[Migration Phase 4A] Done.');
}
