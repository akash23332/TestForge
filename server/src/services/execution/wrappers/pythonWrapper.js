import { getAdapter } from '../adapters/adapterRegistry.js';

export const buildPythonWrapper = ({
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
    typeDefs += getAdapter('LINKED_LIST').getTypeDeclarations('python', { code }) + '\n';
  }
  if (needsTreeNode) {
    typeDefs += getAdapter('BINARY_TREE').getTypeDeclarations('python', { code }) + '\n';
  }
  if (!isLinkedList && !isBinaryTree && dataStructure && dataStructure !== 'ARRAY' && dataStructure !== 'NONE') {
    typeDefs += getAdapter(dataStructure).getTypeDeclarations('python', { code }) + '\n';
  }

  const fn = functionName || 'solution';

  const normalizedCode = code
    .replace(/\bListnode\b/g, 'ListNode')
    .replace(/\bTreenode\b/g, 'TreeNode');

  const paramTypes = (parameters || []).map((p) => (p.type || '').trim());
  const paramNames = (parameters || []).map((p) => (p.name || '').trim());

  return `import sys, json

${typeDefs}

${normalizedCode}

def split_smart_args(text):
    text = text.strip()
    if not text:
        return []
    lines = [l.strip() for l in text.split('\\n') if l.strip()]
    if len(lines) > 1:
        res = []
        for l in lines:
            try:
                res.append(json.loads(l))
            except Exception:
                try:
                    res.append(int(l))
                except Exception:
                    try:
                        res.append(float(l))
                    except Exception:
                        if l.lower() in ('true', 'false'):
                            res.append(l.lower() == 'true')
                        else:
                            res.append(l)
        return res

    res = []
    current = []
    bracket_depth = 0
    brace_depth = 0
    in_quotes = False
    quote_char = None
    i = 0
    while i < len(text):
        c = text[i]
        if in_quotes:
            current.append(c)
            if c == quote_char and (i == 0 or text[i - 1] != '\\\\'):
                in_quotes = False
        else:
            if c in ('"', "'"):
                in_quotes = True
                quote_char = c
                current.append(c)
            elif c == '[':
                bracket_depth += 1
                current.append(c)
            elif c == ']':
                if bracket_depth > 0:
                    bracket_depth -= 1
                current.append(c)
            elif c == '{':
                brace_depth += 1
                current.append(c)
            elif c == '}':
                if brace_depth > 0:
                    brace_depth -= 1
                current.append(c)
            elif bracket_depth == 0 and brace_depth == 0 and (c == ',' or c.isspace()):
                token = "".join(current).strip()
                if token and token != '=':
                    if token.endswith('='):
                        token = token[:-1].strip()
                    if token:
                        try:
                            res.append(json.loads(token))
                        except Exception:
                            try:
                                res.append(int(token))
                            except Exception:
                                try:
                                    res.append(float(token))
                                except Exception:
                                    if token.lower() in ('true', 'false'):
                                        res.append(token.lower() == 'true')
                                    else:
                                        res.append(token)
                current = []
            else:
                current.append(c)
        i += 1

    last_token = "".join(current).strip()
    if last_token and last_token != '=':
        if last_token.endswith('='):
            last_token = last_token[:-1].strip()
        if last_token:
            try:
                res.append(json.loads(last_token))
            except Exception:
                try:
                    res.append(int(last_token))
                except Exception:
                    try:
                        res.append(float(last_token))
                    except Exception:
                        if last_token.lower() in ('true', 'false'):
                            res.append(last_token.lower() == 'true')
                        else:
                            res.append(last_token)
    return res

if __name__ == '__main__':
    try:
        raw_input = sys.stdin.read().strip()
        args = split_smart_args(raw_input) if raw_input else []

        param_types = ${JSON.stringify(paramTypes)}
        param_names = ${JSON.stringify(paramNames)}

        final_args = []
        for i, a in enumerate(args):
            p_type = (param_types[i] if i < len(param_types) else '').lower()
            p_name = (param_names[i] if i < len(param_names) else '').lower()

            convert_to_tree = False
            convert_to_list = False

            if 'treenode' in p_type or p_type == 'tree':
                convert_to_tree = True
            elif 'listnode' in p_type or 'linkedlist' in p_type:
                convert_to_list = True
            elif any(arr_kw in p_type for arr_kw in ['[]', 'list', 'vector', 'array']):
                convert_to_tree = False
                convert_to_list = False
            else:
                if i == 0 and ${isBinaryTree ? 'True' : 'False'}:
                    convert_to_tree = True
                elif i == 0 and ${isLinkedList ? 'True' : 'False'}:
                    convert_to_list = True
                elif 'root' in p_name and 'TreeNode' in globals():
                    convert_to_tree = True
                elif 'head' in p_name and 'ListNode' in globals():
                    convert_to_list = True

            if isinstance(a, list):
                if convert_to_tree and 'TreeNode' in globals():
                    final_args.append(TreeNode.from_list(a))
                elif convert_to_list and 'ListNode' in globals():
                    final_args.append(ListNode.from_list(a))
                else:
                    final_args.append(a)
            else:
                final_args.append(a)

        target_fn = None
        if 'Solution' in globals():
            sol_inst = Solution()
            target_fn = getattr(sol_inst, '${fn}', None)
            if target_fn is None:
                methods = [m for m in dir(sol_inst) if not m.startswith('_')]
                if methods:
                    target_fn = getattr(sol_inst, methods[0])
        if target_fn is None:
            target_fn = globals().get('${fn}')
            if target_fn is None:
                for name, obj in list(globals().items()):
                    if callable(obj) and not name.startswith('_') and name != 'main' and name not in ['ListNode', 'TreeNode', 'split_smart_args']:
                        target_fn = obj
                        break

        if target_fn is None:
            raise NameError("Function '${fn}' is not defined")

        res = target_fn(*final_args)

        if 'TreeNode' in globals() and isinstance(res, TreeNode):
            res = TreeNode.to_list(res)
        elif 'ListNode' in globals() and isinstance(res, ListNode):
            res = ListNode.to_list(res)
        elif res is None:
            is_ds_ret = False
            if ${isBinaryTree ? 'True' : 'False'} or ('${returnType}'.endswith('TreeNode') and '${returnType}' != 'void'):
                is_ds_ret = True
            elif ${isLinkedList ? 'True' : 'False'} or ('${returnType}'.endswith('ListNode') and '${returnType}' != 'void'):
                is_ds_ret = True
            if is_ds_ret:
                res = []

        print(json.dumps(res, separators=(',', ':')))
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)
`;
};

export default buildPythonWrapper;
