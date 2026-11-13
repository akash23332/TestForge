import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { OnlineCompilerProvider } from '../src/services/execution/OnlineCompilerProvider.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import { processExecutionJob } from '../src/services/queue/executionProcessor.js';
import { getSubmissionStatus } from '../src/controllers/attempt.controller.js';
import { Submission } from '../src/models/Submission.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';

describe('Phase 2B: End-to-End Run Code Integration Tests', () => {
  let originalFetch;
  let originalActiveProvider;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalActiveProvider = providerRegistry.activeProviderName;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    providerRegistry.setActiveProvider(originalActiveProvider);
    jest.restoreAllMocks();
  });

  // ── 1. Provider Registry Configuration & Activation ──────────────────────
  test('1. Provider registry activates OnlineCompilerProvider when configured', () => {
    providerRegistry.setActiveProvider('onlinecompiler');
    const active = providerRegistry.getProvider();
    expect(active).toBeInstanceOf(OnlineCompilerProvider);
    expect(active.name).toBe('onlinecompiler');
    expect(active.compilerMap.python).toBe('python-3.14');
    expect(active.compilerMap.cpp).toBe('g++-15');
    expect(active.compilerMap.java).toBe('openjdk-25');
    expect(active.compilerMap.javascript).toBe('nodejs-24');
  });

  // ── 2. Run Code Python Execution (End-to-End via ExecutionProcessor) ─────
  test('2. Run Code with Python sends python-3.14 to OnlineCompiler and saves successful verdict', async () => {
    const subId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();
    const attemptId = new mongoose.Types.ObjectId();

    let capturedUrl = '';
    let capturedOpts = {};

    global.fetch = jest.fn().mockImplementation(async (url, opts) => {
      capturedUrl = url.toString();
      capturedOpts = opts;
      return new Response(
        JSON.stringify({
          output: '7\n',
          error: null,
          status: 'success',
          exit_code: 0,
          time: '0.035'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const testOnlineCompiler = new OnlineCompilerProvider({
      endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
      apiKey: 'test-forge-api-key-123'
    });
    providerRegistry.register('onlinecompiler', testOnlineCompiler);
    providerRegistry.setActiveProvider('onlinecompiler');

    const mockSub = {
      _id: subId,
      questionId,
      attemptId,
      status: 'QUEUED',
      code: 'print(int(input()) + int(input()))',
      language: 'python',
      maxMarks: 10,
      runType: 'SAMPLE',
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
    let updatedPayload = null;
    jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation((query, update) => {
      if (update.$set && update.$set.status === 'RUNNING') {
        return Promise.resolve({
          ...mockSub,
          status: 'RUNNING',
          executionOwner: update.$set.executionOwner,
          executionVersion: 1
        });
      }
      if (update.$set && (update.$set.status === 'COMPLETED' || update.$set.status === 'COMPILE_ERROR')) {
        updatedPayload = update.$set;
        return Promise.resolve({
          ...mockSub,
          ...update.$set
        });
      }
      return Promise.resolve(mockSub);
    });

    jest.spyOn(Question, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: questionId, title: 'Add Two', language: 'python' })
    });

    const sampleTestCaseId = new mongoose.Types.ObjectId();
    const findTestCaseSpy = jest.spyOn(TestCase, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: sampleTestCaseId,
          questionId,
          input: '3\n4',
          expectedOutput: '7',
          visibility: 'public',
          category: 'sample'
        }
      ])
    });

    const job = {
      id: `exec_${subId}`,
      data: {
        submissionId: subId.toString(),
        attemptId: attemptId.toString(),
        questionId: questionId.toString(),
        runType: 'SAMPLE',
        language: 'python'
      }
    };

    await processExecutionJob(job);

    // Verify filter strictly fetched public/sample test cases
    expect(findTestCaseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        questionId: questionId.toString(),
        $or: [{ visibility: 'public' }, { category: 'sample' }]
      })
    );

    // Verify OnlineCompiler API contract
    expect(capturedUrl).toBe('https://api.onlinecompiler.io/api/run-code-sync/');
    expect(capturedOpts.headers['Authorization']).toBe('test-forge-api-key-123');
    expect(capturedOpts.headers['Authorization']).not.toMatch(/^Bearer /);
    const body = JSON.parse(capturedOpts.body);
    expect(body.compiler).toBe('python-3.14');
    expect(body.code).toBe('print(int(input()) + int(input()))');

    // Verify persisted submission result
    expect(updatedPayload).toBeDefined();
    expect(updatedPayload.status).toBe('COMPLETED');
    expect(updatedPayload.verdict).toBe('ACCEPTED');
    expect(updatedPayload.totalTests).toBe(1);
    expect(updatedPayload.passedTests).toBe(1);
    expect(updatedPayload.testResults[0].passed).toBe(true);
    expect(updatedPayload.testResults[0].actualOutput).toBe('7');
    expect(updatedPayload.testResults[0].error).toBeNull();
  });

  // ── 3. Run Code C++ Execution ─────────────────────────────────────────────
  test('3. Run Code with C++ maps to g++-15 and handles output comparison correctly', async () => {
    const subId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();
    const attemptId = new mongoose.Types.ObjectId();

    let capturedCompiler = '';
    global.fetch = jest.fn().mockImplementation(async (url, opts) => {
      const b = JSON.parse(opts.body);
      capturedCompiler = b.compiler;
      return new Response(
        JSON.stringify({
          output: 'Hello TestForge C++\n',
          error: null,
          status: 'success',
          exit_code: 0,
          time: '0.045'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const testOnlineCompiler = new OnlineCompilerProvider({
      endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
      apiKey: 'test-key'
    });
    providerRegistry.register('onlinecompiler', testOnlineCompiler);
    providerRegistry.setActiveProvider('onlinecompiler');

    const mockSub = {
      _id: subId,
      questionId,
      attemptId,
      status: 'QUEUED',
      code: '#include <iostream>\nint main() { std::cout << "Hello TestForge C++" << std::endl; return 0; }',
      language: 'cpp',
      maxMarks: 10,
      runType: 'SAMPLE',
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
    let updatedPayload = null;
    jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation((query, update) => {
      if (update.$set && update.$set.status === 'RUNNING') {
        return Promise.resolve({ ...mockSub, status: 'RUNNING', executionOwner: update.$set.executionOwner });
      }
      if (update.$set && update.$set.status === 'COMPLETED') {
        updatedPayload = update.$set;
        return Promise.resolve({ ...mockSub, ...update.$set });
      }
      return Promise.resolve(mockSub);
    });

    jest.spyOn(Question, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: questionId, title: 'C++ Hello', language: 'cpp' })
    });

    jest.spyOn(TestCase, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '1',
          expectedOutput: 'Hello TestForge C++',
          visibility: 'public',
          category: 'sample'
        }
      ])
    });

    await processExecutionJob({
      id: `exec_${subId}`,
      data: { submissionId: subId.toString(), attemptId: attemptId.toString(), questionId: questionId.toString(), runType: 'SAMPLE', language: 'cpp' }
    });

    expect(capturedCompiler).toBe('g++-15');
    expect(updatedPayload.status).toBe('COMPLETED');
    expect(updatedPayload.verdict).toBe('ACCEPTED');
    expect(updatedPayload.passedTests).toBe(1);
    expect(updatedPayload.testResults[0].actualOutput).toBe('Hello TestForge C++');
  });

  // ── 4. Run Code Java Execution ────────────────────────────────────────────
  test('4. Run Code with Java maps to openjdk-25 and parses stdout', async () => {
    const subId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();
    const attemptId = new mongoose.Types.ObjectId();

    let capturedCompiler = '';
    global.fetch = jest.fn().mockImplementation(async (url, opts) => {
      const b = JSON.parse(opts.body);
      capturedCompiler = b.compiler;
      return new Response(
        JSON.stringify({
          output: 'TestForge Java Output\n',
          error: null,
          status: 'success',
          exit_code: 0,
          time: '0.065'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const testOnlineCompiler = new OnlineCompilerProvider({
      endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
      apiKey: 'test-key'
    });
    providerRegistry.register('onlinecompiler', testOnlineCompiler);
    providerRegistry.setActiveProvider('onlinecompiler');

    const mockSub = {
      _id: subId,
      questionId,
      attemptId,
      status: 'QUEUED',
      code: 'public class Main { public static void main(String[] args) { System.out.println("TestForge Java Output"); } }',
      language: 'java',
      maxMarks: 10,
      runType: 'SAMPLE',
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
    let updatedPayload = null;
    jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation((query, update) => {
      if (update.$set && update.$set.status === 'RUNNING') {
        return Promise.resolve({ ...mockSub, status: 'RUNNING', executionOwner: update.$set.executionOwner });
      }
      if (update.$set && update.$set.status === 'COMPLETED') {
        updatedPayload = update.$set;
        return Promise.resolve({ ...mockSub, ...update.$set });
      }
      return Promise.resolve(mockSub);
    });

    jest.spyOn(Question, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: questionId, title: 'Java Test', language: 'java' })
    });

    jest.spyOn(TestCase, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '1',
          expectedOutput: 'TestForge Java Output',
          visibility: 'public',
          category: 'sample'
        }
      ])
    });

    await processExecutionJob({
      id: `exec_${subId}`,
      data: { submissionId: subId.toString(), attemptId: attemptId.toString(), questionId: questionId.toString(), runType: 'SAMPLE', language: 'java' }
    });

    expect(capturedCompiler).toBe('openjdk-25');
    expect(updatedPayload.status).toBe('COMPLETED');
    expect(updatedPayload.verdict).toBe('ACCEPTED');
    expect(updatedPayload.testResults[0].actualOutput).toBe('TestForge Java Output');
  });

  // ── 5. Run Code JavaScript Execution ──────────────────────────────────────
  test('5. Run Code with JavaScript maps to nodejs-24', async () => {
    const subId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();
    const attemptId = new mongoose.Types.ObjectId();

    let capturedCompiler = '';
    global.fetch = jest.fn().mockImplementation(async (url, opts) => {
      const b = JSON.parse(opts.body);
      capturedCompiler = b.compiler;
      return new Response(
        JSON.stringify({
          output: '42\n',
          error: null,
          status: 'success',
          exit_code: 0,
          time: '0.025'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const testOnlineCompiler = new OnlineCompilerProvider({
      endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
      apiKey: 'test-key'
    });
    providerRegistry.register('onlinecompiler', testOnlineCompiler);
    providerRegistry.setActiveProvider('onlinecompiler');

    const mockSub = {
      _id: subId,
      questionId,
      attemptId,
      status: 'QUEUED',
      code: 'console.log(42);',
      language: 'javascript',
      maxMarks: 10,
      runType: 'SAMPLE',
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
    let updatedPayload = null;
    jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation((query, update) => {
      if (update.$set && update.$set.status === 'RUNNING') {
        return Promise.resolve({ ...mockSub, status: 'RUNNING', executionOwner: update.$set.executionOwner });
      }
      if (update.$set && update.$set.status === 'COMPLETED') {
        updatedPayload = update.$set;
        return Promise.resolve({ ...mockSub, ...update.$set });
      }
      return Promise.resolve(mockSub);
    });

    jest.spyOn(Question, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: questionId, title: 'JS 42', language: 'javascript' })
    });

    jest.spyOn(TestCase, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '1',
          expectedOutput: '42',
          visibility: 'public',
          category: 'sample'
        }
      ])
    });

    await processExecutionJob({
      id: `exec_${subId}`,
      data: { submissionId: subId.toString(), attemptId: attemptId.toString(), questionId: questionId.toString(), runType: 'SAMPLE', language: 'javascript' }
    });

    expect(capturedCompiler).toBe('nodejs-24');
    expect(updatedPayload.status).toBe('COMPLETED');
    expect(updatedPayload.verdict).toBe('ACCEPTED');
  });

  // ── 6. Compilation Error Handling ─────────────────────────────────────────
  test('6. Compilation error transitions submission to COMPILE_ERROR and records error diagnostic', async () => {
    const subId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();
    const attemptId = new mongoose.Types.ObjectId();

    global.fetch = jest.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          output: '',
          error: 'main.cpp: In function \'int main()\':\nmain.cpp:3:5: error: expected \';\' before \'return\'',
          status: 'compilation_error',
          exit_code: 1,
          time: '0.015'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const testOnlineCompiler = new OnlineCompilerProvider({
      endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
      apiKey: 'test-key'
    });
    providerRegistry.register('onlinecompiler', testOnlineCompiler);
    providerRegistry.setActiveProvider('onlinecompiler');

    const mockSub = {
      _id: subId,
      questionId,
      attemptId,
      status: 'QUEUED',
      code: 'int main() { std::cout << 42 return 0; }',
      language: 'cpp',
      maxMarks: 10,
      runType: 'SAMPLE',
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
    let updatedPayload = null;
    jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation((query, update) => {
      if (update.$set && update.$set.status === 'RUNNING') {
        return Promise.resolve({ ...mockSub, status: 'RUNNING', executionOwner: update.$set.executionOwner });
      }
      if (update.$set && update.$set.status === 'COMPILE_ERROR') {
        updatedPayload = update.$set;
        return Promise.resolve({ ...mockSub, ...update.$set });
      }
      return Promise.resolve(mockSub);
    });

    jest.spyOn(Question, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: questionId, title: 'Broken C++', language: 'cpp' })
    });

    jest.spyOn(TestCase, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '1',
          expectedOutput: '42',
          visibility: 'public',
          category: 'sample'
        }
      ])
    });

    await processExecutionJob({
      id: `exec_${subId}`,
      data: { submissionId: subId.toString(), attemptId: attemptId.toString(), questionId: questionId.toString(), runType: 'SAMPLE', language: 'cpp' }
    });

    expect(updatedPayload).toBeDefined();
    expect(updatedPayload.status).toBe('COMPILE_ERROR');
    expect(updatedPayload.verdict).toBe('COMPILE_ERROR');
    expect(updatedPayload.passedTests).toBe(0);
    expect(updatedPayload.errorMessage).toContain("error: expected ';' before 'return'");
    expect(updatedPayload.testResults[0].passed).toBe(false);
    expect(updatedPayload.testResults[0].status).toBe('compilation_error');
    expect(updatedPayload.testResults[0].error).toContain("error: expected ';'");
  });

  // ── 7. Runtime Error Handling ─────────────────────────────────────────────
  test('7. Runtime error transitions submission to RUNTIME_ERROR and records exception', async () => {
    const subId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();
    const attemptId = new mongoose.Types.ObjectId();

    global.fetch = jest.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          output: '',
          error: 'Traceback (most recent call last):\n  File "solution.py", line 1, in <module>\nZeroDivisionError: division by zero',
          status: 'runtime_error',
          exit_code: 1,
          time: '0.020'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const testOnlineCompiler = new OnlineCompilerProvider({
      endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
      apiKey: 'test-key'
    });
    providerRegistry.register('onlinecompiler', testOnlineCompiler);
    providerRegistry.setActiveProvider('onlinecompiler');

    const mockSub = {
      _id: subId,
      questionId,
      attemptId,
      status: 'QUEUED',
      code: 'print(1 / 0)',
      language: 'python',
      maxMarks: 10,
      runType: 'SAMPLE',
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
    let updatedPayload = null;
    jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation((query, update) => {
      if (update.$set && update.$set.status === 'RUNNING') {
        return Promise.resolve({ ...mockSub, status: 'RUNNING', executionOwner: update.$set.executionOwner });
      }
      if (update.$set && update.$set.status === 'RUNTIME_ERROR') {
        updatedPayload = update.$set;
        return Promise.resolve({ ...mockSub, ...update.$set });
      }
      return Promise.resolve(mockSub);
    });

    jest.spyOn(Question, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: questionId, title: 'DivZero', language: 'python' })
    });

    jest.spyOn(TestCase, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '1',
          expectedOutput: '1',
          visibility: 'public',
          category: 'sample'
        }
      ])
    });

    await processExecutionJob({
      id: `exec_${subId}`,
      data: { submissionId: subId.toString(), attemptId: attemptId.toString(), questionId: questionId.toString(), runType: 'SAMPLE', language: 'python' }
    });

    expect(updatedPayload).toBeDefined();
    expect(updatedPayload.status).toBe('RUNTIME_ERROR');
    expect(updatedPayload.verdict).toBe('RUNTIME_ERROR');
    expect(updatedPayload.passedTests).toBe(0);
    expect(updatedPayload.errorMessage).toContain('ZeroDivisionError: division by zero');
    expect(updatedPayload.testResults[0].passed).toBe(false);
    expect(updatedPayload.testResults[0].status).toBe('runtime_error');
  });

  // ── 8. Provider 500 / Network Error Transitions to EXECUTION_UNAVAILABLE ──
  test('8. Upstream HTTP 500 transitions submission to EXECUTION_UNAVAILABLE and preserves retry', async () => {
    const subId = new mongoose.Types.ObjectId();
    const questionId = new mongoose.Types.ObjectId();
    const attemptId = new mongoose.Types.ObjectId();

    global.fetch = jest.fn().mockImplementation(async () => {
      return new Response('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    });

    const testOnlineCompiler = new OnlineCompilerProvider({
      endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
      apiKey: 'test-key'
    });
    providerRegistry.register('onlinecompiler', testOnlineCompiler);
    providerRegistry.setActiveProvider('onlinecompiler');

    const mockSub = {
      _id: subId,
      questionId,
      attemptId,
      status: 'QUEUED',
      code: 'print(42)',
      language: 'python',
      maxMarks: 10,
      runType: 'SAMPLE',
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
    let updatedPayload = null;
    jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation((query, update) => {
      if (update.$set && update.$set.status === 'RUNNING') {
        return Promise.resolve({ ...mockSub, status: 'RUNNING', executionOwner: update.$set.executionOwner });
      }
      if (update.$set && update.$set.status === 'EXECUTION_UNAVAILABLE') {
        updatedPayload = update.$set;
        return Promise.resolve({ ...mockSub, ...update.$set });
      }
      return Promise.resolve(mockSub);
    });

    jest.spyOn(Question, 'findById').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: questionId, title: 'Sample Q', language: 'python' })
    });

    jest.spyOn(TestCase, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '1',
          expectedOutput: '42',
          visibility: 'public',
          category: 'sample'
        }
      ])
    });

    await expect(
      processExecutionJob({
        id: `exec_${subId}`,
        data: { submissionId: subId.toString(), attemptId: attemptId.toString(), questionId: questionId.toString(), runType: 'SAMPLE', language: 'python' }
      })
    ).rejects.toThrow(/Infrastructure failure/);

    expect(updatedPayload).toBeDefined();
    expect(updatedPayload.status).toBe('EXECUTION_UNAVAILABLE');
    expect(updatedPayload.verdict).toBe('EXECUTION_UNAVAILABLE');
    expect(updatedPayload.scoreAwarded).toBeNull();
    expect(updatedPayload.errorMessage).toContain('temporarily unavailable');
  });

  // ── 9. Polling Endpoint Contract: Returns Frontend & Backend Summary Fields ──
  test('9. getSubmissionStatus returns allPassed, passedCount, totalCount, and testResults for results UI', async () => {
    const attemptId = new mongoose.Types.ObjectId();
    const submissionId = new mongoose.Types.ObjectId();

    const mockCompletedSubmission = {
      _id: submissionId,
      attemptId,
      status: 'COMPLETED',
      verdict: 'ACCEPTED',
      runType: 'SAMPLE',
      totalTests: 2,
      passedTests: 2,
      scoreAwarded: 10,
      maxMarks: 10,
      testResults: [
        {
          testIndex: 1,
          category: 'sample',
          visibility: 'public',
          passed: true,
          status: 'passed',
          input: '2\n3',
          expectedOutput: '5',
          actualOutput: '5',
          runtimeMs: 25,
          error: null,
          isHidden: false
        },
        {
          testIndex: 2,
          category: 'sample',
          visibility: 'public',
          passed: true,
          status: 'passed',
          input: '10\n20',
          expectedOutput: '30',
          actualOutput: '30',
          runtimeMs: 30,
          error: null,
          isHidden: false
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    jest.spyOn(Submission, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockCompletedSubmission)
    });

    const req = {
      params: {
        attemptId: attemptId.toString(),
        submissionId: submissionId.toString()
      },
      attempt: {
        _id: attemptId
      }
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
    const next = jest.fn();

    await getSubmissionStatus(req, res, next);

    expect(responseStatus).toBe(200);
    expect(responseBody.success).toBe(true);

    const payload = responseBody.data;
    // Backend standard fields
    expect(payload.totalTests).toBe(2);
    expect(payload.passedTests).toBe(2);

    // Frontend backward-compatibility fields expected by StudentExamWorkspace.jsx
    expect(payload.allPassed).toBe(true);
    expect(payload.passedCount).toBe(2);
    expect(payload.totalCount).toBe(2);

    // Test results rendering structure
    expect(payload.testResults).toHaveLength(2);
    expect(payload.testResults[0].passed).toBe(true);
    expect(payload.testResults[0].expectedOutput).toBe('5');
    expect(payload.testResults[0].actualOutput).toBe('5');
    expect(payload.testResults[0].runtimeMs).toBe(25);
  });

  // ── 10. Zero-Leak Security & Sanitization Verification ────────────────────
  test('10. Zero-Leak: API credentials are never leaked in polling response, logs, or results', async () => {
    const attemptId = new mongoose.Types.ObjectId();
    const submissionId = new mongoose.Types.ObjectId();

    const mockHiddenSubmission = {
      _id: submissionId,
      attemptId,
      status: 'COMPLETED',
      verdict: 'PARTIALLY_ACCEPTED',
      runType: 'SUBMISSION',
      totalTests: 2,
      passedTests: 1,
      scoreAwarded: 5,
      maxMarks: 10,
      testResults: [
        {
          testIndex: 1,
          category: 'public_suite',
          visibility: 'public',
          passed: true,
          status: 'passed',
          input: '1',
          expectedOutput: '1',
          actualOutput: '1',
          runtimeMs: 15,
          isHidden: false
        },
        {
          testIndex: 2,
          category: 'hidden_suite',
          visibility: 'hidden',
          passed: false,
          status: 'failed',
          input: 'SECRET_HIDDEN_INPUT_9999',
          expectedOutput: 'SECRET_EXPECTED_OUTPUT_9999',
          actualOutput: 'FAILED_ACTUAL_OUTPUT_9999',
          runtimeMs: 20,
          isHidden: true
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    jest.spyOn(Submission, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockHiddenSubmission)
    });

    const req = {
      params: { attemptId: attemptId.toString(), submissionId: submissionId.toString() },
      attempt: { _id: attemptId }
    };

    let responseBody = null;
    const res = {
      status: () => res,
      json: (data) => { responseBody = data; return res; }
    };

    await getSubmissionStatus(req, res, jest.fn());

    const jsonString = JSON.stringify(responseBody);
    // Hidden inputs/outputs must not leak
    expect(jsonString).not.toContain('SECRET_HIDDEN_INPUT_9999');
    expect(jsonString).not.toContain('SECRET_EXPECTED_OUTPUT_9999');
    expect(jsonString).not.toContain('FAILED_ACTUAL_OUTPUT_9999');

    // No credentials or tokens leaked
    expect(jsonString).not.toContain('ONLINE_COMPILER_API_KEY');
    expect(jsonString).not.toContain('test-forge-api-key-123');

    // Hidden test case result is properly masked
    expect(responseBody.data.testResults[1].visibility).toBe('hidden');
    expect(responseBody.data.testResults[1].isHidden).toBe(true);
    expect(responseBody.data.testResults[1].input).toBeUndefined();
    expect(responseBody.data.testResults[1].expectedOutput).toBeUndefined();
    expect(responseBody.data.testResults[1].actualOutput).toBeUndefined();
  });
});
