import { jest } from '@jest/globals';
import { validateSingleTestCase, parseInputArguments, runCodeIsolated } from '../src/services/codeRunner.service.js';
import { wrapCodeForExecution } from '../src/services/codeContract.service.js';
import { buildJavaScriptWrapper } from '../src/services/execution/wrappers/javascriptWrapper.js';

describe('TestForge: Code Runner Critical Bug Fixes & Matrix Verification', () => {
  jest.setTimeout(30000);

  describe('1. JavaScript Wrapper Detection Hardening', () => {
    test('Generated wrapper code with TESTFORGE_JS_WRAPPER executes without double-wrapping', async () => {
      const code = 'function twoSum(nums, target) { return [0, 1]; }';
      const wrapped = buildJavaScriptWrapper({
        code,
        functionName: 'twoSum',
        parameters: [{ name: 'nums', type: 'number[]' }, { name: 'target', type: 'number' }]
      });

      expect(wrapped.startsWith('/* TESTFORGE_JS_WRAPPER */')).toBe(true);

      const res = await runCodeIsolated({
        code: wrapped,
        inputArgs: ['[2, 7, 11, 15]', '9'],
        timeoutMs: 3000
      });

      expect(res.status).toBe('success');
      expect(res.output).toEqual([0, 1]);
      expect(res.error).toBeNull();
    });

    test('Raw student code containing a function named splitSmartArgs is NOT mistaken for a generated wrapper', async () => {
      const code = `
function splitSmartArgs(x) {
  return x * 3;
}
`;
      const res = await runCodeIsolated({
        code,
        inputArgs: [10],
        timeoutMs: 3000
      });

      expect(res.status).toBe('success');
      expect(res.output).toBe(30);
      expect(res.error).toBeNull();
    });

    test('Raw student code containing the text splitSmartArgs in a comment is NOT mistaken for a generated wrapper', async () => {
      const code = `
// The algorithm previously called splitSmartArgs for parsing tokens
function computeTotal(val) {
  return val * 10;
}
`;
      const res = await validateSingleTestCase({
        code,
        testCase: { input: '4', expectedOutput: '40' },
        questionContext: { executionMode: 'FUNCTION', functionName: 'computeTotal' }
      });

      expect(res.passed).toBe(true);
      expect(res.actualOutput).toBe('40');
      expect(res.error).toBeNull();
    });

    test('Ordinary JavaScript STDIN programs remain unaffected and execute directly', async () => {
      const code = `
const fs = require('fs');
// Uses splitSmartArgs in comment
const input = fs.readFileSync(0, 'utf-8').trim();
console.log('STDIN:' + input);
`;
      const res = await validateSingleTestCase({
        code,
        testCase: { input: 'hello', expectedOutput: 'STDIN:hello' },
        questionContext: { executionMode: 'STDIN' }
      });

      expect(res.passed).toBe(true);
      expect(res.actualOutput).toBe('STDIN:hello');
    });
  });

  describe('2. JavaScript FUNCTION Mode Lifecycle', () => {
    test('Standalone function execution', async () => {
      const code = 'function twoSum(nums, target) { return [0, 1]; }';
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '[2, 7, 11, 15]\n9', expectedOutput: '[0, 1]' },
        questionContext: { executionMode: 'FUNCTION', functionName: 'twoSum' }
      });

      expect(result.passed).toBe(true);
      expect(result.actualOutput).toBe('[0,1]');
      expect(result.error).toBeNull();
    });

    test('Class Solution method execution', async () => {
      const code = `
class Solution {
  twoSum(nums, target) {
    return [1, 2];
  }
}
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: 'nums = [3, 2, 4], target = 6', expectedOutput: '[1, 2]' },
        questionContext: { executionMode: 'FUNCTION', functionName: 'twoSum' }
      });

      expect(result.passed).toBe(true);
      expect(result.actualOutput).toBe('[1,2]');
    });

    test('Multiple parameters and helper functions with target defined after helpers', async () => {
      const code = `
function helperA(x) { return x * 2; }
function helperB(x) { return helperA(x) + 10; }
function calculate(a, b, c) { return helperB(a) + b + c; }
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '5, 3, 2', expectedOutput: '25' },
        questionContext: { executionMode: 'FUNCTION', functionName: 'calculate' }
      });

      expect(result.passed).toBe(true);
      expect(result.actualOutput).toBe('25');
    });

    test('Recursive solution execution', async () => {
      const code = `
function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '6', expectedOutput: '8' },
        questionContext: { executionMode: 'FUNCTION', functionName: 'fib' }
      });

      expect(result.passed).toBe(true);
      expect(result.actualOutput).toBe('8');
    });

    test('Missing target function returns clear error and does not invoke helper', async () => {
      const code = `
function helperOnly(x) { return x * 100; }
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '5', expectedOutput: '500' },
        questionContext: { executionMode: 'FUNCTION', functionName: 'targetMissing' }
      });

      expect(result.passed).toBe(false);
      expect(result.status).toBe('runtime_error');
      expect(result.error).toMatch(/Function 'targetMissing' is not defined/);
    });

    test('Runtime exception in user code captured cleanly', async () => {
      const code = `
function buggy(x) {
  throw new Error("Explicit runtime failure");
}
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '10', expectedOutput: '10' },
        questionContext: { executionMode: 'FUNCTION', functionName: 'buggy' }
      });

      expect(result.passed).toBe(false);
      expect(result.status).toBe('runtime_error');
      expect(result.error).toMatch(/Explicit runtime failure/);
    });

    test('Multiple test cases evaluated sequentially', async () => {
      const code = 'function square(x) { return x * x; }';
      const cases = [
        { input: '2', expected: '4' },
        { input: '3', expected: '9' },
        { input: '4', expected: '16' }
      ];

      for (const tc of cases) {
        const res = await validateSingleTestCase({
          code,
          testCase: { input: tc.input, expectedOutput: tc.expected },
          questionContext: { executionMode: 'FUNCTION', functionName: 'square' }
        });
        expect(res.passed).toBe(true);
        expect(res.actualOutput).toBe(tc.expected);
      }
    });
  });

  describe('3. Python FUNCTION Mode Lifecycle', () => {
    test('Correct target method on Solution class executes successfully', async () => {
      const code = `
class Solution:
    def twoSum(self, nums, target):
        return [0, 1]
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '[2, 7, 11, 15]\n9', expectedOutput: '[0, 1]' },
        questionContext: { language: 'python', executionMode: 'FUNCTION', functionName: 'twoSum' }
      });

      expect(result.passed).toBe(true);
      expect(result.actualOutput).toBe('[0,1]');
    });

    test('Missing target method on Solution class with helpers fails cleanly with NameError', async () => {
      const code = `
class Solution:
    def helperA(self, x):
        return x * 10
    def helperB(self, x):
        return x * 20
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '[2, 7, 11, 15]\n9', expectedOutput: '[0, 1]' },
        questionContext: { language: 'python', executionMode: 'FUNCTION', functionName: 'twoSum' }
      });

      expect(result.passed).toBe(false);
      expect(result.status).toBe('runtime_error');
      expect(result.error).toMatch(/Method 'twoSum' not found in Solution class/);
    });

    test('Target method declared after helper methods executes target method only', async () => {
      const code = `
class Solution:
    def helper(self, x):
        return x * 3
    def compute(self, n):
        return self.helper(n) + 1
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '4', expectedOutput: '13' },
        questionContext: { language: 'python', executionMode: 'FUNCTION', functionName: 'compute' }
      });

      expect(result.passed).toBe(true);
      expect(result.actualOutput).toBe('13');
    });

    test('Python standalone function execution', async () => {
      const code = `
def multiply(a, b):
    return a * b
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '6\n7', expectedOutput: '42' },
        questionContext: { language: 'python', executionMode: 'FUNCTION', functionName: 'multiply' }
      });

      expect(result.passed).toBe(true);
      expect(result.actualOutput).toBe('42');
    });

    test('Python recursive method execution', async () => {
      const code = `
class Solution:
    def factorial(self, n):
        if n <= 1:
            return 1
        return n * self.factorial(n - 1)
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '5', expectedOutput: '120' },
        questionContext: { language: 'python', executionMode: 'FUNCTION', functionName: 'factorial' }
      });

      expect(result.passed).toBe(true);
      expect(result.actualOutput).toBe('120');
    });

    test('Python multiple test cases and parameters', async () => {
      const code = `
class Solution:
    def addThree(self, a, b, c):
        return a + b + c
`;
      const cases = [
        { input: '1\n2\n3', expected: '6' },
        { input: '10\n20\n30', expected: '60' },
        { input: '-5\n5\n10', expected: '10' }
      ];

      for (const tc of cases) {
        const res = await validateSingleTestCase({
          code,
          testCase: { input: tc.input, expectedOutput: tc.expected },
          questionContext: { language: 'python', executionMode: 'FUNCTION', functionName: 'addThree' }
        });
        expect(res.passed).toBe(true);
        expect(res.actualOutput).toBe(tc.expected);
      }
    });
  });

  describe('4. Java FUNCTION Mode Lifecycle', () => {
    test('Java class Solution with multiple parameters and helper methods', async () => {
      const code = `
import java.util.*;

class Solution {
    private int helper(int x) {
        return x * 10;
    }
    public int solve(int a, int b) {
        return helper(a) + b;
    }
}
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '3\n7', expectedOutput: '37' },
        questionContext: { language: 'java', executionMode: 'FUNCTION', functionName: 'solve' }
      });

      expect(result.passed).toBe(true);
      expect(result.actualOutput).toBe('37');
    });

    test('Java recursive method in Solution class', async () => {
      const code = `
class Solution {
    public int fib(int n) {
        if (n <= 1) return n;
        return fib(n - 1) + fib(n - 2);
    }
}
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '6', expectedOutput: '8' },
        questionContext: { language: 'java', executionMode: 'FUNCTION', functionName: 'fib' }
      });

      expect(result.passed).toBe(true);
      expect(result.actualOutput).toBe('8');
    });

    test('Java structured return value (array)', async () => {
      const code = `
class Solution {
    public int[] twoSum(int[] nums, int target) {
        return new int[]{0, 1};
    }
}
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '[2, 7, 11, 15]\n9', expectedOutput: '[0, 1]' },
        questionContext: { language: 'java', executionMode: 'FUNCTION', functionName: 'twoSum' }
      });

      expect(result.passed).toBe(true);
      expect(result.actualOutput).toBe('[0,1]');
    });

    test('Java missing target function throws compilation/runtime error', async () => {
      const code = `
class Solution {
    public int otherMethod(int x) {
        return x;
    }
}
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '5', expectedOutput: '5' },
        questionContext: { language: 'java', executionMode: 'FUNCTION', functionName: 'missingTarget' }
      });

      expect(result.passed).toBe(false);
      expect(result.error).not.toBeNull();
    });
  });

  describe('5. C++ FUNCTION Mode Lifecycle', () => {
    test('C++ class Solution with multiple parameters and helper methods', async () => {
      const code = `
#include <bits/stdc++.h>
using namespace std;

class Solution {
private:
    int helper(int x) { return x * 5; }
public:
    int compute(int a, int b) {
        return helper(a) + b;
    }
};
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '4\n6', expectedOutput: '26' },
        questionContext: { language: 'cpp', executionMode: 'FUNCTION', functionName: 'compute' }
      });

      expect(result.passed).toBe(true);
      expect(result.actualOutput).toBe('26');
    });

    test('C++ recursive implementation', async () => {
      const code = `
#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    int factorial(int n) {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
    }
};
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '5', expectedOutput: '120' },
        questionContext: { language: 'cpp', executionMode: 'FUNCTION', functionName: 'factorial' }
      });

      expect(result.passed).toBe(true);
      expect(result.actualOutput).toBe('120');
    });

    test('C++ structured vector return value', async () => {
      const code = `
#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        return {0, 1};
    }
};
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '[2, 7, 11, 15]\n9', expectedOutput: '[0, 1]' },
        questionContext: { language: 'cpp', executionMode: 'FUNCTION', functionName: 'twoSum' }
      });

      expect(result.passed).toBe(true);
      expect(result.actualOutput).toBe('[0,1]');
    });

    test('C++ missing target function error', async () => {
      const code = `
#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    int helper(int x) { return x; }
};
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '5', expectedOutput: '5' },
        questionContext: { language: 'cpp', executionMode: 'FUNCTION', functionName: 'nonExistent' }
      });

      expect(result.passed).toBe(false);
      expect(result.error).not.toBeNull();
    });
  });

  describe('6. Function Input Preprocessing (P1)', () => {
    test('Named parameters "nums = [2,7,11,15], target = 9" are normalized consistently', () => {
      const parsed = parseInputArguments('nums = [2,7,11,15], target = 9');
      expect(parsed).toEqual([[2, 7, 11, 15], 9]);
    });

    test('Negative numbers in named parameters "nums = [-1,0,3,5,9,12], target = 9"', () => {
      const parsed = parseInputArguments('nums = [-1,0,3,5,9,12], target = 9');
      expect(parsed).toEqual([[-1, 0, 3, 5, 9, 12], 9]);
    });

    test('Ordinary serialized JSON input is preserved', () => {
      const parsed = parseInputArguments('[1, 2, 3]');
      expect(parsed).toEqual([[1, 2, 3]]);
    });

    test('Mixed signatures such as (ListNode head, int[] values)', () => {
      const parsed = parseInputArguments('head = [1,2,3], values = [4,5,6]');
      expect(parsed).toEqual([[1, 2, 3], [4, 5, 6]]);
    });

    test('Already-parsed array input is preserved without double wrapping', () => {
      const preParsed = [[1, 2, 3], 4];
      const result = parseInputArguments(preParsed);
      expect(result).toBe(preParsed);
      expect(result).toEqual([[1, 2, 3], 4]);
    });
  });

  describe('7. STDIN Mode Verification Across All Four Languages', () => {
    test('JavaScript STDIN: standard input, multiline, trailing whitespace', async () => {
      const code = `
const fs = require('fs');
const input = fs.readFileSync(0, 'utf-8').trim();
const lines = input.split('\\n');
console.log('COUNT:' + lines.length);
console.log('FIRST:' + lines[0]);
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: 'alpha\nbeta\ngamma   \n', expectedOutput: 'COUNT:3\nFIRST:alpha' },
        questionContext: { executionMode: 'STDIN' }
      });

      expect(result.passed).toBe(true);
    });

    test('Python STDIN: standard input, multiline, multiple output lines', async () => {
      const code = `
import sys
lines = sys.stdin.read().strip().split('\\n')
for line in lines:
    print('PY:' + line.strip())
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: 'first\nsecond\n', expectedOutput: 'PY:first\nPY:second' },
        questionContext: { language: 'python', executionMode: 'STDIN' }
      });

      expect(result.passed).toBe(true);
    });

    test('Java STDIN: Scanner parsing multiline integers', async () => {
      const code = `
import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        System.out.println(a + b);
        System.out.println(a * b);
    }
}
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '4\n5\n', expectedOutput: '9\n20' },
        questionContext: { language: 'java', executionMode: 'STDIN' }
      });

      expect(result.passed).toBe(true);
    });

    test('C++ STDIN: cin reading multiline input', async () => {
      const code = `
#include <iostream>
using namespace std;
int main() {
    int x, y;
    if (cin >> x >> y) {
        cout << (x + y) << endl;
        cout << (x - y) << endl;
    }
    return 0;
}
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '50\n20\n', expectedOutput: '70\n30' },
        questionContext: { language: 'cpp', executionMode: 'STDIN' }
      });

      expect(result.passed).toBe(true);
    });

    test('STDIN mode with empty input rejection at validation gate', async () => {
      const code = `
const fs = require('fs');
const input = fs.readFileSync(0, 'utf-8');
console.log('DONE');
`;
      const result = await validateSingleTestCase({
        code,
        testCase: { input: '', expectedOutput: 'DONE' },
        questionContext: { executionMode: 'STDIN' }
      });

      expect(result.passed).toBe(false);
      expect(result.status).toBe('invalid_test');
    });
  });

});
