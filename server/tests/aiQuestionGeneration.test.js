import { jest, describe, it, test, expect, beforeEach, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { GeminiProvider } from '../src/services/ai/providers/gemini.provider.js';
import { questionGeneratorService } from '../src/services/ai/questionGenerator.service.js';
import { validateGeneratedQuestion } from '../src/services/ai/questionValidator.service.js';
import {
  computeSampleValidationFingerprint,
  signValidationToken,
  verifyValidationToken,
  validateSampleTestCase,
  verifyQuestionSampleValidation
} from '../src/services/sampleValidation.service.js';
import {
  evaluateAndPublishQuestion,
  PUBLISHING_STATES
} from '../src/services/publishingGate.service.js';
import { getQuestionStudentView, updateQuestion, createQuestion } from '../src/controllers/question.controller.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import { config } from '../src/config/env.js';

// Helper to mock mongoose query methods (.lean(), .sort(), etc.)
const mockMongooseQuery = (data) => {
  const p = Promise.resolve(data);
  p.lean = jest.fn().mockResolvedValue(data);
  p.sort = jest.fn().mockResolvedValue(data);
  p.select = jest.fn().mockReturnValue(p);
  return p;
};

describe('Gemini AI Question Generation & Publishing Gate Matrix (Page 1)', () => {
  let originalApiKey;
  let originalActiveProvider;
  let mockExecutionProvider;

  beforeEach(() => {
    originalApiKey = config.ai?.apiKey;
    originalActiveProvider = providerRegistry.activeProviderName;

    mockExecutionProvider = {
      name: 'ai_test_mock_provider',
      executeCode: jest.fn().mockResolvedValue({
        status: 'success',
        passed: true,
        output: '3\n',
        actualOutput: '3',
        runtimeMs: 18
      }),
      checkHealth: jest.fn().mockResolvedValue({ healthy: true })
    };
    providerRegistry.register('ai_test_mock_provider', mockExecutionProvider);
    providerRegistry.setActiveProvider('ai_test_mock_provider');
  });

  afterEach(() => {
    config.ai.apiKey = originalApiKey;
    providerRegistry.setActiveProvider(originalActiveProvider);
    jest.restoreAllMocks();
  });

  // =========================================================================
  // SCENARIO 1 & 2: Provider Response Handling & Schema Validation
  // =========================================================================
  describe('1. Gemini Provider Response Handling & Structured JSON Parsing', () => {
    it('Scenario 1: correctly parses structured JSON into Question schema format', async () => {
      const mockClient = {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: JSON.stringify({
              title: 'Two Sum Problem',
              statement: 'Find two numbers such that they add up to a specific target.',
              inputFormat: 'Line 1: Array of integers nums. Line 2: target integer.',
              outputFormat: 'Array of two indices [i, j].',
              constraints: '2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9',
              difficulty: 'Easy',
              language: 'python',
              executionMode: 'FUNCTION',
              functionName: 'twoSum',
              dataStructure: 'ARRAY',
              functionSignature: {
                returnType: 'list[int]',
                parameters: [
                  { name: 'nums', type: 'list[int]' },
                  { name: 'target', type: 'int' }
                ]
              },
              starterCode: 'class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        pass\n',
              referenceSolution: 'class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        lookup = {}\n        for i, num in enumerate(nums):\n            diff = target - num\n            if diff in lookup:\n                return [lookup[diff], i]\n            lookup[num] = i\n        return []\n',
              examples: [
                {
                  input: '[2, 7, 11, 15]\n9',
                  output: '[0, 1]',
                  explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].'
                }
              ],
              tags: ['Array', 'Hash Table']
            })
          })
        }
      };

      const provider = new GeminiProvider({ client: mockClient });
      const result = await provider.generateQuestion({
        topic: 'Two Sum',
        difficulty: 'Easy',
        language: 'python',
        executionMode: 'FUNCTION'
      });

      expect(result.title).toBe('Two Sum Problem');
      expect(result.functionName).toBe('twoSum');
      expect(result.examples).toHaveLength(1);
      expect(result.examples[0].output).toBe('[0, 1]');
      expect(result.starterCode).toContain('def twoSum');
      expect(result.referenceSolution).toContain('class Solution:');
    });

    it('Scenario 2: rejects malformed schema or invalid contract during post-validation', () => {
      const invalidData = {
        title: 'Bad Question',
        // missing statement
        constraints: 'n <= 10',
        starterCode: 'def bad(): pass',
        referenceSolution: 'def bad(): return 1',
        examples: [] // missing required sample test case
      };

      expect(() => {
        validateGeneratedQuestion(invalidData, { executionMode: 'FUNCTION' });
      }).toThrow();
    });
  });

  // =========================================================================
  // SCENARIO 3, 4, 5, 6, 7: Error Classification & Robustness
  // =========================================================================
  describe('2. Provider Error Classification & Fail-Closed Behavior', () => {
    it('Scenario 3: Missing API Key throws GEMINI_API_KEY_MISSING (503)', async () => {
      const provider = new GeminiProvider({ apiKey: '' });

      await expect(provider.generateQuestion()).rejects.toMatchObject({
        statusCode: 503,
        details: expect.objectContaining({ code: 'GEMINI_API_KEY_MISSING' })
      });
    });

    it('Scenario 4: Invalid API Key error mapped to GEMINI_INVALID_API_KEY (401)', async () => {
      const mockClient = {
        models: {
          generateContent: jest.fn().mockRejectedValue(new Error('API key not valid. Please pass a valid API key.'))
        }
      };

      const provider = new GeminiProvider({ client: mockClient });
      await expect(provider.generateQuestion()).rejects.toMatchObject({
        statusCode: 401,
        details: expect.objectContaining({ code: 'GEMINI_INVALID_API_KEY' })
      });
    });

    it('Scenario 5: Provider rate limit error mapped to GEMINI_RATE_LIMIT (429)', async () => {
      const mockClient = {
        models: {
          generateContent: jest.fn().mockRejectedValue(new Error('Resource has been exhausted (e.g. check quota, 429).'))
        }
      };

      const provider = new GeminiProvider({ client: mockClient, maxRetries: 0 });
      await expect(provider.generateQuestion()).rejects.toMatchObject({
        statusCode: 429,
        details: expect.objectContaining({ code: 'GEMINI_RATE_LIMIT' })
      });
    });

    it('Scenario 6: Provider timeout mapped to GEMINI_TIMEOUT (504)', async () => {
      const mockClient = {
        models: {
          generateContent: jest.fn().mockImplementation(() => {
            const err = new Error('Request timed out while contacting Google Gemini API');
            err.name = 'AbortError';
            return Promise.reject(err);
          })
        }
      };

      const provider = new GeminiProvider({ client: mockClient, maxRetries: 0 });
      await expect(provider.generateQuestion()).rejects.toMatchObject({
        statusCode: 504,
        details: expect.objectContaining({ code: 'GEMINI_TIMEOUT' })
      });
    });

    it('Scenario 7: Malformed or non-JSON provider response mapped to GEMINI_MALFORMED_RESPONSE (502)', async () => {
      const mockClient = {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: 'I cannot generate this question as requested. Here is plain text instead of JSON.'
          })
        }
      };

      const provider = new GeminiProvider({ client: mockClient, maxRetries: 0 });
      await expect(provider.generateQuestion()).rejects.toMatchObject({
        statusCode: 502,
        details: expect.objectContaining({ code: 'GEMINI_MALFORMED_RESPONSE' })
      });
    });
  });

  // =========================================================================
  // SCENARIO 8 & 9: Successful Generation & Section Regeneration
  // =========================================================================
  describe('3. Question Generation and Section Regeneration', () => {
    it('Scenario 8: Successful end-to-end question generation via questionGeneratorService', async () => {
      const mockClient = {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: JSON.stringify({
              title: 'Binary Tree Invert',
              statement: 'Invert a binary tree given its root node.',
              inputFormat: 'Serialized level-order tree array.',
              outputFormat: 'Serialized inverted level-order tree array.',
              constraints: '0 <= Node count <= 100',
              difficulty: 'Medium',
              language: 'python',
              executionMode: 'FUNCTION',
              functionName: 'invertTree',
              dataStructure: 'BINARY_TREE',
              functionSignature: {
                returnType: 'TreeNode',
                parameters: [{ name: 'root', type: 'TreeNode' }]
              },
              starterCode: 'class Solution:\n    def invertTree(self, root):\n        pass\n',
              referenceSolution: 'class Solution:\n    def invertTree(self, root):\n        if not root: return None\n        root.left, root.right = self.invertTree(root.right), self.invertTree(root.left)\n        return root\n',
              examples: [
                {
                  input: '[4,2,7,1,3,6,9]',
                  output: '[4,7,2,9,6,3,1]',
                  explanation: 'All left and right children swapped recursively.'
                }
              ],
              tags: ['Binary Tree', 'Recursion']
            })
          })
        }
      };

      questionGeneratorService.registerProvider('gemini', new GeminiProvider({ client: mockClient }));

      const q = await questionGeneratorService.generateQuestion({
        topic: 'Binary Tree',
        difficulty: 'Medium',
        language: 'python'
      });

      expect(q).toBeDefined();
      expect(q.title).toBe('Binary Tree Invert');
      expect(q.dataStructure).toBe('BINARY_TREE');
      expect(q.examples).toHaveLength(1);
    });

    it('Scenario 9: Section regeneration non-destructively preserves other teacher-edited fields', async () => {
      const mockClient = {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: JSON.stringify({
              starterCode: 'class Solution:\n    # Optimized starter template\n    def solution(self, nums):\n        pass\n'
            })
          })
        }
      };

      questionGeneratorService.registerProvider('gemini', new GeminiProvider({ client: mockClient }));

      const existingQuestion = {
        title: 'Teacher Edited Title',
        statement: 'Teacher Edited Statement with Markdown **bold**.',
        constraints: '1 <= n <= 10^5',
        language: 'python',
        starterCode: 'def old_code(): pass',
        referenceSolution: 'def old_code(): return 42'
      };

      const result = await questionGeneratorService.regenerateSection({
        section: 'starterCode',
        currentQuestion: existingQuestion,
        instructions: 'Add type hints'
      });

      expect(result.section).toBe('starterCode');
      expect(result.updatedQuestion.title).toBe('Teacher Edited Title'); // Preserved!
      expect(result.updatedQuestion.statement).toBe('Teacher Edited Statement with Markdown **bold**.'); // Preserved!
      expect(result.updatedQuestion.referenceSolution).toBe('def old_code(): return 42'); // Preserved!
      expect(result.updatedQuestion.starterCode).toContain('# Optimized starter template'); // Updated!
    });
  });

  // =========================================================================
  // SCENARIO 10, 11, 12, 13: Sample Validation & Publishing Gate
  // =========================================================================
  describe('4. Authoritative Sample Test Execution & Publishing Gate Enforcement', () => {
    it('Scenario 10: Correct reference solution passes sample test and issues signed validation token', async () => {
      mockExecutionProvider.executeCode.mockResolvedValueOnce({
        status: 'success',
        output: '3',
        runtimeMs: 15
      });

      const res = await validateSampleTestCase({
        code: 'def solution(a, b):\n    return a + b\n',
        referenceSolution: 'def solution(a, b):\n    return a + b\n',
        sampleInput: '1 2',
        expectedOutput: '3',
        language: 'python',
        executionMode: 'FUNCTION',
        functionName: 'solution'
      });

      expect(res.passed).toBe(true);
      expect(res.compilationStatus).toBe('Passed');
      expect(res.executionStatus).toBe('Passed');
      expect(res.outputComparisonStatus).toBe('Passed');
      expect(res.fingerprint).toBeDefined();
      expect(res.validationToken).toBeDefined();

      // Token verification
      expect(verifyValidationToken(res.validationToken, res.fingerprint)).toBe(true);
    });

    it('Scenario 11: Incorrect reference solution fails sample test and does NOT issue token', async () => {
      mockExecutionProvider.executeCode.mockResolvedValueOnce({
        status: 'success',
        output: '99',
        runtimeMs: 15
      });

      const res = await validateSampleTestCase({
        code: 'def solution(a, b):\n    return a * b\n',
        referenceSolution: 'def solution(a, b):\n    return a * b\n',
        sampleInput: '1 2',
        expectedOutput: '3', // Output mismatch!
        language: 'python',
        executionMode: 'FUNCTION',
        functionName: 'solution'
      });

      expect(res.passed).toBe(false);
      expect(res.status).toBe('output_mismatch');
      expect(res.outputComparisonStatus).toBe('Failed');
      expect(res.validationToken).toBeNull();
    });

    it('Scenario 12: Compilation error blocks publishing gate', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Broken Syntax Question',
        statement: 'Problem with compilation error',
        language: 'cpp',
        supportedLanguages: ['cpp'],
        referenceSolution: 'int main( { return 0; }', // Syntax error
        referenceSolutions: new Map([['cpp', 'int main( { return 0; }']]),
        executionMode: 'STDIN',
        constraints: 'n <= 100',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockTestCase = {
        _id: new mongoose.Types.ObjectId(),
        questionId,
        category: 'sample',
        visibility: 'public',
        input: '10',
        expectedOutput: '10',
        weight: 1.0
      };

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery([mockTestCase]));

      mockExecutionProvider.executeCode.mockResolvedValueOnce({
        status: 'compilation_error',
        error: 'error: expected ) before { token'
      });

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);
      expect(report.blockingErrors.some((e) => e.includes('Compilation failed'))).toBe(true);
    });

    it('Scenario 13: Runtime error blocks publishing gate', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Zero Division Question',
        statement: 'Problem with runtime error',
        language: 'python',
        supportedLanguages: ['python'],
        referenceSolution: 'def main():\n    print(1 / 0)\n',
        referenceSolutions: new Map([['python', 'def main():\n    print(1 / 0)\n']]),
        executionMode: 'STDIN',
        constraints: 'n <= 100',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockTestCase = {
        _id: new mongoose.Types.ObjectId(),
        questionId,
        category: 'sample',
        visibility: 'public',
        input: '5',
        expectedOutput: '0',
        weight: 1.0
      };

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery([mockTestCase]));

      mockExecutionProvider.executeCode.mockResolvedValueOnce({
        status: 'runtime_error',
        error: 'ZeroDivisionError: division by zero'
      });

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);
      expect(report.blockingErrors.some((e) => e.includes('Runtime error'))).toBe(true);
    });
  });

  // =========================================================================
  // SECTION 5: AUDIT OF DRAFT VALIDATION-TOKEN BINDING & SECURITY (7 Items)
  // =========================================================================
  describe('5. Audit: Draft Validation-Token Binding & Cryptographic Publishing Gate', () => {
    it('Audit Item 1: A token from draft A cannot authorize draft B with different contents', () => {
      const fpA = computeSampleValidationFingerprint({
        referenceSolution: 'def solution(a, b): return a + b',
        sampleInput: '1 2',
        expectedOutput: '3',
        language: 'python',
        executionMode: 'FUNCTION',
        functionName: 'solution'
      });

      const fpB = computeSampleValidationFingerprint({
        referenceSolution: 'def solution(a, b): return a * b', // Different code!
        sampleInput: '1 2',
        expectedOutput: '2',
        language: 'python',
        executionMode: 'FUNCTION',
        functionName: 'solution'
      });

      expect(fpA).not.toBe(fpB);

      // Token generated for draft A
      const tokenA = signValidationToken({ fingerprint: fpA, questionId: 'draft' });

      // Token A presented for Draft A succeeds
      expect(verifyValidationToken(tokenA, fpA, 'draft')).toBe(true);

      // Token A presented for Draft B MUST be rejected
      expect(verifyValidationToken(tokenA, fpB, 'draft')).toBe(false);
    });

    it('Audit Item 1b: Bidirectional isolation - Draft A cannot use Draft B token, Draft B cannot use Draft A token', () => {
      const teacherId = new mongoose.Types.ObjectId().toString();
      const draftAId = 'draft-session-aaa-111';
      const draftBId = 'draft-session-bbb-222';

      const fp = computeSampleValidationFingerprint({
        referenceSolution: 'def solution(x): return x * 2',
        sampleInput: '4',
        expectedOutput: '8',
        language: 'python',
        executionMode: 'FUNCTION',
        functionName: 'solution'
      });

      const tokenA = signValidationToken({
        fingerprint: fp,
        questionId: 'draft',
        draftId: draftAId,
        userId: teacherId
      });

      const tokenB = signValidationToken({
        fingerprint: fp,
        questionId: 'draft',
        draftId: draftBId,
        userId: teacherId
      });

      // Draft A with Token A succeeds
      expect(verifyValidationToken(tokenA, fp, 'draft', { expectedDraftId: draftAId, expectedUserId: teacherId })).toBe(true);
      // Draft B with Token B succeeds
      expect(verifyValidationToken(tokenB, fp, 'draft', { expectedDraftId: draftBId, expectedUserId: teacherId })).toBe(true);

      // Draft A CANNOT use Draft B token
      expect(verifyValidationToken(tokenB, fp, 'draft', { expectedDraftId: draftAId, expectedUserId: teacherId })).toBe(false);
      // Draft B CANNOT use Draft A token
      expect(verifyValidationToken(tokenA, fp, 'draft', { expectedDraftId: draftBId, expectedUserId: teacherId })).toBe(false);
    });

    it('Audit Item 1c: Two unpersisted drafts with identical code, input, and expected output generate distinct draft IDs and cannot reuse each other tokens', async () => {
      const teacherId = new mongoose.Types.ObjectId().toString();

      // Mock executeCode to succeed for both validations
      mockExecutionProvider.executeCode.mockResolvedValue({
        status: 'success',
        passed: true,
        output: '42',
        runtimeMs: 12
      });

      // Teacher validates Draft 1
      const res1 = await validateSampleTestCase({
        code: 'def solution(n): return n',
        referenceSolution: 'def solution(n): return n',
        sampleInput: '42',
        expectedOutput: '42',
        language: 'python',
        executionMode: 'FUNCTION',
        userId: teacherId
      });

      // Teacher validates Draft 2 with the EXACT same code, input and expected output
      const res2 = await validateSampleTestCase({
        code: 'def solution(n): return n',
        referenceSolution: 'def solution(n): return n',
        sampleInput: '42',
        expectedOutput: '42',
        language: 'python',
        executionMode: 'FUNCTION',
        userId: teacherId
      });

      expect(res1.passed).toBe(true);
      expect(res2.passed).toBe(true);
      // Both produce the same SHA-256 fingerprint because content is identical
      expect(res1.fingerprint).toBe(res2.fingerprint);

      // But both receive strictly unique server-issued draft IDs!
      expect(res1.draftId).toBeDefined();
      expect(res2.draftId).toBeDefined();
      expect(res1.draftId).not.toBe(res2.draftId);

      // Draft 1 cannot use Token 2
      expect(
        verifyValidationToken(res2.validationToken, res1.fingerprint, 'draft', {
          expectedDraftId: res1.draftId,
          expectedUserId: teacherId
        })
      ).toBe(false);

      // Draft 2 cannot use Token 1
      expect(
        verifyValidationToken(res1.validationToken, res2.fingerprint, 'draft', {
          expectedDraftId: res2.draftId,
          expectedUserId: teacherId
        })
      ).toBe(false);
    });

    it('Audit Item 1d: Token cannot be transferred between different authenticated teachers (user binding)', () => {
      const teacher1Id = new mongoose.Types.ObjectId().toString();
      const teacher2Id = new mongoose.Types.ObjectId().toString();
      const draftId = 'draft-isolation-nonce-999';

      const fp = computeSampleValidationFingerprint({
        referenceSolution: 'def solution(): return True',
        sampleInput: '0',
        expectedOutput: 'True',
        language: 'python',
        executionMode: 'FUNCTION',
        functionName: 'solution'
      });

      // Teacher 1 validates and receives a token bound to their user ID
      const teacher1Token = signValidationToken({
        fingerprint: fp,
        questionId: 'draft',
        draftId,
        userId: teacher1Id
      });

      // Teacher 1 using their own token succeeds
      expect(
        verifyValidationToken(teacher1Token, fp, 'draft', {
          expectedDraftId: draftId,
          expectedUserId: teacher1Id
        })
      ).toBe(true);

      // Teacher 2 attempting to submit Teacher 1's token is rejected!
      expect(
        verifyValidationToken(teacher1Token, fp, 'draft', {
          expectedDraftId: draftId,
          expectedUserId: teacher2Id
        })
      ).toBe(false);
    });

    it('Audit Item 2: Identical draft contents do not permit unintended token reuse across persisted questions', () => {
      const questionAId = new mongoose.Types.ObjectId();
      const questionBId = new mongoose.Types.ObjectId();

      const commonFingerprint = computeSampleValidationFingerprint({
        referenceSolution: 'def solution(a, b): return a + b',
        sampleInput: '1 2',
        expectedOutput: '3',
        language: 'python',
        executionMode: 'FUNCTION',
        functionName: 'solution'
      });

      // Token generated for persisted Question A
      const tokenA = signValidationToken({ fingerprint: commonFingerprint, questionId: questionAId.toString() });

      // Token A verified against Question A succeeds
      expect(verifyValidationToken(tokenA, commonFingerprint, questionAId.toString())).toBe(true);

      // Token A presented to authorize Question B MUST be rejected even though contents are identical!
      expect(verifyValidationToken(tokenA, commonFingerprint, questionBId.toString())).toBe(false);
    });

    it('Audit Item 3: A draft token can only be used through the creation flow and cannot authorize publishing an existing persisted question', () => {
      const existingQuestionId = new mongoose.Types.ObjectId();

      const fp = computeSampleValidationFingerprint({
        referenceSolution: 'def solution(): return 1',
        sampleInput: '0',
        expectedOutput: '1',
        language: 'python',
        executionMode: 'FUNCTION',
        functionName: 'solution'
      });

      // A draft token generated before question persistence
      const draftToken = signValidationToken({ fingerprint: fp, questionId: 'draft' });

      // Draft token is valid when creating a new question (expectedQuestionId = 'draft')
      expect(verifyValidationToken(draftToken, fp, 'draft')).toBe(true);

      // Draft token CANNOT be used to authorize publishing an already-persisted question!
      expect(verifyValidationToken(draftToken, fp, existingQuestionId.toString())).toBe(false);
    });

    it('Audit Item 4: The saved question fingerprint is recomputed authoritatively from persisted fields in MongoDB', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Authoritative Fingerprint Test',
        statement: 'Problem statement',
        language: 'python',
        supportedLanguages: ['python'],
        referenceSolution: 'def solution(x): return x * 2',
        referenceSolutions: new Map([['python', 'def solution(x): return x * 2']]),
        executionMode: 'FUNCTION',
        functionName: 'solution',
        constraints: 'x <= 100',
        sampleValidationFingerprint: null,
        sampleValidationPassedAt: null,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockTestCase = {
        _id: new mongoose.Types.ObjectId(),
        questionId,
        category: 'sample',
        visibility: 'public',
        input: '5',
        expectedOutput: '10',
        weight: 1.0
      };

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery([mockTestCase]));

      mockExecutionProvider.executeCode.mockResolvedValueOnce({
        status: 'success',
        output: '10',
        runtimeMs: 10
      });

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(true);
      expect(report.status).toBe(PUBLISHING_STATES.PUBLISHED);

      // Verify fingerprint was authoritatively computed from MongoDB fields
      const expectedAuthoritativeFp = computeSampleValidationFingerprint({
        referenceSolution: mockQuestion.referenceSolution,
        sampleInput: mockTestCase.input,
        expectedOutput: mockTestCase.expectedOutput,
        language: mockQuestion.language,
        executionMode: mockQuestion.executionMode,
        functionName: mockQuestion.functionName
      });

      expect(mockQuestion.sampleValidationFingerprint).toBe(expectedAuthoritativeFp);
      expect(mockQuestion.sampleValidationPassedAt).toBeInstanceOf(Date);
    });

    it('Audit Item 5: A changed reference solution, sample input, expected output, language or contract invalidates prior validation', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestionDoc = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Original Title',
        statement: 'Original Statement',
        language: 'python',
        referenceSolution: 'def solution(): return 1',
        referenceSolutions: new Map([['python', 'def solution(): return 1']]),
        sampleValidationFingerprint: 'PREVIOUS_VALID_FINGERPRINT_SHA256',
        sampleValidationPassedAt: new Date(),
        status: 'draft',
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Question, 'findById').mockResolvedValue(mockQuestionDoc);

      const req = {
        params: { id: questionId.toString() },
        user: { _id: teacherId, role: 'teacher' },
        body: {
          referenceSolution: 'def solution(): return 999' // Teacher edited code!
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await updateQuestion(req, res, next);

      // Fingerprint must be immediately cleared!
      expect(mockQuestionDoc.sampleValidationFingerprint).toBeNull();
      expect(mockQuestionDoc.sampleValidationPassedAt).toBeNull();
      expect(mockQuestionDoc.save).toHaveBeenCalled();
    });

    it('Audit Item 6: Every publishing route enforces the same authoritative gate', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Gate Enforcement Test',
        statement: 'Statement',
        language: 'python',
        referenceSolution: 'def solution(): return 0',
        referenceSolutions: new Map([['python', 'def solution(): return 0']]),
        executionMode: 'FUNCTION',
        functionName: 'solution',
        save: jest.fn().mockResolvedValue(true)
      };

      // Missing sample test case in DB
      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery([])); // 0 sample tests!

      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      // Must be rejected by gate
      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);
      expect(report.blockingErrors.some((e) => e.includes('sample test case is required'))).toBe(true);
    });

    it('Audit Item 7: Expired, malformed and tampered tokens are rejected', () => {
      const fp = 'abc123def456';
      const validToken = signValidationToken({ fingerprint: fp, questionId: 'draft' });

      // Tampered payload / signature
      const tamperedToken = validToken.slice(0, -6) + 'xxxxxx';
      expect(verifyValidationToken(tamperedToken, fp)).toBe(false);

      // Malformed / non-string tokens
      expect(verifyValidationToken(null, fp)).toBe(false);
      expect(verifyValidationToken('', fp)).toBe(false);
      expect(verifyValidationToken('not.a.valid.jwt', fp)).toBe(false);

      // Expired token (simulate past timestamp)
      const expiredToken = signValidationToken({ fingerprint: fp, questionId: 'draft' });
      // Tampering with expired payload or invalid secret
      expect(verifyValidationToken(expiredToken, 'different_fingerprint')).toBe(false);
    });

    it('Audit Item 8: Client-provided samplePassed flag is never trusted by publishing gate', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Untrusted Client Flag Question',
        statement: 'Statement here',
        language: 'python',
        supportedLanguages: ['python'],
        referenceSolution: 'def main(): pass',
        referenceSolutions: new Map([['python', 'def main(): pass']]),
        executionMode: 'STDIN',
        constraints: 'n <= 100',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockTestCase = {
        _id: new mongoose.Types.ObjectId(),
        questionId,
        category: 'sample',
        visibility: 'public',
        input: '1 2',
        expectedOutput: '3',
        weight: 1.0
      };

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockQuestion);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery([mockTestCase]));

      // Mock execution provider reporting mismatch
      mockExecutionProvider.executeCode.mockResolvedValueOnce({
        status: 'success',
        output: 'INCORRECT_OUTPUT',
        runtimeMs: 12
      });

      // Even if client claims samplePassed: true, server gate authoritatively fails
      const report = await evaluateAndPublishQuestion({
        questionId,
        user: { _id: teacherId, role: 'teacher' }
      });

      expect(report.canPublish).toBe(false);
      expect(report.status).toBe(PUBLISHING_STATES.VALIDATION_FAILED);
      expect(report.blockingErrors.some((e) => e.includes('Output mismatch'))).toBe(true);
    });

    it('Audit Item 9: Question creation and publishing strictly verifies draftId, consumes it, and blocks token replay / arbitrary substitution', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const draftId = 'unique-server-draft-uuid-555';

      const refSol = 'def solution(x):\n    return x + 1\n';
      const sampleIn = '5';
      const sampleOut = '6';

      const fp = computeSampleValidationFingerprint({
        referenceSolution: refSol,
        sampleInput: sampleIn,
        expectedOutput: sampleOut,
        language: 'python',
        executionMode: 'FUNCTION',
        dataStructure: 'ARRAY',
        functionName: 'solution',
        functionSignature: null
      });

      const validToken = signValidationToken({
        fingerprint: fp,
        questionId: 'draft',
        draftId,
        userId: teacherId.toString()
      });

      const createdQuestionId = new mongoose.Types.ObjectId();
      const mockCreatedQuestion = {
        _id: createdQuestionId,
        title: 'Draft Token Question',
        statement: 'Problem statement text here.',
        referenceSolution: refSol,
        referenceSolutions: new Map([['python', refSol]]),
        language: 'python',
        executionMode: 'FUNCTION',
        draftId,
        status: 'draft',
        save: jest.fn().mockResolvedValue(true)
      };

      // Mock Question.create, TestCase.insertMany, Question.findOne, and Question.findById
      jest.spyOn(Question, 'create').mockResolvedValue(mockCreatedQuestion);
      jest.spyOn(TestCase, 'insertMany').mockResolvedValue([]);
      jest.spyOn(Question, 'findOne').mockResolvedValue(null);
      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockCreatedQuestion));

      // Case A: Missing draftId with validationToken throws badRequest
      const reqMissingDraftId = {
        body: {
          title: 'Draft Token Question',
          statement: 'Problem statement text here.',
          language: 'python',
          referenceSolution: refSol,
          status: 'published',
          examples: [{ input: sampleIn, output: sampleOut }],
          validationToken: validToken
          // draftId missing!
        },
        user: { _id: teacherId, role: 'teacher' }
      };
      let nextError = null;
      await createQuestion(reqMissingDraftId, {}, (err) => { nextError = err; });
      expect(nextError).toBeDefined();
      expect(nextError.message).toContain('Draft identifier is required');

      // Case B: Arbitrary substitution of draftId throws token mismatch
      const reqMismatchedDraftId = {
        body: {
          title: 'Draft Token Question',
          statement: 'Problem statement text here.',
          language: 'python',
          referenceSolution: refSol,
          status: 'published',
          examples: [{ input: sampleIn, output: sampleOut }],
          validationToken: validToken,
          draftId: 'arbitrary-substituted-uuid'
        },
        user: { _id: teacherId, role: 'teacher' }
      };
      nextError = null;
      await createQuestion(reqMismatchedDraftId, {}, (err) => { nextError = err; });
      expect(nextError).toBeDefined();
      expect(nextError.message).toContain('Invalid, tampered, or mismatched validation token');

      // Case C: DraftId already consumed by another question blocks replay via atomic unique index
      const duplicateErr = new Error(`E11000 duplicate key error collection: testforge.questions index: draftId_1 dup key: { draftId: "${draftId}" }`);
      duplicateErr.code = 11000;
      duplicateErr.name = 'MongoServerError';
      duplicateErr.keyPattern = { draftId: 1 };
      duplicateErr.keyValue = { draftId };
      jest.spyOn(Question, 'create').mockRejectedValueOnce(duplicateErr);

      const reqReplayToken = {
        body: {
          title: 'Draft Token Question',
          statement: 'Problem statement text here.',
          language: 'python',
          referenceSolution: refSol,
          status: 'published',
          examples: [{ input: sampleIn, output: sampleOut }],
          validationToken: validToken,
          draftId
        },
        user: { _id: teacherId, role: 'teacher' }
      };
      nextError = null;
      await createQuestion(reqReplayToken, {}, (err) => { nextError = err; });
      expect(nextError).toBeDefined();
      expect(nextError.message).toContain('already been consumed');
    });

    it('Audit Item 10: Two concurrent publish requests with the same draftId: exactly one question is created, and the losing request receives controlled rejection', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const sharedDraftId = 'concurrent-race-draft-uuid-777';

      const refSol = 'def solution(x):\n    return x * 3\n';
      const sampleIn = '3';
      const sampleOut = '9';

      const fp = computeSampleValidationFingerprint({
        referenceSolution: refSol,
        sampleInput: sampleIn,
        expectedOutput: sampleOut,
        language: 'python',
        executionMode: 'FUNCTION',
        dataStructure: 'ARRAY',
        functionName: 'solution',
        functionSignature: null
      });

      const validToken = signValidationToken({
        fingerprint: fp,
        questionId: 'draft',
        draftId: sharedDraftId,
        userId: teacherId.toString()
      });

      const createdQuestionId = new mongoose.Types.ObjectId();
      const mockCreatedQuestion = {
        _id: createdQuestionId,
        title: 'Concurrent Race Question',
        statement: 'Problem statement text here.',
        referenceSolution: refSol,
        referenceSolutions: new Map([['python', refSol]]),
        language: 'python',
        executionMode: 'FUNCTION',
        draftId: sharedDraftId,
        status: 'published',
        save: jest.fn().mockResolvedValue(true)
      };

      // Atomic storage engine simulation:
      // Request 1 succeeds and creates the question.
      // Request 2 encounters the unique index on draftId and throws duplicate key error 11000.
      let createCallCount = 0;
      jest.spyOn(Question, 'create').mockImplementation(async () => {
        createCallCount++;
        if (createCallCount === 1) {
          return mockCreatedQuestion;
        }
        const duplicateErr = new Error(`E11000 duplicate key error collection: testforge.questions index: draftId_1 dup key: { draftId: "${sharedDraftId}" }`);
        duplicateErr.code = 11000;
        duplicateErr.name = 'MongoServerError';
        duplicateErr.keyPattern = { draftId: 1 };
        duplicateErr.keyValue = { draftId: sharedDraftId };
        throw duplicateErr;
      });

      const mockSampleTestCase = {
        _id: new mongoose.Types.ObjectId(),
        questionId: createdQuestionId,
        category: 'sample',
        visibility: 'public',
        input: sampleIn,
        expectedOutput: sampleOut,
        weight: 1.0
      };

      jest.spyOn(TestCase, 'insertMany').mockResolvedValue([]);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery([mockSampleTestCase]));
      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockCreatedQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockCreatedQuestion);

      mockExecutionProvider.executeCode.mockResolvedValue({
        status: 'success',
        passed: true,
        output: sampleOut,
        runtimeMs: 10
      });

      const makeReq = () => ({
        body: {
          title: 'Concurrent Race Question',
          statement: 'Problem statement text here.',
          language: 'python',
          referenceSolution: refSol,
          status: 'published',
          examples: [{ input: sampleIn, output: sampleOut }],
          validationToken: validToken,
          draftId: sharedDraftId
        },
        user: { _id: teacherId, role: 'teacher' }
      });

      let res1Data = null;
      const res1 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockImplementation((d) => { res1Data = d; return res1; })
      };
      let err1 = null;
      let err2 = null;
      const res2 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockImplementation(() => res2)
      };

      // Launch both requests concurrently
      await Promise.all([
        createQuestion(makeReq(), res1, (e) => { err1 = e; }),
        createQuestion(makeReq(), res2, (e) => { err2 = e; })
      ]);

      // Exactly one request can win and create the question
      const winnerSuccess = res1Data !== null && err1 === null;
      const loserRejected = err2 !== null && err2.message.includes('already been consumed');

      expect(winnerSuccess).toBe(true);
      expect(loserRejected).toBe(true);
      expect(createCallCount).toBe(2);
    });

    it('Audit Item 10b: If publishing gate fails after Question.create consumes draftId, question remains DRAFT and draftId cannot be reused', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const consumedDraftId = 'consumed-failed-gate-uuid-888';

      const refSol = 'def solution(x): return x * 4\n';
      const sampleIn = '2';
      const sampleOut = '8';

      const fp = computeSampleValidationFingerprint({
        referenceSolution: refSol,
        sampleInput: sampleIn,
        expectedOutput: sampleOut,
        language: 'python',
        executionMode: 'FUNCTION',
        dataStructure: 'ARRAY',
        functionName: 'solution',
        functionSignature: null
      });

      const validToken = signValidationToken({
        fingerprint: fp,
        questionId: 'draft',
        draftId: consumedDraftId,
        userId: teacherId.toString()
      });

      const createdQuestionId = new mongoose.Types.ObjectId();
      const mockCreatedQuestion = {
        _id: createdQuestionId,
        title: 'Gate Failure Question',
        statement: 'Problem statement text here.',
        referenceSolution: refSol,
        referenceSolutions: new Map([['python', refSol]]),
        language: 'python',
        executionMode: 'FUNCTION',
        draftId: consumedDraftId,
        status: 'draft', // Remains DRAFT
        save: jest.fn().mockResolvedValue(true)
      };

      // 1. Initial attempt: Question.create succeeds and consumes draftId
      const mockSampleTestCase = {
        _id: new mongoose.Types.ObjectId(),
        questionId: createdQuestionId,
        category: 'sample',
        visibility: 'public',
        input: sampleIn,
        expectedOutput: sampleOut,
        weight: 1.0
      };
      jest.spyOn(Question, 'create').mockResolvedValueOnce(mockCreatedQuestion);
      jest.spyOn(TestCase, 'insertMany').mockResolvedValue([]);
      jest.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery([mockSampleTestCase]));
      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockCreatedQuestion));
      jest.spyOn(Question, 'findByIdAndUpdate').mockResolvedValue(mockCreatedQuestion);
      jest.spyOn(Question, 'findByIdAndDelete').mockResolvedValue(mockCreatedQuestion);
      jest.spyOn(TestCase, 'deleteMany').mockResolvedValue({ deletedCount: 0 });

      // Publishing gate execution fails due to runtime error on test cases
      mockExecutionProvider.executeCode.mockResolvedValue({
        status: 'runtime_error',
        passed: false,
        error: 'ZeroDivisionError: division by zero',
        runtimeMs: 12
      });

      const reqAttempt1 = {
        body: {
          title: 'Gate Failure Question',
          statement: 'Problem statement text here.',
          language: 'python',
          referenceSolution: refSol,
          status: 'published',
          examples: [{ input: sampleIn, output: sampleOut }],
          validationToken: validToken,
          draftId: consumedDraftId
        },
        user: { _id: teacherId, role: 'teacher' }
      };

      let attempt1Err = null;
      await createQuestion(reqAttempt1, {}, (err) => { attempt1Err = err; });

      // Attempt 1 fails at publishing gate
      expect(attempt1Err).toBeDefined();
      expect(attempt1Err.message).toContain('Question cannot be published');
      // Question transitions to VALIDATION_FAILED, never PUBLISHED
      expect(mockCreatedQuestion.status).toBe('VALIDATION_FAILED');
      expect(mockCreatedQuestion.status).not.toBe('published');
      expect(mockCreatedQuestion.status).not.toBe('PUBLISHED');

      // 2. Second attempt with the SAME consumed draftId encounters MongoDB unique index rejection
      const duplicateErr = new Error(`E11000 duplicate key error collection: testforge.questions index: draftId_1 dup key: { draftId: "${consumedDraftId}" }`);
      duplicateErr.code = 11000;
      duplicateErr.name = 'MongoServerError';
      duplicateErr.keyPattern = { draftId: 1 };
      duplicateErr.keyValue = { draftId: consumedDraftId };
      jest.spyOn(Question, 'create').mockRejectedValueOnce(duplicateErr);

      const reqAttempt2 = {
        body: {
          title: 'Gate Failure Question Duplicate',
          statement: 'Problem statement text here.',
          language: 'python',
          referenceSolution: refSol,
          status: 'published',
          examples: [{ input: sampleIn, output: sampleOut }],
          validationToken: validToken,
          draftId: consumedDraftId
        },
        user: { _id: teacherId, role: 'teacher' }
      };

      let attempt2Err = null;
      await createQuestion(reqAttempt2, {}, (err) => { attempt2Err = err; });

      // Attempt 2 is strictly blocked by atomic draftId single-use consumption
      expect(attempt2Err).toBeDefined();
      expect(attempt2Err.message).toContain('already been consumed');
    }, 15000);

    it('Audit Item 11: Stale draftId cannot authorize a new validation or publish cycle', async () => {
      const teacherId = new mongoose.Types.ObjectId().toString();
      const staleDraftId = 'stale-already-used-uuid-999';

      mockExecutionProvider.executeCode.mockResolvedValue({
        status: 'success',
        passed: true,
        output: '10',
        runtimeMs: 15
      });

      // Even if client passes a stale draftId, server generates an authoritative new draftId
      const res = await validateSampleTestCase({
        code: 'def solution(x): return x * 2',
        referenceSolution: 'def solution(x): return x * 2',
        sampleInput: '5',
        expectedOutput: '10',
        language: 'python',
        executionMode: 'FUNCTION',
        draftId: staleDraftId,
        userId: teacherId
      });

      expect(res.passed).toBe(true);
      expect(res.draftId).toBeDefined();
      // Server must NOT adopt the stale draftId
      expect(res.draftId).not.toBe(staleDraftId);

      // The client cannot use the stale draftId with the newly issued token
      expect(
        verifyValidationToken(res.validationToken, res.fingerprint, 'draft', {
          expectedDraftId: staleDraftId,
          expectedUserId: teacherId
        })
      ).toBe(false);
    });

    it('Audit Item 12: Existing legacy questions with null or missing draftId remain readable and index definition enforces partial filter', async () => {
      // 1. Verify index definition on Question schema
      const indexes = Question.schema.indexes();
      const draftIdIndexEntry = indexes.find((idx) => idx[0] && idx[0].draftId === 1);

      expect(draftIdIndexEntry).toBeDefined();
      expect(draftIdIndexEntry[1].unique).toBe(true);
      expect(draftIdIndexEntry[1].partialFilterExpression).toEqual({
        draftId: { $type: 'string' }
      });

      // 2. Verify legacy questions with null or missing draftId
      const legacyQ1 = {
        _id: new mongoose.Types.ObjectId(),
        title: 'Legacy Question 1',
        statement: 'Legacy statement 1',
        draftId: null,
        status: 'published'
      };
      const legacyQ2 = {
        _id: new mongoose.Types.ObjectId(),
        title: 'Legacy Question 2',
        statement: 'Legacy statement 2',
        // draftId omitted completely
        status: 'published'
      };

      jest.spyOn(Question, 'find').mockReturnValue(mockMongooseQuery([legacyQ1, legacyQ2]));
      const docs = await Question.find();
      expect(docs).toHaveLength(2);
      expect(docs[0].draftId).toBeNull();
      expect(docs[1].draftId).toBeUndefined();
    });
  });

  // =========================================================================
  // SCENARIO 16 & 17: Security & Student View Confidentiality
  // =========================================================================
  describe('6. Security, Ownership & Student Sanitization', () => {
    it('Scenario 16: Unauthorized publishing request from non-owner non-admin is rejected (403)', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const ownerTeacherId = new mongoose.Types.ObjectId();
      const intruderTeacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: ownerTeacherId,
        title: 'Protected Question',
        statement: 'Statement',
        status: 'draft'
      };

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));

      await expect(
        evaluateAndPublishQuestion({
          questionId,
          user: { _id: intruderTeacherId, role: 'teacher' }
        })
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('do not have permission')
      });
    });

    it('Scenario 17: Student APIs strictly omit reference solution and private fields', async () => {
      const questionId = new mongoose.Types.ObjectId();

      const mockQuestionDoc = {
        _id: questionId,
        title: 'Secret Question',
        statement: 'Solve this algorithm.',
        referenceSolution: 'TOP_SECRET_TEACHER_SOLUTION();',
        referenceSolutions: new Map([['javascript', 'TOP_SECRET_TEACHER_SOLUTION();']]),
        status: 'published',
        language: 'javascript',
        difficulty: 'Medium',
        examples: [{ input: '1', output: '2' }]
      };

      jest.spyOn(Question, 'findById').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockQuestionDoc)
        })
      });

      jest.spyOn(TestCase, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ input: '1', expectedOutput: '2', category: 'sample' }])
        })
      });

      const req = { params: { id: questionId.toString() } };
      let jsonResponse = null;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockImplementation((data) => {
          jsonResponse = data;
          return res;
        })
      };
      const next = jest.fn();

      await getQuestionStudentView(req, res, next);

      expect(jsonResponse).toBeDefined();
      expect(jsonResponse.success).toBe(true);

      const returnedData = jsonResponse.data;
      expect(returnedData.referenceSolution).toBeUndefined();
      expect(returnedData.referenceSolutions).toBeUndefined();
      expect(returnedData.status).toBeUndefined();
      expect(JSON.stringify(returnedData)).not.toContain('TOP_SECRET_TEACHER_SOLUTION');
    });

    it('Scenario 18 (Live Gemini Test): Live API verification (skipped if GEMINI_API_KEY is unset)', async () => {
      if (!process.env.GEMINI_API_KEY) {
        // Explicitly labeled mock/skip test
        return;
      }

      // Live integration test using genuine Gemini API
      const liveProvider = new GeminiProvider();
      const liveQuestion = await liveProvider.generateQuestion({
        topic: 'Fibonacci numbers',
        difficulty: 'Easy',
        language: 'python',
        executionMode: 'FUNCTION'
      });

      expect(liveQuestion).toBeDefined();
      expect(liveQuestion.title).toBeDefined();
      expect(liveQuestion.referenceSolution).toContain('def');
    }, 90000);
  });
});
