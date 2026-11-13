import { getAdapter } from '../adapters/adapterRegistry.js';

export const buildPythonWrapper = ({
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
    typeDefs += getAdapter('LINKED_LIST').getTypeDeclarations('python', { code }) + '\n';
  }
  if (isBinaryTree || /\bTree[nN]ode\b/i.test(code)) {
    typeDefs += getAdapter('BINARY_TREE').getTypeDeclarations('python', { code }) + '\n';
  }
  if (!isLinkedList && !isBinaryTree && dataStructure && dataStructure !== 'ARRAY') {
    typeDefs += getAdapter(dataStructure).getTypeDeclarations('python', { code }) + '\n';
  }

  const fn = functionName || 'solution';

  const normalizedCode = code
    .replace(/\bListnode\b/g, 'ListNode')
    .replace(/\bTreenode\b/g, 'TreeNode');

  return `import sys, json
${typeDefs}

${normalizedCode}

if __name__ == '__main__':
    try:
        raw_input = sys.stdin.read().strip()
        args = []
        if raw_input:
            lines = [l.strip() for l in raw_input.split('\\n') if l.strip()]
            for line in lines:
                try:
                    args.append(json.loads(line))
                except Exception:
                    tokens = line.split()
                    try:
                        num_tokens = [int(t) for t in tokens]
                        if len(num_tokens) > 1:
                            args.extend(num_tokens)
                        else:
                            args.append(line)
                    except Exception:
                        args.append(line)

        # Adapt arguments for LinkedList or BinaryTree if specified
        is_ll = ${isLinkedList ? 'True' : "('ListNode' in globals() and ('ListNode' in \"\"\"" + code.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + "\"\"\" or '.next' in \"\"\"" + code.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + "\"\"\"))"}
        is_bt = ${isBinaryTree ? 'True' : "('TreeNode' in globals() and ('TreeNode' in \"\"\"" + code.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + "\"\"\" or '.left' in \"\"\"" + code.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + "\"\"\" or '.right' in \"\"\"" + code.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + "\"\"\"))"}

        final_args = []
        for a in args:
            if isinstance(a, list):
                if is_bt and not is_ll:
                    final_args.append(TreeNode.from_list(a))
                elif is_ll:
                    final_args.append(ListNode.from_list(a))
                else:
                    final_args.append(a)
            else:
                final_args.append(a)

        # Invoke configured method on Solution or globally
        if 'Solution' in globals():
            sol_inst = Solution()
            fn_call = getattr(sol_inst, '${fn}', None)
            if fn_call is None:
                methods = [m for m in dir(sol_inst) if not m.startswith('_')]
                if methods:
                    fn_call = getattr(sol_inst, methods[0])
            if fn_call is None:
                raise NameError("No public method found in Solution class")
            res = fn_call(*final_args)
        else:
            fn_call = globals().get('${fn}')
            if fn_call is None:
                for name, obj in list(globals().items()):
                    if callable(obj) and not name.startswith('_') and name != 'main' and name not in ['ListNode', 'TreeNode']:
                        fn_call = obj
                        break
            if fn_call is None:
                raise NameError("Function '${fn}' is not defined")
            res = fn_call(*final_args)

        # Serialize result
        if 'TreeNode' in globals() and isinstance(res, TreeNode):
            res = TreeNode.to_list(res)
        elif 'ListNode' in globals() and isinstance(res, ListNode):
            res = ListNode.to_list(res)
        elif res is None and is_bt and ('${returnType}'.endswith('TreeNode') or '${returnType}' == 'void'):
            res = []
        elif res is None and is_ll:
            res = []

        print(json.dumps(res))
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)
`;
};

export default buildPythonWrapper;
