import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { config } from '../src/config/env.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import {
  getExecutionQueue,
  enqueueExecutionJob,
  setExecutionQueueInstance,
  getRedisOfflineStatus,
  setRedisOfflineStatus
} from '../src/services/queue/executionQueue.js';
import { processExecutionJob } from '../src/services/queue/executionProcessor.js';
import { Submission } from '../src/models/Submission.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { User } from '../src/models/User.js';
import { Exam } from '../src/models/Exam.js';

describe('TestForge Reliability, Concurrency & Redis-Offline Audit', () => {
  const jwtSecret = config.jwt.secret || 'test_secret_for_jwt_tokens_min_32_chars';
  const studentId = new mongoose.Types.ObjectId().toString();
  const attemptId = new mongoose.Types.ObjectId().toString();
  const questionId = new mongoose.Types.ObjectId().toString();

  const attemptToken = jwt.sign(
    { attemptId, email: 'student@testforge.edu', examId: 'exam_audit_123' },
    jwtSecret,
    { expiresIn: '2h' }
  );

  let server;

  beforeAll((done) => {
    server = app.listen(0, '127.0.0.1', done);
  });

  afterAll((done) => {
    if (server) server.close(done);
    else done();
  });

  beforeEach(() => {
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: studentId,
        name: 'Audit Student',
        email: 'student@testforge.edu',
        role: 'student'
      })
    });
    jest.spyOn(StudentAnswer, 'findOne').mockResolvedValue(null);
    jest.spyOn(Exam, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });
    setRedisOfflineStatus(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setExecutionQueueInstance(null);
    setRedisOfflineStatus(false);
  });

  // ── 1. Redis Unavailable: Dev Fallback vs Production Fail-Closed ────────────
  describe('1. Redis Unavailable: Dev Fallback vs Production Fail-Closed', () => {
    test('Development: seamlessly falls back to asynchronous in-memory execution when Redis is offline', async () => {
      const origEnv = config.env;
      try {
        config.env = 'development';
        setRedisOfflineStatus(true);

        const subId = new mongoose.Types.ObjectId().toString();
        jest.spyOn(Submission, 'findById').mockResolvedValue({
          _id: subId,
          status: 'COMPLETED',
          verdict: 'ACCEPTED'
        });
        const mockQueue = { add: jest.fn() };
        setExecutionQueueInstance(mockQueue);

        const job = await enqueueExecutionJob({
          submissionId: subId,
          attemptId,
          questionId,
          runType: 'SAMPLE',
          language: 'python',
          studentEmail: 'student@testforge.edu'
        });

        expect(job).toBeDefined();
        expect(job.id).toBe(`exec_${subId}`);
        // queue.add should NOT have been called because Redis is offline
        expect(mockQueue.add).not.toHaveBeenCalled();
      } finally {
        config.env = origEnv;
      }
    });

    test('Production: FAILS CLOSED and throws error when Redis is offline (no silent in-memory fallback)', async () => {
      const origEnv = config.env;
      try {
        config.env = 'production';
        setRedisOfflineStatus(true);

        const subId = new mongoose.Types.ObjectId().toString();
        jest.spyOn(Submission, 'findById').mockResolvedValue({
          _id: subId,
          status: 'COMPLETED',
          verdict: 'ACCEPTED'
        });
        const mockQueue = { add: jest.fn() };
        setExecutionQueueInstance(mockQueue);

        await expect(
          enqueueExecutionJob({
            submissionId: subId,
            attemptId,
            questionId,
            runType: 'SUBMISSION',
            language: 'javascript',
            studentEmail: 'student@testforge.edu'
          })
        ).rejects.toThrow(/FAIL-CLOSED.*offline in production/i);

        expect(mockQueue.add).not.toHaveBeenCalled();
      } finally {
        config.env = origEnv;
      }
    });
  });

  // ── 2. Redis Reconnection During Fallback ──────────────────────────────────
  describe('2. Redis Reconnection During Fallback', () => {
    test('Safely restores normal BullMQ enqueueing when Redis reconnects', async () => {
      const origEnv = config.env;
      try {
        config.env = 'development';

        // Stage 1: Redis is offline
        setRedisOfflineStatus(true);
        expect(getRedisOfflineStatus()).toBe(true);

        const sub1 = new mongoose.Types.ObjectId().toString();
        const mockQueue = { add: jest.fn().mockResolvedValue({ id: `exec_${sub1}` }) };
        setExecutionQueueInstance(mockQueue);

        await enqueueExecutionJob({
          submissionId: sub1,
          attemptId,
          questionId,
          runType: 'SAMPLE'
        });
        expect(mockQueue.add).not.toHaveBeenCalled();

        // Stage 2: Redis reconnects (reconnection event triggers status update)
        setRedisOfflineStatus(false);
        expect(getRedisOfflineStatus()).toBe(false);

        const sub2 = new mongoose.Types.ObjectId().toString();
        mockQueue.add.mockResolvedValueOnce({ id: `exec_${sub2}` });

        await enqueueExecutionJob({
          submissionId: sub2,
          attemptId,
          questionId,
          runType: 'SAMPLE'
        });

        // Now queue.add is used normally
        expect(mockQueue.add).toHaveBeenCalledTimes(1);
        expect(mockQueue.add.mock.calls[0][1].submissionId).toBe(sub2);
      } finally {
        config.env = origEnv;
      }
    });
  });

  // ── 3. BullMQ Worker Active During Watchdog Check ──────────────────────────
  describe('3. BullMQ Worker Active During Watchdog Check', () => {
    test('Watchdog does not re-execute or overwrite if BullMQ worker already claimed the job', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const mockSubmissionDoc = {
        _id: subId,
        attemptId,
        questionId,
        status: 'RUNNING',
        executionOwner: 'bullmq-worker-uuid-1234',
        executionLeaseExpiresAt: new Date(Date.now() + 60000),
        save: jest.fn()
      };

      // When the watchdog queries MongoDB, it sees the worker has already claimed it
      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSubmissionDoc);

      const job = {
        id: `exec_${subId}`,
        data: {
          submissionId: subId,
          attemptId,
          questionId,
          runType: 'SAMPLE',
          language: 'python'
        }
      };

      // Attempting to run processExecutionJob on an already claimed submission
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(null);

      const result = await processExecutionJob(job);
      expect(result.alreadyClaimed).toBe(true);
      expect(result.status).toBe('RUNNING');
      expect(result.message).toMatch(/already actively running or claimed/i);
    });
  });

  // ── 4. Two Simultaneous Requests (Concurrency Lock) ────────────────────────
  describe('4. Two Simultaneous Requests (Concurrency Lock)', () => {
    test('Simultaneous duplicate requests return existing tracker without creating duplicate submissions', async () => {
      const mockAttempt = {
        _id: attemptId,
        candidateEmail: 'student@testforge.edu',
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        save: jest.fn().mockResolvedValue(true)
      };

      const existingSubId = new mongoose.Types.ObjectId().toString();
      const existingSubmission = {
        _id: existingSubId,
        attemptId,
        questionId,
        runType: 'SAMPLE',
        status: 'QUEUED',
        jobId: `exec_${existingSubId}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: questionId,
          title: 'Two Sum',
          type: 'coding',
          language: 'javascript'
        })
      });

      // Mock findOne: first request gets existing active tracker
      jest.spyOn(Submission, 'findOne').mockReturnValue({
        sort: jest.fn().mockResolvedValue(existingSubmission)
      });

      const createSpy = jest.spyOn(Submission, 'create');

      // Send two concurrent requests
      const [res1, res2] = await Promise.all([
        request(server)
          .post(`/api/v1/attempts/${attemptId}/run`)
          .set('Authorization', `Bearer ${attemptToken}`)
          .send({ questionId, code: 'function twoSum() {}', language: 'javascript' }),
        request(server)
          .post(`/api/v1/attempts/${attemptId}/run`)
          .set('Authorization', `Bearer ${attemptToken}`)
          .send({ questionId, code: 'function twoSum() {}', language: 'javascript' })
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.data.submissionId).toBe(existingSubId);
      expect(res2.body.data.submissionId).toBe(existingSubId);
      expect(res1.body.data.isDuplicate).toBe(true);
      expect(res2.body.data.isDuplicate).toBe(true);
      // Zero duplicate submissions created in DB
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  // ── 5. Duplicate Submission Requests ──────────────────────────────────────
  describe('5. Duplicate Submission Requests', () => {
    test('Submitting code while already RUNNING returns active submission with 200 and isDuplicate: true', async () => {
      const mockAttempt = {
        _id: attemptId,
        candidateEmail: 'student@testforge.edu',
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        save: jest.fn().mockResolvedValue(true)
      };

      const activeSubId = new mongoose.Types.ObjectId().toString();
      const activeSubmission = {
        _id: activeSubId,
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        status: 'RUNNING',
        jobId: `exec_${activeSubId}`,
        executionLeaseExpiresAt: new Date(Date.now() + 45000), // active unexpired lease
        createdAt: new Date(),
        updatedAt: new Date()
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: questionId,
          title: 'Palindrome',
          type: 'coding',
          language: 'javascript'
        })
      });

      jest.spyOn(Submission, 'findOne').mockReturnValue({
        sort: jest.fn().mockResolvedValue(activeSubmission)
      });

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/submit-question`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .send({ questionId, code: 'function isPalindrome() { return true; }', language: 'javascript' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.submissionId).toBe(activeSubId);
      expect(res.body.data.status).toBe('RUNNING');
      expect(res.body.data.isDuplicate).toBe(true);
    });
  });

  // ── 6. Long-Running Execution (> 20s) ──────────────────────────────────────
  describe('6. Long-Running Execution Not Incorrectly Superseded', () => {
    test('Active execution running for 25s with valid lease is NOT superseded', async () => {
      const mockAttempt = {
        _id: attemptId,
        candidateEmail: 'student@testforge.edu',
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        save: jest.fn().mockResolvedValue(true)
      };

      const longRunningSubId = new mongoose.Types.ObjectId().toString();
      const longRunningSubmission = {
        _id: longRunningSubId,
        attemptId,
        questionId,
        runType: 'SAMPLE',
        status: 'RUNNING',
        jobId: `exec_${longRunningSubId}`,
        createdAt: new Date(Date.now() - 25000), // Created 25s ago
        executionLeaseExpiresAt: new Date(Date.now() + 35000) // Active heartbeat lease valid for 35 more seconds!
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: questionId,
          title: 'Heavy Matrix Multiplication',
          type: 'coding',
          language: 'cpp'
        })
      });

      // findOne returns the active submission based on executionLeaseExpiresAt > now
      jest.spyOn(Submission, 'findOne').mockImplementation((query) => {
        // Query must match the active lease
        if (query.$or) {
          return {
            sort: jest.fn().mockResolvedValue(longRunningSubmission)
          };
        }
        return { sort: jest.fn().mockResolvedValue(null) };
      });

      const createSpy = jest.spyOn(Submission, 'create');

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/run`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .send({ questionId, code: '// long running code', language: 'cpp' });

      expect(res.status).toBe(200);
      expect(res.body.data.submissionId).toBe(longRunningSubId);
      expect(res.body.data.status).toBe('RUNNING');
      expect(res.body.data.isDuplicate).toBe(true);
      // Confirmed: did NOT incorrectly supersede by creating a new submission
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  // ── 7. Worker Crash and Stalled Lease Recovery ─────────────────────────────
  describe('7. Worker Crash and Stalled Lease Recovery', () => {
    test('Worker crash with expired lease is safely claimed for replacement execution', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const crashedWorkerSubmission = {
        _id: subId,
        code: 'function test() { return 1; }',
        language: 'javascript',
        status: 'RUNNING',
        executionOwner: 'crashed-worker-uuid-old',
        executionLeaseExpiresAt: new Date(Date.now() - 10000), // Expired 10s ago (crashed worker)
        save: jest.fn()
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(crashedWorkerSubmission);

      // findOneAndUpdate successfully matches stalled RUNNING with executionLeaseExpiresAt < now
      const newExecutionOwner = 'new-worker-uuid-recovered';
      const claimedDoc = {
        ...crashedWorkerSubmission,
        status: 'RUNNING',
        executionOwner: newExecutionOwner,
        executionVersion: 2
      };

      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(claimedDoc);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: questionId, maxMarks: 10 })
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: 'tc1', isHidden: false, input: '1', expectedOutput: '1' }])
      });

      const mockProvider = providerRegistry.getProvider('mock');
      mockProvider.setHandler(() => ({
        status: 'success',
        output: '1',
        runtimeMs: 10
      }));

      const job = {
        id: `exec_${subId}`,
        data: {
          submissionId: subId,
          attemptId,
          questionId,
          runType: 'SAMPLE',
          language: 'javascript'
        }
      };

      const result = await processExecutionJob(job);
      expect(result.status).toBe('COMPLETED');
      expect(result.verdict).toBe('ACCEPTED');
    });
  });

  // ── 8. Server Restart During Execution (Stale QUEUED Sweep) ─────────────────
  describe('8. Server Restart During Execution (Stale QUEUED Sweep)', () => {
    test('Dead orphaned QUEUED submission (> 30s) is superseded after server restart', async () => {
      const mockAttempt = {
        _id: attemptId,
        candidateEmail: 'student@testforge.edu',
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        save: jest.fn().mockResolvedValue(true)
      };

      const freshSubId = new mongoose.Types.ObjectId().toString();

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: questionId,
          title: 'Sample',
          type: 'coding',
          language: 'javascript'
        })
      });

      // Simulated query behavior: activeExisting returns null because createdAt was 45s ago (exceeded 30s grace)
      jest.spyOn(Submission, 'findOne').mockImplementation((q) => {
        if (q && q.idempotencyKey) {
          return Promise.resolve(null);
        }
        return { sort: jest.fn().mockResolvedValue(null) };
      });

      const mockNewSubmission = {
        _id: freshSubId,
        attemptId,
        questionId,
        code: 'function test() {}',
        language: 'javascript',
        runType: 'SAMPLE',
        status: 'QUEUED',
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Submission, 'create').mockResolvedValue(mockNewSubmission);

      const mockQueue = { add: jest.fn().mockResolvedValue({ id: `exec_${freshSubId}` }) };
      setExecutionQueueInstance(mockQueue);

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/run`)
        .set('Authorization', `Bearer ${attemptToken}`)
        .send({ questionId, code: 'function test() {}', language: 'javascript' });

      expect(res.status).toBe(202);
      expect(res.body.data.submissionId).toBe(freshSubId);
      expect(res.body.data.status).toBe('QUEUED');
      expect(res.body.data.isDuplicate).toBeUndefined();
    });
  });

  // ── 9. Idempotent Result Persistence ───────────────────────────────────────
  describe('9. Idempotent Result Persistence', () => {
    test('Already COMPLETED submission is not re-executed or re-written', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const completedDoc = {
        _id: subId,
        status: 'COMPLETED',
        verdict: 'ACCEPTED',
        passedTests: 3,
        totalTests: 3,
        save: jest.fn()
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(completedDoc);
      const updateSpy = jest.spyOn(Submission, 'findOneAndUpdate');

      const job = {
        id: `exec_${subId}`,
        data: {
          submissionId: subId,
          attemptId,
          questionId,
          runType: 'SUBMISSION',
          language: 'javascript'
        }
      };

      const result = await processExecutionJob(job);

      expect(result.alreadyCompleted).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(result.verdict).toBe('ACCEPTED');
      expect(completedDoc.save).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });
});
