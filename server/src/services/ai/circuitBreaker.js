import { ApiError } from '../../utils/apiError.js';

export const CircuitState = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
});

export class CircuitBreaker {
  /**
   * @param {Object} [options]
   * @param {number} [options.failureThreshold=4] - Consecutive transient failures before tripping
   * @param {number} [options.cooldownMs=30000] - Duration in ms to stay OPEN before testing canary
   * @param {string} [options.name='GeminiCircuitBreaker']
   */
  constructor(options = {}) {
    this.name = options.name || 'GeminiCircuitBreaker';
    this.failureThreshold = options.failureThreshold || 4;
    this.cooldownMs = options.cooldownMs || 30000;

    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.canaryInFlight = false;
  }

  /**
   * Evaluates if execution is permitted through the breaker.
   * Throws ApiError.serviceUnavailable if breaker is OPEN.
   */
  assertCanExecute() {
    const now = Date.now();

    if (this.state === CircuitState.OPEN) {
      const elapsed = now - (this.lastFailureTime || 0);
      if (elapsed >= this.cooldownMs) {
        // Transition to HALF_OPEN to allow a single trial probe
        this.state = CircuitState.HALF_OPEN;
        this.canaryInFlight = true;
        console.log(`[${this.name}] Cooldown elapsed (${elapsed}ms). Transitioning to HALF_OPEN for trial canary.`);
        return;
      }

      const remainingSec = Math.ceil((this.cooldownMs - elapsed) / 1000);
      throw ApiError.serviceUnavailable(
        `AI generation is temporarily busy. TestForge is resting the provider for ${remainingSec}s. Please try again shortly.`,
        {
          code: 'GEMINI_CIRCUIT_OPEN',
          cooldownRemainingMs: this.cooldownMs - elapsed,
          retryAfterSec: remainingSec
        }
      );
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.canaryInFlight) {
        // Only 1 canary is permitted at a time
        throw ApiError.serviceUnavailable(
          'AI generation is currently testing provider availability. Please wait a few seconds and try again.',
          { code: 'GEMINI_CIRCUIT_HALF_OPEN', retryAfterSec: 5 }
        );
      }
      this.canaryInFlight = true;
    }
  }

  /**
   * Records a successful execution.
   */
  recordSuccess() {
    if (this.state !== CircuitState.CLOSED) {
      console.log(`[${this.name}] Canary succeeded. Circuit recovered from ${this.state} to CLOSED.`);
    }
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.canaryInFlight = false;
  }

  /**
   * Records an execution failure.
   * Only transient provider failures trip the breaker.
   */
  recordFailure(isTransient = true) {
    if (!isTransient) return;

    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    this.canaryInFlight = false;

    if (this.state === CircuitState.HALF_OPEN) {
      console.warn(`[${this.name}] Canary probe failed. Tripping back to OPEN for ${this.cooldownMs}ms.`);
      this.state = CircuitState.OPEN;
      return;
    }

    if (this.consecutiveFailures >= this.failureThreshold && this.state === CircuitState.CLOSED) {
      console.warn(
        `[${this.name}] ${this.consecutiveFailures} consecutive failures reached threshold (${this.failureThreshold}). Tripping circuit to OPEN for ${this.cooldownMs}ms.`
      );
      this.state = CircuitState.OPEN;
    }
  }

  /**
   * Resets breaker to CLOSED state.
   */
  reset() {
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.canaryInFlight = false;
  }

  /**
   * Returns current telemetry snapshot.
   */
  getStatus() {
    const elapsed = this.lastFailureTime ? Date.now() - this.lastFailureTime : null;
    return {
      name: this.name,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime,
      cooldownRemainingMs: this.state === CircuitState.OPEN && elapsed !== null ? Math.max(0, this.cooldownMs - elapsed) : 0
    };
  }
}

// Global default singleton for the Gemini Provider
export const geminiCircuitBreaker = new CircuitBreaker({
  name: 'GeminiGlobalBreaker',
  failureThreshold: 4,
  cooldownMs: 30000
});

// Global default singleton for the Groq Provider
export const groqCircuitBreaker = new CircuitBreaker({
  name: 'GroqGlobalBreaker',
  failureThreshold: 3,
  cooldownMs: 20000
});
