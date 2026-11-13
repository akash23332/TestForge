import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { Submission } from '../src/models/Submission.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { processExecutionJob } from '../src/services/queue/executionProcessor.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';

describe('Phase 2E Task 2: BullMQ Queue-Level Execution Processor Integration Tests', () => {
  let mockProvider;
  let originalActiveProvider;

  beforeAll(() => {
    mockProvider = providerRegistry.getProvider('mock');
    originalActiveProvider = providerRegistry.activeProviderName;
    providerRegistry.setActiveProvider('mock');
  });

  afterAll(() => {
    providerRegistry.setActiveProvider(originalActiveProvider);
  });

  beforeEach(() => {
    mockProvider.reset();
    jest.clearAllMocks();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 1. LINKED_LIST EXECUTION PROCESSOR INTEGRATION
  // ════════════════════════════════════════════════════════════════════════════
  describe('1. Direct Processor Tests: LINKED_LIST Submission', () => {
    test('1.1 Propagates LINKED_LIST question metadata, wraps code, and awards score on pass', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const attemptId = new mongoose.Types.ObjectId().toString();
      const questionId = new mongoose.Types.ObjectId().toString();

      const studentCode = `
      class Solution {
      public:
          ListNode* reverseList(ListNode* head) {
              ListNode* prev = nullptr;
              while (head) {
                  ListNode* nxt = head->next;
                  head->next = prev;
                  prev = head;
                  head = nxt;
              }
              return prev;
          }
      };`;

      const mockSubmissionDoc = {
        _id: subId,
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        code: studentCode,
        language: 'cpp',
        status: 'QUEUED',
        maxMarks: 10,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockAttempt = {
        _id: attemptId,
        candidateEmail: 'student@testforge.edu',
        status: 'IN_PROGRESS',
        examId: 'exam_dsa_1'
      };

      const mockQuestion = {
        _id: questionId,
        title: 'Reverse Singly Linked List',
        executionMode: 'FUNCTION',
        dataStructure: 'LINKED_LIST',
        functionName: 'reverseList',
        functionSignature: {
          functionName: 'reverseList',
          returnType: 'ListNode*',
          parameters: [{ name: 'head', type: 'ListNode*' }]
        },
        maxMarks: 10
      };

      const mockTestCases = [
        { _id: 'tc_ll_1', isHidden: false, input: '[1,2,3,4,5]', expectedOutput: '[5,4,3,2,1]' },
        { _id: 'tc_ll_2', isHidden: true, input: '[]', expectedOutput: '[]' }
      ];

      // Track code delivered to execution provider
      let capturedParams = [];
      mockProvider.setHandler((params) => {
        capturedParams.push(params);
        // params.inputArgs: parsed input arguments array
        const arg0 = params.inputArgs[0];
        const isNullList = Array.isArray(arg0) && arg0.length === 0;
        return {
          status: 'success',
          output: isNullList ? '[]' : '[5,4,3,2,1]',
          error: null,
          runtimeMs: 15
        };
      });

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSubmissionDoc);
      jest.spyOn(ExamAttempt, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockAttempt)
      });
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockQuestion)
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTestCases)
      });
      const updateAnswerSpy = jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue(true);

      const job = {
        id: `exec_${subId}`,
        data: {
          submissionId: subId,
          attemptId,
          questionId,
          runType: 'SUBMISSION',
          language: 'cpp'
        }
      };

      const result = await processExecutionJob(job);

      // Verify metadata propagation to adapter & provider
      expect(capturedParams.length).toBe(2);
      expect(capturedParams[0].code).toContain('struct ListNode');
      expect(capturedParams[0].code).toContain('reverseList');
      expect(capturedParams[0].questionContext.dataStructure).toBe('LINKED_LIST');
      expect(capturedParams[0].questionContext.functionName).toBe('reverseList');

      // Verify submission scoring and verdict
      expect(mockSubmissionDoc.save).toHaveBeenCalled();
      expect(mockSubmissionDoc.status).toBe('COMPLETED');
      expect(mockSubmissionDoc.verdict).toBe('ACCEPTED');
      expect(mockSubmissionDoc.passedTests).toBe(2);
      expect(mockSubmissionDoc.totalTests).toBe(2);
      expect(mockSubmissionDoc.scoreAwarded).toBe(10);
      expect(result.status).toBe('COMPLETED');

      // Verify StudentAnswer updated
      expect(updateAnswerSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({ score: 10, verdict: 'ACCEPTED' })
        }),
        expect.any(Object)
      );
    });

    test('1.2 Sets WRONG_ANSWER and awards 0 score when output does not match expected', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const attemptId = new mongoose.Types.ObjectId().toString();
      const questionId = new mongoose.Types.ObjectId().toString();

      const mockSubmissionDoc = {
        _id: subId,
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        code: 'def reverseList(head): return head',
        language: 'python',
        status: 'QUEUED',
        maxMarks: 10,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockQuestion = {
        _id: questionId,
        title: 'Reverse Linked List Python',
        executionMode: 'FUNCTION',
        dataStructure: 'LINKED_LIST',
        functionName: 'reverseList',
        maxMarks: 10
      };

      const mockTestCases = [
        { _id: 'tc_ll_wrong', isHidden: false, input: '[1,2,3]', expectedOutput: '[3,2,1]' }
      ];

      // Provider returns unreversed output
      mockProvider.setHandler(() => ({
        status: 'success',
        output: '[1,2,3]',
        error: null,
        runtimeMs: 10
      }));

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSubmissionDoc);
      jest.spyOn(ExamAttempt, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: attemptId })
      });
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockQuestion)
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTestCases)
      });
      const updateAnswerSpy = jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue(true);

      const job = {
        id: `exec_${subId}`,
        data: {
          submissionId: subId,
          attemptId,
          questionId,
          runType: 'SUBMISSION',
          language: 'python'
        }
      };

      await processExecutionJob(job);

      expect(mockSubmissionDoc.status).toBe('COMPLETED');
      expect(mockSubmissionDoc.verdict).toBe('WRONG_ANSWER');
      expect(mockSubmissionDoc.passedTests).toBe(0);
      expect(mockSubmissionDoc.scoreAwarded).toBe(0);
      expect(updateAnswerSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({ score: 0, verdict: 'WRONG_ANSWER' })
        }),
        expect.anything()
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. BINARY_TREE EXECUTION PROCESSOR INTEGRATION
  // ════════════════════════════════════════════════════════════════════════════
  describe('2. Direct Processor Tests: BINARY_TREE Submission', () => {
    test('2.1 Propagates BINARY_TREE metadata, parses level-order BFS input, and grades correctly', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const attemptId = new mongoose.Types.ObjectId().toString();
      const questionId = new mongoose.Types.ObjectId().toString();

      const javaCode = `
      public class Solution {
          public TreeNode invertTree(TreeNode root) {
              if (root == null) return null;
              TreeNode temp = root.left;
              root.left = invertTree(root.right);
              root.right = invertTree(temp);
              return root;
          }
      }`;

      const mockSubmissionDoc = {
        _id: subId,
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        code: javaCode,
        language: 'java',
        status: 'QUEUED',
        maxMarks: 15,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockQuestion = {
        _id: questionId,
        title: 'Invert Binary Tree',
        executionMode: 'FUNCTION',
        dataStructure: 'BINARY_TREE',
        functionName: 'invertTree',
        functionSignature: {
          functionName: 'invertTree',
          returnType: 'TreeNode',
          parameters: [{ name: 'root', type: 'TreeNode' }]
        },
        maxMarks: 15
      };

      const mockTestCases = [
        { _id: 'tc_bt_1', isHidden: false, input: '[4,2,7,1,3,6,9]', expectedOutput: '[4,7,2,9,6,3,1]' }
      ];

      let receivedParams = null;
      mockProvider.setHandler((params) => {
        receivedParams = params;
        return {
          status: 'success',
          output: '[4,7,2,9,6,3,1]',
          error: null,
          runtimeMs: 22
        };
      });

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSubmissionDoc);
      jest.spyOn(ExamAttempt, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: attemptId })
      });
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockQuestion)
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTestCases)
      });
      const updateAnswerSpy = jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue(true);

      const job = {
        id: `exec_${subId}`,
        data: {
          submissionId: subId,
          attemptId,
          questionId,
          runType: 'SUBMISSION',
          language: 'java'
        }
      };

      const result = await processExecutionJob(job);

      expect(receivedParams.code).toContain('class TreeNode');
      expect(receivedParams.questionContext.dataStructure).toBe('BINARY_TREE');
      expect(receivedParams.questionContext.functionName).toBe('invertTree');

      expect(mockSubmissionDoc.status).toBe('COMPLETED');
      expect(mockSubmissionDoc.verdict).toBe('ACCEPTED');
      expect(mockSubmissionDoc.scoreAwarded).toBe(15);
      expect(result.status).toBe('COMPLETED');
      expect(updateAnswerSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({ score: 15, verdict: 'ACCEPTED' })
        }),
        expect.anything()
      );
    });

    test('2.2 Handles cycle limit / runtime error without corrupting exam attempt', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const attemptId = new mongoose.Types.ObjectId().toString();
      const questionId = new mongoose.Types.ObjectId().toString();

      const mockSubmissionDoc = {
        _id: subId,
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        code: 'class Solution { ... }',
        language: 'cpp',
        status: 'QUEUED',
        maxMarks: 10,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockQuestion = {
        _id: questionId,
        title: 'Binary Tree Cycle Guard',
        executionMode: 'FUNCTION',
        dataStructure: 'BINARY_TREE',
        functionName: 'invertTree',
        maxMarks: 10
      };

      const mockTestCases = [
        { _id: 'tc_cycle', isHidden: false, input: '[1,2,3]', expectedOutput: '[1,3,2]' }
      ];

      // Simulate runtime error from cycle detection limit
      mockProvider.setHandler(() => ({
        status: 'runtime_error',
        output: null,
        error: 'Cycle detected or binary tree node limit exceeded (max 100,000 nodes)',
        runtimeMs: 50
      }));

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSubmissionDoc);
      jest.spyOn(ExamAttempt, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: attemptId })
      });
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockQuestion)
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTestCases)
      });
      const updateAnswerSpy = jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue(true);

      const job = {
        id: `exec_${subId}`,
        data: {
          submissionId: subId,
          attemptId,
          questionId,
          runType: 'SUBMISSION',
          language: 'cpp'
        }
      };

      const result = await processExecutionJob(job);

      expect(mockSubmissionDoc.status).toBe('RUNTIME_ERROR');
      expect(mockSubmissionDoc.verdict).toBe('RUNTIME_ERROR');
      expect(mockSubmissionDoc.scoreAwarded).toBe(0);
      expect(mockSubmissionDoc.errorMessage).toContain('Cycle detected');
      expect(result.status).toBe('RUNTIME_ERROR');

      // Attempt state is not corrupted: StudentAnswer recorded 0 marks cleanly
      expect(updateAnswerSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({ score: 0, verdict: 'RUNTIME_ERROR' })
        }),
        expect.anything()
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. ZERO-LEAK SECURITY: HIDDEN TEST CASE PROTECTION
  // ════════════════════════════════════════════════════════════════════════════
  describe('3. Zero-Leak Security in Queue Execution', () => {
    test('3.1 Hidden test case expected outputs, inputs, and IDs are never exposed in student test results', async () => {
      const subId = new mongoose.Types.ObjectId().toString();
      const attemptId = new mongoose.Types.ObjectId().toString();
      const questionId = new mongoose.Types.ObjectId().toString();

      const mockSubmissionDoc = {
        _id: subId,
        attemptId,
        questionId,
        runType: 'SUBMISSION',
        code: 'function reverseList(head) { return head; }',
        language: 'javascript',
        status: 'QUEUED',
        maxMarks: 10,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockQuestion = {
        _id: questionId,
        title: 'Hidden Test Protection',
        executionMode: 'FUNCTION',
        dataStructure: 'LINKED_LIST',
        functionName: 'reverseList',
        maxMarks: 10
      };

      const mockTestCases = [
        { _id: 'tc_pub', visibility: 'public', isHidden: false, input: '[1,2]', expectedOutput: '[2,1]' },
        { _id: 'tc_hid', visibility: 'hidden', isHidden: true, input: '[9,8,7,6,5,4]', expectedOutput: '[4,5,6,7,8,9]' }
      ];

      mockProvider.setHandler((params) => ({
        status: 'success',
        output: String(params.inputArgs[0] || ''),
        error: null,
        runtimeMs: 10
      }));

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSubmissionDoc);
      jest.spyOn(ExamAttempt, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: attemptId })
      });
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockQuestion)
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTestCases)
      });
      jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue(true);

      const job = {
        id: `exec_${subId}`,
        data: {
          submissionId: subId,
          attemptId,
          questionId,
          runType: 'SUBMISSION',
          language: 'javascript'
        }
      };

      await processExecutionJob(job);

      // Verify that public case has input and expected output visible
      const publicResult = mockSubmissionDoc.testResults.find((tr) => tr.visibility === 'public');
      expect(publicResult).toBeDefined();
      expect(publicResult.testCaseId).toBe('tc_pub');
      expect(publicResult.input).toBe('[1,2]');

      // Verify that hidden case has testCaseId, input, expectedOutput, and actualOutput redacted as null
      const hiddenResult = mockSubmissionDoc.testResults.find((tr) => tr.visibility === 'hidden');
      expect(hiddenResult).toBeDefined();
      expect(hiddenResult.isHidden).toBe(true);
      expect(hiddenResult.testCaseId).toBeNull();
      expect(hiddenResult.input).toBeNull();
      expect(hiddenResult.expectedOutput).toBeNull();
      expect(hiddenResult.actualOutput).toBeNull();
    });
  });
});
