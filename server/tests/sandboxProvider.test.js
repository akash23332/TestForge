import { jest } from '@jest/globals';
import { RenderSandboxProvider } from '../src/services/execution/RenderSandboxProvider.js';

describe('Phase 4: RenderSandboxProvider Protocol & Resilience Tests', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // ── 1. Configuration & Safety Guard ─────────────────────────────────────────
  describe('Configuration & Safety Guard', () => {
    test('Throws clear error if executeCode called without configured RENDER_SANDBOX_ENDPOINT', async () => {
      const provider = new RenderSandboxProvider({ endpoint: '' });
      expect(provider.isConfigured()).toBe(false);

      await expect(
        provider.executeCode({
          language: 'javascript',
          code: 'console.log("hello");',
          inputArgs: []
        })
      ).rejects.toThrow(/Isolated sandbox endpoint is not configured/i);
    });

    test('Reports correct security capabilities and languages', () => {
      const provider = new RenderSandboxProvider({ endpoint: 'https://sandbox.testforge.internal' });
      const caps = provider.getCapabilities();

      expect(caps.name).toBe('render_sandbox');
      expect(caps.supportsNetworkIsolation).toBe(true);
      expect(caps.supportsMemoryLimits).toBe(true);
      expect(caps.supportsProcessLimits).toBe(true);
      expect(caps.isHardenedSandbox).toBe(true);
      expect(caps.languages).toEqual(expect.arrayContaining(['javascript', 'python', 'java', 'cpp']));
    });
  });

  // ── 2. TestForge Sandbox Protocol (/execute) ───────────────────────────────
  describe('TestForge Sandbox Protocol (/execute)', () => {
    test('Dispatches execution with zero-network limits and Bearer token', async () => {
      const mockResponseData = {
        status: 'success',
        output: [0, 1],
        error: null,
        runtimeMs: 45,
        memoryKb: 12000
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponseData)
      });

      const provider = new RenderSandboxProvider({
        endpoint: 'https://sandbox.testforge.internal',
        apiKey: 'secret_sandbox_key_123',
        providerType: 'testforge_sandbox'
      });

      const res = await provider.executeCode({
        language: 'javascript',
        code: 'function twoSum(nums, target) { return [0, 1]; }',
        inputArgs: [[2, 7, 11, 15], 9],
        timeoutMs: 3000
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = global.fetch.mock.calls[0];

      expect(url).toBe('https://sandbox.testforge.internal/execute');
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer secret_sandbox_key_123');

      const parsedBody = JSON.parse(options.body);
      expect(parsedBody.language).toBe('javascript');
      expect(parsedBody.limits.network).toBe('none'); // Crucial: zero network access
      expect(parsedBody.limits.timeoutMs).toBe(3000);

      expect(res.status).toBe('success');
      expect(res.output).toEqual([0, 1]);
      expect(res.runtimeMs).toBe(45);
    });

    test('Maps HTTP 500 error from sandbox to status: internal_error (NEVER Wrong Answer)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: jest.fn().mockResolvedValue('Bad Gateway: Container initialization timed out')
      });

      const provider = new RenderSandboxProvider({
        endpoint: 'https://sandbox.testforge.internal'
      });

      const res = await provider.executeCode({
        language: 'python',
        code: 'print("hello")',
        inputArgs: []
      });

      expect(res.status).toBe('internal_error');
      expect(res.error).toMatch(/Sandbox execution service error \(HTTP 502\)/i);
      expect(res.output).toBeNull();
    });

    test('Maps network connection timeout to status: timeout', async () => {
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'TimeoutError';
      global.fetch = jest.fn().mockRejectedValue(timeoutError);

      const provider = new RenderSandboxProvider({
        endpoint: 'https://sandbox.testforge.internal'
      });

      const res = await provider.executeCode({
        language: 'cpp',
        code: 'int main() { while(true); }',
        inputArgs: [],
        timeoutMs: 2000
      });

      expect(res.status).toBe('timeout');
      expect(res.error).toMatch(/timed out after 2000ms/i);
    });
  });

  // ── 3. Judge0 Protocol (/submissions) ──────────────────────────────────────
  describe('Judge0 Protocol (/submissions)', () => {
    test('Correctly maps language IDs and payload for Judge0 API', async () => {
      const mockJudge0Response = {
        status: { id: 3, description: 'Accepted' },
        stdout: '3\n',
        stderr: null,
        time: '0.045',
        memory: 14200
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockJudge0Response)
      });

      const provider = new RenderSandboxProvider({
        endpoint: 'https://judge0.internal',
        apiKey: 'judge0_token_xyz',
        providerType: 'judge0'
      });

      const res = await provider.executeCode({
        language: 'python',
        code: 'def solution(x): return x + 1',
        inputArgs: [2],
        timeoutMs: 3000
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = global.fetch.mock.calls[0];

      expect(url).toContain('/submissions?wait=true');
      expect(options.headers['X-Auth-Token']).toBe('judge0_token_xyz');

      const parsedBody = JSON.parse(options.body);
      expect(parsedBody.language_id).toBe(71); // Python 3
      expect(parsedBody.enable_network).toBe(false); // Outbound network blocked

      expect(res.status).toBe('success');
      expect(res.output).toBe(3);
      expect(res.runtimeMs).toBe(45);
    });

    test('Correctly maps Judge0 compilation error (status ID 6)', async () => {
      const mockJudge0CompileErr = {
        status: { id: 6, description: 'Compilation Error' },
        stdout: null,
        stderr: null,
        compile_output: 'solution.cpp:4:1: error: expected ";" before "}" token'
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockJudge0CompileErr)
      });

      const provider = new RenderSandboxProvider({
        endpoint: 'https://judge0.internal',
        providerType: 'judge0'
      });

      const res = await provider.executeCode({
        language: 'cpp',
        code: 'int main() { return 0 }',
        inputArgs: []
      });

      expect(res.status).toBe('compilation_error');
      expect(res.error).toContain('expected ";" before "}" token');
    });

    test('Correctly maps Judge0 Time Limit Exceeded (status ID 5)', async () => {
      const mockJudge0TLE = {
        status: { id: 5, description: 'Time Limit Exceeded' },
        stdout: null,
        stderr: null
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockJudge0TLE)
      });

      const provider = new RenderSandboxProvider({
        endpoint: 'https://judge0.internal',
        providerType: 'judge0'
      });

      const res = await provider.executeCode({
        language: 'java',
        code: 'public class Solution { public static void main(String[] args) { while(true); } }',
        inputArgs: [],
        timeoutMs: 3500
      });

      expect(res.status).toBe('timeout');
      expect(res.error).toMatch(/Time limit exceeded/i);
    });

    test('Correctly maps Judge0 Memory Limit Exceeded (status description or message)', async () => {
      const mockJudge0MLE = {
        status: { id: 12, description: 'Memory Limit Exceeded' },
        stdout: null,
        stderr: 'java.lang.OutOfMemoryError: Java heap space',
        message: 'Memory limit exceeded'
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockJudge0MLE)
      });

      const provider = new RenderSandboxProvider({
        endpoint: 'https://judge0.internal',
        providerType: 'judge0'
      });

      const res = await provider.executeCode({
        language: 'java',
        code: 'public class Solution { public static void main(String[] args) { int[] a = new int[100000000]; } }',
        inputArgs: []
      });

      expect(res.status).toBe('memory_limit_exceeded');
      expect(res.error).toMatch(/OutOfMemoryError|Memory limit exceeded/i);
    });

    test('Correctly maps Judge0 Memory Limit Exceeded via metadata (memory >= memory_limit) even with empty stderr', async () => {
      const mockJudge0MLEMetadata = {
        status: { id: 11, description: 'Runtime Error (NZEC)' },
        stdout: null,
        stderr: '',
        message: 'Exceeded memory limit',
        memory: 256100,
        memory_limit: 256000
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockJudge0MLEMetadata)
      });

      const provider = new RenderSandboxProvider({
        endpoint: 'https://judge0.internal',
        apiKey: 'secure_auth_token_xyz',
        providerType: 'judge0'
      });

      const res = await provider.executeCode({
        language: 'python',
        code: 'a = [0] * 10000000',
        inputArgs: []
      });

      expect(res.status).toBe('memory_limit_exceeded');
      expect(res.error).toMatch(/Exceeded memory limit|Memory limit exceeded/i);

      // Verify X-Auth-Token header was supplied in request
      const fetchHeaders = global.fetch.mock.calls[0][1].headers;
      expect(fetchHeaders['X-Auth-Token']).toBe('secure_auth_token_xyz');
    });

    test('Accepts RENDER_SANDBOX_URL and RENDER_SANDBOX_TOKEN as backward-compatible fallback env vars', () => {
      process.env.RENDER_SANDBOX_URL = 'https://fallback-runner.internal';
      process.env.RENDER_SANDBOX_TOKEN = 'fallback_token_123';

      const provider = new RenderSandboxProvider({});
      expect(provider.isConfigured()).toBe(true);
      expect(provider.endpoint).toBe('https://fallback-runner.internal');
      expect(provider.apiKey).toBe('fallback_token_123');

      delete process.env.RENDER_SANDBOX_URL;
      delete process.env.RENDER_SANDBOX_TOKEN;
    });

    test('Correctly maps four core languages to standard Judge0 language IDs', async () => {
      const languageChecks = [
        { lang: 'javascript', expectedId: 63 },
        { lang: 'python', expectedId: 71 },
        { lang: 'java', expectedId: 62 },
        { lang: 'cpp', expectedId: 54 }
      ];

      for (const check of languageChecks) {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({
            status: { id: 3, description: 'Accepted' },
            stdout: 'ok'
          })
        });

        const provider = new RenderSandboxProvider({
          endpoint: 'https://judge0.internal',
          providerType: 'judge0'
        });

        await provider.executeCode({
          language: check.lang,
          code: '/* code */',
          inputArgs: []
        });

        const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(callBody.language_id).toBe(check.expectedId);
      }
    });
  });
});
