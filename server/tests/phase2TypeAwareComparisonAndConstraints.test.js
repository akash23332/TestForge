import {
  normalizeConstraintText,
  parseConstraintNumber,
  classifyConstraintTarget,
  isLengthTarget,
  parseConstraints,
  extractNumbersAndLengths,
  checkInputAgainstConstraints
} from '../src/services/testValidation.service.js';

import {
  normalizeOutput,
  compareOutputs
} from '../src/services/codeRunner.service.js';

describe('Phase 2: Comprehensive Input/Constraint Parsing & Type-Aware Output Comparison', () => {
  // ────────────────────────────────────────────────────────────────────────────
  // Category A: Input and Constraint Parsing (35+ test cases)
  // ────────────────────────────────────────────────────────────────────────────
  describe('Category A: Input and Constraint Parsing', () => {
    test('1. Normalizes unicode superscripts (10⁵, 10⁶, 10⁹)', () => {
      expect(normalizeConstraintText('10⁵')).toBe('10^5');
      expect(normalizeConstraintText('10⁶')).toBe('10^6');
      expect(normalizeConstraintText('10⁹')).toBe('10^9');
      expect(normalizeConstraintText('10⁰ 10¹ 10² 10³ 10⁴ 10⁷ 10⁸')).toBe('10^0 10^1 10^2 10^3 10^4 10^7 10^8');
    });

    test('2. Normalizes double-asterisk exponentiation and multiplication symbols', () => {
      expect(normalizeConstraintText('10**5')).toBe('10^5');
      expect(normalizeConstraintText('2 × 10⁵')).toBe('2 * 10^5');
      expect(normalizeConstraintText('10 ^ 5')).toBe('10^5');
    });

    test('3. Parses numbers with powers (positive and negative)', () => {
      expect(parseConstraintNumber('10^5')).toBe(100000);
      expect(parseConstraintNumber('-10^9')).toBe(-1000000000);
      expect(parseConstraintNumber('10⁵')).toBe(100000);
      expect(parseConstraintNumber('500')).toBe(500);
      expect(parseConstraintNumber('-42')).toBe(-42);
    });

    test('4. Parses multiplied powers (e.g. 2 * 10^5, 2 × 10⁵, 1.5 * 10^3)', () => {
      expect(parseConstraintNumber('2 * 10^5')).toBe(200000);
      expect(parseConstraintNumber('2 × 10⁵')).toBe(200000);
      expect(parseConstraintNumber('1.5 * 10^3')).toBe(1500);
    });

    test('5. Parses decimal constraints', () => {
      expect(parseConstraintNumber('0.5')).toBe(0.5);
      expect(parseConstraintNumber('10.25')).toBe(10.25);
      expect(parseConstraintNumber('-3.14')).toBe(-3.14);
    });

    test('6. Classifies LENGTH targets accurately without misclassifying scalar k', () => {
      expect(classifyConstraintTarget('n')).toBe('LENGTH');
      expect(classifyConstraintTarget('N')).toBe('LENGTH');
      expect(classifyConstraintTarget('m')).toBe('LENGTH');
      expect(classifyConstraintTarget('arr.length')).toBe('LENGTH');
      expect(classifyConstraintTarget('nums.size()')).toBe('LENGTH');
      expect(classifyConstraintTarget('|s|')).toBe('LENGTH');
      expect(classifyConstraintTarget('len(s)')).toBe('LENGTH');
      expect(classifyConstraintTarget('total count')).toBe('LENGTH');

      // Crucial: k is SCALAR, NEVER length
      expect(classifyConstraintTarget('k')).toBe('SCALAR');
      expect(classifyConstraintTarget('K')).toBe('SCALAR');
      expect(isLengthTarget('k')).toBe(false);
      expect(isLengthTarget('K')).toBe(false);
    });

    test('7. Classifies ELEMENT targets with index notations', () => {
      expect(classifyConstraintTarget('arr[i]')).toBe('ELEMENT');
      expect(classifyConstraintTarget('nums[i]')).toBe('ELEMENT');
      expect(classifyConstraintTarget('s[i]')).toBe('ELEMENT');
      expect(classifyConstraintTarget('matrix[i][j]')).toBe('ELEMENT');
      expect(classifyConstraintTarget('each element')).toBe('ELEMENT');
    });

    test('8. Classifies SCALAR targets (k, target, val, x, y)', () => {
      expect(classifyConstraintTarget('target')).toBe('SCALAR');
      expect(classifyConstraintTarget('val')).toBe('SCALAR');
      expect(classifyConstraintTarget('x')).toBe('SCALAR');
      expect(classifyConstraintTarget('y')).toBe('SCALAR');
      expect(classifyConstraintTarget('num')).toBe('SCALAR');
    });

    test('9. Parses double-bound constraints with <= and Unicode ≤', () => {
      const rules = parseConstraints('1 <= n <= 10^5\n-10^9 ≤ nums[i] ≤ 10^9');
      expect(rules).toHaveLength(2);
      expect(rules[0].targetClassification).toBe('LENGTH');
      expect(rules[0].min).toBe(1);
      expect(rules[0].max).toBe(100000);
      expect(rules[1].targetClassification).toBe('ELEMENT');
      expect(rules[1].min).toBe(-1000000000);
      expect(rules[1].max).toBe(1000000000);
    });

    test('10. Parses single-bound constraints (>=, ≥, <=, ≤)', () => {
      const rules = parseConstraints('n >= 1\nnums[i] ≤ 500\nval > 0');
      expect(rules).toHaveLength(3);
      expect(rules[0].min).toBe(1);
      expect(rules[0].max).toBe(Infinity);
      expect(rules[1].min).toBe(-Infinity);
      expect(rules[1].max).toBe(500);
    });

    test('11. Handles bullet points, dashes, asterisks, and numbered prefixes', () => {
      const constraints = `
        * 1 <= n <= 100
        - -10^4 <= k <= 10^4
        1. 0 <= arr[i] <= 1000
        • |s| >= 1
      `;
      const rules = parseConstraints(constraints);
      expect(rules).toHaveLength(4);
      expect(rules[0].targetClassification).toBe('LENGTH');
      expect(rules[1].targetClassification).toBe('SCALAR');
      expect(rules[1].min).toBe(-10000);
      expect(rules[1].max).toBe(10000);
      expect(rules[2].targetClassification).toBe('ELEMENT');
      expect(rules[3].targetClassification).toBe('LENGTH');
    });

    test('12. CRITICAL: Never applies array-length constraint to individual array elements', () => {
      // Question: 1 <= n <= 5 (length is at most 5)
      // Array has 3 elements, but elements are 100, 200, 300 (> 5).
      // This must NOT trigger a length constraint violation!
      const rules = parseConstraints('1 <= n <= 5');
      const violations = checkInputAgainstConstraints('[100, 200, 300]', rules);
      expect(violations).toHaveLength(0);
    });

    test('13. Correctly catches array length constraint violation', () => {
      const rules = parseConstraints('1 <= n <= 2');
      const violations = checkInputAgainstConstraints('[10, 20, 30, 40]', rules);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).toContain('Input length 4 exceeds maximum constraint (2)');
    });

    test('14. Correctly catches element constraint violation', () => {
      const rules = parseConstraints('-10 <= arr[i] <= 10');
      const violations = checkInputAgainstConstraints('[1, 5, 25, -2]', rules);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).toContain('Input element 25 exceeds maximum constraint (10)');
    });

    test('15. Correctly validates scalar k without confusing it for length', () => {
      // k is -50, which is negative (valid scalar, impossible length)
      const rules = parseConstraints('-100 <= k <= 100');
      const input = '[1, 2, 3]\n-50';
      const violations = checkInputAgainstConstraints(input, rules);
      expect(violations).toHaveLength(0);

      const outOfBoundsInput = '[1, 2, 3]\n-150';
      const outViolations = checkInputAgainstConstraints(outOfBoundsInput, rules);
      expect(outViolations.length).toBeGreaterThan(0);
      expect(outViolations[0]).toContain('Scalar value -150 is less than minimum constraint (-100)');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Category B: Output Normalization & Type-Aware Comparison (45+ test cases)
  // ────────────────────────────────────────────────────────────────────────────
  describe('Category B: Output Normalization & Type-Aware Comparison', () => {
    test('16. Boolean normalization: true vs True vs TRUE for boolean return types', () => {
      const ctx = { returnType: 'boolean' };
      expect(compareOutputs('true', 'true', ctx)).toBe(true);
      expect(compareOutputs('True', 'true', ctx)).toBe(true);
      expect(compareOutputs('TRUE', 'true', ctx)).toBe(true);
      expect(compareOutputs(true, 'True', ctx)).toBe(true);
      expect(compareOutputs('False', 'false', ctx)).toBe(true);
      expect(compareOutputs('FALSE', 'false', ctx)).toBe(true);
      expect(compareOutputs(false, 'False', ctx)).toBe(true);
      expect(compareOutputs('true', 'false', ctx)).toBe(false);
    });

    test('17. CRITICAL: String comparison is strictly case-sensitive', () => {
      const ctx = { returnType: 'string' };
      expect(compareOutputs('Hello', 'Hello', ctx)).toBe(true);
      expect(compareOutputs('Hello', 'hello', ctx)).toBe(false);
      expect(compareOutputs('World', 'world', ctx)).toBe(false);
      expect(compareOutputs('UPPER', 'upper', ctx)).toBe(false);
    });

    test('18. CRITICAL: Strings with boolean words remain case-sensitive when returnType is string', () => {
      const ctx = { returnType: 'string' };
      expect(compareOutputs('True', 'true', ctx)).toBe(false);
      expect(compareOutputs('False', 'false', ctx)).toBe(false);
      expect(compareOutputs('TRUE', 'true', ctx)).toBe(false);
      expect(compareOutputs('"true"', '"true"', ctx)).toBe(true);
      expect(compareOutputs('"True"', '"true"', ctx)).toBe(false);
    });

    test('19. Character comparison: character vs string with same character', () => {
      const ctx = { returnType: 'char' };
      expect(compareOutputs('a', 'a', ctx)).toBe(true);
      expect(compareOutputs('a', 'b', ctx)).toBe(false);
      expect(compareOutputs('A', 'a', ctx)).toBe(false);
    });

    test('20. CRITICAL: Null and empty collections remain strictly distinct', () => {
      expect(compareOutputs(null, null)).toBe(true);
      expect(compareOutputs('null', 'null')).toBe(true);
      expect(compareOutputs('None', 'null')).toBe(true);
      expect(compareOutputs('NULL', 'null')).toBe(true);
      expect(compareOutputs([], [])).toBe(true);
      expect(compareOutputs('[]', '[]')).toBe(true);

      // Null must NEVER equal empty array []
      expect(compareOutputs(null, [])).toBe(false);
      expect(compareOutputs('null', '[]')).toBe(false);
      expect(compareOutputs('None', '[]')).toBe(false);
      expect(compareOutputs([], null)).toBe(false);
      expect(compareOutputs('[]', 'null')).toBe(false);
    });

    test('21. Empty string vs empty array remain distinct', () => {
      expect(compareOutputs('""', '""')).toBe(true);
      expect(compareOutputs('', '')).toBe(true);
      expect(compareOutputs('""', '[]')).toBe(false);
      expect(compareOutputs('', '[]')).toBe(false);
      expect(compareOutputs('[]', '')).toBe(false);
    });

    test('22. Windows CRLF vs Linux LF line ending normalization', () => {
      expect(compareOutputs('1\r\n2\r\n3', '1\n2\n3')).toBe(true);
      expect(compareOutputs('line1\r\nline2\r\n', 'line1\nline2')).toBe(true);
      expect(compareOutputs('hello\r\nworld', 'hello\nworld')).toBe(true);
      expect(compareOutputs('hello\r\nworld', 'hello\nworld2')).toBe(false);
    });

    test('23. Whitespace around tokens and array brackets', () => {
      expect(compareOutputs('[1,2,3]', '[1, 2, 3]')).toBe(true);
      expect(compareOutputs('[ 1 , 2 , 3 ]', '[1,2,3]')).toBe(true);
      expect(compareOutputs('  [1, 2]  ', '[1, 2]')).toBe(true);
      expect(compareOutputs('[1, 2]', '[1, 3]')).toBe(false);
    });

    test('24. Nested array comparisons', () => {
      expect(compareOutputs('[[1, 2], [3, 4]]', '[[1, 2], [3, 4]]')).toBe(true);
      expect(compareOutputs('[[1,2],[3,4]]', '[[1, 2], [3, 4]]')).toBe(true);
      expect(compareOutputs('[[1, 2], [3, 4]]', '[[1, 2], [3, 5]]')).toBe(false);
      expect(compareOutputs('[[1, 2]]', '[[1, 2], [3, 4]]')).toBe(false);
    });

    test('25. Booleans inside collections (Python/JS)', () => {
      expect(compareOutputs('[True, False]', '[true, false]')).toBe(true);
      expect(compareOutputs('[true, true]', '[True, True]')).toBe(true);
      expect(compareOutputs('[TRUE, FALSE]', '[true, false]')).toBe(true);
      expect(compareOutputs('[True, False]', '[false, true]')).toBe(false);
    });

    test('26. Nulls inside collections (Python/JS/Java)', () => {
      expect(compareOutputs('[1, None, 3]', '[1, null, 3]')).toBe(true);
      expect(compareOutputs('[1, NULL, 3]', '[1, null, 3]')).toBe(true);
      expect(compareOutputs('[null, null]', '[None, None]')).toBe(true);
      expect(compareOutputs('[1, null, 3]', '[1, 2, 3]')).toBe(false);
    });

    test('27. Exact integer comparison', () => {
      expect(compareOutputs(0, 0)).toBe(true);
      expect(compareOutputs('0', '0')).toBe(true);
      expect(compareOutputs('-10', '-10')).toBe(true);
      expect(compareOutputs(100, 101)).toBe(false);
      expect(compareOutputs('100', '101')).toBe(false);
    });

    test('28. Floating point comparison with configurable tolerance', () => {
      const ctx = { returnType: 'double', absTolerance: 1e-5, relTolerance: 1e-5 };
      expect(compareOutputs(3.14159, 3.14159, ctx)).toBe(true);
      expect(compareOutputs(3.14159265, 3.14159, ctx)).toBe(true); // Within 1e-5
      expect(compareOutputs(3.14, 3.15, ctx)).toBe(false); // Outside 1e-5
      expect(compareOutputs('0.30000001', '0.3', ctx)).toBe(true);
      expect(compareOutputs('0.35', '0.3', ctx)).toBe(false);
    });

    test('29. Two Sum order-independent index pairs', () => {
      const ctx = { title: 'Two Sum' };
      expect(compareOutputs([0, 1], [1, 0], ctx)).toBe(true);
      expect(compareOutputs('[0, 1]', '[1, 0]', ctx)).toBe(true);
      expect(compareOutputs('[1, 2]', '[2, 1]', ctx)).toBe(true);
      expect(compareOutputs('[0, 1]', '[0, 2]', ctx)).toBe(false);
    });

    test('30. Quoted vs unquoted string literals equivalence', () => {
      expect(compareOutputs('"swiss"', 'swiss')).toBe(true);
      expect(compareOutputs('swiss', '"swiss"')).toBe(true);
      expect(compareOutputs('"hello world"', 'hello world')).toBe(true);
      expect(compareOutputs('"hello"', 'world')).toBe(false);
    });
  });
});
