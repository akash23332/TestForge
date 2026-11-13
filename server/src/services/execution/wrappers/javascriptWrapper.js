import { getAdapter } from '../adapters/adapterRegistry.js';

export const buildJavaScriptWrapper = ({
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
    typeDefs += getAdapter('LINKED_LIST').getTypeDeclarations('javascript', { code }) + '\n';
  }
  if (isBinaryTree || /\bTree[nN]ode\b/i.test(code)) {
    typeDefs += getAdapter('BINARY_TREE').getTypeDeclarations('javascript', { code }) + '\n';
  }
  if (!isLinkedList && !isBinaryTree && dataStructure && dataStructure !== 'ARRAY') {
    typeDefs += getAdapter(dataStructure).getTypeDeclarations('javascript', { code }) + '\n';
  }

  const fn = functionName || 'solution';

  const normalizedCode = code
    .replace(/\bListnode\b/g, 'ListNode')
    .replace(/\bTreenode\b/g, 'TreeNode');

  return `const fs = require('fs');
${typeDefs}

${normalizedCode}

(function() {
  try {
    const rawInput = fs.readFileSync(0, 'utf-8').trim();
    let args = [];
    if (rawInput) {
      const lines = rawInput.split('\\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        try {
          args.push(JSON.parse(line));
        } catch {
          const numTokens = line.split(/\\s+/).map(Number);
          if (numTokens.length > 1 && numTokens.every((n) => !isNaN(n))) {
            args.push(...numTokens);
          } else {
            args.push(line);
          }
        }
      }
    }

    const isLL = ${isLinkedList ? 'true' : "(typeof ListNode !== 'undefined' && (" + (code.includes('ListNode') || code.includes('.next') ? 'true' : 'false') + "))"};
    const isBT = ${isBinaryTree ? 'true' : "(typeof TreeNode !== 'undefined' && (" + (code.includes('TreeNode') || code.includes('.left') || code.includes('.right') ? 'true' : 'false') + "))"};

    const finalArgs = args.map((a) => {
      if (Array.isArray(a)) {
        if (isBT && !isLL) {
          return TreeNode.fromArray(a);
        } else if (isLL) {
          return ListNode.fromArray(a);
        }
      }
      return a;
    });

    let targetFn = typeof ${fn} === 'function' ? ${fn} : (typeof solution === 'function' ? solution : null);
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
    } else if (res === null && isBT && ('${returnType}'.includes('TreeNode') || '${returnType}' === 'void')) {
      res = [];
    } else if (res === null && isLL) {
      res = [];
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
