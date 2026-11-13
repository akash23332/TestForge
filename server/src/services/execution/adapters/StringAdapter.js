import { BaseAdapter } from './BaseAdapter.js';

/**
 * StringAdapter
 * Handles single or multiple string arguments and string returns.
 */
export class StringAdapter extends BaseAdapter {
  constructor() {
    super('STRING');
  }

  getTypeDeclarations(language, options = {}) {
    return '';
  }

  normalizeOutput(output) {
    if (output === null || output === undefined) return null;
    if (typeof output === 'string') {
      let trimmed = output.trim();
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        trimmed = trimmed.substring(1, trimmed.length - 1);
      }
      return trimmed;
    }
    return String(output);
  }

  getStarterTemplate(language, functionName = 'solution', parameters = [], returnType = 'string') {
    const fn = functionName || 'solution';
    const params = parameters && parameters.length > 0 ? parameters : [{ name: 's', type: 'string' }];

    if (language === 'python' || language === 'py') {
      const pNames = params.map(p => p.name || 's').join(', ');
      return `def ${fn}(${pNames}):\n    # Write your code here\n    pass\n`;
    }
    if (language === 'javascript' || language === 'js' || language === 'node') {
      const pNames = params.map(p => p.name || 's').join(', ');
      return `function ${fn}(${pNames}) {\n  // Write your code here\n}\n`;
    }
    if (language === 'java') {
      const pDecls = params.map(p => `${p.type || 'String'} ${p.name || 's'}`).join(', ');
      return `class Solution {\n    public ${returnType === 'string' ? 'String' : (returnType || 'String')} ${fn}(${pDecls}) {\n        // Write your code here\n        return "";\n    }\n}\n`;
    }
    if (language === 'cpp' || language === 'c++') {
      const pDecls = params.map(p => `${p.type || 'string'} ${p.name || 's'}`).join(', ');
      return `#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    ${returnType || 'string'} ${fn}(${pDecls}) {\n        // Write your code here\n        return "";\n    }\n};\n`;
    }
    return '';
  }
}

export default StringAdapter;
