import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import mongoose from 'mongoose';
import { Question } from '../src/models/Question.js';
import { getAdapter, getRegisteredAdapters } from '../src/services/execution/adapters/adapterRegistry.js';
import { LinkedListAdapter, MAX_LINKED_LIST_NODES } from '../src/services/execution/adapters/LinkedListAdapter.js';
import { ArrayAdapter } from '../src/services/execution/adapters/ArrayAdapter.js';
import { StringAdapter } from '../src/services/execution/adapters/StringAdapter.js';
import { wrapCodeForExecution } from '../src/services/codeContract.service.js';

describe('Phase 2E: Data Structure-Aware Code Execution Adapters - Linked List Support', () => {

  // ════════════════════════════════════════════════════════════════════════════
  // 1. ADAPTER ARCHITECTURE & REGISTRY
  // ════════════════════════════════════════════════════════════════════════════
  describe('1. Adapter Architecture & Registry', () => {
    test('1.1 Adapter Registry resolves LinkedListAdapter for LINKED_LIST', () => {
      const adapter = getAdapter('LINKED_LIST');
      expect(adapter).toBeInstanceOf(LinkedListAdapter);
      expect(adapter.name).toBe('LINKED_LIST');
    });

    test('1.2 Adapter Registry resolves ArrayAdapter for ARRAY or undefined (backward compatibility)', () => {
      const adapterExplicit = getAdapter('ARRAY');
      expect(adapterExplicit).toBeInstanceOf(ArrayAdapter);

      const adapterDefault = getAdapter(undefined);
      expect(adapterDefault).toBeInstanceOf(ArrayAdapter);

      const adapterNull = getAdapter(null);
      expect(adapterNull).toBeInstanceOf(ArrayAdapter);
    });

    test('1.3 Adapter Registry resolves StringAdapter for STRING', () => {
      const adapter = getAdapter('STRING');
      expect(adapter).toBeInstanceOf(StringAdapter);
      expect(adapter.name).toBe('STRING');
    });

    test('1.4 Question schema supports dataStructure field defaulting to ARRAY', () => {
      const q = new Question({
        ownerId: new mongoose.Types.ObjectId(),
        title: 'Reverse Linked List',
        statement: 'Reverse a singly linked list',
        executionMode: 'FUNCTION',
        functionName: 'reverseList'
      });
      expect(q.dataStructure).toBe('ARRAY');

      q.dataStructure = 'LINKED_LIST';
      expect(q.dataStructure).toBe('LINKED_LIST');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. WRAPPER CONTRACT GENERATION (NO HARDCODED MOCKS)
  // ════════════════════════════════════════════════════════════════════════════
  describe('2. Language-Specific Wrapper Contract Generation', () => {
    const userCodeCpp = `class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;
        while (head) {
            ListNode* nxt = head->next;
            head->next = prev;
            prev = head;
            head = nxt;
        }
        return prev;
    }
};`;

    test('2.1 C++ wrapper defines struct ListNode and invokes configured reverseList without hardcoding solution(a,b)', () => {
      const wrapped = wrapCodeForExecution({
        code: userCodeCpp,
        language: 'cpp',
        executionMode: 'FUNCTION',
        dataStructure: 'LINKED_LIST',
        functionName: 'reverseList',
        parameters: [{ name: 'head', type: 'ListNode*' }]
      });

      expect(wrapped).toContain('struct ListNode {');
      expect(wrapped).toContain('sol.reverseList(');
      expect(wrapped).not.toContain('sol.solution(a, b);');
      expect(wrapped).toContain('toVec(ListNode* h, int limit = 100000)');
    });

    test('2.2 Python wrapper defines class ListNode and supports to_list limit', () => {
      const userCodePy = `class Solution:
    def reverseList(self, head):
        prev = None
        while head:
            nxt = head.next
            head.next = prev
            prev = head
            head = nxt
        return prev`;

      const wrapped = wrapCodeForExecution({
        code: userCodePy,
        language: 'python',
        executionMode: 'FUNCTION',
        dataStructure: 'LINKED_LIST',
        functionName: 'reverseList',
        parameters: [{ name: 'head', type: 'ListNode' }]
      });

      expect(wrapped).toContain('class ListNode:');
      expect(wrapped).toContain('def to_list(head, limit=100000):');
      expect(wrapped).toContain('getattr(sol_inst, \'reverseList\'');
    });

    test('2.3 Java wrapper defines class ListNode with cycle check', () => {
      const userCodeJava = `class Solution {
    public ListNode reverseList(ListNode head) {
        ListNode prev = null;
        while (head != null) {
            ListNode nxt = head.next;
            head.next = prev;
            prev = head;
            head = nxt;
        }
        return prev;
    }
}`;

      const wrapped = wrapCodeForExecution({
        code: userCodeJava,
        language: 'java',
        executionMode: 'FUNCTION',
        dataStructure: 'LINKED_LIST',
        functionName: 'reverseList',
        parameters: [{ name: 'head', type: 'ListNode' }]
      });

      expect(wrapped).toContain('class ListNode {');
      expect(wrapped).toContain('public static String toListString(ListNode head, int limit)');
      expect(wrapped).toContain('class Main');
    });

    test('2.4 JavaScript wrapper defines ListNode prototype and toArray with cycle check', () => {
      const userCodeJs = `function reverseList(head) {
  let prev = null;
  while (head) {
    let nxt = head.next;
    head.next = prev;
    prev = head;
    head = nxt;
  }
  return prev;
}`;

      const wrapped = wrapCodeForExecution({
        code: userCodeJs,
        language: 'javascript',
        executionMode: 'FUNCTION',
        dataStructure: 'LINKED_LIST',
        functionName: 'reverseList',
        parameters: [{ name: 'head', type: 'ListNode' }]
      });

      expect(wrapped).toContain('function ListNode(val, next)');
      expect(wrapped).toContain('ListNode.toArray = function(head, limit = 100000)');
      expect(wrapped).toContain('targetFn.apply(null, finalArgs)');
      expect(wrapped).toContain('typeof reverseList === \'function\'');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. REAL EXECUTION TESTS ACROSS ALL 4 LANGUAGES
  // ════════════════════════════════════════════════════════════════════════════
  describe('3. Real Compiler / Interpreter Execution Tests Across All 4 Languages', () => {
    const testCases = [
      { input: '[1,2,3,4,5]', expected: '[5,4,3,2,1]' },
      { input: '[1]', expected: '[1]' },
      { input: '[]', expected: '[]' },
      { input: '[1,2]', expected: '[2,1]' },
      { input: '[1,2,3]', expected: '[3,2,1]' }
    ];

    // --- C++ Real Compiler Tests ---
    describe('3.1 C++ Real Compiler (g++) Tests', () => {
      const cppCode = `class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;
        while (head) {
            ListNode* nxt = head->next;
            head->next = prev;
            prev = head;
            head = nxt;
        }
        return prev;
    }
};`;

      const wrapped = wrapCodeForExecution({
        code: cppCode,
        language: 'cpp',
        executionMode: 'FUNCTION',
        dataStructure: 'LINKED_LIST',
        functionName: 'reverseList',
        parameters: [{ name: 'head', type: 'ListNode*' }]
      });

      const tmpDir = os.tmpdir();
      const uid = `cpp_test_${Date.now()}`;
      const srcPath = path.join(tmpDir, `${uid}.cpp`);
      const binPath = path.join(tmpDir, `${uid}.exe`);

      beforeAll(() => {
        fs.writeFileSync(srcPath, wrapped, 'utf-8');
        execSync(`g++ -O2 -std=c++17 "${srcPath}" -o "${binPath}"`);
      });

      afterAll(() => {
        try { if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath); } catch {}
        try { if (fs.existsSync(binPath)) fs.unlinkSync(binPath); } catch {}
      });

      test.each(testCases)('C++ runs input $input -> expected $expected', ({ input, expected }) => {
        const stdout = execSync(`"${binPath}"`, {
          input,
          encoding: 'utf-8',
          timeout: 5000
        });
        expect(stdout.trim()).toBe(expected);
      });
    });

    // --- Python Real Interpreter Tests ---
    describe('3.2 Python Real Interpreter Tests', () => {
      const pyCode = `class Solution:
    def reverseList(self, head):
        prev = None
        while head:
            nxt = head.next
            head.next = prev
            prev = head
            head = nxt
        return prev`;

      const wrapped = wrapCodeForExecution({
        code: pyCode,
        language: 'python',
        executionMode: 'FUNCTION',
        dataStructure: 'LINKED_LIST',
        functionName: 'reverseList',
        parameters: [{ name: 'head', type: 'ListNode' }]
      });

      const tmpDir = os.tmpdir();
      const uid = `py_test_${Date.now()}`;
      const scriptPath = path.join(tmpDir, `${uid}.py`);

      beforeAll(() => {
        fs.writeFileSync(scriptPath, wrapped, 'utf-8');
      });

      afterAll(() => {
        try { if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath); } catch {}
      });

      test.each(testCases)('Python runs input $input -> expected $expected', ({ input, expected }) => {
        const stdout = execSync(`python "${scriptPath}"`, {
          input,
          encoding: 'utf-8',
          timeout: 5000
        });
        const parsed = JSON.parse(stdout.trim());
        const expectedParsed = JSON.parse(expected);
        expect(parsed).toEqual(expectedParsed);
      });
    });

    // --- Java Real Compiler (javac / java) Tests ---
    describe('3.3 Java Real Compiler & JVM Tests', () => {
      const javaCode = `class Solution {
    public ListNode reverseList(ListNode head) {
        ListNode prev = null;
        while (head != null) {
            ListNode nxt = head.next;
            head.next = prev;
            prev = head;
            head = nxt;
        }
        return prev;
    }
}`;

      const wrapped = wrapCodeForExecution({
        code: javaCode,
        language: 'java',
        executionMode: 'FUNCTION',
        dataStructure: 'LINKED_LIST',
        functionName: 'reverseList',
        parameters: [{ name: 'head', type: 'ListNode' }]
      });

      const testDir = path.join(os.tmpdir(), `java_test_${Date.now()}`);

      beforeAll(() => {
        fs.mkdirSync(testDir, { recursive: true });
        const mainJava = path.join(testDir, 'Main.java');
        fs.writeFileSync(mainJava, wrapped, 'utf-8');
        execSync(`javac "${mainJava}"`);
      });

      afterAll(() => {
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
      });

      test.each(testCases)('Java runs input $input -> expected $expected', ({ input, expected }) => {
        const stdout = execSync(`java -cp "${testDir}" Main`, {
          input,
          encoding: 'utf-8',
          timeout: 5000
        });
        expect(stdout.trim()).toBe(expected);
      });
    });

    // --- JavaScript Real Node.js Runtime Tests ---
    describe('3.4 JavaScript Real Node.js Runtime Tests', () => {
      const jsCode = `function reverseList(head) {
  let prev = null;
  while (head) {
    let nxt = head.next;
    head.next = prev;
    prev = head;
    head = nxt;
  }
  return prev;
}`;

      const wrapped = wrapCodeForExecution({
        code: jsCode,
        language: 'javascript',
        executionMode: 'FUNCTION',
        dataStructure: 'LINKED_LIST',
        functionName: 'reverseList',
        parameters: [{ name: 'head', type: 'ListNode' }]
      });

      const tmpDir = os.tmpdir();
      const uid = `js_test_${Date.now()}`;
      const scriptPath = path.join(tmpDir, `${uid}.js`);

      beforeAll(() => {
        fs.writeFileSync(scriptPath, wrapped, 'utf-8');
      });

      afterAll(() => {
        try { if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath); } catch {}
      });

      test.each(testCases)('JavaScript runs input $input -> expected $expected', ({ input, expected }) => {
        const stdout = execSync(`node "${scriptPath}"`, {
          input,
          encoding: 'utf-8',
          timeout: 5000
        });
        const parsed = JSON.parse(stdout.trim());
        const expectedParsed = JSON.parse(expected);
        expect(parsed).toEqual(expectedParsed);
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. CYCLE DETECTION & 100,000 NODE SAFETY LIMIT
  // ════════════════════════════════════════════════════════════════════════════
  describe('4. Cycle Detection & Safety Limit Tests', () => {
    test('4.1 Python raises error when linked list has a cycle exceeding 100,000 limit', () => {
      const cyclePyCode = `class Solution:
    def reverseList(self, head):
        # Create an intentional cycle
        if head and head.next:
            head.next.next = head
        return head`;

      const wrapped = wrapCodeForExecution({
        code: cyclePyCode,
        language: 'python',
        executionMode: 'FUNCTION',
        dataStructure: 'LINKED_LIST',
        functionName: 'reverseList',
        parameters: [{ name: 'head', type: 'ListNode' }]
      });

      const scriptPath = path.join(os.tmpdir(), `cycle_${Date.now()}.py`);
      fs.writeFileSync(scriptPath, wrapped, 'utf-8');

      try {
        expect(() => {
          execSync(`python "${scriptPath}"`, {
            input: '[1,2]',
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
          });
        }).toThrow();
      } finally {
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
      }
    });

    test('4.2 JavaScript throws error when linked list has a cycle exceeding 100,000 limit', () => {
      const cycleJsCode = `function reverseList(head) {
  if (head && head.next) {
    head.next.next = head; // cycle
  }
  return head;
}`;

      const wrapped = wrapCodeForExecution({
        code: cycleJsCode,
        language: 'javascript',
        executionMode: 'FUNCTION',
        dataStructure: 'LINKED_LIST',
        functionName: 'reverseList',
        parameters: [{ name: 'head', type: 'ListNode' }]
      });

      const scriptPath = path.join(os.tmpdir(), `cycle_${Date.now()}.js`);
      fs.writeFileSync(scriptPath, wrapped, 'utf-8');

      try {
        expect(() => {
          execSync(`node "${scriptPath}"`, {
            input: '[1,2]',
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
          });
        }).toThrow();
      } finally {
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 5. REGRESSION VERIFICATION (ARRAY, STRING, STDIN)
  // ════════════════════════════════════════════════════════════════════════════
  describe('5. Regression Verification (Existing Array, String, and STDIN Questions)', () => {
    test('5.1 STDIN mode returns student code completely untouched', () => {
      const stdinCode = 'import sys\nfor line in sys.stdin:\n    print(line.strip()[::-1])';
      const wrapped = wrapCodeForExecution({
        code: stdinCode,
        language: 'python',
        executionMode: 'STDIN'
      });
      expect(wrapped).toBe(stdinCode);
    });

    test('5.2 Array FUNCTION mode executes successfully with twoSum', () => {
      const twoSumPy = `def twoSum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        diff = target - n
        if diff in seen:
            return [seen[diff], i]
        seen[n] = i
    return []`;

      const wrapped = wrapCodeForExecution({
        code: twoSumPy,
        language: 'python',
        executionMode: 'FUNCTION',
        dataStructure: 'ARRAY',
        functionName: 'twoSum',
        parameters: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }]
      });

      const scriptPath = path.join(os.tmpdir(), `twosum_${Date.now()}.py`);
      fs.writeFileSync(scriptPath, wrapped, 'utf-8');

      try {
        const stdout = execSync(`python "${scriptPath}"`, {
          input: '[2,7,11,15]\n9',
          encoding: 'utf-8'
        });
        expect(JSON.parse(stdout.trim())).toEqual([0, 1]);
      } finally {
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
      }
    });
  });
});
