import * as parser from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';

const traverse = traverseModule.default || traverseModule;
const generate = generateModule.default || generateModule;

/**
 * Extracts source code slice or generated snippet for an AST node.
 */
const getNodeSnippet = (node, code) => {
  if (node.loc && code) {
    const lines = code.split('\n');
    const startLine = node.loc.start.line - 1;
    const endLine = node.loc.end.line - 1;
    if (startLine === endLine) {
      return lines[startLine].slice(node.loc.start.column, node.loc.end.column);
    }
  }
  try {
    return generate(node).code;
  } catch {
    return '';
  }
};

/**
 * Generates AST-based mutations for JavaScript source code using @babel/parser, @babel/traverse, @babel/generator.
 * Validates each mutant by parsing it. Never mutates comments or string literals.
 *
 * @param {string} code - Valid JavaScript code
 * @param {object} options - { maxMutants: number, useShortNames: boolean }
 * @returns {Array<object>} Array of validated mutant objects
 */
export const mutateJavaScriptAst = (code, options = {}) => {
  if (!code || typeof code !== 'string') return [];
  const maxMutants = Number(options.maxMutants) || 5;

  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: false
    });
  } catch (err) {
    throw new Error(`[JavaScript AST Mutator] Syntax error parsing source code: ${err.message}`);
  }

  const candidates = [];

  // Helper to test if a node is part of a string literal
  const isStringLiteral = (node) => node && (node.type === 'StringLiteral' || node.type === 'TemplateLiteral');

  traverse(ast, {
    // -------------------------------------------------------------------------
    // 1. BinaryExpression: AOR (Arithmetic), ROR (Relational), COR (Loop Boundary)
    // -------------------------------------------------------------------------
    BinaryExpression(path) {
      const node = path.node;
      const op = node.operator;

      // Skip string concatenations
      if (isStringLiteral(node.left) || isStringLiteral(node.right)) {
        return;
      }

      // Check if this comparison is a loop condition (COR)
      const isLoopCondition =
        path.parentPath &&
        (path.parentPath.isForStatement() || path.parentPath.isWhileStatement()) &&
        path.parentKey === 'test';

      // AOR: Arithmetic operators
      const aorMap = {
        '+': '-',
        '-': '+',
        '*': '/',
        '/': '*',
        '%': '*'
      };

      if (aorMap[op]) {
        const replacement = aorMap[op];
        candidates.push({
          type: 'AOR',
          legacyOperator: 'ARITHMETIC_OPERATOR_REPLACEMENT',
          operatorType: 'AOR',
          description: `Inverted arithmetic operator "${op}" to "${replacement}"`,
          loc: node.loc,
          apply(astClone) {
            let matched = false;
            traverse(astClone, {
              BinaryExpression(clonePath) {
                if (matched) return;
                const cn = clonePath.node;
                if (
                  cn.operator === op &&
                  cn.loc &&
                  node.loc &&
                  cn.loc.start.line === node.loc.start.line &&
                  cn.loc.start.column === node.loc.start.column
                ) {
                  cn.operator = replacement;
                  matched = true;
                }
              }
            });
            return matched;
          },
          origSnippet: getNodeSnippet(node, code),
          mutSnippet: `${getNodeSnippet(node.left, code)} ${replacement} ${getNodeSnippet(node.right, code)}`
        });
        return;
      }

      // ROR & COR: Relational / Comparison operators
      const rorMap = {
        '===': '!==',
        '!==': '===',
        '==': '!=',
        '!=': '==',
        '<': isLoopCondition ? '<=' : '<=',
        '<=': '<',
        '>': '>=',
        '>=': '>'
      };

      if (rorMap[op]) {
        const replacement = rorMap[op];
        const isBoundary = isLoopCondition && (op === '<' || op === '<=');
        candidates.push({
          type: isBoundary ? 'COR' : 'ROR',
          legacyOperator: isBoundary ? 'BOUNDARY_OFF_BY_ONE' : 'RELATIONAL_OPERATOR_REPLACEMENT',
          operatorType: isBoundary ? 'COR' : 'ROR',
          description: isBoundary
            ? `Loop boundary condition altered: "${op}" to "${replacement}"`
            : `Relational comparison altered: "${op}" to "${replacement}"`,
          loc: node.loc,
          apply(astClone) {
            let matched = false;
            traverse(astClone, {
              BinaryExpression(clonePath) {
                if (matched) return;
                const cn = clonePath.node;
                if (
                  cn.operator === op &&
                  cn.loc &&
                  node.loc &&
                  cn.loc.start.line === node.loc.start.line &&
                  cn.loc.start.column === node.loc.start.column
                ) {
                  cn.operator = replacement;
                  matched = true;
                }
              }
            });
            return matched;
          },
          origSnippet: getNodeSnippet(node, code),
          mutSnippet: `${getNodeSnippet(node.left, code)} ${replacement} ${getNodeSnippet(node.right, code)}`
        });
      }
    },

    // -------------------------------------------------------------------------
    // 2. AssignmentExpression: AOR Compound assignment (+=, -=, *=, /=)
    // -------------------------------------------------------------------------
    AssignmentExpression(path) {
      const node = path.node;
      const op = node.operator;
      const compoundAorMap = {
        '+=': '-=',
        '-=': '+=',
        '*=': '/=',
        '/=': '*='
      };

      if (compoundAorMap[op]) {
        const replacement = compoundAorMap[op];
        candidates.push({
          type: 'AOR',
          legacyOperator: 'ARITHMETIC_OPERATOR_REPLACEMENT',
          operatorType: 'AOR',
          description: `Inverted compound arithmetic assignment "${op}" to "${replacement}"`,
          loc: node.loc,
          apply(astClone) {
            let matched = false;
            traverse(astClone, {
              AssignmentExpression(clonePath) {
                if (matched) return;
                const cn = clonePath.node;
                if (
                  cn.operator === op &&
                  cn.loc &&
                  node.loc &&
                  cn.loc.start.line === node.loc.start.line &&
                  cn.loc.start.column === node.loc.start.column
                ) {
                  cn.operator = replacement;
                  matched = true;
                }
              }
            });
            return matched;
          },
          origSnippet: getNodeSnippet(node, code),
          mutSnippet: `${getNodeSnippet(node.left, code)} ${replacement} ${getNodeSnippet(node.right, code)}`
        });
      }
    },

    // -------------------------------------------------------------------------
    // 3. LogicalExpression: LOR (Logical Connector Replacement && <-> ||)
    // -------------------------------------------------------------------------
    LogicalExpression(path) {
      const node = path.node;
      const op = node.operator;
      const lorMap = {
        '&&': '||',
        '||': '&&'
      };

      if (lorMap[op]) {
        const replacement = lorMap[op];
        candidates.push({
          type: 'LOR',
          legacyOperator: 'LOGICAL_CONNECTOR_REPLACEMENT',
          operatorType: 'LOR',
          description: `Swapped logical connector "${op}" with "${replacement}"`,
          loc: node.loc,
          apply(astClone) {
            let matched = false;
            traverse(astClone, {
              LogicalExpression(clonePath) {
                if (matched) return;
                const cn = clonePath.node;
                if (
                  cn.operator === op &&
                  cn.loc &&
                  node.loc &&
                  cn.loc.start.line === node.loc.start.line &&
                  cn.loc.start.column === node.loc.start.column
                ) {
                  cn.operator = replacement;
                  matched = true;
                }
              }
            });
            return matched;
          },
          origSnippet: getNodeSnippet(node, code),
          mutSnippet: `${getNodeSnippet(node.left, code)} ${replacement} ${getNodeSnippet(node.right, code)}`
        });
      }
    },

    // -------------------------------------------------------------------------
    // 4. ForStatement: COR (Loop Boundary Off-By-One & Loop Start Offset)
    // -------------------------------------------------------------------------
    ForStatement(path) {
      const node = path.node;

      // Pattern 1: for (let i = 0; ...) -> change init to i = 1 (BOUNDARY_START_OFFSET)
      if (node.init && node.init.type === 'VariableDeclaration' && node.init.declarations.length > 0) {
        const decl = node.init.declarations[0];
        if (decl.init && decl.init.type === 'NumericLiteral' && decl.init.value === 0) {
          candidates.push({
            type: 'COR',
            legacyOperator: 'BOUNDARY_START_OFFSET',
            operatorType: 'COR',
            description: 'Modified loop start index from 0 to 1, skipping first item',
            loc: decl.init.loc,
            apply(astClone) {
              let matched = false;
              traverse(astClone, {
                ForStatement(clonePath) {
                  if (matched) return;
                  const cInit = clonePath.node.init;
                  if (
                    cInit &&
                    cInit.type === 'VariableDeclaration' &&
                    cInit.declarations[0] &&
                    cInit.declarations[0].init &&
                    cInit.declarations[0].init.type === 'NumericLiteral' &&
                    cInit.declarations[0].init.value === 0 &&
                    node.loc &&
                    clonePath.node.loc &&
                    clonePath.node.loc.start.line === node.loc.start.line
                  ) {
                    cInit.declarations[0].init.value = 1;
                    matched = true;
                  }
                }
              });
              return matched;
            },
            origSnippet: getNodeSnippet(decl, code),
            mutSnippet: `${decl.id.name} = 1`
          });
        }
      }

      // Pattern 2: for (...; i < arr.length; ...) -> i < arr.length - 1 (BOUNDARY_OFF_BY_ONE)
      if (
        node.test &&
        node.test.type === 'BinaryExpression' &&
        node.test.operator === '<' &&
        node.test.right &&
        node.test.right.type === 'MemberExpression' &&
        node.test.right.property.name === 'length'
      ) {
        const testNode = node.test;
        candidates.push({
          type: 'COR',
          legacyOperator: 'BOUNDARY_OFF_BY_ONE',
          operatorType: 'COR',
          description: 'Loop termination changed from "< length" to "< length - 1", skipping final element',
          loc: testNode.loc,
          apply(astClone) {
            let matched = false;
            traverse(astClone, {
              ForStatement(clonePath) {
                if (matched) return;
                const cTest = clonePath.node.test;
                if (
                  cTest &&
                  cTest.type === 'BinaryExpression' &&
                  cTest.operator === '<' &&
                  cTest.right &&
                  cTest.right.type === 'MemberExpression' &&
                  cTest.right.property.name === 'length' &&
                  node.loc &&
                  clonePath.node.loc &&
                  clonePath.node.loc.start.line === node.loc.start.line
                ) {
                  // wrap right with BinaryExpression (arr.length - 1)
                  cTest.right = {
                    type: 'BinaryExpression',
                    operator: '-',
                    left: cTest.right,
                    right: { type: 'NumericLiteral', value: 1 }
                  };
                  matched = true;
                }
              }
            });
            return matched;
          },
          origSnippet: getNodeSnippet(testNode, code),
          mutSnippet: `${getNodeSnippet(testNode.left, code)} < ${getNodeSnippet(testNode.right, code)} - 1`
        });
      }
    },

    // -------------------------------------------------------------------------
    // 5. ReturnStatement: RVR (Return Value Replacement)
    // -------------------------------------------------------------------------
    ReturnStatement(path) {
      const node = path.node;
      const origSnippet = getNodeSnippet(node, code);

      // Case A: Boolean return literal (true <-> false)
      if (node.argument && node.argument.type === 'BooleanLiteral') {
        const currVal = node.argument.value;
        const newVal = !currVal;
        candidates.push({
          type: 'RVR',
          legacyOperator: 'RETURN_VALUE_MUTATION',
          operatorType: 'RVR',
          description: `Inverted boolean return value from "${currVal}" to "${newVal}"`,
          loc: node.loc,
          apply(astClone) {
            let matched = false;
            traverse(astClone, {
              ReturnStatement(clonePath) {
                if (matched) return;
                const cn = clonePath.node;
                if (
                  cn.argument &&
                  cn.argument.type === 'BooleanLiteral' &&
                  cn.argument.value === currVal &&
                  node.loc &&
                  cn.loc &&
                  cn.loc.start.line === node.loc.start.line &&
                  cn.loc.start.column === node.loc.start.column
                ) {
                  cn.argument.value = newVal;
                  matched = true;
                }
              }
            });
            return matched;
          },
          origSnippet,
          mutSnippet: `return ${newVal};`
        });
        return;
      }

      // Case B: Array literal return (e.g. return [i, i] -> return [i, i + 1] or return [])
      if (node.argument && node.argument.type === 'ArrayExpression') {
        if (node.argument.elements.length > 0) {
          candidates.push({
            type: 'RVR',
            legacyOperator: 'RETURN_VALUE_MUTATION',
            operatorType: 'RVR',
            description: 'Modified array return element indices',
            loc: node.loc,
            apply(astClone) {
              let matched = false;
              traverse(astClone, {
                ReturnStatement(clonePath) {
                  if (matched) return;
                  const cn = clonePath.node;
                  if (
                    cn.argument &&
                    cn.argument.type === 'ArrayExpression' &&
                    cn.argument.elements.length > 0 &&
                    node.loc &&
                    cn.loc &&
                    cn.loc.start.line === node.loc.start.line &&
                    cn.loc.start.column === node.loc.start.column
                  ) {
                    const lastIdx = cn.argument.elements.length - 1;
                    const oldEl = cn.argument.elements[lastIdx];
                    cn.argument.elements[lastIdx] = {
                      type: 'BinaryExpression',
                      operator: '+',
                      left: oldEl,
                      right: { type: 'NumericLiteral', value: 1 }
                    };
                    matched = true;
                  }
                }
              });
              return matched;
            },
            origSnippet,
            mutSnippet: `return [..., + 1];`
          });
        }
        return;
      }

      // Case C: Numeric or Identifier return -> return expr + 1
      if (node.argument && (node.argument.type === 'Identifier' || node.argument.type === 'NumericLiteral')) {
        candidates.push({
          type: 'RVR',
          legacyOperator: 'RETURN_VALUE_MUTATION',
          operatorType: 'RVR',
          description: 'Altered return value by adding 1',
          loc: node.loc,
          apply(astClone) {
            let matched = false;
            traverse(astClone, {
              ReturnStatement(clonePath) {
                if (matched) return;
                const cn = clonePath.node;
                if (
                  cn.argument &&
                  (cn.argument.type === 'Identifier' || cn.argument.type === 'NumericLiteral') &&
                  node.loc &&
                  cn.loc &&
                  cn.loc.start.line === node.loc.start.line &&
                  cn.loc.start.column === node.loc.start.column
                ) {
                  cn.argument = {
                    type: 'BinaryExpression',
                    operator: '+',
                    left: cn.argument,
                    right: { type: 'NumericLiteral', value: 1 }
                  };
                  matched = true;
                }
              }
            });
            return matched;
          },
          origSnippet,
          mutSnippet: `return ${node.argument.name || node.argument.value} + 1;`
        });
      }
    }
  });

  const mutants = [];
  const seenCode = new Set();
  seenCode.add(code.trim());
  let mutantId = 1;

  for (const cand of candidates) {
    if (mutants.length >= maxMutants) break;

    // Reparse fresh AST clone for this mutation
    const astClone = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript']
    });

    const applied = cand.apply(astClone);
    if (!applied) continue;

    let mutatedFullCode;
    try {
      const generated = generate(astClone, { retainLines: false, compact: false }, code);
      mutatedFullCode = generated.code;
    } catch {
      continue;
    }

    if (!mutatedFullCode || seenCode.has(mutatedFullCode.trim())) {
      continue;
    }

    // Validate generated mutant by re-parsing
    try {
      parser.parse(mutatedFullCode, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
      });
    } catch {
      // Reject syntactically invalid mutant
      continue;
    }

    seenCode.add(mutatedFullCode.trim());

    mutants.push({
      id: `mut-${mutantId++}`,
      language: 'javascript',
      operator: options.useShortNames ? cand.operatorType : cand.legacyOperator,
      operatorType: cand.operatorType,
      description: cand.description,
      originalLocation: cand.loc ? {
        line: cand.loc.start.line,
        column: cand.loc.start.column,
        endLine: cand.loc.end.line,
        endColumn: cand.loc.end.column
      } : { line: 1, column: 0 },
      originalSnippet: cand.origSnippet,
      mutatedSnippet: cand.mutSnippet,
      mutatedFullCode,
      validationStatus: 'valid'
    });
  }

  return mutants;
};

export default {
  mutateJavaScriptAst
};
