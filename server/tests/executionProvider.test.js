import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import { MockExecutionProvider } from '../src/services/execution/MockExecutionProvider.js';
import { RenderSandboxProvider } from '../src/services/execution/RenderSandboxProvider.js';
import { LocalExecutionProvider } from '../src/services/execution/LocalExecutionProvider.js';
import { validateSingleTestCase } from '../src/services/codeRunner.service.js';

describe('Phase 2.2: Execution Provider Abstraction & Isolation Tests', () => {

  afterEach(() => {
    providerRegistry.setActiveProvider('local');
  });

  test('Registry lists all registered providers and their security capabilities', () => {
    const capabilities = providerRegistry.listCapabilities();

    expect(capabilities).toHaveProperty('mock');
    expect(capabilities).toHaveProperty('local');
    expect(capabilities).toHaveProperty('render_sandbox');

    expect(capabilities.mock.supportsNetworkIsolation).toBe(true);
    expect(capabilities.local.supportsNetworkIsolation).toBe(false);
    expect(capabilities.render_sandbox.supportsNetworkIsolation).toBe(true);
  });

  test('MockExecutionProvider runs code deterministically and handles simulated timeout', async () => {
    const mock = new MockExecutionProvider();
    const result = await mock.executeCode({
      language: 'javascript',
      code: 'while (true) {} // SIMULATE_TIMEOUT',
      inputArgs: [1, 2],
      timeoutMs: 100
    });

    expect(result.status).toBe('timeout');
    expect(result.error).toMatch(/timed out/i);
  });

  test('MockExecutionProvider allows custom handler for specific grading tests', async () => {
    const mock = new MockExecutionProvider();
    mock.setHandler(() => ({
      status: 'success',
      output: [42, 84],
      error: null,
      runtimeMs: 12
    }));

    const result = await mock.executeCode({
      language: 'python',
      code: 'def sol(): pass',
      inputArgs: []
    });

    expect(result.status).toBe('success');
    expect(result.output).toEqual([42, 84]);
  });

  test('validateSingleTestCase seamlessly uses MockExecutionProvider when configured', async () => {
    const mock = new MockExecutionProvider();
    mock.setHandler(() => ({
      status: 'success',
      output: 100,
      error: null,
      runtimeMs: 15
    }));

    providerRegistry.setActiveProvider(mock);

    const testCase = {
      _id: 'tc_mock',
      category: 'sample',
      visibility: 'public',
      input: '50',
      expectedOutput: '100'
    };

    const judgeResult = await validateSingleTestCase({
      code: 'function double(x) { return x * 2; }',
      testCase,
      questionContext: { title: 'Double Number' }
    });

    expect(judgeResult.passed).toBe(true);
    expect(judgeResult.status).toBe('passed');
    expect(judgeResult.actualOutput).toBe('100');
  });

  test('RenderSandboxProvider prevents execution without configured endpoint', async () => {
    const unconfiguredSandbox = new RenderSandboxProvider({ endpoint: '' });
    expect(unconfiguredSandbox.isConfigured()).toBe(false);

    await expect(
      unconfiguredSandbox.executeCode({
        language: 'javascript',
        code: 'console.log(1)',
        inputArgs: []
      })
    ).rejects.toThrow(/Isolated sandbox endpoint is not configured/i);
  });

  test('RenderSandboxProvider maps memory_limit_exceeded and internal_error without marking as Wrong Answer', async () => {
    const mockSandbox = new MockExecutionProvider();
    mockSandbox.setHandler(() => ({
      status: 'memory_limit_exceeded',
      output: null,
      error: 'Process memory ceiling exceeded (256MB limit)',
      runtimeMs: 50
    }));

    const testCase = {
      _id: 'tc_mem',
      category: 'sample',
      visibility: 'public',
      input: '1000',
      expectedOutput: '1000'
    };

    const judgeResult = await validateSingleTestCase({
      code: 'function memoryHog() {}',
      testCase,
      provider: mockSandbox
    });

    // Infrastructure / Resource limits must NEVER be marked as a plain Wrong Answer (failed)
    expect(judgeResult.status).toBe('memory_limit_exceeded');
    expect(judgeResult.passed).toBe(false);
    expect(judgeResult.error).toMatch(/memory/i);
  });
});
