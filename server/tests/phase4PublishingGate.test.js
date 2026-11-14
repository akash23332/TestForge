import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import {
  evaluateAndPublishQuestion,
  PUBLISHING_STATES,
  getReferenceSolutionForLanguage
} from '../src/services/publishingGate.service.js';
import { createQuestion, updateQuestion, publishQuestion } from '../src/controllers/question.controller.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';

const mockMongooseQuery = (data) => {
  const p = Promise.resolve(data);
  p.lean = jest.fn().mockResolvedValue(data);
  p.sort = jest.fn().mockResolvedValue(data);
  return p;
};

describe('Phase 4: Reference Solution Validation & Single Publishing Gate', () => {
  let originalActiveProvider;
  let mockProvider;

  beforeEach(() => {
    originalActiveProvider = providerRegistry.activeProviderName;
    mockProvider = {
      name: 'phase4_mock',
      executeCode: jest.fn().mockResolvedValue({
        status: 'success',
        output: '[0, 1]',
        runtimeMs: 12
      }),
      checkHealth: jest.fn().mockResolvedValue({ healthy: true })
    };
    providerRegistry.register('phase4_mock', mockProvider);
    providerRegistry.setActiveProvider('phase4_mock');
  });

  afterEach(() => {
    providerRegistry.setActiveProvider(originalActiveProvider);
    jest.restoreAllMocks();
  });

  // =========================================================================
  // 1. REQUIRED PUBLISHING CONDITIONS (Section 2)
  // =========================================================================
  describe('1. Required Publishing Conditions Gate Enforcement', () => {
    it('1.1 Valid question publishing: passes all sample tests and transitions to PUBLISHED', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Two Sum',
        statement: 'Given an array of integers, return indices of the two numbers that add up to target.',
        language: 'javascript',
        supportedLanguages: ['javascript'],
        referenceSolution: 'function solution(nums, target) { return [0, 1]; }',
        referenceSolutions: new Map([['javascript', 'function solution(nums, target) { return [0, 1]; }']]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockSampleCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '[2,7,11,15]\n9',
          expectedOutput: '[0, 1]',
          category: 'sample',
          visibility: 'public',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery(mockSampleCases));

      mockProvider.executeCode.mockResolvedValue({
        status: 'success',
        output: '[0, 1]',
        runtimeMs: 12
      });

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' },
        dryRun: false
      });

      expect(report.canPublish).toBe(true);
      expect(report.status).toBe(PUBLISHING_STATES.PUBLISHED);
      expect(report.summary.publishing).toBe('Allowed');
      expect(report.summary.sampleTests).toBe('1/1 passed');
      expect(mockQuestion.status).toBe(PUBLISHING_STATES.PUBLISHED);
      expect(mockQuestion.save).toHaveBeenCalled();
    });

    it('1.2 Missing title: blocks publishing with clear error', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: '   ', // Blank title
        statement: 'Valid problem statement',
        language: 'javascript',
        supportedLanguages: ['javascript'],
        referenceSolution: 'function solution() { return 1; }',
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery([]));

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);
      expect(report.blockingErrors).toContain('Question title is required.');
    });

    it('1.3 Missing statement: blocks publishing with clear error', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Valid Title',
        statement: '', // Missing statement
        language: 'javascript',
        supportedLanguages: ['javascript'],
        referenceSolution: 'function solution() { return 1; }',
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery([]));

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);
      expect(report.blockingErrors).toContain('Problem statement is required.');
    });

    it('1.4 Missing reference solution: blocks publishing and never copies from another language', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Valid Title',
        statement: 'Valid Statement',
        language: 'javascript',
        supportedLanguages: ['javascript', 'python'],
        referenceSolution: 'function solution() { return 1; }',
        referenceSolutions: new Map([
          ['javascript', 'function solution() { return 1; }']
        ]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockSampleCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '5',
          expectedOutput: '1',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery(mockSampleCases));

      const pyCode = getReferenceSolutionForLanguage(mockQuestion, 'python');
      expect(pyCode).toBe('');

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);
      expect(report.blockingErrors.some(e => e.includes('python | Missing reference solution'))).toBe(true);
    });

    it('1.5 Missing sample test: blocks publishing when 0 sample test cases exist', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Valid Title',
        statement: 'Valid Statement',
        language: 'javascript',
        supportedLanguages: ['javascript'],
        referenceSolution: 'function solution() { return 1; }',
        referenceSolutions: new Map([['javascript', 'function solution() { return 1; }']]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockOnlyHiddenCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '10',
          expectedOutput: '20',
          category: 'stress',
          visibility: 'hidden',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery(mockOnlyHiddenCases));

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);
      expect(report.blockingErrors).toContain('At least one valid sample test case is required.');
    });

    it('1.6 Missing expected output: blocks publishing with clear test case identification', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Valid Title',
        statement: 'Valid Statement',
        language: 'javascript',
        supportedLanguages: ['javascript'],
        referenceSolution: 'function solution() { return 1; }',
        referenceSolutions: new Map([['javascript', 'function solution() { return 1; }']]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '10',
          expectedOutput: '',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery(mockCases));

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);
      expect(report.blockingErrors).toContain('Sample Test Case #1: Missing expected output.');
    });
  });

  // =========================================================================
  // 2. BLOCKING EXECUTION ERRORS (Section 3)
  // =========================================================================
  describe('2. Execution Failures, Timeouts, and Output Mismatches', () => {
    it('2.1 Compilation failure: blocks publishing and formats error with language and test case number', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Tree Inversion',
        statement: 'Invert a binary tree.',
        language: 'java',
        supportedLanguages: ['java'],
        referenceSolution: 'class Solution { public TreeNode invert(TreeNode r) { ... } }',
        referenceSolutions: new Map([['java', 'class Solution { public TreeNode invert(TreeNode r) { ... } }']]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '[1,2,3]',
          expectedOutput: '[1,3,2]',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery(mockCases));

      mockProvider.executeCode.mockResolvedValue({
        status: 'compilation_error',
        error: 'Cannot find symbol: TreeNode',
        output: null,
        runtimeMs: 40
      });

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);
      expect(report.summary.compilation).toBe('Failed');
      expect(report.summary.publishing).toBe('Blocked');
      expect(report.blockingErrors[0]).toMatch(/java \| Test Case #1: Compilation failed\. Cannot find symbol: TreeNode/i);
    });

    it('2.2 Runtime failure: blocks publishing and formats error with language and test case number', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Division',
        statement: 'Divide numbers',
        language: 'python',
        supportedLanguages: ['python'],
        referenceSolution: 'def divide(a, b): return a // b',
        referenceSolutions: new Map([['python', 'def divide(a, b): return a // b']]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '10\n0',
          expectedOutput: '0',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery(mockCases));

      mockProvider.executeCode.mockResolvedValue({
        status: 'runtime_error',
        error: 'ZeroDivisionError: integer division or modulo by zero',
        output: null,
        runtimeMs: 25
      });

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);
      expect(report.summary.runtime).toBe('Failed');
      expect(report.blockingErrors[0]).toMatch(/python \| Test Case #1: Runtime error\. ZeroDivisionError/i);
    });

    it('2.3 Execution timeout: blocks publishing and formats timeout message', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Infinite Loop Question',
        statement: 'Statement',
        language: 'cpp',
        supportedLanguages: ['cpp'],
        referenceSolution: 'int solution() { while(true); }',
        referenceSolutions: new Map([['cpp', 'int solution() { while(true); }']]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '5',
          expectedOutput: '5',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery(mockCases));

      mockProvider.executeCode.mockResolvedValue({
        status: 'timeout',
        error: 'Execution timed out',
        output: null,
        runtimeMs: 4500
      });

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);
      expect(report.summary.runtime).toBe('Failed');
      expect(report.blockingErrors[0]).toBe('cpp | Test Case #1: Execution timed out.');
    });

    it('2.4 Output mismatch: blocks publishing with expected vs received values', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Find Index',
        statement: 'Find pair indices',
        language: 'cpp',
        supportedLanguages: ['cpp'],
        referenceSolution: 'vector<int> solution() { return {0, 1}; }',
        referenceSolutions: new Map([['cpp', 'vector<int> solution() { return {0, 1}; }']]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '[3,2,4]\n6',
          expectedOutput: '[1, 2]',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery(mockCases));

      mockProvider.executeCode.mockResolvedValue({
        status: 'success',
        output: '[0, 1]',
        runtimeMs: 18
      });

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);
      expect(report.summary.outputComparison).toBe('Failed');
      expect(report.blockingErrors[0]).toContain('cpp | Test Case #1: Output mismatch. Expected [1, 2], received [0, 1].');
    });

    it('2.5 Provider unavailable: reports VALIDATION_UNAVAILABLE without marking PASS or FAIL', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Two Sum',
        statement: 'Statement',
        language: 'javascript',
        supportedLanguages: ['javascript'],
        referenceSolution: 'function solution() { return 1; }',
        referenceSolutions: new Map([['javascript', 'function solution() { return 1; }']]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '1',
          expectedOutput: '1',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery(mockCases));

      mockProvider.checkHealth.mockResolvedValue({ healthy: false });

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_UNAVAILABLE);
      expect(report.summary.publishing).toBe('Unavailable');
      expect(report.blockingErrors[0]).toContain('offline or unavailable');
    });
  });

  // =========================================================================
  // 3. MULTI-LANGUAGE & PARTIAL FAILURE VALIDATION (Section 5)
  // =========================================================================
  describe('3. Multi-Language Independent Verification', () => {
    it('3.1 Multiple enabled languages: validates both independently and publishes when both pass', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Add Numbers',
        statement: 'Sum two integers',
        language: 'javascript',
        supportedLanguages: ['javascript', 'python'],
        referenceSolutions: new Map([
          ['javascript', 'function solution(a, b) { return a + b; }'],
          ['python', 'def solution(a, b):\n    return a + b']
        ]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '10\n20',
          expectedOutput: '30',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery(mockCases));

      mockProvider.executeCode.mockResolvedValue({
        status: 'success',
        output: '30',
        runtimeMs: 15
      });

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(true);
      expect(report.status).toBe(PUBLISHING_STATES.PUBLISHED);
      expect(report.metrics.enabledLanguagesCount).toBe(2);
      expect(report.metrics.passedExecutions).toBe(2);
    });

    it('3.2 One language passing while another fails: blocks publishing and isolates failing language', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Add Numbers',
        statement: 'Sum two integers',
        language: 'javascript',
        supportedLanguages: ['javascript', 'python'],
        referenceSolutions: new Map([
          ['javascript', 'function solution(a, b) { return a + b; }'],
          ['python', 'def solution(a, b):\n    return a - b']
        ]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '10\n20',
          expectedOutput: '30',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery(mockCases));

      mockProvider.executeCode.mockImplementation(async ({ language }) => {
        if (language === 'javascript') {
          return { status: 'success', output: '30', runtimeMs: 10 };
        }
        return { status: 'success', output: '-10', runtimeMs: 12 };
      });

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);
      expect(report.languageResults.javascript.passed).toBe(true);
      expect(report.languageResults.python.passed).toBe(false);
      expect(report.blockingErrors.some(e => e.includes('python | Test Case #1: Output mismatch'))).toBe(true);
    });
  });

  // =========================================================================
  // 4. NON-BLOCKING WARNINGS & CONCURRENCY (Section 4 & Section 6)
  // =========================================================================
  describe('4. Non-Blocking Warnings & Concurrency Protection', () => {
    it('4.1 All samples passing with quality warnings allows publishing', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Valid Question with Duplicate Warning',
        statement: 'Statement with constraints',
        constraints: '1 <= n <= 100',
        language: 'javascript',
        supportedLanguages: ['javascript'],
        referenceSolution: 'function solution(n) { return n * 2; }',
        referenceSolutions: new Map([['javascript', 'function solution(n) { return n * 2; }']]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '10',
          expectedOutput: '20',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        },
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '10', // Duplicate input
          expectedOutput: '20',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery(mockCases));

      mockProvider.executeCode.mockResolvedValue({
        status: 'success',
        output: '20',
        runtimeMs: 15
      });

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(true);
      expect(report.status).toBe(PUBLISHING_STATES.PUBLISHED);
      expect(report.warnings.length).toBeGreaterThan(0);
      expect(report.warnings.some(w => w.includes('duplicate test case'))).toBe(true);
      expect(report.summary.publishing).toBe('Allowed');
    });

    it('4.2 Duplicate publish requests: rejects concurrent validation with 409 Conflict', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Title',
        status: PUBLISHING_STATES.VALIDATING,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));

      let threwConflict = false;
      try {
        await evaluateAndPublishQuestion({
          questionId,
          user: { _id: teacherId, role: 'teacher' }
        });
      } catch (err) {
        threwConflict = true;
        expect(err.statusCode).toBe(409);
        expect(err.message).toMatch(/currently undergoing validation/i);
      }
      expect(threwConflict).toBe(true);
    });

    it('4.3 Unauthorized publishing: non-owner teacher cannot publish another teacher question', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const ownerId = new mongoose.Types.ObjectId();
      const intruderId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId,
        title: 'Title',
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));

      let threwForbidden = false;
      try {
        await evaluateAndPublishQuestion({
          questionId,
          user: { _id: intruderId, role: 'teacher' }
        });
      } catch (err) {
        threwForbidden = true;
        expect(err.statusCode).toBe(403);
      }
      expect(threwForbidden).toBe(true);
    });

    it('4.4 Failed validation followed by corrected solution and successful republishing', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Two Sum',
        statement: 'Statement',
        language: 'javascript',
        supportedLanguages: ['javascript'],
        referenceSolution: 'function solution() { return [99, 99]; }',
        referenceSolutions: new Map([['javascript', 'function solution() { return [99, 99]; }']]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '[1,2]\n3',
          expectedOutput: '[0, 1]',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery(mockCases));

      // Attempt 1: Output mismatch -> validation fails
      mockProvider.executeCode.mockResolvedValueOnce({
        status: 'success',
        output: '[99, 99]',
        runtimeMs: 10
      });

      const attempt1 = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });
      expect(attempt1.canPublish).toBe(false);
      expect(attempt1.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);

      // Teacher corrects the solution
      mockQuestion.referenceSolution = 'function solution() { return [0, 1]; }';
      mockQuestion.referenceSolutions.set('javascript', 'function solution() { return [0, 1]; }');
      mockQuestion.status = PUBLISHING_STATES.DRAFT;

      // Attempt 2: Fixed solution matches expected output -> published!
      mockProvider.executeCode.mockResolvedValueOnce({
        status: 'success',
        output: '[0, 1]',
        runtimeMs: 12
      });

      const attempt2 = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });
      expect(attempt2.canPublish).toBe(true);
      expect(attempt2.status).toBe(PUBLISHING_STATES.PUBLISHED);
      expect(attempt2.summary.publishing).toBe('Allowed');
    });
  });

  // =========================================================================
  // 5. API CONTROLLER INTEGRATION & PERSISTENCE
  // =========================================================================
  describe('5. API Controller Integration & Single Publishing Gate Enforcement', () => {
    it('5.1 POST /questions with status=published validates before creating as PUBLISHED', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const createdDoc = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Math Multiply',
        statement: 'Multiply two numbers',
        language: 'javascript',
        supportedLanguages: ['javascript'],
        referenceSolution: 'function solution(a, b) { return a * b; }',
        referenceSolutions: new Map([['javascript', 'function solution(a, b) { return a * b; }']]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Question, 'create').mockResolvedValue(createdDoc);
      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(createdDoc));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(createdDoc);
      jest.spyOn(TestCase, 'insertMany').mockResolvedValue([]);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery([
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '3\n4',
          expectedOutput: '12',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        }
      ]));

      mockProvider.executeCode.mockResolvedValue({
        status: 'success',
        output: '12',
        runtimeMs: 10
      });

      const req = {
        user: { _id: teacherId, role: 'teacher' },
        body: {
          title: 'Math Multiply',
          statement: 'Multiply two numbers',
          language: 'javascript',
          referenceSolution: 'function solution(a, b) { return a * b; }',
          status: 'published',
          examples: [{ input: '3\n4', output: '12' }]
        }
      };

      let resStatus = 0;
      let resData = null;
      const res = {
        status: (code) => {
          resStatus = code;
          return {
            json: (data) => { resData = data; }
          };
        }
      };
      const next = jest.fn();

      await createQuestion(req, res, next);

      expect(resStatus).toBe(201);
      expect(resData.data.status).toBe(PUBLISHING_STATES.PUBLISHED);
    });

    it('5.2 PATCH /questions/:id with status=published blocks invalid updates from entering PUBLISHED', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const existingDoc = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Broken Question',
        statement: 'Statement',
        language: 'javascript',
        supportedLanguages: ['javascript'],
        referenceSolution: 'function solution() { return 0; }',
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(existingDoc));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(existingDoc);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery([
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '1',
          expectedOutput: '100',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        }
      ]));

      mockProvider.executeCode.mockResolvedValue({
        status: 'success',
        output: '0',
        runtimeMs: 10
      });

      const req = {
        params: { id: questionId.toString() },
        user: { _id: teacherId, role: 'teacher' },
        body: { status: 'published' }
      };

      const res = {};
      const next = jest.fn();

      await updateQuestion(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(400);
      expect(error.message).toMatch(/Question cannot be published/i);
    });

    it('5.3 POST /questions/:id/publish provides the dedicated single publishing endpoint', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const existingDoc = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Valid Question',
        statement: 'Statement',
        language: 'javascript',
        supportedLanguages: ['javascript'],
        referenceSolution: 'function solution() { return 100; }',
        referenceSolutions: new Map([['javascript', 'function solution() { return 100; }']]),
        status: PUBLISHING_STATES.DRAFT,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(existingDoc));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(existingDoc);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery([
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '1',
          expectedOutput: '100',
          category: 'sample',
          save: jest.fn().mockResolvedValue(true)
        }
      ]));

      mockProvider.executeCode.mockResolvedValue({
        status: 'success',
        output: '100',
        runtimeMs: 10
      });

      const req = {
        params: { id: questionId.toString() },
        user: { _id: teacherId, role: 'teacher' }
      };

      let resStatus = 0;
      let resPayload = null;
      const res = {
        status: (code) => {
          resStatus = code;
          return {
            json: (payload) => { resPayload = payload; }
          };
        }
      };
      const next = jest.fn();

      await publishQuestion(req, res, next);

      expect(resStatus).toBe(200);
      expect(resPayload.data.canPublish).toBe(true);
      expect(resPayload.data.summary.publishing).toBe('Allowed');
    });
  });
});
