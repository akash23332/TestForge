import {
  parseInputArguments,
  normalizeOutput,
  compareOutputs,
  detectLanguage,
  extractFunctionName,
  runCodeIsolated,
  validateSingleTestCase
} from '../src/services/codeRunner.service.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';

describe('Phase 2.1: Judge Preservation & Grading Engine Regression Tests', () => {

  beforeAll(() => {
    providerRegistry.setActiveProvider('local');
  });

  afterAll(() => {
    providerRegistry.setActiveProvider('mock');
  });

  // ── 1. parseInputArguments ─────────────────────────────────────────────────
  describe('parseInputArguments', () => {
    test('parses direct positional arguments', () => {
      const input = '[10, 20, 30], 50';
      const args = parseInputArguments(input);
      expect(args).toEqual([[10, 20, 30], 50]);
    });

    test('parses named arguments (LeetCode style)', () => {
      const input = 'nums = [2, 7, 11, 15], target = 9';
      const args = parseInputArguments(input);
      expect(args).toEqual([[2, 7, 11, 15], 9]);
    });

    test('parses multi-line named arguments', () => {
      const input = 'nums = [1, 2, 3]\ntarget = 4';
      const args = parseInputArguments(input);
      expect(args).toEqual([[1, 2, 3], 4]);
    });

    test('parses 2D matrix / nested array input', () => {
      const input = '[[1,4,5],[1,3,4],[2,6]]';
      const args = parseInputArguments(input);
      expect(args).toEqual([[[1, 4, 5], [1, 3, 4], [2, 6]]]);
    });

    test('parses primitive numbers and strings', () => {
      expect(parseInputArguments('42')).toEqual([42]);
      expect(parseInputArguments('"hello world"')).toEqual(['hello world']);
    });

    test('handles empty input gracefully', () => {
      expect(parseInputArguments('')).toEqual([]);
      expect(parseInputArguments('   ')).toEqual([]);
    });

    test('handles non-string input safely', () => {
      expect(parseInputArguments(null)).toEqual([null]);
      expect(parseInputArguments([1, 2, 3])).toEqual([[1, 2, 3]]);
    });
  });

  // ── 2. compareOutputs ──────────────────────────────────────────────────────
  describe('compareOutputs', () => {
    test('treats unordered index pairs as equal for Two Sum problems', () => {
      const actual = [1, 0];
      const expected = [0, 1];
      const context = { title: 'Two Sum' };
      expect(compareOutputs(actual, expected, context)).toBe(true);
    });

    test('treats unordered pairs with tags as equal for Two Sum', () => {
      const actual = [3, 2];
      const expected = [2, 3];
      const context = { tags: ['two sum', 'hash-map'] };
      expect(compareOutputs(actual, expected, context)).toBe(true);
    });

    test('enforces strict order for non-Two Sum problems', () => {
      const actual = [1, 0];
      const expected = [0, 1];
      const context = { title: 'Binary Search' };
      expect(compareOutputs(actual, expected, context)).toBe(false);
    });

    test('recognizes empty array and null equivalence', () => {
      expect(compareOutputs([], null)).toBe(true);
      expect(compareOutputs(null, '[]')).toBe(true);
      expect(compareOutputs('null', '[]')).toBe(true);
      expect(compareOutputs('undefined', '')).toBe(true);
    });

    test('compares deep JSON objects correctly regardless of key order', () => {
      const obj1 = { a: 1, b: [2, 3] };
      const obj2 = '{"b":[2,3],"a":1}';
      expect(compareOutputs(obj1, obj2)).toBe(true);
    });

    test('compares primitives correctly', () => {
      expect(compareOutputs(42, '42')).toBe(true);
      expect(compareOutputs('true', true)).toBe(true);
      expect(compareOutputs('abc', 'abc')).toBe(true);
      expect(compareOutputs('abc', 'def')).toBe(false);
    });
  });

  // ── 3. detectLanguage & extractFunctionName ─────────────────────────────────
  describe('Language Detection & Function Extraction', () => {
    test('detects language from questionContext if provided', () => {
      expect(detectLanguage('def foo(): pass', { language: 'python' })).toBe('python');
      expect(detectLanguage('class Solution {}', { language: 'java' })).toBe('java');
      expect(detectLanguage('int main() {}', { language: 'cpp' })).toBe('cpp');
      expect(detectLanguage('function sol() {}', { language: 'javascript' })).toBe('javascript');
    });

    test('detects Java from code syntax', () => {
      const javaCode = 'import java.util.*;\npublic class Solution { public int[] twoSum(int[] nums) {} }';
      expect(detectLanguage(javaCode)).toBe('java');
    });

    test('detects Python from code syntax', () => {
      const pyCode = 'def twoSum(nums, target):\n    return [0, 1]';
      expect(detectLanguage(pyCode)).toBe('python');
    });

    test('extracts function names correctly from JS code', () => {
      expect(extractFunctionName('function mySolution(a, b) { return a + b; }')).toBe('mySolution');
      expect(extractFunctionName('const solve = function(x) { return x; }')).toBe('solve');
      expect(extractFunctionName('const calculate = (x) => x * 2;')).toBe('calculate');
      expect(extractFunctionName('')).toBe(null);
    });
  });

  // ── 4. runCodeIsolated (JavaScript with ListNode / Helpers) ──────────────────
  describe('runCodeIsolated (JS VM Runner)', () => {
    test('executes clean JavaScript function returning scalar', async () => {
      const code = 'function add(a, b) { return a + b; }';
      const result = await runCodeIsolated({
        code,
        inputArgs: [10, 25],
        timeoutMs: 1000
      });

      expect(result.status).toBe('success');
      expect(result.output).toBe(35);
      expect(result.error).toBeNull();
      expect(result.runtimeMs).toBeGreaterThanOrEqual(0);
    });

    test('executes code manipulating ListNode structures', async () => {
      const code = `
        function reverseList(head) {
          let prev = null;
          let curr = head;
          while (curr) {
            let next = curr.next;
            curr.next = prev;
            prev = curr;
            curr = next;
          }
          return prev;
        }
      `;
      const result = await runCodeIsolated({
        code,
        inputArgs: [[1, 2, 3]],
        timeoutMs: 1500
      });

      expect(result.status).toBe('success');
      expect(result.output).toEqual([3, 2, 1]);
    });

    test('handles infinite loops with timeout', async () => {
      const code = 'function infinite() { while (true) {} }';
      const result = await runCodeIsolated({
        code,
        inputArgs: [],
        timeoutMs: 200
      });

      expect(result.status).toBe('timeout');
      expect(result.error).toMatch(/timed out/i);
    });

    test('catches syntax errors as compilation_error', async () => {
      const code = 'function broken( { return 1; }';
      const result = await runCodeIsolated({
        code,
        inputArgs: [],
        timeoutMs: 500
      });

      expect(result.status).toBe('compilation_error');
      expect(result.error).toBeDefined();
    });

    test('catches runtime exceptions as runtime_error', async () => {
      const code = 'function crash() { null.someMethod(); }';
      const result = await runCodeIsolated({
        code,
        inputArgs: [],
        timeoutMs: 500
      });

      expect(result.status).toBe('runtime_error');
      expect(result.error).toBeDefined();
    });
  });

  // ── 5. validateSingleTestCase (Full Judge Validation) ───────────────────────
  describe('validateSingleTestCase (End-to-End Judge Flow)', () => {
    test('marks passing solution as passed: true, status: "passed"', async () => {
      const code = 'function twoSum(nums, target) { return [0, 1]; }';
      const testCase = {
        _id: 'tc_1',
        category: 'sample',
        visibility: 'public',
        input: 'nums = [2, 7], target = 9',
        expectedOutput: '[0, 1]'
      };

      const result = await validateSingleTestCase({
        code,
        testCase,
        questionContext: { title: 'Two Sum', language: 'javascript' },
        timeoutMs: 1500
      });

      expect(result.passed).toBe(true);
      expect(result.status).toBe('passed');
      expect(result.actualOutput).toBe('[0,1]');
      expect(result.error).toBeNull();
    });

    test('marks mismatch as passed: false, status: "failed"', async () => {
      const code = 'function twoSum(nums, target) { return [99, 99]; }';
      const testCase = {
        _id: 'tc_2',
        category: 'sample',
        visibility: 'public',
        input: 'nums = [2, 7], target = 9',
        expectedOutput: '[0, 1]'
      };

      const result = await validateSingleTestCase({
        code,
        testCase,
        questionContext: { title: 'Two Sum', language: 'javascript' },
        timeoutMs: 1500
      });

      expect(result.passed).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toMatch(/Output mismatch/i);
    });

    test('handles missing expectedOutput as invalid_test', async () => {
      const code = 'function sol() {}';
      const testCase = {
        _id: 'tc_bad',
        input: '123',
        expectedOutput: undefined
      };

      const result = await validateSingleTestCase({
        code,
        testCase,
        questionContext: {}
      });

      expect(result.status).toBe('invalid_test');
      expect(result.passed).toBe(false);
    });
  });
});
