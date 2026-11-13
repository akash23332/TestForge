import { jest } from '@jest/globals';
import {
  OnlineCompilerProvider,
  DEFAULT_ONLINE_COMPILER_IDENTIFIERS
} from '../src/services/execution/OnlineCompilerProvider.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';

describe('Phase 2A: OnlineCompilerProvider Mocked Integration & Contract Suite', () => {
  const MOCK_API_KEY = 'mock_online_compiler_api_key_test_12345';
  const MOCK_ENDPOINT = 'https://api.onlinecompiler.io/api/run-code-sync/';
  let originalFetch;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Provider Registration & Capability Contract
  // ──────────────────────────────────────────────────────────────────────────
  describe('Provider Registry & Capabilities', () => {
    it('is registered in providerRegistry under "onlinecompiler"', () => {
      const provider = providerRegistry.getProvider('onlinecompiler');
      expect(provider).toBeInstanceOf(OnlineCompilerProvider);
      expect(provider.name).toBe('onlinecompiler');
    });

    it('reports hardened sandbox capabilities and supported languages', () => {
      const provider = new OnlineCompilerProvider();
      const caps = provider.getCapabilities();
      expect(caps.name).toBe('onlinecompiler');
      expect(caps.isHardenedSandbox).toBe(true);
      expect(caps.supportsNetworkIsolation).toBe(true);
      expect(caps.supportsMemoryLimits).toBe(true);
      expect(caps.supportsProcessLimits).toBe(true);
      expect(caps.languages).toEqual(expect.arrayContaining(['javascript', 'python', 'java', 'cpp']));
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Verified Compiler Identifier Language Mappings
  // ──────────────────────────────────────────────────────────────────────────
  describe('Verified Language & Compiler Identifier Mappings', () => {
    it('maps all four languages using verified compiler identifiers', () => {
      expect(DEFAULT_ONLINE_COMPILER_IDENTIFIERS.python).toBe('python-3.14');
      expect(DEFAULT_ONLINE_COMPILER_IDENTIFIERS.py).toBe('python-3.14');
      expect(DEFAULT_ONLINE_COMPILER_IDENTIFIERS.cpp).toBe('g++-15');
      expect(DEFAULT_ONLINE_COMPILER_IDENTIFIERS['c++']).toBe('g++-15');
      expect(DEFAULT_ONLINE_COMPILER_IDENTIFIERS.java).toBe('openjdk-25');
      expect(DEFAULT_ONLINE_COMPILER_IDENTIFIERS.javascript).toBe('nodejs-24');
      expect(DEFAULT_ONLINE_COMPILER_IDENTIFIERS.js).toBe('nodejs-24');
    });

    it.each([
      ['python', 'python-3.14', 'print("hello")'],
      ['cpp', 'g++-15', '#include <iostream>\nint main() { return 0; }'],
      ['java', 'openjdk-25', 'class Solution {}'],
      ['javascript', 'nodejs-24', 'console.log("hello")']
    ])('sends correct payload for language %s with compiler %s', async (lang, expectedCompiler, sampleCode) => {
      let capturedBody = null;

      global.fetch = jest.fn(async (_, opts) => {
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            output: 'mock output',
            error: '',
            status: 'success',
            exit_code: 0,
            signal: null,
            truncated: false,
            time: '0.025',
            memory: '12400'
          })
        };
      });

      const provider = new OnlineCompilerProvider({
        apiKey: MOCK_API_KEY,
        endpoint: MOCK_ENDPOINT
      });

      const res = await provider.executeCode({
        language: lang,
        code: sampleCode,
        inputArgs: ''
      });

      expect(res.status).toBe('success');
      expect(capturedBody.compiler).toBe(expectedCompiler);
      expect(capturedBody.code).toBe(sampleCode);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Authorization Header & Credential Redaction
  // ──────────────────────────────────────────────────────────────────────────
  describe('Authorization Header & Credential Security', () => {
    it('sends raw API key directly in Authorization header without Bearer prefix', async () => {
      let capturedHeaders = null;

      global.fetch = jest.fn(async (_, opts) => {
        capturedHeaders = opts.headers;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            output: 'success',
            error: '',
            status: 'success',
            exit_code: 0,
            time: '0.01'
          })
        };
      });

      const provider = new OnlineCompilerProvider({
        apiKey: MOCK_API_KEY,
        endpoint: MOCK_ENDPOINT
      });

      await provider.executeCode({
        language: 'python',
        code: 'pass',
        inputArgs: ''
      });

      expect(capturedHeaders['Authorization']).toBe(MOCK_API_KEY);
      expect(capturedHeaders['Authorization']).not.toMatch(/^Bearer\s+/);
    });

    it('strips redundant Bearer prefix if configured in env or options', async () => {
      let capturedHeaders = null;

      global.fetch = jest.fn(async (_, opts) => {
        capturedHeaders = opts.headers;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            output: 'success',
            error: '',
            status: 'success',
            exit_code: 0,
            time: '0.01'
          })
        };
      });

      const provider = new OnlineCompilerProvider({
        apiKey: `Bearer ${MOCK_API_KEY}`,
        endpoint: MOCK_ENDPOINT
      });

      await provider.executeCode({
        language: 'python',
        code: 'pass',
        inputArgs: ''
      });

      expect(capturedHeaders['Authorization']).toBe(MOCK_API_KEY);
    });

    it('redacts credentials from error messages and logs (Zero-Leak)', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => `Server internal failure for key ${MOCK_API_KEY}: quota exceeded`
      }));

      const provider = new OnlineCompilerProvider({
        apiKey: MOCK_API_KEY,
        endpoint: MOCK_ENDPOINT
      });

      const result = await provider.executeCode({
        language: 'python',
        code: 'pass',
        inputArgs: ''
      });

      expect(result.status).toBe('internal_error');
      expect(result.error).not.toContain(MOCK_API_KEY);
      expect(result.error).toContain('[REDACTED_API_KEY]');
    });

    it('fails closed when API key is missing in production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const provider = new OnlineCompilerProvider({
          apiKey: '',
          endpoint: MOCK_ENDPOINT
        });

        const result = await provider.executeCode({
          language: 'python',
          code: 'print(1)',
          inputArgs: ''
        });

        expect(result.status).toBe('internal_error');
        expect(result.output).toBeNull();
        expect(result.error).toMatch(/FAIL-CLOSED/i);
        expect(result.error).toMatch(/API key/i);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Response Normalization & Status Mapping
  // ──────────────────────────────────────────────────────────────────────────
  describe('Response Normalization & Status Verdicts', () => {
    it('normalizes successful execution with time and memory metrics', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          output: 'Hello TestForge\n',
          error: '',
          status: 'success',
          exit_code: 0,
          signal: null,
          truncated: false,
          time: '0.0305',
          memory: '13120'
        })
      }));

      const provider = new OnlineCompilerProvider({ apiKey: MOCK_API_KEY });
      const res = await provider.executeCode({
        language: 'python',
        code: 'print("Hello TestForge")',
        inputArgs: ''
      });

      expect(res.status).toBe('success');
      expect(res.output).toBe('Hello TestForge');
      expect(res.error).toBeNull();
      expect(res.runtimeMs).toBe(31); // 0.0305s -> 31ms
      expect(res.memoryKb).toBe(13120);
      expect(res.truncated).toBe(false);
    });

    it('correctly maps compilation errors (syntax error / compiler diagnostics)', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          output: '',
          error: 'main.cpp:2:1: error: expected identifier before numeric constant',
          status: 'compilation_error',
          exit_code: 1,
          signal: null,
          truncated: false,
          time: '0.010'
        })
      }));

      const provider = new OnlineCompilerProvider({ apiKey: MOCK_API_KEY });
      const res = await provider.executeCode({
        language: 'cpp',
        code: 'bad c++',
        inputArgs: ''
      });

      expect(res.status).toBe('compilation_error');
      expect(res.error).toContain('error: expected identifier');
    });

    it('correctly maps runtime errors (ZeroDivisionError / exit_code != 0)', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          output: '',
          error: 'Traceback (most recent call last):\n  File "main.py", line 1, in <module>\n    1 / 0\nZeroDivisionError: division by zero',
          status: 'error',
          exit_code: 1,
          signal: null,
          truncated: false,
          time: '0.020'
        })
      }));

      const provider = new OnlineCompilerProvider({ apiKey: MOCK_API_KEY });
      const res = await provider.executeCode({
        language: 'python',
        code: 'print(1 / 0)',
        inputArgs: ''
      });

      expect(res.status).toBe('runtime_error');
      expect(res.error).toContain('ZeroDivisionError');
    });

    it('correctly maps timeout via status, signal or exit code 124', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          output: '',
          error: 'Time Limit Exceeded (CPU limit reached)',
          status: 'timeout',
          exit_code: 124,
          signal: 'SIGKILL',
          truncated: false,
          time: '3.000'
        })
      }));

      const provider = new OnlineCompilerProvider({ apiKey: MOCK_API_KEY });
      const res = await provider.executeCode({
        language: 'python',
        code: 'while True: pass',
        inputArgs: ''
      });

      expect(res.status).toBe('timeout');
      expect(res.error).toContain('Time Limit Exceeded');
    });

    it('correctly captures and flags output truncation', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          output: 'truncated partial output...',
          error: '',
          status: 'success',
          exit_code: 0,
          signal: null,
          truncated: true,
          time: '0.05'
        })
      }));

      const provider = new OnlineCompilerProvider({ apiKey: MOCK_API_KEY });
      const res = await provider.executeCode({
        language: 'javascript',
        code: 'for(let i=0; i<100000; i++) console.log(i);',
        inputArgs: ''
      });

      expect(res.status).toBe('success');
      expect(res.truncated).toBe(true);
      expect(res.output).toContain('truncated');
    });

    it('handles malformed JSON response safely as internal_error', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token < in JSON at position 0');
        }
      }));

      const provider = new OnlineCompilerProvider({ apiKey: MOCK_API_KEY });
      const res = await provider.executeCode({
        language: 'python',
        code: 'print(1)',
        inputArgs: ''
      });

      expect(res.status).toBe('internal_error');
      expect(res.error).toContain('Malformed JSON response');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. HTTP Error Status Handling (401, 403, 429, 5xx)
  // ──────────────────────────────────────────────────────────────────────────
  describe('HTTP Status Code Error Handling', () => {
    it('handles HTTP 401 Unauthorized as fail-closed internal_error', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => '{"error": "Unauthorized"}'
      }));

      const provider = new OnlineCompilerProvider({ apiKey: MOCK_API_KEY });
      const res = await provider.executeCode({
        language: 'python',
        code: 'print(1)',
        inputArgs: ''
      });

      expect(res.status).toBe('internal_error');
      expect(res.error).toMatch(/Authentication \/ Authorization Failure/i);
      expect(res.error).toMatch(/HTTP 401/i);
    });

    it('handles HTTP 403 Forbidden as fail-closed internal_error', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 403,
        text: async () => '{"error": "Missing Authorization header"}'
      }));

      const provider = new OnlineCompilerProvider({ apiKey: MOCK_API_KEY });
      const res = await provider.executeCode({
        language: 'python',
        code: 'print(1)',
        inputArgs: ''
      });

      expect(res.status).toBe('internal_error');
      expect(res.error).toMatch(/Authentication \/ Authorization Failure/i);
      expect(res.error).toMatch(/HTTP 403/i);
    });

    it('handles HTTP 429 Rate Limit Exceeded as fail-closed internal_error', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 429,
        text: async () => '{"error": "Rate limit exceeded"}'
      }));

      const provider = new OnlineCompilerProvider({ apiKey: MOCK_API_KEY });
      const res = await provider.executeCode({
        language: 'python',
        code: 'print(1)',
        inputArgs: ''
      });

      expect(res.status).toBe('internal_error');
      expect(res.error).toMatch(/Rate Limit Exceeded/i);
      expect(res.error).toMatch(/HTTP 429/i);
    });

    it('handles HTTP 5xx Upstream Server Errors as fail-closed internal_error', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 502,
        text: async () => 'Bad Gateway'
      }));

      const provider = new OnlineCompilerProvider({ apiKey: MOCK_API_KEY });
      const res = await provider.executeCode({
        language: 'python',
        code: 'print(1)',
        inputArgs: ''
      });

      expect(res.status).toBe('internal_error');
      expect(res.error).toMatch(/Upstream Service Error/i);
      expect(res.error).toMatch(/HTTP 502/i);
    });

    it('handles network connection timeout gracefully', async () => {
      global.fetch = jest.fn(async () => {
        const err = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        throw err;
      });

      const provider = new OnlineCompilerProvider({ apiKey: MOCK_API_KEY });
      const res = await provider.executeCode({
        language: 'python',
        code: 'print(1)',
        inputArgs: '',
        timeoutMs: 100
      });

      expect(res.status).toBe('timeout');
      expect(res.error).toMatch(/timed out/i);
    });
  });
});
