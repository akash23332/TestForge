#!/usr/bin/env python3
"""
TestForge Python AST Mutation Engine
Transforms Python abstract syntax trees deterministically across AOR, ROR, LOR, COR, and RVR operators.
Validates all generated mutants with compile() before returning.
Never mutates comments or string literals.
"""

import sys
import json
import ast
import copy

def get_node_location(node):
    return {
        "line": getattr(node, "lineno", 1),
        "column": getattr(node, "col_offset", 0),
        "endLine": getattr(node, "end_lineno", getattr(node, "lineno", 1)),
        "endColumn": getattr(node, "end_col_offset", getattr(node, "col_offset", 0)),
    }

def is_string_literal(node):
    return isinstance(node, ast.Constant) and isinstance(node.value, str)

class MutationCollector(ast.NodeVisitor):
    def __init__(self, original_tree, original_code):
        self.original_tree = original_tree
        self.original_code = original_code
        self.candidates = []

    def visit_BinOp(self, node):
        self.generic_visit(node)
        # Avoid string concatenation mutation
        if is_string_literal(node.left) or is_string_literal(node.right):
            return

        op_map = {
            ast.Add: (ast.Sub, "+", "-", "ARITHMETIC_OPERATOR_REPLACEMENT", "AOR"),
            ast.Sub: (ast.Add, "-", "+", "ARITHMETIC_OPERATOR_REPLACEMENT", "AOR"),
            ast.Mult: (ast.FloorDiv, "*", "//", "ARITHMETIC_OPERATOR_REPLACEMENT", "AOR"),
            ast.Div: (ast.Mult, "/", "*", "ARITHMETIC_OPERATOR_REPLACEMENT", "AOR"),
            ast.FloorDiv: (ast.Mult, "//", "*", "ARITHMETIC_OPERATOR_REPLACEMENT", "AOR"),
            ast.Mod: (ast.Mult, "%", "*", "ARITHMETIC_OPERATOR_REPLACEMENT", "AOR"),
        }
        for op_type, (new_op_type, orig_sym, new_sym, legacy_op, op_group) in op_map.items():
            if isinstance(node.op, op_type):
                def transform(target_node, replacement=new_op_type()):
                    target_node.op = replacement

                orig_snippet = ast.unparse(node)
                self.candidates.append({
                    "target_node": node,
                    "transform": transform,
                    "legacy_operator": legacy_op,
                    "operator_type": op_group,
                    "description": f'Replaced arithmetic operator "{orig_sym}" with "{new_sym}"',
                    "orig_snippet": orig_snippet,
                    "loc": get_node_location(node),
                })

    def visit_AugAssign(self, node):
        self.generic_visit(node)
        aug_map = {
            ast.Add: (ast.Sub, "+=", "-=", "ARITHMETIC_OPERATOR_REPLACEMENT", "AOR"),
            ast.Sub: (ast.Add, "-=", "+=", "ARITHMETIC_OPERATOR_REPLACEMENT", "AOR"),
            ast.Mult: (ast.FloorDiv, "*=", "//=", "ARITHMETIC_OPERATOR_REPLACEMENT", "AOR"),
            ast.FloorDiv: (ast.Mult, "//=", "*=", "ARITHMETIC_OPERATOR_REPLACEMENT", "AOR"),
        }
        for op_type, (new_op_type, orig_sym, new_sym, legacy_op, op_group) in aug_map.items():
            if isinstance(node.op, op_type):
                def transform(target_node, replacement=new_op_type()):
                    target_node.op = replacement

                orig_snippet = ast.unparse(node)
                self.candidates.append({
                    "target_node": node,
                    "transform": transform,
                    "legacy_operator": legacy_op,
                    "operator_type": op_group,
                    "description": f'Replaced compound assignment "{orig_sym}" with "{new_sym}"',
                    "orig_snippet": orig_snippet,
                    "loc": get_node_location(node),
                })

    def visit_Compare(self, node):
        self.generic_visit(node)
        rel_map = {
            ast.Eq: (ast.NotEq, "==", "!=", "RELATIONAL_OPERATOR_REPLACEMENT", "ROR"),
            ast.NotEq: (ast.Eq, "!=", "==", "RELATIONAL_OPERATOR_REPLACEMENT", "ROR"),
            ast.Lt: (ast.LtE, "<", "<=", "BOUNDARY_OFF_BY_ONE", "COR"),
            ast.LtE: (ast.Lt, "<=", "<", "RELATIONAL_OPERATOR_REPLACEMENT", "ROR"),
            ast.Gt: (ast.GtE, ">", ">=", "RELATIONAL_OPERATOR_REPLACEMENT", "ROR"),
            ast.GtE: (ast.Gt, ">=", ">", "RELATIONAL_OPERATOR_REPLACEMENT", "ROR"),
            ast.Is: (ast.IsNot, "is", "is not", "NULL_CHECK_INVERSION", "ROR"),
            ast.IsNot: (ast.Is, "is not", "is", "NULL_CHECK_INVERSION", "ROR"),
            ast.In: (ast.NotIn, "in", "not in", "RELATIONAL_OPERATOR_REPLACEMENT", "ROR"),
            ast.NotIn: (ast.In, "not in", "in", "RELATIONAL_OPERATOR_REPLACEMENT", "ROR"),
        }
        for i, op in enumerate(node.ops):
            for op_type, (new_op_type, orig_sym, new_sym, legacy_op, op_group) in rel_map.items():
                if isinstance(op, op_type):
                    def make_transform(idx, new_type):
                        def transform(target_node):
                            target_node.ops[idx] = new_type()
                        return transform

                    orig_snippet = ast.unparse(node)
                    self.candidates.append({
                        "target_node": node,
                        "transform": make_transform(i, new_op_type),
                        "legacy_operator": legacy_op,
                        "operator_type": op_group,
                        "description": f'Altered relational comparison "{orig_sym}" to "{new_sym}"',
                        "orig_snippet": orig_snippet,
                        "loc": get_node_location(node),
                    })

    def visit_BoolOp(self, node):
        self.generic_visit(node)
        bool_map = {
            ast.And: (ast.Or, "and", "or", "LOGICAL_CONNECTOR_REPLACEMENT", "LOR"),
            ast.Or: (ast.And, "or", "and", "LOGICAL_CONNECTOR_REPLACEMENT", "LOR"),
        }
        for op_type, (new_op_type, orig_sym, new_sym, legacy_op, op_group) in bool_map.items():
            if isinstance(node.op, op_type):
                def transform(target_node, replacement=new_op_type()):
                    target_node.op = replacement

                orig_snippet = ast.unparse(node)
                self.candidates.append({
                    "target_node": node,
                    "transform": transform,
                    "legacy_operator": legacy_op,
                    "operator_type": op_group,
                    "description": f'Swapped logical operator "{orig_sym}" with "{new_sym}"',
                    "orig_snippet": orig_snippet,
                    "loc": get_node_location(node),
                })

    def visit_UnaryOp(self, node):
        self.generic_visit(node)
        if isinstance(node.op, ast.Not):
            orig_snippet = ast.unparse(node)
            def transform(target_node):
                # Replace with underlying operand
                target_node._mut_replace = target_node.operand

            self.candidates.append({
                "target_node": node,
                "transform": transform,
                "legacy_operator": "LOGICAL_CONNECTOR_REPLACEMENT",
                "operator_type": "LOR",
                "description": 'Removed boolean negation "not"',
                "orig_snippet": orig_snippet,
                "loc": get_node_location(node),
            })

    def visit_For(self, node):
        self.generic_visit(node)
        # Check range(...) loop boundary mutations
        # e.g., range(len(arr)) -> range(len(arr) - 1) or range(1, len(arr))
        if isinstance(node.iter, ast.Call) and isinstance(node.iter.func, ast.Name) and node.iter.func.id == "range":
            args = node.iter.args
            # Pattern 1: range(len(x)) -> range(len(x) - 1) [BOUNDARY_OFF_BY_ONE]
            if len(args) == 1:
                stop_arg = args[0]
                orig_snippet = ast.unparse(node.iter)
                # Mutation A: range(len(x) - 1)
                def transform_off_by_one(target_node):
                    old_arg = target_node.iter.args[0]
                    target_node.iter.args = [
                        ast.BinOp(left=old_arg, op=ast.Sub(), right=ast.Constant(value=1))
                    ]
                self.candidates.append({
                    "target_node": node,
                    "snippet_node": "iter",
                    "transform": transform_off_by_one,
                    "legacy_operator": "BOUNDARY_OFF_BY_ONE",
                    "operator_type": "COR",
                    "description": 'Modified loop range to "range(... - 1)", skipping final element',
                    "orig_snippet": orig_snippet,
                    "loc": get_node_location(node),
                })

                # Mutation B: range(1, len(x)) [BOUNDARY_START_OFFSET]
                def transform_start_offset(target_node):
                    old_arg = target_node.iter.args[0]
                    target_node.iter.args = [
                        ast.Constant(value=1),
                        old_arg
                    ]
                self.candidates.append({
                    "target_node": node,
                    "snippet_node": "iter",
                    "transform": transform_start_offset,
                    "legacy_operator": "BOUNDARY_START_OFFSET",
                    "operator_type": "COR",
                    "description": 'Modified loop start index from 0 to 1, skipping first item',
                    "orig_snippet": orig_snippet,
                    "loc": get_node_location(node),
                })

    def visit_Return(self, node):
        self.generic_visit(node)
        orig_snippet = ast.unparse(node)
        if node.value is None:
            def transform_none(target_node):
                target_node.value = ast.Constant(value=True)
            self.candidates.append({
                "target_node": node,
                "transform": transform_none,
                "legacy_operator": "RETURN_VALUE_MUTATION",
                "operator_type": "RVR",
                "description": 'Replaced empty return with "return True"',
                "orig_snippet": orig_snippet,
                "loc": get_node_location(node),
            })
            return

        # Case A: Return boolean literal (True <-> False)
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, bool):
            curr_val = node.value.value
            new_val = not curr_val
            def transform_bool(target_node, v=new_val):
                target_node.value = ast.Constant(value=v)
            self.candidates.append({
                "target_node": node,
                "transform": transform_bool,
                "legacy_operator": "RETURN_VALUE_MUTATION",
                "operator_type": "RVR",
                "description": f'Inverted boolean return value from "{curr_val}" to "{new_val}"',
                "orig_snippet": orig_snippet,
                "loc": get_node_location(node),
            })
            return

        # Case B: Return list/array (e.g., [a, b] -> [a, b + 1] or [])
        if isinstance(node.value, ast.List):
            if len(node.value.elts) > 0:
                def transform_list(target_node):
                    last_elt = target_node.value.elts[-1]
                    target_node.value.elts[-1] = ast.BinOp(left=last_elt, op=ast.Add(), right=ast.Constant(value=1))
                self.candidates.append({
                    "target_node": node,
                    "transform": transform_list,
                    "legacy_operator": "RETURN_VALUE_MUTATION",
                    "operator_type": "RVR",
                    "description": 'Modified list return element by adding 1',
                    "orig_snippet": orig_snippet,
                    "loc": get_node_location(node),
                })
            else:
                def transform_empty_list(target_node):
                    target_node.value = ast.List(elts=[ast.Constant(value=0)], ctx=ast.Load())
                self.candidates.append({
                    "target_node": node,
                    "transform": transform_empty_list,
                    "legacy_operator": "RETURN_VALUE_MUTATION",
                    "operator_type": "RVR",
                    "description": 'Replaced empty list return with [0]',
                    "orig_snippet": orig_snippet,
                    "loc": get_node_location(node),
                })
            return

        # Case C: Return numeric or identifier -> add 1
        if isinstance(node.value, (ast.Name, ast.Constant, ast.BinOp)):
            def transform_num(target_node):
                target_node.value = ast.BinOp(left=target_node.value, op=ast.Add(), right=ast.Constant(value=1))
            self.candidates.append({
                "target_node": node,
                "transform": transform_num,
                "legacy_operator": "RETURN_VALUE_MUTATION",
                "operator_type": "RVR",
                "description": f'Mutated return value expression by adding 1',
                "orig_snippet": orig_snippet,
                "loc": get_node_location(node),
            })

def mutate_python_code(code_str, max_mutants=5):
    try:
        tree = ast.parse(code_str)
    except SyntaxError as e:
        return {
            "success": False,
            "error": f"Python SyntaxError at line {e.lineno}, col {e.offset}: {e.msg}",
            "mutants": []
        }

    collector = MutationCollector(tree, code_str)
    collector.visit(tree)

    mutants = []
    seen_code = set()
    seen_code.add(code_str.strip())
    mutant_id = 1

    for cand in collector.candidates:
        if len(mutants) >= max_mutants:
            break

        # Deep copy the entire tree
        mutated_tree = copy.deepcopy(tree)

        # Locate the corresponding target node in the copied tree using matching lineno and col_offset
        target_loc = cand["loc"]
        matched_node = None
        for n in ast.walk(mutated_tree):
            if (
                type(n) is type(cand["target_node"])
                and getattr(n, "lineno", -1) == target_loc["line"]
                and getattr(n, "col_offset", -1) == target_loc["column"]
            ):
                matched_node = n
                break

        if not matched_node:
            continue

        # Apply transformation
        cand["transform"](matched_node)

        # Fix AST if needed
        ast.fix_missing_locations(mutated_tree)

        # Handle replacement if node._mut_replace set
        class ReplaceHelper(ast.NodeTransformer):
            def visit(self, node):
                if hasattr(node, "_mut_replace"):
                    return getattr(node, "_mut_replace")
                return self.generic_visit(node)

        mutated_tree = ReplaceHelper().visit(mutated_tree)
        ast.fix_missing_locations(mutated_tree)

        try:
            mutated_code = ast.unparse(mutated_tree)
        except Exception:
            continue

        # Validate by compiling
        try:
            compile(mutated_code, f"<mutant-{mutant_id}>", "exec")
        except Exception:
            continue

        if mutated_code.strip() in seen_code:
            continue

        seen_code.add(mutated_code.strip())

        try:
            if cand.get("snippet_node") == "iter" and hasattr(matched_node, "iter"):
                mutated_snippet = ast.unparse(matched_node.iter)
            else:
                mutated_snippet = ast.unparse(matched_node)
        except Exception:
            mutated_snippet = cand["orig_snippet"]

        mutants.append({
            "id": f"mut-{mutant_id}",
            "language": "python",
            "operator": cand["legacy_operator"],
            "operatorType": cand["operator_type"],
            "description": cand["description"],
            "originalLocation": target_loc,
            "originalSnippet": cand["orig_snippet"],
            "mutatedSnippet": mutated_snippet,
            "mutatedFullCode": mutated_code,
            "validationStatus": "valid"
        })
        mutant_id += 1

    return {
        "success": True,
        "mutants": mutants
    }

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            print(json.dumps({"success": False, "error": "Empty input received", "mutants": []}))
            sys.exit(0)

        data = json.loads(raw_input)
        code = data.get("code", "")
        max_mutants = data.get("maxMutants", 5)

        res = mutate_python_code(code, max_mutants)
        print(json.dumps(res))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e), "mutants": []}))

if __name__ == "__main__":
    main()
