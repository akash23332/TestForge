import { TestCase } from '../models/TestCase.js';
import { Question } from '../models/Question.js';
import { ApiError } from '../utils/apiError.js';
import { validateSingleTestCase } from './codeRunner.service.js';

/**
 * TestForge Teacher Question Validation Service
 * Evaluates reference solutions, test case input/output integrity,
 * constraint boundaries, edge-case quality, and publishing readiness.
 */

/**
 * Normalizes unicode superscripts, exponentiation, and bullet markers in constraint text.
 */
export const normalizeConstraintText = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/⁰/g, '^0')
    .replace(/¹/g, '^1')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4')
    .replace(/⁵/g, '^5')
    .replace(/⁶/g, '^6')
    .replace(/⁷/g, '^7')
    .replace(/⁸/g, '^8')
    .replace(/⁹/g, '^9')
    .replace(/\*\*/g, '^');
};

/**
 * Parses numeric bounds including power notation (e.g., "10^5", "10⁵", "-10^9", "500").
 */
export const parseConstraintNumber = (str) => {
  if (!str) return NaN;
  const s = normalizeConstraintText(str.trim().replace(/,/g, ''));
  const isNegative = s.startsWith('-');
  const cleanS = isNegative ? s.slice(1).trim() : s;
  const powMatch = cleanS.match(/^(\d+)\^([+-]?\d+)$/);
  if (powMatch) {
    const base = Number(powMatch[1]);
    const exp = Number(powMatch[2]);
    const val = Math.pow(base, exp);
    return isNegative ? -val : val;
  }
  return Number(s);
};

/**
 * Determines whether a constraint target represents a sequence/array/string length or count.
 */
export const isLengthTarget = (targetVar) => {
  if (!targetVar) return false;
  const t = targetVar.trim().toLowerCase();
  return (
    t.includes('|') ||
    t.includes('length') ||
    t.includes('size') ||
    t.includes('.len') ||
    t.includes('count') ||
    /^n$/i.test(t) ||
    /^m$/i.test(t) ||
    /^k$/i.test(t) ||
    /^len$/i.test(t) ||
    /\|\s*[a-z0-9_]+\s*\|/i.test(t)
  );
};

/**
 * Parses numeric and length constraints from the question constraints string.
 * Uses the actual question constraints text. Never invents constraints.
 */
export const parseConstraints = (constraintsStr) => {
  if (!constraintsStr || typeof constraintsStr !== 'string') {
    return [];
  }

  const rules = [];
  const lines = constraintsStr.split(/\r?\n|;/);

  const numPattern = `[+-]?\\d+(?:\\^[+-]?\\d+)?`;
  const varPattern = `[a-zA-Z0-9_\\[\\]|\\s,().-]+?`;

  const doubleBoundRegex = new RegExp(
    `(${numPattern})\\s*(?:<=|≤|<)\\s*(${varPattern})\\s*(?:<=|≤|<)\\s*(${numPattern})`
  );
  const minBoundRegex = new RegExp(
    `(${varPattern})\\s*(?:>=|≥|>)\\s*(${numPattern})`
  );
  const maxBoundRegex = new RegExp(
    `(${varPattern})\\s*(?:<=|≤|<)\\s*(${numPattern})`
  );

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    // Strip leading bullets, markdown dashes, asterisks only if followed by space (preserve negative numbers)
    line = line.replace(/^(?:[-*•–—]\s+|\d+\.\s+)/, '').trim();
    if (!line) continue;

    const normalizedLine = normalizeConstraintText(line);

    // Pattern 1: A <= X <= B or A ≤ X ≤ B
    const doubleBoundMatch = normalizedLine.match(doubleBoundRegex);
    if (doubleBoundMatch) {
      const minVal = parseConstraintNumber(doubleBoundMatch[1]);
      const targetVar = doubleBoundMatch[2].trim();
      const maxVal = parseConstraintNumber(doubleBoundMatch[3]);
      if (!isNaN(minVal) && !isNaN(maxVal)) {
        rules.push({
          type: isLengthTarget(targetVar) ? 'LENGTH' : 'VALUE',
          target: targetVar,
          min: minVal,
          max: maxVal,
          raw: rawLine.trim()
        });
        continue;
      }
    }

    // Pattern 2: X >= A or X ≥ A
    const minBoundMatch = normalizedLine.match(minBoundRegex);
    if (minBoundMatch) {
      const targetVar = minBoundMatch[1].trim();
      const minVal = parseConstraintNumber(minBoundMatch[2]);
      if (!isNaN(minVal)) {
        rules.push({
          type: isLengthTarget(targetVar) ? 'LENGTH' : 'VALUE',
          target: targetVar,
          min: minVal,
          max: Infinity,
          raw: rawLine.trim()
        });
        continue;
      }
    }

    // Pattern 3: X <= B or X ≤ B
    const maxBoundMatch = normalizedLine.match(maxBoundRegex);
    if (maxBoundMatch) {
      const targetVar = maxBoundMatch[1].trim();
      const maxVal = parseConstraintNumber(maxBoundMatch[2]);
      if (!isNaN(maxVal)) {
        rules.push({
          type: isLengthTarget(targetVar) ? 'LENGTH' : 'VALUE',
          target: targetVar,
          min: -Infinity,
          max: maxVal,
          raw: rawLine.trim()
        });
      }
    }
  }

  return rules;
};

/**
 * Extracts numbers and line/array lengths from test input text.
 */
export const extractNumbersAndLengths = (inputStr) => {
  if (typeof inputStr !== 'string') return { numbers: [], lengths: [], raw: String(inputStr) };

  const numbers = [];
  const numMatches = inputStr.matchAll(/(?:\b|(?<=\s|^|[\[,(]))([+-]?\d+(?:\.\d+)?)(?:\b|(?=\s|$|[\]),]))/g);
  for (const m of numMatches) {
    const val = Number(m[1]);
    if (!isNaN(val)) numbers.push(val);
  }

  const lines = inputStr.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const lengths = [];

  // Extract JSON/bracketed arrays (e.g. "[12, 35, 1, 10, 34, 1]")
  const arrayMatches = inputStr.match(/\[([\s\S]*?)\]/g);
  if (arrayMatches && arrayMatches.length > 0) {
    for (const arrStr of arrayMatches) {
      try {
        const parsed = JSON.parse(arrStr);
        if (Array.isArray(parsed)) {
          lengths.push(parsed.length);
        }
      } catch {
        const items = arrStr.slice(1, -1).split(',').filter((x) => x.trim().length > 0);
        lengths.push(items.length);
      }
    }
  }

  // If no explicit bracketed arrays, record line lengths
  if (lengths.length === 0) {
    for (const l of lines) {
      lengths.push(l.trim().length);
    }
  }

  return { numbers, lengths, lines };
};

/**
 * Validates a single test case input against extracted constraints.
 */
export const checkInputAgainstConstraints = (inputStr, rules) => {
  const violations = [];
  if (!rules || rules.length === 0) return violations;

  const { numbers, lengths } = extractNumbersAndLengths(inputStr);

  for (const rule of rules) {
    if (rule.type === 'VALUE') {
      for (const num of numbers) {
        if (rule.min !== -Infinity && num < rule.min) {
          violations.push(`Input value ${num} is less than minimum constraint (${rule.min}) in rule: "${rule.raw}"`);
        } else if (rule.max !== Infinity && num > rule.max) {
          violations.push(`Input value ${num} exceeds maximum constraint (${rule.max}) in rule: "${rule.raw}"`);
        }
      }
    } else if (rule.type === 'LENGTH') {
      for (const len of lengths) {
        if (rule.min !== -Infinity && len < rule.min) {
          violations.push(`Input length ${len} is less than minimum constraint (${rule.min}) in rule: "${rule.raw}"`);
        } else if (rule.max !== Infinity && len > rule.max) {
          violations.push(`Input length ${len} exceeds maximum constraint (${rule.max}) in rule: "${rule.raw}"`);
        }
      }
    }
  }

  return violations;
};

/**
 * Detects duplicate test cases by normalized input.
 */
export const detectDuplicateTestCases = (testCases) => {
  const seenInputs = new Map();
  const duplicates = [];

  for (const tc of testCases) {
    const norm = String(tc.input || '').trim().replace(/\r\n/g, '\n');
    if (seenInputs.has(norm)) {
      duplicates.push({
        testCaseId: tc._id,
        duplicateOf: seenInputs.get(norm),
        input: tc.input
      });
    } else {
      seenInputs.set(norm, tc._id);
    }
  }

  return duplicates;
};

/**
 * Analyzes scenario coverage across the test suite.
 */
export const analyzeScenarioCoverage = (testCases, rules = []) => {
  const scenarios = {
    hasZero: false,
    hasNegative: false,
    hasMinBoundary: false,
    hasMaxBoundary: false,
    hasEmptyOrSingle: false,
    hasSample: false,
    hasHidden: false
  };

  let globalMin = Infinity;
  let globalMax = -Infinity;
  let allowsNegative = false;

  for (const r of rules) {
    if (r.type === 'VALUE') {
      if (r.min !== -Infinity && r.min < globalMin) globalMin = r.min;
      if (r.max !== Infinity && r.max > globalMax) globalMax = r.max;
      if (r.min < 0) allowsNegative = true;
    }
  }

  for (const tc of testCases) {
    if (tc.visibility === 'public' || tc.category === 'sample') scenarios.hasSample = true;
    if (tc.visibility === 'hidden') scenarios.hasHidden = true;

    const { numbers, lines } = extractNumbersAndLengths(tc.input);

    if (numbers.includes(0)) scenarios.hasZero = true;
    if (numbers.some((n) => n < 0)) scenarios.hasNegative = true;

    if (globalMin !== Infinity && numbers.some((n) => n === globalMin)) scenarios.hasMinBoundary = true;
    if (globalMax !== -Infinity && numbers.some((n) => n === globalMax)) scenarios.hasMaxBoundary = true;

    if (tc.input.trim() === '' || lines.some((l) => l.trim().length <= 1) || numbers.length <= 1) {
      scenarios.hasEmptyOrSingle = true;
    }
  }

  const missingScenarios = [];
  if (!scenarios.hasSample) {
    missingScenarios.push('Missing public sample test case for student preview.');
  }
  if (!scenarios.hasHidden) {
    missingScenarios.push('Missing hidden test cases. Suite lacks private evaluation fixtures.');
  }
  if (allowsNegative && !scenarios.hasNegative) {
    missingScenarios.push('No test cases verify negative numbers, which are permitted by question constraints.');
  }
  if (!scenarios.hasZero && globalMin <= 0 && globalMax >= 0) {
    missingScenarios.push('No test case tests zero (0), an essential boundary scenario.');
  }
  if (globalMin !== Infinity && !scenarios.hasMinBoundary) {
    missingScenarios.push(`Missing minimum boundary test case testing min value (${globalMin}).`);
  }
  if (globalMax !== -Infinity && !scenarios.hasMaxBoundary) {
    missingScenarios.push(`Missing maximum boundary test case testing max value (${globalMax}).`);
  }

  return { scenarios, missingScenarios };
};

/**
 * Validates the entire test suite and reference solution for a question.
 */
export const validateQuestionSuite = async ({ questionId, language = null, user = null }) => {
  const question = await Question.findById(questionId);
  if (!question) {
    throw ApiError.notFound('Question not found');
  }

  const testCases = await TestCase.find({ questionId }).sort('createdAt');
  const targetLang = (language || question.language || 'javascript').toLowerCase();

  const blockingErrors = [];
  const warnings = [];

  // Zero test cases is an immediate blocker
  if (!testCases || testCases.length === 0) {
    blockingErrors.push('Question contains zero test cases. At least one valid test case is required.');
    const result = {
      referenceSolutionStatus: 'FAIL',
      testCaseValidity: 'INVALID',
      expectedOutputStatus: 'UNVERIFIED',
      testQualityStatus: 'NEEDS_IMPROVEMENT',
      publishingStatus: 'NOT_READY',
      canPublish: false,
      blockingErrors,
      warnings,
      metrics: {
        total: 0,
        valid: 0,
        invalid: 0,
        duplicates: 0,
        passed: 0,
        failed: 0,
        mismatches: 0,
        averageRuntimeMs: 0
      },
      testCaseResults: []
    };
    return result;
  }

  // 1. Resolve reference solution for target language (NEVER fall back to starter code)
  let refCode = null;
  if (question.referenceSolutions) {
    if (question.referenceSolutions instanceof Map) {
      refCode =
        question.referenceSolutions.get(targetLang) ||
        question.referenceSolutions.get(targetLang.toLowerCase()) ||
        question.referenceSolutions.get(`function_${targetLang.toLowerCase()}`) ||
        question.referenceSolutions.get(`stdin_${targetLang.toLowerCase()}`);
    } else if (typeof question.referenceSolutions === 'object') {
      const keys = Object.keys(question.referenceSolutions);
      const matchedKey = keys.find((k) =>
        k.toLowerCase() === targetLang.toLowerCase() ||
        k.toLowerCase().endsWith(`_${targetLang.toLowerCase()}`)
      );
      if (matchedKey) refCode = question.referenceSolutions[matchedKey];
    }
  }

  if (!refCode || !refCode.trim()) {
    const qLang = (question.language || '').toLowerCase();
    if (qLang === targetLang.toLowerCase() && question.referenceSolution && question.referenceSolution.trim()) {
      refCode = question.referenceSolution;
    }
  }

  // Fallback: If referenceSolution exists on the question and targetLang is the requested language
  if (!refCode || !refCode.trim()) {
    if (question.referenceSolution && question.referenceSolution.trim()) {
      refCode = question.referenceSolution;
    }
  }

  let hasRefCode = Boolean(refCode && refCode.trim());
  if (!hasRefCode) {
    blockingErrors.push(`Question has no reference solution configured for language '${targetLang}'.`);
  }

  // 2. Parse Question Constraints
  const parsedRules = parseConstraints(question.constraints);

  // 3. Duplicate Test Case Detection
  const duplicateCases = detectDuplicateTestCases(testCases);
  if (duplicateCases.length > 0) {
    warnings.push(`${duplicateCases.length} duplicate test case(s) detected in the suite.`);
  }

  // 4. Scenario Coverage Analysis
  const { missingScenarios } = analyzeScenarioCoverage(testCases, parsedRules);
  for (const ms of missingScenarios) {
    warnings.push(ms);
  }

  // 5. Test Case Semantic & Execution Verification
  const questionContext = {
    title: question.title,
    tags: question.tags || [],
    language: targetLang,
    executionMode: question.executionMode || 'STDIN',
    dataStructure: question.dataStructure || 'ARRAY',
    functionName: question.functionName || 'solution',
    returnType: question.functionSignature?.returnType || 'void',
    parameters: question.functionSignature?.parameters || []
  };

  const testCaseResults = [];
  let validCount = 0;
  let invalidCount = 0;
  let passedCount = 0;
  let failedCount = 0;
  let mismatchCount = 0;
  let totalRuntimeMs = 0;
  let executionCriticalError = null;

  for (let idx = 0; idx < testCases.length; idx++) {
    const tc = testCases[idx];
    const caseErrors = [];

    // Check input format
    if (tc.input === undefined || tc.input === null || String(tc.input).trim() === '') {
      caseErrors.push('Missing or empty input.');
    }

    // Check expected output
    if (tc.expectedOutput === undefined || tc.expectedOutput === null || String(tc.expectedOutput).trim() === '') {
      caseErrors.push('Missing or empty expected output.');
    }

    // Check constraints
    if (tc.input) {
      const violations = checkInputAgainstConstraints(tc.input, parsedRules);
      if (violations.length > 0) {
        caseErrors.push(...violations);
      }
    }

    const isCaseValid = caseErrors.length === 0;
    if (isCaseValid) {
      validCount++;
    } else {
      invalidCount++;
      for (const err of caseErrors) {
        blockingErrors.push(`Test Case #${idx + 1}: ${err}`);
      }
    }

    // Execute reference solution if available and test case has valid input and expected output
    let execResult = null;
    let computedOutput = null;
    let isMismatch = false;

    const hasInputAndOutput = Boolean(
      tc.input !== undefined && tc.input !== null && String(tc.input).trim() !== '' &&
      tc.expectedOutput !== undefined && tc.expectedOutput !== null && String(tc.expectedOutput).trim() !== ''
    );

    if (hasRefCode && hasInputAndOutput) {
      try {
        execResult = await validateSingleTestCase({
          code: refCode,
          testCase: tc,
          questionContext,
          timeoutMs: 4000
        });

        computedOutput = execResult.actualOutput;
        totalRuntimeMs += (execResult.runtimeMs || 0);

        const isExecError = [
          'compilation_error',
          'compile_error',
          'runtime_error',
          'timeout',
          'memory_limit_exceeded',
          'internal_error',
          'cancelled'
        ].includes(execResult.status) || Boolean(execResult.error && !execResult.passed && execResult.actualOutput === null);

        if (isExecError) {
          failedCount++;
          executionCriticalError = execResult.error || `Execution failed with status: ${execResult.status}`;
          tc.verificationStatus = 'failed';
        } else if (execResult.passed) {
          passedCount++;
          tc.verificationStatus = 'verified';
        } else {
          // Output mismatch: reference solution produced output that differs from expected output
          failedCount++;
          mismatchCount++;
          isMismatch = true;
          tc.verificationStatus = 'failed';
          blockingErrors.push(
            `Test Case #${idx + 1} output mismatch: Expected "${tc.expectedOutput}", reference solution produced "${computedOutput}".`
          );
        }
      } catch (runErr) {
        failedCount++;
        executionCriticalError = runErr.message || 'Execution error during validation';
        tc.verificationStatus = 'failed';
      }
    } else {
      tc.verificationStatus = isCaseValid ? 'unverified' : 'invalid_test';
    }

    // Persist computed output and verification status
    if (computedOutput !== null && computedOutput !== undefined) {
      tc.computedOutput = computedOutput;
    }
    if (execResult?.error) {
      tc.lastError = execResult.error;
    }
    await tc.save();

    testCaseResults.push({
      testCaseId: tc._id,
      category: tc.category,
      visibility: tc.visibility,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      computedOutput,
      actualOutput: computedOutput,
      passed: execResult ? execResult.passed : false,
      isValid: isCaseValid,
      isMismatch,
      status: tc.verificationStatus,
      verificationStatus: tc.verificationStatus,
      error: execResult?.error || (caseErrors.length > 0 ? caseErrors.join(' ') : null),
      runtimeMs: execResult?.runtimeMs || 0
    });
  }

  if (executionCriticalError) {
    blockingErrors.push(`Reference solution execution error: ${executionCriticalError}`);
  }

  // 6. Compute 5 Core Dashboard Statuses
  // A. Reference Solution: PASS / FAIL
  const referenceSolutionStatus = (hasRefCode && !executionCriticalError && failedCount === 0 && passedCount === testCases.length)
    ? 'PASS'
    : 'FAIL';

  // B. Test Case Validity: VALID / INVALID
  const testCaseValidity = invalidCount === 0 ? 'VALID' : 'INVALID';

  // C. Expected Output: VERIFIED / UNVERIFIED / MISMATCH
  let expectedOutputStatus = 'UNVERIFIED';
  if (!hasRefCode || executionCriticalError) {
    expectedOutputStatus = 'UNVERIFIED';
  } else if (mismatchCount > 0) {
    expectedOutputStatus = 'MISMATCH';
  } else if (passedCount === testCases.length && testCases.length > 0) {
    expectedOutputStatus = 'VERIFIED';
  }

  // D. Test Quality: ADEQUATE / NEEDS_IMPROVEMENT
  const testQualityStatus = (
    testCases.length >= 3 &&
    validCount === testCases.length &&
    duplicateCases.length === 0 &&
    missingScenarios.length === 0 &&
    blockingErrors.length === 0
  )
    ? 'ADEQUATE'
    : 'NEEDS_IMPROVEMENT';

  // E. Publishing Status: READY / NOT_READY
  const canPublish = (
    referenceSolutionStatus === 'PASS' &&
    testCaseValidity === 'VALID' &&
    expectedOutputStatus === 'VERIFIED' &&
    blockingErrors.length === 0 &&
    testCases.length > 0
  );
  const publishingStatus = canPublish ? 'READY' : 'NOT_READY';

  // Update Question model validationSummary
  question.validationSummary = {
    referenceSolutionStatus,
    testCaseValidity,
    expectedOutputStatus,
    testQualityStatus,
    publishingStatus,
    lastValidatedAt: new Date()
  };
  await question.save();

  return {
    referenceSolutionStatus,
    testCaseValidity,
    expectedOutputStatus,
    testQualityStatus,
    publishingStatus,
    canPublish,
    blockingErrors,
    warnings,
    metrics: {
      total: testCases.length,
      valid: validCount,
      invalid: invalidCount,
      duplicates: duplicateCases.length,
      passed: passedCount,
      failed: failedCount,
      mismatches: mismatchCount,
      averageRuntimeMs: testCases.length > 0 ? Math.round(totalRuntimeMs / testCases.length) : 0
    },
    testCaseResults
  };
};

/**
 * Validates a single test case against the question's reference solution.
 */
export const validateSingleTest = async ({ questionId, testId, language = null, user = null }) => {
  const question = await Question.findById(questionId);
  if (!question) {
    throw ApiError.notFound('Question not found');
  }

  const tc = await TestCase.findOne({ _id: testId, questionId });
  if (!tc) {
    throw ApiError.notFound('Test case not found');
  }

  const targetLang = (language || question.language || 'javascript').toLowerCase();

  let refCode = null;
  if (question.referenceSolutions) {
    if (question.referenceSolutions instanceof Map) {
      refCode =
        question.referenceSolutions.get(targetLang) ||
        question.referenceSolutions.get(targetLang.toLowerCase()) ||
        question.referenceSolutions.get(`function_${targetLang.toLowerCase()}`) ||
        question.referenceSolutions.get(`stdin_${targetLang.toLowerCase()}`);
    } else if (typeof question.referenceSolutions === 'object') {
      const keys = Object.keys(question.referenceSolutions);
      const matchedKey = keys.find((k) =>
        k.toLowerCase() === targetLang.toLowerCase() ||
        k.toLowerCase().endsWith(`_${targetLang.toLowerCase()}`)
      );
      if (matchedKey) refCode = question.referenceSolutions[matchedKey];
    }
  }
  if (!refCode || !refCode.trim()) {
    if (question.referenceSolution && question.referenceSolution.trim()) {
      refCode = question.referenceSolution;
    }
  }

  if (!refCode || !refCode.trim()) {
    throw ApiError.badRequest(`Question does not have a reference solution for language '${targetLang}'.`);
  }

  const questionContext = {
    title: question.title,
    tags: question.tags || [],
    language: targetLang,
    executionMode: question.executionMode || 'STDIN',
    dataStructure: question.dataStructure || 'ARRAY',
    functionName: question.functionName || 'solution',
    returnType: question.functionSignature?.returnType || 'void',
    parameters: question.functionSignature?.parameters || []
  };

  const execResult = await validateSingleTestCase({
    code: refCode,
    testCase: tc,
    questionContext,
    timeoutMs: 4000
  });

  tc.computedOutput = execResult.actualOutput;
  if (execResult.passed) {
    tc.verificationStatus = 'verified';
  } else {
    tc.verificationStatus = 'failed';
    tc.lastError = execResult.error;
  }
  await tc.save();

  return {
    testCaseId: tc._id,
    input: tc.input,
    expectedOutput: tc.expectedOutput,
    computedOutput: execResult.actualOutput,
    passed: execResult.passed,
    status: tc.verificationStatus,
    runtimeMs: execResult.runtimeMs || 0,
    error: execResult.error
  };
};

/**
 * Requires teacher approval before accepting computed output from reference solution as official expectedOutput.
 */
export const acceptComputedOutput = async ({ questionId, testId, user = null }) => {
  const question = await Question.findById(questionId);
  if (!question) {
    throw ApiError.notFound('Question not found');
  }

  const tc = await TestCase.findOne({ _id: testId, questionId });
  if (!tc) {
    throw ApiError.notFound('Test case not found');
  }

  if (tc.computedOutput === undefined || tc.computedOutput === null) {
    throw ApiError.badRequest('No computed output exists for this test case. Run validation first.');
  }

  tc.expectedOutput = tc.computedOutput;
  tc.verificationStatus = 'verified';
  tc.lastError = null;
  await tc.save();

  return {
    testCaseId: tc._id,
    updatedExpectedOutput: tc.expectedOutput,
    verificationStatus: tc.verificationStatus
  };
};

export default {
  parseConstraints,
  extractNumbersAndLengths,
  checkInputAgainstConstraints,
  detectDuplicateTestCases,
  analyzeScenarioCoverage,
  validateQuestionSuite,
  validateSingleTest,
  acceptComputedOutput
};
