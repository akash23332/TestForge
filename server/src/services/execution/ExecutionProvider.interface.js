/**
 * Abstract Execution Provider Interface.
 * Defines the contract for all untrusted code execution backends (Mock, Local, Render Sandbox).
 */
export class ExecutionProvider {
  constructor(name = 'base') {
    this.name = name;
  }

  /**
   * Executes source code inside an isolated execution environment.
   * 
   * @param {Object} params
   * @param {('javascript'|'python'|'java'|'cpp')} params.language - Runtime language
   * @param {string} params.code - Source code to execute
   * @param {Array<any>} params.inputArgs - Parsed test-case argument values
   * @param {number} [params.timeoutMs=3500] - Hard execution timeout in milliseconds
   * @param {number} [params.memoryLimitMb=256] - Memory limit in megabytes
   * @param {Object} [params.questionContext={}] - Metadata (e.g. title, tags)
   * 
   * @returns {Promise<{
   *   status: 'success' | 'compilation_error' | 'runtime_error' | 'timeout' | 'memory_limit_exceeded' | 'internal_error',
   *   output: any,
   *   error: string | null,
   *   runtimeMs: number,
   *   compileMs?: number,
   *   memoryKb?: number
   * }>}
   */
  async executeCode(params) {
    throw new Error(`executeCode() not implemented by ${this.constructor.name}`);
  }

  /**
   * Returns provider capabilities, limits, and isolation status.
   */
  getCapabilities() {
    return {
      name: this.name,
      supportsNetworkIsolation: false,
      supportsMemoryLimits: false,
      supportsProcessLimits: false,
      isHardenedSandbox: false,
      languages: ['javascript', 'python', 'java', 'cpp']
    };
  }

  /**
   * Helper to check whether a specific language is supported.
   * @param {string} language
   * @returns {boolean}
   */
  supportsLanguage(language) {
    const caps = this.getCapabilities();
    return Array.isArray(caps.languages) && caps.languages.includes(language.toLowerCase());
  }
}

export default ExecutionProvider;
