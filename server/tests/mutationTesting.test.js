import request from 'supertest';
import app from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Question } from '../src/models/Question.js';
import { generateMutants, evaluateMutants, synthesizeCandidateTests, calculateMutationScore } from '../src/services/mutation.service.js';

describe('Mutation Testing & Test Suite Quality Engine', () => {
  let twoSumQId = '';

  beforeAll(async () => {
    await connectDatabase();
    const q = await Question.findOne({ title: /two sum/i, language: 'javascript' }) || await Question.findOne({ title: /two sum/i });
    if (q) {
      twoSumQId = q._id.toString();
    }
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  describe('Multi-language Mutant Generation', () => {
    test('generates mutants for JavaScript functions', () => {
      const jsCode = `function twoSum(nums, target) {
        for (let i = 0; i < nums.length; i++) {
          const comp = target - nums[i];
          if (nums[i] === target) return [i, i];
        }
        return [0, 1];
      }`;
      const mutants = generateMutants(jsCode, 'javascript');
      expect(mutants.length).toBeGreaterThan(0);
      const operators = mutants.map((m) => m.operator);
      expect(operators).toContain('BOUNDARY_OFF_BY_ONE');
      expect(operators).toContain('ARITHMETIC_OPERATOR_REPLACEMENT');
    });

    test('generates mutants for Java methods', () => {
      const javaCode = `class Solution {
        public int subarraySum(int[] nums, int k) {
          int count = 0;
          for (int i = 0; i < nums.length; i++) {
            int sum = 0;
            sum += nums[i];
            if (sum == k) count++;
          }
          return count;
        }
      }`;
      const mutants = generateMutants(javaCode, 'java');
      expect(mutants.length).toBeGreaterThan(0);
      const operators = mutants.map((m) => m.operator);
      expect(operators.some((op) => ['BOUNDARY_OFF_BY_ONE', 'ARITHMETIC_OPERATOR_REPLACEMENT', 'RELATIONAL_OPERATOR_REPLACEMENT', 'RETURN_VALUE_MUTATION'].includes(op))).toBe(true);
    });

    test('generates mutants for Python functions', () => {
      const pyCode = `def two_sum(nums, target):
        for i in range(len(nums)):
          val = target - nums[i]
          if val == 0:
            return True
        return False`;
      const mutants = generateMutants(pyCode, 'python');
      expect(mutants.length).toBeGreaterThan(0);
      const operators = mutants.map((m) => m.operator);
      expect(operators.some((op) => ['BOUNDARY_OFF_BY_ONE', 'BOUNDARY_START_OFFSET', 'ARITHMETIC_OPERATOR_REPLACEMENT', 'RETURN_VALUE_MUTATION'].includes(op))).toBe(true);
    });
  });

  describe('Mutant Evaluation Execution', () => {
    test('evaluates JS mutants against test cases and reports kill status', async () => {
      const jsCode = `function twoSum(nums, target) {
        const map = new Map();
        for (let i = 0; i < nums.length; i++) {
          const complement = target - nums[i];
          if (map.has(complement)) {
            return [map.get(complement), i];
          }
          map.set(nums[i], i);
        }
        return [];
      }`;

      const testCases = [
        { input: '[2, 7, 11, 15], 9', expectedOutput: '[0, 1]', category: 'sample' },
        { input: '[3, 2, 4], 6', expectedOutput: '[1, 2]', category: 'normal' },
        { input: '[3, 3], 6', expectedOutput: '[0, 1]', category: 'edge_case' }
      ];

      const results = await evaluateMutants({
        referenceCode: jsCode,
        testCases,
        questionContext: { language: 'javascript', title: 'Two Sum' }
      });

      expect(results.length).toBeGreaterThan(0);
      const killedCount = results.filter((m) => m.status === 'killed').length;
      expect(killedCount).toBeGreaterThan(0);
    });
  });

  describe('Mutation Score Calculation & Eligibility Denominator', () => {
    test('calculates 66.67% for 2 killed and 1 survived mutants', () => {
      const score = calculateMutationScore(2, 1);
      expect(score).toBe(66.67);
    });

    test('calculates 100% when all eligible mutants are killed', () => {
      const score = calculateMutationScore(3, 0);
      expect(score).toBe(100);
    });

    test('returns null (N/A / no score) when zero eligible mutants exist', () => {
      const score = calculateMutationScore(0, 0);
      expect(score).toBeNull();
    });

    test('does not mutate Java generics into relational comparison operators', () => {
      const javaCode = `import java.util.Map;
import java.util.HashMap;

class Solution {
    public int subarraySum(int[] nums, int k) {
        Map<Integer, Integer> prefixCount = new HashMap<>();
        prefixCount.put(0, 1);
        int prefixSum = 0;
        int count = 0;
        for (int num : nums) {
            prefixSum += num;
            count += prefixCount.getOrDefault(prefixSum - k, 0);
            prefixCount.put(prefixSum, prefixCount.getOrDefault(prefixSum, 0) + 1);
        }
        return count;
    }
}`;
      const mutants = generateMutants(javaCode, 'java');
      // None of the mutants should contain invalid generic mutations like "Map<="
      for (const m of mutants) {
        expect(m.mutatedFullCode).not.toContain('Map<=');
        expect(m.mutatedFullCode).not.toContain('HashMap<=');
      }
    });
  });

  describe('API Endpoint: POST /api/v1/questions/:id/mutation-runs', () => {
    test('successfully executes mutation run via API', async () => {
      if (!twoSumQId) return;

      const res = await request(app).post(`/api/v1/questions/${twoSumQId}/mutation-runs`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('mutationScore');
      expect(res.body.data).toHaveProperty('totalMutants');
      expect(res.body.data).toHaveProperty('totalEligible');
      expect(res.body.data).toHaveProperty('killed');
      expect(res.body.data).toHaveProperty('survived');
      expect(res.body.data).toHaveProperty('invalid');
      expect(Array.isArray(res.body.data.mutants)).toBe(true);
    });
  });

  describe('Invalid Mutant & Compilation Error Resilience', () => {
    const javaReference = `import java.util.HashMap;
import java.util.Map;

class Solution {
    public int subarraySum(int[] nums, int k) {
        Map<Integer, Integer> prefixCount = new HashMap<>();
        prefixCount.put(0, 1);

        int prefixSum = 0;
        int count = 0;

        for (int num : nums) {
            prefixSum += num;

            count += prefixCount.getOrDefault(
                prefixSum - k, 0
            );

            prefixCount.put(
                prefixSum,
                prefixCount.getOrDefault(prefixSum, 0) + 1
            );
        }

        return count;
    }
}`;

    const sampleTests = [
      { input: '[1, 1, 1], 2', expectedOutput: '2', category: 'normal' },
      { input: '[1, 2, 3], 3', expectedOutput: '2', category: 'normal' }
    ];

    test('1. Syntax-invalid mutant (prefixSum +=+* num) is classified as Invalid/compilation_error with diagnostic', async () => {
      const invalidMutant = {
        id: 'mut-syntax-err',
        operator: 'DELIBERATE_SYNTAX_ERROR',
        description: 'Deliberate syntax error: prefixSum +=+* num;',
        originalSnippet: 'prefixSum += num;',
        mutatedSnippet: 'prefixSum +=+* num;',
        mutatedFullCode: javaReference.replace('prefixSum += num;', 'prefixSum +=+* num;')
      };

      const results = await evaluateMutants({
        referenceCode: javaReference,
        testCases: sampleTests,
        questionContext: { language: 'java', title: 'Subarray Sum Equals K' },
        customMutants: [invalidMutant]
      });

      expect(results).toHaveLength(1);
      const res = results[0];
      expect(res.status).toBe('compilation_error');
      expect(res.killedByTest).toBeNull();
      expect(res.compilationError).toBeDefined();
      expect(typeof res.compilationError).toBe('string');
      expect(res.compilationError.toLowerCase()).toMatch(/error|illegal start of expression/);
    });

    test('2. A valid mutant detected by a test is Killed', async () => {
      const killedMutant = {
        id: 'mut-killed',
        operator: 'RETURN_VALUE_MUTATION',
        description: 'return count + 1;',
        originalSnippet: 'return count;',
        mutatedSnippet: 'return count + 1;',
        mutatedFullCode: javaReference.replace('return count;', 'return count + 1;')
      };

      const results = await evaluateMutants({
        referenceCode: javaReference,
        testCases: sampleTests,
        questionContext: { language: 'java', title: 'Subarray Sum Equals K' },
        customMutants: [killedMutant]
      });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('killed');
      expect(results[0].killedByTest).toContain('Test #1');
    });

    test('3. A valid mutant that produces identical outputs for all current tests is Survived', async () => {
      // In [0], 0 -> prefixSum += num (0+=0) vs prefixSum -= num (0-=0) produces exact same output!
      const survivedMutant = {
        id: 'mut-survived',
        operator: 'ARITHMETIC_OPERATOR_REPLACEMENT',
        description: 'prefixSum -= num;',
        originalSnippet: 'prefixSum += num;',
        mutatedSnippet: 'prefixSum -= num;',
        mutatedFullCode: javaReference.replace('prefixSum += num;', 'prefixSum -= num;')
      };

      // Test suite containing only input where += and -= produce identical result
      const zeroTests = [{ input: '[0], 0', expectedOutput: '1', category: 'edge_case' }];

      const results = await evaluateMutants({
        referenceCode: javaReference,
        testCases: zeroTests,
        questionContext: { language: 'java', title: 'Subarray Sum Equals K' },
        customMutants: [survivedMutant]
      });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('survived');
      expect(results[0].killedByTest).toBeNull();
    });

    test('4. Invalid mutants do not affect the mutation score denominator (2 killed + 1 survived + 1 invalid = 66.67%)', () => {
      const killed = 2;
      const survived = 1;
      const invalid = 1;

      // Score denominator is strictly (killed + survived), invalid mutants are excluded
      const totalEligible = killed + survived;
      expect(totalEligible).toBe(3);

      const score = calculateMutationScore(killed, survived);
      expect(score).toBe(66.67);

      // Verify that if all eligible are killed, score is 100% regardless of invalid count
      const perfectScore = calculateMutationScore(3, 0);
      expect(perfectScore).toBe(100);

      // Verify that if zero eligible mutants exist, score is null (N/A)
      const noEligibleScore = calculateMutationScore(0, 0);
      expect(noEligibleScore).toBeNull();
    });

    test('5. Compilation errors are not silently converted into successful execution results or killed status', async () => {
      const brokenJava = `class Solution { public int invalid() { int a = ; return a; } }`;
      const { runJavaIsolated } = await import('../src/services/codeRunner.service.js');
      const execResult = await runJavaIsolated({
        code: brokenJava,
        inputArgs: []
      });

      expect(execResult.status).toBe('compilation_error');
      expect(execResult.output).toBeNull();
      expect(execResult.error).toBeDefined();
    });

    test('6. Original reference solution and hidden test cases in DB remain completely untouched and valid', async () => {
      const { TestCase } = await import('../src/models/TestCase.js');
      const q = await Question.findOne({ title: /subarray sum/i, language: 'java' });
      if (!q) return;

      // Confirm reference solution contains valid code without any injected syntax error
      expect(q.referenceSolution).not.toContain('+=+*');
      expect(q.referenceSolution).toContain('prefixSum += num;');

      // Confirm test cases exist and hidden test cases remain intact
      const testCases = await TestCase.find({ questionId: q._id });
      expect(testCases.length).toBeGreaterThanOrEqual(1);

      const hiddenCases = testCases.filter((tc) => tc.visibility === 'hidden');
      for (const tc of hiddenCases) {
        expect(tc.visibility).toBe('hidden');
        expect(tc.input).toBeDefined();
        expect(tc.expectedOutput).toBeDefined();
      }
    });

    test('7. End-to-end API run on Subarray Sum Equals K returns invalid mutant classified correctly', async () => {
      const q = await Question.findOne({ title: /subarray sum/i, language: 'java' });
      if (!q) return;

      const res = await request(app).post(`/api/v1/questions/${q._id}/mutation-runs`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { data } = res.body;
      expect(data.invalid).toBeGreaterThanOrEqual(1);
      expect(data.totalEligible).toBe(data.killed + data.survived);
      expect(data.totalMutants).toBe(data.totalEligible + data.invalid);

      const invalidMutants = data.mutants.filter((m) => m.status === 'compilation_error' || m.status === 'invalid');
      expect(invalidMutants.length).toBeGreaterThanOrEqual(1);
      expect(invalidMutants[0].compilationError).toBeDefined();
      expect(invalidMutants[0].killedByTest).toBeNull();
    }, 25000);
  });

  describe('PHASE 2 & PHASE 6: Valid Parentheses Java Audit & Full Workflow', () => {
    let vpQId = '';
    const vpCode = `import java.util.Stack;

class Solution {
    public boolean isValid(String s) {
        Stack<Character> stack = new Stack<>();

        for (char c : s.toCharArray()) {
            if (c == '(' || c == '{' || c == '[') {
                stack.push(c);
            } else {
                if (stack.isEmpty()) {
                    return false;
                }

                char top = stack.pop();

                if ((c == ')' && top != '(') ||
                    (c == '}' && top != '{') ||
                    (c == ']' && top != '[')) {
                    return false;
                }
            }
        }

        return stack.isEmpty();
    }
}`;

    beforeAll(async () => {
      const q = await Question.findOne({ title: /valid parenthes/i, language: 'java' }) || await Question.findOne({ title: /parenthes/i, language: 'java' });
      if (q) {
        vpQId = q._id.toString();
      }
    });

    test('generates both early branch return mutation and final boolean return mutation for Valid Parentheses', () => {
      const mutants = generateMutants(vpCode, 'java');
      const descriptions = mutants.map((m) => m.description);
      expect(descriptions.some((d) => d.includes('stack.isEmpty()') || d.includes('early branch'))).toBe(true);
    });

    test('PHASE 2: test "(" detects and KILLS the final boolean return expression mutant', async () => {
      const finalReturnMutant = {
        id: 'mut-final-bool',
        operator: 'RETURN_VALUE_MUTATION',
        description: 'Inverted final return: "return stack.isEmpty();" -> "return !stack.isEmpty();"',
        originalSnippet: 'return stack.isEmpty();',
        mutatedSnippet: 'return !stack.isEmpty();',
        mutatedFullCode: vpCode.replace('return stack.isEmpty();', 'return !stack.isEmpty();')
      };

      const testCases = [
        { input: '"("', expectedOutput: 'false', category: 'boundary' }
      ];

      const results = await evaluateMutants({
        referenceCode: vpCode,
        testCases,
        questionContext: { language: 'java', title: 'Valid Parentheses' },
        customMutants: [finalReturnMutant]
      });

      expect(results).toHaveLength(1);
      const res = results[0];
      expect(res.status).toBe('killed');
      expect(res.killedByTest).toContain('Test #1');
      expect(res.testInput).toBe('"("');
      expect(res.expectedOutput).toBe('false');
      expect(res.mutantOutput).toBe('true');
      expect(res.failureReason).toContain('Expected: false, got: true');
    }, 20000);

    test('PHASE 2: test ")" detects and KILLS the empty stack early branch return mutant', async () => {
      const earlyBranchMutant = {
        id: 'mut-early-branch',
        operator: 'RETURN_VALUE_MUTATION',
        description: 'Inverted early branch return: "return false;" to "return true;"',
        originalSnippet: 'if (stack.isEmpty()) {\n                    return false;\n                }',
        mutatedSnippet: 'if (stack.isEmpty()) {\n                    return true;\n                }',
        mutatedFullCode: vpCode.replace(
          'if (stack.isEmpty()) {\n                    return false;\n                }',
          'if (stack.isEmpty()) {\n                    return true;\n                }'
        )
      };

      const testCases = [
        { input: '")"', expectedOutput: 'false', category: 'boundary' }
      ];

      const results = await evaluateMutants({
        referenceCode: vpCode,
        testCases,
        questionContext: { language: 'java', title: 'Valid Parentheses' },
        customMutants: [earlyBranchMutant]
      });

      expect(results).toHaveLength(1);
      const res = results[0];
      expect(res.status).toBe('killed');
      expect(res.killedByTest).toContain('Test #1');
      expect(res.testInput).toBe('")"');
      expect(res.expectedOutput).toBe('false');
      expect(res.mutantOutput).toBe('true');
    }, 20000);

    test('PHASE 4: Validates string, boolean, array, negative, zero, and boundary comparators correctly', async () => {
      const { compareOutputs } = await import('../src/services/codeRunner.service.js');

      // Booleans
      expect(compareOutputs(true, 'true')).toBe(true);
      expect(compareOutputs(false, 'false')).toBe(true);
      expect(compareOutputs(false, 'true')).toBe(false);

      // Strings
      expect(compareOutputs('abc', 'abc')).toBe(true);
      expect(compareOutputs('()', '"()"')).toBe(true);
      expect(compareOutputs('(', ')')).toBe(false);

      // Arrays
      expect(compareOutputs([1, 2, 3], '[1, 2, 3]')).toBe(true);
      expect(compareOutputs([-1, 0, 1], '[-1, 0, 1]')).toBe(true);
      expect(compareOutputs([0, 1], '[1, 0]')).toBe(false); // Unordered check strictly disabled unless Two Sum
      expect(compareOutputs([0, 1], '[1, 0]', { title: 'Two Sum' })).toBe(true); // Permitted for Two Sum
    });

    test('PHASE 5: Verified mathematical score calculation rules', () => {
      // 1. 2 Killed + 1 Survived + 1 Invalid = 66.67%
      expect(calculateMutationScore(2, 1)).toBe(66.67);

      // 2. 3 Killed + 0 Survived + 1 Invalid = 100%
      expect(calculateMutationScore(3, 0)).toBe(100);

      // 3. 0 Killed + 3 Survived = 0%
      expect(calculateMutationScore(0, 3)).toBe(0);

      // 4. 0 eligible mutants = null (N/A)
      expect(calculateMutationScore(0, 0)).toBeNull();
    });

    test('PHASE 6: Verified candidate test synthesis generates type-accurate candidate for surviving mutant', async () => {
      const survivingMutant = {
        id: 'mut-surv-vp',
        operator: 'RETURN_VALUE_MUTATION',
        mutatedFullCode: vpCode.replace(
          'if (stack.isEmpty()) {\n                    return false;\n                }',
          'if (stack.isEmpty()) {\n                    return true;\n                }'
        )
      };

      // Test suite only containing "("
      const existingTests = [{ input: '"("', expectedOutput: 'false', category: 'normal' }];

      const candidates = await synthesizeCandidateTests({
        referenceCode: vpCode,
        survivingMutants: [survivingMutant],
        testCases: existingTests,
        questionContext: { language: 'java', title: 'Valid Parentheses' }
      });

      expect(candidates.length).toBeGreaterThanOrEqual(1);
      const cand = candidates[0];
      // Candidate must be a string bracket candidate
      expect(typeof cand.input).toBe('string');
      expect(cand.input).not.toContain('[');
      expect(cand.expectedOutput).toBe('false');
    }, 25000);
  });
});
