import { getAdapter } from '../adapters/adapterRegistry.js';

export const buildJavaScriptWrapper = ({
  code,
  functionName = 'solution',
  parameters = [],
  dataStructure = 'ARRAY',
  returnType = 'void'
}) => {
  // Strict metadata precedence: explicit metadata is authoritative.
  const explicitDS = dataStructure && dataStructure !== 'NONE' && dataStructure !== 'ARRAY';
  const isLinkedList =
    dataStructure === 'LINKED_LIST' ||
    (!explicitDS && (
      (returnType && /List[nN]ode/i.test(returnType)) ||
      (parameters && parameters.some((p) => /List[nN]ode/i.test(p.type || '')))
    ));

  const isBinaryTree =
    dataStructure === 'BINARY_TREE' ||
    (!explicitDS && (
      (returnType && /Tree[nN]ode/i.test(returnType)) ||
      (parameters && parameters.some((p) => /Tree[nN]ode/i.test(p.type || '')))
    ));

  const needsListNode = isLinkedList || /\bList[nN]ode\b/i.test(code) || (parameters && parameters.some((p) => /List[nN]ode/i.test(p.type || '')));
  const needsTreeNode = isBinaryTree || /\bTree[nN]ode\b/i.test(code) || (parameters && parameters.some((p) => /Tree[nN]ode/i.test(p.type || '')));

  let typeDefs = '';
  if (needsListNode) {
    typeDefs += getAdapter('LINKED_LIST').getTypeDeclarations('javascript', { code }) + '\n';
  }
  if (needsTreeNode) {
    typeDefs += getAdapter('BINARY_TREE').getTypeDeclarations('javascript', { code }) + '\n';
  }
  if (!isLinkedList && !isBinaryTree && dataStructure && dataStructure !== 'ARRAY' && dataStructure !== 'NONE') {
    typeDefs += getAdapter(dataStructure).getTypeDeclarations('javascript', { code }) + '\n';
  }

  const fn = functionName || 'solution';

  const normalizedCode = code
    .replace(/\bListnode\b/g, 'ListNode')
    .replace(/\bTreenode\b/g, 'TreeNode');

  const paramTypes = (parameters || []).map((p) => (p.type || '').trim());
  const paramNames = (parameters || []).map((p) => (p.name || '').trim());

  return `const fs = require('fs');

${typeDefs}

${normalizedCode}

function splitSmartArgs(text) {
  text = (text || '').trim();
  if (!text) return [];
  const lines = text.split('\\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    return lines.map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        const num = Number(l);
        if (!isNaN(num) && l.trim() !== '') return num;
        if (l.toLowerCase() === 'true') return true;
        if (l.toLowerCase() === 'false') return false;
        return l;
      }
    });
  }

  const res = [];
  let current = '';
  let bracketDepth = 0;
  let braceDepth = 0;
  let inQuotes = false;
  let quoteChar = null;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      current += c;
      if (c === quoteChar && (i === 0 || text[i - 1] !== '\\\\')) {
        inQuotes = false;
      }
    } else {
      if (c === '"' || c === "'") {
        inQuotes = true;
        quoteChar = c;
        current += c;
      } else if (c === '[') {
        bracketDepth++;
        current += c;
      } else if (c === ']') {
        if (bracketDepth > 0) bracketDepth--;
        current += c;
      } else if (c === '{') {
        braceDepth++;
        current += c;
      } else if (c === '}') {
        if (braceDepth > 0) braceDepth--;
        current += c;
      } else if (bracketDepth === 0 && braceDepth === 0 && (c === ',' || /\\s/.test(c))) {
        let token = current.trim();
        if (token && token !== '=') {
          if (token.endsWith('=')) token = token.slice(0, -1).trim();
          if (token) {
            try {
              res.push(JSON.parse(token));
            } catch {
              const num = Number(token);
              if (!isNaN(num) && token.trim() !== '') res.push(num);
              else if (token.toLowerCase() === 'true') res.push(true);
              else if (token.toLowerCase() === 'false') res.push(false);
              else res.push(token);
            }
          }
        }
        current = '';
      } else {
        current += c;
      }
    }
  }

  let lastToken = current.trim();
  if (lastToken && lastToken !== '=') {
    if (lastToken.endsWith('=')) lastToken = lastToken.slice(0, -1).trim();
    if (lastToken) {
      try {
        res.push(JSON.parse(lastToken));
      } catch {
        const num = Number(lastToken);
        if (!isNaN(num) && lastToken.trim() !== '') res.push(num);
        else if (lastToken.toLowerCase() === 'true') res.push(true);
        else if (lastToken.toLowerCase() === 'false') res.push(false);
        else res.push(lastToken);
      }
    }
  }
  return res;
}

(function() {
  try {
    const rawInput = fs.readFileSync(0, 'utf-8').trim();
    const args = splitSmartArgs(rawInput);

    const paramTypes = ${JSON.stringify(paramTypes)};
    const paramNames = ${JSON.stringify(paramNames)};

    const finalArgs = args.map((a, i) => {
      const pType = (i < paramTypes.length ? paramTypes[i] : '').toLowerCase();
      const pName = (i < paramNames.length ? paramNames[i] : '').toLowerCase();

      let convertToTree = false;
      let convertToList = false;

      if (/treenode/i.test(pType) || pType === 'tree') {
        convertToTree = true;
      } else if (/listnode|linkedlist/i.test(pType)) {
        convertToList = true;
      } else if (/(?:\\[\\]|array|vector|list)/i.test(pType)) {
        convertToTree = false;
        convertToList = false;
      } else {
        if (i === 0 && ${isBinaryTree ? 'true' : 'false'}) {
          convertToTree = true;
        } else if (i === 0 && ${isLinkedList ? 'true' : 'false'}) {
          convertToList = true;
        } else if (/root/i.test(pName) && typeof TreeNode !== 'undefined') {
          convertToTree = true;
        } else if (/head/i.test(pName) && typeof ListNode !== 'undefined') {
          convertToList = true;
        }
      }

      if (Array.isArray(a)) {
        if (convertToTree && typeof TreeNode !== 'undefined') {
          return TreeNode.fromArray(a);
        } else if (convertToList && typeof ListNode !== 'undefined') {
          return ListNode.fromArray(a);
        }
      }
      return a;
    });

    let targetFn = null;
    if (typeof ${fn} === 'function') targetFn = ${fn};
    else if (typeof solution === 'function') targetFn = solution;

    if (!targetFn && typeof Solution === 'function') {
      const solInst = new Solution();
      if (typeof solInst['${fn}'] === 'function') {
        targetFn = solInst['${fn}'].bind(solInst);
      } else {
        const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(solInst));
        const method = proto.find((m) => m !== 'constructor' && typeof solInst[m] === 'function');
        if (method) targetFn = solInst[method].bind(solInst);
      }
    }

    if (!targetFn) throw new Error("Function '${fn}' is not defined.");
    let res = targetFn.apply(null, finalArgs);

    if (res && typeof res === 'object') {
      if (typeof TreeNode !== 'undefined' && (res.left !== undefined || res.right !== undefined || res instanceof TreeNode)) {
        res = TreeNode.toArray(res);
      } else if (typeof ListNode !== 'undefined' && res.next !== undefined && res.val !== undefined) {
        res = ListNode.toArray(res);
      }
    } else if (res === null) {
      let isDsRet = false;
      if (${isBinaryTree ? 'true' : 'false'} || ('${returnType}'.includes('TreeNode') && '${returnType}' !== 'void')) {
        isDsRet = true;
      } else if (${isLinkedList ? 'true' : 'false'} || ('${returnType}'.includes('ListNode') && '${returnType}' !== 'void')) {
        isDsRet = true;
      }
      if (isDsRet) {
        res = [];
      }
    }

    console.log(JSON.stringify(res));
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }
})();
`;
};

export default buildJavaScriptWrapper;
