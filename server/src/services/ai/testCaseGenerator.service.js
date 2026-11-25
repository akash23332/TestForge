import crypto from 'crypto';
import { GeminiProvider } from './providers/gemini.provider.js';
import { aiProviderManager } from './aiProviderManager.js';
import { TestCase } from '../../models/TestCase.js';
import { validateSingleTestCase, parseInputArguments } from '../codeRunner.service.js';
import { ApiError } from '../../utils/apiError.js';

/**
 * Computes execution-mode-aware canonical string for deterministic comparison.
 * - In STDIN mode: preserves exact input bytes (no trimming, no EOF newline stripping).
 * - In FUNCTION mode: normalizes via parseInputArguments + JSON.stringify if structured,
 *   preserving exact string literal contents.
 *
 * @param {string} input
 * @param {'FUNCTION'|'STDIN'} executionMode
 * @returns {string} Canonical string representation
 */
export const computeCanonicalInput = (input, executionMode = 'FUNCTION') => {
  const raw = String(input ?? '');
  if (String(executionMode || '').toUpperCase() === 'STDIN') {
    return raw;
  }

  // FUNCTION mode: attempt structured argument canonicalization
  try {
    const parsed = parseInputArguments(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return JSON.stringify(parsed);
    }
  } catch (_) {}

  return raw;
};

/**
 * Computes deterministic SHA-256 hash of canonicalized input.
 *
 * @param {string} canonicalInput
 * @returns {string} Hex hash string
 */
export const computeInputHash = (canonicalInput) => {
  return crypto.createHash('sha256').update(String(canonicalInput ?? '')).digest('hex');
};

export class TestCaseGeneratorService {
  constructor(provider = null) {
    this.provider = provider || aiProviderManager;
  }

  /**
   * Generates, executes against reference solution, deduplicates, and stages candidate test cases.
   *
   * @param {Object} params
   * @param {Object} params.question - Full question document
   * @param {number} [params.count=5] - Number of candidate test cases to generate (1-10)
   * @param {string} [params.category='all'] - Target category filter
   * @param {string} [params.visibility='hidden'] - Target visibility (public | hidden)
   * @param {string} [params.instructions=''] - Custom teacher instructions
   * @param {Array<string>} [params.excludeInputs=[]] - Inputs to explicitly exclude
   * @returns {Promise<{
   *   candidates: Array<Object>,
   *   totalGenerated: number,
   *   acceptedCount: number,
   *   duplicateCount: number,
   *   rejectedExecutionCount: number
   * }>}
   */
  async generateCandidateTestCases({
    question,
    count = 5,
    category = 'all',
    visibility = 'hidden',
    instructions = '',
    excludeInputs = []
  }) {
    if (!question || !question._id) {
      throw ApiError.badRequest('Question document with valid identifier is required for test generation.');
    }

    const targetLang = (question.language || 'javascript').toLowerCase();

    // Authoritative Reference Solution Gate: Starter code is NEVER permitted as fallback
    let refCode = null;
    if (question.referenceSolutions) {
      if (question.referenceSolutions instanceof Map) {
        refCode = question.referenceSolutions.get(targetLang);
      } else if (typeof question.referenceSolutions === 'object') {
        refCode = question.referenceSolutions[targetLang];
      }
    }
    if (!refCode || !refCode.trim()) {
      if (question.language === targetLang && question.referenceSolution && question.referenceSolution.trim()) {
        refCode = question.referenceSolution;
      }
    }

    if (!refCode || !refCode.trim()) {
      throw ApiError.badRequest(
        `Question does not have an authoritative reference solution configured for language '${targetLang}'. ` +
        `AI test case generation requires a valid reference solution to evaluate candidate outputs.`
      );
    }

    // Fetch existing test cases to exclude duplicates
    const existingTestCases = await TestCase.find({ questionId: question._id })
      .select('input inputHash')
      .lean();

    const existingHashes = new Set();
    const existingInputs = [];

    for (const etc of existingTestCases) {
      existingInputs.push(etc.input);
      if (etc.inputHash) {
        existingHashes.add(etc.inputHash);
      } else {
        const h = computeInputHash(computeCanonicalInput(etc.input, question.executionMode));
        existingHashes.add(h);
      }
    }

    // Explicitly exclude any caller-provided inputs (e.g. from candidate review modal during single-case regeneration)
    if (Array.isArray(excludeInputs) && excludeInputs.length > 0) {
      for (const ex of excludeInputs) {
        if (typeof ex === 'string' && ex.trim()) {
          existingInputs.push(ex);
          existingHashes.add(computeInputHash(computeCanonicalInput(ex, question.executionMode)));
        }
      }
    }

    // Call Gemini Provider - when requesting 1 candidate for regeneration, request 3 from Gemini to guarantee a distinct candidate survives validation
    const boundedCount = Math.max(1, Math.min(10, Number(count) || 5));
    const providerQueryCount = boundedCount === 1 ? 3 : boundedCount;
    const rawResult = await this.provider.generateTestCases({
      question: {
        title: question.title,
        statement: question.statement,
        constraints: question.constraints,
        inputFormat: question.inputFormat,
        outputFormat: question.outputFormat,
        language: targetLang,
        executionMode: question.executionMode || 'FUNCTION',
        functionName: question.functionName || 'solution',
        functionSignature: question.functionSignature || { parameters: [], returnType: 'void' },
        referenceSolution: refCode
      },
      count: providerQueryCount,
      category,
      instructions,
      existingInputs,
      temperature: boundedCount === 1 ? 0.85 : 0.65
    });

    const generatedCases = Array.isArray(rawResult?.testCases) ? rawResult.testCases : [];

    const questionContext = {
      title: question.title,
      tags: question.tags || [],
      language: targetLang,
      executionMode: question.executionMode || 'FUNCTION',
      dataStructure: question.dataStructure || (question.executionMode === 'STDIN' ? 'NONE' : 'ARRAY'),
      functionName: question.functionName || 'solution',
      returnType: question.functionSignature?.returnType || 'void',
      parameters: question.functionSignature?.parameters || []
    };

    const candidates = [];
    const batchHashes = new Set();
    let duplicateCount = 0;
    let rejectedExecutionCount = 0;

    for (let idx = 0; idx < generatedCases.length; idx++) {
      const c = generatedCases[idx];
      const rawInput = typeof c.input === 'string' ? c.input : String(c.input ?? '');
      if (!rawInput.trim()) continue;

      const canonicalInput = computeCanonicalInput(rawInput, question.executionMode);
      const inputHash = computeInputHash(canonicalInput);

      // Check collision against database & current batch
      if (existingHashes.has(inputHash) || batchHashes.has(inputHash)) {
        duplicateCount++;
        continue;
      }

      // Execute candidate against authoritative reference solution using compute-only contract
      const execResult = await validateSingleTestCase({
        code: refCode,
        testCase: {
          input: rawInput,
          category: 'custom' // Triggers compute-only mode: bypasses expectedOutput checks
        },
        questionContext,
        timeoutMs: 5000
      });

      if (!execResult.passed || execResult.status !== 'success' || execResult.actualOutput === null || execResult.actualOutput === undefined) {
        rejectedExecutionCount++;
        continue;
      }

      batchHashes.add(inputHash);

      candidates.push({
        candidateId: `cand_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        input: rawInput,
        expectedOutput: execResult.actualOutput,
        computedOutput: execResult.actualOutput,
        category: ['normal', 'edge_case', 'boundary', 'performance', 'stress'].includes(c.category)
          ? c.category
          : 'standard',
        visibility: ['public', 'hidden'].includes(visibility) ? visibility : 'hidden',
        explanation: typeof c.explanation === 'string' ? c.explanation.trim() : '',
        runtimeMs: execResult.runtimeMs || 0,
        inputHash
      });

      if (candidates.length >= boundedCount) {
        break;
      }
    }

    return {
      candidates,
      totalGenerated: generatedCases.length,
      acceptedCount: candidates.length,
      duplicateCount,
      rejectedExecutionCount
    };
  }
}

export const testCaseGeneratorService = new TestCaseGeneratorService();
export default testCaseGeneratorService;
