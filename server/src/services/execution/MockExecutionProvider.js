import { ExecutionProvider } from './ExecutionProvider.interface.js';
import { config } from '../../config/env.js';

/**
 * Deterministic Mock Execution Provider for unit testing, CI pipelines, and fallback simulation.
 * In production, simulated mock execution is STRICTLY PROHIBITED from awarding marks or grading.
 */
export class MockExecutionProvider extends ExecutionProvider {
  constructor() {
    super('mock');
    this.customHandler = null;
    this.simulatedLatencyMs = 5;
  }

  /**
   * Set a custom handler function for testing specific responses.
   * @param {Function} handler - (params) => ExecutionResponse
   */
  setHandler(handler) {
    this.customHandler = handler;
  }

  /**
   * Reset the mock provider to its default deterministic behavior.
   */
  reset() {
    this.customHandler = null;
  }

  async executeCode(params) {
    // FAIL-CLOSED PRODUCTION GATE:
    // Production must NEVER award simulated marks or grade student code using mocks
    if (config.env === 'production' || process.env.NODE_ENV === 'production') {
      return {
        status: 'internal_error',
        output: null,
        error: '[MockExecutionProvider FAIL-CLOSED] Mock execution is strictly prohibited from awarding marks in production. Execution unavailable.',
        runtimeMs: 0
      };
    }

    const { language, code, inputArgs, timeoutMs = 3500, signal = null } = params;

    if (signal?.aborted) {
      return {
        status: 'cancelled',
        output: null,
        error: 'Execution cancelled by signal.',
        runtimeMs: 0
      };
    }

    if (this.simulatedLatencyMs > 0) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, this.simulatedLatencyMs);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        }
      });
    }

    if (signal?.aborted) {
      return {
        status: 'cancelled',
        output: null,
        error: 'Execution cancelled by signal.',
        runtimeMs: 0
      };
    }

    if (this.customHandler) {
      return this.customHandler(params);
    }

    // Default simulated responses for standard testing patterns
    if (code.includes('SIMULATE_TIMEOUT') || code.includes('while (true)')) {
      return {
        status: 'timeout',
        output: null,
        error: `Execution timed out after ${timeoutMs}ms.`,
        runtimeMs: timeoutMs
      };
    }

    if (code.includes('SIMULATE_COMPILATION_ERROR') || code.includes('SYNTAX_ERROR')) {
      return {
        status: 'compilation_error',
        output: null,
        error: 'SyntaxError: Unexpected token or compilation failure',
        runtimeMs: 10
      };
    }

    if (code.includes('SIMULATE_RUNTIME_ERROR')) {
      return {
        status: 'runtime_error',
        output: null,
        error: 'TypeError: Cannot read properties of undefined',
        runtimeMs: 15
      };
    }

    // Default mock success response: echo inputArgs or return first argument
    let simulatedOutput = null;
    if (Array.isArray(inputArgs) && inputArgs.length > 0) {
      simulatedOutput = inputArgs.length === 1 ? inputArgs[0] : inputArgs;
    }

    return {
      status: 'success',
      output: simulatedOutput,
      error: null,
      runtimeMs: 25,
      memoryKb: 4096
    };
  }

  getCapabilities() {
    return {
      name: 'mock',
      supportsNetworkIsolation: true,
      supportsMemoryLimits: true,
      supportsProcessLimits: true,
      isHardenedSandbox: true,
      languages: ['javascript', 'python', 'java', 'cpp']
    };
  }
}

export default MockExecutionProvider;
