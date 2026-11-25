import Groq from 'groq-sdk';
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
import { groqCircuitBreaker } from '../circuitBreaker.js';
import { groqConcurrencyLimiter } from '../concurrencyLimiter.js';
import { executeWithRetry, isTransientError } from '../retryHelper.js';

export class GroqProvider extends AIProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.apiKey]
   * @param {string} [options.model]
   * @param {string} [options.fallbackModel]
   * @param {number} [options.maxRetries]
   * @param {Object} [options.client] - Injected Groq client for unit tests
   * @param {Object} [options.circuitBreaker] - Injected circuit breaker
   * @param {Object} [options.concurrencyLimiter] - Injected concurrency limiter
   */
  constructor(options = {}) {
    super('groq');
    this._explicitApiKey = options.apiKey !== undefined;
    this.apiKey = this._explicitApiKey
      ? options.apiKey
      : (config.ai?.groqApiKey || process.env.GROQ_API_KEY || null);
    this.modelName = options.model || config.ai?.groqModel || process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    this.fallbackModel =
      options.fallbackModel || config.ai?.groqFallbackModel || process.env.GROQ_FALLBACK_MODEL || 'openai/gpt-oss-20b';
    this.maxRetries = options.maxRetries ?? (config.ai?.groqMaxRetries ?? 2);
    this.client = options.client || null;
    this.circuitBreaker = options.circuitBreaker || groqCircuitBreaker;
    this.concurrencyLimiter = options.concurrencyLimiter || groqConcurrencyLimiter;

    if (!this.client && this.apiKey && String(this.apiKey).trim()) {
      try {
        this.client = new Groq({ apiKey: String(this.apiKey).trim() });
      } catch (err) {
        console.warn(`[GroqProvider] Warning during Groq initialization: ${err.message}`);
      }
    }
  }

  /**
   * Returns whether the Groq provider has an active API key configured.
   * @returns {boolean}
   */
  isConfigured() {
    const key = this.apiKey || process.env.GROQ_API_KEY || config.ai?.groqApiKey;
    return Boolean(key && String(key).trim());
  }

  /**
   * Asserts API key configuration before execution.
   */
  _ensureConfigured() {
    if (!this.client && !this._explicitApiKey) {
      const reloadedKey = process.env.GROQ_API_KEY || config.ai?.groqApiKey;
      if (reloadedKey && String(reloadedKey).trim()) {
        this.apiKey = String(reloadedKey).trim();
        this.modelName = process.env.GROQ_MODEL || config.ai?.groqModel || this.modelName;
        this.fallbackModel =
          process.env.GROQ_FALLBACK_MODEL || config.ai?.groqFallbackModel || this.fallbackModel;
        try {
          this.client = new Groq({ apiKey: this.apiKey });
        } catch (_) {}
      }
    }

    if (!this.client && (!this.apiKey || !String(this.apiKey).trim())) {
      throw ApiError.serviceUnavailable(
        'GROQ_API_KEY is not configured on the backend. Please configure a valid Groq API key.',
        { code: 'GROQ_API_KEY_MISSING' }
      );
    }

    if (!this.client) {
      try {
        this.client = new Groq({ apiKey: this.apiKey });
      } catch (err) {
        throw ApiError.serviceUnavailable(`Failed to initialize Groq client: ${err.message}`, {
          code: 'GROQ_CLIENT_INIT_FAILED'
        });
      }
    }
  }

  /**
   * Sanitizes sensitive secrets from error messages before exposure in logs or responses.
   * @private
   */
  _sanitizeErrorMessage(str) {
    return String(str || '')
      .replace(/gsk_[a-zA-Z0-9_\-]+/g, 'gsk_***')
      .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***')
      .replace(/[a-zA-Z0-9_\-]{30,}/g, (token) => token.startsWith('AQ.') ? 'AIza_***' : token.substring(0, 4) + '***');
  }

  /**
   * Standardizes Groq / OpenAI API errors into TestForge ApiErrors.
   */
  _handleApiError(error) {
    const rawMsg = error.message || String(error);
    const msg = this._sanitizeErrorMessage(rawMsg);
    const status = error.status || error.statusCode || error.response?.status;

    // Rate limits / Quota exceeded
    if (status === 429 || msg.includes('429') || msg.includes('rate_limit') || msg.includes('quota') || msg.includes('TPM') || msg.includes('RPM')) {
      const err = ApiError.tooManyRequests(
        'Groq AI rate limit reached. The system is managing traffic automatically.',
        { code: 'GROQ_RATE_LIMIT', originalError: msg }
      );
      err.code = 'RATE_LIMIT_EXCEEDED';
      return err;
    }

    // Invalid / Unauthorized API Key
    if (status === 401 || status === 403 || msg.includes('401') || msg.includes('invalid_api_key') || msg.includes('authentication')) {
      const err = ApiError.unauthorized(
        'Invalid or unauthorized Groq API key configured on the server.',
        { code: 'GROQ_INVALID_API_KEY', originalError: msg }
      );
      err.code = 'UNAUTHORIZED';
      return err;
    }

    // Model unavailable / Model not found
    if (status === 404 || msg.includes('model_not_found') || msg.includes('does not exist or you do not have access')) {
      const err = ApiError.serviceUnavailable(
        `Configured Groq model is currently unavailable on this API key: ${msg}`,
        { code: 'GROQ_MODEL_NOT_FOUND', originalError: msg }
      );
      err.code = 'SERVICE_UNAVAILABLE';
      return err;
    }

    // Timeouts
    if (error.name === 'AbortError' || msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('DEADLINE_EXCEEDED')) {
      return ApiError.gatewayTimeout(
        'Groq AI request timed out. Please try again.',
        { code: 'GROQ_TIMEOUT', originalError: msg }
      );
    }

    // Service Unavailable / Demand spikes
    if (status === 503 || status === 502 || status === 500 || msg.includes('503') || msg.includes('high demand') || msg.includes('overloaded')) {
      const err = ApiError.serviceUnavailable(
        'Groq AI service is temporarily experiencing high demand. Please try again shortly.',
        { code: 'GROQ_SERVICE_UNAVAILABLE', originalError: msg }
      );
      err.code = 'SERVICE_UNAVAILABLE';
      return err;
    }

    // General provider failure
    return ApiError.badGateway(
      `Groq AI generation failed: ${msg}`,
      { code: 'GROQ_API_ERROR', originalError: msg }
    );
  }

  /**
   * Resilient execution runner:
   * - Circuit breaker validation
   * - Concurrency throttling
   * - Exponential backoff with jitter
   * - Automatic secondary model fallback on transient capacity limits
   */
  async _executeWithRetryAndFallback({
    taskName,
    promptText,
    systemInstruction = 'You are an expert computer science educator and exam creator. You MUST return ONLY valid JSON matching the requested structure.',
    schemaPrompt = null,
    temperature = 0.2,
    timeoutMs = 45000,
    maxRetries = null,
    correlationId = null
  }) {
    this._ensureConfigured();

    const corrId = correlationId || `groq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const effectiveRetries = maxRetries ?? this.maxRetries;
    const primaryModel = this.modelName;
    const fallbackModel = this.fallbackModel;

    this.circuitBreaker.assertCanExecute();
    const releaseConcurrency = await this.concurrencyLimiter.acquire();

    const startTime = Date.now();
    let currentModel = primaryModel;
    let fallbackUsed = false;
    let attemptCount = 0;

    try {
      const result = await executeWithRetry(
        async (attempt) => {
          attemptCount = attempt + 1;

          if (attempt >= 1 && fallbackModel && fallbackModel !== currentModel) {
            currentModel = fallbackModel;
            fallbackUsed = true;
            console.log(
              `[GroqProvider][${corrId}] Primary model pressure encountered. Switching to fallback model: ${fallbackModel} (attempt ${attempt + 1})`
            );
          }

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);

          try {
            const systemContent = schemaPrompt
              ? `${systemInstruction}\n\nSTRICT JSON SCHEMA CONSTRAINTS:\n${typeof schemaPrompt === 'string' ? schemaPrompt : JSON.stringify(schemaPrompt, null, 2)}`
              : systemInstruction;

            const response = await this.client.chat.completions.create(
              {
                model: currentModel,
                messages: [
                  { role: 'system', content: systemContent },
                  { role: 'user', content: promptText }
                ],
                response_format: { type: 'json_object' },
                temperature,
                max_tokens: 3500
              },
              { signal: controller.signal }
            );

            clearTimeout(timer);

            const rawText = response.choices?.[0]?.message?.content;
            if (!rawText || !rawText.trim()) {
              throw ApiError.badGateway('Groq returned an empty response.', { code: 'GROQ_EMPTY_RESPONSE' });
            }

            let parsedData;
            try {
              parsedData = JSON.parse(rawText.trim());
            } catch (parseErr) {
              throw ApiError.badGateway(`Groq response is not valid JSON: ${parseErr.message}`, {
                code: 'GROQ_MALFORMED_RESPONSE',
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
          baseDelayMs: 800,
          maxDelayMs: 8000,
          onRetry: ({ attempt, delayMs, error }) => {
            console.warn(
              `[GroqProvider][${corrId}] ${taskName} attempt ${attempt}/${effectiveRetries} failed with ${error.statusCode || error.message}. Retrying in ${delayMs}ms using ${fallbackUsed ? fallbackModel : primaryModel}...`
            );
          }
        }
      );

      this.circuitBreaker.recordSuccess();

      const durationMs = Date.now() - startTime;
      console.log(
        `[GroqProvider][${corrId}] ${taskName} completed in ${durationMs}ms [model=${currentModel}, fallback=${fallbackUsed}, attempts=${attemptCount}]`
      );

      return {
        data: result,
        telemetry: {
          correlationId: corrId,
          provider: 'groq',
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
        `[GroqProvider][${corrId}] ${taskName} failed permanently after ${attemptCount} attempts (${durationMs}ms): ${err.message}`
      );
      throw err;
    } finally {
      releaseConcurrency();
    }
  }

  /**
   * Generates a complete structured coding question.
   */
  async generateQuestion(options = {}) {
    const promptText = buildQuestionGenerationPrompt(options);
    const { data } = await this._executeWithRetryAndFallback({
      taskName: 'generateQuestion',
      promptText,
      schemaPrompt: QUESTION_GENERATION_JSON_SCHEMA,
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

    let schemaPrompt = null;
    if (section === 'solution' || section === 'referenceSolution') {
      schemaPrompt = REGENERATE_SOLUTION_JSON_SCHEMA;
    } else if (section === 'starterCode') {
      schemaPrompt = REGENERATE_STARTER_CODE_JSON_SCHEMA;
    }

    const { data } = await this._executeWithRetryAndFallback({
      taskName: `regenerateSection(${section})`,
      promptText,
      schemaPrompt,
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
      schemaPrompt: TEST_CASE_GENERATION_JSON_SCHEMA,
      temperature: typeof options.temperature === 'number' ? options.temperature : 0.65,
      timeoutMs: options.timeoutMs || 35000,
      maxRetries: options.maxRetries
    });

    if (!data || !Array.isArray(data.testCases)) {
      throw ApiError.badGateway('Groq test case response missing testCases array.', {
        code: 'GROQ_MALFORMED_RESPONSE',
        data
      });
    }

    return data;
  }

  /**
   * Generates multiple-choice questions with structured outputs.
   */
  async generateMcqs(options = {}) {
    const promptText = buildMcqGenerationPrompt(options);
    const { data } = await this._executeWithRetryAndFallback({
      taskName: 'generateMcqs',
      promptText,
      schemaPrompt: MCQ_GENERATION_JSON_SCHEMA,
      temperature: 0.3,
      timeoutMs: options.timeoutMs || 45000,
      maxRetries: options.maxRetries
    });

    if (!data || !Array.isArray(data.questions)) {
      throw ApiError.badGateway('Groq MCQ response missing questions array.', {
        code: 'GROQ_MALFORMED_RESPONSE',
        data
      });
    }

    return data;
  }

  /**
   * Generates comprehensive educational explanation.
   */
  async generateExplanation(options = {}) {
    const { question, language, studentCode } = options;
    const promptText = `Analyze the following coding problem or question and provide a clear, educational, step-by-step explanation.

Problem Title: ${question?.title || 'Coding Problem'}
Problem Statement: ${question?.statement || question?.q || 'N/A'}
Language: ${language || question?.language || 'python'}
${studentCode ? `Student Code Attempt:\n\`\`\`\n${studentCode}\n\`\`\`` : ''}

Provide a JSON object with:
- "explanation": Comprehensive, lucid explanation of the concept, optimal algorithm, and time/space complexity.
- "keyTakeaways": Array of 2 to 4 bullet points summarizing the core computer science concepts.`;

    const schema = {
      type: 'object',
      properties: {
        explanation: { type: 'string' },
        keyTakeaways: { type: 'array', items: { type: 'string' } }
      },
      required: ['explanation']
    };

    const { data } = await this._executeWithRetryAndFallback({
      taskName: 'generateExplanation',
      promptText,
      schemaPrompt: schema,
      temperature: 0.2,
      timeoutMs: options.timeoutMs || 35000,
      maxRetries: options.maxRetries
    });
    return data;
  }

  /**
   * Generates progressive non-spoiling hints.
   */
  async generateHints(options = {}) {
    const { question, studentCode, hintLevel = 1 } = options;
    const promptText = `Problem Title: ${question?.title || 'Coding Challenge'}
Problem Statement: ${question?.statement || 'N/A'}
${studentCode ? `Current Student Code:\n\`\`\`\n${studentCode}\n\`\`\`` : ''}

Generate progressive hints that guide without revealing the full solution directly.
Target hint level requested: ${hintLevel} (1: subtle conceptual clue, 2: algorithmic strategy/data structure, 3: pseudocode walkthrough).

Return a JSON object:
{
  "hints": [
    { "level": 1, "title": "Conceptual Clue", "hint": "..." },
    { "level": 2, "title": "Algorithmic Strategy", "hint": "..." },
    { "level": 3, "title": "Logic Breakdown", "hint": "..." }
  ]
}`;

    const schema = {
      type: 'object',
      properties: {
        hints: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              level: { type: 'integer' },
              title: { type: 'string' },
              hint: { type: 'string' }
            },
            required: ['level', 'title', 'hint']
          }
        }
      },
      required: ['hints']
    };

    const { data } = await this._executeWithRetryAndFallback({
      taskName: 'generateHints',
      promptText,
      schemaPrompt: schema,
      temperature: 0.3,
      timeoutMs: options.timeoutMs || 30000,
      maxRetries: options.maxRetries
    });
    return data;
  }

  /**
   * Reviews and suggests improvements for question clarity and edge case coverage.
   */
  async improveQuestion(options = {}) {
    const { question, instructions = '' } = options;
    const promptText = `Review the following question draft for clarity, ambiguity, constraint consistency, and edge case gaps.

Problem Title: ${question?.title || 'Untitled'}
Statement: ${question?.statement || 'N/A'}
Constraints: ${question?.constraints || 'None specified'}
${instructions ? `Teacher Review Instructions: ${instructions}` : ''}

Return a JSON object:
{
  "suggestions": ["Suggestion 1", "Suggestion 2"],
  "refinedStatement": "Optional improved version of the statement if needed",
  "missingEdgeCases": ["Edge case 1 (e.g. empty array)", "Edge case 2 (e.g. negative numbers)"]
}`;

    const schema = {
      type: 'object',
      properties: {
        suggestions: { type: 'array', items: { type: 'string' } },
        refinedStatement: { type: 'string' },
        missingEdgeCases: { type: 'array', items: { type: 'string' } }
      },
      required: ['suggestions']
    };

    const { data } = await this._executeWithRetryAndFallback({
      taskName: 'improveQuestion',
      promptText,
      schemaPrompt: schema,
      temperature: 0.2,
      timeoutMs: options.timeoutMs || 35000,
      maxRetries: options.maxRetries
    });
    return data;
  }
}

export default GroqProvider;
