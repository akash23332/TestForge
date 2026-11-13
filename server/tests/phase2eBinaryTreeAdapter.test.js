import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import mongoose from 'mongoose';
import { Question } from '../src/models/Question.js';
import { getAdapter, getRegisteredAdapters } from '../src/services/execution/adapters/adapterRegistry.js';
import { BinaryTreeAdapter, MAX_TREE_NODES } from '../src/services/execution/adapters/BinaryTreeAdapter.js';
import { wrapCodeForExecution } from '../src/services/codeContract.service.js';

describe('Phase 2E: Data Structure-Aware Code Execution Adapters - Binary Tree Support', () => {

  // ════════════════════════════════════════════════════════════════════════════
  // 1. ADAPTER ARCHITECTURE & REGISTRY
  // ════════════════════════════════════════════════════════════════════════════
  describe('1. Adapter Architecture & Registry', () => {
    test('1.1 Adapter Registry resolves BinaryTreeAdapter for BINARY_TREE', () => {
      const adapter = getAdapter('BINARY_TREE');
      expect(adapter).toBeInstanceOf(BinaryTreeAdapter);
      expect(adapter.name).toBe('BINARY_TREE');
    });

    test('1.2 Adapter Registry lists BINARY_TREE among registered adapters', () => {
      const adapters = getRegisteredAdapters();
      expect(adapters).toContain('BINARY_TREE');
      expect(adapters).toContain('LINKED_LIST');
      expect(adapters).toContain('ARRAY');
      expect(adapters).toContain('STRING');
    });

    test('1.3 Question schema supports BINARY_TREE dataStructure', () => {
      const q = new Question({
        ownerId: new mongoose.Types.ObjectId(),
        title: 'Invert Binary Tree',
        statement: 'Invert a binary tree',
        executionMode: 'FUNCTION',
        dataStructure: 'BINARY_TREE',
        functionName: 'invertTree',
        returnType: 'TreeNode*'
      });
      expect(q.dataStructure).toBe('BINARY_TREE');
    });

    test('1.4 BinaryTreeAdapter provides language-specific starter templates', () => {
      const adapter = getAdapter('BINARY_TREE');
      const cppTpl = adapter.getStarterTemplate('cpp', 'invertTree');
      expect(cppTpl).toContain('TreeNode* invertTree(TreeNode* root)');

      const pyTpl = adapter.getStarterTemplate('python', 'invertTree');
      expect(pyTpl).toContain('def invertTree(self, root):');

      const javaTpl = adapter.getStarterTemplate('java', 'invertTree');
      expect(javaTpl).toContain('public TreeNode invertTree(TreeNode root)');

      const jsTpl = adapter.getStarterTemplate('javascript', 'invertTree');
      expect(jsTpl).toContain('function invertTree(root)');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. WRAPPER GENERATION INSPECTION
  // ════════════════════════════════════════════════════════════════════════════
  describe('2. Language Wrapper Generation for Binary Tree', () => {
    test('2.1 C++ wrapper includes TreeNode struct and does NOT hardcode solution(a,b)', () => {
      const wrapped = wrapCodeForExecution({
        code: `class Solution { public: TreeNode* invertTree(TreeNode* root) { return root; } };`,
        language: 'cpp',
        executionMode: 'FUNCTION',
        dataStructure: 'BINARY_TREE',
        functionName: 'invertTree',
        returnType: 'TreeNode*',
        parameters: [{ name: 'root', type: 'TreeNode*' }]
      });
      expect(wrapped).toContain('struct TreeNode');
      expect(wrapped).toContain('sol.invertTree(root)');
      expect(wrapped).not.toContain('sol.solution(a, b)');
    });

    test('2.2 Python wrapper includes TreeNode and calls configured method', () => {
      const wrapped = wrapCodeForExecution({
        code: `class Solution:\n    def invertTree(self, root):\n        return root`,
        language: 'python',
        executionMode: 'FUNCTION',
        dataStructure: 'BINARY_TREE',
        functionName: 'invertTree',
        returnType: 'TreeNode'
      });
      expect(wrapped).toContain('class TreeNode:');
      expect(wrapped).toContain("getattr(sol_inst, 'invertTree'");
      expect(wrapped).toContain('TreeNode.from_list');
      expect(wrapped).toContain('TreeNode.to_list');
    });

    test('2.3 Java wrapper includes TreeNode and level-order serialization', () => {
      const wrapped = wrapCodeForExecution({
        code: `class Solution { public TreeNode invertTree(TreeNode root) { return root; } }`,
        language: 'java',
        executionMode: 'FUNCTION',
        dataStructure: 'BINARY_TREE',
        functionName: 'invertTree',
        returnType: 'TreeNode'
      });
      expect(wrapped).toContain('class TreeNode');
      expect(wrapped).toContain('fromLevelOrder');
      expect(wrapped).toContain('toLevelOrderString');
      expect(wrapped).toContain('"invertTree"');
    });

    test('2.4 JavaScript wrapper includes TreeNode and tree conversion functions', () => {
      const wrapped = wrapCodeForExecution({
        code: `function invertTree(root) { return root; }`,
        language: 'javascript',
        executionMode: 'FUNCTION',
        dataStructure: 'BINARY_TREE',
        functionName: 'invertTree',
        returnType: 'TreeNode'
      });
      expect(wrapped).toContain('function TreeNode');
      expect(wrapped).toContain('TreeNode.fromArray');
      expect(wrapped).toContain('TreeNode.toArray');
      expect(wrapped).toContain('invertTree');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. REAL LOCAL COMPILER / RUNTIME EXECUTION TESTS (ALL 4 LANGUAGES)
  // ════════════════════════════════════════════════════════════════════════════
  describe('3. Real Compiler / Runtime Execution: Invert Binary Tree', () => {
    const invertCases = [
      { input: '[]', expected: '[]' },
      { input: '[1]', expected: '[1]' },
      { input: '[1,2,3]', expected: '[1,3,2]' },
      { input: '[1,2,3,null,4,5,6]', expected: '[1,3,2,6,5,4]' },
      { input: '[1,null,2,null,3]', expected: '[1,2,null,3]' },
      { input: '[1,2,null,3,null,4]', expected: '[1,null,2,null,3,null,4]' }
    ];

    // --- 3.1 C++ Real g++ Execution ---
    describe('3.1 C++ Real Compiler (g++) Execution', () => {
      const cppCode = `class Solution {
public:
    TreeNode* invertTree(TreeNode* root) {
        if (!root) return nullptr;
        TreeNode* temp = root->left;
        root->left = invertTree(root->right);
        root->right = invertTree(temp);
        return root;
    }
};`;

      const wrapped = wrapCodeForExecution({
        code: cppCode,
        language: 'cpp',
        executionMode: 'FUNCTION',
        dataStructure: 'BINARY_TREE',
        functionName: 'invertTree',
        returnType: 'TreeNode*',
        parameters: [{ name: 'root', type: 'TreeNode*' }]
      });

      const tmpDir = os.tmpdir();
      const uid = `cpp_bt_test_${Date.now()}`;
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

      test.each(invertCases)('C++ invertTree input $input -> expected $expected', ({ input, expected }) => {
        const stdout = execSync(`"${binPath}"`, {
          input,
          encoding: 'utf-8',
          timeout: 5000
        });
        expect(stdout.trim()).toBe(expected);
      });
    });

    // --- 3.2 Python Real Interpreter Execution ---
    describe('3.2 Python Real Interpreter Execution', () => {
      const pyCode = `class Solution:
    def invertTree(self, root):
        if not root:
            return None
        root.left, root.right = self.invertTree(root.right), self.invertTree(root.left)
        return root`;

      const wrapped = wrapCodeForExecution({
        code: pyCode,
        language: 'python',
        executionMode: 'FUNCTION',
        dataStructure: 'BINARY_TREE',
        functionName: 'invertTree',
        returnType: 'TreeNode',
        parameters: [{ name: 'root', type: 'TreeNode' }]
      });

      const tmpDir = os.tmpdir();
      const uid = `py_bt_test_${Date.now()}`;
      const scriptPath = path.join(tmpDir, `${uid}.py`);

      beforeAll(() => {
        fs.writeFileSync(scriptPath, wrapped, 'utf-8');
      });

      afterAll(() => {
        try { if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath); } catch {}
      });

      test.each(invertCases)('Python invertTree input $input -> expected $expected', ({ input, expected }) => {
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

    // --- 3.3 Java Real Compiler (javac / java) Execution ---
    describe('3.3 Java Real Compiler & JVM Execution', () => {
      const javaCode = `class Solution {
    public TreeNode invertTree(TreeNode root) {
        if (root == null) return null;
        TreeNode temp = root.left;
        root.left = invertTree(root.right);
        root.right = invertTree(temp);
        return root;
    }
}`;

      const wrapped = wrapCodeForExecution({
        code: javaCode,
        language: 'java',
        executionMode: 'FUNCTION',
        dataStructure: 'BINARY_TREE',
        functionName: 'invertTree',
        returnType: 'TreeNode',
        parameters: [{ name: 'root', type: 'TreeNode' }]
      });

      const testDir = path.join(os.tmpdir(), `java_bt_test_${Date.now()}`);

      beforeAll(() => {
        fs.mkdirSync(testDir, { recursive: true });
        const mainJava = path.join(testDir, 'Main.java');
        fs.writeFileSync(mainJava, wrapped, 'utf-8');
        execSync(`javac "${mainJava}"`);
      });

      afterAll(() => {
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
      });

      test.each(invertCases)('Java invertTree input $input -> expected $expected', ({ input, expected }) => {
        const stdout = execSync(`java -cp "${testDir}" Main`, {
          input,
          encoding: 'utf-8',
          timeout: 5000
        });
        expect(stdout.trim()).toBe(expected);
      });
    });

    // --- 3.4 JavaScript Real Node.js Runtime Execution ---
    describe('3.4 JavaScript Real Node.js Runtime Execution', () => {
      const jsCode = `function invertTree(root) {
  if (!root) return null;
  const temp = root.left;
  root.left = invertTree(root.right);
  root.right = invertTree(temp);
  return root;
}`;

      const wrapped = wrapCodeForExecution({
        code: jsCode,
        language: 'javascript',
        executionMode: 'FUNCTION',
        dataStructure: 'BINARY_TREE',
        functionName: 'invertTree',
        returnType: 'TreeNode',
        parameters: [{ name: 'root', type: 'TreeNode' }]
      });

      const tmpDir = os.tmpdir();
      const uid = `js_bt_test_${Date.now()}`;
      const scriptPath = path.join(tmpDir, `${uid}.js`);

      beforeAll(() => {
        fs.writeFileSync(scriptPath, wrapped, 'utf-8');
      });

      afterAll(() => {
        try { if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath); } catch {}
      });

      test.each(invertCases)('JavaScript invertTree input $input -> expected $expected', ({ input, expected }) => {
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
  // 4. REPRESENTATIVE OPERATIONS (MAX DEPTH & INORDER TRAVERSAL)
  // ════════════════════════════════════════════════════════════════════════════
  describe('4. Representative Tree Operations with Varying Return Types', () => {
    // 4.1 maxDepth (returns int)
    describe('4.1 maxDepth returning int across languages', () => {
      const depthCases = [
        { input: '[]', expected: '0' },
        { input: '[1]', expected: '1' },
        { input: '[1,2,3]', expected: '2' },
        { input: '[1,2,3,null,4,5,6]', expected: '3' }
      ];

      test.each(depthCases)('C++ maxDepth returns integer for input $input', ({ input, expected }) => {
        const cppCode = `class Solution {
public:
    int maxDepth(TreeNode* root) {
        if (!root) return 0;
        return 1 + max(maxDepth(root->left), maxDepth(root->right));
    }
};`;
        const wrapped = wrapCodeForExecution({
          code: cppCode,
          language: 'cpp',
          executionMode: 'FUNCTION',
          dataStructure: 'BINARY_TREE',
          functionName: 'maxDepth',
          returnType: 'int',
          parameters: [{ name: 'root', type: 'TreeNode*' }]
        });
        const tmpDir = os.tmpdir();
        const uid = `cpp_depth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const srcPath = path.join(tmpDir, `${uid}.cpp`);
        const binPath = path.join(tmpDir, `${uid}.exe`);
        fs.writeFileSync(srcPath, wrapped, 'utf-8');
        try {
          execSync(`g++ -O2 -std=c++17 "${srcPath}" -o "${binPath}"`);
          const stdout = execSync(`"${binPath}"`, { input, encoding: 'utf-8', timeout: 5000 });
          expect(stdout.trim()).toBe(expected);
        } finally {
          try { fs.unlinkSync(srcPath); } catch {}
          try { fs.unlinkSync(binPath); } catch {}
        }
      });

      test.each(depthCases)('Python maxDepth returns integer for input $input', ({ input, expected }) => {
        const pyCode = `class Solution:
    def maxDepth(self, root):
        if not root:
            return 0
        return 1 + max(self.maxDepth(root.left), self.maxDepth(root.right))`;
        const wrapped = wrapCodeForExecution({
          code: pyCode,
          language: 'python',
          executionMode: 'FUNCTION',
          dataStructure: 'BINARY_TREE',
          functionName: 'maxDepth',
          returnType: 'int',
          parameters: [{ name: 'root', type: 'TreeNode' }]
        });
        const tmpDir = os.tmpdir();
        const scriptPath = path.join(tmpDir, `py_depth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.py`);
        fs.writeFileSync(scriptPath, wrapped, 'utf-8');
        try {
          const stdout = execSync(`python "${scriptPath}"`, { input, encoding: 'utf-8', timeout: 5000 });
          expect(stdout.trim()).toBe(expected);
        } finally {
          try { fs.unlinkSync(scriptPath); } catch {}
        }
      });

      test.each(depthCases)('Java maxDepth returns integer for input $input', ({ input, expected }) => {
        const javaCode = `class Solution {
    public int maxDepth(TreeNode root) {
        if (root == null) return 0;
        return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
    }
}`;
        const wrapped = wrapCodeForExecution({
          code: javaCode,
          language: 'java',
          executionMode: 'FUNCTION',
          dataStructure: 'BINARY_TREE',
          functionName: 'maxDepth',
          returnType: 'int',
          parameters: [{ name: 'root', type: 'TreeNode' }]
        });
        const testDir = path.join(os.tmpdir(), `java_depth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
        fs.mkdirSync(testDir, { recursive: true });
        const mainJava = path.join(testDir, 'Main.java');
        fs.writeFileSync(mainJava, wrapped, 'utf-8');
        try {
          execSync(`javac "${mainJava}"`);
          const stdout = execSync(`java -cp "${testDir}" Main`, { input, encoding: 'utf-8', timeout: 5000 });
          expect(stdout.trim()).toBe(expected);
        } finally {
          try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
        }
      });
    });

    // 4.2 inorderTraversal (returns vector<int> / list)
    describe('4.2 inorderTraversal returning collection across languages', () => {
      const inorderCases = [
        { input: '[1,null,2,3]', expected: '[1,3,2]' },
        { input: '[1,2,3]', expected: '[2,1,3]' }
      ];

      test.each(inorderCases)('C++ inorderTraversal returns vector<int> for input $input', ({ input, expected }) => {
        const cppCode = `class Solution {
public:
    void dfs(TreeNode* root, vector<int>& res) {
        if (!root) return;
        dfs(root->left, res);
        res.push_back(root->val);
        dfs(root->right, res);
    }
    vector<int> inorderTraversal(TreeNode* root) {
        vector<int> res;
        dfs(root, res);
        return res;
    }
};`;
        const wrapped = wrapCodeForExecution({
          code: cppCode,
          language: 'cpp',
          executionMode: 'FUNCTION',
          dataStructure: 'BINARY_TREE',
          functionName: 'inorderTraversal',
          returnType: 'vector<int>',
          parameters: [{ name: 'root', type: 'TreeNode*' }]
        });
        const tmpDir = os.tmpdir();
        const uid = `cpp_inorder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const srcPath = path.join(tmpDir, `${uid}.cpp`);
        const binPath = path.join(tmpDir, `${uid}.exe`);
        fs.writeFileSync(srcPath, wrapped, 'utf-8');
        try {
          execSync(`g++ -O2 -std=c++17 "${srcPath}" -o "${binPath}"`);
          const stdout = execSync(`"${binPath}"`, { input, encoding: 'utf-8', timeout: 5000 });
          expect(stdout.trim()).toBe(expected);
        } finally {
          try { fs.unlinkSync(srcPath); } catch {}
          try { fs.unlinkSync(binPath); } catch {}
        }
      });

      test.each(inorderCases)('Python inorderTraversal returns list for input $input', ({ input, expected }) => {
        const pyCode = `class Solution:
    def inorderTraversal(self, root):
        res = []
        def dfs(node):
            if not node:
                return
            dfs(node.left)
            res.append(node.val)
            dfs(node.right)
        dfs(root)
        return res`;
        const wrapped = wrapCodeForExecution({
          code: pyCode,
          language: 'python',
          executionMode: 'FUNCTION',
          dataStructure: 'BINARY_TREE',
          functionName: 'inorderTraversal',
          returnType: 'list',
          parameters: [{ name: 'root', type: 'TreeNode' }]
        });
        const tmpDir = os.tmpdir();
        const scriptPath = path.join(tmpDir, `py_inorder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.py`);
        fs.writeFileSync(scriptPath, wrapped, 'utf-8');
        try {
          const stdout = execSync(`python "${scriptPath}"`, { input, encoding: 'utf-8', timeout: 5000 });
          expect(JSON.parse(stdout.trim())).toEqual(JSON.parse(expected));
        } finally {
          try { fs.unlinkSync(scriptPath); } catch {}
        }
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 5. SAFETY & CYCLE PROTECTION (100,000 NODE LIMIT)
  // ════════════════════════════════════════════════════════════════════════════
  describe('5. Safety & Cycle Protection', () => {
    test('5.1 Python detects cycle and throws error without hanging', () => {
      const cyclicCode = `class Solution:
    def corruptTree(self, root):
        # Create an infinite cycle: root.left = root
        root.left = root
        return root`;

      const wrapped = wrapCodeForExecution({
        code: cyclicCode,
        language: 'python',
        executionMode: 'FUNCTION',
        dataStructure: 'BINARY_TREE',
        functionName: 'corruptTree',
        returnType: 'TreeNode',
        parameters: [{ name: 'root', type: 'TreeNode' }]
      });

      const tmpDir = os.tmpdir();
      const scriptPath = path.join(tmpDir, `py_cycle_${Date.now()}.py`);
      fs.writeFileSync(scriptPath, wrapped, 'utf-8');
      try {
        expect(() => {
          execSync(`python "${scriptPath}"`, {
            input: '[1,2,3]',
            encoding: 'utf-8',
            timeout: 5000
          });
        }).toThrow();
      } finally {
        try { fs.unlinkSync(scriptPath); } catch {}
      }
    });

    test('5.2 JavaScript detects cycle and throws error without hanging', () => {
      const cyclicCode = `function corruptTree(root) {
  root.left = root;
  return root;
}`;

      const wrapped = wrapCodeForExecution({
        code: jsCodeWrap(cyclicCode),
        language: 'javascript',
        executionMode: 'FUNCTION',
        dataStructure: 'BINARY_TREE',
        functionName: 'corruptTree',
        returnType: 'TreeNode',
        parameters: [{ name: 'root', type: 'TreeNode' }]
      });

      function jsCodeWrap(code) { return code; }

      const tmpDir = os.tmpdir();
      const scriptPath = path.join(tmpDir, `js_cycle_${Date.now()}.js`);
      fs.writeFileSync(scriptPath, wrapped, 'utf-8');
      try {
        expect(() => {
          execSync(`node "${scriptPath}"`, {
            input: '[1,2,3]',
            encoding: 'utf-8',
            timeout: 5000
          });
        }).toThrow();
      } finally {
        try { fs.unlinkSync(scriptPath); } catch {}
      }
    });

    test('5.3 BinaryTreeAdapter exports MAX_TREE_NODES = 100000', () => {
      expect(MAX_TREE_NODES).toBe(100000);
    });
  });
});
