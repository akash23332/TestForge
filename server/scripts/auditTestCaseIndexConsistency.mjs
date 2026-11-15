import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { TestCase } from '../src/models/TestCase.js';
import { Question } from '../src/models/Question.js';
import { MutationReport } from '../src/models/MutationReport.js';

async function main() {
  try {
    await connectDatabase();
    console.log('=== STEP 1: COLLECTION INDEXES ON ATLAS ===');
    const indexes = await TestCase.collection.indexes();
    for (const idx of indexes) {
      console.log(`Index: ${idx.name}`);
      console.log(`  Key: ${JSON.stringify(idx.key)}`);
      console.log(`  Unique: ${idx.unique || false}`);
      console.log(`  PartialFilter: ${JSON.stringify(idx.partialFilterExpression || null)}`);
    }

    console.log('\n=== STEP 2: EXISTING ADOPTED TESTCASES IN DATABASE ===');
    const totalTestCases = await TestCase.countDocuments();
    const adoptedTestCases = await TestCase.find({ source: 'mutation_derived' }).lean();
    console.log(`Total TestCases: ${totalTestCases}`);
    console.log(`Adopted TestCases (source: mutation_derived): ${adoptedTestCases.length}`);

    for (const tc of adoptedTestCases) {
      console.log(`  - ID: ${tc._id}, Question: ${tc.questionId}, Report: ${tc.sourceReportId}, Candidate: ${tc.sourceCandidateId}`);
    }

    console.log('\n=== STEP 3: CHECK DUPLICATES AMONG ADOPTED TESTCASES ===');
    const duplicateCheck3Field = await TestCase.aggregate([
      {
        $match: {
          sourceReportId: { $type: 'objectId' },
          sourceCandidateId: { $type: 'string' }
        }
      },
      {
        $group: {
          _id: {
            questionId: '$questionId',
            sourceReportId: '$sourceReportId',
            sourceCandidateId: '$sourceCandidateId'
          },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]);
    console.log('Duplicates on { questionId, sourceReportId, sourceCandidateId }:', duplicateCheck3Field);

    const duplicateCheck2Field = await TestCase.aggregate([
      {
        $match: {
          sourceCandidateId: { $type: 'string' }
        }
      },
      {
        $group: {
          _id: {
            questionId: '$questionId',
            sourceCandidateId: '$sourceCandidateId'
          },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]);
    console.log('Duplicates on { questionId, sourceCandidateId }:', duplicateCheck2Field);

    console.log('\n=== STEP 4: ORDINARY TESTCASES EXCLUSION CHECK ===');
    const ordinaryTestCases = await TestCase.find({
      $or: [
        { sourceReportId: null },
        { sourceReportId: { $exists: false } }
      ]
    }).limit(5).lean();
    console.log(`Found ${ordinaryTestCases.length} sample ordinary testcases.`);
    ordinaryTestCases.forEach((tc) => {
      console.log(`  - ID: ${tc._id}, source: ${tc.source}, sourceReportId: ${tc.sourceReportId}`);
    });

  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    await disconnectDatabase();
  }
}

main();
