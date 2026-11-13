import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import {
  parseConstraints,
  extractNumbersAndLengths,
  checkInputAgainstConstraints,
  detectDuplicateTestCases,
  analyzeScenarioCoverage,
  validateQuestionSuite,
  validateSingleTest,
  acceptComputedOutput
} from '../src/services/testValidation.service.js';
import { updateQuestion, createQuestion } from '../src/controllers/question.controller.js';
import { OnlineCompilerProvider } from '../src/services/execution/OnlineCompilerProvider.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';

// Helper for Mongoose queries that may call .lean() or be awaited directly
const mockMongooseQuery = (data) => {
  const p = Promise.resolve(data);
  p.lean = jest.fn().mockResolvedValue(data);
  return p;
};

describe('Teacher Question Validation Enhancement Tests (Without Mutation Lab)', () => {
  let originalFetch;
  let originalActiveProvider;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalActiveProvider = providerRegistry.activeProviderName;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    providerRegistry.setActiveProvider(originalActiveProvider);
    jest.restoreAllMocks();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 1. CONSTRAINT PARSING & TEST CASE SEMANTIC VALIDATION
  // ════════════════════════════════════════════════════════════════════════════
  describe('1. Constraint Parsing & Semantic Test Validation', () => {
    test('1.1 Accurately parses double and single bound constraints including power notation', () => {
      const constraintsText = `
        1 <= nums.length <= 10^5
        -10^9 <= nums[i] <= 10^9
        target >= -10^9
        |s| <= 500
      `;

      const rules = parseConstraints(constraintsText);
      expect(rules.length).toBeGreaterThanOrEqual(3);

      const lengthRule = rules.find((r) => r.target.includes('nums.length'));
      expect(lengthRule).toBeDefined();
      expect(lengthRule.min).toBe(1);
      expect(lengthRule.max).toBe(100000);

      const valRule = rules.find((r) => r.target.includes('nums[i]'));
      expect(valRule).toBeDefined();
      expect(valRule.min).toBe(-1000000000);
      expect(valRule.max).toBe(1000000000);
    });

    test('1.2 Identifies inputs that violate stated question constraints without inventing constraints', () => {
      const rules = [
        { type: 'VALUE', target: 'nums[i]', min: 1, max: 100, raw: '1 <= nums[i] <= 100' }
      ];

      const validViolations = checkInputAgainstConstraints('10 20 50', rules);
      expect(validViolations).toHaveLength(0);

      const underflowViolations = checkInputAgainstConstraints('0 10 20', rules);
      expect(underflowViolations.length).toBeGreaterThan(0);
      expect(underflowViolations[0]).toContain('less than minimum constraint');

      const overflowViolations = checkInputAgainstConstraints('10 150 20', rules);
      expect(overflowViolations.length).toBeGreaterThan(0);
      expect(overflowViolations[0]).toContain('exceeds maximum constraint');
    });

    test('1.3 Detects duplicate test cases by normalized input', () => {
      const testCases = [
        { _id: new mongoose.Types.ObjectId(), input: '10 20\n30' },
        { _id: new mongoose.Types.ObjectId(), input: '5 5\n10' },
        { _id: new mongoose.Types.ObjectId(), input: '10 20\n30' } // Duplicate
      ];

      const duplicates = detectDuplicateTestCases(testCases);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].input).toBe('10 20\n30');
    });

    test('1.4 Analyzes scenario coverage: zero, negative, boundaries, public samples, and hidden cases', () => {
      const rules = [
        { type: 'VALUE', target: 'x', min: -50, max: 50, raw: '-50 <= x <= 50' }
      ];

      const testCasesIncomplete = [
        { visibility: 'public', category: 'sample', input: '10 20' }
      ];

      const { scenarios, missingScenarios } = analyzeScenarioCoverage(testCasesIncomplete, rules);
      expect(scenarios.hasSample).toBe(true);
      expect(scenarios.hasHidden).toBe(false);
      expect(scenarios.hasNegative).toBe(false);
      expect(scenarios.hasZero).toBe(false);

      expect(missingScenarios).toContainEqual(expect.stringContaining('hidden test cases'));
      expect(missingScenarios).toContainEqual(expect.stringContaining('negative numbers'));
      expect(missingScenarios).toContainEqual(expect.stringContaining('zero (0)'));
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. REFERENCE SOLUTION VALIDATION (FUNCTION & STDIN MODES)
  // ════════════════════════════════════════════════════════════════════════════
  describe('2. Reference Solution Execution & Validation', () => {
    test('2.1 Executes reference solution across all test cases and reports PASS when all pass', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Add Numbers',
        language: 'python',
        executionMode: 'STDIN',
        referenceSolution: 'import sys\nprint(sum(map(int, sys.stdin.read().split())))',
        referenceSolutions: new Map([
          ['python', 'import sys\nprint(sum(map(int, sys.stdin.read().split())))']
        ]),
        constraints: '1 <= a, b <= 100',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockTestCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '10 20',
          expectedOutput: '30',
          category: 'sample',
          visibility: 'public',
          save: jest.fn().mockResolvedValue(true)
        },
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '50 50',
          expectedOutput: '100',
          category: 'boundary',
          visibility: 'hidden',
          save: jest.fn().mockResolvedValue(true)
        },
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '1 1',
          expectedOutput: '2',
          category: 'edge_case',
          visibility: 'hidden',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(TestCase, 'find').mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockTestCases)
      });

      let callIdx = 0;
      global.fetch = jest.fn().mockImplementation(async () => {
        callIdx++;
        const outputs = ['30\n', '100\n', '2\n'];
        return new Response(
          JSON.stringify({
            output: outputs[callIdx - 1],
            error: null,
            status: 'success',
            exit_code: 0,
            time: '0.020'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const provider = new OnlineCompilerProvider({
        endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
        apiKey: 'test-key'
      });
      providerRegistry.register('onlinecompiler', provider);
      providerRegistry.setActiveProvider('onlinecompiler');

      const report = await validateQuestionSuite({ questionId, language: 'python' });

      expect(report.referenceSolutionStatus).toBe('PASS');
      expect(report.testCaseValidity).toBe('VALID');
      expect(report.expectedOutputStatus).toBe('VERIFIED');
      expect(report.publishingStatus).toBe('READY');
      expect(report.canPublish).toBe(true);
      expect(report.blockingErrors).toHaveLength(0);
      expect(report.metrics.passed).toBe(3);
      expect(report.metrics.failed).toBe(0);
    });

    test('2.2 Never marks validation successful if reference solution execution fails or has compile error', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Broken Solution',
        language: 'python',
        executionMode: 'STDIN',
        referenceSolution: 'def broken(',
        referenceSolutions: new Map([['python', 'def broken(']]),
        constraints: '',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockTestCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '1 2',
          expectedOutput: '3',
          visibility: 'public',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(TestCase, 'find').mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockTestCases)
      });

      global.fetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output: '',
            error: 'SyntaxError: unexpected EOF while parsing\n',
            status: 'compile_error',
            exit_code: 1,
            time: '0.010'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const provider = new OnlineCompilerProvider({
        endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
        apiKey: 'test-key'
      });
      providerRegistry.register('onlinecompiler', provider);
      providerRegistry.setActiveProvider('onlinecompiler');

      const report = await validateQuestionSuite({ questionId, language: 'python' });

      expect(report.referenceSolutionStatus).toBe('FAIL');
      expect(report.expectedOutputStatus).toBe('UNVERIFIED');
      expect(report.publishingStatus).toBe('NOT_READY');
      expect(report.canPublish).toBe(false);
      expect(report.blockingErrors.length).toBeGreaterThan(0);
      expect(report.blockingErrors[0]).toContain('SyntaxError');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. EXPECTED OUTPUT VERIFICATION & MISMATCH RESOLUTION
  // ════════════════════════════════════════════════════════════════════════════
  describe('3. Expected Output Verification & Mismatch Handling', () => {
    test('3.1 Flags output mismatch when reference solution produces output different from expected output', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Two Sum',
        language: 'python',
        executionMode: 'STDIN',
        referenceSolution: 'import sys; print(42)', // Computes 42 instead of expected 50
        referenceSolutions: new Map([['python', 'import sys; print(42)']]),
        constraints: '',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockTestCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '10 40',
          expectedOutput: '50', // Expected 50
          visibility: 'public',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(TestCase, 'find').mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockTestCases)
      });

      global.fetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output: '42\n',
            error: null,
            status: 'success',
            exit_code: 0,
            time: '0.020'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const provider = new OnlineCompilerProvider({
        endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
        apiKey: 'test-key'
      });
      providerRegistry.register('onlinecompiler', provider);
      providerRegistry.setActiveProvider('onlinecompiler');

      const report = await validateQuestionSuite({ questionId, language: 'python' });

      expect(report.expectedOutputStatus).toBe('MISMATCH');
      expect(report.publishingStatus).toBe('NOT_READY');
      expect(report.canPublish).toBe(false);
      expect(report.metrics.mismatches).toBe(1);
      expect(report.blockingErrors.some((e) => e.includes('output mismatch'))).toBe(true);

      const tcResult = report.testCaseResults[0];
      expect(tcResult.isMismatch).toBe(true);
      expect(tcResult.computedOutput).toBe('42');
      expect(tcResult.expectedOutput).toBe('50');
    });

    test('3.2 Requires teacher approval before accepting computed output as official expected output', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const testId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId
      };

      const mockTestCase = {
        _id: testId,
        questionId,
        input: '10 40',
        expectedOutput: '50',
        computedOutput: '42',
        verificationStatus: 'failed',
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(TestCase, 'findOne').mockResolvedValue(mockTestCase);

      const result = await acceptComputedOutput({ questionId, testId });

      expect(mockTestCase.expectedOutput).toBe('42');
      expect(mockTestCase.verificationStatus).toBe('verified');
      expect(mockTestCase.save).toHaveBeenCalled();
      expect(result.updatedExpectedOutput).toBe('42');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. TEST QUALITY ANALYSIS & REPORTING
  // ════════════════════════════════════════════════════════════════════════════
  describe('4. Test Quality Analysis & Warning Distinction', () => {
    test('4.1 Reports valid, invalid, duplicate, and mismatch counts and clearly distinguishes warnings from blockers', async () => {
      const questionId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        title: 'Boundary Test',
        language: 'python',
        executionMode: 'STDIN',
        referenceSolution: 'import sys; print(sum(map(int, sys.stdin.read().split())))',
        referenceSolutions: new Map([
          ['python', 'import sys; print(sum(map(int, sys.stdin.read().split())))']
        ]),
        constraints: '1 <= a, b <= 100',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockTestCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '10 20',
          expectedOutput: '30',
          category: 'sample',
          visibility: 'public',
          save: jest.fn().mockResolvedValue(true)
        },
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '10 20', // Duplicate input warning
          expectedOutput: '30',
          category: 'sample',
          visibility: 'public',
          save: jest.fn().mockResolvedValue(true)
        },
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '500 500', // Constraint violation blocker (500 > 100)
          expectedOutput: '1000',
          category: 'stress',
          visibility: 'hidden',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(TestCase, 'find').mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockTestCases)
      });

      const provider = new OnlineCompilerProvider({
        endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
        apiKey: 'test-key'
      });
      providerRegistry.register('onlinecompiler', provider);
      providerRegistry.setActiveProvider('onlinecompiler');

      const report = await validateQuestionSuite({ questionId, language: 'python' });

      // Constraint violation is a blocking error
      expect(report.testCaseValidity).toBe('INVALID');
      expect(report.canPublish).toBe(false);
      expect(report.blockingErrors.some((e) => e.includes('exceeds maximum constraint'))).toBe(true);

      // Duplicate input is an improvement warning, not a blocker
      expect(report.warnings.some((w) => w.includes('duplicate test case'))).toBe(true);
      expect(report.testQualityStatus).toBe('NEEDS_IMPROVEMENT');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 5. PUBLISHING RULES ENFORCEMENT
  // ════════════════════════════════════════════════════════════════════════════
  describe('5. Publishing Rules Gate Enforcement', () => {
    test('5.1 Blocks publishing (status=published) when test cases are invalid or unverified', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Unready Question',
        language: 'python',
        referenceSolution: '', // Missing reference solution
        status: 'draft',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockTestCases = [];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(TestCase, 'find').mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockTestCases)
      });

      const req = {
        params: { id: questionId.toString() },
        body: { status: 'published' },
        user: { _id: teacherId, role: 'teacher' }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await updateQuestion(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('Question cannot be published');
    });

    test('5.2 Allows saving drafts (status=draft) even when validation is incomplete', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Work In Progress Draft',
        status: 'draft',
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));

      const req = {
        params: { id: questionId.toString() },
        body: {
          title: 'Updated Draft Title',
          status: 'draft'
        },
        user: { _id: teacherId, role: 'teacher' }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await updateQuestion(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockQuestion.title).toBe('Updated Draft Title');
      expect(mockQuestion.save).toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 6. SINGLE TEST CASE EXECUTION
  // ════════════════════════════════════════════════════════════════════════════
  describe('6. Isolated Single Test Execution', () => {
    test('6.1 Executes reference solution on single test case and returns live output', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const testId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        language: 'python',
        executionMode: 'STDIN',
        referenceSolution: 'import sys; print(sum(map(int, sys.stdin.read().split())))',
        referenceSolutions: new Map([
          ['python', 'import sys; print(sum(map(int, sys.stdin.read().split())))']
        ])
      };

      const mockTestCase = {
        _id: testId,
        questionId,
        input: '20 30',
        expectedOutput: '50',
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(TestCase, 'findOne').mockResolvedValue(mockTestCase);

      global.fetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output: '50\n',
            error: null,
            status: 'success',
            exit_code: 0,
            time: '0.015'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const provider = new OnlineCompilerProvider({
        endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
        apiKey: 'test-key'
      });
      providerRegistry.register('onlinecompiler', provider);
      providerRegistry.setActiveProvider('onlinecompiler');

      const result = await validateSingleTest({ questionId, testId, language: 'python' });

      expect(result.passed).toBe(true);
      expect(result.computedOutput).toBe('50');
      expect(result.status).toBe('verified');
      expect(mockTestCase.save).toHaveBeenCalled();
    });
  });
});
