import { GoogleGenAI } from '@google/genai';
import { AIProvider } from '../aiProvider.interface.js';
import {
  QUESTION_GENERATION_JSON_SCHEMA,
  REGENERATE_SOLUTION_JSON_SCHEMA,
  REGENERATE_STARTER_CODE_JSON_SCHEMA,
  buildQuestionGenerationPrompt,
  buildSectionRegenerationPrompt
} from '../prompts/questionGeneration.prompt.js';
import {
  TEST_CASE_GENERATION_JSON_SCHEMA,
  buildTestCaseGenerationPrompt
} from '../prompts/testCaseGeneration.prompt.js';
import {
  MCQ_GENERATION_JSON_SCHEMA,
  buildMcqGenerationPrompt
} from '../prompts/mcqGeneration.prompt.js';
import { config } from '../../../config/env.js';
import { ApiError } from '../../../utils/apiError.js';
import { geminiCircuitBreaker } from '../circuitBreaker.js';
import { geminiConcurrencyLimiter } from '../concurrencyLimiter.js';
import { executeWithRetry, isTransientError } from '../retryHelper.js';

export class GeminiProvider extends AIProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.apiKey]
   * @param {string} [options.model]
   * @param {string} [options.fallbackModel]
   * @param {number} [options.maxRetries]
   * @param {Object} [options.client] - Injected client for unit tests
   * @param {Object} [options.circuitBreaker] - Injected circuit breaker
   * @param {Object} [options.concurrencyLimiter] - Injected concurrency limiter
   */
  constructor(options = {}) {
    super('gemini');
    this._explicitApiKey = options.apiKey !== undefined;
    this.apiKey = this._explicitApiKey ? options.apiKey : (config.ai?.geminiApiKey || process.env.GEMINI_API_KEY || null);
    this.modelName = options.model || config.ai?.geminiModel || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    this.fallbackModel = options.fallbackModel || config.ai?.geminiFallbackModel || process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';
    this.maxRetries = options.maxRetries ?? (config.ai?.geminiMaxRetries ?? 3);
    this.client = options.client || null;
    this.circuitBreaker = options.circuitBreaker || geminiCircuitBreaker;
    this.concurrencyLimiter = options.concurrencyLimiter || geminiConcurrencyLimiter;

    if (!this.client && this.apiKey && String(this.apiKey).trim()) {
      try {
        this.client = new GoogleGenAI({ apiKey: String(this.apiKey).trim() });
      } catch (err) {
        console.warn(`[GeminiProvider] Warning during GoogleGenAI initialization: ${err.message}`);
      }
    }
  }

  /**
   * Asserts API key configuration before execution.
   */
  _ensureConfigured() {
    if (!this.client && !this._explicitApiKey) {
      const reloadedKey = process.env.GEMINI_API_KEY || config.ai?.geminiApiKey;
      if (reloadedKey && String(reloadedKey).trim()) {
        this.apiKey = String(reloadedKey).trim();
        this.modelName = process.env.GEMINI_MODEL || config.ai?.geminiModel || this.modelName;
        this.fallbackModel = process.env.GEMINI_FALLBACK_MODEL || config.ai?.geminiFallbackModel || this.fallbackModel;
        try {
          this.client = new GoogleGenAI({ apiKey: this.apiKey });
        } catch (_) {}
      }
    }

    if (!this.client && (!this.apiKey || !String(this.apiKey).trim())) {
      throw ApiError.serviceUnavailable(
        'GEMINI_API_KEY is not configured on the backend. Please configure a valid Google Gemini API key.',
        { code: 'GEMINI_API_KEY_MISSING' }
      );
    }
    if (!this.client) {
      try {
        this.client = new GoogleGenAI({ apiKey: this.apiKey });
      } catch (err) {
        throw ApiError.serviceUnavailable(`Failed to initialize Google Gen AI client: ${err.message}`, {
          code: 'GEMINI_CLIENT_INIT_FAILED'
        });
      }
    }
  }

  /**
   * Handles errors from the Gemini API and maps them to standardized TestForge ApiErrors.
   */
  _handleApiError(error) {
    const msg = error.message || String(error);
    const status = error.status || error.statusCode || error.response?.status;

    // Rate limits / Quota exceeded
    if (status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
      const err = ApiError.tooManyRequests(
        'You have reached the current AI generation limit. Please wait before trying again.',
        { code: 'GEMINI_RATE_LIMIT', originalError: msg }
      );
      err.code = 'RATE_LIMIT_EXCEEDED';
      return err;
    }

    // Invalid / Expired API Key
    if (status === 401 || status === 403 || msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('permission')) {
      const err = ApiError.unauthorized(
        'Invalid or unauthorized Gemini API key configured on the server.',
        { code: 'GEMINI_INVALID_API_KEY', originalError: msg }
      );
      err.code = 'UNAUTHORIZED';
      return err;
    }

    // Timeouts
    if (error.name === 'AbortError' || msg.includes('timeout') || msg.includes('DEADLINE_EXCEEDED')) {
      return ApiError.gatewayTimeout(
        'Gemini generation request timed out. Please try again.',
        { code: 'GEMINI_TIMEOUT', originalError: msg }
      );
    }

    // Service Unavailable / Demand spikes
    if (status === 503 || msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
      const err = ApiError.serviceUnavailable(
        'AI generation is temporarily unavailable. Your existing work is safe. Please try again shortly.',
        { code: 'GEMINI_SERVICE_UNAVAILABLE', originalError: msg }
      );
      err.code = 'SERVICE_UNAVAILABLE';
      return err;
    }

    // General provider failure
    return ApiError.badGateway(
      `Gemini AI generation failed: ${msg}`,
      { code: 'GEMINI_API_ERROR', originalError: msg }
    );
  }

  /**
   * Central resilient executor:
   * - Asserts circuit breaker state (fast-fail on open)
   * - Acquires bounded concurrency slot
   * - Executes with exponential backoff + jitter
   * - Switches to fallback model on temporary capacity failures
   * - Records telemetry & circuit breaker status
   *
   * @private
   */
  async _executeWithRetryAndFallback({
    taskName,
    promptText,
    responseSchema = null,
    temperature = 0.2,
    timeoutMs = 45000,
    maxRetries = null,
    correlationId = null
  }) {
    this._ensureConfigured();

    const corrId = correlationId || `ai_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const effectiveRetries = maxRetries ?? this.maxRetries;
    const primaryModel = this.modelName;
    const fallbackModel = this.fallbackModel;

    // Check circuit breaker first (fast-fail if tripped)
    this.circuitBreaker.assertCanExecute();

    // Acquire concurrency slot
    const releaseConcurrency = await this.concurrencyLimiter.acquire();

    const startTime = Date.now();
    let currentModel = primaryModel;
    let fallbackUsed = false;
    let attemptCount = 0;

    try {
      const result = await executeWithRetry(
        async (attempt) => {
          attemptCount = attempt + 1;

          // On attempt >= 1 (after a transient failure on primary), switch to fallback model if configured
          if (attempt >= 1 && fallbackModel && fallbackModel !== currentModel) {
            currentModel = fallbackModel;
            fallbackUsed = true;
            console.log(
              `[GeminiProvider][${corrId}] Primary model pressure encountered. Switching to fallback model: ${fallbackModel} (attempt ${attempt + 1})`
            );
          }

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);

          try {
            const configObj = {
              responseMimeType: 'application/json',
              ...(responseSchema && { responseSchema }),
              temperature
            };

            const response = await this.client.models.generateContent({
              model: currentModel,
              contents: promptText,
              config: configObj
            });
            clearTimeout(timer);

            const rawText = response.text || (typeof response.text === 'function' ? response.text() : '');
            if (!rawText || !rawText.trim()) {
              throw ApiError.badGateway('Gemini returned an empty response.', { code: 'GEMINI_EMPTY_RESPONSE' });
            }

            let parsedData;
            try {
              parsedData = JSON.parse(rawText.trim());
            } catch (parseErr) {
              throw ApiError.badGateway(`Gemini response is not valid JSON: ${parseErr.message}`, {
                code: 'GEMINI_MALFORMED_RESPONSE',
                rawText: rawText.substring(0, 500)
              });
            }

            return parsedData;
          } catch (err) {
            clearTimeout(timer);
            const mapped = err instanceof ApiError ? err : this._handleApiError(err);
            throw mapped;
          }
        },
        {
          maxRetries: effectiveRetries,
          baseDelayMs: 1000,
          maxDelayMs: 10000,
          onRetry: ({ attempt, delayMs, error }) => {
            console.warn(
              `[GeminiProvider][${corrId}] ${taskName} attempt ${attempt}/${effectiveRetries} failed with ${error.statusCode || error.message}. Retrying in ${delayMs}ms using ${fallbackUsed ? fallbackModel : primaryModel}...`
            );
          }
        }
      );

      // Successful execution: record success in circuit breaker
      this.circuitBreaker.recordSuccess();

      const durationMs = Date.now() - startTime;
      console.log(
        `[GeminiProvider][${corrId}] ${taskName} completed in ${durationMs}ms [model=${currentModel}, fallback=${fallbackUsed}, attempts=${attemptCount}]`
      );

      return {
        data: result,
        telemetry: {
          correlationId: corrId,
          model: currentModel,
          fallbackUsed,
          durationMs,
          attempts: attemptCount
        }
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const isTransient = isTransientError(err);
      this.circuitBreaker.recordFailure(isTransient);

      console.error(
        `[GeminiProvider][${corrId}] ${taskName} failed permanently after ${attemptCount} attempts (${durationMs}ms): ${err.message}`
      );
      throw err;
    } finally {
      releaseConcurrency();
    }
  }

  /**
   * Generates a complete structured question.
   */
  async generateQuestion(options = {}) {
    const promptText = buildQuestionGenerationPrompt(options);
    const { data } = await this._executeWithRetryAndFallback({
      taskName: 'generateQuestion',
      promptText,
      responseSchema: QUESTION_GENERATION_JSON_SCHEMA,
      temperature: 0.2,
      timeoutMs: options.timeoutMs || 45000,
      maxRetries: options.maxRetries
    });
    return data;
  }

  /**
   * Regenerates a specific section while preserving context.
   */
  async regenerateSection(options = {}) {
    const { section, currentQuestion, instructions } = options;
    if (!section) {
      throw ApiError.badRequest('Section name is required for regeneration.');
    }

    const promptText = buildSectionRegenerationPrompt({
      section,
      currentQuestion: currentQuestion || {},
      instructions
    });

    let responseSchema = null;
    if (section === 'solution' || section === 'referenceSolution') {
      responseSchema = REGENERATE_SOLUTION_JSON_SCHEMA;
    } else if (section === 'starterCode') {
      responseSchema = REGENERATE_STARTER_CODE_JSON_SCHEMA;
    }

    const { data } = await this._executeWithRetryAndFallback({
      taskName: `regenerateSection(${section})`,
      promptText,
      responseSchema,
      temperature: 0.3,
      timeoutMs: options.timeoutMs || 35000,
      maxRetries: options.maxRetries
    });
    return data;
  }

  /**
   * Generates candidate test cases matching question constraints and requirements.
   */
  async generateTestCases(options = {}) {
    const promptText = buildTestCaseGenerationPrompt(options);
    const { data } = await this._executeWithRetryAndFallback({
      taskName: 'generateTestCases',
      promptText,
      responseSchema: TEST_CASE_GENERATION_JSON_SCHEMA,
      temperature: typeof options.temperature === 'number' ? options.temperature : 0.65,
      timeoutMs: options.timeoutMs || 35000,
      maxRetries: options.maxRetries
    });

    if (!data || !Array.isArray(data.testCases)) {
      throw ApiError.badGateway('Gemini test case response missing testCases array.', {
        code: 'GEMINI_MALFORMED_RESPONSE',
        data
      });
    }

    return data;
  }

  /**
   * Generates multiple-choice questions using Google Gemini with structured schema output.
   */
  async generateMcqs(options = {}) {
    const promptText = buildMcqGenerationPrompt(options);
    const { data } = await this._executeWithRetryAndFallback({
      taskName: 'generateMcqs',
      promptText,
      responseSchema: MCQ_GENERATION_JSON_SCHEMA,
      temperature: 0.3,
      timeoutMs: options.timeoutMs || 45000,
      maxRetries: options.maxRetries
    });

    if (!data || !Array.isArray(data.questions)) {
      throw ApiError.badGateway('Gemini MCQ response missing questions array.', {
        code: 'GEMINI_MALFORMED_RESPONSE',
        data
      });
    }

    return data;
  }
}

export default GeminiProvider;
