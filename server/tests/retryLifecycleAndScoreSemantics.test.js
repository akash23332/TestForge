import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { processExecutionJob } from '../src/services/queue/executionProcessor.js';
import { recoverUnavailableSubmissions } from '../src/services/queue/executionRecovery.js';
import { getExecutionQueue, enqueueExecutionJob } from '../src/services/queue/executionQueue.js';
import { recalculateAttemptGrading } from '../src/services/attemptGrading.service.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import { RenderSandboxProvider } from '../src/services/execution/RenderSandboxProvider.js';
import { LocalExecutionProvider } from '../src/services/execution/LocalExecutionProvider.js';
import { Submission } from '../src/models/Submission.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import * as attemptController from '../src/controllers/attempt.controller.js';
import { config } from '../src/config/env.js';

describe('Phase 4S: Exam Finalization Integrity, BullMQ Recovery & Production Audit', () => {
  let mockProvider;

  beforeEach(() => {
    mockProvider = providerRegistry.getProvider('mock');
    mockProvider.reset();
  });

  afterEach(() => {
    mockProvider.reset();
    jest.restoreAllMocks();
  });

  // ── 1. Exam Finalization with Pending / Provisional Grading ───────────────
  describe('Exam Finalization Integrity (No False or Inflated Percentages)', () => {
    test('One unavailable coding question among graded questions marks attempt PROVISIONAL with percentage: null', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const q1Id = new mongoose.Types.ObjectId(); // Graded MCQ (10/10)
      const q2Id = new mongoose.Types.ObjectId(); // Coding with runner offline (EXECUTION_UNAVAILABLE)

      const mockAttempt = {
        _id: attemptId,
        status: 'IN_PROGRESS',
        totalScore: 0,
        maxScore: 20,
        percentage: null,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);

      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: q1Id, score: 10, maxMarks: 10, status: 'SUBMITTED', questionType: 'mcq' },
          { questionId: q2Id, score: 0, maxMarks: 10, status: 'SAVED', questionType: 'coding' }
        ])
      });

      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { questionId: q2Id, status: 'EXECUTION_UNAVAILABLE' }
          ])
        })
      });

      const req = { params: { attemptId: attemptId.toString() } };
      let responsePayload = null;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockImplementation((p) => {
          responsePayload = p;
          return res;
        })
      };

      await attemptController.finalizeExam(req, res, jest.fn());

      expect(responsePayload.success).toBe(true);
      expect(responsePayload.data.isProvisional).toBe(true);
      expect(responsePayload.data.gradingStatus).toBe('PROVISIONAL');
      // Crucial: Final percentage MUST NOT be published or inflated to 100%! It must be null!
      expect(responsePayload.data.percentage).toBeNull();
      expect(responsePayload.data.totalScore).toBe(10);
      expect(responsePayload.data.finalizedMaxScore).toBe(10);
      expect(responsePayload.data.pendingMaxScore).toBe(10);
      expect(responsePayload.data.pendingQuestionsCount).toBe(1);
    });

    test('Multiple unavailable questions return correct pending count and withheld percentage', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const q1Id = new mongoose.Types.ObjectId();
      const q2Id = new mongoose.Types.ObjectId();
      const q3Id = new mongoose.Types.ObjectId();

      const mockAttempt = {
        _id: attemptId,
        status: 'IN_PROGRESS',
        totalScore: 0,
        maxScore: 30,
        percentage: null,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);

      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: q1Id, score: 5, maxMarks: 10, status: 'SUBMITTED', questionType: 'mcq' },
          { questionId: q2Id, score: 0, maxMarks: 10, status: 'SAVED', questionType: 'coding' },
          { questionId: q3Id, score: 0, maxMarks: 10, status: 'SAVED', questionType: 'coding' }
        ])
      });

      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { questionId: q2Id, status: 'EXECUTION_UNAVAILABLE' },
            { questionId: q3Id, status: 'EXECUTION_UNAVAILABLE' }
          ])
        })
      });

      const updated = await recalculateAttemptGrading(attemptId);

      expect(updated.isProvisional).toBe(true);
      expect(updated.gradingStatus).toBe('PROVISIONAL');
      expect(updated.percentage).toBeNull();
      expect(updated.pendingQuestionsCount).toBe(2);
      expect(updated.pendingMaxScore).toBe(20);
      expect(updated.finalizedMaxScore).toBe(10);
      expect(updated.totalScore).toBe(5);
    });

    test('All questions graded: publishes finalized result with true percentage against full maxScore', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const q1Id = new mongoose.Types.ObjectId();
      const q2Id = new mongoose.Types.ObjectId();

      const mockAttempt = {
        _id: attemptId,
        status: 'SUBMITTED',
        totalScore: 0,
        maxScore: 20,
        percentage: null,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);

      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: q1Id, score: 10, maxMarks: 10, status: 'SUBMITTED', questionType: 'mcq' },
          { questionId: q2Id, score: 8, maxMarks: 10, status: 'SUBMITTED', questionType: 'coding' }
        ])
      });

      // No pending submissions remain
      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });

      const updated = await recalculateAttemptGrading(attemptId);

      expect(updated.isProvisional).toBe(false);
      expect(updated.gradingStatus).toBe('FINALIZED');
      expect(updated.totalScore).toBe(18);
      expect(updated.maxScore).toBe(20);
      expect(updated.percentage).toBe(90); // 18 / 20 = 90%
      expect(updated.pendingQuestionsCount).toBe(0);
      expect(updated.pendingMaxScore).toBe(0);
    });

    test('Runner recovery followed by worker execution automatically finalizes the exam attempt', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const qId = new mongoose.Types.ObjectId();
      const subId = new mongoose.Types.ObjectId();

      const mockAttempt = {
        _id: attemptId,
        status: 'SUBMITTED',
        totalScore: 0,
        maxScore: 10,
        percentage: null,
        isProvisional: true,
        gradingStatus: 'PROVISIONAL',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockSub = {
        _id: subId,
        attemptId,
        questionId: qId,
        code: 'return 42;',
        language: 'javascript',
        status: 'QUEUED',
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: qId, title: 'Sample', language: 'javascript' })
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: new mongoose.Types.ObjectId(), input: '1', expectedOutput: '42' }])
      });
      jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue({});

      // Submissions lookup in recalculateAttemptGrading: no more pending submissions
      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });
      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: qId, score: 10, maxMarks: 10, status: 'SUBMITTED', questionType: 'coding' }
        ])
      });

      // Runner is online and executes successfully
      mockProvider.setHandler(() => ({
        status: 'success',
        output: '42',
        error: null,
        runtimeMs: 15
      }));

      const job = {
        id: `exec_${subId}`,
        data: { submissionId: subId, attemptId, questionId: qId, runType: 'SUBMISSION' }
      };

      const result = await processExecutionJob(job);

      expect(result.status).toBe('COMPLETED');
      expect(result.scoreAwarded).toBe(10);

      // Attempt was automatically updated and transitioned to FINALIZED!
      expect(mockAttempt.gradingStatus).toBe('FINALIZED');
      expect(mockAttempt.isProvisional).toBe(false);
      expect(mockAttempt.percentage).toBe(100);
      expect(mockAttempt.totalScore).toBe(10);
    });
  });

  // ── 2. BullMQ Deterministic Job-ID Recovery & Concurrency ──────────────────
  describe('BullMQ Deterministic Job-ID Recovery Lifecycle', () => {
    test('Retained failed job in Redis uses job.retry to reset attemptsMade and requeue', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        status: 'EXECUTION_UNAVAILABLE',
        verdict: 'PENDING',
        runType: 'SUBMISSION',
        language: 'python'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([mockSub])
        })
      });

      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockSub);
      jest.spyOn(Submission, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

      const mockBullJob = {
        id: `exec_${subId}`,
        getState: jest.fn().mockResolvedValue('failed'),
        retry: jest.fn().mockResolvedValue(true)
      };

      const queue = getExecutionQueue();
      queue.getJob = jest.fn().mockResolvedValue(mockBullJob);

      const result = await recoverUnavailableSubmissions({ submissionId: subId });

      expect(result.recovered).toBe(1);
      expect(queue.getJob).toHaveBeenCalledWith(`exec_${subId}`);
      expect(mockBullJob.getState).toHaveBeenCalled();
      expect(mockBullJob.retry).toHaveBeenCalledWith('failed', { resetAttemptsMade: true });
    });

    test('Recovery after failed job retention expired creates fresh job with deterministic ID', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        status: 'EXECUTION_UNAVAILABLE',
        verdict: 'PENDING',
        attemptId: new mongoose.Types.ObjectId(),
        questionId: new mongoose.Types.ObjectId(),
        runType: 'SUBMISSION',
        language: 'python'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([mockSub])
        })
      });

      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockSub);
      jest.spyOn(Submission, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

      const queue = getExecutionQueue();
      queue.getJob = jest.fn().mockResolvedValue(null); // Evicted from Redis
      queue.add = jest.fn().mockResolvedValue({ id: `exec_${subId}` });

      const result = await recoverUnavailableSubmissions({ submissionId: subId });

      expect(result.recovered).toBe(1);
      expect(queue.add).toHaveBeenCalled();
    });

    test('Concurrent recovery requests: atomic lock ensures exactly one worker acquires document', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        attemptId: new mongoose.Types.ObjectId(),
        questionId: new mongoose.Types.ObjectId(),
        status: 'EXECUTION_UNAVAILABLE',
        verdict: 'PENDING'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([mockSub])
        })
      });

      // First call acquires atomic lock; second call returns null (already claimed)
      let acquireCount = 0;
      jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation(async () => {
        acquireCount++;
        return acquireCount === 1 ? mockSub : null;
      });
      jest.spyOn(Submission, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

      const queue = getExecutionQueue();
      queue.getJob = jest.fn().mockResolvedValue(null);
      queue.add = jest.fn().mockResolvedValue({ id: `exec_${subId}` });

      // Run two recovery workers concurrently
      const [worker1Result, worker2Result] = await Promise.all([
        recoverUnavailableSubmissions({ submissionId: subId }),
        recoverUnavailableSubmissions({ submissionId: subId })
      ]);

      expect(worker1Result.recovered).toBe(1);
      expect(worker2Result.recovered).toBe(0);
      expect(worker2Result.skipped).toBe(1);
    });

    test('Never retries an active job currently processing in worker', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        status: 'EXECUTION_UNAVAILABLE',
        verdict: 'PENDING'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([mockSub])
        })
      });

      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockSub);
      const updateSpy = jest.spyOn(Submission, 'updateOne').mockResolvedValue({});

      const mockActiveJob = {
        id: `exec_${subId}`,
        getState: jest.fn().mockResolvedValue('active'),
        retry: jest.fn()
      };

      const queue = getExecutionQueue();
      queue.getJob = jest.fn().mockResolvedValue(mockActiveJob);

      const result = await recoverUnavailableSubmissions({ submissionId: subId });

      expect(result.recovered).toBe(0);
      expect(result.skipped).toBe(1);
      expect(mockActiveJob.retry).not.toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalledWith(
        { _id: subId, status: 'RECOVERING' },
        expect.objectContaining({ $set: expect.objectContaining({ status: 'RUNNING' }) })
      );
    });

    test('Redis unavailable during recovery safely reverts status to EXECUTION_UNAVAILABLE', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        status: 'EXECUTION_UNAVAILABLE',
        verdict: 'PENDING'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([mockSub])
        })
      });

      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockSub);
      const updateSpy = jest.spyOn(Submission, 'updateOne').mockResolvedValue({});

      const queue = getExecutionQueue();
      queue.getJob = jest.fn().mockRejectedValue(new Error('Redis connection lost (ECONNREFUSED)'));

      const result = await recoverUnavailableSubmissions({ submissionId: subId });

      expect(result.recovered).toBe(0);
      expect(result.errors).toBe(1);

      // Submission status was safely reverted to EXECUTION_UNAVAILABLE, NEVER left in QUEUED!
      expect(updateSpy).toHaveBeenCalledWith(
        { _id: subId, status: 'RECOVERING' },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'EXECUTION_UNAVAILABLE' })
        })
      );
    });
  });

  // ── 3. Production Grading Path Security Audit ──────────────────────────────
  describe('Production Execution Security Audit', () => {
    test('LocalExecutionProvider constructor and executeCode throw fail-closed error if called in production', async () => {
      // 1. Constructor throws if called directly in production
      process.env.NODE_ENV = 'production';
      expect(() => new LocalExecutionProvider({ allowLocalExecution: true })).toThrow(/Execution via host processes is forbidden in production/i);

      // 2. executeCode fails closed if environment switches to production
      process.env.NODE_ENV = 'test';
      const provider = new LocalExecutionProvider({ allowLocalExecution: true });
      process.env.NODE_ENV = 'production';

      const result = await provider.executeCode({
        language: 'python',
        code: 'print(1)',
        inputArgs: []
      });

      expect(result.status).toBe('internal_error');
      expect(result.error).toMatch(/Execution via host processes is strictly forbidden in production/i);
      process.env.NODE_ENV = 'test';
    });

    test('RenderSandboxProvider strictly rejects private endpoints if proxy is missing', async () => {
      const provider = new RenderSandboxProvider({
        endpoint: 'http://runner.tailnet.ts.net:2358',
        apiKey: 'token'
      });

      await expect(provider.executeCode({
        language: 'python',
        code: 'print(1)'
      })).rejects.toThrow(/Private endpoint requires an active proxy/i);
    });
  });
});
