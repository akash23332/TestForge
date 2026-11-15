import * as parser from '@babel/parser';
import { generateMutants, evaluateMutants, calculateMutationScore } from '../src/services/mutation.service.js';
import { mutateJavaScriptAst } from '../src/services/mutation/ast/jsMutator.js';
import { mutatePythonAstSync } from '../src/services/mutation/ast/pyMutator.js';

describe('Phase 1: AST-Based Mutation Testing Engine (JavaScript & Python)', () => {
  // ---------------------------------------------------------------------------
  // 1. JavaScript AST Mutation Suite
  // ---------------------------------------------------------------------------
  describe('JavaScript AST Mutator (@babel)', () => {
    test('1. Arithmetic operators are mutated correctly (AOR)', () => {
      const code = `function calculate(a, b) {
        let sum = a + b;
        let diff = a - b;
        let prod = a * b;
        sum += 10;
        return sum;
      }`;
      const mutants = mutateJavaScriptAst(code, { maxMutants: 20 });
      const aorMutants = mutants.filter((m) => m.operatorType === 'AOR');
      expect(aorMutants.length).toBeGreaterThanOrEqual(3);

      const snippets = aorMutants.map((m) => m.mutatedSnippet);
      expect(snippets.some((s) => s.includes('-') && !s.includes('+'))).toBe(true);
      expect(snippets.some((s) => s.includes('+'))).toBe(true);
      expect(snippets.some((s) => s.includes('-='))).toBe(true);

      // Verify metadata schema
      for (const m of aorMutants) {
        expect(m.id).toMatch(/^mut-\d+$/);
        expect(m.language).toBe('javascript');
        expect(m.operatorType).toBe('AOR');
        expect(m.validationStatus).toBe('valid');
        expect(m.originalLocation).toHaveProperty('line');
        expect(m.originalLocation).toHaveProperty('column');
      }
    });

    test('2. Relational operators are mutated correctly (ROR)', () => {
      const code = `function compare(x, y) {
        if (x === y) return 0;
        if (x < y) return -1;
        if (x > y) return 1;
        return 0;
      }`;
      const mutants = mutateJavaScriptAst(code, { maxMutants: 10 });
      const rorMutants = mutants.filter((m) => m.operatorType === 'ROR');
      expect(rorMutants.length).toBeGreaterThanOrEqual(2);

      const snippets = rorMutants.map((m) => m.mutatedSnippet);
      expect(snippets.some((s) => s.includes('!=='))).toBe(true);
      expect(snippets.some((s) => s.includes('<='))).toBe(true);
      expect(snippets.some((s) => s.includes('>='))).toBe(true);
    });

    test('3. Logical operators are mutated correctly (LOR)', () => {
      const code = `function check(a, b, c) {
        if (a && b) return true;
        if (b || c) return false;
        return false;
      }`;
      const mutants = mutateJavaScriptAst(code, { maxMutants: 10 });
      const lorMutants = mutants.filter((m) => m.operatorType === 'LOR');
      expect(lorMutants.length).toBeGreaterThanOrEqual(2);

      const snippets = lorMutants.map((m) => m.mutatedSnippet);
      expect(snippets.some((s) => s.includes('||'))).toBe(true);
      expect(snippets.some((s) => s.includes('&&'))).toBe(true);
    });

    test('4. Conditional boundaries are mutated correctly (COR)', () => {
      const code = `function iterate(arr) {
        let total = 0;
        for (let i = 0; i < arr.length; i++) {
          total += arr[i];
        }
        return total;
      }`;
      const mutants = mutateJavaScriptAst(code, { maxMutants: 10 });
      const corMutants = mutants.filter((m) => m.operatorType === 'COR');
      expect(corMutants.length).toBeGreaterThanOrEqual(2);

      const snippets = corMutants.map((m) => m.mutatedSnippet);
      // Boundary start offset (i = 0 -> i = 1)
      expect(snippets.some((s) => s.includes('i = 1'))).toBe(true);
      // Boundary off-by-one (arr.length - 1 or <=)
      expect(snippets.some((s) => s.includes('length - 1') || s.includes('<='))).toBe(true);
    });

    test('5. Return expressions are mutated correctly (RVR)', () => {
      const code = `function solve(flag, x) {
        if (flag) {
          return true;
        }
        if (x > 0) {
          return [0, 1];
        }
        return x;
      }`;
      const mutants = mutateJavaScriptAst(code, { maxMutants: 10 });
      const rvrMutants = mutants.filter((m) => m.operatorType === 'RVR');
      expect(rvrMutants.length).toBeGreaterThanOrEqual(2);

      const descriptions = rvrMutants.map((m) => m.description);
      expect(descriptions.some((d) => d.includes('Inverted boolean return value'))).toBe(true);
      expect(descriptions.some((d) => d.includes('array return') || d.includes('return value'))).toBe(true);
    });

    test('6. Comments remain unchanged', () => {
      const code = `function withComments(n) {
        // Operator in comment should never be mutated: a + b === c && d
        /* Block comment:
           x - y < z || w
        */
        const res = n + 1;
        return res;
      }`;
      const mutants = mutateJavaScriptAst(code, { maxMutants: 10 });
      for (const m of mutants) {
        expect(m.mutatedFullCode).toContain('// Operator in comment should never be mutated: a + b === c && d');
        expect(m.mutatedFullCode).toContain('x - y < z || w');
      }
    });

    test('7. String literals remain unchanged', () => {
      const code = `function formatOutput(x) {
        const msg = "Score: a + b < c && d == e";
        const template = \`Result: \${x + 1} and < > +\`;
        return msg;
      }`;
      const mutants = mutateJavaScriptAst(code, { maxMutants: 10 });
      for (const m of mutants) {
        expect(m.mutatedFullCode).toContain('"Score: a + b < c && d == e"');
      }
    });

    test('8. Multiple eligible locations generate separate mutants', () => {
      const code = `function multi(a, b, c) {
        const step1 = a + 1;
        const step2 = b - 2;
        const step3 = c * 3;
        return step1;
      }`;
      const mutants = mutateJavaScriptAst(code, { maxMutants: 10 });
      const lines = mutants.map((m) => m.originalLocation.line);
      const uniqueLines = new Set(lines);
      expect(uniqueLines.size).toBeGreaterThanOrEqual(3);
    });

    test('9. Duplicate mutants are rejected', () => {
      const code = `function sample(a) {
        return a + 1;
      }`;
      const mutants = mutateJavaScriptAst(code, { maxMutants: 10 });
      const codes = mutants.map((m) => m.mutatedFullCode.trim());
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
      expect(uniqueCodes.has(code.trim())).toBe(false);
    });

    test('10. Invalid JavaScript source produces a controlled error', () => {
      const brokenCode = `function invalid( { let x = 1;`;
      expect(() => {
        mutateJavaScriptAst(brokenCode);
      }).toThrow(/\[JavaScript AST Mutator\] Syntax error parsing source code/);
    });

    test('11. Every generated JavaScript mutant passes syntax validation', () => {
      const code = `function twoSum(nums, target) {
        const map = new Map();
        for (let i = 0; i < nums.length; i++) {
          const complement = target - nums[i];
          if (map.has(complement)) {
            return [map.get(complement), i];
          }
          map.set(nums[i], i);
        }
        return [];
      }`;
      const mutants = mutateJavaScriptAst(code, { maxMutants: 10 });
      expect(mutants.length).toBeGreaterThan(0);
      for (const m of mutants) {
        expect(m.validationStatus).toBe('valid');
        // Double check re-parsing
        expect(() => {
          parser.parse(m.mutatedFullCode, { sourceType: 'module' });
        }).not.toThrow();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Python AST Mutation Suite
  // ---------------------------------------------------------------------------
  describe('Python AST Mutator (ast.NodeVisitor / ast.unparse)', () => {
    test('1. Arithmetic operators are mutated correctly (AOR)', () => {
      const pyCode = `def compute(a, b):
    diff = a - b
    prod = a * b
    total = a + b
    total += 5
    return total`;

      const mutants = mutatePythonAstSync(pyCode, { maxMutants: 10 });
      const aorMutants = mutants.filter((m) => m.operatorType === 'AOR');
      expect(aorMutants.length).toBeGreaterThanOrEqual(3);

      const snippets = aorMutants.map((m) => m.mutatedSnippet);
      expect(snippets.some((s) => s.includes('+'))).toBe(true);
      expect(snippets.some((s) => s.includes('-'))).toBe(true);

      for (const m of aorMutants) {
        expect(m.id).toMatch(/^mut-\d+$/);
        expect(m.language).toBe('python');
        expect(m.operatorType).toBe('AOR');
        expect(m.validationStatus).toBe('valid');
        expect(m.originalLocation).toHaveProperty('line');
        expect(m.originalLocation).toHaveProperty('column');
      }
    });

    test('2. Relational operators are mutated correctly (ROR)', () => {
      const pyCode = `def check_rel(x, y):
    if x == y:
        return True
    if x < y:
        return False
    if x > y:
        return True
    return False`;

      const mutants = mutatePythonAstSync(pyCode, { maxMutants: 10 });
      const rorMutants = mutants.filter((m) => m.operatorType === 'ROR');
      expect(rorMutants.length).toBeGreaterThanOrEqual(2);

      const snippets = rorMutants.map((m) => m.mutatedSnippet);
      expect(snippets.some((s) => s.includes('!='))).toBe(true);
      expect(snippets.some((s) => s.includes('>='))).toBe(true);
    });

    test('3. Logical operators are mutated correctly (LOR)', () => {
      const pyCode = `def logic_gate(a, b, c):
    if a and b:
        return True
    if b or c:
        return False
    if not a:
        return True
    return False`;

      const mutants = mutatePythonAstSync(pyCode, { maxMutants: 10 });
      const lorMutants = mutants.filter((m) => m.operatorType === 'LOR');
      expect(lorMutants.length).toBeGreaterThanOrEqual(2);

      const snippets = lorMutants.map((m) => m.mutatedSnippet);
      expect(snippets.some((s) => s.includes(' or '))).toBe(true);
      expect(snippets.some((s) => s.includes(' and '))).toBe(true);
    });

    test('4. Conditional boundaries are mutated correctly (COR)', () => {
      const pyCode = `def loop_sum(nums):
    total = 0
    for i in range(len(nums)):
        total += nums[i]
    return total`;

      const mutants = mutatePythonAstSync(pyCode, { maxMutants: 10 });
      const corMutants = mutants.filter((m) => m.operatorType === 'COR');
      expect(corMutants.length).toBeGreaterThanOrEqual(2);

      const snippets = corMutants.map((m) => m.mutatedSnippet);
      expect(snippets.some((s) => s.includes('len(nums) - 1'))).toBe(true);
      expect(snippets.some((s) => s.includes('1, len(nums)'))).toBe(true);
    });

    test('5. Return expressions are mutated correctly (RVR)', () => {
      const pyCode = `def return_vals(flag, x):
    if flag:
        return True
    if x > 0:
        return [0, 1]
    return False`;

      const mutants = mutatePythonAstSync(pyCode, { maxMutants: 10 });
      const rvrMutants = mutants.filter((m) => m.operatorType === 'RVR');
      expect(rvrMutants.length).toBeGreaterThanOrEqual(2);

      const descriptions = rvrMutants.map((m) => m.description);
      expect(descriptions.some((d) => d.includes('Inverted boolean return value'))).toBe(true);
    });

    test('6. Python comments remain unchanged', () => {
      const pyCode = `def with_comments(n):
    # Operator in comment: a + b == c and d < e
    # Another comment: x - y or z
    res = n + 1
    return res`;

      const mutants = mutatePythonAstSync(pyCode, { maxMutants: 10 });
      for (const m of mutants) {
        expect(m.mutatedFullCode).not.toContain('a - b');
        expect(m.mutatedFullCode).not.toContain('x + y');
      }
    });

    test('7. Python string literals remain unchanged', () => {
      const pyCode = `def string_func(x):
    msg = "Do not mutate a + b < c or d == 0"
    return msg`;

      const mutants = mutatePythonAstSync(pyCode, { maxMutants: 10 });
      for (const m of mutants) {
        expect(m.mutatedFullCode).toMatch(/['"]Do not mutate a \+ b < c or d == 0['"]/);
      }
    });

    test('8. Python multiple eligible locations generate separate mutants', () => {
      const pyCode = `def multi_calc(a, b, c):
    x = a + 1
    y = b - 2
    z = c * 3
    return x`;

      const mutants = mutatePythonAstSync(pyCode, { maxMutants: 10 });
      const lines = mutants.map((m) => m.originalLocation.line);
      const uniqueLines = new Set(lines);
      expect(uniqueLines.size).toBeGreaterThanOrEqual(3);
    });

    test('9. Python duplicate mutants are rejected', () => {
      const pyCode = `def simple(n):
    return n + 1`;

      const mutants = mutatePythonAstSync(pyCode, { maxMutants: 10 });
      const codes = mutants.map((m) => m.mutatedFullCode.trim());
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
      expect(uniqueCodes.has(pyCode.trim())).toBe(false);
    });

    test('10. Invalid Python source produces a controlled error', () => {
      const brokenCode = `def invalid(:\n    pass\n`;
      expect(() => {
        mutatePythonAstSync(brokenCode);
      }).toThrow(/Python SyntaxError/);
    });

    test('11. Every generated Python mutant passes syntax compilation', () => {
      const pyCode = `def two_sum(nums, target):
    for i in range(len(nums)):
        val = target - nums[i]
        if val == 0:
            return True
    return False`;

      const mutants = mutatePythonAstSync(pyCode, { maxMutants: 10 });
      expect(mutants.length).toBeGreaterThan(0);
      for (const m of mutants) {
        expect(m.validationStatus).toBe('valid');
        expect(m.mutatedFullCode).toBeTruthy();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Representative End-to-End FUNCTION-Mode Verification
  // ---------------------------------------------------------------------------
  describe('Representative FUNCTION-Mode Execution Evaluation', () => {
    test('JavaScript Two Sum function: executes mutants against test cases and calculates score', async () => {
      const jsCode = `function twoSum(nums, target) {
        const map = new Map();
        for (let i = 0; i < nums.length; i++) {
          const complement = target - nums[i];
          if (map.has(complement)) {
            return [map.get(complement), i];
          }
          map.set(nums[i], i);
        }
        return [];
      }`;

      const testCases = [
        { input: '[2, 7, 11, 15], 9', expectedOutput: '[0, 1]', category: 'sample' },
        { input: '[3, 2, 4], 6', expectedOutput: '[1, 2]', category: 'sample' },
        { input: '[3, 3], 6', expectedOutput: '[0, 1]', category: 'edge_case' }
      ];

      const evaluated = await evaluateMutants({
        referenceCode: jsCode,
        testCases,
        questionContext: { language: 'javascript', title: 'Two Sum' }
      });

      expect(evaluated.length).toBeGreaterThan(0);
      const killed = evaluated.filter((m) => m.status === 'killed').length;
      const survived = evaluated.filter((m) => m.status === 'survived').length;
      const score = calculateMutationScore(killed, survived);

      expect(killed).toBeGreaterThan(0);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    }, 30000);

    test('Python Two Sum function: executes mutants against test cases and calculates score', async () => {
      const pyCode = `def two_sum(nums, target):
    seen = {}
    for i in range(len(nums)):
        comp = target - nums[i]
        if comp in seen:
            return [seen[comp], i]
        seen[nums[i]] = i
    return []`;

      const testCases = [
        { input: '[2, 7, 11, 15], 9', expectedOutput: '[0, 1]', category: 'sample' },
        { input: '[3, 2, 4], 6', expectedOutput: '[1, 2]', category: 'sample' },
        { input: '[3, 3], 6', expectedOutput: '[0, 1]', category: 'edge_case' }
      ];

      const evaluated = await evaluateMutants({
        referenceCode: pyCode,
        testCases,
        questionContext: { language: 'python', title: 'Two Sum' }
      });

      expect(evaluated.length).toBeGreaterThan(0);
      const killed = evaluated.filter((m) => m.status === 'killed').length;
      const survived = evaluated.filter((m) => m.status === 'survived').length;
      const score = calculateMutationScore(killed, survived);

      expect(killed).toBeGreaterThan(0);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    }, 30000);
  });
});
