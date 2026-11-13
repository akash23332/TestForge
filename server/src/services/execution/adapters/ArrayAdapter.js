import { BaseAdapter } from './BaseAdapter.js';

/**
 * ArrayAdapter
 * Handles primitive numbers, 1D arrays, and 2D matrices.
 */
export class ArrayAdapter extends BaseAdapter {
  constructor() {
    super('ARRAY');
  }

  getTypeDeclarations(language, options = {}) {
    return '';
  }

  normalizeOutput(output) {
    if (output === null || output === undefined) return null;
    if (typeof output === 'string') {
      const trimmed = output.trim();
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    return output;
  }

  getStarterTemplate(language, functionName = 'solution', parameters = [], returnType = 'int') {
    const fn = functionName || 'solution';
    const params = parameters && parameters.length > 0 ? parameters : [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }];

    if (language === 'python' || language === 'py') {
      const pNames = params.map(p => p.name || 'arg').join(', ');
      return `def ${fn}(${pNames}):\n    # Write your code here\n    pass\n`;
    }
    if (language === 'javascript' || language === 'js' || language === 'node') {
      const pNames = params.map(p => p.name || 'arg').join(', ');
      return `function ${fn}(${pNames}) {\n  // Write your code here\n}\n`;
    }
    if (language === 'java') {
      const pDecls = params.map(p => `${p.type || 'int'} ${p.name || 'arg'}`).join(', ');
      return `class Solution {\n    public ${returnType || 'int'} ${fn}(${pDecls}) {\n        // Write your code here\n        return 0;\n    }\n}\n`;
    }
    if (language === 'cpp' || language === 'c++') {
      const pDecls = params.map(p => `${p.type || 'int'} ${p.name || 'arg'}`).join(', ');
      return `#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    ${returnType || 'int'} ${fn}(${pDecls}) {\n        // Write your code here\n        return 0;\n    }\n};\n`;
    }
    return '';
  }
}

export default ArrayAdapter;
