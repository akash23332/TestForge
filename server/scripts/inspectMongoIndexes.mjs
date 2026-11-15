import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Question } from '../src/models/Question.js';

async function main() {
  try {
    await connectDatabase();
    console.log('[1] Connected to MongoDB');

    // Sync schema indexes with actual database
    console.log('[2] Running Question.syncIndexes()...');
    const syncRes = await Question.syncIndexes();
    console.log('[2] syncIndexes result:', syncRes);

    // List actual indexes directly from MongoDB collection
    console.log('[3] Fetching collection.indexes()...');
    const indexes = await Question.collection.indexes();
    console.log('[3] ACTUAL_MONGODB_INDEXES:');
    console.log(JSON.stringify(indexes, null, 2));

    // Verify document counts and draftId values in database
    const totalDocs = await Question.countDocuments();
    const nullOrMissingDraftDocs = await Question.countDocuments({
      $or: [{ draftId: null }, { draftId: { $exists: false } }]
    });
    const stringDraftDocs = await Question.countDocuments({
      draftId: { $type: 'string' }
    });

    console.log('[4] DATABASE_DOCUMENTS_SUMMARY:', {
      totalDocs,
      nullOrMissingDraftDocs,
      stringDraftDocs
    });

    // Check for any duplicate string draftIds in database
    const duplicates = await Question.aggregate([
      { $match: { draftId: { $type: 'string' } } },
      { $group: { _id: '$draftId', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]);

    console.log('[5] DUPLICATE_STRING_DRAFT_IDS:', duplicates);

    // Test inserting two dummy docs with draftId: null to prove compatibility
    const testDoc1 = await Question.create({
      title: 'Legacy Compatibility Probe 1',
      statement: 'Problem statement text',
      language: 'javascript',
      referenceSolution: 'function solution() {}',
      draftId: null,
      ownerId: new mongoose.Types.ObjectId()
    });

    const testDoc2 = await Question.create({
      title: 'Legacy Compatibility Probe 2',
      statement: 'Problem statement text',
      language: 'javascript',
      referenceSolution: 'function solution() {}',
      draftId: null,
      ownerId: new mongoose.Types.ObjectId()
    });

    console.log('[6] Successfully created two documents with draftId: null in the same collection without index conflict!');
    console.log('   Doc 1 ID:', testDoc1._id.toString());
    console.log('   Doc 2 ID:', testDoc2._id.toString());

    // Clean up probes
    await Question.deleteMany({ _id: { $in: [testDoc1._id, testDoc2._id] } });
    console.log('[7] Probe cleanup complete');

    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    console.error('[ERROR]', err);
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  }
}

main();
