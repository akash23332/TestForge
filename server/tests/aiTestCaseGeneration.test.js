import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import testCaseGeneratorService, { TestCaseGeneratorService, computeCanonicalInput, computeInputHash } from '../src/services/ai/testCaseGenerator.service.js';
import { GeminiProvider } from '../src/services/ai/providers/gemini.provider.js';
import { TestCase } from '../src/models/TestCase.js';
import { Question } from '../src/models/Question.js';
import {
  generateAITestCasesHandler,
  batchSaveTestCasesHandler,
  createTestCase,
  getTestCases
} from '../src/controllers/testCase.controller.js';
import { ApiError } from '../src/utils/apiError.js';

describe('AI Test Case Generation for Test Studio (Stage 1 & 2)', () => {
  jest.setTimeout(60000);
  let mockProvider;
  let service;

  const teacherId = new mongoose.Types.ObjectId();
  const otherTeacherId = new mongoose.Types.ObjectId();
  const questionId = new mongoose.Types.ObjectId();

  const mockQuestion = {
    _id: questionId,
    title: 'Two Sum',
    statement: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    constraints: '2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9\n-10^9 <= target <= 10^9',
    inputFormat: 'nums = [2, 7, 11, 15], target = 9',
    outputFormat: '[0, 1]',
    language: 'python',
    executionMode: 'FUNCTION',
    dataStructure: 'ARRAY',
    functionName: 'twoSum',
    functionSignature: {
      parameters: [
        { name: 'nums', type: 'list[int]' },
        { name: 'target', type: 'int' }
      ],
      returnType: 'list[int]'
    },
    referenceSolution: 'def twoSum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n    return []',
    starterCode: 'def twoSum(nums, target):\n    pass',
    ownerId: teacherId,
    __v: 1,
    updatedAt: new Date('2026-11-15T00:00:00Z')
  };

  beforeEach(() => {
    mockProvider = {
      name: 'gemini',
      generateTestCases: jest.fn().mockResolvedValue({
        testCases: [
          {
            input: 'nums = [2, 7, 11, 15], target = 9',
            category: 'normal',
            explanation: 'Standard baseline case.'
          },
          {
            input: 'nums = [3, 2, 4], target = 6',
            category: 'edge_case',
            explanation: 'Non-consecutive indices.'
          },
          {
            input: 'nums = [3, 3], target = 6',
            category: 'boundary',
            explanation: 'Duplicate identical values.'
          }
        ]
      })
    };

    service = new TestCaseGeneratorService(mockProvider);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Semantics-Preserving Input Canonicalization & Hashing', () => {
    it('preserves exact STDIN input without stripping leading/trailing whitespace or newlines', () => {
      const stdinInput1 = '  hello world  \n\n42\n';
      const stdinInput2 = 'hello world\n42';

      const canonical1 = computeCanonicalInput(stdinInput1, 'STDIN');
      const canonical2 = computeCanonicalInput(stdinInput2, 'STDIN');

      expect(canonical1).toBe(stdinInput1);
      expect(canonical2).toBe(stdinInput2);
      expect(canonical1).not.toBe(canonical2);

      const hash1 = computeInputHash(canonical1);
      const hash2 = computeInputHash(canonical2);
      expect(hash1).not.toBe(hash2);
    });

    it('equates equivalent function arguments while preserving string literal whitespace', () => {
      // Equivalent function syntax
      const inputA = 'nums = [1, 2], target = 3';
      const inputB = '[1, 2], 3';

      const canonicalA = computeCanonicalInput(inputA, 'FUNCTION');
      const canonicalB = computeCanonicalInput(inputB, 'FUNCTION');

      expect(canonicalA).toBe(canonicalB);
      expect(computeInputHash(canonicalA)).toBe(computeInputHash(canonicalB));

      // String literal whitespace distinction must NOT be collapsed
      const strSpace = '" "';
      const strEmpty = '""';

      const canonicalSpace = computeCanonicalInput(strSpace, 'FUNCTION');
      const canonicalEmpty = computeCanonicalInput(strEmpty, 'FUNCTION');

      expect(canonicalSpace).not.toBe(canonicalEmpty);
      expect(computeInputHash(canonicalSpace)).not.toBe(computeInputHash(canonicalEmpty));
    });
  });

  describe('2. Gemini Structured Generation & Error Handling', () => {
    it('throws GEMINI_EMPTY_RESPONSE when Gemini returns an empty string', async () => {
      const gemini = new GeminiProvider({ apiKey: 'fake_key' });
      gemini.client = {
        models: {
          generateContent: jest.fn().mockResolvedValue({ text: '' })
        }
      };

      await expect(gemini.generateTestCases({ question: mockQuestion })).rejects.toThrow(
        /empty response/i
      );
    });

    it('throws GEMINI_MALFORMED_RESPONSE when Gemini returns non-JSON or missing testCases array', async () => {
      const gemini = new GeminiProvider({ apiKey: 'fake_key' });
      gemini.client = {
        models: {
          generateContent: jest.fn().mockResolvedValue({ text: 'Not valid JSON' })
        }
      };

      await expect(gemini.generateTestCases({ question: mockQuestion })).rejects.toThrow(
        /not valid JSON/i
      );

      gemini.client.models.generateContent.mockResolvedValue({ text: JSON.stringify({ wrongKey: [] }) });
      await expect(gemini.generateTestCases({ question: mockQuestion })).rejects.toThrow(
        /missing testCases array/i
      );
    });
  });

  describe('3. Authoritative Reference Solution & Compute-Only Validation', () => {
    it('rejects test generation when Question lacks reference solution (zero starter-code fallback)', async () => {
      const questionWithoutRef = {
        ...mockQuestion,
        referenceSolution: '',
        referenceSolutions: new Map()
      };

      await expect(service.generateCandidateTestCases({ question: questionWithoutRef })).rejects.toThrow(
        /authoritative reference solution configured/i
      );
    });

    it('computes authoritative expected output using actual runner execution and drops crashing candidates', async () => {
      // Mock existing test cases
      jest.spyOn(TestCase, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });

      // Provider returns 2 candidates: 1 valid, 1 that causes runtime/syntax crash
      mockProvider.generateTestCases.mockResolvedValue({
        testCases: [
          { input: 'nums = [2, 7, 11, 15], target = 9', category: 'normal', explanation: 'Valid' },
          { input: 'invalid python syntax @@@', category: 'edge_case', explanation: 'Causes crash' }
        ]
      });

      const result = await service.generateCandidateTestCases({ question: mockQuestion, count: 2 });

      expect(result.totalGenerated).toBe(2);
      expect(result.acceptedCount).toBe(1);
      expect(result.rejectedExecutionCount).toBe(1);
      expect(result.candidates[0].input).toBe('nums = [2, 7, 11, 15], target = 9');
      expect(result.candidates[0].expectedOutput).toBe('[0,1]');
      expect(result.candidates[0].visibility).toBe('hidden');
    });

    it('filters out duplicates against existing database test cases', async () => {
      // Pre-seed an existing test case matching candidate 1
      const canonicalExisting = computeCanonicalInput('nums = [2, 7, 11, 15], target = 9', 'FUNCTION');
      const existingHash = computeInputHash(canonicalExisting);

      jest.spyOn(TestCase, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ input: 'nums = [2, 7, 11, 15], target = 9', inputHash: existingHash }])
        })
      });

      const result = await service.generateCandidateTestCases({ question: mockQuestion, count: 3 });

      expect(result.duplicateCount).toBe(1);
      expect(result.acceptedCount).toBe(2);
    });
  });

  describe('4. Controller Security & Language Controls', () => {
    it('enforces teacher ownership on test generation endpoint (403 for non-owner)', async () => {
      jest.spyOn(Question, 'findById').mockResolvedValue(mockQuestion);

      const req = {
        params: { id: questionId.toString() },
        user: { _id: otherTeacherId, role: 'teacher' },
        body: { count: 3 }
      };
      const res = {};
      const next = jest.fn();

      await generateAITestCasesHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });

    it('rejects client-supplied language override that mismatches Question configuration', async () => {
      jest.spyOn(Question, 'findById').mockResolvedValue(mockQuestion);

      const req = {
        params: { id: questionId.toString() },
        user: { _id: teacherId, role: 'teacher' },
        body: { language: 'cpp', count: 3 } // Question is python
      };
      const res = {};
      const next = jest.fn();

      await generateAITestCasesHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toMatch(/Language mismatch/i);
    });

    it('respects requested public visibility and forwards excludeInputs to generator', async () => {
      jest.spyOn(Question, 'findById').mockResolvedValue(mockQuestion);

      const genSpy = jest.spyOn(testCaseGeneratorService, 'generateCandidateTestCases').mockResolvedValue({
        candidates: [
          {
            candidateId: 'cand_123',
            input: 'nums = [2, 7, 11, 15], target = 9',
            expectedOutput: '[0, 1]',
            computedOutput: '[0, 1]',
            category: 'normal',
            visibility: 'public',
            explanation: 'Valid',
            runtimeMs: 10,
            inputHash: 'hash123'
          }
        ],
        totalGenerated: 1,
        acceptedCount: 1,
        duplicateCount: 0,
        rejectedExecutionCount: 0
      });

      const req = {
        params: { id: questionId.toString() },
        user: { _id: teacherId, role: 'teacher' },
        body: {
          count: 1,
          visibility: 'public',
          excludeInputs: ['nums = [1, 2], target = 3']
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await generateAITestCasesHandler(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(genSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: 'public',
          excludeInputs: ['nums = [1, 2], target = 3']
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0].data;
      expect(data.candidates[0].visibility).toBe('public');
    });
  });

  describe('5. Concurrency-Safe Batch Save Architecture', () => {
    it('revalidates every candidate outside transaction and derives expectedOutput from actual runner execution', async () => {
      jest.spyOn(Question, 'findById').mockResolvedValue(mockQuestion);

      // Candidate provides a false/tampered expectedOutput and verificationStatus
      const req = {
        params: { id: questionId.toString() },
        user: { _id: teacherId, role: 'teacher' },
        body: {
          testCases: [
            {
              input: 'nums = [3, 2, 4], target = 6',
              expectedOutput: 'TAMPERED_OUTPUT',
              verificationStatus: 'unverified',
              category: 'edge_case',
              visibility: 'public'
            }
          ]
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      // Mock session for transaction phase
      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn(),
        inTransaction: jest.fn().mockReturnValue(true)
      };
      jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

      let insertedDocs = null;
      jest.spyOn(TestCase, 'insertMany').mockImplementation(async (docs) => {
        insertedDocs = docs;
        return docs.map((d, i) => ({ ...d, _id: new mongoose.Types.ObjectId() }));
      });

      await batchSaveTestCasesHandler(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(insertedDocs).toHaveLength(1);
      // Confirms expectedOutput was computed authoritatively, ignoring client tampering
      expect(insertedDocs[0].expectedOutput).toBe('[1,2]');
      expect(insertedDocs[0].verificationStatus).toBe('verified');
      expect(insertedDocs[0].source).toBe('ai_generated');
      expect(insertedDocs[0].category).toBe('edge_case');
      expect(insertedDocs[0].visibility).toBe('public');
      expect(insertedDocs[0].inputHash).toBeDefined();
    });

    it('rejects batch save when any candidate fails execution against reference solution', async () => {
      jest.spyOn(Question, 'findById').mockResolvedValue(mockQuestion);

      const req = {
        params: { id: questionId.toString() },
        user: { _id: teacherId, role: 'teacher' },
        body: {
          testCases: [
            { input: 'nums = [2, 7], target = 9' }, // valid
            { input: 'syntax error invalid python code :::' } // compilation error
          ]
        }
      };
      const res = {};
      const next = jest.fn();

      await batchSaveTestCasesHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toMatch(/failed execution against reference solution/i);
    });

    it('rejects duplicate candidates within the same submitted batch', async () => {
      jest.spyOn(Question, 'findById').mockResolvedValue(mockQuestion);

      const req = {
        params: { id: questionId.toString() },
        user: { _id: teacherId, role: 'teacher' },
        body: {
          testCases: [
            { input: 'nums = [2, 7], target = 9' },
            { input: '[2, 7], 9' } // Equivalent in FUNCTION mode
          ]
        }
      };
      const res = {};
      const next = jest.fn();

      await batchSaveTestCasesHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toMatch(/Duplicate candidate input detected within the same batch/i);
    });

    it('fails closed with 503 TRANSACTIONS_UNAVAILABLE when database transactions are unsupported', async () => {
      jest.spyOn(Question, 'findById').mockResolvedValue(mockQuestion);
      jest.spyOn(mongoose, 'startSession').mockRejectedValue(new Error('Transactions not supported on standalone'));

      const req = {
        params: { id: questionId.toString() },
        user: { _id: teacherId, role: 'teacher' },
        body: {
          testCases: [{ input: 'nums = [2, 7], target = 9' }]
        }
      };
      const res = {};
      const next = jest.fn();

      await batchSaveTestCasesHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(503);
      expect(next.mock.calls[0][0].details?.code).toBe('TRANSACTIONS_UNAVAILABLE');
    });

    it('aborts transaction and returns 409 Conflict if Question was modified concurrently during pre-validation', async () => {
      jest.spyOn(Question, 'findById')
        .mockResolvedValueOnce(mockQuestion) // Initial fetch before transaction
        .mockReturnValueOnce({ // Fetch inside transaction session
          session: jest.fn().mockResolvedValue({
            ...mockQuestion,
            __v: 2 // Version bumped concurrently
          })
        });

      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn(),
        inTransaction: jest.fn().mockReturnValue(true)
      };
      jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

      const req = {
        params: { id: questionId.toString() },
        user: { _id: teacherId, role: 'teacher' },
        body: {
          testCases: [{ input: 'nums = [2, 7], target = 9' }]
        }
      };
      const res = {};
      const next = jest.fn();

      await batchSaveTestCasesHandler(req, res, next);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(409);
      expect(next.mock.calls[0][0].details?.code).toBe('CONCURRENT_QUESTION_MODIFICATION');
    });

    it('catches duplicate key error (11000) during concurrent race and returns 409 Conflict', async () => {
      jest.spyOn(Question, 'findById')
        .mockResolvedValueOnce(mockQuestion)
        .mockReturnValueOnce({
          session: jest.fn().mockResolvedValue(mockQuestion)
        });

      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn(),
        inTransaction: jest.fn().mockReturnValue(true)
      };
      jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

      const dupError = new Error('E11000 duplicate key error collection: testforge.testcases index: uniq_question_test_input');
      dupError.code = 11000;
      jest.spyOn(TestCase, 'insertMany').mockRejectedValue(dupError);

      const req = {
        params: { id: questionId.toString() },
        user: { _id: teacherId, role: 'teacher' },
        body: {
          testCases: [{ input: 'nums = [2, 7], target = 9' }]
        }
      };
      const res = {};
      const next = jest.fn();

      await batchSaveTestCasesHandler(req, res, next);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(409);
      expect(next.mock.calls[0][0].details?.code).toBe('DUPLICATE_TEST_CASE_INPUT');
    });
  });

  describe('6. Backward Compatibility with Existing TestCase Records and CRUD', () => {
    it('legacy test cases without inputHash remain readable and compatible', async () => {
      const legacyTestCase = {
        _id: new mongoose.Types.ObjectId(),
        questionId: mockQuestion._id,
        input: 'legacy input',
        expectedOutput: 'legacy output',
        category: 'standard',
        visibility: 'public',
        verificationStatus: 'verified',
        inputHash: null // Legacy document
      };

      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockQuestion)
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([legacyTestCase])
        })
      });

      const req = {
        params: { id: questionId.toString() },
        query: {},
        user: { _id: teacherId, role: 'teacher' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await getTestCases(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].data[0].inputHash).toBeNull();
    });

    it('standard manual single test creation remains intact', async () => {
      jest.spyOn(Question, 'findById').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'create').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        questionId,
        input: 'nums = [1, 2], target = 3',
        expectedOutput: '[0, 1]',
        category: 'normal',
        visibility: 'hidden',
        verificationStatus: 'unverified'
      });

      const req = {
        params: { id: questionId.toString() },
        user: { _id: teacherId, role: 'teacher' },
        body: {
          input: 'nums = [1, 2], target = 3',
          expectedOutput: '[0, 1]',
          category: 'normal',
          visibility: 'hidden'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await createTestCase(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });
});
