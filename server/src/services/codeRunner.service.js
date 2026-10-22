import vm from 'vm';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

/**
 * Parses diverse input formats into an array of argument values.
 * Handles:
 * - Direct arguments: "[10, 20, 30], 50"
 * - Named arguments: "nums = [10, 20, 30], target = 50"
 * - Matrix / 2D arrays: "[[1,4,5],[1,3,4],[2,6]]"
 * - JSON / primitive arguments: "nums = [-1,0,3,5,9,12], target = 9"
 */
export const parseInputArguments = (inputStr) => {
  if (typeof inputStr !== 'string') {
    return [inputStr];
  }

  const trimmed = inputStr.trim();
  if (!trimmed) {
    return [];
  }

  // Remove parameter names if present (e.g. "nums = [1,2], target = 3" -> "[1,2], 3")
  const cleaned = trimmed.replace(/(?:^|,|\n)\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*/g, (match) => {
    return match.startsWith(',') ? ', ' : match.startsWith('\n') ? '\n' : '';
  }).trim();

  // Evaluate safely within an isolated array wrapper
  try {
    const wrappedCode = `[${cleaned}]`;
    const sandbox = Object.create(null);
    const script = new vm.Script(wrappedCode);
    const context = vm.createContext(sandbox);
    const args = script.runInContext(context, { timeout: 500 });
    if (Array.isArray(args)) {
      return args;
    }
    return [args];
  } catch (err) {
    try {
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? [parsed] : [parsed];
    } catch {
      return [cleaned];
    }
  }
};

/**
 * Normalizes output string or object for consistent comparison.
 */
export const normalizeOutput = (val) => {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return val;
};

/**
 * Compares actual output with expected output.
 * For Two Sum: index pairs like [0, 1] and [1, 0] are treated as equal.
 * For all other problems: strict deep equality is enforced.
 */
export const compareOutputs = (actual, expected, questionContext = {}) => {
  const normActual = normalizeOutput(actual);
  const normExpected = normalizeOutput(expected);

  // Handle empty array and null equivalence (standard in LeetCode / competitive programming)
  const isEmptyOrNull = (v) =>
    v === null ||
    v === undefined ||
    v === 'null' ||
    v === 'undefined' ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'string' && (v.trim() === '[]' || v.trim() === 'null' || v.trim() === ''));

  if (isEmptyOrNull(normActual) && isEmptyOrNull(normExpected)) {
    return true;
  }

  const isTwoSum =
    (questionContext.title && /two\s*sum/i.test(questionContext.title)) ||
    (questionContext.tags && questionContext.tags.some((t) => /two\s*sum/i.test(t)));

  if (isTwoSum && Array.isArray(normActual) && Array.isArray(normExpected)) {
    if (normActual.length === 2 && normExpected.length === 2) {
      const sortedActual = [...normActual].sort((a, b) => a - b);
      const sortedExpected = [...normExpected].sort((a, b) => a - b);
      return JSON.stringify(sortedActual) === JSON.stringify(sortedExpected);
    }
    return JSON.stringify(normActual) === JSON.stringify(normExpected);
  }

  if (typeof normActual === 'object' && typeof normExpected === 'object' && normActual !== null && normExpected !== null) {
    return JSON.stringify(normActual) === JSON.stringify(normExpected);
  }

  return String(normActual).trim() === String(normExpected).trim();
};

/**
 * Detect programming language of reference code.
 */
export const detectLanguage = (code, questionContext = {}) => {
  if (questionContext.language) {
    const l = questionContext.language.toLowerCase();
    if (['java', 'python', 'javascript', 'cpp'].includes(l)) return l;
  }
  if (
    code.includes('import java.') ||
    code.includes('public class') ||
    (code.includes('class Solution') && (code.includes('public ') || code.includes('ListNode')))
  ) {
    return 'java';
  }
  if (code.includes('def ') || code.includes('elif ') || code.includes('import sys')) {
    return 'python';
  }
  return 'javascript';
};

/**
 * Extracts function name from JavaScript code.
 */
export const extractFunctionName = (code) => {
  if (!code || typeof code !== 'string') return null;

  const funcMatch = code.match(/function\s+([a-zA-Z0-9_$]+)\s*\(/);
  if (funcMatch && funcMatch[1]) {
    return funcMatch[1];
  }

  const arrowMatch = code.match(/(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:function|\([^)]*\)\s*=>)/);
  if (arrowMatch && arrowMatch[1]) {
    return arrowMatch[1];
  }

  return 'solution';
};

/**
 * Executes JavaScript code in an isolated VM sandbox with ListNode/TreeNode support.
 */
export const runCodeIsolated = async ({ code, inputArgs, timeoutMs = 2000 }) => {
  const startTime = Date.now();

  try {
    const fnName = extractFunctionName(code);
    if (!fnName) {
      return {
        status: 'invalid_test',
        output: null,
        error: 'No executable function declaration found in reference code.',
        runtimeMs: 0
      };
    }

    const sandbox = {
      console: { log: () => {}, error: () => {}, warn: () => {} },
      Math,
      Date,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      __args: inputArgs,
      __result: undefined
    };

    const helperDataStructures = `
      function ListNode(val, next) {
        this.val = (val===undefined ? 0 : val);
        this.next = (next===undefined ? null : next);
      }
      ListNode.fromArray = function(arr) {
        if (!arr || arr.length === 0) return null;
        var dummy = new ListNode(0);
        var curr = dummy;
        for (var i = 0; i < arr.length; i++) {
          curr.next = new ListNode(arr[i]);
          curr = curr.next;
        }
        return dummy.next;
      };
      ListNode.toArray = function(head) {
        var res = [];
        var curr = head;
        while (curr) {
          res.push(curr.val);
          curr = curr.next;
        }
        return res;
      };

      function TreeNode(val, left, right) {
        this.val = (val===undefined ? 0 : val);
        this.left = (left===undefined ? null : left);
        this.right = (right===undefined ? null : right);
      }
    `;

    const runnerScript = `
      "use strict";
      ${helperDataStructures}
      ${code}

      if (typeof ${fnName} !== 'function') {
        throw new TypeError("Identifier '${fnName}' is not a function.");
      }
      var isListNodeCode = ${code.includes('.next') || code.includes('ListNode') ? 'true' : 'false'};
      var finalArgs = __args.map(function(arg) {
        if (Array.isArray(arg) && isListNodeCode) {
          return ListNode.fromArray(arg);
        }
        return arg;
      });
      var res = ${fnName}.apply(null, finalArgs);
      if (res && res instanceof ListNode) {
        __result = ListNode.toArray(res);
      } else {
        __result = res;
      }
    `;

    const script = new vm.Script(runnerScript, { filename: 'sandbox.js' });
    const context = vm.createContext(sandbox);

    script.runInContext(context, {
      timeout: timeoutMs,
      breakOnSigint: true
    });

    const runtimeMs = Date.now() - startTime;
    return {
      status: 'success',
      output: sandbox.__result,
      error: null,
      runtimeMs
    };
  } catch (err) {
    const runtimeMs = Date.now() - startTime;
    const isTimeout =
      err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ||
      err.message?.includes('timed out') ||
      runtimeMs >= timeoutMs;

    const isSyntaxError =
      err instanceof SyntaxError ||
      err.name === 'SyntaxError' ||
      err.message?.includes('Unexpected token') ||
      err.message?.includes('missing )') ||
      err.message?.includes('Invalid or unexpected token');

    return {
      status: isTimeout ? 'timeout' : isSyntaxError ? 'compilation_error' : 'runtime_error',
      output: null,
      error: isTimeout ? `Execution timed out after ${timeoutMs}ms.` : err.message || 'Runtime exception',
      runtimeMs
    };
  }
};

/**
 * Executes Java code with universal reflection, ListNode, and TreeNode support.
 */
export const runJavaIsolated = async ({ code, inputArgs, timeoutMs = 4500 }) => {
  const startTime = Date.now();
  const tmpDir = os.tmpdir();
  const runnerId = `Runner_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const runnerFile = path.join(tmpDir, `${runnerId}.java`);

  try {
    const imports = [];
    const cleanCode = code
      .replace(/import\s+[a-zA-Z0-9_.*]+;/g, (m) => {
        imports.push(m);
        return '';
      })
      .replace(/package\s+[a-zA-Z0-9_.*]+;/g, '');

    // Detect target class name (support Solution, Result, or any user-defined class)
    const classMatches = [...cleanCode.matchAll(/(?:public\s+)?class\s+([A-Za-z0-9_$]+)/g)];
    let targetClassName = 'Solution';
    for (const match of classMatches) {
      const cName = match[1];
      if (!['ListNode', 'TreeNode', runnerId].includes(cName)) {
        targetClassName = cName;
        if (cName === 'Result' || cName === 'Solution') break;
      }
    }

    const harness = `
import java.util.*;
import java.lang.reflect.*;
${imports.join('\n')}

public class ${runnerId} {
    public static void main(String[] args) {
        try {
            Class<?> targetClass = ${targetClassName}.class;
            Method targetMethod = null;
            for (Method m : targetClass.getDeclaredMethods()) {
                if (Modifier.isPublic(m.getModifiers()) && !m.getName().equals("main")) {
                    targetMethod = m;
                    break;
                }
            }
            if (targetMethod == null) {
                System.err.println("No public method found in " + targetClass.getSimpleName() + " class.");
                System.exit(1);
            }

            Object sol = null;
            if (!Modifier.isStatic(targetMethod.getModifiers())) {
                try {
                    Constructor<?> ctor = targetClass.getDeclaredConstructor();
                    ctor.setAccessible(true);
                    sol = ctor.newInstance();
                } catch (Exception ignored) {}
            }

            Class<?>[] paramTypes = targetMethod.getParameterTypes();
            Object[] invokedArgs = new Object[paramTypes.length];
            
            String[] rawArgJson = new String[]{ ${inputArgs.map((s) => JSON.stringify(JSON.stringify(s))).join(', ')} };

            // Competitive programming input adapter: if method takes 1 array param but input provided length N and array
            if (paramTypes.length == 1 && rawArgJson.length > 1) {
                if (paramTypes[0].isArray() || List.class.isAssignableFrom(paramTypes[0])) {
                    for (String item : rawArgJson) {
                        String trimmed = item.trim();
                        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                            rawArgJson = new String[]{ item };
                            break;
                        }
                    }
                }
            }

            for (int i = 0; i < paramTypes.length; i++) {
                Class<?> pt = paramTypes[i];
                String json = i < rawArgJson.length ? rawArgJson[i] : "null";
                invokedArgs[i] = parseArg(pt, json);
            }

            Object res = targetMethod.invoke(sol, invokedArgs);
            printResult(res, targetMethod);
        } catch (InvocationTargetException ite) {
            Throwable cause = ite.getCause() != null ? ite.getCause() : ite;
            System.err.println(cause.getMessage() != null ? cause.getMessage() : cause.toString());
            System.exit(1);
        } catch (Exception e) {
            System.err.println(e.getMessage() != null ? e.getMessage() : e.toString());
            System.exit(1);
        }
    }

    private static Object parseArg(Class<?> type, String json) {
        if (json == null || json.equals("null") || json.trim().isEmpty()) {
            if (type.isPrimitive()) {
                if (type == int.class) return 0;
                if (type == boolean.class) return false;
                if (type == double.class) return 0.0;
            }
            return null;
        }
        json = json.trim();

        if (type == ListNode[].class) {
            int[][] m = parseIntMatrix(json);
            return ListNode.from2DArray(m);
        }

        if (type == ListNode.class) {
            int[] arr = parseIntArray(json);
            return ListNode.fromArray(arr);
        }

        if (type == TreeNode.class) {
            Integer[] arr = parseNullableIntegerArray(json);
            return TreeNode.fromLevelOrder(arr);
        }

        if (type == int[].class) {
            return parseIntArray(json);
        }

        if (type == int[][].class) {
            return parseIntMatrix(json);
        }

        if (type == int.class || type == Integer.class) {
            return Integer.parseInt(json.replaceAll("[^0-9-]", ""));
        }

        if (type == String.class) {
            if (json.startsWith("\\\"") && json.endsWith("\\\"") && json.length() >= 2) {
                return json.substring(1, json.length() - 1);
            }
            return json;
        }

        if (type == char[][].class) {
            return parseCharMatrix(json);
        }

        if (type == char[].class) {
            return parseCharArray(json);
        }

        if (type == String[].class) {
            return parseStringArray(json);
        }

        if (type == double[].class) {
            return parseDoubleArray(json);
        }

        if (type == long[].class) {
            return parseLongArray(json);
        }

        if (List.class.isAssignableFrom(type)) {
            return parseList(json);
        }

        if (type == double.class || type == Double.class) {
            return Double.parseDouble(json.replaceAll("[^0-9.-]", ""));
        }

        if (type == float.class || type == Float.class) {
            return Float.parseFloat(json.replaceAll("[^0-9.-]", ""));
        }

        if (type == long.class || type == Long.class) {
            return Long.parseLong(json.replaceAll("[^0-9-]", ""));
        }

        if (type == boolean.class || type == Boolean.class) {
            return Boolean.parseBoolean(json);
        }

        if (type == char.class || type == Character.class) {
            return json.length() > 0 ? json.charAt(0) : ' ';
        }

        return json;
    }

    private static char[] parseCharArray(String json) {
        String clean = json.replaceAll("[\\\\[\\\\]\\\\s\\\"']", "");
        if (clean.isEmpty()) return new char[0];
        String[] parts = clean.split(",");
        char[] arr = new char[parts.length];
        for (int i = 0; i < parts.length; i++) {
            arr[i] = parts[i].length() > 0 ? parts[i].charAt(0) : ' ';
        }
        return arr;
    }

    private static char[][] parseCharMatrix(String json) {
        String trimmed = json.trim();
        if (trimmed.equals("[]") || !trimmed.startsWith("[")) return new char[0][0];
        List<char[]> list = new ArrayList<>();
        int depth = 0;
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i < trimmed.length() - 1; i++) {
            char c = trimmed.charAt(i);
            if (c == '[') {
                depth++;
                sb.setLength(0);
            } else if (c == ']') {
                depth--;
                list.add(parseCharArray(sb.toString()));
            } else if (depth > 0) {
                sb.append(c);
            }
        }
        return list.toArray(new char[list.size()][]);
    }

    private static String[] parseStringArray(String json) {
        String clean = json.replaceAll("[\\\\[\\\\]]", "").trim();
        if (clean.isEmpty()) return new String[0];
        String[] parts = clean.split(",");
        String[] arr = new String[parts.length];
        for (int i = 0; i < parts.length; i++) {
            String s = parts[i].trim();
            if ((s.startsWith("\\"") && s.endsWith("\\"") && s.length() >= 2) || (s.startsWith("'") && s.endsWith("'") && s.length() >= 2)) {
                arr[i] = s.substring(1, s.length() - 1);
            } else {
                arr[i] = s;
            }
        }
        return arr;
    }

    private static double[] parseDoubleArray(String json) {
        String clean = json.replaceAll("[\\\\[\\\\]\\\\s]", "");
        if (clean.isEmpty()) return new double[0];
        String[] parts = clean.split(",");
        double[] arr = new double[parts.length];
        for (int i = 0; i < parts.length; i++) arr[i] = Double.parseDouble(parts[i].trim());
        return arr;
    }

    private static long[] parseLongArray(String json) {
        String clean = json.replaceAll("[\\\\[\\\\]\\\\s]", "");
        if (clean.isEmpty()) return new long[0];
        String[] parts = clean.split(",");
        long[] arr = new long[parts.length];
        for (int i = 0; i < parts.length; i++) arr[i] = Long.parseLong(parts[i].trim());
        return arr;
    }

    private static List<Object> parseList(String json) {
        int[] arr = parseIntArray(json);
        List<Object> list = new ArrayList<>();
        for (int v : arr) list.add(v);
        return list;
    }

    private static int[] parseIntArray(String json) {
        String clean = json.replaceAll("[\\\\[\\\\]\\\\s]", "");
        if (clean.isEmpty()) return new int[0];
        String[] parts = clean.split(",");
        int[] arr = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            arr[i] = Integer.parseInt(parts[i].trim());
        }
        return arr;
    }

    private static int[][] parseIntMatrix(String json) {
        String trimmed = json.trim();
        if (trimmed.equals("[]") || !trimmed.startsWith("[")) return new int[0][0];
        List<int[]> list = new ArrayList<>();
        int depth = 0;
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i < trimmed.length() - 1; i++) {
            char c = trimmed.charAt(i);
            if (c == '[') {
                depth++;
                sb.setLength(0);
            } else if (c == ']') {
                depth--;
                list.add(parseIntArray(sb.toString()));
            } else if (depth > 0) {
                sb.append(c);
            }
        }
        return list.toArray(new int[list.size()][]);
    }

    private static Integer[] parseNullableIntegerArray(String json) {
        String clean = json.replaceAll("[\\\\[\\\\]\\\\s]", "");
        if (clean.isEmpty()) return new Integer[0];
        String[] parts = clean.split(",");
        Integer[] arr = new Integer[parts.length];
        for (int i = 0; i < parts.length; i++) {
            String p = parts[i].trim();
            if (p.equals("null") || p.isEmpty()) {
                arr[i] = null;
            } else {
                arr[i] = Integer.parseInt(p);
            }
        }
        return arr;
    }

    private static void printResult(Object res, Method targetMethod) {
        if (res == null) {
            if (targetMethod != null && (targetMethod.getReturnType() == ListNode.class || targetMethod.getReturnType() == TreeNode.class || targetMethod.getReturnType().isArray() || Collection.class.isAssignableFrom(targetMethod.getReturnType()))) {
                System.out.println("[]");
            } else {
                System.out.println("null");
            }
        } else if (res instanceof ListNode) {
            System.out.println(ListNode.toListString((ListNode) res));
        } else if (res instanceof TreeNode) {
            System.out.println(TreeNode.toLevelOrderString((TreeNode) res));
        } else if (res instanceof int[]) {
            System.out.println(Arrays.toString((int[]) res).replaceAll(" ", ""));
        } else if (res instanceof int[][]) {
            System.out.println(Arrays.deepToString((int[][]) res).replaceAll(" ", ""));
        } else if (res instanceof Object[]) {
            System.out.println(Arrays.deepToString((Object[]) res).replaceAll(" ", ""));
        } else if (res instanceof Collection) {
            System.out.println(res.toString().replaceAll(" ", ""));
        } else {
            System.out.println(String.valueOf(res));
        }
    }
}

class ListNode {
    public int val;
    public ListNode next;
    public ListNode() {}
    public ListNode(int val) { this.val = val; }
    public ListNode(int val, ListNode next) { this.val = val; this.next = next; }

    public static ListNode fromArray(int[] arr) {
        if (arr == null || arr.length == 0) return null;
        ListNode dummy = new ListNode(0);
        ListNode curr = dummy;
        for (int v : arr) {
            curr.next = new ListNode(v);
            curr = curr.next;
        }
        return dummy.next;
    }

    public static ListNode[] from2DArray(int[][] matrix) {
        if (matrix == null) return new ListNode[0];
        ListNode[] res = new ListNode[matrix.length];
        for (int i = 0; i < matrix.length; i++) {
            res[i] = fromArray(matrix[i]);
        }
        return res;
    }

    public static String toListString(ListNode head) {
        StringBuilder sb = new StringBuilder("[");
        ListNode curr = head;
        boolean first = true;
        while (curr != null) {
            if (!first) sb.append(",");
            sb.append(curr.val);
            first = false;
            curr = curr.next;
        }
        sb.append("]");
        return sb.toString();
    }
}

class TreeNode {
    public int val;
    public TreeNode left;
    public TreeNode right;
    public TreeNode() {}
    public TreeNode(int val) { this.val = val; }
    public TreeNode(int val, TreeNode left, TreeNode right) {
        this.val = val;
        this.left = left;
        this.right = right;
    }

    public static TreeNode fromLevelOrder(Integer[] vals) {
        if (vals == null || vals.length == 0 || vals[0] == null) return null;
        TreeNode root = new TreeNode(vals[0]);
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);
        int i = 1;
        while (!queue.isEmpty() && i < vals.length) {
            TreeNode node = queue.poll();
            if (i < vals.length && vals[i] != null) {
                node.left = new TreeNode(vals[i]);
                queue.offer(node.left);
            }
            i++;
            if (i < vals.length && vals[i] != null) {
                node.right = new TreeNode(vals[i]);
                queue.offer(node.right);
            }
            i++;
        }
        return root;
    }

    public static String toLevelOrderString(TreeNode root) {
        if (root == null) return "[]";
        List<String> list = new ArrayList<>();
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);
        while (!queue.isEmpty()) {
            TreeNode curr = queue.poll();
            if (curr != null) {
                list.add(String.valueOf(curr.val));
                queue.offer(curr.left);
                queue.offer(curr.right);
            } else {
                list.add("null");
            }
        }
        int lastNonNull = list.size() - 1;
        while (lastNonNull >= 0 && list.get(lastNonNull).equals("null")) {
            lastNonNull--;
        }
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i <= lastNonNull; i++) {
            if (i > 0) sb.append(",");
            sb.append(list.get(i));
        }
        sb.append("]");
        return sb.toString();
    }
}

${cleanCode}
`;

    await fs.promises.writeFile(runnerFile, harness, 'utf-8');

    const out = execSync(`java "${runnerFile}"`, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const runtimeMs = Date.now() - startTime;
    let parsedOut = out.trim();
    try {
      parsedOut = JSON.parse(parsedOut);
    } catch {}

    return {
      status: 'success',
      output: parsedOut,
      error: null,
      runtimeMs
    };
  } catch (err) {
    const runtimeMs = Date.now() - startTime;
    const isTimeout =
      err.code === 'ETIMEDOUT' ||
      err.message?.includes('timed out') ||
      runtimeMs >= timeoutMs;

    const rawMsg = err.stderr ? err.stderr.toString().trim() : err.message;
    const isCompileError =
      rawMsg.includes('error:') ||
      rawMsg.includes('cannot find symbol') ||
      rawMsg.includes('class, interface, or enum expected') ||
      rawMsg.includes('illegal start of expression') ||
      rawMsg.includes('reached end of file while parsing') ||
      rawMsg.includes('not a statement');

    let cleanError = 'Java runtime error';
    if (isTimeout) {
      cleanError = `Execution timed out after ${timeoutMs}ms.`;
    } else if (rawMsg) {
      const firstLine = rawMsg.split('\n').map((l) => l.trim()).find((l) => l.includes('error:') || l.length > 0) || rawMsg;
      cleanError = firstLine.replace(/^[A-Za-z]:\\[^:]+\\Runner_\d+_\d+\.java:/, 'Solution.java:');
    }

    return {
      status: isTimeout ? 'timeout' : isCompileError ? 'compilation_error' : 'runtime_error',
      output: null,
      error: cleanError,
      runtimeMs
    };
  } finally {
    try {
      if (fs.existsSync(runnerFile)) {
        await fs.promises.unlink(runnerFile);
      }
    } catch {}
  }
};

/**
 * Executes Python code in an isolated process with ListNode/TreeNode support.
 */
export const runPythonIsolated = async ({ code, inputArgs, timeoutMs = 3500 }) => {
  const startTime = Date.now();
  const tmpDir = os.tmpdir();
  const runnerFile = path.join(tmpDir, `runner_${Date.now()}_${Math.floor(Math.random() * 10000)}.py`);

  try {
    const fnMatch = code.match(/def\s+([a-zA-Z0-9_$]+)\s*\(/);
    const fnName = fnMatch ? fnMatch[1] : 'solution';

    const harness = `
import sys, json

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next
    @staticmethod
    def from_list(vals):
        if not vals: return None
        dummy = ListNode(0)
        curr = dummy
        for v in vals:
            curr.next = ListNode(v)
            curr = curr.next
        return dummy.next
    @staticmethod
    def to_list(head):
        res = []
        curr = head
        while curr:
            res.append(curr.val)
            curr = curr.next
        return res

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

${code}

try:
    args = json.loads(${JSON.stringify(JSON.stringify(inputArgs))})
    has_ln = ${code.includes('ListNode') || code.includes('.next') ? 'True' : 'False'}
    final_args = []
    for a in args:
        if isinstance(a, list) and has_ln:
            final_args.append(ListNode.from_list(a))
        else:
            final_args.append(a)
    if 'Solution' in globals():
        res = getattr(Solution(), '${fnName}')(*final_args)
    else:
        res = ${fnName}(*final_args)
    if isinstance(res, ListNode):
        res = ListNode.to_list(res)
    print(json.dumps(res))
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
`;

    await fs.promises.writeFile(runnerFile, harness, 'utf-8');

    const out = execSync(`python "${runnerFile}"`, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const runtimeMs = Date.now() - startTime;
    let parsedOut;
    try {
      parsedOut = JSON.parse(out.trim());
    } catch {
      parsedOut = out.trim();
    }

    return {
      status: 'success',
      output: parsedOut,
      error: null,
      runtimeMs
    };
  } catch (err) {
    const runtimeMs = Date.now() - startTime;
    const isTimeout =
      err.code === 'ETIMEDOUT' ||
      err.message?.includes('timed out') ||
      runtimeMs >= timeoutMs;

    const errMsg = err.stderr ? err.stderr.toString().trim() : err.message;
    const isCompileError =
      errMsg.includes('SyntaxError') ||
      errMsg.includes('IndentationError') ||
      errMsg.includes('TabError');

    return {
      status: isTimeout ? 'timeout' : isCompileError ? 'compilation_error' : 'runtime_error',
      output: null,
      error: isTimeout ? `Execution timed out after ${timeoutMs}ms.` : errMsg.split('\n')[0] || 'Python runtime error',
      runtimeMs
    };
  } finally {
    try {
      if (fs.existsSync(runnerFile)) {
        await fs.promises.unlink(runnerFile);
      }
    } catch {}
  }
};

// ─── C++ Runner Helpers ────────────────────────────────────────────────────────

/**
 * Splits a C++ parameter list string by commas, respecting angle-bracket depth.
 */
const splitCppParams = (paramsStr) => {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of paramsStr) {
    if (ch === '<') depth++;
    else if (ch === '>') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

/**
 * Parses C++ parameter list string into [{type, name}] objects.
 * Handles: int n, vector<int>& nums, const string& s, etc.
 */
const parseCppParams = (paramsStr) => {
  if (!paramsStr.trim()) return [];
  return splitCppParams(paramsStr).map((p, i) => {
    let cleaned = p.replace(/\bconst\b/g, '').replace(/&/g, '').replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/\s*\*\s*/g, '* ');
    const lastSpace = cleaned.lastIndexOf(' ');
    if (lastSpace === -1) return { type: cleaned, name: `arg${i}` };
    const type = cleaned.slice(0, lastSpace).trim();
    const name = cleaned.slice(lastSpace + 1).trim();
    return { type, name };
  });
};

/**
 * Extracts the first public non-constructor function from a C++ Solution class.
 * Returns { funcName, returnType, params } or null.
 */
const extractCppFunctionInfo = (code) => {
  const funcRegex = /(?:static\s+|virtual\s+|inline\s+)?([\w][\w\s:<>,*&]*?)\s*(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?(?:noexcept\s*)?(?:override\s*)?\s*\{/g;
  let match;
  while ((match = funcRegex.exec(code)) !== null) {
    const returnType = match[1].trim();
    const funcName   = match[2].trim();
    const paramsStr  = match[3].trim();
    if (['Solution', 'main', 'class', 'struct', 'if', 'for', 'while', 'switch'].includes(funcName)) continue;
    if (returnType === 'class' || returnType === 'struct') continue;
    const params = parseCppParams(paramsStr);
    return { funcName, returnType, params };
  }
  return null;
};

/**
 * Converts a JS runtime value to a C++ literal string for the given C++ type.
 */
const jsValueToCppLiteral = (val, rawType) => {
  if (rawType.includes('ListNode')) {
    const arr = Array.isArray(val) ? val : [];
    return `ListNode::fromVec({${arr.map(v => String(parseInt(v, 10) || 0)).join(', ')}})`;
  }
  const t = rawType.replace(/\bconst\b/g, '').replace(/[&*]/g, '').replace(/\s+/g, '').toLowerCase();

  if (t === 'int' || t === 'int32_t' || t === 'short')
    return String(parseInt(val, 10) || 0);
  if (t === 'longlong' || t === 'long' || t === 'int64_t')
    return String(parseInt(val, 10) || 0);
  if (t === 'double' || t === 'float') {
    const f = parseFloat(val);
    return isNaN(f) ? '0.0' : String(f);
  }
  if (t === 'bool')
    return val ? 'true' : 'false';
  if (t === 'string' || t === 'std::string') {
    const s = typeof val === 'string' ? val : String(val ?? '');
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  if (t === 'char') {
    const s = typeof val === 'string' ? val : String(val ?? '');
    return `'${s.charAt(0)}'`;
  }
  if (t === 'vector<int>' || t === 'std::vector<int>') {
    const arr = Array.isArray(val) ? val : [val];
    return `{${arr.map(v => String(parseInt(v, 10) || 0)).join(', ')}}`;
  }
  if (t === 'vector<longlong>' || t === 'vector<long>' || t === 'vector<longlong>') {
    const arr = Array.isArray(val) ? val : [val];
    return `{${arr.map(v => String(parseInt(v, 10) || 0)).join(', ')}}`;
  }
  if (t === 'vector<double>' || t === 'vector<float>') {
    const arr = Array.isArray(val) ? val : [val];
    return `{${arr.map(v => String(parseFloat(v) || 0.0)).join(', ')}}`;
  }
  if (t === 'vector<bool>') {
    const arr = Array.isArray(val) ? val : [val];
    return `{${arr.map(v => v ? 'true' : 'false').join(', ')}}`;
  }
  if (t === 'vector<string>' || t === 'vector<std::string>') {
    const arr = Array.isArray(val) ? val : [val];
    return `{${arr.map(v => `"${String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(', ')}}`;
  }
  if (t === 'vector<char>') {
    const arr = Array.isArray(val) ? val : [val];
    return `{${arr.map(v => `'${String(v ?? ' ').charAt(0)}'`).join(', ')}}`;
  }
  if (t === 'vector<vector<int>>' || t === 'std::vector<std::vector<int>>') {
    const arr = Array.isArray(val) ? val : [val];
    return `{${arr.map(row => {
      const r = Array.isArray(row) ? row : [row];
      return `{${r.map(v => String(parseInt(v, 10) || 0)).join(', ')}}`;
    }).join(', ')}}`;
  }
  if (Array.isArray(val))
    return `{${val.map(v => typeof v === 'string' ? `"${v}"` : String(v)).join(', ')}}`;
  return String(val ?? 0);
};

/**
 * Executes C++ code in an isolated process with ListNode/TreeNode support.
 * Compiles with g++ -std=c++17 -O2 and runs the resulting binary.
 */
export const runCppIsolated = async ({ code, inputArgs, timeoutMs = 5000 }) => {
  const startTime = Date.now();
  const tmpDir  = os.tmpdir();
  const uid     = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const srcFile = path.join(tmpDir, `runner_${uid}.cpp`);
  const binFile = path.join(tmpDir, `runner_${uid}`);

  try {
    // 1. Detect function info
    const fnInfo = extractCppFunctionInfo(code);
    if (!fnInfo) {
      return {
        status: 'runtime_error',
        output: null,
        error: 'No public function found in Solution class. Define your solution as: class Solution { public: returnType funcName(...) {} };',
        runtimeMs: 0
      };
    }

    const { funcName, params } = fnInfo;

    // 2. Build per-argument declarations
    const argDecls = params.map((p, i) => {
      const jsVal   = inputArgs[i] !== undefined ? inputArgs[i] : null;
      const literal = jsValueToCppLiteral(jsVal, p.type);
      const declType = p.type.replace(/\s+/g, ' ').trim();
      return `${declType} ${p.name} = ${literal};`;
    }).join('\n    ');

    const argNames = params.map(p => p.name).join(', ');

    // 3. Generate full C++ harness
    const harness = `
#include <bits/stdc++.h>
using namespace std;

// ListNode
struct ListNode {
    int val; ListNode* next;
    ListNode(int x=0,ListNode* n=nullptr):val(x),next(n){}
    static ListNode* fromVec(const vector<int>& v){
        ListNode dummy; ListNode* cur=&dummy;
        for(int x:v){cur->next=new ListNode(x);cur=cur->next;}
        return dummy.next;
    }
    static vector<int> toVec(ListNode* h){
        vector<int> res; while(h){res.push_back(h->val);h=h->next;} return res;
    }
};

// TreeNode
struct TreeNode {
    int val; TreeNode *left,*right;
    TreeNode(int x=0,TreeNode* l=nullptr,TreeNode* r=nullptr):val(x),left(l),right(r){}
};

// Result printers
void printOutput(int v)           { cout<<v<<"\\n"; }
void printOutput(long long v)     { cout<<v<<"\\n"; }
void printOutput(double v)        { cout<<fixed<<setprecision(6)<<v<<"\\n"; }
void printOutput(float v)         { cout<<fixed<<setprecision(6)<<v<<"\\n"; }
void printOutput(bool v)          { cout<<(v?"true":"false")<<"\\n"; }
void printOutput(char v)          { cout<<'\x22'<<v<<'\x22'<<"\\n"; }
void printOutput(const string& v) { cout<<'\x22'<<v<<'\x22'<<"\\n"; }
void printOutput(const vector<int>& v){
    cout<<"["; for(int i=0;i<(int)v.size();i++){if(i)cout<<",";cout<<v[i];} cout<<"]\\n";
}
void printOutput(const vector<long long>& v){
    cout<<"["; for(int i=0;i<(int)v.size();i++){if(i)cout<<",";cout<<v[i];} cout<<"]\\n";
}
void printOutput(const vector<double>& v){
    cout<<"["; for(int i=0;i<(int)v.size();i++){if(i)cout<<",";cout<<fixed<<setprecision(6)<<v[i];} cout<<"]\\n";
}
void printOutput(const vector<bool>& v){
    cout<<"["; for(int i=0;i<(int)v.size();i++){if(i)cout<<",";cout<<(v[i]?"true":"false");} cout<<"]\\n";
}
void printOutput(const vector<string>& v){
    cout<<"["; for(int i=0;i<(int)v.size();i++){if(i)cout<<",";cout<<'\x22'<<v[i]<<'\x22';} cout<<"]\\n";
}
void printOutput(const vector<vector<int>>& v){
    cout<<"[";
    for(int i=0;i<(int)v.size();i++){
        if(i)cout<<","; cout<<"[";
        for(int j=0;j<(int)v[i].size();j++){if(j)cout<<",";cout<<v[i][j];}
        cout<<"]";
    }
    cout<<"]\\n";
}
void printOutput(ListNode* v){ printOutput(ListNode::toVec(v)); }

// User solution
${code}

int main(){
    try{
        ${argDecls}
        Solution sol;
        auto result=sol.${funcName}(${argNames});
        printOutput(result);
    }catch(const exception& e){cerr<<e.what()<<endl;return 1;}
    catch(...){cerr<<"Unknown runtime exception"<<endl;return 1;}
    return 0;
}
`;

    // 4. Write source
    await fs.promises.writeFile(srcFile, harness, 'utf-8');

    // 5. Compile
    try {
      execSync(`g++ -std=c++17 -O2 -o "${binFile}" "${srcFile}"`, {
        encoding: 'utf-8', timeout: 15000, stdio: ['pipe','pipe','pipe']
      });
    } catch (compileErr) {
      const errMsg = compileErr.stderr ? compileErr.stderr.toString().trim() : compileErr.message;
      return {
        status: 'compilation_error',
        output: null,
        error: errMsg.split('\n').slice(0, 5).join('\n'),
        runtimeMs: Date.now() - startTime
      };
    }

    // 6. Run binary
    const out = execSync(`"${binFile}"`, {
      encoding: 'utf-8', timeout: timeoutMs, stdio: ['pipe','pipe','pipe']
    });

    const runtimeMs = Date.now() - startTime;
    let parsedOut;
    try { parsedOut = JSON.parse(out.trim()); } catch { parsedOut = out.trim(); }

    return { status: 'success', output: parsedOut, error: null, runtimeMs };

  } catch (err) {
    const runtimeMs = Date.now() - startTime;
    const isTimeout =
      err.code === 'ETIMEDOUT' ||
      err.message?.includes('timed out') ||
      runtimeMs >= timeoutMs;
    const errMsg = err.stderr ? err.stderr.toString().trim() : err.message;
    return {
      status: isTimeout ? 'timeout' : 'runtime_error',
      output: null,
      error: isTimeout ? `Execution timed out after ${timeoutMs}ms.` : (errMsg || 'C++ runtime error'),
      runtimeMs
    };
  } finally {
    for (const f of [srcFile, binFile, `${binFile}.exe`]) {
      try { if (fs.existsSync(f)) await fs.promises.unlink(f); } catch {}
    }
  }
};

// ─── End C++ Runner ──────────────────────────────────────────────────────────────────────


/**
 * Validates a single test case against reference code.
 */
export const validateSingleTestCase = async ({ code, testCase, questionContext = {}, timeoutMs = 4500 }) => {
  if (testCase.input === undefined || testCase.input === null || String(testCase.input).trim() === '') {
    return {
      testCaseId: testCase._id,
      category: testCase.category,
      visibility: testCase.visibility,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput: null,
      status: 'invalid_test',
      passed: false,
      error: 'Test case input is empty or malformed.',
      runtimeMs: 0
    };
  }

  if (testCase.expectedOutput === undefined || testCase.expectedOutput === null || String(testCase.expectedOutput).trim() === '') {
    return {
      testCaseId: testCase._id,
      category: testCase.category,
      visibility: testCase.visibility,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput: null,
      status: 'invalid_test',
      passed: false,
      error: 'Expected output is missing.',
      runtimeMs: 0
    };
  }

  const parsedArgs = parseInputArguments(testCase.input);
  const lang = detectLanguage(code, questionContext);

  let execResult;
  if (lang === 'java') {
    execResult = await runJavaIsolated({ code, inputArgs: parsedArgs, timeoutMs });
  } else if (lang === 'python') {
    execResult = await runPythonIsolated({ code, inputArgs: parsedArgs, timeoutMs });
  } else if (lang === 'cpp') {
    execResult = await runCppIsolated({ code, inputArgs: parsedArgs, timeoutMs });
  } else {
    execResult = await runCodeIsolated({ code, inputArgs: parsedArgs, timeoutMs });
  }

  if (execResult.status === 'timeout') {
    return {
      testCaseId: testCase._id,
      category: testCase.category,
      visibility: testCase.visibility,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput: null,
      status: 'timeout',
      passed: false,
      error: execResult.error,
      runtimeMs: execResult.runtimeMs
    };
  }

  if (execResult.status === 'runtime_error' || execResult.status === 'compilation_error') {
    return {
      testCaseId: testCase._id,
      category: testCase.category,
      visibility: testCase.visibility,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput: null,
      status: 'runtime_error',
      passed: false,
      error: execResult.error,
      runtimeMs: execResult.runtimeMs
    };
  }

  const matches = compareOutputs(execResult.output, testCase.expectedOutput, questionContext);
  const formattedActual = typeof execResult.output === 'object' ? JSON.stringify(execResult.output) : String(execResult.output);

  return {
    testCaseId: testCase._id,
    category: testCase.category,
    visibility: testCase.visibility,
    input: testCase.input,
    expectedOutput: testCase.expectedOutput,
    actualOutput: formattedActual,
    status: matches ? 'passed' : 'failed',
    passed: matches,
    error: matches ? null : `Output mismatch. Expected: ${testCase.expectedOutput}, got: ${formattedActual}`,
    runtimeMs: execResult.runtimeMs
  };
};

export default {
  parseInputArguments,
  normalizeOutput,
  compareOutputs,
  detectLanguage,
  extractFunctionName,
  runCodeIsolated,
  runJavaIsolated,
  runPythonIsolated,
  runCppIsolated,
  validateSingleTestCase
};
