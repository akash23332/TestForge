/**
 * TestForge Code Contract Service
 * Single source of truth for coding question execution modes (FUNCTION vs STDIN),
 * starter code templates, execution harnesses, and reference solution validation.
 */

export const EXECUTION_MODES = Object.freeze({
  FUNCTION: 'FUNCTION',
  STDIN: 'STDIN'
});

export const SUPPORTED_LANGUAGES = Object.freeze(['javascript', 'python', 'java', 'cpp']);

export const DEFAULT_TEMPLATES = Object.freeze({
  FUNCTION: {
    python: `def solution(a, b):
    # Write your code here
    pass
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    int solution(int a, int b) {
        // Write your code here
        return 0;
    }
};
`,
    java: `class Solution {
    public int solution(int a, int b) {
        // Write your code here
        return 0;
    }
}
`,
    javascript: `function solution(a, b) {
  // Write your code here
}
`
  },
  STDIN: {
    python: `import sys

def main():
    # Read input from stdin and print output to stdout
    pass

if __name__ == '__main__':
    main()
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    // Read input from stdin and print output to stdout
    return 0;
}
`,
    java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // Read input from stdin and print output to stdout
        sc.close();
    }
}
`,
    javascript: `const fs = require('fs');

function main() {
  const input = fs.readFileSync(0, 'utf-8').trim();
  // Read input from stdin and print output to stdout
}

main();
`
  }
});

export const STANDARDIZED_TEMPLATES = DEFAULT_TEMPLATES;

/**
 * Returns starter code for a specific language and execution mode.
 * Prefers question-configured templates, then falls back to standardized defaults.
 */
export const getStarterCode = ({
  executionMode = EXECUTION_MODES.STDIN,
  language = 'javascript',
  functionName = 'solution',
  parameters = [],
  question = null
}) => {
  const mode = (executionMode || EXECUTION_MODES.STDIN).toUpperCase();
  const lang = (language || 'javascript').toLowerCase();

  // 1. If question has starterCodes map for this language, use it
  if (question && question.starterCodes) {
    const custom = question.starterCodes instanceof Map
      ? question.starterCodes.get(lang)
      : question.starterCodes[lang];
    if (custom && custom.trim()) {
      return custom;
    }
  }

  // 2. If question has single starterCode and it matches language
  if (question && question.starterCode && question.starterCode.trim() && question.language === lang) {
    return question.starterCode;
  }

  // 3. Generate tailored function template if functionName or parameters are specified
  if (mode === EXECUTION_MODES.FUNCTION && (functionName !== 'solution' || (parameters && parameters.length > 0))) {
    const fn = functionName || 'solution';
    const paramNames = (parameters && parameters.length > 0)
      ? parameters.map(p => p.name || 'arg').join(', ')
      : 'a, b';

    if (lang === 'python') {
      return `def ${fn}(${paramNames}):\n    # Write your code here\n    pass\n`;
    }
    if (lang === 'javascript') {
      return `function ${fn}(${paramNames}) {\n  // Write your code here\n}\n`;
    }
    if (lang === 'java') {
      const javaParams = (parameters && parameters.length > 0)
        ? parameters.map(p => `${p.type || 'int'} ${p.name || 'arg'}`).join(', ')
        : 'int a, int b';
      return `class Solution {\n    public int ${fn}(${javaParams}) {\n        // Write your code here\n        return 0;\n    }\n}\n`;
    }
    if (lang === 'cpp') {
      const cppParams = (parameters && parameters.length > 0)
        ? parameters.map(p => `${p.type || 'int'} ${p.name || 'arg'}`).join(', ')
        : 'int a, int b';
      return `#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    int ${fn}(${cppParams}) {\n        // Write your code here\n        return 0;\n    }\n};\n`;
    }
  }

  // 4. Default fallback
  const modeTemplates = DEFAULT_TEMPLATES[mode] || DEFAULT_TEMPLATES.STDIN;
  return modeTemplates[lang] || DEFAULT_TEMPLATES.STDIN.javascript;
};

/**
 * Wraps student code with a test harness for FUNCTION mode execution on OnlineCompiler.
 * In STDIN mode, code is returned unchanged.
 */
export const wrapCodeForExecution = ({
  code,
  language = 'javascript',
  executionMode = EXECUTION_MODES.STDIN,
  functionName = 'solution',
  parameters = []
}) => {
  if (!code || typeof code !== 'string') return '';
  const mode = (executionMode || EXECUTION_MODES.STDIN).toUpperCase();
  if (mode !== EXECUTION_MODES.FUNCTION) {
    return code; // STDIN mode executes raw student program
  }

  const lang = (language || 'javascript').toLowerCase();
  const fn = functionName || 'solution';

  // ── Python FUNCTION Harness ───────────────────────────────────────────────
  if (lang === 'python' || lang === 'py') {
    return `import sys, json

${code}

if __name__ == '__main__':
    try:
        raw_input = sys.stdin.read().strip()
        if not raw_input:
            args = []
        else:
            try:
                parsed = json.loads(raw_input)
                args = parsed if isinstance(parsed, list) else [parsed]
            except Exception:
                args = [line for line in raw_input.split('\\n') if line]

        if 'Solution' in globals():
            sol_inst = Solution()
            fn = getattr(sol_inst, '${fn}', None)
            if fn is None:
                methods = [m for m in dir(sol_inst) if not m.startswith('_')]
                fn = getattr(sol_inst, methods[0])
            res = fn(*args)
        else:
            fn = globals().get('${fn}')
            if fn is None:
                # Fallback to first non-main function defined
                for name, obj in list(globals().items()):
                    if callable(obj) and not name.startswith('_') and name != 'main':
                        fn = obj
                        break
            if fn is None:
                raise NameError("Function '${fn}' is not defined")
            res = fn(*args)

        print(json.dumps(res))
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)
`;
  }

  // ── JavaScript FUNCTION Harness ───────────────────────────────────────────
  if (lang === 'javascript' || lang === 'js' || lang === 'node') {
    return `const fs = require('fs');

${code}

(function() {
  try {
    const rawInput = fs.readFileSync(0, 'utf-8').trim();
    let args = [];
    if (rawInput) {
      try {
        const parsed = JSON.parse(rawInput);
        args = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        args = rawInput.split('\\n').filter(Boolean);
      }
    }
    const fn = typeof ${fn} === 'function' ? ${fn} : (typeof solution === 'function' ? solution : null);
    if (!fn) throw new Error("Function '${fn}' is not defined.");
    const res = fn.apply(null, args);
    console.log(JSON.stringify(res));
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }
})();
`;
  }

  // ── Java FUNCTION Harness ─────────────────────────────────────────────────
  if (lang === 'java') {
    // Strip redundant package/imports from student code if present
    const cleanStudentCode = code.replace(/^\s*public\s+class\s+Solution/m, 'class Solution');

    return `import java.util.*;
import java.io.*;
import java.lang.reflect.*;

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
            String[] tokens = rawInput.isEmpty() ? new String[0] : rawInput.split("[\\\\r\\\\n]+");

            for (int i = 0; i < pTypes.length; i++) {
                String token = i < tokens.length ? tokens[i].trim() : "";
                invokeArgs[i] = parseJavaArg(pTypes[i], token);
            }

            Object result = targetMethod.invoke(solInst, invokeArgs);
            printJavaResult(result);
        } catch (InvocationTargetException ite) {
            Throwable cause = ite.getCause() != null ? ite.getCause() : ite;
            System.err.println(cause.getMessage() != null ? cause.getMessage() : cause.toString());
            System.exit(1);
        } catch (Exception e) {
            System.err.println(e.getMessage() != null ? e.getMessage() : e.toString());
            System.exit(1);
        }
    }

    private static Object parseJavaArg(Class<?> type, String val) {
        if (type == int.class || type == Integer.class) {
            return val.isEmpty() ? 0 : Integer.parseInt(val.replaceAll("[^0-9-]", ""));
        }
        if (type == long.class || type == Long.class) {
            return val.isEmpty() ? 0L : Long.parseLong(val.replaceAll("[^0-9-]", ""));
        }
        if (type == double.class || type == Double.class) {
            return val.isEmpty() ? 0.0 : Double.parseDouble(val);
        }
        if (type == boolean.class || type == Boolean.class) {
            return Boolean.parseBoolean(val);
        }
        if (type == String.class) {
            return val.startsWith("\\"") && val.endsWith("\\"") && val.length() >= 2
                ? val.substring(1, val.length() - 1) : val;
        }
        if (type == int[].class) {
            String clean = val.replaceAll("[\\\\[\\\\]\\\\s]", "");
            if (clean.isEmpty()) return new int[0];
            String[] parts = clean.split(",");
            int[] arr = new int[parts.length];
            for (int i = 0; i < parts.length; i++) arr[i] = Integer.parseInt(parts[i].trim());
            return arr;
        }
        return val;
    }

    private static void printJavaResult(Object res) {
        if (res == null) {
            System.out.println("null");
        } else if (res instanceof int[]) {
            System.out.println(Arrays.toString((int[]) res));
        } else if (res instanceof Object[]) {
            System.out.println(Arrays.deepToString((Object[]) res));
        } else {
            System.out.println(res);
        }
    }
}
`;
  }

  // ── C++ FUNCTION Harness ──────────────────────────────────────────────────
  if (lang === 'cpp' || lang === 'c++') {
    return `#include <bits/stdc++.h>
using namespace std;

${code}

int main() {
    try {
        Solution sol;
        vector<string> lines;
        string line;
        while (getline(cin, line)) {
            if (!line.empty()) lines.push_back(line);
        }

        // Generic integer invocation fallback
        int a = lines.size() > 0 ? stoi(lines[0]) : 0;
        int b = lines.size() > 1 ? stoi(lines[1]) : 0;
        auto res = sol.${fn}(a, b);
        cout << res << "\\n";
        return 0;
    } catch (const std::exception& e) {
        cerr << e.what() << endl;
        return 1;
    } catch (...) {
        cerr << "Execution exception" << endl;
        return 1;
    }
}
`;
  }

  return code;
};

export default {
  EXECUTION_MODES,
  SUPPORTED_LANGUAGES,
  DEFAULT_TEMPLATES,
  getStarterCode,
  wrapCodeForExecution
};
