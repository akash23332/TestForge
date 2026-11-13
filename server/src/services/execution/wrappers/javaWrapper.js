import { getAdapter } from '../adapters/adapterRegistry.js';
import { MAX_LINKED_LIST_NODES } from '../adapters/LinkedListAdapter.js';
import { MAX_TREE_NODES } from '../adapters/BinaryTreeAdapter.js';

export const buildJavaWrapper = ({
  code,
  functionName = 'solution',
  parameters = [],
  dataStructure = 'ARRAY',
  returnType = 'void'
}) => {
  const isLinkedList =
    dataStructure === 'LINKED_LIST' ||
    (returnType && /List[nN]ode/i.test(returnType)) ||
    (code && /List[nN]ode/i.test(code)) ||
    (parameters && parameters.some((p) => /List[nN]ode/i.test(p.type || '')));

  const isBinaryTree =
    dataStructure === 'BINARY_TREE' ||
    (returnType && /Tree[nN]ode/i.test(returnType)) ||
    (code && /Tree[nN]ode/i.test(code)) ||
    (parameters && parameters.some((p) => /Tree[nN]ode/i.test(p.type || '')));

  let typeDefs = '';
  if (isLinkedList || /\bList[nN]ode\b/i.test(code)) {
    typeDefs += getAdapter('LINKED_LIST').getTypeDeclarations('java', { code }) + '\n';
  }
  if (isBinaryTree || /\bTree[nN]ode\b/i.test(code)) {
    typeDefs += getAdapter('BINARY_TREE').getTypeDeclarations('java', { code }) + '\n';
  }
  if (!isLinkedList && !isBinaryTree && dataStructure && dataStructure !== 'ARRAY') {
    typeDefs += getAdapter(dataStructure).getTypeDeclarations('java', { code }) + '\n';
  }

  const fn = functionName || 'solution';

  // Strip redundant public from class Solution and normalize Treenode/Listnode casing
  const cleanStudentCode = code
    .replace(/^\s*public\s+class\s+Solution/m, 'class Solution')
    .replace(/\bListnode\b/g, 'ListNode')
    .replace(/\bTreenode\b/g, 'TreeNode');

  return `import java.util.*;
import java.io.*;
import java.lang.reflect.*;

${typeDefs}

${cleanStudentCode}

public class Main {
    public static void main(String[] args) {
        try {
            Scanner sc = new Scanner(System.in);
            StringBuilder sb = new StringBuilder();
            while (sc.hasNextLine()) {
                sb.append(sc.nextLine()).append("\\n");
            }
            sc.close();
            String rawInput = sb.toString().trim();

            Class<?> solClass = Class.forName("Solution");
            Object solInst = solClass.getDeclaredConstructor().newInstance();
            Method targetMethod = null;
            for (Method m : solClass.getDeclaredMethods()) {
                if (Modifier.isPublic(m.getModifiers()) && !m.getName().equals("main")) {
                    if (m.getName().equals("${fn}")) {
                        targetMethod = m;
                        break;
                    }
                    if (targetMethod == null) targetMethod = m;
                }
            }
            if (targetMethod == null) {
                System.err.println("No public method found in Solution class.");
                System.exit(1);
            }

            Class<?>[] pTypes = targetMethod.getParameterTypes();
            Object[] invokeArgs = new Object[pTypes.length];

            // Line-aware input normalization supporting Windows and Unix line endings
            String normalizedInput = rawInput.replace("\\r\\n", "\\n").replace("\\r", "\\n");
            List<String> inputLines = new ArrayList<>();
            for (String l : normalizedInput.split("\\n")) {
                String tl = l.trim();
                if (!tl.isEmpty()) {
                    inputLines.add(tl);
                }
            }

            List<String> argsList;
            if (pTypes.length == 1 && inputLines.size() <= 1) {
                argsList = new ArrayList<>();
                if (!rawInput.trim().isEmpty()) {
                    argsList.add(rawInput.trim());
                }
            } else if (inputLines.size() >= pTypes.length) {
                argsList = inputLines;
            } else {
                argsList = splitSmartArgs(normalizedInput);
            }

            for (int i = 0; i < pTypes.length; i++) {
                String token = i < argsList.size() ? argsList.get(i).trim() : "";
                invokeArgs[i] = parseJavaArg(pTypes[i], token, rawInput);
            }

            Object result = targetMethod.invoke(solInst, invokeArgs);
            printJavaResult(result, targetMethod);
        } catch (InvocationTargetException ite) {
            Throwable cause = ite.getCause() != null ? ite.getCause() : ite;
            System.err.println(cause.getMessage() != null ? cause.getMessage() : cause.toString());
            System.exit(1);
        } catch (Exception e) {
            System.err.println(e.getMessage() != null ? e.getMessage() : e.toString());
            System.exit(1);
        }
    }

    private static List<String> splitSmartArgs(String input) {
        List<String> list = new ArrayList<>();
        if (input == null || input.trim().isEmpty()) return list;

        StringBuilder current = new StringBuilder();
        int bracketDepth = 0;
        int braceDepth = 0;
        boolean inQuotes = false;
        char quoteChar = 0;

        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            if (inQuotes) {
                current.append(c);
                if (c == quoteChar && (i == 0 || input.charAt(i - 1) != '\\\\')) {
                    inQuotes = false;
                }
            } else {
                if (c == '"' || c == 39) {
                    inQuotes = true;
                    quoteChar = c;
                    current.append(c);
                } else if (c == '[') {
                    bracketDepth++;
                    current.append(c);
                } else if (c == ']') {
                    if (bracketDepth > 0) bracketDepth--;
                    current.append(c);
                } else if (c == '{') {
                    braceDepth++;
                    current.append(c);
                } else if (c == '}') {
                    if (braceDepth > 0) braceDepth--;
                    current.append(c);
                } else if (bracketDepth == 0 && braceDepth == 0 && (Character.isWhitespace(c) || c == ',')) {
                    String token = current.toString().trim();
                    if (!token.isEmpty() && !token.equals("=")) {
                        if (token.endsWith("=")) token = token.substring(0, token.length() - 1).trim();
                        if (!token.isEmpty()) list.add(token);
                    }
                    current.setLength(0);
                } else {
                    current.append(c);
                }
            }
        }
        String lastToken = current.toString().trim();
        if (!lastToken.isEmpty() && !lastToken.equals("=")) {
            if (lastToken.endsWith("=")) lastToken = lastToken.substring(0, lastToken.length() - 1).trim();
            if (!lastToken.isEmpty()) list.add(lastToken);
        }
        return list;
    }

    private static Object parseJavaArg(Class<?> type, String val, String fullInput) {
        String inputStr = (val == null || val.isEmpty()) ? fullInput : val;
        ${isBinaryTree ? `
        if (type.getSimpleName().equalsIgnoreCase("TreeNode")) {
            String trimmed = inputStr.trim();
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                trimmed = trimmed.substring(1, trimmed.length() - 1).trim();
            }
            if (trimmed.isEmpty()) return null;
            String[] parts = trimmed.split(",");
            Integer[] vals = new Integer[parts.length];
            for (int i = 0; i < parts.length; i++) {
                String p = parts[i].trim();
                if (p.equalsIgnoreCase("null") || p.equalsIgnoreCase("nil") || p.equalsIgnoreCase("None") || p.isEmpty()) {
                    vals[i] = null;
                } else {
                    vals[i] = Integer.parseInt(p);
                }
            }
            return TreeNode.fromLevelOrder(vals);
        }
        ` : ''}
        ${isLinkedList ? `
        if (type.getSimpleName().equalsIgnoreCase("ListNode")) {
            String clean = inputStr.replaceAll("[\\\\[\\\\]\\\\s]", "");
            if (clean.isEmpty()) return null;
            String[] parts = clean.split(",");
            int[] arr = new int[parts.length];
            for (int i = 0; i < parts.length; i++) arr[i] = Integer.parseInt(parts[i].trim());
            return ListNode.fromArray(arr);
        }
        ` : ''}
        if (type == int.class || type == Integer.class) {
            return inputStr.isEmpty() ? 0 : Integer.parseInt(inputStr.replaceAll("[^0-9-]", ""));
        }
        if (type == long.class || type == Long.class) {
            return inputStr.isEmpty() ? 0L : Long.parseLong(inputStr.replaceAll("[^0-9-]", ""));
        }
        if (type == double.class || type == Double.class) {
            return inputStr.isEmpty() ? 0.0 : Double.parseDouble(inputStr);
        }
        if (type == boolean.class || type == Boolean.class) {
            return Boolean.parseBoolean(inputStr.trim());
        }
        if (type == String.class) {
            String s = inputStr.trim();
            return s.startsWith("\\"") && s.endsWith("\\"") && s.length() >= 2
                ? s.substring(1, s.length() - 1) : inputStr;
        }
        if (type == int[].class) {
            String clean = inputStr.replaceAll("[\\\\[\\\\]\\\\s]", "");
            if (clean.isEmpty()) return new int[0];
            String[] parts = clean.split(",");
            int[] arr = new int[parts.length];
            for (int i = 0; i < parts.length; i++) arr[i] = Integer.parseInt(parts[i].trim());
            return arr;
        }
        if (type == String[].class) {
            String trimmed = inputStr.trim();
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                trimmed = trimmed.substring(1, trimmed.length() - 1).trim();
            }
            if (trimmed.isEmpty()) return new String[0];
            String[] parts = trimmed.split(",");
            String[] arr = new String[parts.length];
            for (int i = 0; i < parts.length; i++) {
                String p = parts[i].trim();
                if (p.startsWith("\\"") && p.endsWith("\\"") && p.length() >= 2) {
                    p = p.substring(1, p.length() - 1);
                }
                arr[i] = p;
            }
            return arr;
        }
        if (type == int[][].class) {
            String trimmed = inputStr.trim();
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                trimmed = trimmed.substring(1, trimmed.length() - 1).trim();
            }
            if (trimmed.isEmpty()) return new int[0][0];
            String[] rows = trimmed.split("\\\\]\\\\s*,\\\\s*\\\\[");
            int[][] matrix = new int[rows.length][];
            for (int r = 0; r < rows.length; r++) {
                String rowClean = rows[r].replaceAll("[\\\\[\\\\]\\\\s]", "");
                if (rowClean.isEmpty()) {
                    matrix[r] = new int[0];
                } else {
                    String[] parts = rowClean.split(",");
                    matrix[r] = new int[parts.length];
                    for (int c = 0; c < parts.length; c++) {
                        matrix[r][c] = Integer.parseInt(parts[c].trim());
                    }
                }
            }
            return matrix;
        }
        if (List.class.isAssignableFrom(type)) {
            String clean = inputStr.replaceAll("[\\\\[\\\\]\\\\s]", "");
            List<Object> list = new ArrayList<>();
            if (!clean.isEmpty()) {
                String[] parts = clean.split(",");
                for (String p : parts) {
                    try {
                        list.add(Integer.parseInt(p.trim()));
                    } catch (Exception e) {
                        list.add(p.trim());
                    }
                }
            }
            return list;
        }
        return inputStr;
    }

    private static void printJavaResult(Object res, Method targetMethod) {
        if (res == null) {
            boolean isDataStructureReturn = false;
            ${isLinkedList ? `if (targetMethod != null && targetMethod.getReturnType().getSimpleName().equalsIgnoreCase("ListNode")) isDataStructureReturn = true;` : ''}
            ${isBinaryTree ? `if (targetMethod != null && targetMethod.getReturnType().getSimpleName().equalsIgnoreCase("TreeNode")) isDataStructureReturn = true;` : ''}
            if (isDataStructureReturn) {
                System.out.println("[]");
            } else {
                System.out.println("null");
            }
        ${isBinaryTree ? `} else if (res.getClass().getSimpleName().equalsIgnoreCase("TreeNode")) {
            System.out.println(TreeNode.toLevelOrderString((TreeNode) res, ${MAX_TREE_NODES}));` : ''}
        ${isLinkedList ? `} else if (res.getClass().getSimpleName().equalsIgnoreCase("ListNode")) {
            System.out.println(ListNode.toListString((ListNode) res, ${MAX_LINKED_LIST_NODES}));` : ''}
        } else if (res instanceof List) {
            List<?> list = (List<?>) res;
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < list.size(); i++) {
                if (i > 0) sb.append(",");
                Object item = list.get(i);
                sb.append(item == null ? "null" : item.toString());
            }
            sb.append("]");
            System.out.println(sb.toString());
        } else if (res instanceof int[]) {
            System.out.println(Arrays.toString((int[]) res).replaceAll(" ", ""));
        } else if (res instanceof Object[]) {
            System.out.println(Arrays.deepToString((Object[]) res).replaceAll(" ", ""));
        } else {
            System.out.println(res);
        }
    }
}
`;
};

export default buildJavaWrapper;
