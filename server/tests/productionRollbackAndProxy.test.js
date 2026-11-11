import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MockExecutionProvider } from '../src/services/execution/MockExecutionProvider.js';
import { RenderSandboxProvider } from '../src/services/execution/RenderSandboxProvider.js';
import { processExecutionJob } from '../src/services/queue/executionProcessor.js';
import { Submission } from '../src/models/Submission.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';

describe('Phase 4Q: Production Rollback, Outage Handling & Tailscale Proxy Tests', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // ── 1. Production Mock Provider Rejection ──────────────────────────────────
  describe('Production Mock Provider Rejection', () => {
    test('MockExecutionProvider strictly refuses to award simulated marks in production', async () => {
      process.env.NODE_ENV = 'production';
      const mockProvider = new MockExecutionProvider();

      const result = await mockProvider.executeCode({
        language: 'python',
        code: 'print("hello world")',
        inputArgs: []
      });

      expect(result.status).toBe('internal_error');
      expect(result.output).toBeNull();
      expect(result.error).toMatch(/Mock execution is strictly prohibited from awarding marks in production/i);
    });

    test('MockExecutionProvider functions normally in development/test environments', async () => {
      process.env.NODE_ENV = 'test';
      const mockProvider = new MockExecutionProvider();

      const result = await mockProvider.executeCode({
        language: 'javascript',
        code: 'console.log("ok");',
        inputArgs: []
      });

      expect(result.status).toBe('success');
    });
  });

  // ── 2. Tailscale Userspace Proxy Configuration & Dispatcher ───────────────
  describe('Tailscale Userspace Proxy Configuration', () => {
    test('RenderSandboxProvider configures undici ProxyAgent when TAILSCALE_PROXY is set', () => {
      process.env.TAILSCALE_PROXY = 'http://127.0.0.1:1056';
      const provider = new RenderSandboxProvider({
        endpoint: 'http://runner.tailnet.ts.net:2358',
        apiKey: 'token123'
      });

      const caps = provider.getCapabilities();
      expect(caps.usesProxy).toBe(true);
      expect(caps.proxyUrl).toBe('http://127.0.0.1:1056');
      expect(provider.dispatcher).not.toBeNull();

      delete process.env.TAILSCALE_PROXY;
    });

    test('RenderSandboxProvider passes dispatcher to fetch options when proxy configured', async () => {
      const provider = new RenderSandboxProvider({
        endpoint: 'http://runner.tailnet.ts.net:2358',
        apiKey: 'token123',
        proxyUrl: 'http://127.0.0.1:1056',
        providerType: 'judge0'
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: { id: 3, description: 'Accepted' },
          stdout: '42\n'
        })
      });

      await provider.executeCode({
        language: 'python',
        code: 'print(42)',
        inputArgs: []
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callOptions = global.fetch.mock.calls[0][1];
      expect(callOptions.dispatcher).toBe(provider.dispatcher);
    });

    test('Maps proxy connection failure or disconnection to status: internal_error', async () => {
      const provider = new RenderSandboxProvider({
        endpoint: 'http://runner.tailnet.ts.net:2358',
        proxyUrl: 'http://127.0.0.1:9999', // Non-existent local proxy port
        providerType: 'judge0'
      });

      global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:9999'));

      const result = await provider.executeCode({
        language: 'python',
        code: 'print(1)',
        inputArgs: []
      });

      expect(result.status).toBe('internal_error');
      expect(result.error).toMatch(/Judge0 connection failure: connect ECONNREFUSED/i);
    });
  });

  // ── 3. Safe Degraded State: Runner Outage & No Partial Grading ──────────────
  describe('Safe Degraded State: Runner Outage & Zero Partial Scoring', () => {
    let mockSubmissionId;
    let mockAttemptId;
    let mockQuestionId;
    let mockProvider;

    beforeEach(() => {
      mockSubmissionId = new mongoose.Types.ObjectId();
      mockAttemptId = new mongoose.Types.ObjectId();
      mockQuestionId = new mongoose.Types.ObjectId();
      mockProvider = providerRegistry.getProvider('mock');
      mockProvider.reset();
    });

    afterEach(() => {
      if (mockProvider) {
        mockProvider.reset();
      }
    });

    test('Outage on first test case marks submission EXECUTION_UNAVAILABLE without grading', async () => {
      const mockSubmission = {
        _id: mockSubmissionId,
        attemptId: mockAttemptId,
        questionId: mockQuestionId,
        code: 'def solve(): pass',
        language: 'python',
        status: 'QUEUED',
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSubmission);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: mockQuestionId, title: 'Sample Q', language: 'python' })
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: new mongoose.Types.ObjectId(), input: '1', expectedOutput: '1', visibility: 'public' }
        ])
      });

      // Runner fails on first test case with internal_error
      mockProvider.setHandler(() => ({
        status: 'internal_error',
        output: null,
        error: 'Judge0 connection failure: Runner offline',
        runtimeMs: 0
      }));

      const mockJob = {
        id: `exec_${mockSubmissionId}`,
        data: {
          submissionId: mockSubmissionId,
          attemptId: mockAttemptId,
          questionId: mockQuestionId,
          runType: 'SUBMISSION'
        }
      };

      await expect(processExecutionJob(mockJob)).rejects.toThrow(/Runner unavailable/i);

      expect(mockSubmission.status).toBe('EXECUTION_UNAVAILABLE');
      expect(mockSubmission.verdict).toBe('EXECUTION_UNAVAILABLE');
      expect(mockSubmission.scoreAwarded).toBeNull();
      expect(mockSubmission.errorMessage).toMatch(/Runner unavailable/i);
    });

    test('Outage after first test case passed ABORTS grading and DOES NOT finalize partial marks', async () => {
      const mockSubmission = {
        _id: mockSubmissionId,
        attemptId: mockAttemptId,
        questionId: mockQuestionId,
        code: 'def solve(): pass',
        language: 'python',
        status: 'QUEUED',
        maxMarks: 10,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSubmission);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: mockQuestionId, title: 'Sample Q', language: 'python' })
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: new mongoose.Types.ObjectId(), input: '1', expectedOutput: '1', visibility: 'public' },
          { _id: new mongoose.Types.ObjectId(), input: '2', expectedOutput: '2', visibility: 'public' }
        ])
      });

      // First test passes, second test crashes due to runner outage
      let callCount = 0;
      mockProvider.setHandler(() => {
        callCount++;
        if (callCount === 1) {
          return {
            status: 'success',
            output: '1',
            error: null,
            runtimeMs: 10
          };
        }
        return {
          status: 'internal_error',
          output: null,
          error: 'Connection refused 503',
          runtimeMs: 0
        };
      });

      const updateAnswerSpy = jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue({});

      const mockJob = {
        id: `exec_${mockSubmissionId}`,
        data: {
          submissionId: mockSubmissionId,
          attemptId: mockAttemptId,
          questionId: mockQuestionId,
          runType: 'SUBMISSION'
        }
      };

      await expect(processExecutionJob(mockJob)).rejects.toThrow(/Runner unavailable/i);

      // Verify submission is EXECUTION_UNAVAILABLE, NOT PARTIALLY_ACCEPTED
      expect(mockSubmission.status).toBe('EXECUTION_UNAVAILABLE');
      expect(mockSubmission.verdict).toBe('EXECUTION_UNAVAILABLE');
      expect(mockSubmission.scoreAwarded).toBeNull();

      // StudentAnswer record must NOT have been finalized with a partial grade
      expect(updateAnswerSpy).not.toHaveBeenCalled();
    });

    test('Duplicate execution is prevented if submission was already COMPLETED', async () => {
      const mockSubmission = {
        _id: mockSubmissionId,
        status: 'COMPLETED',
        verdict: 'ACCEPTED'
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSubmission);
      const execSpy = jest.fn();
      mockProvider.setHandler(execSpy);

      const mockJob = {
        id: `exec_${mockSubmissionId}`,
        data: { submissionId: mockSubmissionId }
      };

      const result = await processExecutionJob(mockJob);
      expect(result.alreadyCompleted).toBe(true);
      expect(execSpy).not.toHaveBeenCalled();
    });
  });
});
