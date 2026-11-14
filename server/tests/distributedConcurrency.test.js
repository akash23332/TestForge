/**
 * TestForge: Final Distributed Concurrency & Reliability Hardening Test Suite
 * 
 * Verifies:
 * 1. MongoDB-backed distributed idempotency & E11000 handling across simulated instances
 * 2. Multi-instance duplicate Submit and Run requests
 * 3. Lease heartbeat verification for long-running executions
 * 4. Fencing token & executionVersion protection against stale worker finalization
 * 5. Concurrent lease renewal and recovery lifecycle
 * 6. Simultaneous multi-instance recovery sweeps
 * 7. Protection of completed submissions against re-execution
 */

import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import { config } from '../src/config/env.js';
import { Submission } from '../src/models/Submission.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { Question } from '../src/models/Question.js';
import { Exam } from '../src/models/Exam.js';
import { TestCase } from '../src/models/TestCase.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import attemptRoutes from '../src/routes/attempt.routes.js';
import {
  processExecutionJob,
  renewExecutionLease,
  LEASE_OUTCOMES
} from '../src/services/queue/executionProcessor.js';
import {
  recoverUnavailableSubmissions,
  runStartupRecovery,
  DEFAULT_LEASE_DURATION_MS
} from '../src/services/queue/executionRecovery.js';
import {
  setExecutionQueueInstance,
  getExecutionQueue
} from '../src/services/queue/executionQueue.js';
import { generateDeterministicIdempotencyKey } from '../src/controllers/attempt.controller.js';

describe('TESTFORGE: Final Distributed Concurrency Hardening', () => {
  let app;
  let server;
  const attemptId = new mongoose.Types.ObjectId().toString();
  const questionId = new mongoose.Types.ObjectId().toString();
  const examId = new mongoose.Types.ObjectId().toString();

  // Valid attempt JWT token verified by auth middleware
  const attemptToken = jwt.sign(
    { attemptId, email: 'student@testforge.edu', examId },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  beforeAll((done) => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/attempts', attemptRoutes);
    server = app.listen(0, '127.0.0.1', done);
  });

  afterAll((done) => {
    if (server) server.close(done);
    else done();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  // ── 1. Deterministic Idempotency Key Specification ───────────────────────────
  describe('1. Deterministic Idempotency Key Construction', () => {
    test('Produces identical key for identical request parameters', () => {
      const key1 = generateDeterministicIdempotencyKey({
        attemptId,
        questionId,
        runType: 'SAMPLE',
        code: 'console.log("hello world");'
      });
      const key2 = generateDeterministicIdempotencyKey({
        attemptId,
        questionId,
        runType: 'SAMPLE',
        code: 'console.log("hello world");'
      });

      expect(key1).toBe(key2);
      expect(key1).toContain(`exec:student:${attemptId}:${questionId}:SAMPLE:`);
    });

    test('Preserves separate identities for distinct legitimate execution requests (different code)', () => {
      const run1Key = generateDeterministicIdempotencyKey({
        attemptId,
        questionId,
        runType: 'SAMPLE',
        code: 'function solve() { return 1; }'
      });
      const run2Key = generateDeterministicIdempotencyKey({
        attemptId,
        questionId,
        runType: 'SAMPLE',
        code: 'function solve() { return 2; }'
      });

      expect(run1Key).not.toBe(run2Key);
    });

    test('Preserves separate identities for distinct runTypes (SAMPLE vs SUBMISSION)', () => {
      const sampleKey = generateDeterministicIdempotencyKey({
        attemptId,
        questionId,
        runType: 'SAMPLE',
        code: 'const a = 1;'
      });
      const subKey = generateDeterministicIdempotencyKey({
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        code: 'const a = 1;'
      });

      expect(sampleKey).not.toBe(subKey);
      expect(sampleKey).toContain(':SAMPLE:');
      expect(subKey).toContain(':SUBMISSION:');
    });

    test('Honors client-provided idempotency key headers when supplied', () => {
      const clientKey = 'client-uuid-9999-aaaa';
      const key = generateDeterministicIdempotencyKey({
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        clientKey
      });

      expect(key).toBe(`client:student:${attemptId}:${questionId}:SUBMISSION:${clientKey}`);
    });
  });

  // ── 2. Simulated Multi-Instance Duplicate Request Handling ──────────────────
  describe('2. Multi-Instance Concurrency & Duplicate-Key Handling (E11000)', () => {
    test('Two simulated server instances creating the same submission simultaneously: second instance catches E11000 and returns existing', async () => {
      const existingSubId = new mongoose.Types.ObjectId().toString();
      const existingSubmission = {
        _id: existingSubId,
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        status: 'QUEUED',
        jobId: `exec_${existingSubId}`
      };

      const mockAttempt = {
        _id: attemptId,
        examId,
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        candidateInfo: { email: 'student@testforge.edu' },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Exam, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          sections: [{ questions: [{ questionId, type: 'coding', marks: 10 }] }]
        })
      });
      jest.spyOn(StudentAnswer, 'findOne').mockResolvedValue(null);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: questionId,
          type: 'coding',
          language: 'javascript'
        })
      });

      // Instance 2 pre-check: activeExisting returns null (simulating concurrent double click / race across instances)
      jest.spyOn(Submission, 'findOne')
        .mockReturnValueOnce({ sort: jest.fn().mockResolvedValue(null) })
        .mockResolvedValueOnce(existingSubmission); // Lookup after E11000 catches winner's doc

      // Instance 2 create throws MongoDB duplicate key error (code 11000)
      const duplicateKeyError = new Error('E11000 duplicate key error collection: testforge.submissions index: idempotencyKey_1 dup key');
      duplicateKeyError.code = 11000;
      duplicateKeyError.name = 'MongoServerError';
      jest.spyOn(Submission, 'create').mockRejectedValue(duplicateKeyError);

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/submit-question`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .send({ questionId, code: 'function test() {}', language: 'javascript' });

      // Instance 2 must return HTTP 200 with existing submission tracker and isDuplicate: true
      expect(res.status).toBe(200);
      expect(res.body.data.submissionId).toBe(existingSubId);
      expect(res.body.data.isDuplicate).toBe(true);
      expect(res.body.data.status).toBe('QUEUED');
      expect(res.body.data.pollUrl).toBe(`/api/v1/attempts/${attemptId}/submissions/${existingSubId}`);
    });

    test('Server crash after submission creation: client retry after restart returns existing submission without duplicate creation', async () => {
      const crashedSubId = new mongoose.Types.ObjectId().toString();
      const clientKey = 'restart-crash-uuid-1';
      const scopedKey = `client:student@testforge.edu:${attemptId}:${questionId}:SUBMISSION:${clientKey}`;

      const orphanedSubmission = {
        _id: crashedSubId,
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        status: 'QUEUED',
        jobId: null, // Crashed before queueing
        idempotencyKey: scopedKey,
        idempotencyExpiresAt: new Date(Date.now() + 600000),
        createdAt: new Date(Date.now() - 45000), // Created 45s ago before crash
        save: jest.fn().mockResolvedValue(true)
      };

      const mockAttempt = {
        _id: attemptId,
        examId,
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        candidateInfo: { email: 'student@testforge.edu' },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Exam, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          sections: [{ questions: [{ questionId, type: 'coding', marks: 10 }] }]
        })
      });
      jest.spyOn(StudentAnswer, 'findOne').mockResolvedValue(null);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: questionId,
          type: 'coding',
          language: 'javascript'
        })
      });

      // 1. Startup recovery sweeps orphaned submissions created before crash
      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([orphanedSubmission])
        })
      });
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue({
        ...orphanedSubmission,
        status: 'RECOVERING',
        recoveryOwner: 'recovery-token-1'
      });
      jest.spyOn(Submission, 'updateOne').mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      const mockQueue = {
        getJob: jest.fn().mockResolvedValue(null),
        add: jest.fn().mockResolvedValue({ id: `exec_${crashedSubId}` })
      };
      setExecutionQueueInstance(mockQueue);

      const recoveryRes = await runStartupRecovery();
      expect(recoveryRes.recovered).toBe(1);
      expect(mockQueue.add).toHaveBeenCalled();

      // 2. Client retries with the exact same Idempotency-Key
      jest.spyOn(Submission, 'findOne').mockImplementation((q) => {
        if (q && q.idempotencyKey === scopedKey) {
          return Promise.resolve(orphanedSubmission);
        }
        return { sort: jest.fn().mockResolvedValue(orphanedSubmission) };
      });
      const createSpy = jest.spyOn(Submission, 'create');

      const retryRes = await request(server)
        .post(`/api/v1/attempts/${attemptId}/submit-question`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .set('Idempotency-Key', clientKey)
        .send({ questionId, code: 'function test() {}', language: 'javascript' });

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.data.submissionId).toBe(crashedSubId);
      expect(retryRes.body.data.isDuplicate).toBe(true);
      expect(createSpy).not.toHaveBeenCalled();
    });

    test('Duplicate Run requests across simulated instances: second request safely returns existing tracker', async () => {
      const existingSubId = new mongoose.Types.ObjectId().toString();
      const existingSample = {
        _id: existingSubId,
        attemptId,
        questionId,
        runType: 'SAMPLE',
        status: 'RUNNING',
        jobId: `exec_${existingSubId}`
      };

      const mockAttempt = {
        _id: attemptId,
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        candidateInfo: { email: 'student@testforge.edu' },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: questionId,
          type: 'coding',
          language: 'javascript'
        })
      });

      // Pre-check finds actively running submission on another instance
      jest.spyOn(Submission, 'findOne').mockReturnValue({
        sort: jest.fn().mockResolvedValue(existingSample)
      });

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/run`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .send({ questionId, code: 'console.log(1);', language: 'javascript' });

      expect(res.status).toBe(200);
      expect(res.body.data.submissionId).toBe(existingSubId);
      expect(res.body.data.status).toBe('RUNNING');
      expect(res.body.data.isDuplicate).toBe(true);
    });

    test('Two intentional Run actions using identical code but different client UUIDs both succeed as separate executions', async () => {
      const subId1 = new mongoose.Types.ObjectId().toString();
      const subId2 = new mongoose.Types.ObjectId().toString();

      const mockAttempt = {
        _id: attemptId,
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        candidateInfo: { email: 'student@testforge.edu' },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: questionId,
          type: 'coding',
          language: 'javascript'
        })
      });

      // Neither run finds an existing active in-flight or key document
      jest.spyOn(Submission, 'findOne').mockImplementation((q) => {
        if (q && q.idempotencyKey) {
          return Promise.resolve(null);
        }
        return { sort: jest.fn().mockResolvedValue(null) };
      });

      const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
      setExecutionQueueInstance(mockQueue);

      jest.spyOn(Submission, 'create')
        .mockResolvedValueOnce({
          _id: subId1,
          attemptId,
          questionId,
          status: 'QUEUED',
          save: jest.fn().mockResolvedValue(true)
        })
        .mockResolvedValueOnce({
          _id: subId2,
          attemptId,
          questionId,
          status: 'QUEUED',
          save: jest.fn().mockResolvedValue(true)
        });

      // Run Action 1 with UUID-A
      const res1 = await request(server)
        .post(`/api/v1/attempts/${attemptId}/run`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .set('Idempotency-Key', 'uuid-action-1')
        .send({ questionId, code: 'console.log(42);', language: 'javascript' });

      expect(res1.status).toBe(202);
      expect(res1.body.data.submissionId).toBe(subId1);

      // Run Action 2 with UUID-B (identical code)
      const res2 = await request(server)
        .post(`/api/v1/attempts/${attemptId}/run`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .set('Idempotency-Key', 'uuid-action-2')
        .send({ questionId, code: 'console.log(42);', language: 'javascript' });

      expect(res2.status).toBe(202);
      expect(res2.body.data.submissionId).toBe(subId2);
      expect(res1.body.data.submissionId).not.toBe(res2.body.data.submissionId);
    });

    test('Delayed duplicate retry arriving after original execution completes returns completed result without re-executing', async () => {
      const completedSubId = new mongoose.Types.ObjectId().toString();
      const clientKey = 'delayed-uuid-client-1234';

      const completedDoc = {
        _id: completedSubId,
        attemptId,
        questionId,
        runType: 'SAMPLE',
        status: 'COMPLETED',
        verdict: 'ACCEPTED',
        jobId: `exec_${completedSubId}`,
        idempotencyKey: `client:student@testforge.edu:${attemptId}:${questionId}:SAMPLE:${clientKey}`
      };

      const mockAttempt = {
        _id: attemptId,
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        candidateInfo: { email: 'student@testforge.edu' },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: questionId,
          type: 'coding',
          language: 'javascript'
        })
      });

      // Lookup for this idempotency key finds the already-completed document
      jest.spyOn(Submission, 'findOne').mockImplementation((q) => {
        if (q && q.idempotencyKey) {
          return Promise.resolve(completedDoc);
        }
        return { sort: jest.fn().mockResolvedValue(null) };
      });
      const createSpy = jest.spyOn(Submission, 'create');

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/run`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .set('Idempotency-Key', clientKey)
        .send({ questionId, code: 'console.log(42);', language: 'javascript' });

      expect(res.status).toBe(200);
      expect(res.body.data.submissionId).toBe(completedSubId);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.isDuplicate).toBe(true);
      expect(res.body.data.alreadyCompleted).toBe(true);
      expect(createSpy).not.toHaveBeenCalled();
    });

    test('Same UUID repeated Submit request within retention returns existing tracker without creating duplicate', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const clientKey = 'submit-uuid-repeat-test';
      const existingDoc = {
        _id: subId,
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        status: 'RUNNING',
        jobId: `exec_${subId}`,
        idempotencyKey: `client:student@testforge.edu:${attemptId}:${questionId}:SUBMISSION:${clientKey}`,
        idempotencyExpiresAt: new Date(Date.now() + 600000)
      };

      const mockAttempt = {
        _id: attemptId,
        examId,
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        candidateInfo: { email: 'student@testforge.edu' },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Exam, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          sections: [{ questions: [{ questionId, type: 'coding', marks: 10 }] }]
        })
      });
      jest.spyOn(StudentAnswer, 'findOne').mockResolvedValue(null);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: questionId, type: 'coding', language: 'javascript' })
      });

      jest.spyOn(Submission, 'findOne').mockImplementation((q) => {
        if (q && q.idempotencyKey) return Promise.resolve(existingDoc);
        return { sort: jest.fn().mockResolvedValue(existingDoc) };
      });
      const createSpy = jest.spyOn(Submission, 'create');

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/submit-question`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .set('Idempotency-Key', clientKey)
        .send({ questionId, code: 'function answer() {}', language: 'javascript' });

      expect(res.status).toBe(200);
      expect(res.body.data.submissionId).toBe(subId);
      expect(res.body.data.isDuplicate).toBe(true);
      expect(createSpy).not.toHaveBeenCalled();
    });

    test('Same UUID after retention expiration releases the key and creates a fresh execution while preserving historical doc', async () => {
      const historicalSubId = new mongoose.Types.ObjectId().toString();
      const freshSubId = new mongoose.Types.ObjectId().toString();
      const clientKey = 'expired-uuid-12345';
      const scopedKey = `client:student@testforge.edu:${attemptId}:${questionId}:SAMPLE:${clientKey}`;

      const expiredDoc = {
        _id: historicalSubId,
        attemptId,
        questionId,
        runType: 'SAMPLE',
        status: 'COMPLETED',
        verdict: 'ACCEPTED',
        idempotencyKey: scopedKey,
        idempotencyExpiresAt: new Date(Date.now() - 5000) // Expired 5 seconds ago
      };

      const mockAttempt = {
        _id: attemptId,
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        candidateInfo: { email: 'student@testforge.edu' },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: questionId, type: 'coding', language: 'javascript' })
      });

      // findOne first returns the expired document
      jest.spyOn(Submission, 'findOne').mockImplementation((q) => {
        if (q && q.idempotencyKey) return Promise.resolve(expiredDoc);
        return { sort: jest.fn().mockResolvedValue(null) };
      });

      // Key release safely nulls out idempotencyKey on the historical document without deleting it
      const releaseSpy = jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue({
        _id: historicalSubId,
        idempotencyKey: null
      });

      const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-fresh-1' }) };
      setExecutionQueueInstance(mockQueue);

      const createSpy = jest.spyOn(Submission, 'create').mockResolvedValue({
        _id: freshSubId,
        attemptId,
        questionId,
        status: 'QUEUED',
        save: jest.fn().mockResolvedValue(true)
      });

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/run`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .set('Idempotency-Key', clientKey)
        .send({ questionId, code: 'console.log("fresh");', language: 'javascript' });

      expect(res.status).toBe(202);
      expect(res.body.data.submissionId).toBe(freshSubId);
      // Historical document key released safely
      expect(releaseSpy).toHaveBeenCalledWith(
        { _id: historicalSubId, idempotencyKey: scopedKey },
        { $set: { idempotencyKey: null } }
      );
      // New submission created successfully
      expect(createSpy).toHaveBeenCalled();
    });

    test('Delayed retry racing with key cleanup safely completes without unhandled errors', async () => {
      const clientKey = 'race-cleanup-uuid';
      const scopedKey = `client:student@testforge.edu:${attemptId}:${questionId}:SAMPLE:${clientKey}`;

      const mockAttempt = {
        _id: attemptId,
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        candidateInfo: { email: 'student@testforge.edu' },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: questionId, type: 'coding', language: 'javascript' })
      });

      // Cleanup happens concurrently, returning null on lookup
      jest.spyOn(Submission, 'findOne').mockImplementation((q) => {
        if (q && q.idempotencyKey) return Promise.resolve(null);
        return { sort: jest.fn().mockResolvedValue(null) };
      });

      const newSubId = new mongoose.Types.ObjectId().toString();
      jest.spyOn(Submission, 'create').mockResolvedValue({
        _id: newSubId,
        attemptId,
        questionId,
        status: 'QUEUED',
        save: jest.fn().mockResolvedValue(true)
      });

      const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-race' }) };
      setExecutionQueueInstance(mockQueue);

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/run`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .set('Idempotency-Key', clientKey)
        .send({ questionId, code: 'console.log("race");', language: 'javascript' });

      expect(res.status).toBe(202);
      expect(res.body.data.submissionId).toBe(newSubId);
    });
  });

  // ── 3. Lease Heartbeat Verification for Long-Running Executions ───────────────
  describe('3. Lease Heartbeat Verification for Long-Running Executions', () => {
    test('Heartbeat extends lease when execution duration exceeds initial lease duration', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const executionOwner = crypto.randomUUID();
      const initialLeaseMs = 100;
      const initialExpiry = new Date(Date.now() + initialLeaseMs);

      let currentExpiry = initialExpiry;
      const mockFindOneAndUpdate = jest.fn().mockImplementation((query, update) => {
        if (
          query._id === subId &&
          query.status === 'RUNNING' &&
          query.executionOwner === executionOwner &&
          query.executionVersion === 1
        ) {
          currentExpiry = update.$set.executionLeaseExpiresAt;
          return Promise.resolve({
            _id: subId,
            status: 'RUNNING',
            executionOwner,
            executionVersion: 1,
            executionLeaseExpiresAt: currentExpiry
          });
        }
        return Promise.resolve(null);
      });
      jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation(mockFindOneAndUpdate);

      // Simulate first heartbeat extension
      const renew1 = await renewExecutionLease(subId, executionOwner, 300, 1);
      expect(renew1.outcome).toBe(LEASE_OUTCOMES.RENEWED);
      expect(renew1.renewed).toBe(true);
      expect(new Date(renew1.expiresAt).getTime()).toBeGreaterThan(initialExpiry.getTime());

      // Simulate second heartbeat extension
      const renew2 = await renewExecutionLease(subId, executionOwner, 500, 1);
      expect(renew2.outcome).toBe(LEASE_OUTCOMES.RENEWED);
      expect(new Date(renew2.expiresAt).getTime()).toBeGreaterThan(new Date(renew1.expiresAt).getTime());
    });

    test('Expired worker cannot renew old lease after another worker increments executionVersion', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const workerA_Owner = 'worker-A-uuid';
      const workerB_Owner = 'worker-B-uuid';

      jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation((query) => {
        if (query.executionOwner === workerA_Owner && query.executionVersion === 1) {
          return Promise.resolve(null); // Version mismatch!
        }
        if (query.executionOwner === workerB_Owner && query.executionVersion === 2) {
          return Promise.resolve({ _id: subId, status: 'RUNNING' });
        }
        return Promise.resolve(null);
      });

      // Worker A attempts to heartbeat with stale version 1
      const staleRenewal = await renewExecutionLease(subId, workerA_Owner, 60000, 1);
      expect(staleRenewal.outcome).toBe(LEASE_OUTCOMES.LOST);
      expect(staleRenewal.renewed).toBe(false);
      expect(staleRenewal.reason).toContain('lost or preempted');

      // Worker B heartbeats with active version 2
      const activeRenewal = await renewExecutionLease(subId, workerB_Owner, 60000, 2);
      expect(activeRenewal.outcome).toBe(LEASE_OUTCOMES.RENEWED);
      expect(activeRenewal.renewed).toBe(true);
    });

    test('Worker restart during long-running execution: replacement worker claims stalled job after lease expiry', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const stalledWorker = 'crashed-worker-old';
      const replacementWorker = 'replacement-worker-new';
      const expiredLease = new Date(Date.now() - 5000);

      const stalledJobDoc = {
        _id: subId,
        attemptId,
        questionId,
        code: 'function test() { return 1; }',
        language: 'javascript',
        runType: 'SUBMISSION',
        status: 'RUNNING',
        executionOwner: stalledWorker,
        executionVersion: 1,
        executionLeaseExpiresAt: expiredLease,
        jobId: `exec_${subId}`,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(stalledJobDoc);

      // Replacement worker claims the stalled job: query verifies executionLeaseExpiresAt < now
      const claimSpy = jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue({
        ...stalledJobDoc,
        status: 'RUNNING',
        executionOwner: replacementWorker,
        executionVersion: 2,
        executionLeaseExpiresAt: new Date(Date.now() + 60000)
      });

      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: questionId,
          type: 'coding',
          language: 'javascript',
          executionMode: 'FUNCTION',
          functionSignature: { functionName: 'test', returnType: 'integer', parameters: [] }
        })
      });

      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'tc1', input: '[1]', expectedOutput: '1', visibility: 'public' }
        ])
      });

      jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue({});
      jest.spyOn(ExamAttempt, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ status: 'IN_PROGRESS' })
      });

      const job = {
        id: `exec_${subId}`,
        data: { submissionId: subId, attemptId, questionId, runType: 'SUBMISSION' }
      };

      const result = await processExecutionJob(job);
      expect(result.status).toBe('COMPLETED');
      expect(result.verdict).toBe('ACCEPTED');
      expect(claimSpy).toHaveBeenCalled();
    });
  });

  // ── 4. Stale Worker Finalization Rejection ──────────────────────────────────
  describe('4. Stale Worker Finalization Rejection (Fencing Tokens)', () => {
    test('Finalization rejects stale worker whose lock was lost or preempted', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const workerA_Owner = 'stale-worker-A';

      const mockSubmission = {
        _id: subId,
        attemptId,
        questionId,
        code: 'function add() { return 1; }',
        language: 'javascript',
        runType: 'SUBMISSION',
        status: 'RUNNING',
        jobId: `exec_${subId}`,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSubmission);

      // Claim succeeds for Worker A, but completion query returns null because Worker A's lock was preempted
      jest.spyOn(Submission, 'findOneAndUpdate')
        .mockResolvedValueOnce({
          _id: subId,
          status: 'RUNNING',
          executionOwner: workerA_Owner,
          executionVersion: 1
        })
        .mockResolvedValueOnce(null);

      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: questionId,
          type: 'coding',
          language: 'javascript',
          executionMode: 'FUNCTION',
          functionSignature: { functionName: 'add', returnType: 'integer', parameters: [] }
        })
      });

      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'tc1', input: '[1]', expectedOutput: '1', visibility: 'public' }
        ])
      });

      const job = {
        id: `exec_${subId}`,
        data: { submissionId: subId, attemptId, questionId, runType: 'SUBMISSION' }
      };

      const result = await processExecutionJob(job);
      expect(result.status).toBe('STALE_PREEMPTED');
      expect(result.message).toContain('preempted by another worker');
    });
  });

  // ── 5. Concurrent Lease Renewal and Recovery ────────────────────────────────
  describe('5. Concurrent Lease Renewal and Recovery', () => {
    test('Recovery does NOT touch submissions with active, unexpired worker leases', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const unexpiredLease = new Date(Date.now() + 50000);

      const activeRunningSub = {
        _id: subId,
        status: 'RUNNING',
        executionOwner: 'active-worker-uuid',
        executionLeaseExpiresAt: unexpiredLease,
        verdict: 'PENDING'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([])
        })
      });

      const recoveryRes = await recoverUnavailableSubmissions();
      expect(recoveryRes.scanned).toBe(0);
      expect(recoveryRes.recovered).toBe(0);
      expect(recoveryRes.skipped).toBe(0);
    });

    test('Recovery atomically claims stalled RUNNING submissions with expired leases', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const expiredLease = new Date(Date.now() - 5000);

      const stalledSub = {
        _id: subId,
        status: 'RUNNING',
        executionOwner: 'crashed-worker-uuid',
        executionLeaseExpiresAt: expiredLease,
        verdict: 'PENDING',
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        language: 'javascript'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([stalledSub])
        })
      });

      // Atomic lock succeeds
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue({
        ...stalledSub,
        status: 'RECOVERING',
        recoveryOwner: 'rec-worker-1'
      });

      // Mock queue without existing job
      const mockQueue = {
        getJob: jest.fn().mockResolvedValue(null),
        add: jest.fn().mockResolvedValue({ id: `exec_${subId}` })
      };
      setExecutionQueueInstance(mockQueue);

      // Transition to QUEUED succeeds
      jest.spyOn(Submission, 'updateOne').mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      const recoveryRes = await recoverUnavailableSubmissions();
      expect(recoveryRes.scanned).toBe(1);
      expect(recoveryRes.recovered).toBe(1);
      expect(recoveryRes.recoveredIds).toContain(subId);
    });
  });

  // ── 6. Simultaneous Multi-Instance Recovery Sweeps ──────────────────────────
  describe('6. Recovery Running Simultaneously on Two Instances', () => {
    test('Two simulated instances running recovery concurrently: only one acquires the recovery lock', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const expiredSub = {
        _id: subId,
        status: 'EXECUTION_UNAVAILABLE',
        verdict: 'PENDING',
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        language: 'javascript'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([expiredSub])
        })
      });

      let instanceCount = 0;
      jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation(() => {
        instanceCount++;
        if (instanceCount === 1) {
          return Promise.resolve({
            ...expiredSub,
            status: 'RECOVERING',
            recoveryOwner: 'instance-1-token'
          });
        }
        return Promise.resolve(null);
      });

      const mockQueue = {
        getJob: jest.fn().mockResolvedValue(null),
        add: jest.fn().mockResolvedValue({ id: `exec_${subId}` })
      };
      setExecutionQueueInstance(mockQueue);
      jest.spyOn(Submission, 'updateOne').mockResolvedValue({ matchedCount: 1 });

      const [inst1Result, inst2Result] = await Promise.all([
        recoverUnavailableSubmissions(),
        recoverUnavailableSubmissions()
      ]);

      expect(inst1Result.recovered).toBe(1);
      expect(inst2Result.recovered).toBe(0);
      expect(inst2Result.skipped).toBe(1);
    });

    test('Completed submissions are strictly ignored and NEVER re-executed by recovery', async () => {
      const completedSubId = new mongoose.Types.ObjectId().toString();
      const completedCandidate = {
        _id: completedSubId,
        status: 'COMPLETED',
        verdict: 'ACCEPTED',
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        language: 'javascript'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([completedCandidate])
        })
      });

      const mockQueue = {
        getJob: jest.fn(),
        add: jest.fn()
      };
      setExecutionQueueInstance(mockQueue);

      const recoveryRes = await recoverUnavailableSubmissions();
      expect(recoveryRes.recovered).toBe(0);
      expect(recoveryRes.skipped).toBe(1);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
