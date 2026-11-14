import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import {
  buildCppWrapper
} from '../src/services/execution/wrappers/cppWrapper.js';
import {
  buildJavaWrapper
} from '../src/services/execution/wrappers/javaWrapper.js';
import {
  buildPythonWrapper
} from '../src/services/execution/wrappers/pythonWrapper.js';
import {
  buildJavaScriptWrapper
} from '../src/services/execution/wrappers/javascriptWrapper.js';
import {
  validateMetadataContract,
  wrapCodeForExecution,
  EXECUTION_MODES
} from '../src/services/codeContract.service.js';

describe('Phase 3: Parameter-Aware Adapters & Language Wrappers', () => {

  // =========================================================================
  // 1. METADATA PRECEDENCE & CONTRACT VALIDATION
  // =========================================================================
  describe('1. Explicit Metadata Precedence', () => {
    it('1.1 Explicit dataStructure=ARRAY suppresses automatic node conversion despite code heuristics', () => {
      const codeWithHeuristics = `
        function solution(items) {
          // Contains .next and .left in comments or variables
          let next = items.length;
          let left = 0;
          return items.map(x => x * 2);
        }
      `;

      // In JS wrapper, when dataStructure is explicitly ARRAY, isLL and isBT should be false
      const jsWrapped = buildJavaScriptWrapper({
        code: codeWithHeuristics,
        dataStructure: 'ARRAY',
        parameters: [{ name: 'items', type: 'int[]' }]
      });

      expect(jsWrapped).toContain('i === 0 && false');
      // Verify that code.includes heuristics were not used to force isLL / isBT to true
      expect(jsWrapped).not.toContain("code.includes('.next')");
      expect(jsWrapped).not.toContain("code.includes('.left')");

      // In Python wrapper
      const pyWrapped = buildPythonWrapper({
        code: codeWithHeuristics,
        dataStructure: 'ARRAY',
        parameters: [{ name: 'items', type: 'int[]' }]
      });
      expect(pyWrapped).not.toContain("'.next' in");
      expect(pyWrapped).not.toContain("'.left' in");
    });

    it('1.2 Conflicting metadata produces actionable error via validateMetadataContract', () => {
      const conflict1 = validateMetadataContract({
        executionMode: 'FUNCTION',
        dataStructure: 'LINKED_LIST',
        parameters: [{ name: 'root', type: 'TreeNode' }],
        returnType: 'TreeNode'
      });
      expect(conflict1.isValid).toBe(false);
      expect(conflict1.errors.length).toBeGreaterThan(0);
      expect(conflict1.errors[0]).toMatch(/Conflicting metadata/i);
      expect(conflict1.errors[0]).toContain('TreeNode');

      const conflict2 = validateMetadataContract({
        executionMode: 'FUNCTION',
        dataStructure: 'BINARY_TREE',
        parameters: [{ name: 'head', type: 'ListNode' }],
        returnType: 'ListNode'
      });
      expect(conflict2.isValid).toBe(false);
      expect(conflict2.errors[0]).toMatch(/Conflicting metadata/i);
      expect(conflict2.errors[0]).toContain('ListNode');
    });

    it('1.3 STDIN mode with dataStructure generates non-blocking warning', () => {
      const result = validateMetadataContract({
        executionMode: 'STDIN',
        dataStructure: 'LINKED_LIST'
      });
      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('STDIN');
    });

    it('1.4 Missing metadata follows deterministic defaults', () => {
      const res = validateMetadataContract({});
      expect(res.isValid).toBe(true);
      expect(res.resolvedMetadata.executionMode).toBe('STDIN');
      expect(res.resolvedMetadata.dataStructure).toBe('ARRAY');
      expect(res.resolvedMetadata.returnType).toBe('void');
    });
  });

  // =========================================================================
  // 2. PARAMETER-AWARE CODE GENERATION & MIXED SIGNATURES
  // =========================================================================
  describe('2. Parameter-Aware Conversion Across All 4 Languages', () => {
    const mixedSignatures = [
      {
        name: '(ListNode head, int[] values)',
        params: [{ name: 'head', type: 'ListNode' }, { name: 'values', type: 'int[]' }],
        ds: 'LINKED_LIST'
      },
      {
        name: '(TreeNode root, int[] path)',
        params: [{ name: 'root', type: 'TreeNode' }, { name: 'path', type: 'int[]' }],
        ds: 'BINARY_TREE'
      },
      {
        name: '(int[] values, ListNode head)',
        params: [{ name: 'values', type: 'int[]' }, { name: 'head', type: 'ListNode' }],
        ds: 'LINKED_LIST'
      },
      {
        name: '(int[] values, TreeNode root)',
        params: [{ name: 'values', type: 'int[]' }, { name: 'root', type: 'TreeNode' }],
        ds: 'BINARY_TREE'
      },
      {
        name: '(ListNode head, int target)',
        params: [{ name: 'head', type: 'ListNode' }, { name: 'target', type: 'int' }],
        ds: 'LINKED_LIST'
      },
      {
        name: '(TreeNode root, int target)',
        params: [{ name: 'root', type: 'TreeNode' }, { name: 'target', type: 'int' }],
        ds: 'BINARY_TREE'
      }
    ];

    it.each(mixedSignatures)('2.1 C++ Wrapper handles $name parameter-awarely', ({ params, ds }) => {
      const code = `
        class Solution {
        public:
            int solution(${params.map(p => `${p.type === 'ListNode' ? 'ListNode*' : p.type === 'TreeNode' ? 'TreeNode*' : p.type === 'int[]' ? 'vector<int>&' : 'int'} ${p.name}`).join(', ')}) {
                return 42;
            }
        };
      `;
      const wrapped = buildCppWrapper({
        code,
        functionName: 'solution',
        parameters: params,
        dataStructure: ds,
        returnType: 'int'
      });

      params.forEach((p, idx) => {
        if (/List[nN]ode/i.test(p.type)) {
          expect(wrapped).toContain(`ListNode* ${p.name} = parseListNodeArg(`);
        } else if (/Tree[nN]ode/i.test(p.type)) {
          expect(wrapped).toContain(`TreeNode* ${p.name} = parseTreeNodeArg(`);
        } else if (/int\[\]|vector/i.test(p.type)) {
          expect(wrapped).toContain(`vector<int> ${p.name} = parseVectorInt(`);
        } else if (/int/i.test(p.type)) {
          expect(wrapped).toContain(`int ${p.name} = parseIntArg(`);
        }
      });
    });

    it.each(mixedSignatures)('2.2 Python Wrapper injects parameter-aware types for $name', ({ params, ds }) => {
      const code = `
def solution(${params.map(p => p.name).join(', ')}):
    return 42
      `;
      const wrapped = buildPythonWrapper({
        code,
        functionName: 'solution',
        parameters: params,
        dataStructure: ds,
        returnType: 'int'
      });

      expect(wrapped).toContain(`param_types = ${JSON.stringify(params.map(p => p.type))}`);
      expect(wrapped).toContain(`param_names = ${JSON.stringify(params.map(p => p.name))}`);
      expect(wrapped).toContain('convert_to_tree');
      expect(wrapped).toContain('convert_to_list');
    });

    it.each(mixedSignatures)('2.3 JavaScript Wrapper injects parameter-aware types for $name', ({ params, ds }) => {
      const code = `
function solution(${params.map(p => p.name).join(', ')}) {
    return 42;
}
      `;
      const wrapped = buildJavaScriptWrapper({
        code,
        functionName: 'solution',
        parameters: params,
        dataStructure: ds,
        returnType: 'int'
      });

      expect(wrapped).toContain(`const paramTypes = ${JSON.stringify(params.map(p => p.type))}`);
      expect(wrapped).toContain(`const paramNames = ${JSON.stringify(params.map(p => p.name))}`);
      expect(wrapped).toContain('convertToTree');
      expect(wrapped).toContain('convertToList');
    });

    it.each(mixedSignatures)('2.4 Java Wrapper supports parameter-aware argument reflection for $name', ({ params, ds }) => {
      const code = `
class Solution {
    public int solution(${params.map(p => `${p.type === 'ListNode' ? 'ListNode' : p.type === 'TreeNode' ? 'TreeNode' : p.type === 'int[]' ? 'int[]' : 'int'} ${p.name}`).join(', ')}) {
        return 42;
    }
}
      `;
      const wrapped = buildJavaWrapper({
        code,
        functionName: 'solution',
        parameters: params,
        dataStructure: ds,
        returnType: 'int'
      });

      expect(wrapped).toContain('Class<?>[] pTypes = targetMethod.getParameterTypes();');
      expect(wrapped).toContain('parseJavaArg(pTypes[i], argsList.get(i).trim()');
      if (ds === 'LINKED_LIST') {
        expect(wrapped).toContain('class ListNode');
      }
      if (ds === 'BINARY_TREE') {
        expect(wrapped).toContain('class TreeNode');
      }
    });
  });

  // =========================================================================
  // 3. LANGUAGE-SPECIFIC WRAPPER AUDIT
  // =========================================================================
  describe('3. Language Wrapper Features & Edge Cases', () => {
    it('3.1 C++ wrapper supports 2D matrix vector<vector<int>>', () => {
      const code = `
class Solution {
public:
    int numIslands(vector<vector<int>>& grid) {
        return grid.size();
    }
};
      `;
      const wrapped = buildCppWrapper({
        code,
        functionName: 'numIslands',
        parameters: [{ name: 'grid', type: 'vector<vector<int>>' }],
        dataStructure: 'ARRAY',
        returnType: 'int'
      });

      expect(wrapped).toContain('vector<vector<int>> parseVectorVectorInt(');
      expect(wrapped).toContain('vector<vector<int>> grid = parseVectorVectorInt(');
      expect(wrapped).toContain('void printOutput(const vector<vector<int>>& v)');
    });

    it('3.2 C++ wrapper supports free-standing function without class Solution', () => {
      const code = `
int add(int a, int b) {
    return a + b;
}
      `;
      const wrapped = buildCppWrapper({
        code,
        functionName: 'add',
        parameters: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }],
        dataStructure: 'NONE',
        returnType: 'int'
      });

      expect(wrapped).not.toContain('Solution sol;');
      expect(wrapped).toContain('auto res = add(a, b);');
    });

    it('3.3 Java wrapper enforces missing argument bounds check with IllegalArgumentException', () => {
      const code = `
class Solution {
    public int add(int a, int b) {
        return a + b;
    }
}
      `;
      const wrapped = buildJavaWrapper({
        code,
        functionName: 'add',
        parameters: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }],
        dataStructure: 'NONE',
        returnType: 'int'
      });

      expect(wrapped).toContain('throw new IllegalArgumentException("Missing argument for parameter #" + (i + 1) + " of type " + pTypes[i].getSimpleName());');
    });

    it('3.4 Java wrapper automatically wraps bare method in class Solution if missing', () => {
      const code = `
public int add(int a, int b) {
    return a + b;
}
      `;
      const wrapped = buildJavaWrapper({
        code,
        functionName: 'add',
        parameters: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }],
        dataStructure: 'NONE',
        returnType: 'int'
      });

      expect(wrapped).toContain('class Solution {');
      expect(wrapped).toContain('public int add(int a, int b)');
    });

    it('3.5 Python and JS wrappers support both Solution class and free-standing function', () => {
      const pyClass = buildPythonWrapper({
        code: 'class Solution:\n    def solve(self, x):\n        return x * 2',
        functionName: 'solve',
        parameters: [{ name: 'x', type: 'int' }]
      });
      expect(pyClass).toContain("if 'Solution' in globals():");

      const jsClass = buildJavaScriptWrapper({
        code: 'class Solution {\n    solve(x) { return x * 2; }\n}',
        functionName: 'solve',
        parameters: [{ name: 'x', type: 'int' }]
      });
      expect(jsClass).toContain("typeof Solution === 'function'");
    });
  });

  // =========================================================================
  // 4. LOCAL RUNTIME EXECUTION TESTS (Node, Python, Java, C++)
  // =========================================================================
  describe('4. Local Compiler/Runtime Execution of Mixed Signatures', () => {
    const tmpDir = path.join(os.tmpdir(), `testforge-phase3-${Date.now()}`);

    beforeAll(() => {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    });

    afterAll(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    it('4.1 Local Node.js: mixed (ListNode head, int[] values) - converts head to ListNode, preserves values as plain Array', () => {
      const studentCode = `
        function appendValues(head, values) {
          // head is a ListNode, values is a plain Array
          if (!head) return ListNode.fromArray(values);
          if (!Array.isArray(values)) throw new Error("values should be a plain Array!");
          let curr = head;
          while (curr.next) {
            curr = curr.next;
          }
          for (const v of values) {
            curr.next = new ListNode(v);
            curr = curr.next;
          }
          return head;
        }
      `;

      const wrapped = buildJavaScriptWrapper({
        code: studentCode,
        functionName: 'appendValues',
        parameters: [
          { name: 'head', type: 'ListNode' },
          { name: 'values', type: 'int[]' }
        ],
        dataStructure: 'LINKED_LIST',
        returnType: 'ListNode'
      });

      const scriptPath = path.join(tmpDir, 'test_mixed_ll.js');
      fs.writeFileSync(scriptPath, wrapped, 'utf8');

      // Input: line 1 = [1, 2], line 2 = [3, 4, 5]
      const input = `[1, 2]\n[3, 4, 5]`;
      const output = execSync(`node "${scriptPath}"`, {
        input,
        encoding: 'utf8'
      }).trim();

      expect(output).toBe('[1,2,3,4,5]');
    });

    it('4.2 Local Node.js: mixed (TreeNode root, int[] path) - converts root to TreeNode, preserves path as plain Array', () => {
      const studentCode = `
        function checkPath(root, path) {
          if (!root || !Array.isArray(path)) return false;
          // Verify that root is TreeNode and path is array
          return root.val === path[0];
        }
      `;

      const wrapped = buildJavaScriptWrapper({
        code: studentCode,
        functionName: 'checkPath',
        parameters: [
          { name: 'root', type: 'TreeNode' },
          { name: 'path', type: 'int[]' }
        ],
        dataStructure: 'BINARY_TREE',
        returnType: 'boolean'
      });

      const scriptPath = path.join(tmpDir, 'test_mixed_bt.js');
      fs.writeFileSync(scriptPath, wrapped, 'utf8');

      const input = `[10, 5, 15]\n[10, 5]`;
      const output = execSync(`node "${scriptPath}"`, {
        input,
        encoding: 'utf8'
      }).trim();

      expect(output).toBe('true');
    });

    it('4.3 Local Python: mixed (ListNode head, int[] values) - parameter-aware execution', () => {
      const studentCode = `
class Solution:
    def appendValues(self, head, values):
        if not isinstance(values, list):
            raise TypeError("values must be a list, got: " + type(values).__name__)
        if not head:
            return ListNode.from_list(values)
        curr = head
        while curr.next:
            curr = curr.next
        for v in values:
            curr.next = ListNode(v)
            curr = curr.next
        return head
      `;

      const wrapped = buildPythonWrapper({
        code: studentCode,
        functionName: 'appendValues',
        parameters: [
          { name: 'head', type: 'ListNode' },
          { name: 'values', type: 'int[]' }
        ],
        dataStructure: 'LINKED_LIST',
        returnType: 'ListNode'
      });

      const pyPath = path.join(tmpDir, 'test_mixed_ll.py');
      fs.writeFileSync(pyPath, wrapped, 'utf8');

      const input = `[1, 2]\n[3, 4, 5]`;
      const output = execSync(`python "${pyPath}"`, {
        input,
        encoding: 'utf8'
      }).trim();

      expect(output).toBe('[1,2,3,4,5]');
    });

    it('4.4 Local Python: mixed (TreeNode root, int[] path) - parameter-aware execution', () => {
      const studentCode = `
def checkPath(root, path):
    if not isinstance(path, list):
        raise TypeError("path must be a list")
    if not root:
        return False
    return root.val == path[0]
      `;

      const wrapped = buildPythonWrapper({
        code: studentCode,
        functionName: 'checkPath',
        parameters: [
          { name: 'root', type: 'TreeNode' },
          { name: 'path', type: 'int[]' }
        ],
        dataStructure: 'BINARY_TREE',
        returnType: 'boolean'
      });

      const pyPath = path.join(tmpDir, 'test_mixed_bt.py');
      fs.writeFileSync(pyPath, wrapped, 'utf8');

      const input = `[10, 5, 15]\n[10, 5]`;
      const output = execSync(`python "${pyPath}"`, {
        input,
        encoding: 'utf8'
      }).trim();

      expect(output).toBe('true');
    });

    it('4.5 Local Java: mixed (ListNode head, int[] values) - compiles and executes parameter-awarely', () => {
      const studentCode = `
class Solution {
    public ListNode appendValues(ListNode head, int[] values) {
        if (head == null) return ListNode.fromArray(values);
        ListNode curr = head;
        while (curr.next != null) {
            curr = curr.next;
        }
        for (int v : values) {
            curr.next = new ListNode(v);
            curr = curr.next;
        }
        return head;
    }
}
      `;

      const wrapped = buildJavaWrapper({
        code: studentCode,
        functionName: 'appendValues',
        parameters: [
          { name: 'head', type: 'ListNode' },
          { name: 'values', type: 'int[]' }
        ],
        dataStructure: 'LINKED_LIST',
        returnType: 'ListNode'
      });

      const javaDir = path.join(tmpDir, 'java_test');
      fs.mkdirSync(javaDir, { recursive: true });
      const mainPath = path.join(javaDir, 'Main.java');
      fs.writeFileSync(mainPath, wrapped, 'utf8');

      execSync(`javac "${mainPath}"`, { encoding: 'utf8' });

      const input = `[1, 2]\n[3, 4, 5]`;
      const output = execSync(`java -cp "${javaDir}" Main`, {
        input,
        encoding: 'utf8'
      }).trim();

      expect(output).toBe('[1,2,3,4,5]');
    });

    it('4.6 Local Java: enforces missing argument validation', () => {
      const studentCode = `
class Solution {
    public int add(int a, int b) {
        return a + b;
    }
}
      `;

      const wrapped = buildJavaWrapper({
        code: studentCode,
        functionName: 'add',
        parameters: [
          { name: 'a', type: 'int' },
          { name: 'b', type: 'int' }
        ],
        dataStructure: 'NONE',
        returnType: 'int'
      });

      const javaDir = path.join(tmpDir, 'java_missing_test');
      fs.mkdirSync(javaDir, { recursive: true });
      const mainPath = path.join(javaDir, 'Main.java');
      fs.writeFileSync(mainPath, wrapped, 'utf8');

      execSync(`javac "${mainPath}"`, { encoding: 'utf8' });

      // Provide only 1 argument for a 2-argument function
      let failed = false;
      let stderr = '';
      try {
        execSync(`java -cp "${javaDir}" Main`, {
          input: '10',
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } catch (err) {
        failed = true;
        stderr = (err.stderr || '').toString();
      }

      expect(failed).toBe(true);
      expect(stderr).toMatch(/Missing argument for parameter #2/i);
    });

    it('4.7 Local C++: mixed (ListNode head, int[] values) - compiles and executes parameter-awarely', () => {
      const studentCode = `
class Solution {
public:
    ListNode* appendValues(ListNode* head, vector<int>& values) {
        if (!head) return ListNode::fromVec(values);
        ListNode* curr = head;
        while (curr->next) {
            curr = curr->next;
        }
        for (int v : values) {
            curr->next = new ListNode(v);
            curr = curr->next;
        }
        return head;
    }
};
      `;

      const wrapped = buildCppWrapper({
        code: studentCode,
        functionName: 'appendValues',
        parameters: [
          { name: 'head', type: 'ListNode*' },
          { name: 'values', type: 'vector<int>' }
        ],
        dataStructure: 'LINKED_LIST',
        returnType: 'ListNode*'
      });

      const cppPath = path.join(tmpDir, 'test_mixed.cpp');
      const exePath = path.join(tmpDir, 'test_mixed.exe');
      fs.writeFileSync(cppPath, wrapped, 'utf8');

      execSync(`g++ -O2 -std=c++17 "${cppPath}" -o "${exePath}"`, { encoding: 'utf8' });

      const input = `[1, 2]\n[3, 4, 5]`;
      const output = execSync(`"${exePath}"`, {
        input,
        encoding: 'utf8'
      }).trim();

      expect(output).toBe('[1,2,3,4,5]');
    });
  });
});
