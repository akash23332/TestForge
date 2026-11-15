import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { MutationReport } from '../../src/models/MutationReport.js';
import { TestCase } from '../../src/models/TestCase.js';
import { Question } from '../../src/models/Question.js';

dotenv.config({ path: 'server/.env' });

/**
 * Safe, idempotent migration script for Phase 4A.2 Candidate Test Adoption Foundation.
 * 
 * 1. Ensures partial unique index on TestCase collection exists.
 * 2. Backfills candidateId and adoptionStatus='PENDING' on existing MutationReport candidateTests.
 * 3. Never mutates historical mutant verdicts, scores, or existing TestCases.
 * 
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false]
 * @param {boolean} [options.silent=false]
 * @returns {Promise<Object>} Migration statistics
 */
export async function migrateCandidateAdoptionSchemasPhase4A2(options = {}) {
  const isSilent = options.silent === true;
  const isDryRun = options.dryRun === true;

  if (!isSilent) {
    console.log(`[Migration Phase 4A.2] Starting Candidate Adoption schema migration (dryRun=${isDryRun})...`);
  }

  // 1. Ensure Partial Unique Index on TestCase Collection
  let indexCreated = false;
  try {
    const existingIndexes = await TestCase.collection.indexes();
    const hasAdoptedIndex = existingIndexes.some(
      (idx) => idx.name === 'uniq_question_adopted_candidate'
    );

    if (!hasAdoptedIndex) {
      if (!isDryRun) {
        await TestCase.collection.createIndex(
          {
            questionId: 1,
            sourceReportId: 1,
            sourceCandidateId: 1
          },
          {
            unique: true,
            partialFilterExpression: {
              sourceReportId: { $type: 'objectId' },
              sourceCandidateId: { $type: 'string' }
            },
            background: true,
            name: 'uniq_question_adopted_candidate'
          }
        );
      }
      indexCreated = true;
      if (!isSilent) console.log('  [Index] Created partial unique index: uniq_question_adopted_candidate');
    } else {
      if (!isSilent) console.log('  [Index] Partial unique index uniq_question_adopted_candidate already exists.');
    }
  } catch (idxErr) {
    console.error(`  [Index Warning] Failed to inspect or create index: ${idxErr.message}`);
  }

  // 2. Scan and backfill candidateTests in MutationReport collection
  const filter = {
    'candidateTests.0': { $exists: true },
    $or: [
      { 'candidateTests.candidateId': { $exists: false } },
      { 'candidateTests.candidateId': null },
      { 'candidateTests.adoptionStatus': { $exists: false } },
      { 'candidateTests.adoptionStatus': null }
    ]
  };

  const reports = await MutationReport.find(filter)
    .select('_id candidateTests')
    .lean();

  let reportsScanned = reports.length;
  let candidateTestsUpdated = 0;
  let reportsModified = 0;

  for (const report of reports) {
    if (!report.candidateTests || !Array.isArray(report.candidateTests)) continue;

    let reportNeedsUpdate = false;
    const updatedCandidates = report.candidateTests.map((cand) => {
      let candModified = false;
      const updated = { ...cand };

      if (!updated.candidateId) {
        updated.candidateId = crypto.randomUUID();
        candModified = true;
      }

      if (!updated.adoptionStatus) {
        updated.adoptionStatus = 'PENDING';
        candModified = true;
      }

      if (updated.adoptionOperationId === undefined) {
        updated.adoptionOperationId = null;
      }
      if (updated.adoptedTestCaseId === undefined) {
        updated.adoptedTestCaseId = null;
      }
      if (updated.adoptedAt === undefined) {
        updated.adoptedAt = null;
      }
      if (updated.adoptedBy === undefined) {
        updated.adoptedBy = null;
      }

      if (candModified) {
        candidateTestsUpdated++;
        reportNeedsUpdate = true;
      }

      return updated;
    });

    if (reportNeedsUpdate) {
      reportsModified++;
      if (!isDryRun) {
        await MutationReport.updateOne(
          { _id: report._id },
          { $set: { candidateTests: updatedCandidates } }
        );
      }
    }
  }

  const result = {
    indexCreated,
    reportsScanned,
    reportsModified,
    candidateTestsUpdated,
    dryRun: isDryRun
  };

  if (!isSilent) {
    console.log('[Migration Phase 4A.2] Summary:');
    console.log(`  - Reports Scanned: ${reportsScanned}`);
    console.log(`  - Reports Modified: ${reportsModified}`);
    console.log(`  - Candidate Tests Backfilled: ${candidateTestsUpdated}`);
    console.log(`  - Partial Index Created: ${indexCreated}`);
    console.log('[Migration Phase 4A.2] Migration completed successfully.');
  }

  return result;
}

// CLI Direct Invocation Execution
if (process.argv[1] && process.argv[1].endsWith('migrateCandidateAdoptionSchemasPhase4A2.mjs')) {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/testforge';
  console.log(`Connecting to MongoDB for migration at: ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')}`);
  
  mongoose.connect(uri)
    .then(async () => {
      const isDryRun = process.argv.includes('--dry-run');
      await migrateCandidateAdoptionSchemasPhase4A2({ dryRun: isDryRun, silent: false });
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
