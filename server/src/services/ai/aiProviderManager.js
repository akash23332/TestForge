import { AIProvider } from './aiProvider.interface.js';
import { GroqProvider } from './providers/groq.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { config } from '../../config/env.js';
import { ApiError } from '../../utils/apiError.js';
import { getBackendAiTimeout } from '../../config/aiTimeouts.js';

export class AIProviderManager extends AIProvider {
  /**
   * @param {Object} [options]
   * @param {GroqProvider} [options.groqProvider]
   * @param {GeminiProvider} [options.geminiProvider]
   * @param {'auto'|'groq'|'gemini'} [options.mode]
   */
  constructor(options = {}) {
    super('provider-manager');
    this.groqProvider = options.groqProvider || new GroqProvider();
    this.geminiProvider = options.geminiProvider || new GeminiProvider();
    this.mode = options.mode || config.ai?.provider || 'auto';
  }

  /**
   * Sets the active routing mode.
   * @param {'auto'|'groq'|'gemini'} mode
   */
  setMode(mode) {
    if (['auto', 'groq', 'gemini'].includes(mode)) {
      this.mode = mode;
    }
  }

  /**
   * Returns whether an error is eligible for cross-provider fallback.
   * Transient outages, rate limits, timeouts, and service unavailabilities fall back.
   * Bad requests (e.g. client validation mistakes) do not.
   * @param {Error} error
   * @returns {boolean}
   */
  _isFallbackEligible(error) {
    if (!error) return false;
    const msg = error.message || String(error);
    const code = error.code || error.statusCode || error.status;

    // Rate limits, quota, overload, timeouts, gateway errors, 500, 502, 503, 504
    if (
      code === 429 ||
      code === 500 ||
      code === 502 ||
      code === 503 ||
      code === 504 ||
      code === 'RATE_LIMIT_EXCEEDED' ||
      code === 'SERVICE_UNAVAILABLE' ||
      code === 'GATEWAY_TIMEOUT' ||
      code === 'GROQ_RATE_LIMIT' ||
      code === 'GROQ_TIMEOUT' ||
      code === 'GROQ_SERVICE_UNAVAILABLE' ||
      code === 'GROQ_MODEL_NOT_FOUND' ||
      code === 'GROQ_API_KEY_MISSING' ||
      code === 'GROQ_INVALID_API_KEY' ||
      code === 'GROQ_CIRCUIT_OPEN' ||
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('timeout') ||
      msg.includes('rate limit') ||
      msg.includes('high demand') ||
      msg.includes('circuit')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Central resilient executor across providers:
   * 1. Mode 'gemini': uses Gemini directly.
   * 2. Mode 'groq': uses Groq directly (with fallback to Gemini on failure).
   * 3. Mode 'auto': attempts Groq first; if Groq fails with transient error or is unconfigured,
   *    seamlessly falls back to Gemini without double retries.
   *
   * @param {string} taskName
   * @param {Function} methodExecutor - (provider, effectiveTimeoutMs) => Promise<any>
   * @param {number} [totalBudgetMs] - Overall task deadline budget
   * @returns {Promise<any>}
   */
  async _executeWithFallback(taskName, methodExecutor, totalBudgetMs = 60000) {
    const effectiveMode = this.mode || config.ai?.provider || 'auto';

    // 1. Direct Gemini mode
    if (effectiveMode === 'gemini') {
      return await methodExecutor(this.geminiProvider, totalBudgetMs);
    }

    // 2. Check if Groq is configured
    const groqReady = this.groqProvider.isConfigured();

    if (!groqReady) {
      if (effectiveMode === 'groq') {
        throw ApiError.serviceUnavailable(
          'GROQ_API_KEY is not configured and AI_PROVIDER is set to groq.',
          { code: 'GROQ_API_KEY_MISSING' }
        );
      }
      // Auto mode: gracefully route to Gemini
      console.log(`[AIProviderManager] Groq not configured. Routing ${taskName} to Gemini directly.`);
      return await methodExecutor(this.geminiProvider, totalBudgetMs);
    }

    // 3. Try Groq (budget Groq attempt so Gemini fallback has sufficient remaining time)
    const groqTimeoutMs = Math.min(totalBudgetMs, Math.max(25000, Math.floor(totalBudgetMs * 0.65)));
    const startTime = Date.now();

    try {
      return await methodExecutor(this.groqProvider, groqTimeoutMs);
    } catch (groqError) {
      // If user strictly requested Groq without fallback, rethrow
      if (effectiveMode === 'groq') {
        throw groqError;
      }

      // Check if eligible for fallback
      const eligible = this._isFallbackEligible(groqError);
      if (!eligible) {
        throw groqError;
      }

      const elapsed = Date.now() - startTime;
      const remainingForGemini = Math.max(15000, totalBudgetMs - elapsed);

      console.warn(
        `[AIProviderManager] Groq encountered transient issue during ${taskName} (${groqError.message}) after ${elapsed}ms. Seamlessly falling back to Gemini with ${remainingForGemini}ms budget...`
      );

      // 4. Fall back to Gemini
      try {
        const geminiResult = await methodExecutor(this.geminiProvider, remainingForGemini);
        console.log(`[AIProviderManager] Fallback to Gemini succeeded for ${taskName}.`);
        return geminiResult;
      } catch (geminiError) {
        console.error(
          `[AIProviderManager] Both Groq and Gemini failed for ${taskName}. Groq: ${groqError.message} | Gemini: ${geminiError.message}`
        );
        throw geminiError;
      }
    }
  }

  /**
   * Generates a complete structured coding question with difficulty-aware timeouts.
   */
  async generateQuestion(options = {}) {
    const difficulty = options.difficulty || 'Medium';
    const totalBudget = options.timeoutMs || getBackendAiTimeout({ task: 'CODING_QUESTION', difficulty });

    return await this._executeWithFallback(
      `generateQuestion(${difficulty})`,
      (provider, timeoutMs) => provider.generateQuestion({ ...options, timeoutMs }),
      totalBudget
    );
  }

  /**
   * Regenerates a single section of a coding question while preserving existing context.
   */
  async regenerateSection(options = {}) {
    const totalBudget = options.timeoutMs || getBackendAiTimeout({ task: 'REGENERATE_SECTION' });

    return await this._executeWithFallback(
      `regenerateSection(${options.section || 'unknown'})`,
      (provider, timeoutMs) => provider.regenerateSection({ ...options, timeoutMs }),
      totalBudget
    );
  }

  /**
   * Generates candidate test cases for a question.
   */
  async generateTestCases(options = {}) {
    const totalBudget = options.timeoutMs || getBackendAiTimeout({ task: 'TEST_CASES' });

    return await this._executeWithFallback(
      'generateTestCases',
      (provider, timeoutMs) => provider.generateTestCases({ ...options, timeoutMs }),
      totalBudget
    );
  }

  /**
   * Generates multiple-choice questions with difficulty-aware timeouts.
   */
  async generateMcqs(options = {}) {
    const difficulty = options.difficulty || 'Medium';
    const totalBudget = options.timeoutMs || getBackendAiTimeout({ task: 'MCQ', difficulty });

    return await this._executeWithFallback(
      `generateMcqs(${difficulty})`,
      (provider, timeoutMs) => provider.generateMcqs({ ...options, timeoutMs }),
      totalBudget
    );
  }

  /**
   * Generates comprehensive educational explanation.
   */
  async generateExplanation(options = {}) {
    const totalBudget = options.timeoutMs || getBackendAiTimeout({ task: 'EXPLANATION' });

    return await this._executeWithFallback(
      'generateExplanation',
      (provider, timeoutMs) => provider.generateExplanation({ ...options, timeoutMs }),
      totalBudget
    );
  }

  /**
   * Generates progressive non-spoiling hints.
   */
  async generateHints(options = {}) {
    const totalBudget = options.timeoutMs || getBackendAiTimeout({ task: 'HINTS' });

    return await this._executeWithFallback(
      'generateHints',
      (provider, timeoutMs) => provider.generateHints({ ...options, timeoutMs }),
      totalBudget
    );
  }

  /**
   * Reviews and suggests improvements for question clarity.
   */
  async improveQuestion(options = {}) {
    const totalBudget = options.timeoutMs || getBackendAiTimeout({ task: 'IMPROVE_QUESTION' });

    return await this._executeWithFallback(
      'improveQuestion',
      (provider, timeoutMs) => provider.improveQuestion({ ...options, timeoutMs }),
      totalBudget
    );
  }
}

// Global default singleton
export const aiProviderManager = new AIProviderManager();

export const getAIProvider = () => aiProviderManager;

export default aiProviderManager;

