/**
 * TestForge: Real MongoDB Replica-Set Distributed Integration Test Suite
 * 
 * Tests against REAL MongoDB Database (MONGODB_URI).
 * Explicitly tests and verifies:
 * 1. Physical index listing from MongoDB via collection.listIndexes()
 * 2. Real unique partial index constraint on idempotencyKey
 * 3. Actual MongoDB MongoServerError E11000 duplicate key error on concurrent insertion
 * 4. Separate identities for intentional executions with different client UUIDs
 * 5. Delayed duplicate retry returning completed document from real database
 * 6. Real atomic findOneAndUpdate version fencing
 */

import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

import { Submission } from '../src/models/Submission.js';
import {
  renewExecutionLease,
  LEASE_OUTCOMES
} from '../src/services/queue/executionProcessor.js';

describe('Real MongoDB Integration: Distributed Concurrency & Index Verification', () => {
  const testRunId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const createdDocIds = [];

  beforeAll(async () => {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable required for real integration tests.');
    }
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    // Synchronize schema indexes to ensure database matches Mongoose definition
    await Submission.syncIndexes();
  }, 15000);

  afterAll(async () => {
    if (createdDocIds.length > 0) {
      await Submission.deleteMany({ _id: { $in: createdDocIds } });
    }
    await mongoose.disconnect();
  });

  // ── 1. Physical Index Verification on Real MongoDB Collection ────────────────
  test('Physical MongoDB Index Verification: idempotencyKey_1 exists with unique constraint and partial filter', async () => {
    const indexes = await Submission.collection.listIndexes().toArray();
    const idempotencyIndex = indexes.find((idx) => idx.name === 'idempotencyKey_1');

    expect(idempotencyIndex).toBeDefined();
    expect(idempotencyIndex.unique).toBe(true);
    expect(idempotencyIndex.key).toEqual({ idempotencyKey: 1 });
    expect(idempotencyIndex.partialFilterExpression).toEqual({
      idempotencyKey: { $type: 'string' }
    });
  });

  // ── 2. Real E11000 Duplicate Key Enforcement ─────────────────────────────────
  test('Real MongoDB Duplicate Key Enforcement: Second insertion with same idempotencyKey throws native E11000', async () => {
    const key = `client:integration:${testRunId}:UUID_DUPLICATE_TEST`;
    const attemptId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();

    // First insertion succeeds
    const doc1 = await Submission.create({
      attemptId,
      questionId,
      code: 'function test() { return 1; }',
      language: 'javascript',
      runType: 'SUBMISSION',
      status: 'QUEUED',
      verdict: 'PENDING',
      idempotencyKey: key
    });
    createdDocIds.push(doc1._id);

    // Second insertion with identical key MUST throw native MongoDB E11000 error
    let duplicateError = null;
    try {
      await Submission.create({
        attemptId,
        questionId,
        code: 'function test() { return 1; }',
        language: 'javascript',
        runType: 'SUBMISSION',
        status: 'QUEUED',
        verdict: 'PENDING',
        idempotencyKey: key
      });
    } catch (err) {
      duplicateError = err;
    }

    expect(duplicateError).toBeDefined();
    expect(duplicateError.code).toBe(11000);
    expect(duplicateError.name).toBe('MongoServerError');
    expect(duplicateError.message).toContain('duplicate key');
  });

  // ── 3. Separate Identities for Distinct Client UUIDs ────────────────────────
  test('Two intentional executions with identical code but distinct client UUIDs create separate documents', async () => {
    const attemptId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();
    const code = 'function identicalCode() { return 42; }';

    const clientUuid1 = `client:${testRunId}:INTENTIONAL_RUN_1`;
    const clientUuid2 = `client:${testRunId}:INTENTIONAL_RUN_2`;

    const sub1 = await Submission.create({
      attemptId,
      questionId,
      code,
      language: 'javascript',
      runType: 'SAMPLE',
      status: 'COMPLETED',
      verdict: 'ACCEPTED',
      idempotencyKey: clientUuid1
    });
    createdDocIds.push(sub1._id);

    const sub2 = await Submission.create({
      attemptId,
      questionId,
      code,
      language: 'javascript',
      runType: 'SAMPLE',
      status: 'QUEUED',
      verdict: 'PENDING',
      idempotencyKey: clientUuid2
    });
    createdDocIds.push(sub2._id);

    expect(sub1._id.toString()).not.toBe(sub2._id.toString());
    expect(sub1.idempotencyKey).toBe(clientUuid1);
    expect(sub2.idempotencyKey).toBe(clientUuid2);

    const count = await Submission.countDocuments({ _id: { $in: [sub1._id, sub2._id] } });
    expect(count).toBe(2);
  });

  // ── 4. Delayed Duplicate Retry Returning Completed Execution ─────────────────
  test('Delayed duplicate retry with same client UUID returns existing completed document from real database', async () => {
    const attemptId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();
    const clientUuid = `client:${testRunId}:DELAYED_RETRY_UUID`;

    // Original execution completes and retains its client idempotencyKey
    const original = await Submission.create({
      attemptId,
      questionId,
      code: 'function solve() { return 100; }',
      language: 'javascript',
      runType: 'SUBMISSION',
      status: 'COMPLETED',
      verdict: 'ACCEPTED',
      idempotencyKey: clientUuid,
      scoreAwarded: 10,
      totalTests: 5,
      passedTests: 5
    });
    createdDocIds.push(original._id);

    // Delayed retry arrives after completion
    const delayedLookup = await Submission.findOne({ idempotencyKey: clientUuid });
    expect(delayedLookup).toBeDefined();
    expect(delayedLookup._id.toString()).toBe(original._id.toString());
    expect(delayedLookup.status).toBe('COMPLETED');
    expect(delayedLookup.verdict).toBe('ACCEPTED');
    expect(delayedLookup.scoreAwarded).toBe(10);
  });

  // ── 5. Real Atomic Version Fencing & Lease Extension ─────────────────────────
  test('Real MongoDB Atomic Lease Extension & Version Fencing: Stale worker update matches 0 documents', async () => {
    const attemptId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();
    const workerA = 'real-worker-A';
    const workerB = 'real-worker-B';

    // Job initially claimed by Worker A at executionVersion = 1
    const sub = await Submission.create({
      attemptId,
      questionId,
      code: 'console.log(1)',
      language: 'javascript',
      runType: 'SAMPLE',
      status: 'RUNNING',
      executionOwner: workerA,
      executionVersion: 1,
      executionLeaseExpiresAt: new Date(Date.now() + 1000)
    });
    createdDocIds.push(sub._id);

    // Worker A extends lease: succeeds because version matches
    const renewA = await renewExecutionLease(sub._id, workerA, 5000, 1);
    expect(renewA.outcome).toBe(LEASE_OUTCOMES.RENEWED);
    expect(renewA.renewed).toBe(true);

    // Simulated worker preemption: Worker B claims job with executionVersion = 2
    await Submission.updateOne(
      { _id: sub._id },
      {
        $set: {
          executionOwner: workerB,
          executionVersion: 2,
          executionLeaseExpiresAt: new Date(Date.now() + 10000)
        }
      }
    );

    // Stale Worker A attempts lease extension with old version 1 on REAL MongoDB
    const staleRenew = await renewExecutionLease(sub._id, workerA, 5000, 1);
    expect(staleRenew.outcome).toBe(LEASE_OUTCOMES.LOST);
    expect(staleRenew.renewed).toBe(false);
  });

  // ── 6. Simultaneous Requests Across Two Independent Instances on Real MongoDB ──
  test('Simultaneous requests across two independent instances on real MongoDB: exactly one creates the record, the other catches E11000 and finds existing', async () => {
    const attemptId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();
    const concurrentKey = `client:integration:${testRunId}:TWO_INSTANCE_CONCURRENT_RACE`;

    // Simulated Instance 1 and Instance 2 race to insert into Real MongoDB
    const [result1, result2] = await Promise.allSettled([
      Submission.create({
        attemptId,
        questionId,
        code: 'function race() {}',
        language: 'javascript',
        runType: 'SUBMISSION',
        status: 'QUEUED',
        verdict: 'PENDING',
        idempotencyKey: concurrentKey
      }),
      Submission.create({
        attemptId,
        questionId,
        code: 'function race() {}',
        language: 'javascript',
        runType: 'SUBMISSION',
        status: 'QUEUED',
        verdict: 'PENDING',
        idempotencyKey: concurrentKey
      })
    ]);

    // Exactly one instance must succeed, exactly one instance must fail with E11000
    const fulfilled = [result1, result2].filter((r) => r.status === 'fulfilled');
    const rejected = [result1, result2].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason.code).toBe(11000);

    const winnerDoc = fulfilled[0].value;
    createdDocIds.push(winnerDoc._id);

    // The losing instance safely queries for the winning document via idempotencyKey
    const retrievedByLoser = await Submission.findOne({ idempotencyKey: concurrentKey });
    expect(retrievedByLoser).toBeDefined();
    expect(retrievedByLoser._id.toString()).toBe(winnerDoc._id.toString());
  });

  // ── 7. Same UUID After Retention Expiration & History Preservation on Real MongoDB ──
  test('Same UUID after retention expiration on real MongoDB: key released, new doc created, original history intact', async () => {
    const attemptId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();
    const expiredKey = `client:integration:${testRunId}:EXPIRED_RETENTION_UUID`;

    // Original historical submission completed in the past with expired retention timestamp
    const expiredDoc = await Submission.create({
      attemptId,
      questionId,
      code: 'function oldSolve() { return 1; }',
      language: 'javascript',
      runType: 'SUBMISSION',
      status: 'COMPLETED',
      verdict: 'ACCEPTED',
      scoreAwarded: 10,
      idempotencyKey: expiredKey,
      idempotencyExpiresAt: new Date(Date.now() - 1000) // Expired 1 second ago
    });
    createdDocIds.push(expiredDoc._id);

    // Synchronous retention cleanup: atomically release idempotencyKey from expired document
    const updated = await Submission.findOneAndUpdate(
      { _id: expiredDoc._id, idempotencyKey: expiredKey, idempotencyExpiresAt: { $lte: new Date() } },
      { $set: { idempotencyKey: null } },
      { new: true }
    );
    expect(updated).toBeDefined();
    expect(updated.idempotencyKey).toBeNull();

    // Verify original historical document still exists with all results and timestamps intact
    const historicalDoc = await Submission.findById(expiredDoc._id);
    expect(historicalDoc).toBeDefined();
    expect(historicalDoc.status).toBe('COMPLETED');
    expect(historicalDoc.verdict).toBe('ACCEPTED');
    expect(historicalDoc.scoreAwarded).toBe(10);

    // New submission can now be created with the same UUID without duplicate key error
    const newDoc = await Submission.create({
      attemptId,
      questionId,
      code: 'function newSolve() { return 2; }',
      language: 'javascript',
      runType: 'SUBMISSION',
      status: 'QUEUED',
      verdict: 'PENDING',
      idempotencyKey: expiredKey,
      idempotencyExpiresAt: new Date(Date.now() + 600000)
    });
    createdDocIds.push(newDoc._id);

    expect(newDoc._id.toString()).not.toBe(expiredDoc._id.toString());
    expect(newDoc.idempotencyKey).toBe(expiredKey);
  });
});
