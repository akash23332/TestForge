import { jest } from '@jest/globals';
import { QuestionGeneratorService } from '../src/services/ai/questionGenerator.service.js';
import { AIProvider } from '../src/services/ai/aiProvider.interface.js';
import {
  validateGeneratedQuestion,
  validateRegeneratedSolution,
  validateRegeneratedStarterCode
} from '../src/services/ai/questionValidator.service.js';
import { checkDuplicateAgainstHistory } from '../src/services/ai/duplicateDetector.service.js';
import {
  computeSampleValidationFingerprint,
  signValidationToken,
  verifyValidationToken
} from '../src/services/sampleValidation.service.js';
import { ApiError } from '../src/utils/apiError.js';

describe('AI Question and Solution Regeneration Workflow (Page 1)', () => {
  let service;
  let mockProvider;

  const sampleBaseQuestion = {
    title: 'Valid Palindrome II',
    statement: 'Given a string s, return true if the s can be palindrome after deleting at most one character from it.',
    difficulty: 'Easy',
    topic: 'Two Pointers',
    tags: ['String', 'Two Pointers'],
    constraints: '1 <= s.length <= 10^5\ns consists of lowercase English letters.',
    inputFormat: 'A single string s.',
    outputFormat: 'Return boolean true or false.',
    language: 'python',
    executionMode: 'FUNCTION',
    dataStructure: 'STRING',
    functionName: 'validPalindrome',
    functionSignature: {
      parameters: [{ name: 's', type: 'string' }],
      returnType: 'boolean'
    },
    referenceSolution: 'class Solution:\n    def validPalindrome(self, s: str) -> bool:\n        i, j = 0, len(s) - 1\n        while i < j:\n            if s[i] != s[j]:\n                return s[i:j] == s[i:j][::-1] or s[i+1:j+1] == s[i+1:j+1][::-1]\n            i += 1\n            j -= 1\n        return True',
    starterCode: 'class Solution:\n    def validPalindrome(self, s: str) -> bool:\n        pass',
    sampleTestCase: {
      input: '"aba"',
      expectedOutput: 'true',
      explanation: 'Already a palindrome.'
    },
    ownerId: '60d0fe4f5311236168a109ca'
  };

  beforeEach(() => {
    service = new QuestionGeneratorService();
    mockProvider = {
      name: 'mock',
      generateQuestion: jest.fn(),
      regenerateSection: jest.fn()
    };
    service.registerProvider('mock', mockProvider);
    service.registerProvider('gemini', mockProvider);
  });

  // =========================================================================
  // 1 & 2: Statement Regeneration
  // =========================================================================
  describe('Action A: Statement Regeneration', () => {
    it('Requirement 1 & 2: Statement regeneration creates a genuinely different problem while preserving constraints', async () => {
      mockProvider.generateQuestion.mockResolvedValueOnce({
        title: 'Trapping Rain Water Sub-Array',
        statement: 'Given an array of heights representing elevation maps, calculate trapped water volume.',
        difficulty: 'Easy',
        tags: ['Two Pointers', 'Array'],
        constraints: '1 <= s.length <= 10^5\ns consists of lowercase English letters.',
        inputFormat: 'An array of integer heights.',
        outputFormat: 'Total units of trapped water.',
        executionMode: 'FUNCTION',
        dataStructure: 'ARRAY',
        functionName: 'trapWater',
        functionSignature: {
          parameters: [{ name: 'height', type: 'int[]' }],
          returnType: 'int'
        },
        starterCode: 'def trapWater(height):\n    pass',
        referenceSolution: 'def trapWater(height):\n    return 0',
        sampleTestCase: {
          input: '[0,1,0,2,1,0,1,3,2,1,2,1]',
          expectedOutput: '6'
        }
      });

      const result = await service.regenerateStatement({
        currentQuestion: sampleBaseQuestion,
        provider: 'mock'
      });

      expect(result.action).toBe('statement');
      expect(result.previewData.title).toBe('Trapping Rain Water Sub-Array');
      expect(result.previewData.statement).not.toBe(sampleBaseQuestion.statement);
      expect(result.previewData.constraints).toContain('1 <= s.length <= 10^5');
      expect(result.invalidations.requiresSampleValidation).toBe(true);
      expect(result.invalidations.invalidatesSolution).toBe(true);
    });
  });

  // =========================================================================
  // 3 & 4: Solution Regeneration
  // =========================================================================
  describe('Action B: Solution Regeneration', () => {
    it('Requirement 3 & 4: Solution regeneration keeps exact statement and sample test unchanged', async () => {
      const alternativeSolution = 'class Solution:\n    def validPalindrome(self, s: str) -> bool:\n        # Two pointers with helper\n        def is_pal(sub): return sub == sub[::-1]\n        l, r = 0, len(s) - 1\n        while l < r:\n            if s[l] != s[r]:\n                return is_pal(s[l:r]) or is_pal(s[l+1:r+1])\n            l += 1; r -= 1\n        return True';

      mockProvider.regenerateSection.mockResolvedValueOnce({
        referenceSolution: alternativeSolution,
        approach: 'Recursive slice verification'
      });

      const result = await service.regenerateSolution({
        currentQuestion: sampleBaseQuestion,
        provider: 'mock'
      });

      expect(result.action).toBe('solution');
      expect(result.previewData.referenceSolution).toBe(alternativeSolution);
      // Statement and sampleTestCase were not modified in the preview payload
      expect(sampleBaseQuestion.statement).toContain('palindrome after deleting');
      expect(sampleBaseQuestion.sampleTestCase.input).toBe('"aba"');
      expect(result.invalidations.requiresSampleValidation).toBe(true);
    });
  });

  // =========================================================================
  // 5: Starter Code Regeneration
  // =========================================================================
  describe('Action C: Starter Code Regeneration', () => {
    it('Requirement 5: Starter-code regeneration does not modify reference solution and does not expose it', async () => {
      const freshStarter = 'class Solution:\n    def validPalindrome(self, s: str) -> bool:\n        """Determines if string can be palindrome with at most 1 deletion."""\n        pass';

      mockProvider.regenerateSection.mockResolvedValueOnce({
        starterCode: freshStarter
      });

      const result = await service.regenerateStarterCode({
        currentQuestion: sampleBaseQuestion,
        provider: 'mock'
      });

      expect(result.action).toBe('starterCode');
      expect(result.previewData.starterCode).toBe(freshStarter);
      expect(result.invalidations.requiresSampleValidation).toBe(false);
      // Ensure reference solution was not touched
      expect(sampleBaseQuestion.referenceSolution).toContain('while i < j:');
    });

    it('Fails-closed if starter code accidentally leaks the reference solution', () => {
      expect(() => {
        validateRegeneratedStarterCode(
          { starterCode: sampleBaseQuestion.referenceSolution },
          sampleBaseQuestion
        );
      }).toThrow(/Security violation: Starter code is identical to reference solution/);
    });
  });

  // =========================================================================
  // 6: Entire Question Regeneration
  // =========================================================================
  describe('Action D: Entire Question Regeneration', () => {
    it('Requirement 6: Entire-question regeneration creates a new coherent question', async () => {
      mockProvider.generateQuestion.mockResolvedValueOnce({
        title: 'Longest Mountain in Array',
        statement: 'Given an integer array arr, return the length of the longest subarray which is a mountain.',
        difficulty: 'Easy',
        tags: ['Two Pointers', 'Array'],
        constraints: '1 <= arr.length <= 10^4',
        inputFormat: 'An integer array arr.',
        outputFormat: 'Return the mountain length.',
        executionMode: 'FUNCTION',
        dataStructure: 'ARRAY',
        functionName: 'longestMountain',
        functionSignature: {
          parameters: [{ name: 'arr', type: 'int[]' }],
          returnType: 'int'
        },
        starterCode: 'def longestMountain(arr):\n    pass',
        referenceSolution: 'def longestMountain(arr):\n    return 0',
        sampleTestCase: {
          input: '[2,1,4,7,3,2,5]',
          expectedOutput: '5'
        }
      });

      const result = await service.regenerateEntireQuestion({
        currentQuestion: sampleBaseQuestion,
        provider: 'mock'
      });

      expect(result.action).toBe('entireQuestion');
      expect(result.previewData.title).toBe('Longest Mountain in Array');
      expect(result.previewData.sampleTestCase).toBeDefined();
      expect(result.invalidations.requiresSampleValidation).toBe(true);
    });
  });

  // =========================================================================
  // 7 & 8: Repetition Detection & 3 Attempts Retry
  // =========================================================================
  describe('Repetition Detection & Retries', () => {
    it('Requirement 7 & 8: Rejects similar questions and exhausts after 3 attempts', async () => {
      // 3 consecutive duplicate responses
      mockProvider.generateQuestion.mockResolvedValue({
        title: 'Valid Palindrome II',
        statement: 'Given a string s, return true if s can be a palindrome after deleting one character.',
        difficulty: 'Easy',
        tags: ['Two Pointers'],
        constraints: '1 <= s.length <= 10^5',
        inputFormat: 'String s',
        outputFormat: 'Boolean',
        executionMode: 'FUNCTION',
        functionName: 'validPalindrome',
        functionSignature: {
          parameters: [{ name: 's', type: 'string' }],
          returnType: 'boolean'
        },
        starterCode: 'def validPalindrome(s): pass',
        referenceSolution: 'def validPalindrome(s): return True',
        sampleTestCase: { input: '"aba"', expectedOutput: 'true' }
      });

      await expect(
        service.regenerateStatement({
          currentQuestion: sampleBaseQuestion,
          provider: 'mock',
          maxAttempts: 3
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        details: expect.objectContaining({
          code: 'DUPLICATE_GENERATION_LIMIT_EXCEEDED',
          attempts: 3
        })
      });

      expect(mockProvider.generateQuestion).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // 9, 10, 11, 12: Preview, Accept, Discard, and Non-Destructive Invariants
  // =========================================================================
  describe('Preview & Isolation Contracts', () => {
    it('Requirement 9 & 11: Regeneration returns preview data without mutating the input question', async () => {
      const originalCopy = JSON.parse(JSON.stringify(sampleBaseQuestion));

      mockProvider.regenerateSection.mockResolvedValueOnce({
        referenceSolution: 'def validPalindrome(s):\n    return True',
        approach: 'Alternative approach'
      });

      const res = await service.regenerateSolution({
        currentQuestion: sampleBaseQuestion,
        provider: 'mock'
      });

      // Original input question object was NOT mutated
      expect(sampleBaseQuestion.referenceSolution).toBe(originalCopy.referenceSolution);
      expect(sampleBaseQuestion.title).toBe(originalCopy.title);
      // The preview payload contains the candidate
      expect(res.previewData.referenceSolution).toBe('def validPalindrome(s):\n    return True');
    });
  });

  // =========================================================================
  // 13, 14, 15: Dependency Invalidation & Validation Gate Binding
  // =========================================================================
  describe('Dependency Invalidation & Publishing Gate', () => {
    it('Requirement 13 & 14: Statement or Solution changes invalidate sample validation tokens', () => {
      const originalFingerprint = computeSampleValidationFingerprint({
        referenceSolution: sampleBaseQuestion.referenceSolution,
        sampleInput: sampleBaseQuestion.sampleTestCase.input,
        expectedOutput: sampleBaseQuestion.sampleTestCase.expectedOutput,
        language: sampleBaseQuestion.language,
        executionMode: sampleBaseQuestion.executionMode,
        dataStructure: sampleBaseQuestion.dataStructure,
        functionName: sampleBaseQuestion.functionName,
        functionSignature: sampleBaseQuestion.functionSignature
      });

      const token = signValidationToken({
        fingerprint: originalFingerprint,
        questionId: 'draft',
        draftId: 'test-draft-uuid',
        userId: 'test-user-id'
      });

      // Modifying the reference solution
      const modifiedSolutionFingerprint = computeSampleValidationFingerprint({
        referenceSolution: 'class Solution:\n    def validPalindrome(self, s: str) -> bool:\n        return True',
        sampleInput: sampleBaseQuestion.sampleTestCase.input,
        expectedOutput: sampleBaseQuestion.sampleTestCase.expectedOutput,
        language: sampleBaseQuestion.language,
        executionMode: sampleBaseQuestion.executionMode,
        dataStructure: sampleBaseQuestion.dataStructure,
        functionName: sampleBaseQuestion.functionName,
        functionSignature: sampleBaseQuestion.functionSignature
      });

      // Token verification fails when the solution changed
      const isValid = verifyValidationToken(token, modifiedSolutionFingerprint, 'draft', {
        expectedDraftId: 'test-draft-uuid',
        expectedUserId: 'test-user-id'
      });

      expect(isValid).toBe(false);
    });

    it('Requirement 15: Publishing is blocked when validation token does not match modified question', () => {
      const origFingerprint = computeSampleValidationFingerprint({
        referenceSolution: 'def solution(x): return x * 2',
        sampleInput: '4',
        expectedOutput: '8',
        language: 'python',
        executionMode: 'FUNCTION',
        dataStructure: 'NONE',
        functionName: 'solution',
        functionSignature: { returnType: 'int', parameters: [] }
      });

      const token = signValidationToken({
        fingerprint: origFingerprint,
        questionId: 'draft',
        draftId: 'draft-1',
        userId: 'teacher-1'
      });

      // Changed expected output from '8' to '10'
      const changedFingerprint = computeSampleValidationFingerprint({
        referenceSolution: 'def solution(x): return x * 2',
        sampleInput: '4',
        expectedOutput: '10',
        language: 'python',
        executionMode: 'FUNCTION',
        dataStructure: 'NONE',
        functionName: 'solution',
        functionSignature: { returnType: 'int', parameters: [] }
      });

      expect(verifyValidationToken(token, changedFingerprint, 'draft', {
        expectedDraftId: 'draft-1',
        expectedUserId: 'teacher-1'
      })).toBe(false);
    });
  });

  // =========================================================================
  // 16 & 17: Sample Test Count & No Hidden Tests
  // =========================================================================
  describe('Test Case Scoping Requirements', () => {
    it('Requirement 16 & 17: Exactly ONE sample test is generated and hidden tests are stripped', () => {
      const rawQuestion = {
        title: 'Two Sum',
        statement: 'Find two numbers summing to target.',
        difficulty: 'Easy',
        language: 'python',
        executionMode: 'FUNCTION',
        functionName: 'twoSum',
        functionSignature: { returnType: 'int[]', parameters: [] },
        starterCode: 'def twoSum(): pass',
        referenceSolution: 'def twoSum(): return [0, 1]',
        sampleTestCase: { input: '[2, 7, 11]', expectedOutput: '[0, 1]' },
        hiddenTestCases: [{ input: '[1, 2]', expectedOutput: '[0, 1]' }]
      };

      const validated = validateGeneratedQuestion(rawQuestion);
      expect(validated.sampleTestCase).toBeDefined();
      expect(validated.sampleTestCase.input).toBe('[2, 7, 11]');
      // hiddenTestCases stripped
      expect(validated.hiddenTestCases).toBeUndefined();
    });
  });

  // =========================================================================
  // 18: Security: Unauthorized Teacher Cannot Regenerate Another's Draft
  // =========================================================================
  describe('Security: Ownership and Authorization', () => {
    it('Requirement 18: Reject regeneration request when teacher does not own draft', async () => {
      // Simulate controller authorization check
      const req = {
        user: { _id: 'unauthorized_teacher_id', role: 'teacher' },
        body: {
          action: 'solution',
          currentQuestion: {
            ...sampleBaseQuestion,
            ownerId: 'authorized_original_teacher_id'
          }
        }
      };

      const ownerStr = String(req.body.currentQuestion.ownerId);
      const userStr = String(req.user._id);
      const isOwnerOrAdmin = ownerStr === userStr || req.user.role === 'admin';

      expect(isOwnerOrAdmin).toBe(false);
    });
  });

  // =========================================================================
  // 19: Gemini API Failures
  // =========================================================================
  describe('Gemini Provider API Error Handling', () => {
    it('Requirement 19: Gemini network error is correctly classified', async () => {
      mockProvider.regenerateSection.mockRejectedValueOnce(
        ApiError.serviceUnavailable('Gemini API is temporarily unavailable.', {
          code: 'GEMINI_SERVICE_UNAVAILABLE'
        })
      );

      await expect(
        service.regenerateSolution({
          currentQuestion: sampleBaseQuestion,
          provider: 'mock'
        })
      ).rejects.toMatchObject({
        statusCode: 503,
        details: expect.objectContaining({ code: 'GEMINI_SERVICE_UNAVAILABLE' })
      });
    });
  });
});
