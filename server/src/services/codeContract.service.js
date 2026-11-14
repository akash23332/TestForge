import { buildCppWrapper } from './execution/wrappers/cppWrapper.js';
import { buildJavaWrapper } from './execution/wrappers/javaWrapper.js';
import { buildPythonWrapper } from './execution/wrappers/pythonWrapper.js';
import { buildJavaScriptWrapper } from './execution/wrappers/javascriptWrapper.js';
import { splitCppParams, parseCppParams, extractCppFunctionInfo } from './execution/wrappers/cppParser.js';

export { splitCppParams, parseCppParams, extractCppFunctionInfo };

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
 * Validates metadata precedence and checks for conflicting declarations
 * between dataStructure, executionMode, parameters, and returnType.
 */
export const validateMetadataContract = ({
  executionMode = EXECUTION_MODES.STDIN,
  dataStructure = 'ARRAY',
  parameters = [],
  returnType = 'void'
} = {}) => {
  const errors = [];
  const warnings = [];

  const mode = (executionMode || EXECUTION_MODES.STDIN).toUpperCase();
  const ds = (dataStructure || 'ARRAY').toUpperCase();

  if (mode === EXECUTION_MODES.STDIN && (ds === 'LINKED_LIST' || ds === 'BINARY_TREE')) {
    warnings.push(`executionMode is STDIN but dataStructure is ${ds}. Data structure adapters are only active in FUNCTION execution mode.`);
  }

  if (ds === 'LINKED_LIST') {
    const hasTreeParam = parameters && parameters.some(p => /Tree[nN]ode/i.test(p.type || ''));
    const hasTreeReturn = /Tree[nN]ode/i.test(returnType || '');
    if (hasTreeParam || hasTreeReturn) {
      errors.push(`Conflicting metadata: dataStructure is set to LINKED_LIST but function signature declares TreeNode.`);
    }
  } else if (ds === 'BINARY_TREE') {
    const hasListParam = parameters && parameters.some(p => /List[nN]ode/i.test(p.type || ''));
    const hasListReturn = /List[nN]ode/i.test(returnType || '');
    if (hasListParam || hasListReturn) {
      errors.push(`Conflicting metadata: dataStructure is set to BINARY_TREE but function signature declares ListNode.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    resolvedMetadata: {
      executionMode: mode,
      dataStructure: ds,
      returnType: returnType || 'void'
    }
  };
};

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
 * Wraps student code with a test harness for FUNCTION mode execution on OnlineCompiler or Local runner.
 * In STDIN mode, code is returned unchanged.
 */
export const wrapCodeForExecution = ({
  code,
  language = 'javascript',
  executionMode = EXECUTION_MODES.STDIN,
  dataStructure = 'ARRAY',
  functionName = 'solution',
  returnType = 'void',
  parameters = []
}) => {
  if (!code || typeof code !== 'string') return '';
  const mode = (executionMode || EXECUTION_MODES.STDIN).toUpperCase();
  if (mode !== EXECUTION_MODES.FUNCTION) {
    return code; // STDIN mode executes raw student program
  }

  const lang = (language || 'javascript').toLowerCase();

  if (lang === 'cpp' || lang === 'c++') {
    return buildCppWrapper({ code, functionName, parameters, dataStructure, returnType });
  }
  if (lang === 'java') {
    return buildJavaWrapper({ code, functionName, parameters, dataStructure, returnType });
  }
  if (lang === 'python' || lang === 'py') {
    return buildPythonWrapper({ code, functionName, parameters, dataStructure, returnType });
  }
  if (lang === 'javascript' || lang === 'js' || lang === 'node') {
    return buildJavaScriptWrapper({ code, functionName, parameters, dataStructure, returnType });
  }

  return code;
};

export default {
  EXECUTION_MODES,
  SUPPORTED_LANGUAGES,
  DEFAULT_TEMPLATES,
  getStarterCode,
  wrapCodeForExecution,
  validateMetadataContract,
  splitCppParams,
  parseCppParams,
  extractCppFunctionInfo
};
