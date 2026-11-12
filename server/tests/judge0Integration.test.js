import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MockJudge0Server } from './helpers/mockJudge0Server.js';
import { RenderSandboxProvider } from '../src/services/execution/RenderSandboxProvider.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import { validateSingleTestCase, compareOutputs } from '../src/services/codeRunner.service.js';
import { processExecutionJob } from '../src/services/queue/executionProcessor.js';
import { recalculateAttemptGrading } from '../src/services/attemptGrading.service.js';
import { runSampleTests } from '../src/controllers/attempt.controller.js';
import { Submission } from '../src/models/Submission.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';

describe('Milestone R1: Local Code Runner Integration Tests (Judge0 CE Protocol)', () => {
  let mockServer;
  let serverInfo;
  let provider;
  const TEST_API_KEY = 'testforge-judge0-secret-key-xyz';
  const TEST_AUTHZ_TOKEN = 'testforge-judge0-auth-user-abc';

  beforeAll(async () => {
    // Start local mock HTTP server on OS-assigned ephemeral port
    mockServer = new MockJudge0Server({
      apiKey: TEST_API_KEY,
      authzToken: TEST_AUTHZ_TOKEN,
      requireAuth: false // Enabled per-test as required
    });
    serverInfo = await mockServer.start();
  });

  afterAll(async () => {
    if (mockServer) {
      await mockServer.stop();
    }
  });

  beforeEach(() => {
    mockServer.reset();
    provider = new RenderSandboxProvider({
      endpoint: serverInfo.url,
      apiKey: TEST_API_KEY,
      authzToken: TEST_AUTHZ_TOKEN,
      connectionTimeoutMs: 3000,
      responseTimeoutMs: 5000
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── 1. Health Check & Provider Readiness ───────────────────────────────────
  test('1. Health check verifies runner availability and captures version details', async () => {
    const health = await provider.checkHealth({ forceRefresh: true });

    expect(health.healthy).toBe(true);
    expect(health.status).toBe('healthy');
    expect(health.endpointConfigured).toBe(true);
    expect(health.providerType).toBe('judge0');
    expect(typeof health.latencyMs).toBe('number');
    expect(health.details).toEqual({ version: '1.13.1' });
    expect(health.error).toBeNull();

    const lastReq = mockServer.getLastRequest();
    expect(lastReq.method).toBe('GET');
    expect(lastReq.pathname).toBe('/about');
    expect(lastReq.headers['x-auth-token']).toBe(TEST_API_KEY);
    expect(lastReq.headers['x-auth-user']).toBe(TEST_AUTHZ_TOKEN);
  });

  // ── 2. Language ID Mapping Verification ────────────────────────────────────
  test('2. Translates standard language keys to Judge0 language IDs (JS:63, PY:71, JAVA:62, CPP:54)', async () => {
    const testCases = [
      { lang: 'javascript', expectedId: 63 },
      { lang: 'js', expectedId: 63 },
      { lang: 'python', expectedId: 71 },
      { lang: 'py', expectedId: 71 },
      { lang: 'java', expectedId: 62 },
      { lang: 'cpp', expectedId: 54 },
      { lang: 'c++', expectedId: 54 }
    ];

    for (const tc of testCases) {
      mockServer.reset();
      const res = await provider.executeCode({
        language: tc.lang,
        code: `// test code for ${tc.lang}`,
        inputArgs: [1]
      });

      expect(res.status).toBe('success');
      const req = mockServer.getLastRequest();
      expect(req.body.language_id).toBe(tc.expectedId);
      expect(req.body.enable_network).toBe(false); // Kernel-enforced isolated networking
    }
  });

  // ── 3. Python Execution (Accepted) ─────────────────────────────────────────
  test('3. Python payload executes and captures output, memory and runtime', async () => {
    let capturedToken = null;
    const result = await provider.executeCode({
      language: 'python',
      code: 'print(42)',
      inputArgs: [21],
      timeoutMs: 3000,
      memoryLimitMb: 128,
      onTokenCreated: (token) => { capturedToken = token; }
    });

    expect(result.status).toBe('success');
    expect(result.statusId).toBe(3);
    expect(result.output).toBe(42);
    expect(result.error).toBeNull();
    expect(typeof result.runtimeMs).toBe('number');
    expect(result.memoryKb).toBeGreaterThan(0);
    expect(capturedToken).toMatch(/^mock-sub-/);

    const req = mockServer.getLastRequest();
    expect(req.body.language_id).toBe(71);
    expect(req.body.memory_limit).toBe(128 * 1024);
  });

  // ── 4. C++ Compilation & Execution (Accepted) ──────────────────────────────
  test('4. C++ payload executes successfully adhering to Judge0 limits contract', async () => {
    const result = await provider.executeCode({
      language: 'cpp',
      code: '#include <iostream>\nint main() { std::cout << 42 << std::endl; return 0; }',
      inputArgs: [21],
      timeoutMs: 2500
    });

    expect(result.status).toBe('success');
    expect(result.statusId).toBe(3);
    expect(result.output).toBe(42);
    expect(result.error).toBeNull();

    const req = mockServer.getLastRequest();
    expect(req.body.language_id).toBe(54);
    expect(req.body.cpu_time_limit).toBe(3); // ceil(2500/1000)
    expect(req.body.wall_time_limit).toBe(5); // ceil((2500+2000)/1000)
  });

  // ── 5. Java Compilation & Execution (API Contract Verification) ────────────
  test('5. Java payload executes and validates Judge0 API contract (Mock verification only)', async () => {
    const javaCode = `
      import java.util.Scanner;
      public class Main {
        public static void main(String[] args) {
          Scanner sc = new Scanner(System.in);
          if (sc.hasNextInt()) {
            System.out.println(sc.nextInt() * 2);
          }
        }
      }
    `;

    const result = await provider.executeCode({
      language: 'java',
      code: javaCode,
      inputArgs: [21]
    });

    expect(result.status).toBe('success');
    expect(result.statusId).toBe(3);
    expect(result.output).toBe(42);

    const req = mockServer.getLastRequest();
    expect(req.body.language_id).toBe(62); // OpenJDK 17
    expect(req.body.source_code).toContain('public class Main');
  });

  // ── 6. JavaScript Execution (Accepted) ────────────────────────────────────
  test('6. JavaScript payload executes successfully', async () => {
    const result = await provider.executeCode({
      language: 'javascript',
      code: 'console.log(42);',
      inputArgs: [21]
    });

    expect(result.status).toBe('success');
    expect(result.statusId).toBe(3);
    expect(result.output).toBe(42);
  });

  // ── 7. Wrong Answer Handling ───────────────────────────────────────────────
  test('7. Detects and reports Wrong Answer when output does not match expected output', async () => {
    const testCase = {
      _id: new mongoose.Types.ObjectId(),
      category: 'sample',
      visibility: 'public',
      input: 'nums = [2, 7, 11, 15], target = 9',
      expectedOutput: '[0, 1]'
    };

    const result = await validateSingleTestCase({
      code: '// FORCE_WRONG_ANSWER\ndef solution(): pass',
      testCase,
      questionContext: { title: 'Two Sum', language: 'python' },
      provider
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('failed');
    expect(String(result.actualOutput)).toBe('999999');
    expect(result.expectedOutput).toBe('[0, 1]');
  });

  // ── 8. Compilation Error Handling ──────────────────────────────────────────
  test('8. Handles Status 6 Compilation Error and captures compiler output', async () => {
    const testCase = {
      _id: new mongoose.Types.ObjectId(),
      category: 'sample',
      visibility: 'public',
      input: '1',
      expectedOutput: '2'
    };

    const result = await validateSingleTestCase({
      code: '// COMPILE_ERROR\nint x = missing_semicolon',
      testCase,
      questionContext: { title: 'Add Two', language: 'cpp' },
      provider
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('compilation_error');
    expect(result.error).toContain("error: expected ';'");
  });

  // ── 9. Runtime Error Handling ──────────────────────────────────────────────
  test('9. Handles Status 11 Runtime Error (NZEC) and captures stderr', async () => {
    const testCase = {
      _id: new mongoose.Types.ObjectId(),
      category: 'sample',
      visibility: 'public',
      input: '0',
      expectedOutput: '1'
    };

    const result = await validateSingleTestCase({
      code: '// RUNTIME_ERROR\nprint(1 / 0)',
      testCase,
      questionContext: { title: 'Division', language: 'python' },
      provider
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('runtime_error');
    expect(result.error).toContain('ZeroDivisionError: division by zero');
  });

  // ── 10. Time Limit Exceeded (TLE) Handling ─────────────────────────────────
  test('10. Handles Status 5 Time Limit Exceeded and reports timeout status', async () => {
    const testCase = {
      _id: new mongoose.Types.ObjectId(),
      category: 'sample',
      visibility: 'public',
      input: '1',
      expectedOutput: '1'
    };

    const result = await validateSingleTestCase({
      code: '// TIMEOUT\nwhile True: pass',
      testCase,
      questionContext: { title: 'Infinite Loop', language: 'python' },
      timeoutMs: 2000,
      provider
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('timeout');
    expect(result.error).toContain('Time limit exceeded (2000ms)');
  });

  // ── 11. Memory Limit Exceeded (MLE) Handling ───────────────────────────────
  test('11. Handles Memory Limit Exceeded and reports memory_limit_exceeded status', async () => {
    const testCase = {
      _id: new mongoose.Types.ObjectId(),
      category: 'sample',
      visibility: 'public',
      input: '1',
      expectedOutput: '1'
    };

    const result = await validateSingleTestCase({
      code: '// MEMORY_ERROR\nbyte[] b = new byte[Integer.MAX_VALUE];',
      testCase,
      questionContext: { title: 'Big Alloc', language: 'java' },
      provider
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('memory_limit_exceeded');
    expect(result.error).toContain('OutOfMemoryError');
  });

  // ── 12. Internal Error & Server Failure Handling (Fail-Closed) ─────────────
  test('12. Fails closed on Status 13 Internal Error and HTTP 500 without crashing', async () => {
    // 12a. Status 13 response
    const status13Result = await provider.executeCode({
      language: 'python',
      code: '// INTERNAL_ERROR\nprint(1)',
      inputArgs: [1]
    });
    expect(status13Result.status).toBe('internal_error');
    expect(status13Result.error).toContain('isolate daemon cannot create sandbox box');

    // 12b. HTTP 500 daemon crash
    mockServer.simulateServerError = true;
    const serverErrResult = await provider.executeCode({
      language: 'python',
      code: 'print(1)',
      inputArgs: [1]
    });
    expect(serverErrResult.status).toBe('internal_error');
    expect(serverErrResult.error).toContain('HTTP 500');
  });

  // ── 13. Provider Timeout and Submission Deletion/Cancellation ──────────────
  test('13. Enforces response timeout and supports submission deletion/cancellation', async () => {
    mockServer.simulatedDelayMs = 250;
    const timeoutResult = await provider.executeCode({
      language: 'python',
      code: 'print(42)',
      inputArgs: [1],
      signal: AbortSignal.timeout(50)
    });

    expect(['timeout', 'cancelled']).toContain(timeoutResult.status);
    expect(timeoutResult.error).toMatch(/(timed out|cancelled)/i);

    // Test cancellation call on completed submission (allowed)
    mockServer.simulatedDelayMs = 0;
    mockServer.submissions.set('mock-sub-cancel-1', { token: 'mock-sub-cancel-1', status: { id: 3 } });
    const cancelRes = await provider.cancelSubmission('mock-sub-cancel-1');
    expect(cancelRes.success).toBe(true);
    expect(cancelRes.cancellationStatus).toBe('DELETED_FROM_QUEUE_WALL_TIME_UNCONFIRMED');

    // Test rejection of deletion for in-queue submission (HTTP 400 rejected by Judge0 CE)
    mockServer.submissions.set('mock-sub-queued-1', { token: 'mock-sub-queued-1', status: { id: 1 } });
    const cancelQueuedRes = await provider.cancelSubmission('mock-sub-queued-1');
    expect(cancelQueuedRes.success).toBe(false);
    expect(cancelQueuedRes.cancellationStatus).toBe('REJECTED_OR_UNSUPPORTED');
    expect(cancelQueuedRes.statusCode).toBe(400);
  });

  // ── 14. Token and Secret Redaction (Zero-Leak) ─────────────────────────────
  test('14. Redacts API tokens and authorization secrets from errors and logs', () => {
    const secretKey = 'super-secret-api-key-9999';
    const secretUser = 'super-secret-auth-user-8888';
    const customProvider = new RenderSandboxProvider({
      endpoint: serverInfo.url,
      apiKey: secretKey,
      authzToken: secretUser
    });

    const errorMsg = `Connection failed: ${secretKey} was rejected for user ${secretUser}`;
    const sanitized = customProvider._sanitize(errorMsg);

    expect(sanitized).not.toContain(secretKey);
    expect(sanitized).not.toContain(secretUser);
    expect(sanitized).toContain('[REDACTED_API_KEY]');
    expect(sanitized).toContain('[REDACTED_AUTH_TOKEN]');
  });

  // ── 15. Hidden Test-Case Sanitization (Zero-Leak Policy) ───────────────────
  test('15. Sanitizes hidden test cases so student-facing results mask inputs and expected outputs', async () => {
    const subId = new mongoose.Types.ObjectId();
    const qId = new mongoose.Types.ObjectId();
    const attemptId = new mongoose.Types.ObjectId();

    const mockSub = {
      _id: subId,
      attemptId,
      questionId: qId,
      code: 'def solution(x): return x * 2',
      language: 'python',
      runType: 'SUBMISSION',
      status: 'QUEUED',
      save: jest.fn().mockResolvedValue(true)
    };

    const mockQuestion = {
      _id: qId,
      title: 'Double Number',
      language: 'python'
    };

    const testCases = [
      {
        _id: new mongoose.Types.ObjectId(),
        questionId: qId,
        category: 'sample',
        visibility: 'public',
        input: '5',
        expectedOutput: '10'
      },
      {
        _id: new mongoose.Types.ObjectId(),
        questionId: qId,
        category: 'edge',
        visibility: 'hidden',
        input: '10',
        expectedOutput: '20'
      }
    ];

    jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
    let updatedPayload = null;
    jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation((query, update) => {
      updatedPayload = update.$set;
      return Promise.resolve({ ...mockSub, ...update.$set });
    });
    jest.spyOn(Question, 'findById').mockReturnValue({ lean: () => Promise.resolve(mockQuestion) });
    jest.spyOn(TestCase, 'find').mockReturnValue({ lean: () => Promise.resolve(testCases) });
    jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue({});
    jest.spyOn(StudentAnswer, 'find').mockReturnValue({ lean: () => Promise.resolve([]) });
    jest.spyOn(Submission, 'find').mockReturnValue({
      select: () => ({ lean: () => Promise.resolve([]) })
    });
    jest.spyOn(ExamAttempt, 'findById').mockResolvedValue({ _id: attemptId, status: 'SUBMITTED', save: jest.fn().mockResolvedValue(true) });

    // Ensure providerRegistry serves our mock-connected provider
    providerRegistry.register('render_sandbox', provider);
    providerRegistry.setActiveProvider('render_sandbox');

    await processExecutionJob({
      id: `exec_${subId}`,
      data: {
        submissionId: subId.toString(),
        attemptId: attemptId.toString(),
        questionId: qId.toString(),
        runType: 'SUBMISSION'
      }
    });

    expect(updatedPayload).not.toBeNull();
    expect(updatedPayload.status).toBe('COMPLETED');
    expect(updatedPayload.verdict).toBe('ACCEPTED');
    expect(updatedPayload.testResults).toHaveLength(2);

    const publicResult = updatedPayload.testResults[0];
    const hiddenResult = updatedPayload.testResults[1];

    expect(publicResult.visibility).toBe('public');
    expect(publicResult.input).toBe('5');
    expect(publicResult.expectedOutput).toBe('10');

    // ZERO-LEAK VERIFICATION: Hidden test case input and output MUST be strictly null
    expect(hiddenResult.visibility).toBe('hidden');
    expect(hiddenResult.input).toBeNull();
    expect(hiddenResult.expectedOutput).toBeNull();
    expect(hiddenResult.actualOutput).toBeNull();
    expect(hiddenResult.error).toBeNull();
    expect(hiddenResult.passed).toBe(true);
  });

  // ── 16. Duplicate Submission Protection ────────────────────────────────────
  test('16. Prevents duplicate concurrent execution of sample runs for the same attempt and question', async () => {
    const attemptId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();

    const mockAttempt = {
      _id: attemptId,
      status: 'IN_PROGRESS',
      expiresAt: new Date(Date.now() + 3600000),
      save: jest.fn().mockResolvedValue(true)
    };

    const mockQuestion = {
      _id: questionId,
      title: 'Two Sum',
      language: 'python'
    };

    const existingActiveSubmission = {
      _id: new mongoose.Types.ObjectId(),
      attemptId,
      questionId,
      runType: 'SAMPLE',
      status: 'RUNNING',
      jobId: 'exec_existing_123'
    };

    jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
    jest.spyOn(Question, 'findById').mockReturnValue({ lean: () => Promise.resolve(mockQuestion) });
    jest.spyOn(Submission, 'findOne').mockReturnValue({
      sort: jest.fn().mockResolvedValue(existingActiveSubmission)
    });

    const req = {
      params: { attemptId: attemptId.toString() },
      body: { questionId: questionId.toString(), code: 'print(1)', language: 'python' }
    };

    let responseStatus = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseStatus = code;
        return res;
      },
      json: (data) => {
        responseBody = data;
        return res;
      }
    };

    await runSampleTests(req, res, () => {});

    // Must return HTTP 200 with the already existing active submission without spawning new job
    expect(responseStatus).toBe(200);
    expect(responseBody.success).toBe(true);
    expect(responseBody.data.isDuplicate).toBe(true);
    expect(responseBody.data.submissionId).toBe(existingActiveSubmission._id);
    expect(responseBody.data.status).toBe('RUNNING');
  });

  // ── 17. MongoDB Persistence of Remote Token and Execution State ───────────
  test('17. Persists Judge0 remote execution token and fencing owner in MongoDB', async () => {
    const subId = new mongoose.Types.ObjectId();
    const qId = new mongoose.Types.ObjectId();
    const attemptId = new mongoose.Types.ObjectId();

    const mockSub = {
      _id: subId,
      attemptId,
      questionId: qId,
      code: 'print(42)',
      language: 'python',
      runType: 'SAMPLE',
      status: 'QUEUED',
      save: jest.fn().mockResolvedValue(true)
    };

    const mockQuestion = { _id: qId, title: 'Print 42', language: 'python' };
    const testCases = [{
      _id: new mongoose.Types.ObjectId(),
      questionId: qId,
      category: 'sample',
      visibility: 'public',
      input: '42',
      expectedOutput: '42'
    }];

    jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
    const tokenUpdates = [];
    jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation((query, update) => {
      if (update.$set && update.$set['remoteExecution.token']) {
        tokenUpdates.push(update.$set);
      }
      return Promise.resolve({ ...mockSub, ...(update.$set || {}) });
    });
    jest.spyOn(Question, 'findById').mockReturnValue({ lean: () => Promise.resolve(mockQuestion) });
    jest.spyOn(TestCase, 'find').mockReturnValue({ lean: () => Promise.resolve(testCases) });

    providerRegistry.register('render_sandbox', provider);
    providerRegistry.setActiveProvider('render_sandbox');

    await processExecutionJob({
      id: `exec_${subId}`,
      data: {
        submissionId: subId.toString(),
        attemptId: attemptId.toString(),
        questionId: qId.toString(),
        runType: 'SAMPLE'
      }
    });

    expect(tokenUpdates.length).toBeGreaterThanOrEqual(1);
    expect(tokenUpdates[0]['remoteExecution.token']).toMatch(/^mock-sub-/);
    expect(tokenUpdates[0]['remoteExecution.provider']).toBe('render_sandbox');
  });

  // ── 18. Attempt Grading Calculation and Score Awarding ─────────────────────
  test('18. Accurately recalculates attempt score and updates StudentAnswer based on execution results', async () => {
    const attemptId = new mongoose.Types.ObjectId();
    const qId1 = new mongoose.Types.ObjectId();
    const qId2 = new mongoose.Types.ObjectId();

    const mockAttempt = {
      _id: attemptId,
      status: 'SUBMITTED',
      totalScore: 0,
      maxScore: 20,
      save: jest.fn().mockResolvedValue(true)
    };

    const mockAnswers = [
      {
        _id: new mongoose.Types.ObjectId(),
        attemptId,
        questionId: qId1,
        score: 10,
        maxScore: 10,
        status: 'SUBMITTED',
        executionUnavailable: false
      },
      {
        _id: new mongoose.Types.ObjectId(),
        attemptId,
        questionId: qId2,
        score: 7,
        maxScore: 10,
        status: 'SUBMITTED',
        executionUnavailable: false
      }
    ];

    jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
    jest.spyOn(StudentAnswer, 'find').mockReturnValue({ lean: () => Promise.resolve(mockAnswers) });
    jest.spyOn(Submission, 'find').mockReturnValue({
      select: () => ({ lean: () => Promise.resolve([]) })
    });

    const result = await recalculateAttemptGrading(attemptId);

    expect(result).not.toBeNull();
    expect(result.totalScore).toBe(17);
    expect(result.maxScore).toBe(20);
    expect(result.finalizedMaxScore).toBe(20);
    expect(result.pendingQuestionsCount).toBe(0);
    expect(result.gradingStatus).toBe('FINALIZED');
    expect(result.isProvisional).toBe(false);
  });
});
