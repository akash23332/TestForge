import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Submission } from '../src/models/Submission.js';

dotenv.config({ path: './.env' });

describe('Real MongoDB Multi-Instance Idempotency Integration Test', () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/testforge';
  let isConnected = false;
  const testIds = [];

  beforeAll(async () => {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      isConnected = true;
      await Submission.syncIndexes();
    } catch (err) {
      console.warn('Real MongoDB connection skipped in this test environment:', err.message);
    }
  }, 10000);

  afterAll(async () => {
    if (isConnected) {
      try {
        if (testIds.length > 0) {
          await Submission.deleteMany({ _id: { $in: testIds } });
        }
        await mongoose.disconnect();
      } catch (err) {
        console.warn('Error during disconnect:', err.message);
      }
    }
  });

  test('Real MongoDB verifies unique partial index exists on submissions collection', async () => {
    if (!isConnected) {
      console.log('Skipping real MongoDB test: No active MongoDB cluster reachable.');
      return;
    }

    const indexes = await Submission.collection.indexes();
    const idempotencyIndex = indexes.find(idx => idx.name === 'idempotencyKey_1');

    expect(idempotencyIndex).toBeDefined();
    expect(idempotencyIndex.unique).toBe(true);
    expect(idempotencyIndex.partialFilterExpression).toEqual({
      idempotencyKey: { $type: 'string' }
    });
  });

  test('Real MongoDB physically throws E11000 on concurrent duplicate idempotencyKey creation', async () => {
    if (!isConnected) {
      return;
    }

    const testKey = `real_mongo_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const attemptId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();

    // 1. First submission succeeds in real MongoDB
    const sub1 = await Submission.create({
      attemptId,
      questionId,
      code: 'console.log(1)',
      language: 'javascript',
      runType: 'SUBMISSION',
      status: 'QUEUED',
      idempotencyKey: testKey
    });
    testIds.push(sub1._id);

    expect(sub1._id).toBeDefined();

    // 2. Second submission with the exact same key MUST trigger real MongoDB E11000 duplicate key error
    let duplicateError = null;
    try {
      await Submission.create({
        attemptId,
        questionId,
        code: 'console.log(1)',
        language: 'javascript',
        runType: 'SUBMISSION',
        status: 'QUEUED',
        idempotencyKey: testKey
      });
    } catch (err) {
      duplicateError = err;
    }

    expect(duplicateError).not.toBeNull();
    expect(duplicateError.code).toBe(11000);
    expect(duplicateError.name).toMatch(/MongoServerError/i);
    expect(duplicateError.message).toContain('E11000 duplicate key error');
  });

  test('Real MongoDB partial index allows multiple documents with null idempotencyKey', async () => {
    if (!isConnected) {
      return;
    }

    const attemptId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();

    const subA = await Submission.create({
      attemptId,
      questionId,
      code: 'console.log(2)',
      language: 'javascript',
      runType: 'SAMPLE',
      status: 'COMPLETED',
      idempotencyKey: null
    });
    testIds.push(subA._id);

    const subB = await Submission.create({
      attemptId,
      questionId,
      code: 'console.log(3)',
      language: 'javascript',
      runType: 'SAMPLE',
      status: 'COMPLETED',
      idempotencyKey: null
    });
    testIds.push(subB._id);

    expect(subA._id).toBeDefined();
    expect(subB._id).toBeDefined();
    expect(subA._id.toString()).not.toBe(subB._id.toString());
  });
});
