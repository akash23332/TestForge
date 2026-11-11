import { ExecutionProvider } from './ExecutionProvider.interface.js';
import { config } from '../../config/env.js';
import { ProxyAgent } from 'undici';

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
      process.env.RENDER_SANDBOX_ENDPOINT ||
      process.env.RENDER_SANDBOX_URL ||
      ''
    ).trim();
    this.apiKey = (
      options.apiKey ||
      config.execution?.sandboxApiKey ||
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
      process.env.RENDER_SANDBOX_AUTHZ_TOKEN ||
      ''
    ).trim();
    this.requireProxy = Boolean(
      options.requireProxy ||
      process.env.REQUIRE_PROXY === 'true' ||
      this.endpoint.includes('.ts.net')
    );
    this.dispatcher = this.proxyUrl ? new ProxyAgent(this.proxyUrl) : null;
    this.defaultMemoryLimitMb = options.memoryLimitMb || 256;
    this.defaultCpuLimit = options.cpuLimit || 1.0;
    this.providerType = options.providerType || (this.endpoint.includes('judge0') ? 'judge0' : 'testforge_sandbox');
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
   */
  _parseJudge0Response(data, startTime = 0, timeoutMs = 3500) {
    const statusId = data.status?.id;
    let status = 'success';
    let error = null;

    const desc = (data.status?.description || '').toLowerCase();
    const msg = (data.message || '').toLowerCase();
    const stderr = data.stderr || '';

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
      return {
        token: data.token || null,
        status: 'processing',
        output: null,
        error: null,
        runtimeMs: data.time ? Math.round(Number(data.time) * 1000) : (startTime ? Date.now() - startTime : 0),
        memoryKb: data.memory || 0,
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
      error = data.compile_output || 'Compilation failed';
    } else if (isMemoryError) {
      status = 'memory_limit_exceeded';
      error = stderr || data.message || 'Memory limit exceeded';
    } else if (statusId >= 7 && statusId <= 12) {
      status = 'runtime_error';
      error = stderr || data.message || `Runtime error (${data.status?.description || 'Error'})`;
    } else if (statusId === 13) {
      status = 'internal_error';
      error = `Judge0 internal error: ${data.message || 'Unknown error'}`;
    }

    let parsedOutput = data.stdout?.trim() || null;
    try {
      if (parsedOutput !== null && parsedOutput !== undefined) {
        parsedOutput = JSON.parse(parsedOutput);
      }
    } catch {
      // Keep as string
    }

    return {
      token: data.token || null,
      status,
      statusId,
      output: parsedOutput,
      error,
      runtimeMs: data.time ? Math.round(Number(data.time) * 1000) : (startTime ? Date.now() - startTime : 0),
      memoryKb: data.memory || 0
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
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000)
      };
      if (this.dispatcher) {
        fetchOpts.dispatcher = this.dispatcher;
      }

      const response = await fetch(cleanUrl, fetchOpts);
      if (response.status === 404) {
        return { token, status: 'not_found', exists: false };
      }
      if (!response.ok) {
        return { token, status: 'internal_error', error: `HTTP ${response.status}`, exists: true };
      }

      const data = await response.json();
      const parsed = this._parseJudge0Response(data, 0, timeoutMs);
      parsed.exists = true;
      return parsed;
    } catch (err) {
      return { token, status: 'internal_error', error: err.message, exists: null };
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
        error: err.message,
        isolateProcessKilled: false
      };
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
          error: `Sandbox execution service error (HTTP ${response.status}): ${errorText}`,
          runtimeMs: Date.now() - startTime
        };
      }

      const data = await response.json();

      return {
        status: data.status || 'success',
        output: data.output,
        error: data.error || null,
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
          : `Sandbox connection failure: ${err.message}`,
        runtimeMs
      };
    }
  }

  /**
   * Execution via Judge0 CE API (/submissions?wait=true).
   */
  async _executeViaJudge0({ language, code, inputArgs, timeoutMs, memoryLimitMb, signal = null, onTokenCreated = null }) {
    const startTime = Date.now();
    const cleanUrl = this.endpoint.endsWith('/')
      ? `${this.endpoint}submissions?wait=true&base64_encoded=false`
      : `${this.endpoint}/submissions?wait=true&base64_encoded=false`;

    const langKey = (language || 'javascript').toLowerCase();
    const languageId = JUDGE0_LANGUAGE_IDS[langKey] || 63;
    const serializedStdin = typeof inputArgs === 'string' ? inputArgs : JSON.stringify(inputArgs);

    const payload = {
      source_code: code,
      language_id: languageId,
      stdin: serializedStdin,
      cpu_time_limit: Math.max(1, timeoutMs / 1000),
      wall_time_limit: Math.max(2, (timeoutMs + 1500) / 1000),
      memory_limit: memoryLimitMb * 1024,
      max_file_size: 1024,
      enable_network: false // CRITICAL: Outbound networking disabled in isolate
    };

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
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs + 3500)])
        : AbortSignal.timeout(timeoutMs + 3500);

      const fetchOpts = {
        method: 'POST',
        headers,
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
          error: `Judge0 runner error (HTTP ${response.status}): ${errorText}`,
          runtimeMs: Date.now() - startTime
        };
      }

      const data = await response.json();

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
      const isAborted = signal?.aborted || err.name === 'AbortError';
      if (isAborted) {
        return {
          status: 'cancelled',
          output: null,
          error: 'Judge0 execution cancelled by caller or lease preemption.',
          runtimeMs
        };
      }
      const isTimeout = err.name === 'TimeoutError' || runtimeMs >= timeoutMs;

      return {
        status: isTimeout ? 'timeout' : 'internal_error',
        output: null,
        error: isTimeout
          ? `Judge0 execution timed out after ${timeoutMs}ms.`
          : `Judge0 connection failure: ${err.message}`,
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
      providerType: this.providerType,
      languages: ['javascript', 'python', 'java', 'cpp']
    };
  }
}

export default RenderSandboxProvider;
