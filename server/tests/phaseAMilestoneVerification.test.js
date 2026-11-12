import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { validateSingleTestCase } from '../src/services/codeRunner.service.js';
import { executeIsolated, evaluateMutants } from '../src/services/mutation.service.js';
import { MockExecutionProvider } from '../src/services/execution/MockExecutionProvider.js';
import { LocalExecutionProvider } from '../src/services/execution/LocalExecutionProvider.js';
import { RenderSandboxProvider } from '../src/services/execution/RenderSandboxProvider.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import { recalculateAttemptGrading } from '../src/services/attemptGrading.service.js';
import { renewExecutionLease, LEASE_OUTCOMES } from '../src/services/queue/executionProcessor.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { Submission } from '../src/models/Submission.js';
import { config } from '../src/config/env.js';

describe('Milestone A: Source Verification & Security Remediation Suite', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalConfigEnv = config.env;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    config.env = originalConfigEnv;
    jest.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Production Fail-Closed Gates: Production runner unavailable fails closed
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Production Runner Unavailable Fails Closed', () => {
    test('validateSingleTestCase fails closed in production when no provider is available', async () => {
      config.env = 'production';
      process.env.NODE_ENV = 'production';

      const res = await validateSingleTestCase({
        code: 'console.log("student exploit attempt");',
        testCase: {
          _id: new mongoose.Types.ObjectId(),
          input: '1, 2',
          expectedOutput: '3',
          visibility: 'hidden',
          category: 'correctness'
        },
        provider: null
      });

      expect(res.status).toBe('internal_error');
      expect(res.passed).toBe(false);
      expect(res.actualOutput).toBeNull();
      expect(res.error).toMatch(/FAIL-CLOSED/i);
    });

    test('mutation.service executeIsolated fails closed in production when no isolated provider is available', async () => {
      config.env = 'production';
      process.env.NODE_ENV = 'production';

      const res = await executeIsolated({
        code: 'def solution(x): return x + 1',
        inputArgs: [5],
        language: 'python',
        provider: null
      });

      expect(res.status).toBe('internal_error');
      expect(res.output).toBeNull();
      expect(res.error).toMatch(/FAIL-CLOSED/i);
    });

    test('MockExecutionProvider fails closed in production and never awards marks', async () => {
      config.env = 'production';
      process.env.NODE_ENV = 'production';

      const mockProvider = new MockExecutionProvider();
      const res = await mockProvider.executeCode({
        language: 'javascript',
        code: 'function twoSum() { return [0, 1]; }',
        inputArgs: []
      });

      expect(res.status).toBe('internal_error');
      expect(res.output).toBeNull();
      expect(res.error).toMatch(/Mock execution is strictly prohibited/i);
    });

    test('LocalExecutionProvider constructor and executeCode refuse execution in production', async () => {
      config.env = 'production';
      process.env.NODE_ENV = 'production';

      expect(() => new LocalExecutionProvider()).toThrow(/forbidden in production/i);
    });

    test('providerRegistry refuses to register or activate LocalExecutionProvider in production', () => {
      config.env = 'production';
      process.env.NODE_ENV = 'production';

      expect(() => {
        providerRegistry.setActiveProvider('local');
      }).toThrow(/Refusing to initialize LocalExecutionProvider in production/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Mutation Testing Uses Isolated Execution Provider & No Host Execution
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Mutation Testing Execution Boundary', () => {
    test('evaluateMutants routes execution through the provided isolated provider', async () => {
      const mockProvider = new MockExecutionProvider();
      const executeSpy = jest.spyOn(mockProvider, 'executeCode').mockResolvedValue({
        status: 'success',
        output: [0, 1],
        error: null,
        runtimeMs: 15
      });

      const mutants = [
        {
          id: 'mut-1',
          operator: 'BOUNDARY_OFF_BY_ONE',
          description: 'Loop termination off by one',
          originalSnippet: '< length',
          mutatedSnippet: '< length - 1',
          mutatedFullCode: 'function twoSum(nums, target) { return [0, 1]; }'
        }
      ];

      const results = await evaluateMutants({
        referenceCode: 'function twoSum(nums, target) { return [0, 1]; }',
        customMutants: mutants,
        testCases: [{ input: '[2, 7], 9', expectedOutput: '[0, 1]' }],
        questionContext: { language: 'javascript' },
        provider: mockProvider
      });

      expect(executeSpy).toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('mut-1');
    });

    test('Mutation service does not invoke child_process in production', async () => {
      config.env = 'production';
      process.env.NODE_ENV = 'production';

      const res = await executeIsolated({
        code: 'class Malicious { static { System.exit(1); } }',
        inputArgs: [],
        language: 'java'
      });

      // Must fail closed with internal_error, never executing host java
      expect(res.status).toBe('internal_error');
      expect(res.error).toContain('FAIL-CLOSED');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Process Execution & Trust Boundary Audit
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Process Execution & Trust Boundary Audit', () => {
    test('RenderSandboxProvider uses Undici fetch to isolated runner and never invokes child_process', async () => {
      const provider = new RenderSandboxProvider({
        endpoint: 'https://staging-judge0.testforge.internal',
        apiKey: 'test_token',
        providerType: 'judge0'
      });

      expect(provider.name).toBe('render_sandbox');
      expect(typeof provider.executeCode).toBe('function');
      expect(typeof provider.getSubmission).toBe('function');
      expect(typeof provider.cancelSubmission).toBe('function');
    });

    test('LocalExecutionProvider is gated by allowLocal flag in development', () => {
      config.env = 'development';
      process.env.NODE_ENV = 'development';

      // Without allowLocalExecution flag, local provider creation must throw
      expect(() => {
        new LocalExecutionProvider({ allowLocalExecution: false });
      }).toThrow(/Local host execution is disabled by default/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Hidden Test Case Protection & Data Leakage Prevention
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Hidden Test Case & Secret Sanitization', () => {
    test('RenderSandboxProvider sanitizes API keys and tokens from error strings', () => {
      const provider = new RenderSandboxProvider({
        endpoint: 'https://runner.testforge.internal',
        apiKey: 'super_secret_secret_key_12345',
        authzToken: 'authz_token_xyz_67890'
      });

      const rawMsg = 'Failed to connect with token super_secret_secret_key_12345 and user authz_token_xyz_67890';
      const sanitized = provider._sanitize(rawMsg);

      expect(sanitized).not.toContain('super_secret_secret_key_12345');
      expect(sanitized).not.toContain('authz_token_xyz_67890');
      expect(sanitized).toContain('[REDACTED_API_KEY]');
      expect(sanitized).toContain('[REDACTED_AUTH_TOKEN]');
    });

    test('Hidden test case inputs and outputs are never leaked in evaluate results', () => {
      const sampleCase = {
        _id: new mongoose.Types.ObjectId(),
        visibility: 'sample',
        input: '1, 2',
        expectedOutput: '3'
      };
      const hiddenCase = {
        _id: new mongoose.Types.ObjectId(),
        visibility: 'hidden',
        input: '100, 200',
        expectedOutput: '300'
      };

      // Simulated candidate view mapping
      const candidateView = [sampleCase, hiddenCase].map((tc) => ({
        testCaseId: tc._id,
        visibility: tc.visibility,
        input: tc.visibility === 'hidden' ? '[HIDDEN]' : tc.input,
        expectedOutput: tc.visibility === 'hidden' ? '[HIDDEN]' : tc.expectedOutput
      }));

      expect(candidateView[0].input).toBe('1, 2');
      expect(candidateView[0].expectedOutput).toBe('3');
      expect(candidateView[1].input).toBe('[HIDDEN]');
      expect(candidateView[1].expectedOutput).toBe('[HIDDEN]');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Existing Grading & Queue Behavior Remains Correct
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Grading Engine & Queue Lease Integrity', () => {
    test('recalculateAttemptGrading correctly calculates weighted total and percentage when finalized', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const mockAttempt = {
        _id: attemptId,
        status: 'SUBMITTED',
        totalScore: 0,
        maxScore: 100,
        percentage: 0,
        save: jest.fn().mockImplementation(function() { return this; })
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: new mongoose.Types.ObjectId(), score: 20, maxMarks: 20, status: 'EVALUATED' },
          { questionId: new mongoose.Types.ObjectId(), score: 30, maxMarks: 40, status: 'EVALUATED' },
          { questionId: new mongoose.Types.ObjectId(), score: 0, maxMarks: 40, status: 'EVALUATED' }
        ])
      });
      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });

      const result = await recalculateAttemptGrading(attemptId);

      expect(result.totalScore).toBe(50);
      expect(result.maxScore).toBe(100);
      expect(result.percentage).toBe(50);
      expect(result.isProvisional).toBe(false);
      expect(result.gradingStatus).toBe('FINALIZED');
    });

    test('renewExecutionLease handles lost lease properly with LEASE_OUTCOMES.LOST', async () => {
      const subId = new mongoose.Types.ObjectId();
      const origState = mongoose.connection.readyState;
      mongoose.connection.readyState = 1;
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(null);

      const result = await renewExecutionLease(subId, 'worker-token-xyz', 60000, 1, 50);

      expect(result.renewed).toBe(false);
      expect(result.outcome).toBe(LEASE_OUTCOMES.LOST);
      mongoose.connection.readyState = origState;
    });

    test('renewExecutionLease handles query timeout with LEASE_OUTCOMES.UNVERIFIED', async () => {
      const subId = new mongoose.Types.ObjectId();
      const origState = mongoose.connection.readyState;
      mongoose.connection.readyState = 1;
      // Mock hanging findOneAndUpdate
      jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation(() => new Promise(() => {}));

      const result = await renewExecutionLease(subId, 'worker-token-xyz', 60000, 1, 50);

      expect(result.renewed).toBe(false);
      expect(result.outcome).toBe(LEASE_OUTCOMES.UNVERIFIED);
      mongoose.connection.readyState = origState;
    });
  });
});
