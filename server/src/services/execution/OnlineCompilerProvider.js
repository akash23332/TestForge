import { ExecutionProvider } from './ExecutionProvider.interface.js';
import { config } from '../../config/env.js';

/**
 * Verified compiler identifiers for api.onlinecompiler.io.
 * Mapped according to verified Postman / HTTP integration contracts.
 */
export const DEFAULT_ONLINE_COMPILER_IDENTIFIERS = Object.freeze({
  python: 'python-3.14',
  py: 'python-3.14',
  cpp: 'g++-15',
  'c++': 'g++-15',
  java: 'openjdk-25',
  javascript: 'nodejs-24',
  js: 'nodejs-24'
});

/**
 * Production-Grade OnlineCompiler.io Execution Provider.
 * Dispatches code execution synchronously via POST https://api.onlinecompiler.io/api/run-code-sync/
 * Provides zero-privileged-container isolated execution.
 */
export class OnlineCompilerProvider extends ExecutionProvider {
  constructor(options = {}) {
    super('onlinecompiler');

    this.endpoint = (
      options.endpoint !== undefined
        ? options.endpoint
        : (config.execution?.onlineCompilerEndpoint || process.env.ONLINE_COMPILER_ENDPOINT || 'https://api.onlinecompiler.io/api/run-code-sync/')
    ).trim();

    this.apiKey = (
      options.apiKey !== undefined
        ? options.apiKey
        : (config.execution?.onlineCompilerApiKey || process.env.ONLINE_COMPILER_API_KEY || '')
    ).trim();

    this.timeoutMs = options.timeoutMs ||
      parseInt(process.env.ONLINE_COMPILER_TIMEOUT_MS, 10) || 10000;

    // Configurable compiler mapping
    this.compilerMap = {
      ...DEFAULT_ONLINE_COMPILER_IDENTIFIERS,
      ...(options.compilerMap || {})
    };
  }

  /**
   * Validates whether the provider has valid configuration.
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this.endpoint && this.endpoint.length > 0 && this.apiKey && this.apiKey.length > 0);
  }

  /**
   * Redacts API keys, tokens and sensitive credentials from logs and error strings.
   * @param {string} text
   * @returns {string}
   */
  _sanitize(text) {
    if (!text || typeof text !== 'string') return text;
    let sanitized = text;
    if (this.apiKey && this.apiKey.length >= 4) {
      sanitized = sanitized.replaceAll(this.apiKey, '[REDACTED_API_KEY]');
      const cleanRaw = this.apiKey.replace(/^Bearer\s+/i, '').trim();
      if (cleanRaw.length >= 4 && cleanRaw !== this.apiKey) {
        sanitized = sanitized.replaceAll(cleanRaw, '[REDACTED_API_KEY]');
      }
    }
    return sanitized;
  }

  /**
   * Returns provider capabilities, limits, and isolation status.
   */
  getCapabilities() {
    return {
      name: this.name,
      supportsNetworkIsolation: true,
      supportsMemoryLimits: true,
      supportsProcessLimits: true,
      isHardenedSandbox: true,
      languages: ['javascript', 'python', 'java', 'cpp']
    };
  }

  /**
   * Health check verifying endpoint configuration and basic connectivity.
   */
  async checkHealth({ timeoutMs = 3000 } = {}) {
    if (!this.endpoint) {
      return {
        healthy: false,
        status: 'unconfigured',
        error: 'OnlineCompiler endpoint is not configured.'
      };
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'OPTIONS',
        signal: AbortSignal.timeout(timeoutMs)
      });

      return {
        healthy: response.ok || response.status === 405 || response.status === 200 || response.status === 401 || response.status === 403,
        status: 'reachable',
        statusCode: response.status
      };
    } catch (err) {
      return {
        healthy: false,
        status: 'unreachable',
        error: this._sanitize(err.message)
      };
    }
  }

  /**
   * Executes source code inside OnlineCompiler's isolated sandbox via synchronous REST API.
   *
   * @param {Object} params
   * @param {('javascript'|'python'|'java'|'cpp')} params.language - Runtime language
   * @param {string} params.code - Source code to execute
   * @param {Array<any>|string} params.inputArgs - Input arguments or stdin string
   * @param {number} [params.timeoutMs=5000] - Hard execution timeout
   * @param {Object} [params.questionContext={}] - Metadata
   * @param {AbortSignal} [params.signal] - Caller cancellation signal
   * 
   * @returns {Promise<{
   *   status: 'success' | 'compilation_error' | 'runtime_error' | 'timeout' | 'memory_limit_exceeded' | 'internal_error',
   *   output: any,
   *   error: string | null,
   *   runtimeMs: number,
   *   memoryKb?: number,
   *   truncated?: boolean
   * }>}
   */
  async executeCode({
    language,
    code,
    inputArgs,
    timeoutMs = 5000,
    questionContext = {},
    signal = null
  }) {
    const startTime = Date.now();

    // Production security gate: Fail closed if unconfigured in production
    if (!this.isConfigured() && (config.env === 'production' || process.env.NODE_ENV === 'production')) {
      return {
        status: 'internal_error',
        output: null,
        error: '[OnlineCompilerProvider FAIL-CLOSED] OnlineCompiler endpoint or API key is not configured in production.',
        runtimeMs: 0
      };
    }

    // Language mapping validation
    const langKey = (language || 'javascript').toLowerCase();
    const compiler = this.compilerMap[langKey];

    if (!compiler) {
      return {
        status: 'compilation_error',
        output: null,
        error: `Unsupported execution language: '${language}'. Supported: javascript, python, java, cpp.`,
        runtimeMs: 0
      };
    }

    // Input serialization
    let serializedInput = '';
    if (typeof inputArgs === 'string') {
      serializedInput = inputArgs;
    } else if (Array.isArray(inputArgs)) {
      serializedInput = inputArgs
        .map(arg => (typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : String(arg ?? '')))
        .join('\n');
    } else if (inputArgs !== undefined && inputArgs !== null) {
      serializedInput = String(inputArgs);
    }

    const payload = {
      compiler,
      code: code || '',
      input: serializedInput
    };

    const headers = {
      'Content-Type': 'application/json'
    };

    // OnlineCompiler expects raw API key directly in Authorization header
    if (this.apiKey) {
      const cleanKey = this.apiKey.replace(/^Bearer\s+/i, '').trim();
      headers['Authorization'] = cleanKey;
    }

    try {
      const combinedSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs + 3000)])
        : AbortSignal.timeout(timeoutMs + 3000);

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: combinedSignal
      });

      const runtimeMs = Date.now() - startTime;

      // Handle non-OK HTTP status codes with specific status categorization
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        let prefix = '[OnlineCompilerProvider FAIL-CLOSED]';
        let customStatus = 'internal_error';

        if (response.status === 401 || response.status === 403) {
          prefix = '[OnlineCompilerProvider FAIL-CLOSED] Authentication / Authorization Failure';
        } else if (response.status === 429) {
          prefix = '[OnlineCompilerProvider FAIL-CLOSED] Rate Limit Exceeded';
        } else if (response.status >= 500) {
          prefix = '[OnlineCompilerProvider FAIL-CLOSED] Upstream Service Error';
        }

        return {
          status: customStatus,
          output: null,
          error: `${prefix} (HTTP ${response.status}): ${this._sanitize(errText)}`,
          runtimeMs
        };
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        return {
          status: 'internal_error',
          output: null,
          error: `Malformed JSON response from OnlineCompiler API: ${this._sanitize(jsonErr.message)}`,
          runtimeMs
        };
      }

      return this._parseOnlineCompilerResponse(data, runtimeMs, timeoutMs);
    } catch (err) {
      const runtimeMs = Date.now() - startTime;
      const isAborted = signal?.aborted || err.name === 'AbortError';
      if (isAborted) {
        return {
          status: 'cancelled',
          output: null,
          error: 'Execution cancelled by caller or timeout.',
          runtimeMs
        };
      }

      const isTimeout = err.name === 'TimeoutError' || runtimeMs >= timeoutMs;
      return {
        status: isTimeout ? 'timeout' : 'internal_error',
        output: null,
        error: isTimeout
          ? `Execution timed out after ${timeoutMs}ms.`
          : `[OnlineCompilerProvider FAIL-CLOSED] Connection error: ${this._sanitize(err.message)}`,
        runtimeMs
      };
    }
  }

  /**
   * Normalizes OnlineCompiler synchronous JSON response into standard TestForge execution structure.
   */
  _parseOnlineCompilerResponse(data, elapsedMs, timeoutMs) {
    if (!data || typeof data !== 'object') {
      return {
        status: 'internal_error',
        output: null,
        error: 'Malformed response from OnlineCompiler API: expected JSON object.',
        runtimeMs: elapsedMs
      };
    }

    const rawOutput = data.output !== undefined ? data.output : (data.stdout !== undefined ? data.stdout : '');
    const rawError = data.error !== undefined ? data.error : (data.stderr !== undefined ? data.stderr : null);
    const sanitizedError = this._sanitize(rawError ? String(rawError).trim() : null);
    const rawStatus = (data.status || '').toLowerCase();
    const exitCode = typeof data.exit_code === 'number' ? data.exit_code : null;
    const signal = data.signal || null;
    const isTruncated = Boolean(data.truncated || data.output_truncated);

    // Normalize execution time (seconds string or number to milliseconds)
    let runtimeMs = elapsedMs;
    if (data.time !== undefined && data.time !== null) {
      const parsedTime = parseFloat(data.time);
      if (!isNaN(parsedTime) && parsedTime >= 0) {
        runtimeMs = parsedTime < 50 ? Math.round(parsedTime * 1000) : Math.round(parsedTime);
      }
    }

    // Normalize memory consumption (KB)
    let memoryKb;
    if (data.memory !== undefined && data.memory !== null) {
      const parsedMem = parseInt(data.memory, 10);
      if (!isNaN(parsedMem) && parsedMem >= 0) {
        memoryKb = parsedMem;
      }
    }

    // Determine standard ExecutionProvider verdict status
    let status = 'success';

    if (
      rawStatus === 'compilation_error' ||
      (sanitizedError && this._isCompilationError(sanitizedError))
    ) {
      status = 'compilation_error';
    } else if (
      rawStatus === 'timeout' ||
      rawStatus === 'time_limit_exceeded' ||
      exitCode === 124 ||
      signal === 'SIGKILL' ||
      signal === 'SIGTERM' ||
      (sanitizedError && /time\s*limit\s*exceeded|timed\s*out/i.test(sanitizedError))
    ) {
      status = 'timeout';
    } else if (
      rawStatus === 'memory_limit_exceeded' ||
      signal === 'SIGSEGV_OOM' ||
      (sanitizedError && /memory\s*limit\s*exceeded|out\s*of\s*memory/i.test(sanitizedError))
    ) {
      status = 'memory_limit_exceeded';
    } else if (
      rawStatus === 'runtime_error' ||
      rawStatus === 'error' ||
      (exitCode !== null && exitCode !== 0) ||
      (sanitizedError && this._isRuntimeError(sanitizedError))
    ) {
      status = 'runtime_error';
    } else if (sanitizedError && (!rawOutput || String(rawOutput).trim() === '')) {
      status = 'runtime_error';
    }

    let parsedOutput = null;
    if (rawOutput !== null && rawOutput !== undefined) {
      const rawStdout = typeof rawOutput === 'string' ? rawOutput.trim() : String(rawOutput).trim();
      try {
        parsedOutput = JSON.parse(rawStdout);
      } catch {
        parsedOutput = rawStdout;
      }
    }

    return {
      status,
      output: parsedOutput,
      error: sanitizedError || null,
      runtimeMs,
      memoryKb,
      truncated: isTruncated
    };
  }

  _isCompilationError(err) {
    return (
      /syntaxerror/i.test(err) ||
      /compilation error/i.test(err) ||
      /g\+\+:\s*error/i.test(err) ||
      /javac:\s*error/i.test(err) ||
      /error:\s*cannot find symbol/i.test(err) ||
      /fatal error:/i.test(err) ||
      /unrecognized token/i.test(err) ||
      /expected '.*' before/i.test(err)
    );
  }

  _isRuntimeError(err) {
    return (
      /traceback \(most recent call last\)/i.test(err) ||
      /zerodivisionerror/i.test(err) ||
      /indexerror/i.test(err) ||
      /nullpointerexception/i.test(err) ||
      /arrayindexoutofboundsexception/i.test(err) ||
      /segmentation fault/i.test(err) ||
      /runtimeerror/i.test(err) ||
      /referenceerror/i.test(err) ||
      /typeerror/i.test(err)
    );
  }
}

export default OnlineCompilerProvider;
