import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { RenderSandboxProvider } from '../src/services/execution/RenderSandboxProvider.js';
import { MockExecutionProvider } from '../src/services/execution/MockExecutionProvider.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import { processExecutionJob } from '../src/services/queue/executionProcessor.js';
import { Submission } from '../src/models/Submission.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';

describe('Phase 5.1C-1: Backend-to-Runner Integration & Reliability Tests', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // ── 1. Valid Authenticated Remote Execution ────────────────────────────────
  test('1. Valid authenticated remote execution sends correct headers, limits, and parses output', async () => {
    let capturedUrl = '';
    let capturedOpts = {};

    global.fetch = jest.fn().mockImplementation(async (url, opts) => {
      capturedUrl = url.toString();
      capturedOpts = opts;
      return new Response(
        JSON.stringify({
          token: 'sub-token-uuid-1',
          status: { id: 3, description: 'Accepted' },
          stdout: '42\n',
          stderr: null,
          compile_output: null,
          time: '0.042',
          memory: 15400
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const provider = new RenderSandboxProvider({
      endpoint: 'https://runner.testforge.internal:2358',
      apiKey: 'test-secret-token-xyz',
      authzToken: 'test-user-token-abc',
      connectionTimeoutMs: 3000,
      responseTimeoutMs: 8000
    });

    let reportedToken = null;
    const result = await provider.executeCode({
      language: 'javascript',
      code: 'console.log(42);',
      inputArgs: [],
      timeoutMs: 3500,
      memoryLimitMb: 256,
      onTokenCreated: (tok) => { reportedToken = tok; }
    });

    expect(capturedUrl).toContain('https://runner.testforge.internal:2358/submissions?wait=true');
    expect(capturedOpts.method).toBe('POST');
    expect(capturedOpts.headers['X-Auth-Token']).toBe('test-secret-token-xyz');
    expect(capturedOpts.headers['X-Auth-User']).toBe('test-user-token-abc');

    const sentBody = JSON.parse(capturedOpts.body);
    expect(sentBody.source_code).toBe('console.log(42);');
    expect(sentBody.language_id).toBe(63); // JavaScript
    expect(sentBody.enable_network).toBe(false); // Isolated network

    expect(reportedToken).toBe('sub-token-uuid-1');
    expect(result.status).toBe('success');
    expect(result.output).toBe(42);
    expect(result.runtimeMs).toBe(42);
    expect(result.memoryKb).toBe(15400);
    expect(result.error).toBeNull();
  });

  // ── 2. Missing Authentication Configuration ────────────────────────────────
  test('2. Missing authentication configuration returns internal_error when runner rejects request', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing API Token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const provider = new RenderSandboxProvider({
      endpoint: 'https://runner.testforge.internal:2358',
      apiKey: '' // Missing API token
    });

    const result = await provider.executeCode({
      language: 'python',
      code: 'print("test")',
      inputArgs: []
    });

    expect(result.status).toBe('internal_error');
    expect(result.error).toMatch(/authentication failure/i);
    expect(result.error).not.toContain('secret');
  });

  // ── 3. Invalid TLS Certificate ─────────────────────────────────────────────
  test('3. Invalid TLS certificate fails closed and prevents untrusted connection', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      const err = new Error('self signed certificate in certificate chain');
      err.code = 'DEPTH_ZERO_SELF_SIGNED_CERT';
      throw err;
    });

    const provider = new RenderSandboxProvider({
      endpoint: 'https://untrusted-runner.internal:2358',
      apiKey: 'secret-token-123'
    });

    const result = await provider.executeCode({
      language: 'javascript',
      code: 'console.log(1)',
      inputArgs: []
    });

    expect(result.status).toBe('internal_error');
    expect(result.error).toMatch(/TLS certificate validation failed/i);
    expect(result.error).not.toContain('secret-token-123');
  });

  // ── 4. Connection Timeout ──────────────────────────────────────────────────
  test('4. Connection timeout aborts and returns internal_error with timeout details', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      const err = new Error('TCP connection timed out');
      err.name = 'TimeoutError';
      throw err;
    });

    const provider = new RenderSandboxProvider({
      endpoint: 'https://runner.testforge.internal:2358',
      apiKey: 'secret-token-123',
      connectionTimeoutMs: 1000
    });

    const result = await provider.executeCode({
      language: 'javascript',
      code: 'console.log(1)',
      inputArgs: []
    });

    expect(result.status).toBe('timeout');
    expect(result.error).toMatch(/timed out/i);
    expect(result.error).not.toContain('secret-token-123');
  });

  // ── 5. Response Timeout ───────────────────────────────────────────────────
  test('5. Response timeout during long execution returns timeout status without crashing', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      const err = new Error('Headers/body timeout waiting for runner response');
      err.name = 'TimeoutError';
      throw err;
    });

    const provider = new RenderSandboxProvider({
      endpoint: 'https://runner.testforge.internal:2358',
      apiKey: 'secret-token-123',
      responseTimeoutMs: 4000
    });

    const result = await provider.executeCode({
      language: 'cpp',
      code: 'int main() { while(true); }',
      inputArgs: [],
      timeoutMs: 3500
    });

    expect(result.status).toBe('timeout');
    expect(result.error).toMatch(/timed out/i);
  });

  // ── 6. Runner Unavailable (502 / 503 / 504 / ECONNREFUSED) ─────────────────
  test('6. Runner unavailable returns internal_error and does not award marks', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      return new Response('<html>502 Bad Gateway: Runner worker offline</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' }
      });
    });

    const provider = new RenderSandboxProvider({
      endpoint: 'https://runner.testforge.internal:2358',
      apiKey: 'secret-token-123'
    });

    const result = await provider.executeCode({
      language: 'java',
      code: 'class Main {}',
      inputArgs: []
    });

    expect(result.status).toBe('internal_error');
    expect(result.error).toMatch(/Judge0 runner unavailable \(HTTP 502\)/i);
  });

  // ── 7. Malformed Judge0 Response ───────────────────────────────────────────
  test('7. Malformed Judge0 response (missing status ID or invalid JSON) fails closed', async () => {
    // 7a. Non-JSON response
    global.fetch = jest.fn().mockImplementation(async () => {
      return new Response('NOT_A_VALID_JSON', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    });

    const provider = new RenderSandboxProvider({
      endpoint: 'https://runner.testforge.internal:2358',
      apiKey: 'secret-token-123'
    });

    const result1 = await provider.executeCode({
      language: 'javascript',
      code: 'console.log(1)',
      inputArgs: []
    });

    expect(result1.status).toBe('internal_error');
    expect(result1.error).toMatch(/Malformed Judge0 runner response/i);

    // 7b. Missing status object
    global.fetch = jest.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ unexpected: 'payload' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const result2 = await provider.executeCode({
      language: 'javascript',
      code: 'console.log(1)',
      inputArgs: []
    });

    expect(result2.status).toBe('internal_error');
    expect(result2.error).toMatch(/invalid or missing status ID/i);
  });

  // ── 8. Unauthorized Response (401 / 403) ───────────────────────────────────
  test('8. Unauthorized response is detected and tokens are sanitized', async () => {
    const rawSecret = 'SUPER_SECRET_TOKEN_DO_NOT_LEAK_123';
    global.fetch = jest.fn().mockImplementation(async () => {
      return new Response(`Forbidden: token ${rawSecret} is not authorized`, {
        status: 403,
        headers: { 'Content-Type': 'text/plain' }
      });
    });

    const provider = new RenderSandboxProvider({
      endpoint: 'https://runner.testforge.internal:2358',
      apiKey: rawSecret
    });

    const result = await provider.executeCode({
      language: 'python',
      code: 'print(1)',
      inputArgs: []
    });

    expect(result.status).toBe('internal_error');
    expect(result.error).toMatch(/authentication failure/i);
    expect(result.error).not.toContain(rawSecret);
  });

  // ── 9. Rate-Limit Response (429) ───────────────────────────────────────────
  test('9. Rate-limit response (HTTP 429) is classified as internal_error for backoff retry', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const provider = new RenderSandboxProvider({
      endpoint: 'https://runner.testforge.internal:2358',
      apiKey: 'secret-token-123'
    });

    const result = await provider.executeCode({
      language: 'python',
      code: 'print(1)',
      inputArgs: []
    });

    expect(result.status).toBe('internal_error');
    expect(result.error).toMatch(/rate limit exceeded/i);
  });

  // ── 10. Duplicate Submission & Idempotency ──────────────────────────────────
  test('10. Duplicate submission already COMPLETED is ignored idempotently', async () => {
    const subId = new mongoose.Types.ObjectId();
    const completedSub = {
      _id: subId,
      status: 'COMPLETED',
      verdict: 'ACCEPTED',
      save: jest.fn()
    };

    jest.spyOn(Submission, 'findById').mockResolvedValue(completedSub);

    const job = {
      id: `exec_${subId}`,
      data: {
        submissionId: subId.toString(),
        attemptId: new mongoose.Types.ObjectId().toString(),
        questionId: new mongoose.Types.ObjectId().toString(),
        runType: 'SUBMISSION'
      }
    };

    const res = await processExecutionJob(job);
    expect(res.alreadyCompleted).toBe(true);
    expect(res.status).toBe('COMPLETED');
    expect(res.verdict).toBe('ACCEPTED');
  });

  // ── 11. Worker Restart and Recovery ─────────────────────────────────────────
  test('11. Stalled submission with expired lease can be claimed on worker restart', async () => {
    const subId = new mongoose.Types.ObjectId();
    const expiredLeaseDate = new Date(Date.now() - 10000); // 10s in the past

    const stalledSub = {
      _id: subId,
      status: 'RUNNING',
      executionLeaseExpiresAt: expiredLeaseDate,
      code: 'console.log("ok");',
      language: 'javascript',
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(Submission, 'findById').mockResolvedValue(stalledSub);
    const findOneAndUpdateSpy = jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue({
      ...stalledSub,
      executionOwner: 'new-worker-uuid-2',
      executionLeaseExpiresAt: new Date(Date.now() + 60000),
      executionVersion: 2
    });

    const questionId = new mongoose.Types.ObjectId();
    jest.spyOn(Question, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: questionId, title: 'Sample Q' })
    });
    jest.spyOn(TestCase, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([])
    });

    const job = {
      id: `exec_${subId}`,
      data: {
        submissionId: subId.toString(),
        attemptId: new mongoose.Types.ObjectId().toString(),
        questionId: questionId.toString(),
        runType: 'SUBMISSION'
      }
    };

    await processExecutionJob(job);

    // Assert findOneAndUpdate targeted stalled submission with expired lease
    expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: subId,
        $or: expect.arrayContaining([
          expect.objectContaining({ status: 'RUNNING', executionLeaseExpiresAt: expect.any(Object) })
        ])
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  // ── 12. Cancellation Behavior & Limitations ─────────────────────────────────
  test('12. Cancellation deletes submission from queue while documenting isolate wall-time limit', async () => {
    let capturedMethod = '';
    let capturedUrl = '';

    global.fetch = jest.fn().mockImplementation(async (url, opts) => {
      capturedUrl = url.toString();
      capturedMethod = opts.method;
      return new Response(null, { status: 204 });
    });

    const provider = new RenderSandboxProvider({
      endpoint: 'https://runner.testforge.internal:2358',
      apiKey: 'secret-token-123'
    });

    const cancelResult = await provider.cancelSubmission('judge0-active-token-999');

    expect(capturedMethod).toBe('DELETE');
    expect(capturedUrl).toContain('/submissions/judge0-active-token-999');
    expect(cancelResult.success).toBe(true);
    expect(cancelResult.cancellationStatus).toBe('DELETED_FROM_QUEUE_WALL_TIME_UNCONFIRMED');
    expect(cancelResult.isolateProcessKilled).toBe(false); // Accurately documents Judge0 CE limitation
  });

  // ── 13. No Local Execution Fallback ─────────────────────────────────────────
  test('13. Production environment strictly refuses to fallback to LocalExecutionProvider', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      expect(() => {
        providerRegistry.setActiveProvider('local');
      }).toThrow(/Refusing to initialize LocalExecutionProvider in production/i);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // ── 14. No Score Awarded When Execution Unavailable ────────────────────────
  test('14. Infrastructure failure transitions submission to EXECUTION_UNAVAILABLE with zero score', async () => {
    const subId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();
    const attemptId = new mongoose.Types.ObjectId();

    const mockSub = {
      _id: subId,
      questionId,
      attemptId,
      status: 'QUEUED',
      code: 'print(42)',
      language: 'python',
      maxMarks: 10,
      runType: 'SUBMISSION',
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
    const updateSpy = jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue({
      ...mockSub,
      status: 'RUNNING',
      executionOwner: 'owner-uuid-infra-1'
    });

    jest.spyOn(Question, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: questionId, title: 'Sample Q', language: 'python' })
    });

    jest.spyOn(TestCase, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { _id: new mongoose.Types.ObjectId(), input: '1', expectedOutput: '1', category: 'sample', visibility: 'public' }
      ])
    });

    const studentAnswerSpy = jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue({});

    // Provider simulates 503 Service Unavailable / Runner down
    const failingProvider = new MockExecutionProvider();
    failingProvider.setHandler(() => ({
      status: 'internal_error',
      output: null,
      error: 'Judge0 runner unavailable: 503 Service Unavailable',
      runtimeMs: 10
    }));

    jest.spyOn(providerRegistry, 'getProvider').mockReturnValue(failingProvider);

    const job = {
      id: `exec_${subId}`,
      data: {
        submissionId: subId.toString(),
        attemptId: attemptId.toString(),
        questionId: questionId.toString(),
        runType: 'SUBMISSION'
      }
    };

    // processExecutionJob re-throws infrastructure failure for BullMQ backoff retry
    await expect(processExecutionJob(job)).rejects.toThrow(/Infrastructure failure: Runner unavailable/i);

    // Verify submission record was finalized with EXECUTION_UNAVAILABLE and scoreAwarded = null
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ _id: subId, status: 'RUNNING' }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'EXECUTION_UNAVAILABLE',
          verdict: 'EXECUTION_UNAVAILABLE',
          scoreAwarded: null
        })
      }),
      expect.any(Object)
    );

    // Verify student answer was NEVER updated with false score or marks
    expect(studentAnswerSpy).not.toHaveBeenCalled();
  });

  // ── 15. SSRF & Scheme Validation ───────────────────────────────────────────
  test('15. Rejects unsupported endpoint schemes (e.g. ftp:// or file://) to prevent SSRF', () => {
    expect(() => {
      new RenderSandboxProvider({ endpoint: 'ftp://evil.runner.internal' });
    }).toThrow(/Unsupported endpoint protocol/i);

    expect(() => {
      new RenderSandboxProvider({ endpoint: 'not-a-valid-url' });
    }).toThrow(/Invalid runner endpoint URL/i);
  });

  // ── 16. Insecure Plaintext HTTP in Production ──────────────────────────────
  test('16. Strictly forbids plaintext HTTP in production without a secure proxy', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => {
        new RenderSandboxProvider({ endpoint: 'http://remote-runner.example.com:2358' });
      }).toThrow(/Insecure plaintext HTTP endpoint .* is strictly prohibited in production/i);

      // Localhost / 127.0.0.1 is permitted for container loopback
      expect(() => {
        new RenderSandboxProvider({ endpoint: 'http://127.0.0.1:2358' });
      }).not.toThrow();

      // Remote HTTP is permitted IF proxyUrl or requireProxy is configured
      expect(() => {
        new RenderSandboxProvider({
          endpoint: 'http://100.64.0.1:2358',
          proxyUrl: 'http://127.0.0.1:1056'
        });
      }).not.toThrow();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  // ── 17. Uncontrolled HTTP Redirects (Token Leak Protection) ────────────────
  test('17. Enforces redirect: error to prevent credential leakage across 3xx redirects', async () => {
    let capturedOpts = null;
    global.fetch = jest.fn().mockImplementation(async (url, opts) => {
      capturedOpts = opts;
      return new Response(JSON.stringify({
        token: 'tok-red-1',
        status: { id: 3 },
        time: '0.01',
        memory: 1000
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const provider = new RenderSandboxProvider({
      endpoint: 'https://runner.testforge.internal:2358',
      apiKey: 'secret-token-redirect-test'
    });

    await provider.executeCode({
      language: 'javascript',
      code: '1',
      inputArgs: []
    });

    expect(capturedOpts.redirect).toBe('error');
  });

  // ── 18. Health Check Caching (Anti-DoS Protection) ─────────────────────────
  test('18. Caches checkHealth results to prevent excessive request load on runner', async () => {
    let fetchCount = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      fetchCount++;
      return new Response(JSON.stringify({ version: '1.13.1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const provider = new RenderSandboxProvider({
      endpoint: 'https://runner.testforge.internal:2358',
      apiKey: 'secret-token-health-test'
    });

    const res1 = await provider.checkHealth();
    const res2 = await provider.checkHealth();
    const res3 = await provider.checkHealth();

    // Despite 3 calls, runner should only be hit once due to 5-second TTL cache
    expect(fetchCount).toBe(1);
    expect(res1.healthy).toBe(true);
    expect(res2.healthy).toBe(true);
    expect(res3.healthy).toBe(true);

    // Force refresh bypasses cache
    await provider.checkHealth({ forceRefresh: true });
    expect(fetchCount).toBe(2);
  });
});
