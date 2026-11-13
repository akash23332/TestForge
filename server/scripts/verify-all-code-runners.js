import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { OnlineCompilerProvider } from '../src/services/execution/OnlineCompilerProvider.js';
import { wrapCodeForExecution } from '../src/services/codeContract.service.js';
import { compareOutputs, normalizeOutput } from '../src/services/codeRunner.service.js';

const provider = new OnlineCompilerProvider();

console.log('═'.repeat(80));
console.log('TESTFORGE COMPREHENSIVE CODE RUNNER VERIFICATION ACROSS LANGUAGES & MODES');
console.log('═'.repeat(80));

const testScenarios = [
  // ── 1. PYTHON FUNCTION MODE ──────────────────────────────────────────────
  {
    category: 'Math / Arrays (LeetCode Two Sum)',
    language: 'python',
    executionMode: 'FUNCTION',
    functionName: 'twoSum',
    code: `class Solution:
    def twoSum(self, nums, target):
        lookup = {}
        for i, num in enumerate(nums):
            if target - num in lookup:
                return [lookup[target - num], i]
            lookup[num] = i
        return []
`,
    tests: [
      { input: '[2, 7, 11, 15]\n9', expected: [0, 1] },
      { input: '[3, 2, 4]\n6', expected: [1, 2] },
      { input: '[3, 3]\n6', expected: [0, 1] }
    ]
  },
  {
    category: 'Strings / Hash Map (First Non-Repeating Character)',
    language: 'python',
    executionMode: 'FUNCTION',
    functionName: 'solution',
    code: `def solution(s):
    counts = {}
    for ch in s:
        counts[ch] = counts.get(ch, 0) + 1
    for ch in s:
        if counts[ch] == 1:
            return ch
    return '#'
`,
    tests: [
      { input: 'swiss', expected: 'w' },
      { input: 'aabbcc', expected: '#' },
      { input: 'algorithm', expected: 'a' }
    ]
  },
  {
    category: 'Dynamic Programming / Negatives (Kadane Max Subarray)',
    language: 'python',
    executionMode: 'FUNCTION',
    functionName: 'maxSubArray',
    code: `class Solution:
    def maxSubArray(self, nums):
        cur_max = global_max = nums[0]
        for x in nums[1:]:
            cur_max = max(x, cur_max + x)
            global_max = max(global_max, cur_max)
        return global_max
`,
    tests: [
      { input: '[-2, 1, -3, 4, -1, 2, 1, -5, 4]', expected: 6 },
      { input: '[1]', expected: 1 },
      { input: '[-5, -2, -8, -1]', expected: -1 }
    ]
  },

  // ── 2. PYTHON STDIN MODE ────────────────────────────────────────────────
  {
    category: 'Competitive Programming STDIN (Sum of Two Numbers)',
    language: 'python',
    executionMode: 'STDIN',
    code: `import sys

def main():
    tokens = sys.stdin.read().split()
    if not tokens:
        return
    a, b = map(int, tokens[:2])
    print(a + b)

if __name__ == '__main__':
    main()
`,
    tests: [
      { input: '15 25', expected: '40' },
      { input: '-100 250', expected: '150' },
      { input: '0 0', expected: '0' }
    ]
  },

  // ── 3. JAVASCRIPT FUNCTION MODE ──────────────────────────────────────────
  {
    category: 'Strings / Hash Table (JS First Unique Character)',
    language: 'javascript',
    executionMode: 'FUNCTION',
    functionName: 'solution',
    code: `function solution(s) {
  const freq = {};
  for (const ch of s) {
    freq[ch] = (freq[ch] || 0) + 1;
  }
  for (const ch of s) {
    if (freq[ch] === 1) return ch;
  }
  return '#';
}
`,
    tests: [
      { input: 'swiss', expected: 'w' },
      { input: 'radar', expected: 'd' },
      { input: 'aabb', expected: '#' }
    ]
  },
  {
    category: 'String Palindrome & Two Pointers (JS)',
    language: 'javascript',
    executionMode: 'FUNCTION',
    functionName: 'isPalindrome',
    code: `function isPalindrome(s) {
  const cleaned = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  let l = 0, r = cleaned.length - 1;
  while (l < r) {
    if (cleaned[l++] !== cleaned[r--]) return false;
  }
  return true;
}
`,
    tests: [
      { input: 'racecar', expected: true },
      { input: 'hello', expected: false },
      { input: 'A man, a plan, a canal: Panama', expected: true }
    ]
  },

  // ── 4. JAVASCRIPT STDIN MODE ─────────────────────────────────────────────
  {
    category: 'Array Aggregation from STDIN (JS)',
    language: 'javascript',
    executionMode: 'STDIN',
    code: `const fs = require('fs');

function main() {
  const input = fs.readFileSync(0, 'utf-8').trim();
  if (!input) return;
  const numbers = input.split(/\\s+/).map(Number);
  const sum = numbers.reduce((acc, n) => acc + n, 0);
  console.log(sum);
}

main();
`,
    tests: [
      { input: '1 2 3 4 5', expected: '15' },
      { input: '10 -5 20 -15', expected: '10' }
    ]
  },

  // ── 5. C++ FUNCTION MODE ─────────────────────────────────────────────────
  {
    category: 'Basic Arithmetic Class Method (C++ FUNCTION)',
    language: 'cpp',
    executionMode: 'FUNCTION',
    functionName: 'solution',
    code: `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    int solution(int a, int b) {
        return a * b;
    }
};
`,
    tests: [
      { input: '6 7', expected: 42 },
      { input: '-3 12', expected: -36 }
    ]
  },

  // ── 6. C++ STDIN MODE ────────────────────────────────────────────────────
  {
    category: 'Competitive Programming I/O (C++ STDIN)',
    language: 'cpp',
    executionMode: 'STDIN',
    code: `#include <iostream>
using namespace std;

int main() {
    long long a, b;
    if (cin >> a >> b) {
        cout << (a + b) << endl;
    }
    return 0;
}
`,
    tests: [
      { input: '1000000 2000000', expected: '3000000' },
      { input: '-45 90', expected: '45' }
    ]
  },

  // ── 7. JAVA FUNCTION MODE ────────────────────────────────────────────────
  {
    category: 'Class Method Solution (Java FUNCTION)',
    language: 'java',
    executionMode: 'FUNCTION',
    functionName: 'solution',
    code: `class Solution {
    public int solution(int a, int b) {
        return a + b;
    }
}
`,
    tests: [
      { input: '25 75', expected: 100 },
      { input: '-50 50', expected: 0 }
    ]
  },

  // ── 8. JAVA STDIN MODE ───────────────────────────────────────────────────
  {
    category: 'Console Scanner I/O (Java STDIN)',
    language: 'java',
    executionMode: 'STDIN',
    code: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextLong()) {
            long a = sc.nextLong();
            long b = sc.nextLong();
            System.out.println(a * b);
        }
    }
}
`,
    tests: [
      { input: '12 8', expected: '96' },
      { input: '100 -5', expected: '-500' }
    ]
  },

  // ── 9. ERROR CONDITIONS ──────────────────────────────────────────────────
  {
    category: 'Syntax / Compilation Error Detection',
    language: 'python',
    executionMode: 'STDIN',
    code: `def broken_syntax(
    print("missing closing paren"
`,
    expectError: 'compilation_error',
    tests: [{ input: 'test', expected: null }]
  },
  {
    category: 'Runtime Error / Zero Division Detection',
    language: 'python',
    executionMode: 'STDIN',
    code: `x = 10 / 0`,
    expectError: 'runtime_error',
    tests: [{ input: 'test', expected: null }]
  }
];

async function runAll() {
  let passedCount = 0;
  let totalTests = 0;
  const results = [];

  for (const [sIdx, scenario] of testScenarios.entries()) {
    console.log(`\n[Scenario ${sIdx + 1}/${testScenarios.length}] ${scenario.category} (${scenario.language.toUpperCase()} - ${scenario.executionMode})`);

    const wrapped = wrapCodeForExecution({
      code: scenario.code,
      language: scenario.language,
      executionMode: scenario.executionMode,
      functionName: scenario.functionName || 'solution'
    });

    for (const [tIdx, t] of scenario.tests.entries()) {
      totalTests++;
      const startTime = Date.now();
      try {
        const execRes = await provider.executeCode({
          language: scenario.language,
          code: wrapped,
          inputArgs: t.input,
          timeoutMs: 6000
        });

        const elapsed = Date.now() - startTime;
        let isPass = false;
        let note = '';

        if (scenario.expectError) {
          isPass = execRes.status === scenario.expectError;
          note = `Expected: ${scenario.expectError}, Got Status: ${execRes.status} (Error: ${execRes.error?.slice(0, 40)}…)`;
        } else {
          isPass = compareOutputs(execRes.output, t.expected, { title: scenario.category });
          note = `Expected: ${JSON.stringify(t.expected)}, Got: ${JSON.stringify(execRes.output)}`;
        }

        if (isPass) passedCount++;

        console.log(`  Test ${tIdx + 1}: ${isPass ? '✔ PASS' : '✖ FAIL'} in ${elapsed}ms | ${note}`);
        results.push({
          category: scenario.category,
          language: scenario.language,
          mode: scenario.executionMode,
          passed: isPass,
          runtimeMs: elapsed,
          note
        });
      } catch (err) {
        console.log(`  Test ${tIdx + 1}: ✖ CRASH: ${err.message}`);
        results.push({
          category: scenario.category,
          language: scenario.language,
          mode: scenario.executionMode,
          passed: false,
          note: err.message
        });
      }
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log(`SUMMARY: ${passedCount} / ${totalTests} Tests Passed (${Math.round((passedCount / totalTests) * 100)}%)`);
  console.log('═'.repeat(80));
}

runAll().catch(console.error);
