import { jest } from '@jest/globals';
import { GeminiProvider } from '../src/services/ai/providers/gemini.provider.js';
import { CircuitBreaker, CircuitState } from '../src/services/ai/circuitBreaker.js';
import { ConcurrencyLimiter } from '../src/services/ai/concurrencyLimiter.js';
import { isTransientError, calculateBackoffWithJitter, executeWithRetry } from '../src/services/ai/retryHelper.js';
import { ApiError } from '../src/utils/apiError.js';

describe('Gemini Resilience & Provider Reliability Suite (Phases 2-8)', () => {
  jest.setTimeout(30000);

  // ── 1. TRANSIENT ERROR CLASSIFICATION ──────────────────────────────────────
  describe('Transient Error Classifier & Backoff', () => {
    it('correctly classifies 503, 429, 500, timeouts as transient', () => {
      expect(isTransientError({ status: 503, message: 'High demand' })).toBe(true);
      expect(isTransientError({ status: 429, message: 'RESOURCE_EXHAUSTED' })).toBe(true);
      expect(isTransientError({ status: 500, message: 'Internal error' })).toBe(true);
      expect(isTransientError({ status: 504, message: 'Gateway Timeout' })).toBe(true);
      expect(isTransientError({ name: 'AbortError', message: 'The user aborted a request.' })).toBe(true);
      expect(isTransientError(new Error('fetch failed: connect ETIMEDOUT'))).toBe(true);
    });

    it('classifies 400, 401, 403, 404 as non-transient', () => {
      expect(isTransientError({ status: 400, message: 'Bad Request' })).toBe(false);
      expect(isTransientError({ status: 401, message: 'API_KEY_INVALID' })).toBe(false);
      expect(isTransientError({ status: 403, message: 'Permission Denied' })).toBe(false);
      expect(isTransientError({ status: 404, message: 'Model not found' })).toBe(false);
    });

    it('calculates exponential backoff within bounds and adds jitter', () => {
      const delay0 = calculateBackoffWithJitter(0, { baseDelayMs: 1000, jitterRatio: 0.2 });
      expect(delay0).toBeGreaterThanOrEqual(800);
      expect(delay0).toBeLessThanOrEqual(1200);

      const delay1 = calculateBackoffWithJitter(1, { baseDelayMs: 1000, jitterRatio: 0.2 });
      expect(delay1).toBeGreaterThanOrEqual(1600);
      expect(delay1).toBeLessThanOrEqual(2400);

      const delay2 = calculateBackoffWithJitter(2, { baseDelayMs: 1000, jitterRatio: 0.2 });
      expect(delay2).toBeGreaterThanOrEqual(3200);
      expect(delay2).toBeLessThanOrEqual(4800);
    });
  });

  // ── 2. RETRY SYSTEM WITH MOCK CLIENT ───────────────────────────────────────
  describe('Smart Retry & Fallback Execution', () => {
    it('retries on 503 high demand and succeeds on attempt 2 using fallback model', async () => {
      const callLog = [];
      const mockClient = {
        models: {
          generateContent: jest.fn().mockImplementation(async ({ model }) => {
            callLog.push(model);
            if (callLog.length === 1) {
              // First attempt on primary fails with 503
              const err = new Error('This model is currently experiencing high demand.');
              err.status = 503;
              throw err;
            }
            // Second attempt on fallback succeeds
            return {
              text: JSON.stringify({
                title: 'Two Sum',
                statement: 'Find two indices that sum to target',
                starterCode: 'function twoSum(){}',
                referenceSolution: 'function twoSum(){ return [0,1]; }',
                difficulty: 'Easy',
                tags: ['array'],
                sampleTestCase: { input: '[2,7,11,15]\n9', expectedOutput: '[0,1]' }
              })
            };
          })
        }
      };

      const testBreaker = new CircuitBreaker({ name: 'TestBreaker' });
      const testLimiter = new ConcurrencyLimiter({ maxConcurrent: 2 });

      const provider = new GeminiProvider({
        apiKey: 'test_key',
        model: 'gemini-3.5-flash',
        fallbackModel: 'gemini-3.5-flash-lite',
        client: mockClient,
        circuitBreaker: testBreaker,
        concurrencyLimiter: testLimiter,
        maxRetries: 2
      });

      const question = await provider.generateQuestion({ topic: 'Array', difficulty: 'Easy' });

      expect(question.title).toBe('Two Sum');
      expect(mockClient.models.generateContent).toHaveBeenCalledTimes(2);
      expect(callLog[0]).toBe('gemini-3.5-flash'); // Primary
      expect(callLog[1]).toBe('gemini-3.5-flash-lite'); // Fallback
      expect(testBreaker.state).toBe(CircuitState.CLOSED);
    });

    it('immediately throws non-transient 401 error without wasting retries', async () => {
      const mockClient = {
        models: {
          generateContent: jest.fn().mockImplementation(async () => {
            const err = new Error('API key not valid. Please pass a valid API key.');
            err.status = 401;
            throw err;
          })
        }
      };

      const provider = new GeminiProvider({
        apiKey: 'invalid_key',
        client: mockClient,
        maxRetries: 3
      });

      await expect(provider.generateQuestion({ topic: 'Trees' })).rejects.toThrow();
      // Must only be called 1 time: NO retries for 401
      expect(mockClient.models.generateContent).toHaveBeenCalledTimes(1);
    });

    it('retries on 429 rate limit and exhausts retries if outage persists', async () => {
      const mockClient = {
        models: {
          generateContent: jest.fn().mockImplementation(async () => {
            const err = new Error('RESOURCE_EXHAUSTED: quota exceeded');
            err.status = 429;
            throw err;
          })
        }
      };

      const provider = new GeminiProvider({
        apiKey: 'test_key',
        client: mockClient,
        maxRetries: 2
      });

      await expect(provider.generateQuestion({ topic: 'Graphs' })).rejects.toThrow();
      // Initial attempt + 2 retries = 3 calls
      expect(mockClient.models.generateContent).toHaveBeenCalledTimes(3);
    });

    it('throws GEMINI_MALFORMED_RESPONSE when model returns non-JSON text', async () => {
      const mockClient = {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: 'I cannot generate this problem as requested.'
          })
        }
      };

      const provider = new GeminiProvider({
        apiKey: 'test_key',
        client: mockClient,
        maxRetries: 1
      });

      await expect(provider.generateQuestion({ topic: 'Sorting' })).rejects.toThrow(/not valid JSON/);
    });
  });

  // ── 3. CIRCUIT BREAKER SPECIFICATION ───────────────────────────────────────
  describe('Circuit Breaker Resilience', () => {
    it('transitions from CLOSED to OPEN after reaching failure threshold', () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
      expect(breaker.state).toBe(CircuitState.CLOSED);

      breaker.recordFailure(true);
      expect(breaker.state).toBe(CircuitState.CLOSED);
      expect(breaker.consecutiveFailures).toBe(1);

      breaker.recordFailure(true);
      expect(breaker.state).toBe(CircuitState.CLOSED);
      expect(breaker.consecutiveFailures).toBe(2);

      breaker.recordFailure(true);
      // Reached 3 failures -> Trips to OPEN
      expect(breaker.state).toBe(CircuitState.OPEN);
      expect(breaker.consecutiveFailures).toBe(3);

      // Subsequent assertCanExecute throws fast-fail without touching provider
      expect(() => breaker.assertCanExecute()).toThrow(/AI generation is temporarily busy/);
    });

    it('transitions to HALF_OPEN after cooldown and recovers to CLOSED on success', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 50 });
      breaker.recordFailure(true);
      breaker.recordFailure(true);
      expect(breaker.state).toBe(CircuitState.OPEN);

      // Wait for cooldown
      await new Promise((r) => setTimeout(r, 60));

      // assertCanExecute should allow the trial canary and transition to HALF_OPEN
      expect(() => breaker.assertCanExecute()).not.toThrow();
      expect(breaker.state).toBe(CircuitState.HALF_OPEN);

      // Canary succeeds
      breaker.recordSuccess();
      expect(breaker.state).toBe(CircuitState.CLOSED);
      expect(breaker.consecutiveFailures).toBe(0);
    });

    it('trips back to OPEN if canary fails in HALF_OPEN', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 50 });
      breaker.recordFailure(true);
      breaker.recordFailure(true);
      expect(breaker.state).toBe(CircuitState.OPEN);

      await new Promise((r) => setTimeout(r, 60));
      breaker.assertCanExecute(); // Becomes HALF_OPEN

      // Canary fails
      breaker.recordFailure(true);
      expect(breaker.state).toBe(CircuitState.OPEN);
    });
  });

  // ── 4. CONCURRENCY LIMITER SPECIFICATION ───────────────────────────────────
  describe('Concurrency Limiter (Semaphore)', () => {
    it('permits up to maxConcurrent calls simultaneously and queues excess', async () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrent: 2, queueTimeoutMs: 2000 });
      expect(limiter.getStatus().activeCount).toBe(0);

      const release1 = await limiter.acquire();
      expect(limiter.getStatus().activeCount).toBe(1);

      const release2 = await limiter.acquire();
      expect(limiter.getStatus().activeCount).toBe(2);

      // 3rd call is queued
      let acquired3 = false;
      const promise3 = limiter.acquire().then((rel) => {
        acquired3 = true;
        return rel;
      });

      expect(limiter.getStatus().activeCount).toBe(2);
      expect(limiter.getStatus().queuedCount).toBe(1);
      expect(acquired3).toBe(false);

      // Release slot 1 -> slot 3 gets dequeued
      release1();
      const release3 = await promise3;
      expect(acquired3).toBe(true);
      expect(limiter.getStatus().activeCount).toBe(2);
      expect(limiter.getStatus().queuedCount).toBe(0);

      release2();
      release3();
      expect(limiter.getStatus().activeCount).toBe(0);
    });
  });

  // ── 5. MCQ GENERATION & TEST CASES INTEGRATION ────────────────────────────
  describe('MCQ & TestCase Endpoints Resilient Execution', () => {
    it('executes generateMcqs cleanly using fallback model upon primary 503', async () => {
      let callCount = 0;
      const mockClient = {
        models: {
          generateContent: jest.fn().mockImplementation(async ({ model }) => {
            callCount++;
            if (callCount === 1) {
              const err = new Error('503 Service Unavailable: High demand');
              err.status = 503;
              throw err;
            }
            return {
              text: JSON.stringify({
                questions: [
                  {
                    statement: 'What is the time complexity of QuickSort average case?',
                    options: [
                      { id: 'A', text: 'O(n log n)' },
                      { id: 'B', text: 'O(n^2)' }
                    ],
                    correctAnswers: ['A'],
                    explanation: 'Average case QuickSort divides arrays evenly.',
                    bloomLevel: 'Understand',
                    marks: 2
                  }
                ]
              })
            };
          })
        }
      };

      const provider = new GeminiProvider({
        apiKey: 'test_key',
        model: 'gemini-3.5-flash',
        fallbackModel: 'gemini-3.5-flash-lite',
        client: mockClient,
        maxRetries: 2
      });

      const res = await provider.generateMcqs({ subject: 'CS', topic: 'Algorithms' });
      expect(res.questions.length).toBe(1);
      expect(res.questions[0].correctAnswers).toEqual(['A']);
      expect(mockClient.models.generateContent).toHaveBeenCalledTimes(2);
    });
  });
});
