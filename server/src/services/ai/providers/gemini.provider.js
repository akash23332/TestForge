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
import { config } from '../../../config/env.js';
import { ApiError } from '../../../utils/apiError.js';

export class GeminiProvider extends AIProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.apiKey]
   * @param {string} [options.model]
   * @param {Object} [options.client] - Injected client for unit tests
   */
  constructor(options = {}) {
    super('gemini');
    this._explicitApiKey = options.apiKey !== undefined;
    this.apiKey = this._explicitApiKey ? options.apiKey : (config.ai?.geminiApiKey || process.env.GEMINI_API_KEY || null);
    this.modelName = options.model || config.ai?.geminiModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.client = options.client || null;

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
    // If client is missing or unconfigured and apiKey was not explicitly set, attempt dynamic reload from environment
    if (!this.client && !this._explicitApiKey) {
      const reloadedKey = process.env.GEMINI_API_KEY || config.ai?.geminiApiKey;
      if (reloadedKey && String(reloadedKey).trim()) {
        this.apiKey = String(reloadedKey).trim();
        this.modelName = process.env.GEMINI_MODEL || config.ai?.geminiModel || this.modelName;
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
      return ApiError.tooManyRequests(
        'Gemini API rate limit exceeded. Please wait a moment before generating again.',
        { code: 'GEMINI_RATE_LIMIT', originalError: msg }
      );
    }

    // Invalid / Expired API Key
    if (status === 401 || status === 403 || msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('permission')) {
      return ApiError.unauthorized(
        'Invalid or unauthorized Gemini API key configured on the server.',
        { code: 'GEMINI_INVALID_API_KEY', originalError: msg }
      );
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
      return ApiError.serviceUnavailable(
        'Gemini API is temporarily experiencing high demand. Please try again shortly.',
        { code: 'GEMINI_SERVICE_UNAVAILABLE', originalError: msg }
      );
    }

    // General provider failure
    return ApiError.badGateway(
      `Gemini AI generation failed: ${msg}`,
      { code: 'GEMINI_API_ERROR', originalError: msg }
    );
  }

  /**
   * Generates a complete structured question.
   */
  async generateQuestion(options = {}) {
    this._ensureConfigured();

    const promptText = buildQuestionGenerationPrompt(options);
    const timeoutMs = options.timeoutMs || 45000;
    const maxRetries = options.maxRetries ?? 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await this.client.models.generateContent({
          model: this.modelName,
          contents: promptText,
          config: {
            responseMimeType: 'application/json',
            responseSchema: QUESTION_GENERATION_JSON_SCHEMA,
            temperature: 0.2
          }
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
            rawText
          });
        }

        return parsedData;
      } catch (err) {
        clearTimeout(timer);
        const mappedError = err instanceof ApiError ? err : this._handleApiError(err);
        const isTransient = mappedError.statusCode === 503 || mappedError.details?.code === 'GEMINI_SERVICE_UNAVAILABLE';
        if (isTransient && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
          continue;
        }
        throw mappedError;
      }
    }
  }

  /**
   * Regenerates a specific section while preserving context.
   */
  async regenerateSection(options = {}) {
    this._ensureConfigured();

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

    const timeoutMs = options.timeoutMs || 35000;
    const maxRetries = options.maxRetries ?? 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await this.client.models.generateContent({
          model: this.modelName,
          contents: promptText,
          config: {
            responseMimeType: 'application/json',
            ...(responseSchema && { responseSchema }),
            temperature: 0.3
          }
        });
        clearTimeout(timer);

        const rawText = response.text || (typeof response.text === 'function' ? response.text() : '');
        if (!rawText || !rawText.trim()) {
          throw ApiError.badGateway('Gemini returned an empty response for section regeneration.', {
            code: 'GEMINI_EMPTY_RESPONSE'
          });
        }

        let parsedData;
        try {
          parsedData = JSON.parse(rawText.trim());
        } catch (parseErr) {
          throw ApiError.badGateway(`Gemini section response is not valid JSON: ${parseErr.message}`, {
            code: 'GEMINI_MALFORMED_RESPONSE',
            rawText
          });
        }

        return parsedData;
      } catch (err) {
        clearTimeout(timer);
        const mappedError = err instanceof ApiError ? err : this._handleApiError(err);
        const isTransient = mappedError.statusCode === 503 || mappedError.details?.code === 'GEMINI_SERVICE_UNAVAILABLE';
        if (isTransient && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
          continue;
        }
        throw mappedError;
      }
    }
  }

  /**
   * Generates candidate test cases matching question constraints and requirements.
   *
   * @param {Object} options
   * @param {Object} options.question
   * @param {number} [options.count=5]
   * @param {string} [options.category='all']
   * @param {string} [options.instructions='']
   * @param {Array<string>} [options.existingInputs=[]]
   * @param {number} [options.timeoutMs=35000]
   * @param {number} [options.maxRetries=2]
   * @returns {Promise<{ testCases: Array<Object> }>}
   */
  async generateTestCases(options = {}) {
    this._ensureConfigured();

    const promptText = buildTestCaseGenerationPrompt(options);
    const timeoutMs = options.timeoutMs || 35000;
    const maxRetries = options.maxRetries ?? 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await this.client.models.generateContent({
          model: this.modelName,
          contents: promptText,
          config: {
            responseMimeType: 'application/json',
            responseSchema: TEST_CASE_GENERATION_JSON_SCHEMA,
            temperature: typeof options.temperature === 'number' ? options.temperature : 0.65
          }
        });
        clearTimeout(timer);

        const rawText = response.text || (typeof response.text === 'function' ? response.text() : '');
        if (!rawText || !rawText.trim()) {
          throw ApiError.badGateway('Gemini returned an empty response for test case generation.', {
            code: 'GEMINI_EMPTY_RESPONSE'
          });
        }

        let parsedData;
        try {
          parsedData = JSON.parse(rawText.trim());
        } catch (parseErr) {
          throw ApiError.badGateway(`Gemini test case response is not valid JSON: ${parseErr.message}`, {
            code: 'GEMINI_MALFORMED_RESPONSE',
            rawText
          });
        }

        if (!parsedData || !Array.isArray(parsedData.testCases)) {
          throw ApiError.badGateway('Gemini test case response missing testCases array.', {
            code: 'GEMINI_MALFORMED_RESPONSE',
            parsedData
          });
        }

        return parsedData;
      } catch (err) {
        clearTimeout(timer);
        const mappedError = err instanceof ApiError ? err : this._handleApiError(err);
        const isTransient = mappedError.statusCode === 503 || mappedError.details?.code === 'GEMINI_SERVICE_UNAVAILABLE';
        if (isTransient && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
          continue;
        }
        throw mappedError;
      }
    }
  }
}

export default GeminiProvider;
