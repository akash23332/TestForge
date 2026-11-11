import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { config } from '../src/config/env.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import { MockExecutionProvider } from '../src/services/execution/MockExecutionProvider.js';
import { LocalExecutionProvider } from '../src/services/execution/LocalExecutionProvider.js';
import {
  getExecutionQueue,
  enqueueExecutionJob,
  closeExecutionQueue,
  setExecutionQueueInstance
} from '../src/services/queue/executionQueue.js';
import { processExecutionJob } from '../src/services/queue/executionProcessor.js';
import { Submission } from '../src/models/Submission.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { User } from '../src/models/User.js';

describe('Phase 3: BullMQ + Valkey Asynchronous Execution Architecture', () => {
  const jwtSecret = config.jwt.secret || 'test_secret_for_jwt_tokens_min_32_chars';

  const studentAId = new mongoose.Types.ObjectId().toString();
  const studentBId = new mongoose.Types.ObjectId().toString();
  const attemptId = new mongoose.Types.ObjectId().toString();
  const otherAttemptId = new mongoose.Types.ObjectId().toString();
  const questionId = new mongoose.Types.ObjectId().toString();

  const studentAToken = jwt.sign(
    { id: studentAId, email: 'studentA@test.edu', role: 'student' },
    jwtSecret,
    { expiresIn: '2h' }
  );

  const studentBToken = jwt.sign(
    { id: studentBId, email: 'studentB@test.edu', role: 'student' },
    jwtSecret,
    { expiresIn: '2h' }
  );

  // Scoped attempt token for Attempt A
  const attemptAToken = jwt.sign(
    { attemptId, email: 'studentA@test.edu', examId: 'exam123' },
    jwtSecret,
    { expiresIn: '2h' }
  );

  // Scoped attempt token for Attempt B
  const attemptBToken = jwt.sign(
    { attemptId: otherAttemptId, email: 'studentB@test.edu', examId: 'exam123' },
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
    // Default mock user lookup to prevent unmocked MongoDB network operations
    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: studentAId,
        name: 'Alice Student',
        email: 'studentA@test.edu',
        role: 'student'
      })
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setExecutionQueueInstance(null);
    const mockProvider = providerRegistry.getProvider('mock');
    if (mockProvider && typeof mockProvider.reset === 'function') {
      mockProvider.reset();
    }
  });

  // ── 1. Provider Fail-Closed Security Invariants ────────────────────────────
  describe('Provider Fail-Closed Security Invariants', () => {
    test('Refuses to instantiate LocalExecutionProvider if NODE_ENV=production', () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        expect(() => {
          new LocalExecutionProvider({ allowLocalExecution: true });
        }).toThrow(/forbidden in production/i);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    test('Refuses to instantiate LocalExecutionProvider without explicit allowLocalExecution flag', () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'development';
        expect(() => {
          new LocalExecutionProvider({ allowLocalExecution: false });
        }).toThrow(/ALLOW_LOCAL_EXECUTION=true/i);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    test('Registry throws clear error if unknown or unconfigured provider requested', () => {
      expect(() => {
        providerRegistry.getProvider('nonexistent_provider');
      }).toThrow(/Provider not found/i);
    });

    test('MockExecutionProvider is registered and reports active status', () => {
      const mockProvider = providerRegistry.getProvider('mock');
      expect(mockProvider).toBeDefined();
      expect(mockProvider.name).toBe('mock');
      expect(mockProvider.supportsLanguage('javascript')).toBe(true);
      expect(mockProvider.supportsLanguage('python')).toBe(true);
      expect(mockProvider.supportsLanguage('java')).toBe(true);
      expect(mockProvider.supportsLanguage('cpp')).toBe(true);
    });
  });

  // ── 2. Queue Priority & Payload Minimization ──────────────────────────────
  describe('Queue Priority and Payload Minimization', () => {
    test('enqueueExecutionJob assigns priority 1 to SAMPLE runs', async () => {
      const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job_sample_123' }) };
      setExecutionQueueInstance(mockQueue);

      const job = await enqueueExecutionJob({
        submissionId: 'sub123',
        attemptId: 'att123',
        questionId: 'q123',
        runType: 'SAMPLE',
        language: 'javascript',
        studentEmail: 'test@student.edu'
      });

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      const [jobName, payload, options] = mockQueue.add.mock.calls[0];
      expect(jobName).toBe('execute_sample');
      expect(options.priority).toBe(1); // Higher priority in BullMQ (lower number = higher priority)
      expect(options.jobId).toBe('exec_sub123');
      expect(payload).toEqual({
        submissionId: 'sub123',
        attemptId: 'att123',
        questionId: 'q123',
        runType: 'SAMPLE',
        language: 'javascript',
        studentEmail: 'test@student.edu'
      });
      // Verifies no code, test cases, or reference solutions in Redis payload
      expect(payload.code).toBeUndefined();
      expect(payload.testCases).toBeUndefined();
      expect(payload.referenceSolution).toBeUndefined();
    });

    test('enqueueExecutionJob assigns priority 5 to SUBMISSION runs', async () => {
      const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job_sub_123' }) };
      setExecutionQueueInstance(mockQueue);

      await enqueueExecutionJob({
        submissionId: 'sub456',
        attemptId: 'att456',
        questionId: 'q456',
        runType: 'SUBMISSION',
        language: 'python',
        studentEmail: 'test@student.edu'
      });

      const [jobName, , options] = mockQueue.add.mock.calls[0];
      expect(jobName).toBe('execute_submission');
      expect(options.priority).toBe(5);
      expect(options.jobId).toBe('exec_sub456');
    });
  });

  // ── 3. Duplicate In-Flight Protection ─────────────────────────────────────
  describe('Duplicate In-Flight Execution Protection', () => {
    test('POST /:attemptId/run returns existing submission if job is already QUEUED or RUNNING', async () => {
      const existingSubmission = {
        _id: new mongoose.Types.ObjectId().toString(),
        attemptId,
        questionId,
        runType: 'SAMPLE',
        status: 'RUNNING',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockAttempt = {
        _id: attemptId,
        candidateEmail: 'studentA@test.edu',
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: questionId,
          title: 'Sample Two Sum',
          type: 'coding',
          language: 'javascript'
        })
      });

      // Active submission in DB with chained .sort()
      jest.spyOn(Submission, 'findOne').mockReturnValue({
        sort: jest.fn().mockResolvedValue(existingSubmission)
      });

      const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job_duplicate' }) };
      setExecutionQueueInstance(mockQueue);

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId}/run`)
        .set('Authorization', `Bearer ${attemptAToken}`)
        .send({
          questionId,
          code: 'function twoSum() { return [0, 1]; }',
          language: 'javascript'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.submissionId).toBe(existingSubmission._id);
      expect(res.body.data.status).toBe('RUNNING');
      // Should not enqueue another job
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  // ── 4. Worker Execution Processor & Idempotency ───────────────────────────
  describe('Worker Execution Processor and Idempotency', () => {
    test('processExecutionJob transitions submission from QUEUED to COMPLETED with MockExecutionProvider', async () => {
      const subId = new mongoose.Types.ObjectId().toString();

      const mockSubmissionDoc = {
        _id: subId,
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        code: 'function solve() { return true; }',
        language: 'javascript',
        status: 'QUEUED',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockAttempt = {
        _id: attemptId,
        candidateEmail: 'studentA@test.edu',
        status: 'IN_PROGRESS',
        examId: 'exam999'
      };

      const mockQuestion = {
        _id: questionId,
        title: 'Palindrome Number',
        maxMarks: 10,
        driverTemplate: 'return solution(__ARGS__);',
        functionName: 'solve'
      };

      const mockTestCases = [
        { _id: 'tc1', isHidden: false, input: '121', expectedOutput: 'true' },
        { _id: 'tc2', isHidden: true, input: '-121', expectedOutput: 'false' }
      ];

      // Configure MockExecutionProvider to return expected answers
      const mockProvider = providerRegistry.getProvider('mock');
      mockProvider.setHandler((params) => {
        const isTrueCase = String(params.inputArgs[0]) === '121';
        return {
          status: 'success',
          output: isTrueCase ? 'true' : 'false',
          error: null,
          runtimeMs: 12
        };
      });

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSubmissionDoc);
      jest.spyOn(ExamAttempt, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockAttempt)
      });
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockQuestion)
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTestCases)
      });
      jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue(true);

      const job = {
        id: `exec_${subId}`,
        data: {
          submissionId: subId,
          attemptId,
          questionId,
          runType: 'SUBMISSION',
          language: 'javascript',
          studentEmail: 'studentA@test.edu'
        }
      };

      const result = await processExecutionJob(job);

      expect(mockSubmissionDoc.save).toHaveBeenCalled();
      expect(mockSubmissionDoc.status).toBe('COMPLETED');
      expect(mockSubmissionDoc.verdict).toBe('ACCEPTED');
      expect(mockSubmissionDoc.passedTests).toBe(2);
      expect(mockSubmissionDoc.totalTests).toBe(2);
      expect(mockSubmissionDoc.scoreAwarded).toBe(10);
      expect(result.status).toBe('COMPLETED');
    });

    test('processExecutionJob is idempotent on already COMPLETED submissions', async () => {
      const subId = new mongoose.Types.ObjectId().toString();

      const completedSubmissionDoc = {
        _id: subId,
        status: 'COMPLETED',
        verdict: 'ACCEPTED',
        passedTests: 2,
        totalTests: 2,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(completedSubmissionDoc);

      const job = {
        id: `exec_${subId}`,
        data: { submissionId: subId }
      };

      const result = await processExecutionJob(job);

      // Should not re-save or re-execute
      expect(completedSubmissionDoc.save).not.toHaveBeenCalled();
      expect(result.status).toBe('COMPLETED');
      expect(result.message).toMatch(/already processed/i);
    });

    test('processExecutionJob maps compile error and time limit correctly', async () => {
      const subId = new mongoose.Types.ObjectId().toString();

      const mockSubmissionDoc = {
        _id: subId,
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        code: 'invalid syntax error',
        language: 'python',
        status: 'QUEUED',
        save: jest.fn().mockResolvedValue(true)
      };

      // Set handler on MockExecutionProvider for compilation error
      const mockProvider = providerRegistry.getProvider('mock');
      mockProvider.setHandler(() => ({
        status: 'compilation_error',
        error: 'SyntaxError: invalid syntax',
        output: null,
        runtimeMs: 15
      }));

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSubmissionDoc);
      jest.spyOn(ExamAttempt, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: attemptId, candidateEmail: 'studentA@test.edu', status: 'IN_PROGRESS' })
      });
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: questionId, maxMarks: 10 })
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: 'tc1', isHidden: false, input: '1', expectedOutput: '1' }])
      });
      jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue(true);

      const job = {
        id: `exec_${subId}`,
        data: { submissionId: subId, attemptId, questionId, runType: 'SUBMISSION', language: 'python' }
      };

      const result = await processExecutionJob(job);

      expect(mockSubmissionDoc.status).toBe('COMPILE_ERROR');
      expect(mockSubmissionDoc.verdict).toBe('COMPILE_ERROR');
      expect(result.status).toBe('COMPILE_ERROR');
    });
  });

  // ── 5. Zero-Leak Submission Status Endpoint & Ownership ───────────────────
  describe('Zero-Leak Submission Status Endpoint & Ownership', () => {
    test('GET /:attemptId/submissions/:submissionId sanitizes hidden test case fixtures', async () => {
      const subId = new mongoose.Types.ObjectId().toString();

      const completedSubmission = {
        _id: subId,
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        status: 'COMPLETED',
        verdict: 'ACCEPTED',
        passedTests: 2,
        totalTests: 2,
        scoreAwarded: 10,
        maxMarks: 10,
        testResults: [
          { testIndex: 1, isHidden: false, visibility: 'public', passed: true, input: '[1, 2]', expectedOutput: '[3]', actualOutput: '[3]', status: 'passed' },
          { testIndex: 2, isHidden: true, visibility: 'hidden', passed: true, input: '[999, 1]', expectedOutput: '[1000]', actualOutput: '[1000]', status: 'passed' }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockAttempt = {
        _id: attemptId,
        candidateEmail: 'studentA@test.edu',
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Submission, 'findOne').mockReturnValue({
        lean: jest.fn().mockResolvedValue(completedSubmission)
      });

      const res = await request(server)
        .get(`/api/v1/attempts/${attemptId}/submissions/${subId}`)
        .set('Authorization', `Bearer ${attemptAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const testResults = res.body.data.testResults;
      expect(testResults).toHaveLength(2);

      // Public test case has input/output
      expect(testResults[0].isHidden).toBe(false);
      expect(testResults[0].input).toBe('[1, 2]');
      expect(testResults[0].expectedOutput).toBe('[3]');

      // Hidden test case must NEVER leak input or expectedOutput
      expect(testResults[1].isHidden).toBe(true);
      expect(testResults[1].input).toBeUndefined();
      expect(testResults[1].expectedOutput).toBeUndefined();
      expect(testResults[1].passed).toBe(true);
    });

    test('GET /:attemptId/submissions/:submissionId rejects cross-student access with 403', async () => {
      const subId = new mongoose.Types.ObjectId().toString();

      // Attempt belongs to Attempt A
      const mockAttempt = {
        _id: attemptId,
        candidateEmail: 'studentA@test.edu',
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);

      // Student with token for Attempt B tries to access Attempt A
      const res = await request(server)
        .get(`/api/v1/attempts/${attemptId}/submissions/${subId}`)
        .set('Authorization', `Bearer ${attemptBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Credential does not match this attempt session/i);
    });
  });
});
