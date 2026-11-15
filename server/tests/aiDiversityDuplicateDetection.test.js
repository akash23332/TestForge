import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  tokenizeSemantic,
  jaccardSimilarity,
  extractAlgorithmicArchetypes,
  computeQuestionSimilarity,
  checkDuplicateAgainstHistory
} from '../src/services/ai/duplicateDetector.service.js';
import { QuestionGeneratorService } from '../src/services/ai/questionGenerator.service.js';
import { AIProvider } from '../src/services/ai/aiProvider.interface.js';
import { buildQuestionGenerationPrompt } from '../src/services/ai/prompts/questionGeneration.prompt.js';
import {
  validateSampleTestCase,
  verifyQuestionSampleValidation
} from '../src/services/sampleValidation.service.js';

describe('AI Question Generation Diversity & Duplicate Prevention Matrix', () => {
  let mockProvider;
  let generatorService;

  beforeEach(() => {
    mockProvider = {
      name: 'mock',
      generateQuestion: jest.fn(),
      regenerateSection: jest.fn()
    };
    generatorService = new QuestionGeneratorService();
    generatorService.registerProvider('mock', mockProvider);
    generatorService.clearSessionHistory('test_session');
  });

  // =========================================================================
  // Test 1: Same requirements generated repeatedly produce distinct variations
  // =========================================================================
  it('Test 1: Same requirements generated repeatedly produce distinct variations and update history', async () => {
    const q1 = {
      title: 'Find Target Index in Array',
      statement: 'Given an array of integers nums and a target value, find its first occurrence index.',
      difficulty: 'Easy',
      executionMode: 'FUNCTION',
      functionName: 'findTarget',
      functionSignature: { parameters: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }], returnType: 'int' },
      examples: [{ input: '[1, 2, 3, 4]\n3', output: '2' }],
      sampleTestCase: { input: '[1, 2, 3, 4]\n3', expectedOutput: '2' },
      starterCode: 'def findTarget(nums, target): pass',
      starterCodes: { python: 'def findTarget(nums, target): pass', javascript: 'function findTarget() {}', java: 'class Solution {}', cpp: 'class Solution {};' },
      referenceSolution: 'def findTarget(nums, target):\n    return nums.index(target) if target in nums else -1'
    };

    const q2 = {
      title: 'Calculate Running Total Above Threshold',
      statement: 'Given an array of integer transactions, compute cumulative total and return count of days exceeding threshold.',
      difficulty: 'Easy',
      executionMode: 'FUNCTION',
      functionName: 'countAboveThreshold',
      functionSignature: { parameters: [{ name: 'nums', type: 'int[]' }, { name: 'threshold', type: 'int' }], returnType: 'int' },
      examples: [{ input: '[10, -5, 20]\n15', output: '1' }],
      sampleTestCase: { input: '[10, -5, 20]\n15', expectedOutput: '1' },
      starterCode: 'def countAboveThreshold(nums, threshold): pass',
      starterCodes: { python: 'def countAboveThreshold(nums, threshold): pass', javascript: 'function countAboveThreshold() {}', java: 'class Solution {}', cpp: 'class Solution {};' },
      referenceSolution: 'def countAboveThreshold(nums, threshold):\n    tot = 0\n    ans = 0\n    for x in nums:\n        tot += x\n        if tot > threshold: ans += 1\n    return ans'
    };

    mockProvider.generateQuestion.mockResolvedValueOnce(q1).mockResolvedValueOnce(q2);

    // Generation 1
    const res1 = await generatorService.generateQuestion({
      provider: 'mock',
      topic: 'Arrays',
      difficulty: 'Easy',
      sessionKey: 'test_session'
    });

    expect(res1.title).toBe(q1.title);
    expect(res1._diversityMeta.isUnique).toBe(true);

    // History now contains q1
    const historyAfter1 = generatorService.getSessionHistory('test_session');
    expect(historyAfter1).toHaveLength(1);
    expect(historyAfter1[0].title).toBe(q1.title);

    // Generation 2 with same requirements
    const res2 = await generatorService.generateQuestion({
      provider: 'mock',
      topic: 'Arrays',
      difficulty: 'Easy',
      sessionKey: 'test_session'
    });

    expect(res2.title).toBe(q2.title);
    expect(res2._diversityMeta.isUnique).toBe(true);

    // History now contains both
    const historyAfter2 = generatorService.getSessionHistory('test_session');
    expect(historyAfter2).toHaveLength(2);
    expect(historyAfter2[1].title).toBe(q2.title);
  });

  // =========================================================================
  // Test 2: Similar titles but different actual problems
  // =========================================================================
  it('Test 2: Similar titles but different actual problems are recognized as distinct and accepted', () => {
    const qA = {
      title: 'Maximum Subarray Sum',
      statement: 'Given an array of integers nums, find the contiguous subarray which has the largest sum and return its sum (Kadane algorithm).',
      functionName: 'maxSubArray',
      sampleTestCase: { input: '[-2,1,-3,4,-1,2,1,-5,4]', expectedOutput: '6' }
    };

    const qB = {
      title: 'Maximum Product Subarray',
      statement: 'Given an integer array nums, find a subarray that has the largest product, and return the product.',
      functionName: 'maxProduct',
      sampleTestCase: { input: '[2, 3, -2, 4]', expectedOutput: '6' }
    };

    const similarity = computeQuestionSimilarity(qA, qB);
    // Despite title token similarity ("Maximum", "Subarray"), the algorithmic task is product vs sum
    // and function names differ
    expect(similarity.factors.isExactTitle).toBe(false);
    expect(similarity.score).toBeLessThan(0.65);
    expect(similarity.isDuplicate).toBe(false);
  });

  // =========================================================================
  // Test 3: Different wording but identical underlying algorithmic problem
  // =========================================================================
  it('Test 3: Different wording but identical underlying algorithmic problem is detected as a duplicate', () => {
    const original = {
      title: 'Valid Palindrome Array',
      statement: 'Given an array of integers nums, return true if it is a palindrome, meaning it reads the same forward and backward, otherwise return false.',
      functionName: 'isPalindrome',
      referenceSolution: 'def isPalindrome(nums): return nums == nums[::-1]',
      sampleTestCase: { input: '[1, 2, 3, 2, 1]', expectedOutput: 'true' }
    };

    const rewordedParaphrase = {
      title: 'Symmetric Sequence Validator',
      statement: 'An array of numbers is provided. Determine whether the integer sequence reads identically from left to right as from right to left. Output true if symmetric, otherwise false.',
      functionName: 'checkSymmetry',
      referenceSolution: 'def checkSymmetry(arr): return arr == arr[::-1]',
      sampleTestCase: { input: '[1, 2, 3, 2, 1]', expectedOutput: 'true' }
    };

    const similarity = computeQuestionSimilarity(rewordedParaphrase, original);
    expect(similarity.isDuplicate).toBe(true);
    expect(similarity.score).toBeGreaterThanOrEqual(0.65);
    expect(similarity.reason).toContain('Identical sample testcase inputs/outputs and shared algorithmic pattern');
  });

  // =========================================================================
  // Test 4: Same topic with genuinely different problems
  // =========================================================================
  it('Test 4: Same topic with genuinely different problems are non-duplicates with low similarity', () => {
    const twoSum = {
      title: 'Two Sum Target Pair',
      statement: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
      functionName: 'twoSum',
      sampleTestCase: { input: '[2, 7, 11, 15]\n9', expectedOutput: '[0, 1]' }
    };

    const containsDuplicate = {
      title: 'Contains Duplicate',
      statement: 'Given an integer array nums, return true if any value appears at least twice in the array, and return false if every element is distinct.',
      functionName: 'containsDuplicate',
      sampleTestCase: { input: '[1, 2, 3, 1]', expectedOutput: 'true' }
    };

    const highestAltitude = {
      title: 'Find the Highest Altitude',
      statement: 'There is a biker going on a road trip. Given altitude gain array, return highest altitude of a point.',
      functionName: 'largestAltitude',
      sampleTestCase: { input: '[-5, 1, 5, 0, -7]', expectedOutput: '1' }
    };

    const sim1 = computeQuestionSimilarity(twoSum, containsDuplicate);
    const sim2 = computeQuestionSimilarity(twoSum, highestAltitude);
    const sim3 = computeQuestionSimilarity(containsDuplicate, highestAltitude);

    expect(sim1.isDuplicate).toBe(false);
    expect(sim2.isDuplicate).toBe(false);
    expect(sim3.isDuplicate).toBe(false);

    expect(sim1.score).toBeLessThan(0.35);
    expect(sim2.score).toBeLessThan(0.35);
    expect(sim3.score).toBeLessThan(0.35);
  });

  // =========================================================================
  // Test 5: Retry limit and duplicate rejection
  // =========================================================================
  it('Test 5: Automatic regeneration retries on duplicates and rejects after 3 failed attempts', async () => {
    const existingQuestion = {
      title: 'Contains Duplicate',
      statement: 'Return true if any value appears at least twice in the array.',
      functionName: 'containsDuplicate'
    };

    // Provider returns duplicate 3 times in a row
    const dupAttempt1 = {
      title: 'Contains Duplicate',
      statement: 'Return true if any value appears at least twice in the array.',
      difficulty: 'Easy',
      executionMode: 'FUNCTION',
      functionName: 'containsDuplicate',
      functionSignature: { parameters: [{ name: 'nums', type: 'int[]' }], returnType: 'boolean' },
      examples: [{ input: '[1, 2, 3, 1]', output: 'true' }],
      sampleTestCase: { input: '[1, 2, 3, 1]', expectedOutput: 'true' },
      starterCode: 'def containsDuplicate(nums): pass',
      starterCodes: { python: 'def containsDuplicate(nums): pass', javascript: 'function containsDuplicate() {}', java: 'class Solution {}', cpp: 'class Solution {};' },
      referenceSolution: 'def containsDuplicate(nums): return len(nums) != len(set(nums))'
    };

    const dupAttempt2 = {
      ...dupAttempt1,
      title: 'Array Duplicate Check'
    };

    const dupAttempt3 = {
      ...dupAttempt1,
      title: 'Check If Array Contains Duplicates'
    };

    mockProvider.generateQuestion
      .mockResolvedValueOnce(dupAttempt1)
      .mockResolvedValueOnce(dupAttempt2)
      .mockResolvedValueOnce(dupAttempt3);

    // Should attempt 3 times and then throw DUPLICATE_GENERATION_LIMIT_EXCEEDED
    await expect(
      generatorService.generateQuestion({
        provider: 'mock',
        topic: 'Arrays',
        difficulty: 'Easy',
        recentQuestions: [existingQuestion],
        maxAttempts: 3
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
      details: expect.objectContaining({
        code: 'DUPLICATE_GENERATION_LIMIT_EXCEEDED',
        attempts: 3
      })
    });

    expect(mockProvider.generateQuestion).toHaveBeenCalledTimes(3);
  });

  // =========================================================================
  // Test 6: Session history reset
  // =========================================================================
  it('Test 6: Session history reset clears exclusion list and allows previously generated concepts', async () => {
    const q = {
      title: 'Two Sum',
      statement: 'Find two indices that sum to target.',
      difficulty: 'Easy',
      executionMode: 'FUNCTION',
      functionName: 'twoSum',
      functionSignature: { parameters: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }], returnType: 'int[]' },
      examples: [{ input: '[2, 7]\n9', output: '[0, 1]' }],
      sampleTestCase: { input: '[2, 7]\n9', expectedOutput: '[0, 1]' },
      starterCode: 'def twoSum(nums, target): pass',
      starterCodes: { python: 'def twoSum(nums, target): pass', javascript: 'function twoSum() {}', java: 'class Solution {}', cpp: 'class Solution {};' },
      referenceSolution: 'def twoSum(nums, target): return [0, 1]'
    };

    generatorService.recordQuestionInHistory('teacher_123', q);
    expect(generatorService.getSessionHistory('teacher_123')).toHaveLength(1);

    // Clear session history
    generatorService.clearSessionHistory('teacher_123');
    expect(generatorService.getSessionHistory('teacher_123')).toHaveLength(0);

    // Prompt built with empty history has no exclusion directives
    const promptWithEmpty = buildQuestionGenerationPrompt({
      topic: 'Arrays',
      recentQuestions: []
    });
    expect(promptWithEmpty).not.toContain('GENERATION DIVERSITY & EXCLUSION CONTRACT');

    // Prompt built with history contains exclusion directives
    const promptWithHistory = buildQuestionGenerationPrompt({
      topic: 'Arrays',
      recentQuestions: [q]
    });
    expect(promptWithHistory).toContain('GENERATION DIVERSITY & EXCLUSION CONTRACT');
    expect(promptWithHistory).toContain('Two Sum');
  });

  // =========================================================================
  // Test 7: Exactly one sample test case in every accepted generation
  // =========================================================================
  it('Test 7: Exactly ONE public sample test case in every accepted generation, 0 hidden test cases', async () => {
    const validQuestion = {
      title: 'Array Product Except Self',
      statement: 'Given an integer array nums, return an array answer such that answer[i] is equal to the product of all elements of nums except nums[i].',
      difficulty: 'Medium',
      executionMode: 'FUNCTION',
      functionName: 'productExceptSelf',
      functionSignature: { parameters: [{ name: 'nums', type: 'int[]' }], returnType: 'int[]' },
      examples: [{ input: '[1, 2, 3, 4]', output: '[24, 12, 8, 6]' }],
      sampleTestCase: { input: '[1, 2, 3, 4]', expectedOutput: '[24, 12, 8, 6]', explanation: 'Product calculation' },
      starterCode: 'def productExceptSelf(nums): pass',
      starterCodes: { python: 'def productExceptSelf(nums): pass', javascript: 'function productExceptSelf() {}', java: 'class Solution {}', cpp: 'class Solution {};' },
      referenceSolution: 'def productExceptSelf(nums): return [24, 12, 8, 6]'
    };

    mockProvider.generateQuestion.mockResolvedValueOnce(validQuestion);

    const generated = await generatorService.generateQuestion({
      provider: 'mock',
      topic: 'Arrays',
      difficulty: 'Medium'
    });

    expect(generated.sampleTestCase).toBeDefined();
    expect(generated.sampleTestCase.input).toBe('[1, 2, 3, 4]');
    expect(generated.sampleTestCase.expectedOutput).toBe('[24, 12, 8, 6]');
    expect(generated.hiddenTestCases).toBeUndefined();
  });

  // =========================================================================
  // Test 8: Existing Page 1 publishing and validation workflow remains intact
  // =========================================================================
  it('Test 8: Existing Page 1 publishing and validation workflow remains intact with diversity metadata', async () => {
    const sampleInput = '4 5';
    const expectedOutput = '9';
    const referenceSolution = 'def solution(a, b):\n    return a + b\n';

    // 1. Authoritative sample validation runs and issues valid token
    const sampleValidationResult = await validateSampleTestCase({
      code: referenceSolution,
      referenceSolution,
      sampleInput,
      expectedOutput,
      language: 'python',
      executionMode: 'FUNCTION',
      functionName: 'solution',
      functionSignature: {
        parameters: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }],
        returnType: 'int'
      }
    });

    expect(sampleValidationResult.passed).toBe(true);
    expect(sampleValidationResult.validationToken).toBeDefined();
    expect(sampleValidationResult.fingerprint).toBeDefined();
    expect(sampleValidationResult.draftId).toBeDefined();

    // 2. Authoritative sample verification validates the token and fingerprint
    const gateCheck = await verifyQuestionSampleValidation(
      {
        _id: 'draft',
        referenceSolution,
        examples: [{ input: sampleInput, output: expectedOutput }],
        language: 'python',
        executionMode: 'FUNCTION',
        functionName: 'solution',
        functionSignature: {
          parameters: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }],
          returnType: 'int'
        }
      },
      sampleValidationResult.validationToken
    );

    expect(gateCheck.isValid).toBe(true);
    expect(gateCheck.fingerprint).toBe(sampleValidationResult.fingerprint);
  });
});
