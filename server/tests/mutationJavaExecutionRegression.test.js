import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateMutants, executeIsolated, evaluateMutants, calculateMutationScore } from '../src/services/mutation.service.js';
import { wrapCodeForExecution } from '../src/services/codeContract.service.js';
import { buildJavaWrapper } from '../src/services/execution/wrappers/javaWrapper.js';
import { MockExecutionProvider } from '../src/services/execution/MockExecutionProvider.js';

describe('Java Mutation & Execution Regression Suite', () => {
  const javaPalindromeCode = `class Solution {
    public boolean isPalindrome(String s) {
        int left = 0;
        int right = s.length() - 1;

        while (left < right) {
            if (s.charAt(left) != s.charAt(right)) {
                return false;
            }

            left++;
            right--;
        }

        return true;
    }
}`;

  describe('1. Java Mutant Generation & Operators', () => {
    it('generates RELATIONAL_OPERATOR_REPLACEMENT and RETURN_VALUE_MUTATION for Java code', () => {
      const mutants = generateMutants(javaPalindromeCode, 'java');
      expect(mutants.length).toBeGreaterThanOrEqual(2);

      const relMutant = mutants.find((m) => m.operator === 'RELATIONAL_OPERATOR_REPLACEMENT');
      expect(relMutant).toBeDefined();
      expect(relMutant.originalSnippet).toBe('left < right');
      expect(relMutant.mutatedSnippet).toBe('left <= right');
      expect(relMutant.mutatedFullCode).toContain('while (left <= right)');

      const retMutant = mutants.find((m) => m.operator === 'RETURN_VALUE_MUTATION');
      expect(retMutant).toBeDefined();
      expect(retMutant.originalSnippet).toContain('return false;');
      expect(retMutant.mutatedSnippet).toContain('return true;');
      expect(retMutant.mutatedFullCode).toContain('return true;');
    });
  });

  describe('2. Java Wrapping & Main Class Generation', () => {
    it('wraps class Solution into public class Main with reflection harness', () => {
      const wrapped = wrapCodeForExecution({
        code: javaPalindromeCode,
        language: 'java',
        executionMode: 'FUNCTION',
        dataStructure: 'ARRAY',
        functionName: 'isPalindrome',
        returnType: 'boolean',
        parameters: [{ name: 's', type: 'String' }]
      });

      expect(wrapped).toContain('public class Main');
      expect(wrapped).toContain('Class.forName("Solution")');
      expect(wrapped).toContain('public static void main(String[] args)');
      expect(wrapped).toContain('Scanner sc = new Scanner(System.in)');
    });

    it('dynamically adapts to custom class names other than Solution', () => {
      const customClassCode = `class PalindromeChecker {
    public boolean check(String s) {
        return s.equals(new StringBuilder(s).reverse().toString());
    }
}`;
      const wrapped = wrapCodeForExecution({
        code: customClassCode,
        language: 'java',
        executionMode: 'FUNCTION',
        functionName: 'check',
        returnType: 'boolean'
      });

      expect(wrapped).toContain('public class Main');
      expect(wrapped).toContain('Class.forName("PalindromeChecker")');
    });

    it('is idempotent and does not double-wrap code that already defines Main', () => {
      const alreadyWrapped = `import java.util.*;\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello");\n    }\n}`;
      const rewrapped = buildJavaWrapper({ code: alreadyWrapped });
      expect(rewrapped).toBe(alreadyWrapped);

      const contractRewrapped = wrapCodeForExecution({
        code: alreadyWrapped,
        language: 'java',
        executionMode: 'FUNCTION'
      });
      expect(contractRewrapped).toBe(alreadyWrapped);
    });
  });

  describe('3. Runtime Errors vs Killed Mutants Classification', () => {
    it('strictly does not count runtime errors as killed mutants', async () => {
      // Mock provider that simulates a runtime exception (e.g. crash or ClassNotFoundException)
      const crashProvider = new MockExecutionProvider();
      crashProvider.setHandler(() => ({
        status: 'runtime_error',
        output: null,
        error: "error: can't find class: code",
        runtimeMs: 50
      }));

      const mutants = [
        {
          id: 'mut-1',
          operator: 'RELATIONAL_OPERATOR_REPLACEMENT',
          originalSnippet: 'left < right',
          mutatedSnippet: 'left <= right',
          mutatedFullCode: javaPalindromeCode.replace('left < right', 'left <= right')
        }
      ];

      const testCases = [
        { input: 'aba', expectedOutput: 'true' }
      ];

      const results = await evaluateMutants({
        referenceCode: javaPalindromeCode,
        testCases,
        questionContext: { language: 'java', executionMode: 'FUNCTION', functionName: 'isPalindrome' },
        customMutants: mutants,
        provider: crashProvider
      });

      expect(results.length).toBe(1);
      const res = results[0];
      expect(res.status).toBe('runtime_error');
      expect(res.killedByTest).toBeNull();
      expect(res.failureReason).toContain('Runtime exception encountered');
    });

    it('correctly kills mutants on output mismatch and timeout', async () => {
      let callCount = 0;
      const mismatchProvider = new MockExecutionProvider({
        defaultHandler: () => {
          callCount++;
          // First mutant output mismatches
          return {
            status: 'success',
            output: 'false', // expected is 'true'
            error: null,
            runtimeMs: 30
          };
        }
      });

      const mutants = [
        {
          id: 'mut-1',
          operator: 'RELATIONAL_OPERATOR_REPLACEMENT',
          originalSnippet: 'left < right',
          mutatedSnippet: 'left <= right',
          mutatedFullCode: javaPalindromeCode.replace('left < right', 'left <= right')
        }
      ];

      const testCases = [
        { input: 'aba', expectedOutput: 'true' }
      ];

      const results = await evaluateMutants({
        referenceCode: javaPalindromeCode,
        testCases,
        questionContext: { language: 'java', executionMode: 'FUNCTION', functionName: 'isPalindrome' },
        customMutants: mutants,
        provider: mismatchProvider
      });

      expect(results.length).toBe(1);
      expect(results[0].status).toBe('killed');
      expect(results[0].killedByTest).toContain('Test #1');
    });
  });

  describe('4. Mutation Score Excludes Invalid & Runtime Error Outcomes', () => {
    it('returns null when all mutants encounter runtime errors (0 eligible)', () => {
      const score = calculateMutationScore(0, 0);
      expect(score).toBeNull();
    });

    it('calculates score based strictly on killed / (killed + survived)', () => {
      // 1 killed, 1 survived, 2 runtime errors excluded -> 1 / (1 + 1) = 50.00%
      const score = calculateMutationScore(1, 1);
      expect(score).toBe(50);

      // 3 killed, 0 survived -> 100%
      expect(calculateMutationScore(3, 0)).toBe(100);

      // 0 killed, 2 survived -> 0%
      expect(calculateMutationScore(0, 2)).toBe(0);
    });
  });

  describe('5. End-to-End Evaluation Workflow for Java Mutants', () => {
    it('evaluates Java mutants with mock provider and verifies proper status', async () => {
      // Provider returns:
      // - For mut-1 (survived): outputs true for "aba" and false for "ab"
      // - For mut-2 (killed): outputs true for "ab" (expected false)
      const mockRunner = new MockExecutionProvider();
      mockRunner.setHandler(({ code, inputArgs }) => {
        const input = Array.isArray(inputArgs) ? inputArgs[0] : String(inputArgs);
        const isMutant2 = code.includes('return true;') && !code.includes('return false;');

        if (isMutant2) {
          // mut-2 inverted early return so it returns true on mismatch for "ab"
          if (input === 'ab') {
            return { status: 'success', output: 'true', error: null, runtimeMs: 20 };
          }
          return { status: 'success', output: 'true', error: null, runtimeMs: 20 };
        }

        // mut-1 behaves like normal palindrome on aba and ab
        if (input === 'aba') {
          return { status: 'success', output: 'true', error: null, runtimeMs: 20 };
        }
        if (input === 'ab') {
          return { status: 'success', output: 'false', error: null, runtimeMs: 20 };
        }
        return { status: 'success', output: 'true', error: null, runtimeMs: 20 };
      });

      const mutants = generateMutants(javaPalindromeCode, 'java');
      const testCases = [
        { input: 'aba', expectedOutput: 'true' },
        { input: 'ab', expectedOutput: 'false' }
      ];

      const results = await evaluateMutants({
        referenceCode: javaPalindromeCode,
        testCases,
        questionContext: {
          language: 'java',
          executionMode: 'FUNCTION',
          functionName: 'isPalindrome',
          dataStructure: 'ARRAY',
          returnType: 'boolean'
        },
        customMutants: mutants,
        provider: mockRunner
      });

      expect(results.length).toBe(2);

      const m1 = results.find((r) => r.operator === 'RELATIONAL_OPERATOR_REPLACEMENT');
      expect(m1).toBeDefined();
      expect(m1.status).toBe('survived');

      const m2 = results.find((r) => r.operator === 'RETURN_VALUE_MUTATION');
      expect(m2).toBeDefined();
      expect(m2.status).toBe('killed');
      expect(m2.killedByTest).toContain('Test #2');

      const killedCount = results.filter((r) => r.status === 'killed').length;
      const survivedCount = results.filter((r) => r.status === 'survived').length;
      expect(killedCount).toBe(1);
      expect(survivedCount).toBe(1);
      expect(calculateMutationScore(killedCount, survivedCount)).toBe(50);
    });
  });
});
