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
      questionContext = {}
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
      return this._executeViaJudge0({ language, code, inputArgs, timeoutMs, memoryLimitMb, questionContext });
    }

    return this._executeViaTestForgeSandbox({ language, code, inputArgs, timeoutMs, memoryLimitMb, questionContext });
  }

  /**
   * Direct execution via TestForge Hardened Sandbox microservice (/execute).
   */
  async _executeViaTestForgeSandbox({ language, code, inputArgs, timeoutMs, memoryLimitMb, questionContext }) {
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

      const fetchOpts = {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs + 3000)
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
  async _executeViaJudge0({ language, code, inputArgs, timeoutMs, memoryLimitMb }) {
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

      const fetchOpts = {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs + 3500)
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
      const statusId = data.status?.id;

      // Map Judge0 status IDs to standardized TestForge execution statuses
      // 3 = Accepted, 4 = Wrong Answer (from Judge0 POV, but TestForge grades it), 5 = Time Limit Exceeded, 6 = Compilation Error, 7-12 = Runtime Error
      let status = 'success';
      let error = null;

      const desc = (data.status?.description || '').toLowerCase();
      const msg = (data.message || '').toLowerCase();
      const stderr = data.stderr || '';

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
        status,
        output: parsedOutput,
        error,
        runtimeMs: data.time ? Math.round(Number(data.time) * 1000) : (Date.now() - startTime),
        memoryKb: data.memory || 0
      };
    } catch (err) {
      const runtimeMs = Date.now() - startTime;
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
