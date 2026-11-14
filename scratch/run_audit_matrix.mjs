import { runCodeIsolated, runJavaIsolated, runPythonIsolated, runCppIsolated } from '../server/src/services/codeRunner.service.js';
import { wrapCodeForExecution } from '../server/src/services/codeContract.service.js';

const auditResults = [];

async function recordTest(category, name, lang, mode, runFn) {
  const start = Date.now();
  try {
    const res = await runFn();
    auditResults.push({
      category,
      name,
      lang,
      mode,
      passed: res.passed ?? (res.status === 'success'),
      status: res.status,
      output: res.output,
      expected: res.expected,
      error: res.error,
      durationMs: Date.now() - start
    });
  } catch (err) {
    auditResults.push({
      category,
      name,
      lang,
      mode,
      passed: false,
      status: 'exception',
      error: err.message,
      durationMs: Date.now() - start
    });
  }
}

async function runAudit() {
  console.log('=== STARTING TESTFORGE CAPABILITY AUDIT ===');

  // ──────────────────────────────────────────────────────────────────────────
  // 1. STDIN / STDOUT COMPLETE PROGRAMS
  // ──────────────────────────────────────────────────────────────────────────

  // C++ cin/cout
  await recordTest('STDIN', 'C++ cin/cout basic sum', 'cpp', 'STDIN', async () => {
    const code = `#include <iostream>
using namespace std;
int main() {
    int a, b;
    if (cin >> a >> b) {
        cout << (a + b) << endl;
    }
    return 0;
}`;
    const res = await runCppIsolated({ code, inputArgs: '5 7', timeoutMs: 5000 });
    return { status: res.status, output: res.output, expected: 12, passed: String(res.output).trim() === '12' };
  });

  // C++ multiline input
  await recordTest('STDIN', 'C++ multiline array input', 'cpp', 'STDIN', async () => {
    const code = `#include <iostream>
#include <vector>
using namespace std;
int main() {
    int n;
    if (cin >> n) {
        int sum = 0;
        for (int i = 0; i < n; i++) {
            int v; cin >> v; sum += v;
        }
        cout << sum << endl;
    }
    return 0;
}`;
    const res = await runCppIsolated({ code, inputArgs: "3\n10 20 30", timeoutMs: 5000 });
    return { status: res.status, output: res.output, expected: 60, passed: String(res.output).trim() === '60' };
  });

  // Java Scanner
  await recordTest('STDIN', 'Java Scanner basic sum', 'java', 'STDIN', async () => {
    const code = `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int a = sc.nextInt();
            int b = sc.nextInt();
            System.out.println(a + b);
        }
    }
}`;
    const res = await runJavaIsolated({ code, inputArgs: '15 25', timeoutMs: 6000 });
    return { status: res.status, output: res.output, expected: 40, passed: String(res.output).trim() === '40' };
  });

  // Java BufferedReader
  await recordTest('STDIN', 'Java BufferedReader multiline', 'java', 'STDIN', async () => {
    const code = `import java.io.*;
public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String line1 = br.readLine();
        String line2 = br.readLine();
        if (line1 != null && line2 != null) {
            int a = Integer.parseInt(line1.trim());
            int b = Integer.parseInt(line2.trim());
            System.out.println(a * b);
        }
    }
}`;
    const res = await runJavaIsolated({ code, inputArgs: "6\n7", timeoutMs: 6000 });
    return { status: res.status, output: res.output, expected: 42, passed: String(res.output).trim() === '42' };
  });

  // Python input()
  await recordTest('STDIN', 'Python input() basic sum', 'python', 'STDIN', async () => {
    const code = `import sys
def main():
    lines = sys.stdin.read().split()
    if len(lines) >= 2:
        print(int(lines[0]) + int(lines[1]))
if __name__ == '__main__':
    main()`;
    const res = await runPythonIsolated({ code, inputArgs: '100 250', timeoutMs: 4000 });
    return { status: res.status, output: res.output, expected: 350, passed: String(res.output).trim() === '350' };
  });

  // JavaScript fs.readFileSync(0)
  await recordTest('STDIN', 'JavaScript fs.readFileSync(0)', 'javascript', 'STDIN', async () => {
    const code = `const fs = require('fs');
const input = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);
if (input.length >= 2) {
    console.log(Number(input[0]) + Number(input[1]));
}`;
    const res = await runCodeIsolated({ code, inputArgs: '12 8', timeoutMs: 3000 });
    return { status: res.status, output: res.output, expected: 20, passed: String(res.output).trim() === '20' };
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. FUNCTION MODE - TWO SUM (ARRAY + SCALAR)
  // ──────────────────────────────────────────────────────────────────────────

  // Python Two Sum class Solution
  await recordTest('FUNCTION', 'Python Two Sum (class Solution)', 'python', 'FUNCTION', async () => {
    const code = `class Solution:
    def twoSum(self, nums, target):
        lookup = {}
        for i, n in enumerate(nums):
            diff = target - n
            if diff in lookup:
                return [lookup[diff], i]
            lookup[n] = i
        return []`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'python',
      executionMode: 'FUNCTION',
      functionName: 'twoSum',
      parameters: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }]
    });
    const res = await runPythonIsolated({ code: wrapped, inputArgs: "nums = [2,7,11,15], target = 9", timeoutMs: 4000 });
    const match = JSON.stringify(res.output) === '[0,1]';
    return { status: res.status, output: res.output, expected: [0, 1], passed: match };
  });

  // Python Two Sum standalone function (no class Solution)
  await recordTest('FUNCTION', 'Python Two Sum (standalone function)', 'python', 'FUNCTION', async () => {
    const code = `def twoSum(nums, target):
    seen = {}
    for idx, val in enumerate(nums):
        needed = target - val
        if needed in seen:
            return [seen[needed], idx]
        seen[val] = idx
    return []`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'python',
      executionMode: 'FUNCTION',
      functionName: 'twoSum',
      parameters: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }]
    });
    const res = await runPythonIsolated({ code: wrapped, inputArgs: "nums = [3,2,4], target = 6", timeoutMs: 4000 });
    const match = JSON.stringify(res.output) === '[1,2]';
    return { status: res.status, output: res.output, expected: [1, 2], passed: match };
  });

  // C++ Two Sum class Solution
  await recordTest('FUNCTION', 'C++ Two Sum (class Solution)', 'cpp', 'FUNCTION', async () => {
    const code = `#include <vector>
#include <unordered_map>
using namespace std;
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> mp;
        for (int i = 0; i < (int)nums.size(); i++) {
            int complement = target - nums[i];
            if (mp.count(complement)) return {mp[complement], i};
            mp[nums[i]] = i;
        }
        return {};
    }
};`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'cpp',
      executionMode: 'FUNCTION',
      functionName: 'twoSum',
      returnType: 'vector<int>',
      parameters: [{ name: 'nums', type: 'vector<int>' }, { name: 'target', type: 'int' }]
    });
    const res = await runCppIsolated({ code: wrapped, inputArgs: "nums = [2,7,11,15], target = 9", timeoutMs: 6000 });
    const match = JSON.stringify(res.output) === '[0,1]';
    return { status: res.status, output: res.output, expected: [0, 1], passed: match };
  });

  // Java Two Sum class Solution
  await recordTest('FUNCTION', 'Java Two Sum (class Solution)', 'java', 'FUNCTION', async () => {
    const code = `import java.util.*;
class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int comp = target - nums[i];
            if (map.containsKey(comp)) {
                return new int[] { map.get(comp), i };
            }
            map.put(nums[i], i);
        }
        return new int[0];
    }
}`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'java',
      executionMode: 'FUNCTION',
      functionName: 'twoSum',
      returnType: 'int[]',
      parameters: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }]
    });
    const res = await runJavaIsolated({ code: wrapped, inputArgs: "nums = [3,2,4], target = 6", timeoutMs: 6000 });
    const match = JSON.stringify(res.output) === '[1,2]';
    return { status: res.status, output: res.output, expected: [1, 2], passed: match };
  });

  // JavaScript Two Sum
  await recordTest('FUNCTION', 'JavaScript Two Sum', 'javascript', 'FUNCTION', async () => {
    const code = `function twoSum(nums, target) {
    const m = new Map();
    for (let i = 0; i < nums.length; i++) {
        const diff = target - nums[i];
        if (m.has(diff)) return [m.get(diff), i];
        m.set(nums[i], i);
    }
    return [];
}`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'javascript',
      executionMode: 'FUNCTION',
      functionName: 'twoSum',
      parameters: [{ name: 'nums', type: 'number[]' }, { name: 'target', type: 'number' }]
    });
    const res = await runCodeIsolated({ code: wrapped, inputArgs: "nums = [2,7,11,15], target = 9", timeoutMs: 3000 });
    const match = JSON.stringify(res.output) === '[0,1]';
    return { status: res.status, output: res.output, expected: [0, 1], passed: match };
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. FUNCTION MODE - DATA STRUCTURES (LINKED LIST & BINARY TREE)
  // ──────────────────────────────────────────────────────────────────────────

  // Python Linked List Reverse
  await recordTest('DATA_STRUCTURE', 'Python Reverse Linked List', 'python', 'FUNCTION', async () => {
    const code = `class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev = None
        curr = head
        while curr:
            nxt = curr.next
            curr.next = prev
            prev = curr
            curr = nxt
        return prev`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'python',
      executionMode: 'FUNCTION',
      dataStructure: 'LINKED_LIST',
      functionName: 'reverseList',
      returnType: 'ListNode',
      parameters: [{ name: 'head', type: 'ListNode' }]
    });
    const res = await runPythonIsolated({ code: wrapped, inputArgs: "[1,2,3,4,5]", timeoutMs: 4000 });
    const match = JSON.stringify(res.output) === '[5,4,3,2,1]';
    return { status: res.status, output: res.output, expected: [5, 4, 3, 2, 1], passed: match };
  });

  // C++ Linked List Reverse
  await recordTest('DATA_STRUCTURE', 'C++ Reverse Linked List', 'cpp', 'FUNCTION', async () => {
    const code = `class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;
        ListNode* curr = head;
        while (curr) {
            ListNode* nxt = curr->next;
            curr->next = prev;
            prev = curr;
            curr = nxt;
        }
        return prev;
    }
};`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'cpp',
      executionMode: 'FUNCTION',
      dataStructure: 'LINKED_LIST',
      functionName: 'reverseList',
      returnType: 'ListNode*',
      parameters: [{ name: 'head', type: 'ListNode*' }]
    });
    const res = await runCppIsolated({ code: wrapped, inputArgs: "[1,2,3,4,5]", timeoutMs: 6000 });
    const match = JSON.stringify(res.output) === '[5,4,3,2,1]';
    return { status: res.status, output: res.output, expected: [5, 4, 3, 2, 1], passed: match };
  });

  // Java Linked List Reverse
  await recordTest('DATA_STRUCTURE', 'Java Reverse Linked List', 'java', 'FUNCTION', async () => {
    const code = `class Solution {
    public ListNode reverseList(ListNode head) {
        ListNode prev = null;
        ListNode curr = head;
        while (curr != null) {
            ListNode nxt = curr.next;
            curr.next = prev;
            prev = curr;
            curr = nxt;
        }
        return prev;
    }
}`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'java',
      executionMode: 'FUNCTION',
      dataStructure: 'LINKED_LIST',
      functionName: 'reverseList',
      returnType: 'ListNode',
      parameters: [{ name: 'head', type: 'ListNode' }]
    });
    const res = await runJavaIsolated({ code: wrapped, inputArgs: "[1,2,3]", timeoutMs: 6000 });
    const match = JSON.stringify(res.output) === '[3,2,1]';
    return { status: res.status, output: res.output, expected: [3, 2, 1], passed: match };
  });

  // Python Binary Tree Invert
  await recordTest('DATA_STRUCTURE', 'Python Invert Binary Tree', 'python', 'FUNCTION', async () => {
    const code = `class Solution:
    def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:
        if not root:
            return None
        root.left, root.right = self.invertTree(root.right), self.invertTree(root.left)
        return root`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'python',
      executionMode: 'FUNCTION',
      dataStructure: 'BINARY_TREE',
      functionName: 'invertTree',
      returnType: 'TreeNode',
      parameters: [{ name: 'root', type: 'TreeNode' }]
    });
    const res = await runPythonIsolated({ code: wrapped, inputArgs: "[4,2,7,1,3,6,9]", timeoutMs: 4000 });
    const match = JSON.stringify(res.output) === '[4,7,2,9,6,3,1]';
    return { status: res.status, output: res.output, expected: [4, 7, 2, 9, 6, 3, 1], passed: match };
  });

  // C++ Binary Tree Invert
  await recordTest('DATA_STRUCTURE', 'C++ Invert Binary Tree', 'cpp', 'FUNCTION', async () => {
    const code = `class Solution {
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
      code,
      language: 'cpp',
      executionMode: 'FUNCTION',
      dataStructure: 'BINARY_TREE',
      functionName: 'invertTree',
      returnType: 'TreeNode*',
      parameters: [{ name: 'root', type: 'TreeNode*' }]
    });
    const res = await runCppIsolated({ code: wrapped, inputArgs: "[4,2,7,1,3,6,9]", timeoutMs: 6000 });
    const match = JSON.stringify(res.output) === '[4,7,2,9,6,3,1]';
    return { status: res.status, output: res.output, expected: [4, 7, 2, 9, 6, 3, 1], passed: match };
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. STUDENT CODING STYLES (RECURSIVE, ITERATIVE, HELPERS, NAMES)
  // ──────────────────────────────────────────────────────────────────────────

  // Python Recursive Fibonacci
  await recordTest('STYLE', 'Python Recursive Fibonacci', 'python', 'FUNCTION', async () => {
    const code = `def fib(n):
    if n <= 1: return n
    return fib(n - 1) + fib(n - 2)`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'python',
      executionMode: 'FUNCTION',
      functionName: 'fib',
      parameters: [{ name: 'n', type: 'int' }]
    });
    const res = await runPythonIsolated({ code: wrapped, inputArgs: "7", timeoutMs: 4000 });
    return { status: res.status, output: res.output, expected: 13, passed: Number(res.output) === 13 };
  });

  // Python Iterative DP Fibonacci with different variable names
  await recordTest('STYLE', 'Python Iterative DP Fibonacci (diff var names)', 'python', 'FUNCTION', async () => {
    const code = `def fib(num):
    if num == 0: return 0
    alpha, beta = 0, 1
    for step in range(2, num + 1):
        gamma = alpha + beta
        alpha = beta
        beta = gamma
    return beta`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'python',
      executionMode: 'FUNCTION',
      functionName: 'fib',
      parameters: [{ name: 'n', type: 'int' }]
    });
    const res = await runPythonIsolated({ code: wrapped, inputArgs: "7", timeoutMs: 4000 });
    return { status: res.status, output: res.output, expected: 13, passed: Number(res.output) === 13 };
  });

  // C++ with Private Helper Methods
  await recordTest('STYLE', 'C++ Helper Function & Class Methods', 'cpp', 'FUNCTION', async () => {
    const code = `class Solution {
private:
    int helperMultiply(int x, int factor) {
        return x * factor;
    }
public:
    int calculate(int value) {
        return helperMultiply(value, 3);
    }
};`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'cpp',
      executionMode: 'FUNCTION',
      functionName: 'calculate',
      returnType: 'int',
      parameters: [{ name: 'value', type: 'int' }]
    });
    const res = await runCppIsolated({ code: wrapped, inputArgs: "14", timeoutMs: 6000 });
    return { status: res.status, output: res.output, expected: 42, passed: Number(res.output) === 42 };
  });

  // Java with Private Helper Methods
  await recordTest('STYLE', 'Java Private Helper Method', 'java', 'FUNCTION', async () => {
    const code = `class Solution {
    private boolean isEven(int x) {
        return x % 2 == 0;
    }
    public String check(int n) {
        return isEven(n) ? "EVEN" : "ODD";
    }
}`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'java',
      executionMode: 'FUNCTION',
      functionName: 'check',
      returnType: 'String',
      parameters: [{ name: 'n', type: 'int' }]
    });
    const res = await runJavaIsolated({ code: wrapped, inputArgs: "10", timeoutMs: 6000 });
    return { status: res.status, output: res.output, expected: "EVEN", passed: String(res.output).trim() === '"EVEN"' || String(res.output).trim() === 'EVEN' };
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. COMPLEX PATTERNS (2D MATRIX, CUSTOM CLASS, MULTI-PARAMS)
  // ──────────────────────────────────────────────────────────────────────────

  // Python 2D Matrix (Rotate Image)
  await recordTest('PATTERN', 'Python 2D Matrix Rotate', 'python', 'FUNCTION', async () => {
    const code = `class Solution:
    def rotate(self, matrix):
        n = len(matrix)
        for i in range(n):
            for j in range(i + 1, n):
                matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]
        for i in range(n):
            matrix[i].reverse()
        return matrix`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'python',
      executionMode: 'FUNCTION',
      functionName: 'rotate',
      returnType: 'int[][]',
      parameters: [{ name: 'matrix', type: 'int[][]' }]
    });
    const res = await runPythonIsolated({ code: wrapped, inputArgs: "[[1,2],[3,4]]", timeoutMs: 4000 });
    const match = JSON.stringify(res.output) === '[[3,1],[4,2]]';
    return { status: res.status, output: res.output, expected: [[3, 1], [4, 2]], passed: match };
  });

  // C++ 2D Matrix
  await recordTest('PATTERN', 'C++ 2D Matrix Sum', 'cpp', 'FUNCTION', async () => {
    const code = `#include <vector>
using namespace std;
class Solution {
public:
    int sumMatrix(vector<vector<int>>& mat) {
        int total = 0;
        for (const auto& row : mat) {
            for (int v : row) total += v;
        }
        return total;
    }
};`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'cpp',
      executionMode: 'FUNCTION',
      functionName: 'sumMatrix',
      returnType: 'int',
      parameters: [{ name: 'mat', type: 'vector<vector<int>>' }]
    });
    const res = await runCppIsolated({ code: wrapped, inputArgs: "[[1,2,3],[4,5,6]]", timeoutMs: 6000 });
    return { status: res.status, output: res.output, expected: 21, passed: Number(res.output) === 21 };
  });

  // Multiple Parameters (ListNode + Array)
  await recordTest('PATTERN', 'Python Mixed (ListNode + Array)', 'python', 'FUNCTION', async () => {
    const code = `class Solution:
    def modifyList(self, head: Optional[ListNode], values: List[int]) -> Optional[ListNode]:
        curr = head
        idx = 0
        while curr and idx < len(values):
            curr.val += values[idx]
            curr = curr.next
            idx += 1
        return head`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'python',
      executionMode: 'FUNCTION',
      functionName: 'modifyList',
      returnType: 'ListNode',
      parameters: [{ name: 'head', type: 'ListNode' }, { name: 'values', type: 'int[]' }]
    });
    const res = await runPythonIsolated({ code: wrapped, inputArgs: "[1,2,3]\n[10,20,30]", timeoutMs: 4000 });
    const match = JSON.stringify(res.output) === '[11,22,33]';
    return { status: res.status, output: res.output, expected: [11, 22, 33], passed: match };
  });

  // Invalid signature producing clear error
  await recordTest('ERROR_HANDLING', 'Python Missing Method in Solution', 'python', 'FUNCTION', async () => {
    const code = `class Solution:
    def wrongMethodName(self, a, b):
        return a + b`;
    const wrapped = wrapCodeForExecution({
      code,
      language: 'python',
      executionMode: 'FUNCTION',
      functionName: 'expectedTargetMethod',
      parameters: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }]
    });
    const res = await runPythonIsolated({ code: wrapped, inputArgs: "2, 3", timeoutMs: 4000 });
    // Should fail with NameError or clear error, NOT false PASS
    const producedClearError = res.status !== 'success' || !res.output;
    return { status: res.status, output: res.output, error: res.error, passed: producedClearError };
  });

  console.log('\n=== AUDIT RESULTS SUMMARY ===');
  console.log(JSON.stringify(auditResults, null, 2));
}

runAudit().catch(console.error);
