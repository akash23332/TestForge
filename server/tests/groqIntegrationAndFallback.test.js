import { jest } from '@jest/globals';
import { GroqProvider } from '../src/services/ai/providers/groq.provider.js';
import { GeminiProvider } from '../src/services/ai/providers/gemini.provider.js';
import { AIProviderManager } from '../src/services/ai/aiProviderManager.js';
import { CircuitBreaker } from '../src/services/ai/circuitBreaker.js';
import { ConcurrencyLimiter } from '../src/services/ai/concurrencyLimiter.js';
import { validateGeneratedQuestion } from '../src/services/ai/questionValidator.service.js';
import { validateMcqCandidate } from '../src/services/ai/mcqValidator.service.js';
import { ApiError } from '../src/utils/apiError.js';

describe('Groq Integration & Provider Architecture Suite', () => {
  describe('GroqProvider Unit & Error Mapping', () => {
    it('initializes with default model and fallback model', () => {
      const provider = new GroqProvider({ apiKey: 'mock_key' });
      expect(provider.name).toBe('groq');
      expect(provider.modelName).toBe('openai/gpt-oss-120b');
      expect(provider.fallbackModel).toBe('openai/gpt-oss-20b');
      expect(provider.isConfigured()).toBe(true);
    });

    it('throws ApiError 503 if API key is not configured', async () => {
      const provider = new GroqProvider({ apiKey: '' });
      await expect(provider.generateQuestion({ topic: 'Graphs' })).rejects.toThrow(
        /GROQ_API_KEY is not configured/
      );
    });

    it('maps 429 rate limit errors to ApiError 429 RATE_LIMIT_EXCEEDED', () => {
      const provider = new GroqProvider({ apiKey: 'mock_key' });
      const err = provider._handleApiError({ status: 429, message: 'Rate limit reached: TPM exceeded' });
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('maps 401 unauthorized errors to ApiError 401 UNAUTHORIZED', () => {
      const provider = new GroqProvider({ apiKey: 'mock_key' });
      const err = provider._handleApiError({ status: 401, message: 'Invalid API Key' });
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
    });

    it('maps timeout errors to ApiError 504 GATEWAY_TIMEOUT', () => {
      const provider = new GroqProvider({ apiKey: 'mock_key' });
      const err = provider._handleApiError({ name: 'AbortError', message: 'The operation was aborted due to timeout' });
      expect(err.statusCode).toBe(504);
      expect(err.code).toBe('GATEWAY_TIMEOUT');
    });

    it('maps 503 high demand errors to ApiError 503 SERVICE_UNAVAILABLE', () => {
      const provider = new GroqProvider({ apiKey: 'mock_key' });
      const err = provider._handleApiError({ status: 503, message: 'Service unavailable due to high demand' });
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('switches to fallback model on retry attempt', async () => {
      let callCount = 0;
      let usedModels = [];

      const mockClient = {
        chat: {
          completions: {
            create: jest.fn().mockImplementation(async (opts) => {
              callCount++;
              usedModels.push(opts.model);
              if (callCount === 1) {
                const err = new Error('503 Service Unavailable: overloaded');
                err.status = 503;
                throw err;
              }
              return {
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        title: 'Fallback Array Problem',
                        statement: 'Solve this',
                        difficulty: 'Easy',
                        functionName: 'solve',
                        functionSignature: { parameters: [], returnType: 'void' },
                        starterCode: 'def solve(): pass',
                        referenceSolution: 'def solve(): pass',
                        sampleTestCase: { input: '1', expectedOutput: '1' }
                      })
                    }
                  }
                ]
              };
            })
          }
        }
      };

      const breaker = new CircuitBreaker({ name: 'TestBreaker' });
      const limiter = new ConcurrencyLimiter({ name: 'TestLimiter' });

      const provider = new GroqProvider({
        apiKey: 'test_key',
        model: 'openai/gpt-oss-120b',
        fallbackModel: 'openai/gpt-oss-20b',
        client: mockClient,
        circuitBreaker: breaker,
        concurrencyLimiter: limiter,
        maxRetries: 2
      });

      const res = await provider.generateQuestion({ topic: 'Arrays' });
      expect(res.title).toBe('Fallback Array Problem');
      expect(callCount).toBe(2);
      expect(usedModels[0]).toBe('openai/gpt-oss-120b');
      expect(usedModels[1]).toBe('openai/gpt-oss-20b');
    });
  });

  describe('Centralized AIProviderManager Fallback Logic', () => {
    it('uses Groq first in auto mode when Groq succeeds', async () => {
      const mockGroq = {
        name: 'groq',
        isConfigured: () => true,
        generateQuestion: jest.fn().mockResolvedValue({
          title: 'Groq Question',
          statement: 'Generated via Groq',
          functionName: 'solve'
        })
      };
      const mockGemini = {
        name: 'gemini',
        generateQuestion: jest.fn().mockResolvedValue({
          title: 'Gemini Question'
        })
      };

      const manager = new AIProviderManager({
        groqProvider: mockGroq,
        geminiProvider: mockGemini,
        mode: 'auto'
      });

      const result = await manager.generateQuestion({ topic: 'Recursion' });
      expect(result.title).toBe('Groq Question');
      expect(mockGroq.generateQuestion).toHaveBeenCalledTimes(1);
      expect(mockGemini.generateQuestion).not.toHaveBeenCalled();
    });

    it('falls back to Gemini when Groq throws 429 rate limit error', async () => {
      const rateLimitError = ApiError.tooManyRequests('Rate limit exceeded', { code: 'GROQ_RATE_LIMIT' });

      const mockGroq = {
        name: 'groq',
        isConfigured: () => true,
        generateQuestion: jest.fn().mockRejectedValue(rateLimitError)
      };
      const mockGemini = {
        name: 'gemini',
        generateQuestion: jest.fn().mockResolvedValue({
          title: 'Gemini Fallback Question',
          statement: 'Generated via Gemini Fallback'
        })
      };

      const manager = new AIProviderManager({
        groqProvider: mockGroq,
        geminiProvider: mockGemini,
        mode: 'auto'
      });

      const result = await manager.generateQuestion({ topic: 'Recursion' });
      expect(result.title).toBe('Gemini Fallback Question');
      expect(mockGroq.generateQuestion).toHaveBeenCalledTimes(1);
      expect(mockGemini.generateQuestion).toHaveBeenCalledTimes(1);
    });

    it('falls back to Gemini when Groq circuit breaker is open or 503 received', async () => {
      const serviceUnavailable = ApiError.serviceUnavailable('Service busy', { code: 'GROQ_SERVICE_UNAVAILABLE' });

      const mockGroq = {
        name: 'groq',
        isConfigured: () => true,
        generateMcqs: jest.fn().mockRejectedValue(serviceUnavailable)
      };
      const mockGemini = {
        name: 'gemini',
        generateMcqs: jest.fn().mockResolvedValue({
          questions: [{ statement: 'Gemini MCQ' }]
        })
      };

      const manager = new AIProviderManager({
        groqProvider: mockGroq,
        geminiProvider: mockGemini,
        mode: 'auto'
      });

      const result = await manager.generateMcqs({ topic: 'Trees' });
      expect(result.questions[0].statement).toBe('Gemini MCQ');
      expect(mockGroq.generateMcqs).toHaveBeenCalledTimes(1);
      expect(mockGemini.generateMcqs).toHaveBeenCalledTimes(1);
    });

    it('routes directly to Gemini if Groq is unconfigured', async () => {
      const mockGroq = {
        name: 'groq',
        isConfigured: () => false,
        generateQuestion: jest.fn()
      };
      const mockGemini = {
        name: 'gemini',
        generateQuestion: jest.fn().mockResolvedValue({
          title: 'Direct Gemini Question'
        })
      };

      const manager = new AIProviderManager({
        groqProvider: mockGroq,
        geminiProvider: mockGemini,
        mode: 'auto'
      });

      const result = await manager.generateQuestion({ topic: 'DP' });
      expect(result.title).toBe('Direct Gemini Question');
      expect(mockGroq.generateQuestion).not.toHaveBeenCalled();
      expect(mockGemini.generateQuestion).toHaveBeenCalledTimes(1);
    });

    it('throws error without infinite loop when both providers fail', async () => {
      const groqErr = ApiError.serviceUnavailable('Groq down', { code: 'GROQ_SERVICE_UNAVAILABLE' });
      const geminiErr = ApiError.serviceUnavailable('Gemini down', { code: 'GEMINI_SERVICE_UNAVAILABLE' });

      const mockGroq = {
        name: 'groq',
        isConfigured: () => true,
        generateQuestion: jest.fn().mockRejectedValue(groqErr)
      };
      const mockGemini = {
        name: 'gemini',
        generateQuestion: jest.fn().mockRejectedValue(geminiErr)
      };

      const manager = new AIProviderManager({
        groqProvider: mockGroq,
        geminiProvider: mockGemini,
        mode: 'auto'
      });

      await expect(manager.generateQuestion({ topic: 'Graphs' })).rejects.toThrow('Gemini down');
      expect(mockGroq.generateQuestion).toHaveBeenCalledTimes(1);
      expect(mockGemini.generateQuestion).toHaveBeenCalledTimes(1);
    });
  });

  describe('Live Groq API Feature End-to-End Tests', () => {
    const hasLiveKey = Boolean(process.env.GROQ_API_KEY && String(process.env.GROQ_API_KEY).startsWith('gsk_'));

    (hasLiveKey ? it : it.skip)('generates valid MCQs using live Groq model and passes validator', async () => {
      const provider = new GroqProvider({ apiKey: process.env.GROQ_API_KEY });
      const result = await provider.generateMcqs({
        subject: 'Computer Science',
        topic: 'Binary Search Trees',
        count: 2,
        difficulty: 'Medium',
        style: 'conceptual',
        bloomLevel: 'Apply'
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.questions)).toBe(true);
      expect(result.questions.length).toBeGreaterThanOrEqual(1);

      const candidate = result.questions[0];
      const validation = validateMcqCandidate(candidate, { subject: 'Computer Science', topic: 'Binary Search Trees' });
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(['A', 'B', 'C', 'D']).toContain(validation.data.correctAnswer);
      expect(validation.data.options).toHaveLength(4);
    }, 45000);

    (hasLiveKey ? it : it.skip)('generates valid coding question using live Groq model and passes validator', async () => {
      const provider = new GroqProvider({ apiKey: process.env.GROQ_API_KEY });
      const raw = await provider.generateQuestion({
        topic: 'Arrays and Two Pointers',
        difficulty: 'Easy',
        language: 'python',
        executionMode: 'FUNCTION',
        requirements: 'Two sum sorted'
      });

      expect(raw).toBeDefined();
      expect(raw.title).toBeTruthy();
      expect(raw.functionName).toBeTruthy();

      const validated = validateGeneratedQuestion(raw, { language: 'python', executionMode: 'FUNCTION' });
      expect(validated.title).toBeTruthy();
      expect(validated.starterCode).toContain(raw.functionName);
      expect(validated.referenceSolution).toContain(raw.functionName);
      expect(validated.sampleTestCase).toBeDefined();
      expect(validated.sampleTestCase.input).toBeTruthy();
      expect(validated.sampleTestCase.expectedOutput).toBeTruthy();
    }, 45000);

    (hasLiveKey ? it : it.skip)('generates valid candidate test cases using live Groq model', async () => {
      const provider = new GroqProvider({ apiKey: process.env.GROQ_API_KEY });
      const result = await provider.generateTestCases({
        question: {
          title: 'Palindrome Number',
          statement: 'Given an integer x, return true if x is a palindrome, and false otherwise.',
          language: 'python',
          executionMode: 'FUNCTION',
          functionName: 'isPalindrome',
          sampleTestCase: { input: '121', expectedOutput: 'true' }
        },
        count: 3
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.testCases)).toBe(true);
      expect(result.testCases.length).toBeGreaterThanOrEqual(1);
      expect(result.testCases[0].input).toBeDefined();
    }, 45000);

    (hasLiveKey ? it : it.skip)('generates educational explanation and progressive hints using live Groq model', async () => {
      const provider = new GroqProvider({ apiKey: process.env.GROQ_API_KEY });
      const exp = await provider.generateExplanation({
        question: {
          title: 'Two Sum',
          statement: 'Given an array of integers and a target, return indices of two numbers that add up to target.'
        },
        language: 'python'
      });

      expect(exp).toBeDefined();
      expect(typeof exp.explanation).toBe('string');
      expect(exp.explanation.length).toBeGreaterThan(30);

      const hints = await provider.generateHints({
        question: {
          title: 'Two Sum',
          statement: 'Given an array of integers and a target, return indices of two numbers that add up to target.'
        },
        hintLevel: 1
      });

      expect(hints).toBeDefined();
      expect(Array.isArray(hints.hints)).toBe(true);
      expect(hints.hints.length).toBeGreaterThanOrEqual(1);
    }, 45000);

    (hasLiveKey ? it : it.skip)('generates question improvement suggestions using live Groq model', async () => {
      const provider = new GroqProvider({ apiKey: process.env.GROQ_API_KEY });
      const imp = await provider.improveQuestion({
        question: {
          title: 'Sort an Array',
          statement: 'Sort the given array in ascending order.',
          constraints: '1 <= nums.length <= 1000'
        }
      });

      expect(imp).toBeDefined();
      expect(Array.isArray(imp.suggestions)).toBe(true);
      expect(imp.suggestions.length).toBeGreaterThanOrEqual(1);
    }, 45000);
  });

  describe('Security & Zero-Leak Credential Verification', () => {
    it('never leaks GROQ_API_KEY in error objects or telemetry', () => {
      const provider = new GroqProvider({ apiKey: 'gsk_super_secret_test_key_123456789' });
      const err = provider._handleApiError({
        status: 401,
        message: 'Invalid API key gsk_super_secret_test_key_123456789 provided in Bearer authorization'
      });

      const serialized = JSON.stringify(err);
      expect(serialized).not.toContain('gsk_super_secret_test_key_123456789');
    });
  });
});
