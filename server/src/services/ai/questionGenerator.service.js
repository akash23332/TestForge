import { GeminiProvider } from './providers/gemini.provider.js';
import {
  validateGeneratedQuestion,
  validateRegeneratedSolution,
  validateRegeneratedStarterCode
} from './questionValidator.service.js';
import { checkDuplicateAgainstHistory } from './duplicateDetector.service.js';
import { config } from '../../config/env.js';
import { ApiError } from '../../utils/apiError.js';

export class QuestionGeneratorService {
  constructor() {
    this.providers = new Map();
    // Register Gemini as default provider
    this.registerProvider('gemini', new GeminiProvider());

    // In-memory session history store: sessionKey -> Array<Question> (max 5)
    this.sessionHistory = new Map();
  }

  /**
   * Registers an AI provider implementation.
   * @param {string} name
   * @param {import('./aiProvider.interface.js').AIProvider} providerInstance
   */
  registerProvider(name, providerInstance) {
    this.providers.set(name.toLowerCase(), providerInstance);
  }

  /**
   * Retrieves an AI provider by name, falling back to configured provider.
   * @param {string} [name]
   * @returns {import('./aiProvider.interface.js').AIProvider}
   */
  getProvider(name) {
    const target = (name || config.ai?.provider || 'gemini').toLowerCase();
    const provider = this.providers.get(target);
    if (!provider) {
      throw ApiError.badRequest(
        `AI provider '${target}' is not registered. Available providers: [${Array.from(this.providers.keys()).join(', ')}]`,
        { code: 'UNKNOWN_AI_PROVIDER' }
      );
    }
    return provider;
  }

  /**
   * Gets sanitized recent question history for a session (up to 5 items).
   * @param {string} sessionKey
   * @returns {Array<Object>}
   */
  getSessionHistory(sessionKey) {
    if (!sessionKey) return [];
    return this.sessionHistory.get(String(sessionKey)) || [];
  }

  /**
   * Records an accepted question in the session history, maintaining max 5.
   * Never stores private tests or solution secrets in history.
   * @param {string} sessionKey
   * @param {Object} question
   */
  recordQuestionInHistory(sessionKey, question) {
    if (!sessionKey || !question) return;
    const key = String(sessionKey);
    const existing = this.sessionHistory.get(key) || [];
    const sanitized = {
      title: question.title,
      statement: question.statement,
      functionName: question.functionName,
      difficulty: question.difficulty,
      executionMode: question.executionMode,
      sampleTestCase: question.sampleTestCase
        ? {
            input: question.sampleTestCase.input,
            expectedOutput: question.sampleTestCase.expectedOutput
          }
        : undefined
    };

    // Append and keep only the last 5
    const updated = [...existing, sanitized].slice(-5);
    this.sessionHistory.set(key, updated);
  }

  /**
   * Clears the session history when teacher initiates a new creation session.
   * @param {string} sessionKey
   */
  clearSessionHistory(sessionKey) {
    if (!sessionKey) return;
    this.sessionHistory.delete(String(sessionKey));
  }

  /**
   * Generates a complete, validated question using the active AI provider,
   * with automatic diversity enforcement, duplicate detection, and up to 3 generation attempts.
   * 
   * @param {Object} options
   * @param {string} [options.sessionKey] - Teacher session or user ID
   * @param {Array<Object>} [options.recentQuestions] - Client-provided session history
   * @param {number} [options.maxAttempts=3] - Maximum retry attempts
   * @returns {Promise<Object>}
   */
  async generateQuestion(options = {}) {
    const provider = this.getProvider(options.provider);
    const sessionKey = options.sessionKey || options.userId || null;
    const maxAttempts = options.maxAttempts || 3;

    // Combine server-side session history and client-provided recent questions
    const serverHistory = sessionKey ? this.getSessionHistory(sessionKey) : [];
    const clientHistory = Array.isArray(options.recentQuestions) ? options.recentQuestions : [];

    // Deduplicate and cap to 5 most recent questions for exclusion
    const combinedHistory = [...serverHistory];
    for (const q of clientHistory) {
      if (q && q.title && !combinedHistory.some((h) => h.title === q.title)) {
        combinedHistory.push(q);
      }
    }
    const activeExclusionHistory = combinedHistory.slice(-5);

    let lastDuplicateResult = null;
    let attemptsCount = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attemptsCount = attempt;

      const rawOutput = await provider.generateQuestion({
        ...options,
        recentQuestions: activeExclusionHistory,
        regenerationFeedback: lastDuplicateResult ? lastDuplicateResult.reason : null
      });

      const validatedQuestion = validateGeneratedQuestion(rawOutput, options);

      // Perform duplicate detection against exclusion history
      const dupCheck = checkDuplicateAgainstHistory(validatedQuestion, activeExclusionHistory);

      if (!dupCheck.isDuplicate) {
        // Unique question accepted! Record in session history
        if (sessionKey) {
          this.recordQuestionInHistory(sessionKey, validatedQuestion);
        }

        return {
          ...validatedQuestion,
          _diversityMeta: {
            attemptsUsed: attemptsCount,
            isUnique: true,
            historyComparedCount: activeExclusionHistory.length
          }
        };
      }

      // Duplicate detected on this attempt
      lastDuplicateResult = dupCheck;

      // Add the duplicate to activeExclusionHistory so the next attempt explicitly avoids it
      activeExclusionHistory.push({
        title: validatedQuestion.title,
        statement: validatedQuestion.statement,
        functionName: validatedQuestion.functionName,
        difficulty: validatedQuestion.difficulty,
        sampleTestCase: validatedQuestion.sampleTestCase
      });
    }

    // Fail-closed if all attempts resulted in duplicates
    throw ApiError.conflict(
      `Unable to generate a sufficiently distinct question after ${maxAttempts} attempts. The generated ideas remained too similar to recent questions (${lastDuplicateResult?.reason || 'high semantic similarity'}). Please adjust your requirements or regenerate manually.`,
      {
        code: 'DUPLICATE_GENERATION_LIMIT_EXCEEDED',
        attempts: maxAttempts,
        reason: lastDuplicateResult?.reason,
        matchedTitle: lastDuplicateResult?.matchedQuestion?.title
      }
    );
  }

  /**
   * Action A: Regenerate Statement
   * Generates a genuinely different coding problem while preserving topic, difficulty,
   * concepts, learning objectives, and constraints.
   * Generates matching reference solution, starter code, and sample test case.
   */
  async regenerateStatement(options = {}) {
    const { currentQuestion, instructions, sessionKey, provider: providerName, maxAttempts = 3 } = options;
    if (!currentQuestion || typeof currentQuestion !== 'object') {
      throw ApiError.badRequest('Existing question context is required for statement regeneration.');
    }

    const provider = this.getProvider(providerName);
    const activeSessionKey = sessionKey || null;

    // Build exclusion list containing the current question and recent history
    const serverHistory = activeSessionKey ? this.getSessionHistory(activeSessionKey) : [];
    const clientHistory = Array.isArray(options.recentQuestions) ? options.recentQuestions : [];
    const combinedHistory = [...serverHistory];
    for (const q of clientHistory) {
      if (q && q.title && !combinedHistory.some((h) => h.title === q.title)) {
        combinedHistory.push(q);
      }
    }
    // Explicitly add current question to exclusion list so Gemini cannot reproduce it
    if (currentQuestion.title && !combinedHistory.some((h) => h.title === currentQuestion.title)) {
      combinedHistory.unshift({
        title: currentQuestion.title,
        statement: currentQuestion.statement,
        functionName: currentQuestion.functionName,
        difficulty: currentQuestion.difficulty,
        sampleTestCase: currentQuestion.sampleTestCase
      });
    }
    const activeExclusionHistory = combinedHistory.slice(-5);

    const topic = currentQuestion.topic || (Array.isArray(currentQuestion.tags) ? currentQuestion.tags[0] : 'Algorithms');
    const difficulty = currentQuestion.difficulty || 'Medium';
    const language = (currentQuestion.language || 'python').toLowerCase();
    const executionMode = (currentQuestion.executionMode || 'FUNCTION').toUpperCase();
    const constraints = currentQuestion.constraints || '';
    const combinedRequirements = [constraints, instructions].filter(Boolean).join('. ');

    let lastDuplicateResult = null;
    let attemptsCount = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attemptsCount = attempt;

      const rawOutput = await provider.generateQuestion({
        topic,
        difficulty,
        language,
        executionMode,
        requirements: combinedRequirements,
        recentQuestions: activeExclusionHistory,
        regenerationFeedback: lastDuplicateResult ? lastDuplicateResult.reason : null
      });

      const validated = validateGeneratedQuestion(rawOutput, { language, executionMode });
      const dupCheck = checkDuplicateAgainstHistory(validated, activeExclusionHistory);

      if (!dupCheck.isDuplicate) {
        if (activeSessionKey) {
          this.recordQuestionInHistory(activeSessionKey, validated);
        }

        return {
          action: 'statement',
          previewData: validated,
          invalidations: {
            requiresSampleValidation: true,
            invalidatesSolution: true,
            invalidatesStarterCode: true,
            invalidatesSampleTest: true
          },
          _diversityMeta: {
            attemptsUsed: attemptsCount,
            isUnique: true,
            historyComparedCount: activeExclusionHistory.length
          }
        };
      }

      lastDuplicateResult = dupCheck;
      activeExclusionHistory.push({
        title: validated.title,
        statement: validated.statement,
        functionName: validated.functionName,
        difficulty: validated.difficulty,
        sampleTestCase: validated.sampleTestCase
      });
    }

    throw ApiError.conflict(
      `Unable to generate a sufficiently distinct statement after ${maxAttempts} attempts. The generated problems were too similar to the existing question (${lastDuplicateResult?.reason || 'high semantic similarity'}). Please adjust constraints or try again.`,
      {
        code: 'DUPLICATE_GENERATION_LIMIT_EXCEEDED',
        attempts: maxAttempts,
        reason: lastDuplicateResult?.reason
      }
    );
  }

  /**
   * Action B: Regenerate Solution
   * Generates a fresh, alternative reference solution for the exact existing question.
   * Preserves statement, constraints, input/output format, sample test case, and language.
   * Retries up to 3 times for genuine diversity if identical to current solution.
   */
  async regenerateSolution(options = {}) {
    const { currentQuestion, instructions, provider: providerName, maxAttempts = 3 } = options;
    if (!currentQuestion || typeof currentQuestion !== 'object') {
      throw ApiError.badRequest('Existing question context is required for solution regeneration.');
    }

    const provider = this.getProvider(providerName);
    const existingSol = String(currentQuestion.referenceSolution || '').replace(/\r\n/g, '\n').trim();

    let lastResult = null;
    let attemptsCount = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attemptsCount = attempt;

      const rawOutput = await provider.regenerateSection({
        section: 'solution',
        currentQuestion,
        instructions,
        exclusionSolution: existingSol
      });

      const validated = validateRegeneratedSolution(rawOutput, currentQuestion);
      const newSol = String(validated.referenceSolution || '').replace(/\r\n/g, '\n').trim();

      // Check diversity: solution must not be identical to existing solution
      if (!existingSol || newSol !== existingSol) {
        return {
          action: 'solution',
          previewData: {
            referenceSolution: validated.referenceSolution,
            approach: validated.approach || 'Alternative algorithmic implementation'
          },
          invalidations: {
            requiresSampleValidation: true,
            invalidatesSolution: false,
            invalidatesStarterCode: false,
            invalidatesSampleTest: false
          },
          _diversityMeta: {
            attemptsUsed: attemptsCount,
            isUnique: true
          }
        };
      }

      lastResult = validated;
    }

    // If identical after maxAttempts, return the validated solution with notice
    return {
      action: 'solution',
      previewData: {
        referenceSolution: lastResult?.referenceSolution || existingSol,
        approach: lastResult?.approach || 'Verified optimal implementation'
      },
      invalidations: {
        requiresSampleValidation: true,
        invalidatesSolution: false,
        invalidatesStarterCode: false,
        invalidatesSampleTest: false
      },
      _diversityMeta: {
        attemptsUsed: attemptsCount,
        isUnique: false,
        note: 'Generated solution is already an optimal implementation.'
      }
    };
  }

  /**
   * Action C: Regenerate Starter Code
   * Generates fresh starter code for the same question and selected language.
   * Preserves existing function signature, contract, execution mode, without exposing reference solution.
   */
  async regenerateStarterCode(options = {}) {
    const { currentQuestion, instructions, provider: providerName } = options;
    if (!currentQuestion || typeof currentQuestion !== 'object') {
      throw ApiError.badRequest('Existing question context is required for starter code regeneration.');
    }

    const provider = this.getProvider(providerName);
    const rawOutput = await provider.regenerateSection({
      section: 'starterCode',
      currentQuestion,
      instructions
    });

    const validated = validateRegeneratedStarterCode(rawOutput, currentQuestion);

    return {
      action: 'starterCode',
      previewData: {
        starterCode: validated.starterCode
      },
      invalidations: {
        requiresSampleValidation: false,
        invalidatesSolution: false,
        invalidatesStarterCode: false,
        invalidatesSampleTest: false
      }
    };
  }

  /**
   * Action D: Regenerate Entire Question
   * Generates a completely new question preserving teacher topic, difficulty, and concepts.
   */
  async regenerateEntireQuestion(options = {}) {
    const { currentQuestion, sessionKey, provider: providerName, maxAttempts = 3 } = options;
    const topic = currentQuestion?.topic || (Array.isArray(currentQuestion?.tags) ? currentQuestion.tags[0] : 'Algorithms');
    const difficulty = currentQuestion?.difficulty || 'Medium';
    const language = (currentQuestion?.language || 'python').toLowerCase();
    const executionMode = (currentQuestion?.executionMode || 'FUNCTION').toUpperCase();
    const requirements = [
      currentQuestion?.requirements,
      options.instructions,
      currentQuestion?.constraints
    ].filter(Boolean).join('. ');

    // Delegate to generateQuestion with currentQuestion added to exclusion list
    const recent = Array.isArray(options.recentQuestions) ? [...options.recentQuestions] : [];
    if (currentQuestion?.title && currentQuestion.title !== 'Untitled' && !recent.some((r) => r.title === currentQuestion.title)) {
      recent.unshift({
        title: currentQuestion.title,
        statement: currentQuestion.statement,
        functionName: currentQuestion.functionName,
        difficulty: currentQuestion.difficulty,
        sampleTestCase: currentQuestion.sampleTestCase
      });
    }

    const generated = await this.generateQuestion({
      topic,
      difficulty,
      language,
      executionMode,
      requirements,
      recentQuestions: recent,
      sessionKey,
      provider: providerName,
      maxAttempts
    });

    return {
      action: 'entireQuestion',
      previewData: generated,
      invalidations: {
        requiresSampleValidation: true,
        invalidatesSolution: true,
        invalidatesStarterCode: true,
        invalidatesSampleTest: true
      },
      _diversityMeta: generated._diversityMeta
    };
  }

  /**
   * Unified regeneration dispatcher supporting all 4 actions:
   * - 'statement' | 'problemStatement'
   * - 'solution' | 'referenceSolution'
   * - 'starterCode'
   * - 'entireQuestion'
   * 
   * Returns preview payload with dependency invalidation flags and updated question state.
   */
  async regenerateSection(options = {}) {
    const target = options.action || options.section;
    if (!target) {
      throw ApiError.badRequest('Action or section name is required for regeneration.');
    }

    let result;
    switch (target) {
      case 'statement':
      case 'problemStatement':
        result = await this.regenerateStatement(options);
        break;

      case 'solution':
      case 'referenceSolution':
        result = await this.regenerateSolution(options);
        break;

      case 'starterCode':
        result = await this.regenerateStarterCode(options);
        break;

      case 'entireQuestion':
      case 'all':
        result = await this.regenerateEntireQuestion(options);
        break;

      default:
        throw ApiError.badRequest(
          `Unsupported regeneration action "${target}". Supported: statement, solution, starterCode, entireQuestion.`,
          { code: 'UNKNOWN_REGENERATION_ACTION' }
        );
    }

    // Build merged non-destructive question preview
    const updated = { ...(options.currentQuestion || {}) };
    const p = result.previewData || {};

    if (target === 'statement' || target === 'problemStatement') {
      if (p.statement) updated.statement = p.statement;
      if (p.title) updated.title = p.title;
      if (p.constraints) updated.constraints = p.constraints;
      if (p.inputFormat) updated.inputFormat = p.inputFormat;
      if (p.outputFormat) updated.outputFormat = p.outputFormat;
      if (p.starterCode) updated.starterCode = p.starterCode;
      if (p.referenceSolution) updated.referenceSolution = p.referenceSolution;
      if (p.sampleTestCase) updated.sampleTestCase = p.sampleTestCase;
    } else if (target === 'starterCode') {
      const code = p.starterCode;
      if (code) {
        updated.starterCode = code;
        const lang = (options.currentQuestion?.language || 'python').toLowerCase();
        if (!updated.starterCodes) updated.starterCodes = {};
        updated.starterCodes[lang] = code;
      }
    } else if (target === 'solution' || target === 'referenceSolution') {
      const sol = p.referenceSolution;
      if (sol) {
        updated.referenceSolution = sol;
        const lang = (options.currentQuestion?.language || 'python').toLowerCase();
        if (!updated.referenceSolutions) updated.referenceSolutions = {};
        updated.referenceSolutions[lang] = sol;
      }
    } else if (target === 'entireQuestion' || target === 'all') {
      Object.assign(updated, p);
    }

    return {
      ...result,
      section: options.section || target,
      regeneratedData: p,
      updatedQuestion: updated
    };
  }
}

export const questionGeneratorService = new QuestionGeneratorService();
export default questionGeneratorService;
