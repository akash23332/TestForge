import { ExecutionProvider } from './ExecutionProvider.interface.js';
import { config } from '../../config/env.js';
import { ProxyAgent, Agent } from 'undici';

// Standard Judge0 language IDs for reference
const JUDGE0_LANGUAGE_IDS = {
  javascript: 63, // JavaScript (Node.js 18.15.0 / 20.x)
  js: 63,
  python: 71,     // Python (3.11.2)
  py: 71,
  java: 62,       // Java (OpenJDK 17)
  cpp: 54,        // C++ (GCC 9.2.0 / 13.x)
  'c++': 54
};

/**
 * Production-Grade Isolated Execution Provider.
 * Communicates with an isolated sandbox runner (TestForge Hardened Sandbox Daemon or Judge0 CE)
 * where student code is executed with non-root UID, cgroups memory/CPU limits, zero network egress,
 * and disposable ephemeral scratchpad storage.
 */
export class RenderSandboxProvider extends ExecutionProvider {
  constructor(options = {}) {
    super('render_sandbox');
    this.endpoint = (
      options.endpoint ||
      config.execution?.sandboxEndpoint ||
      process.env.JUDGE0_URL ||
      process.env.JUDGE0_API_URL ||
      process.env.RENDER_SANDBOX_ENDPOINT ||
      process.env.RENDER_SANDBOX_URL ||
      ''
    ).trim();

    if (this.endpoint) {
      let parsed;
      try {
        parsed = new URL(this.endpoint);
      } catch (err) {
        throw new Error(`[RenderSandboxProvider] Invalid runner endpoint URL: '${this.endpoint}'`);
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error(`[RenderSandboxProvider] Unsupported endpoint protocol '${parsed.protocol}'. Must be http: or https:.`);
      }
      if (
        (config.env === 'production' || process.env.NODE_ENV === 'production') &&
        parsed.protocol === 'http:' &&
        !options.proxyUrl &&
        !process.env.TAILSCALE_PROXY &&
        !process.env.HTTP_PROXY &&
        !options.requireProxy &&
        process.env.REQUIRE_PROXY !== 'true' &&
        parsed.hostname !== 'localhost' &&
        parsed.hostname !== '127.0.0.1'
      ) {
        throw new Error(
          `[RenderSandboxProvider FAIL-CLOSED] Insecure plaintext HTTP endpoint '${this.endpoint}' is strictly prohibited in production without a secure proxy (TAILSCALE_PROXY).`
        );
      }
    }

    this.apiKey = (
      options.apiKey ||
      config.execution?.sandboxApiKey ||
      process.env.JUDGE0_API_KEY ||
      process.env.RENDER_SANDBOX_API_KEY ||
      process.env.RENDER_SANDBOX_TOKEN ||
      ''
    ).trim();
    this.proxyUrl = (
      options.proxyUrl ||
      process.env.TAILSCALE_PROXY ||
      process.env.HTTP_PROXY ||
      process.env.ALL_PROXY ||
      ''
    ).trim();

    if (this.proxyUrl) {
      const lower = this.proxyUrl.toLowerCase();
      if (!lower.startsWith('http://') && !lower.startsWith('https://') && !lower.startsWith('socks5://')) {
        throw new Error(
          `[RenderSandboxProvider] Unsupported proxy protocol: '${this.proxyUrl}'. ` +
          `Proxy URL must use http://, https://, or socks5://.`
        );
      }
      if (lower.startsWith('socks5://')) {
        console.warn(
          `[RenderSandboxProvider] SOCKS5 proxy protocol configured (${this.proxyUrl}). ` +
          `Node undici SOCKS5 support is experimental; prefer http://127.0.0.1:1056 for production stability.`
        );
      }
    }

    this.authzToken = (
      options.authzToken ||
      config.execution?.sandboxAuthzToken ||
      process.env.JUDGE0_AUTHZ_TOKEN ||
      process.env.RENDER_SANDBOX_AUTHZ_TOKEN ||
      ''
    ).trim();
    this.requireProxy = Boolean(
      options.requireProxy ||
      process.env.REQUIRE_PROXY === 'true' ||
      this.endpoint.includes('.ts.net')
    );

    // Configurable separate timeouts
    this.connectionTimeoutMs = options.connectionTimeoutMs ||
      parseInt(process.env.RUNNER_CONNECTION_TIMEOUT_MS, 10) || 5000;
    this.responseTimeoutMs = options.responseTimeoutMs ||
      parseInt(process.env.RUNNER_RESPONSE_TIMEOUT_MS, 10) || 10000;

    // Dispatcher initialization with strict TLS verification
    if (options.dispatcher) {
      this.dispatcher = options.dispatcher;
    } else if (this.proxyUrl) {
      this.dispatcher = new ProxyAgent({
        uri: this.proxyUrl,
        connect: { timeout: this.connectionTimeoutMs }
      });
    } else if (this.endpoint.startsWith('https://')) {
      this.dispatcher = new Agent({
        connect: {
          timeout: this.connectionTimeoutMs,
          rejectUnauthorized: true // CRITICAL: TLS certificate validation is strictly enforced.
        },
        headersTimeout: this.responseTimeoutMs,
        bodyTimeout: this.responseTimeoutMs
      });
    } else {
      this.dispatcher = null;
    }

    this.defaultMemoryLimitMb = options.memoryLimitMb || 256;
    this.defaultCpuLimit = options.cpuLimit || 1.0;
    this.providerType = options.providerType || (
      (this.endpoint.includes('judge0') || !this.endpoint.includes('testforge_sandbox')) ? 'judge0' : 'testforge_sandbox'
    );
  }

  /**
   * Sanitizes log and error messages to guarantee no authentication secrets leak.
   * @param {string} msg
   * @returns {string}
   */
  _sanitize(msg) {
    if (!msg || typeof msg !== 'string') return msg;
    let sanitized = msg;
    if (this.apiKey && this.apiKey.length >= 4) {
      sanitized = sanitized.replaceAll(this.apiKey, '[REDACTED_API_KEY]');
    }
    if (this.authzToken && this.authzToken.length >= 4) {
      sanitized = sanitized.replaceAll(this.authzToken, '[REDACTED_AUTH_TOKEN]');
    }
    return sanitized;
  }

  /**
   * Validates whether the isolated execution infrastructure is provisioned and reachable.
   */
  isConfigured() {
    return Boolean(this.endpoint && this.endpoint.length > 0);
  }

  /**
   * Dispatches code execution to the isolated sandbox service.
   */
  async executeCode(params) {
    const {
      language,
      code,
      inputArgs,
      timeoutMs = 3500,
      memoryLimitMb = this.defaultMemoryLimitMb,
      questionContext = {},
      signal = null,
      onTokenCreated = null
    } = params;

    if (!this.isConfigured()) {
      throw new Error(
        `[RenderSandboxProvider] Isolated sandbox endpoint is not configured (RENDER_SANDBOX_ENDPOINT). ` +
        `Production security policy strictly prohibits executing untrusted code directly on the host API server. ` +
        `Configure RENDER_SANDBOX_ENDPOINT or run with EXECUTION_PROVIDER=mock for unit testing.`
      );
    }

    if (this.requireProxy && !this.dispatcher) {
      throw new Error(
        `[RenderSandboxProvider FAIL-CLOSED] Private endpoint requires an active proxy (TAILSCALE_PROXY), but no proxy is configured. ` +
        `Direct public endpoint fallback is strictly prohibited.`
      );
    }

    if (this.providerType === 'judge0') {
      return this._executeViaJudge0({ language, code, inputArgs, timeoutMs, memoryLimitMb, questionContext, signal, onTokenCreated });
    }

    return this._executeViaTestForgeSandbox({ language, code, inputArgs, timeoutMs, memoryLimitMb, questionContext, signal });
  }

  /**
   * Helper to parse and standardize Judge0 CE submission response payload.
   * Strictly validates payload schema and types to fail-closed on malformed responses.
   */
  _parseJudge0Response(data, startTime = 0, timeoutMs = 3500) {
    // 1. Validate payload structure
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {
        token: null,
        status: 'internal_error',
        output: null,
        error: 'Malformed Judge0 runner response: expected JSON object payload',
        runtimeMs: startTime ? Date.now() - startTime : 0,
        memoryKb: 0,
        statusId: null
      };
    }

    // 2. Validate status object and numeric ID
    const statusId = data.status?.id;
    if (typeof statusId !== 'number' || statusId < 1 || statusId > 14) {
      return {
        token: data.token || null,
        status: 'internal_error',
        output: null,
        error: `Malformed Judge0 runner response: invalid or missing status ID (${JSON.stringify(data.status || null)})`,
        runtimeMs: startTime ? Date.now() - startTime : 0,
        memoryKb: 0,
        statusId: null
      };
    }

    let status = 'success';
    let error = null;

    const desc = (data.status?.description || '').toLowerCase();
    const msg = (data.message || '').toLowerCase();
    const rawStderr = data.stderr || '';
    const stderr = typeof rawStderr === 'string' ? rawStderr.slice(0, 16384) : '';

    // Status 1 = In Queue, 2 = Processing
    if (statusId === 1) {
      return {
        token: data.token || null,
        status: 'in_queue',
        output: null,
        error: null,
        runtimeMs: 0,
        memoryKb: 0,
        statusId: 1
      };
    }
    if (statusId === 2) {
      const rawTime = Number(data.time);
      const validRuntime = !isNaN(rawTime) && rawTime >= 0 ? Math.round(rawTime * 1000) : (startTime ? Date.now() - startTime : 0);
      const rawMem = Number(data.memory);
      const validMem = !isNaN(rawMem) && rawMem >= 0 ? rawMem : 0;
      return {
        token: data.token || null,
        status: 'processing',
        output: null,
        error: null,
        runtimeMs: validRuntime,
        memoryKb: validMem,
        statusId: 2
      };
    }

    // Evaluate Judge0 metadata and status:
    // 1. Explicit status description or message reported by isolate/Judge0:
    const hasMemoryStatusOrMessage =
      desc.includes('memory') ||
      msg.includes('memory') ||
      msg.includes('exceeded memory');

    // 2. Numerical memory consumption vs memory limit in Judge0 metadata:
    const hasMemoryExhaustionMetadata =
      data.memory !== undefined &&
      data.memory !== null &&
      data.memory_limit !== undefined &&
      data.memory_limit !== null &&
      Number(data.memory) >= Number(data.memory_limit);

    // 3. Corroborating runtime stderr exception patterns:
    const hasMemoryException =
      stderr.includes('OutOfMemoryError') ||
      stderr.includes('std::bad_alloc') ||
      stderr.includes('MemoryError');

    const isMemoryError = hasMemoryStatusOrMessage || hasMemoryExhaustionMetadata || hasMemoryException;

    if (statusId === 5) {
      status = 'timeout';
      error = `Time limit exceeded (${timeoutMs}ms)`;
    } else if (statusId === 6) {
      status = 'compilation_error';
      error = data.compile_output ? String(data.compile_output).slice(0, 16384) : 'Compilation failed';
    } else if (isMemoryError) {
      status = 'memory_limit_exceeded';
      error = stderr || data.message || 'Memory limit exceeded';
    } else if (statusId >= 7 && statusId <= 12) {
      status = 'runtime_error';
      error = stderr || data.message || `Runtime error (${data.status?.description || 'Error'})`;
    } else if (statusId === 13) {
      status = 'internal_error';
      error = `Judge0 internal error: ${data.message || 'Unknown error'}`;
    } else if (statusId === 14) {
      status = 'internal_error';
      error = `Judge0 exec format error: ${data.message || 'Exec format error'}`;
    }

    let parsedOutput = null;
    if (data.stdout !== null && data.stdout !== undefined) {
      const rawStdout = typeof data.stdout === 'string' ? data.stdout.trim() : String(data.stdout).trim();
      try {
        parsedOutput = JSON.parse(rawStdout);
      } catch {
        parsedOutput = rawStdout;
      }
    }

    const rawTime = Number(data.time);
    const runtimeMs = (!isNaN(rawTime) && rawTime >= 0)
      ? Math.round(rawTime * 1000)
      : (startTime ? Date.now() - startTime : 0);
    const rawMem = Number(data.memory);
    const memoryKb = (!isNaN(rawMem) && rawMem >= 0) ? rawMem : 0;

    return {
      token: data.token || null,
      status,
      statusId,
      output: parsedOutput,
      error: this._sanitize(error),
      runtimeMs,
      memoryKb
    };
  }

  /**
   * Retrieves remote submission status from Judge0 CE by token.
   */
  async getSubmission(token, { signal = null, timeoutMs = 3500 } = {}) {
    if (!this.isConfigured() || !token) return null;
    if (this.requireProxy && !this.dispatcher) {
      throw new Error(
        `[RenderSandboxProvider FAIL-CLOSED] Private endpoint requires an active proxy (TAILSCALE_PROXY).`
      );
    }

    const cleanUrl = this.endpoint.endsWith('/')
      ? `${this.endpoint}submissions/${token}?base64_encoded=false`
      : `${this.endpoint}/submissions/${token}?base64_encoded=false`;

    try {
      const headers = {};
      if (this.apiKey) headers['X-Auth-Token'] = this.apiKey;
      if (this.authzToken) headers['X-Auth-User'] = this.authzToken;

      const fetchOpts = {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000)
      };
      if (this.dispatcher) {
        fetchOpts.dispatcher = this.dispatcher;
      }

      const response = await fetch(cleanUrl, fetchOpts);
      if (response.status === 404) {
        return { token, status: 'not_found', exists: false };
      }
      if (response.status === 401 || response.status === 403) {
        return { token, status: 'internal_error', error: `Authentication failed (HTTP ${response.status})`, exists: true };
      }
      if (!response.ok) {
        return { token, status: 'internal_error', error: `HTTP ${response.status}`, exists: true };
      }

      const data = await response.json().catch(() => null);
      if (!data) {
        return { token, status: 'internal_error', error: 'Malformed response payload from runner', exists: true };
      }
      const parsed = this._parseJudge0Response(data, 0, timeoutMs);
      parsed.exists = true;
      return parsed;
    } catch (err) {
      return { token, status: 'internal_error', error: this._sanitize(err.message), exists: null };
    }
  }

  /**
   * Requests deletion/cancellation of a submission on Judge0 CE.
   * Note on Judge0 CE architecture:
   * DELETE /submissions/:token removes the record from Postgres/Redis, but does NOT kill
   * an in-flight isolate process executing on the runner host. The isolate process
   * is terminated only when its kernel-enforced wall_time_limit expires.
   */
  async cancelSubmission(token, { signal = null } = {}) {
    if (!this.isConfigured() || !token) {
      return { success: false, cancellationStatus: 'UNCONFIGURED_OR_NO_TOKEN', isolateProcessKilled: false };
    }
    if (this.requireProxy && !this.dispatcher) {
      throw new Error(
        `[RenderSandboxProvider FAIL-CLOSED] Private endpoint requires an active proxy (TAILSCALE_PROXY).`
      );
    }

    const cleanUrl = this.endpoint.endsWith('/')
      ? `${this.endpoint}submissions/${token}`
      : `${this.endpoint}/submissions/${token}`;

    try {
      const headers = {};
      if (this.apiKey) headers['X-Auth-Token'] = this.apiKey;
      if (this.authzToken) headers['X-Auth-User'] = this.authzToken;

      const fetchOpts = {
        method: 'DELETE',
        headers,
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000)
      };
      if (this.dispatcher) {
        fetchOpts.dispatcher = this.dispatcher;
      }

      const response = await fetch(cleanUrl, fetchOpts);
      if (response.status === 200 || response.status === 204) {
        // Judge0 CE limitation: Database row deleted, but isolate executes until wall_time_limit
        return {
          success: true,
          cancellationStatus: 'DELETED_FROM_QUEUE_WALL_TIME_UNCONFIRMED',
          wallTimeEnforced: false,
          isolateProcessKilled: false
        };
      }
      if (response.status === 404) {
        return {
          success: false,
          cancellationStatus: 'NOT_FOUND',
          isolateProcessKilled: false
        };
      }
      return {
        success: false,
        cancellationStatus: 'REJECTED_OR_UNSUPPORTED',
        statusCode: response.status,
        isolateProcessKilled: false
      };
    } catch (err) {
      return {
        success: false,
        cancellationStatus: 'NETWORK_ERROR',
        error: this._sanitize(err.message),
        isolateProcessKilled: false
      };
    }
  }

  /**
   * Performs a health check against the runner endpoint.
   * Distinguishes runner availability from application health.
   *
   * @param {Object} [options]
   * @param {number} [options.timeoutMs=3000]
   * @returns {Promise<{
   *   healthy: boolean,
   *   status: 'healthy' | 'unreachable' | 'unauthorized' | 'unconfigured' | 'error',
   *   endpointConfigured: boolean,
   *   providerType: string,
   *   latencyMs: number | null,
   *   details?: any,
   *   error?: string | null
   * }>}
   */
  async checkHealth({ timeoutMs = 3000, forceRefresh = false } = {}) {
    if (!this.isConfigured()) {
      return {
        healthy: false,
        status: 'unconfigured',
        endpointConfigured: false,
        providerType: this.providerType,
        latencyMs: null,
        error: 'Runner endpoint is not configured (RENDER_SANDBOX_ENDPOINT or JUDGE0_URL)'
      };
    }

    const now = Date.now();
    // Cache health check results for 5 seconds to prevent health check storms/DoS on runner
    if (!forceRefresh && this._lastHealthCheck && (now - this._lastHealthCheck.timestamp < 5000)) {
      return this._lastHealthCheck.result;
    }

    const startTime = Date.now();
    const cleanUrl = this.endpoint.endsWith('/')
      ? `${this.endpoint}about`
      : `${this.endpoint}/about`;

    try {
      const headers = {};
      if (this.apiKey) headers['X-Auth-Token'] = this.apiKey;
      if (this.authzToken) headers['X-Auth-User'] = this.authzToken;

      const fetchOpts = {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs)
      };
      if (this.dispatcher) {
        fetchOpts.dispatcher = this.dispatcher;
      }

      const response = await fetch(cleanUrl, fetchOpts);
      const latencyMs = Date.now() - startTime;

      if (response.status === 401 || response.status === 403) {
        const result = {
          healthy: false,
          status: 'unauthorized',
          endpointConfigured: true,
          providerType: this.providerType,
          latencyMs,
          error: `Runner rejected authentication credentials (HTTP ${response.status})`
        };
        this._lastHealthCheck = { timestamp: now, result };
        return result;
      }

      if (!response.ok) {
        const result = {
          healthy: false,
          status: 'unreachable',
          endpointConfigured: true,
          providerType: this.providerType,
          latencyMs,
          error: `Runner returned non-OK status (HTTP ${response.status})`
        };
        this._lastHealthCheck = { timestamp: now, result };
        return result;
      }

      const data = await response.json().catch(() => null);

      const result = {
        healthy: true,
        status: 'healthy',
        endpointConfigured: true,
        providerType: this.providerType,
        latencyMs,
        details: data ? { version: data.version || '1.13.1' } : null,
        error: null
      };
      this._lastHealthCheck = { timestamp: now, result };
      return result;
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const result = {
        healthy: false,
        status: 'unreachable',
        endpointConfigured: true,
        providerType: this.providerType,
        latencyMs,
        error: this._sanitize(err.message)
      };
      this._lastHealthCheck = { timestamp: now, result };
      return result;
    }
  }

  /**
   * Direct execution via TestForge Hardened Sandbox microservice (/execute).
   */
  async _executeViaTestForgeSandbox({ language, code, inputArgs, timeoutMs, memoryLimitMb, questionContext, signal = null }) {
    const startTime = Date.now();
    const cleanUrl = this.endpoint.endsWith('/') ? `${this.endpoint}execute` : `${this.endpoint}/execute`;

    const payload = {
      language,
      code,
      inputArgs,
      limits: {
        timeoutMs,
        memoryLimitMb,
        cpuLimit: this.defaultCpuLimit,
        network: 'none' // CRITICAL: Kernel-enforced zero network egress
      },
      context: {
        title: questionContext.title,
        problemId: questionContext.problemId
      }
    };

    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const combinedSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs + 3000)])
        : AbortSignal.timeout(timeoutMs + 3000);

      const fetchOpts = {
        method: 'POST',
        headers,
        redirect: 'error',
        body: JSON.stringify(payload),
        signal: combinedSignal
      };
      if (this.dispatcher) {
        fetchOpts.dispatcher = this.dispatcher;
      }

      const response = await fetch(cleanUrl, fetchOpts);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          status: 'internal_error',
          output: null,
          error: `Sandbox execution service error (HTTP ${response.status}): ${this._sanitize(errorText)}`,
          runtimeMs: Date.now() - startTime
        };
      }

      const data = await response.json();

      return {
        status: data.status || 'success',
        output: data.output,
        error: this._sanitize(data.error) || null,
        runtimeMs: data.runtimeMs || (Date.now() - startTime),
        compileMs: data.compileMs,
        memoryKb: data.memoryKb
      };
    } catch (err) {
      const runtimeMs = Date.now() - startTime;
      const isAborted = signal?.aborted || err.name === 'AbortError';
      if (isAborted) {
        return {
          status: 'cancelled',
          output: null,
          error: 'Sandbox execution cancelled by caller or lease preemption.',
          runtimeMs
        };
      }
      const isTimeout = err.name === 'TimeoutError' || runtimeMs >= timeoutMs;

      return {
        status: isTimeout ? 'timeout' : 'internal_error',
        output: null,
        error: isTimeout
          ? `Sandbox execution timed out after ${timeoutMs}ms.`
          : `Sandbox connection failure: ${this._sanitize(err.message)}`,
        runtimeMs
      };
    }
  }

  /**
   * Execution via Judge0 CE API (/submissions?wait=true).
   * Enforces separate connection, response, and execution timeouts.
   */
  async _executeViaJudge0({ language, code, inputArgs, timeoutMs, memoryLimitMb, signal = null, onTokenCreated = null }) {
    const startTime = Date.now();
    const cleanUrl = this.endpoint.endsWith('/')
      ? `${this.endpoint}submissions?wait=true&base64_encoded=false`
      : `${this.endpoint}/submissions?wait=true&base64_encoded=false`;

    const langKey = (language || 'javascript').toLowerCase();
    const languageId = JUDGE0_LANGUAGE_IDS[langKey] || 63;
    const serializedStdin = typeof inputArgs === 'string' ? inputArgs : JSON.stringify(inputArgs);

    // Execution limits passed into Judge0 / Isolate
    const cpuTimeLimitSec = Math.max(1, Math.ceil(timeoutMs / 1000));
    const wallTimeLimitSec = Math.max(2, Math.ceil((timeoutMs + 2000) / 1000));

    const payload = {
      source_code: code,
      language_id: languageId,
      stdin: serializedStdin,
      cpu_time_limit: cpuTimeLimitSec,
      wall_time_limit: wallTimeLimitSec,
      memory_limit: memoryLimitMb * 1024,
      max_file_size: 1024,
      enable_network: false // CRITICAL: Outbound networking disabled in isolate
    };

    // Effective response timeout must account for runner wall-time + network margins
    const effectiveResponseTimeout = Math.max(this.responseTimeoutMs, (wallTimeLimitSec * 1000) + 3000);

    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      if (this.apiKey) {
        headers['X-Auth-Token'] = this.apiKey;
      }
      if (this.authzToken) {
        headers['X-Auth-User'] = this.authzToken;
      }

      const combinedSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(effectiveResponseTimeout)])
        : AbortSignal.timeout(effectiveResponseTimeout);

      const fetchOpts = {
        method: 'POST',
        headers,
        redirect: 'error',
        body: JSON.stringify(payload),
        signal: combinedSignal
      };
      if (this.dispatcher) {
        fetchOpts.dispatcher = this.dispatcher;
      }

      const response = await fetch(cleanUrl, fetchOpts);

      if (response.status === 401 || response.status === 403) {
        return {
          status: 'internal_error',
          output: null,
          error: `Judge0 runner authentication failure: Invalid or missing credentials (HTTP ${response.status})`,
          runtimeMs: Date.now() - startTime
        };
      }

      if (response.status === 429) {
        return {
          status: 'internal_error',
          output: null,
          error: 'Judge0 runner rate limit exceeded (HTTP 429)',
          runtimeMs: Date.now() - startTime
        };
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const errorPrefix = response.status >= 500
          ? `Judge0 runner unavailable (HTTP ${response.status})`
          : `Judge0 runner error (HTTP ${response.status})`;
        return {
          status: 'internal_error',
          output: null,
          error: errorText ? `${errorPrefix}: ${this._sanitize(errorText)}` : errorPrefix,
          runtimeMs: Date.now() - startTime
        };
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        return {
          status: 'internal_error',
          output: null,
          error: `Malformed Judge0 runner response: Invalid JSON payload (${jsonErr.message})`,
          runtimeMs: Date.now() - startTime
        };
      }

      if (data.token && typeof onTokenCreated === 'function') {
        try {
          await onTokenCreated(data.token);
        } catch (tokenErr) {
          console.warn(`[RenderSandboxProvider] onTokenCreated callback warning: ${tokenErr.message}`);
        }
      }

      return this._parseJudge0Response(data, startTime, timeoutMs);
    } catch (err) {
      const runtimeMs = Date.now() - startTime;
      const isAborted = signal?.aborted || (err.name === 'AbortError' && signal?.aborted);
      if (isAborted) {
        return {
          status: 'cancelled',
          output: null,
          error: 'Judge0 execution cancelled by caller or lease preemption.',
          runtimeMs
        };
      }

      const isTimeout = err.name === 'TimeoutError' || runtimeMs >= effectiveResponseTimeout;
      const isCertError = err.code?.includes('CERT') || err.message?.includes('certificate') || err.message?.includes('SELF_SIGNED');

      return {
        status: isTimeout ? 'timeout' : 'internal_error',
        output: null,
        error: isCertError
          ? `TLS certificate validation failed: ${this._sanitize(err.message)}`
          : isTimeout
            ? `Judge0 execution timed out after ${effectiveResponseTimeout}ms.`
            : `Judge0 connection failure: ${this._sanitize(err.message)}`,
        runtimeMs
      };
    }
  }

  getCapabilities() {
    return {
      name: 'render_sandbox',
      supportsNetworkIsolation: true,
      supportsMemoryLimits: true,
      supportsProcessLimits: true,
      isHardenedSandbox: true,
      isConfigured: this.isConfigured(),
      usesProxy: Boolean(this.dispatcher),
      proxyUrl: this.proxyUrl || null,
      requireProxy: this.requireProxy,
      hasAuthzToken: Boolean(this.authzToken),
      connectionTimeoutMs: this.connectionTimeoutMs,
      responseTimeoutMs: this.responseTimeoutMs,
      providerType: this.providerType,
      languages: ['javascript', 'python', 'java', 'cpp']
    };
  }
}

export default RenderSandboxProvider;
