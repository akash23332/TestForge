import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { Question } from '../src/models/Question.js';
import { Submission } from '../src/models/Submission.js';
import { TestCase } from '../src/models/TestCase.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import {
  wrapCodeForExecution,
  getStarterCode,
  STANDARDIZED_TEMPLATES,
  SUPPORTED_LANGUAGES
} from '../src/services/codeContract.service.js';
import { sanitizeQuestionAllowlist } from '../src/controllers/question.controller.js';
import { sanitizeQuestionForStudent, runCustomInput } from '../src/controllers/attempt.controller.js';
import { validateReferenceSolution } from '../src/controllers/testCase.controller.js';
import { processExecutionJob } from '../src/services/queue/executionProcessor.js';
import { OnlineCompilerProvider } from '../src/services/execution/OnlineCompilerProvider.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';

// Helper for Mongoose queries that may call .lean() or be awaited directly
const mockMongooseQuery = (data) => {
  const p = Promise.resolve(data);
  p.lean = jest.fn().mockResolvedValue(data);
  return p;
};

describe('Phase 2C: Custom Input and Multi-Language Code Contract Standardization Tests', () => {
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

  // ════════════════════════════════════════════════════════════════════════════
  // 1. QUESTION SCHEMA & CONTRACT METADATA
  // ════════════════════════════════════════════════════════════════════════════
  describe('1. Question Contract Metadata & Schema', () => {
    test('1.1 Question schema supports executionMode defaulting to STDIN', () => {
      const q = new Question({
        title: 'Two Sum Problem',
        statement: 'Read two numbers from stdin and print their sum.',
        constraints: '1 <= a, b <= 1000'
      });
      expect(q.executionMode).toBe('STDIN');
      expect(q.functionName).toBe('solution');
    });

    test('1.2 Question schema accepts explicit FUNCTION mode', () => {
      const q = new Question({
        title: 'Two Sum Function',
        statement: 'Return indices of the two numbers that add up to target.',
        constraints: '1 <= nums.length <= 1000',
        executionMode: 'FUNCTION',
        functionName: 'twoSum'
      });
      expect(q.executionMode).toBe('FUNCTION');
      expect(q.functionName).toBe('twoSum');
    });

    test('1.3 Question schema validates executionMode enum', () => {
      const q = new Question({
        title: 'Invalid Mode',
        statement: 'Invalid',
        constraints: 'None',
        executionMode: 'INVALID_MODE'
      });
      const err = q.validateSync();
      expect(err.errors.executionMode).toBeDefined();
    });

    test('1.4 Submission schema accepts CUSTOM_INPUT runType and customInput string', () => {
      const sub = new Submission({
        studentId: new mongoose.Types.ObjectId(),
        questionId: new mongoose.Types.ObjectId(),
        attemptId: new mongoose.Types.ObjectId(),
        language: 'python',
        code: 'import sys; print(sys.stdin.read())',
        runType: 'CUSTOM_INPUT',
        customInput: '42 100\nHello World'
      });
      expect(sub.runType).toBe('CUSTOM_INPUT');
      expect(sub.customInput).toBe('42 100\nHello World');
      const err = sub.validateSync();
      expect(err).toBeUndefined();
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. CODE CONTRACT SERVICE (HARNESS GENERATION & TEMPLATES)
  // ════════════════════════════════════════════════════════════════════════════
  describe('2. Code Contract Service & Harness Wrapping', () => {
    test('2.1 Provides standardized starter templates for all 4 languages in FUNCTION mode', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const starter = getStarterCode({ executionMode: 'FUNCTION', language: lang });
        expect(typeof starter).toBe('string');
        expect(starter.length).toBeGreaterThan(10);
      }
    });

    test('2.2 Provides standardized starter templates for all 4 languages in STDIN mode', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const starter = getStarterCode({ executionMode: 'STDIN', language: lang });
        expect(typeof starter).toBe('string');
        expect(starter.length).toBeGreaterThan(10);
        if (lang === 'python') expect(starter).toContain('stdin');
        if (lang === 'javascript') expect(starter).toContain('fs.readFileSync');
        if (lang === 'java') expect(starter).toContain('public class Main');
        if (lang === 'cpp') expect(starter).toContain('int main()');
      }
    });

    test('2.3 STDIN mode wrapCodeForExecution returns candidate code untouched', () => {
      const studentCode = 'import sys\nprint("Pure stdin")';
      const wrapped = wrapCodeForExecution({
        code: studentCode,
        language: 'python',
        executionMode: 'STDIN'
      });
      expect(wrapped).toBe(studentCode);
    });

    test('2.4 Python FUNCTION mode wrapCodeForExecution generates JSON serializer harness', () => {
      const candidateCode = 'def solution(a, b):\n    return a + b\n';
      const wrapped = wrapCodeForExecution({
        code: candidateCode,
        language: 'python',
        executionMode: 'FUNCTION',
        functionName: 'solution'
      });
      expect(wrapped).toContain('def solution(a, b):');
      expect(wrapped).toContain('json.dumps');
      expect(wrapped).toContain('solution(');
    });

    test('2.5 JavaScript FUNCTION mode wrapCodeForExecution generates JSON serializer harness', () => {
      const candidateCode = 'function solution(a, b) { return a + b; }';
      const wrapped = wrapCodeForExecution({
        code: candidateCode,
        language: 'javascript',
        executionMode: 'FUNCTION',
        functionName: 'solution'
      });
      expect(wrapped).toContain('function solution(a, b)');
      expect(wrapped).toContain('JSON.stringify');
      expect(wrapped).toContain('solution(');
    });

    test('2.6 Java FUNCTION mode wrapCodeForExecution embeds Solution class inside runnable Main harness', () => {
      const candidateCode = 'public class Solution { public int solution(int a, int b) { return a + b; } }';
      const wrapped = wrapCodeForExecution({
        code: candidateCode,
        language: 'java',
        executionMode: 'FUNCTION',
        functionName: 'solution'
      });
      expect(wrapped).toContain('class Solution');
      expect(wrapped).toContain('public class Main');
      expect(wrapped).not.toContain('public class Solution'); // Public stripped so Main can be primary runnable
      expect(wrapped).toContain('solClass');
    });

    test('2.7 C++ FUNCTION mode wrapCodeForExecution wraps Solution inside int main() harness', () => {
      const candidateCode = 'class Solution { public: int solution(int a, int b) { return a + b; } };';
      const wrapped = wrapCodeForExecution({
        code: candidateCode,
        language: 'cpp',
        executionMode: 'FUNCTION',
        functionName: 'solution'
      });
      expect(wrapped).toContain('class Solution');
      expect(wrapped).toContain('int main(');
      expect(wrapped).toContain('Solution sol;');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. ZERO-LEAK SECURITY VERIFICATION
  // ════════════════════════════════════════════════════════════════════════════
  describe('3. Strict Zero-Leak Security Projections', () => {
    test('3.1 sanitizeQuestionAllowlist preserves contract metadata but strictly strips referenceSolution', () => {
      const rawQuestion = {
        _id: 'q123',
        title: 'Two Sum',
        statement: 'Problem statement',
        executionMode: 'FUNCTION',
        functionName: 'twoSum',
        starterCodes: { python: 'def twoSum(): pass' },
        referenceSolution: 'TOP_SECRET_FACULTY_CODE',
        referenceSolutions: { python: 'TOP_SECRET_PYTHON_CODE' }
      };

      const sanitized = sanitizeQuestionAllowlist(rawQuestion);
      expect(sanitized.executionMode).toBe('FUNCTION');
      expect(sanitized.functionName).toBe('twoSum');
      expect(sanitized.starterCodes).toBeDefined();
      expect(sanitized.referenceSolution).toBeUndefined();
      expect(sanitized.referenceSolutions).toBeUndefined();
    });

    test('3.2 sanitizeQuestionForStudent in attempt controller strips reference solutions', () => {
      const rawQuestion = {
        _id: 'q456',
        title: 'Reverse String',
        statement: 'Reverse string',
        executionMode: 'STDIN',
        functionName: 'solution',
        starterCodes: { python: 'import sys' },
        referenceSolution: 'FORBIDDEN_FACULTY_SOLUTION',
        referenceSolutions: { python: 'FORBIDDEN_FACULTY_SOLUTION' }
      };

      const sanitized = sanitizeQuestionForStudent(rawQuestion);
      expect(sanitized.executionMode).toBe('STDIN');
      expect(sanitized.referenceSolution).toBeUndefined();
      expect(sanitized.referenceSolutions).toBeUndefined();
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. CUSTOM INPUT PIPELINE (ATTEMPT CONTROLLER & WORKER EXECUTION)
  // ════════════════════════════════════════════════════════════════════════════
  describe('4. Custom Input Pipeline & Execution', () => {
    test('4.1 Rejects custom input run when question is in FUNCTION mode', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const questionId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        title: 'Function Question',
        executionMode: 'FUNCTION',
        type: 'coding'
      };

      const mockAttempt = {
        _id: attemptId,
        studentId,
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600000)
      };

      jest.spyOn(ExamAttempt, 'findById').mockReturnValue(mockMongooseQuery(mockAttempt));
      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));

      const req = {
        params: { attemptId: attemptId.toString() },
        body: {
          questionId: questionId.toString(),
          code: 'def solution(a, b): return a + b',
          language: 'python',
          customInput: '10 20'
        },
        user: { id: studentId.toString(), role: 'student' }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await runCustomInput(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('FUNCTION-mode');
    });

    test('4.2 Rejects custom input exceeding 64KB size limit', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const questionId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        title: 'Stdin Question',
        executionMode: 'STDIN',
        type: 'coding'
      };

      const mockAttempt = {
        _id: attemptId,
        studentId,
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + 3600000)
      };

      jest.spyOn(ExamAttempt, 'findById').mockReturnValue(mockMongooseQuery(mockAttempt));
      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));

      const oversizedInput = 'X'.repeat(66 * 1024); // 66 KB > 64 KB

      const req = {
        params: { attemptId: attemptId.toString() },
        body: {
          questionId: questionId.toString(),
          code: 'import sys; print(sys.stdin.read())',
          language: 'python',
          customInput: oversizedInput
        },
        user: { id: studentId.toString(), role: 'student' }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await runCustomInput(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('64KB');
    });

    test('4.3 Enqueues CUSTOM_INPUT submission for STDIN question and processes via worker without mutating scores', async () => {
      const subId = new mongoose.Types.ObjectId();
      const questionId = new mongoose.Types.ObjectId();
      const attemptId = new mongoose.Types.ObjectId();

      // Mock OnlineCompiler response
      global.fetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output: 'Computed Result: 42\n',
            error: null,
            status: 'success',
            exit_code: 0,
            time: '0.045'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const provider = new OnlineCompilerProvider({
        endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
        apiKey: 'test-key'
      });
      providerRegistry.register('onlinecompiler', provider);
      providerRegistry.setActiveProvider('onlinecompiler');

      const mockSub = {
        _id: subId,
        questionId,
        attemptId,
        status: 'QUEUED',
        code: 'import sys; print("Computed Result: " + sys.stdin.read().strip())',
        language: 'python',
        runType: 'CUSTOM_INPUT',
        customInput: '42',
        maxMarks: 10,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockQuestion = {
        _id: questionId,
        executionMode: 'STDIN'
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));

      let savedFinalStatus = null;
      jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation((query, update) => {
        if (update.$set && update.$set.status === 'RUNNING') {
          return Promise.resolve({
            ...mockSub,
            status: 'RUNNING',
            executionOwner: update.$set.executionOwner,
            executionVersion: 1
          });
        }
        if (update.$set && update.$set.status === 'COMPLETED') {
          savedFinalStatus = update.$set;
          return Promise.resolve({
            ...mockSub,
            ...update.$set
          });
        }
        return Promise.resolve(mockSub);
      });

      // Spy on StudentAnswer to assert ZERO mutation
      const updateAnswerSpy = jest.spyOn(StudentAnswer, 'findOneAndUpdate');

      // Process the job
      const result = await processExecutionJob({
        data: {
          submissionId: subId.toString(),
          runType: 'CUSTOM_INPUT',
          providerName: 'onlinecompiler'
        }
      });

      expect(result.status).toBe('COMPLETED');
      expect(savedFinalStatus).toBeDefined();
      expect(savedFinalStatus.verdict).toBe('COMPLETED');
      expect(savedFinalStatus.scoreAwarded === null || savedFinalStatus.scoreAwarded === 0).toBe(true); // Custom input awards 0 points / null
      expect(savedFinalStatus.testResults).toHaveLength(1);
      expect(savedFinalStatus.testResults[0].actualOutput).toBe('Computed Result: 42');
      expect(savedFinalStatus.testResults[0].input).toBe('42');

      // Zero score / student answer mutation assertion
      expect(updateAnswerSpy).not.toHaveBeenCalled();
    });

    test('4.4 Custom Input execution handles compiler/runtime errors cleanly', async () => {
      const subId = new mongoose.Types.ObjectId();
      const questionId = new mongoose.Types.ObjectId();
      const attemptId = new mongoose.Types.ObjectId();

      // Mock OnlineCompiler syntax error
      global.fetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output: '',
            error: 'SyntaxError: invalid syntax on line 1\n',
            status: 'compile_error',
            exit_code: 1,
            time: '0.010'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const provider = new OnlineCompilerProvider({
        endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
        apiKey: 'test-key'
      });
      providerRegistry.register('onlinecompiler', provider);
      providerRegistry.setActiveProvider('onlinecompiler');

      const mockSub = {
        _id: subId,
        questionId,
        attemptId,
        status: 'QUEUED',
        code: 'def syntax_error(',
        language: 'python',
        runType: 'CUSTOM_INPUT',
        customInput: 'some input',
        maxMarks: 10,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockQuestion = {
        _id: questionId,
        executionMode: 'STDIN'
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));

      let savedFinalStatus = null;
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
          savedFinalStatus = update.$set;
          return Promise.resolve({
            ...mockSub,
            ...update.$set
          });
        }
        return Promise.resolve(mockSub);
      });

      const result = await processExecutionJob({
        data: {
          submissionId: subId.toString(),
          runType: 'CUSTOM_INPUT',
          providerName: 'onlinecompiler'
        }
      });

      expect(savedFinalStatus).toBeDefined();
      expect(savedFinalStatus.verdict).toBe('COMPILE_ERROR');
      expect(savedFinalStatus.errorMessage).toContain('SyntaxError');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 5. REFERENCE SOLUTION VALIDATION SUITE
  // ════════════════════════════════════════════════════════════════════════════
  describe('5. Reference Solution Validation Suite', () => {
    test('5.1 Validates reference solution across sample test cases and reports passes', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Add Numbers',
        language: 'python',
        executionMode: 'STDIN',
        referenceSolution: 'import sys\nprint(sum(map(int, sys.stdin.read().split())))',
        referenceSolutions: new Map([
          ['python', 'import sys\nprint(sum(map(int, sys.stdin.read().split())))']
        ]),
        save: jest.fn().mockResolvedValue(true)
      };

      const mockTestCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '2 3',
          expectedOutput: '5',
          category: 'sample',
          isHidden: false,
          save: jest.fn().mockResolvedValue(true)
        },
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '10 20',
          expectedOutput: '30',
          category: 'sample',
          isHidden: false,
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(TestCase, 'find').mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockTestCases)
      });

      // Mock OnlineCompiler responding with '5' and '30'
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(async () => {
        callCount++;
        const out = callCount === 1 ? '5\n' : '30\n';
        return new Response(
          JSON.stringify({
            output: out,
            error: null,
            status: 'success',
            exit_code: 0,
            time: '0.025'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const provider = new OnlineCompilerProvider({
        endpoint: 'https://api.onlinecompiler.io/api/run-code-sync/',
        apiKey: 'test-key'
      });
      providerRegistry.register('onlinecompiler', provider);
      providerRegistry.setActiveProvider('onlinecompiler');

      const req = {
        params: { id: questionId.toString() },
        body: { language: 'python' },
        user: { _id: teacherId, role: 'teacher' }
      };

      let sentStatus = null;
      let sentBody = null;
      const res = {
        status: jest.fn().mockImplementation((code) => {
          sentStatus = code;
          return res;
        }),
        json: jest.fn().mockImplementation((body) => {
          sentBody = body;
          return res;
        })
      };
      const next = jest.fn();

      await validateReferenceSolution(req, res, next);

      expect(sentStatus).toBe(200);
      expect(sentBody.success).toBe(true);
      expect(sentBody.data.totalTests).toBe(2);
      expect(sentBody.data.passedTests).toBe(2);
      expect(sentBody.data.questionStatus).toBe('verified');
    });

    test('5.2 Rejects validation when reference solution does not exist for question', async () => {
      const questionId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: questionId,
        ownerId: teacherId,
        title: 'Empty Ref Question',
        language: 'python',
        referenceSolution: '',
        referenceSolutions: new Map(),
        save: jest.fn().mockResolvedValue(true)
      };

      const mockTestCases = [
        {
          _id: new mongoose.Types.ObjectId(),
          questionId,
          input: '1 2',
          expectedOutput: '3',
          save: jest.fn().mockResolvedValue(true)
        }
      ];

      jest.spyOn(Question, 'findById').mockReturnValue(mockMongooseQuery(mockQuestion));
      jest.spyOn(TestCase, 'find').mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockTestCases)
      });

      const req = {
        params: { id: questionId.toString() },
        body: { language: 'python' },
        user: { _id: teacherId, role: 'teacher' }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await validateReferenceSolution(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('reference solution');
    });
  });
});
