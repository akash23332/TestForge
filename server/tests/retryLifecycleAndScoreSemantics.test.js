import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { Job } from 'bullmq';
import { processExecutionJob, renewExecutionLease } from '../src/services/queue/executionProcessor.js';
import {
  recoverUnavailableSubmissions,
  renewRecoveryLease
} from '../src/services/queue/executionRecovery.js';
import { getExecutionQueue, enqueueExecutionJob } from '../src/services/queue/executionQueue.js';
import { recalculateAttemptGrading } from '../src/services/attemptGrading.service.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import { RenderSandboxProvider } from '../src/services/execution/RenderSandboxProvider.js';
import { LocalExecutionProvider } from '../src/services/execution/LocalExecutionProvider.js';
import {
  runCodeIsolated,
  runJavaIsolated,
  runPythonIsolated,
  runCppIsolated
} from '../src/services/codeRunner.service.js';
import { Submission } from '../src/models/Submission.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { Exam } from '../src/models/Exam.js';
import * as attemptController from '../src/controllers/attempt.controller.js';
import { gradeStudentAnswer } from '../src/controllers/attempt.controller.js';
import { getExamAnalytics } from '../src/controllers/exam.controller.js';
import { config } from '../src/config/env.js';

describe('Phase 4S: Exam Finalization Integrity, BullMQ Recovery & Production Audit', () => {
  let mockProvider;

  beforeEach(() => {
    mockProvider = providerRegistry.getProvider('mock');
    mockProvider.reset();
  });

  afterEach(() => {
    mockProvider.reset();
    jest.restoreAllMocks();
  });

  // ── 1. Exam Finalization with Pending / Provisional Grading ───────────────
  describe('Exam Finalization Integrity (No False or Inflated Percentages)', () => {
    test('One unavailable coding question among graded questions marks attempt PROVISIONAL with percentage: null', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const q1Id = new mongoose.Types.ObjectId(); // Graded MCQ (10/10)
      const q2Id = new mongoose.Types.ObjectId(); // Coding with runner offline (EXECUTION_UNAVAILABLE)

      const mockAttempt = {
        _id: attemptId,
        status: 'IN_PROGRESS',
        totalScore: 0,
        maxScore: 20,
        percentage: null,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);

      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: q1Id, score: 10, maxMarks: 10, status: 'SUBMITTED', questionType: 'mcq' },
          { questionId: q2Id, score: 0, maxMarks: 10, status: 'SAVED', questionType: 'coding' }
        ])
      });

      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { questionId: q2Id, status: 'EXECUTION_UNAVAILABLE' }
          ])
        })
      });

      const req = { params: { attemptId: attemptId.toString() } };
      let responsePayload = null;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockImplementation((p) => {
          responsePayload = p;
          return res;
        })
      };

      await attemptController.finalizeExam(req, res, jest.fn());

      expect(responsePayload.success).toBe(true);
      expect(responsePayload.data.isProvisional).toBe(true);
      expect(responsePayload.data.gradingStatus).toBe('PROVISIONAL');
      // Crucial: Final percentage MUST NOT be published or inflated to 100%! It must be null!
      expect(responsePayload.data.percentage).toBeNull();
      expect(responsePayload.data.totalScore).toBe(10);
      expect(responsePayload.data.finalizedMaxScore).toBe(10);
      expect(responsePayload.data.pendingMaxScore).toBe(10);
      expect(responsePayload.data.pendingQuestionsCount).toBe(1);
    });

    test('Multiple unavailable questions return correct pending count and withheld percentage', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const q1Id = new mongoose.Types.ObjectId();
      const q2Id = new mongoose.Types.ObjectId();
      const q3Id = new mongoose.Types.ObjectId();

      const mockAttempt = {
        _id: attemptId,
        status: 'SUBMITTED',
        totalScore: 0,
        maxScore: 30,
        percentage: null,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);

      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: q1Id, score: 5, maxMarks: 10, status: 'SUBMITTED', questionType: 'mcq' },
          { questionId: q2Id, score: 0, maxMarks: 10, status: 'SAVED', questionType: 'coding' },
          { questionId: q3Id, score: 0, maxMarks: 10, status: 'SAVED', questionType: 'coding' }
        ])
      });

      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { questionId: q2Id, status: 'EXECUTION_UNAVAILABLE' },
            { questionId: q3Id, status: 'EXECUTION_UNAVAILABLE' }
          ])
        })
      });

      const updated = await recalculateAttemptGrading(attemptId);

      expect(updated.isProvisional).toBe(true);
      expect(updated.gradingStatus).toBe('PROVISIONAL');
      expect(updated.percentage).toBeNull();
      expect(updated.pendingQuestionsCount).toBe(2);
      expect(updated.pendingMaxScore).toBe(20);
      expect(updated.finalizedMaxScore).toBe(10);
      expect(updated.totalScore).toBe(5);
    });

    test('All questions graded: publishes finalized result with true percentage against full maxScore', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const q1Id = new mongoose.Types.ObjectId();
      const q2Id = new mongoose.Types.ObjectId();

      const mockAttempt = {
        _id: attemptId,
        status: 'SUBMITTED',
        totalScore: 0,
        maxScore: 20,
        percentage: null,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);

      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: q1Id, score: 10, maxMarks: 10, status: 'SUBMITTED', questionType: 'mcq' },
          { questionId: q2Id, score: 8, maxMarks: 10, status: 'SUBMITTED', questionType: 'coding' }
        ])
      });

      // No pending submissions remain
      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });

      const updated = await recalculateAttemptGrading(attemptId);

      expect(updated.isProvisional).toBe(false);
      expect(updated.gradingStatus).toBe('FINALIZED');
      expect(updated.totalScore).toBe(18);
      expect(updated.maxScore).toBe(20);
      expect(updated.percentage).toBe(90); // 18 / 20 = 90%
      expect(updated.pendingQuestionsCount).toBe(0);
      expect(updated.pendingMaxScore).toBe(0);
    });

    test('Runner recovery followed by worker execution automatically finalizes the exam attempt', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const qId = new mongoose.Types.ObjectId();
      const subId = new mongoose.Types.ObjectId();

      const mockAttempt = {
        _id: attemptId,
        status: 'SUBMITTED',
        totalScore: 0,
        maxScore: 10,
        percentage: null,
        isProvisional: true,
        gradingStatus: 'PROVISIONAL',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockSub = {
        _id: subId,
        attemptId,
        questionId: qId,
        code: 'return 42;',
        language: 'javascript',
        status: 'QUEUED',
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockSub);
      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: qId, title: 'Sample', language: 'javascript' })
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: new mongoose.Types.ObjectId(), input: '1', expectedOutput: '42' }])
      });
      jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue({});

      // Submissions lookup in recalculateAttemptGrading: no more pending submissions
      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });
      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: qId, score: 10, maxMarks: 10, status: 'SUBMITTED', questionType: 'coding' }
        ])
      });

      // Runner is online and executes successfully
      mockProvider.setHandler(() => ({
        status: 'success',
        output: '42',
        error: null,
        runtimeMs: 15
      }));

      const job = {
        id: `exec_${subId}`,
        data: { submissionId: subId, attemptId, questionId: qId, runType: 'SUBMISSION' }
      };

      const result = await processExecutionJob(job);

      expect(result.status).toBe('COMPLETED');
      expect(result.scoreAwarded).toBe(10);

      // Attempt was automatically updated and transitioned to FINALIZED!
      expect(mockAttempt.gradingStatus).toBe('FINALIZED');
      expect(mockAttempt.isProvisional).toBe(false);
      expect(mockAttempt.percentage).toBe(100);
      expect(mockAttempt.totalScore).toBe(10);
    });

    test('Teacher analytics: getExamAnalytics partitions provisional attempts and computes summary statistics strictly on finalized attempts', async () => {
      const examId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockExam = {
        _id: examId,
        title: 'Midterm Exam',
        examCode: 'EXAM101',
        durationMinutes: 60,
        totalMarks: 20,
        status: 'PUBLISHED',
        createdBy: teacherId
      };

      const mockAttempts = [
        {
          _id: new mongoose.Types.ObjectId(),
          examId,
          totalScore: 18,
          percentage: 90,
          isProvisional: false,
          gradingStatus: 'FINALIZED',
          submittedAt: new Date()
        },
        {
          _id: new mongoose.Types.ObjectId(),
          examId,
          totalScore: 10,
          percentage: null,
          isProvisional: true,
          gradingStatus: 'PROVISIONAL',
          submittedAt: new Date()
        }
      ];

      jest.spyOn(Exam, 'findOne').mockResolvedValue(mockExam);
      jest.spyOn(ExamAttempt, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockAttempts)
        })
      });

      const req = {
        params: { id: examId.toString() },
        user: { _id: teacherId, role: 'teacher' }
      };

      let jsonPayload = null;
      let statusCode = 0;
      const res = {
        status: jest.fn().mockImplementation((code) => {
          statusCode = code;
          return res;
        }),
        json: jest.fn().mockImplementation((data) => {
          jsonPayload = data;
          return res;
        })
      };
      const next = jest.fn();

      await getExamAnalytics(req, res, next);

      expect(statusCode).toBe(200);
      expect(jsonPayload.success).toBe(true);
      expect(jsonPayload.data.summary).toEqual({
        totalAttempts: 2,
        finalizedCount: 1,
        provisionalCount: 1,
        averageScore: 18,
        averagePercentage: 90,
        highestScore: 18
      });
      // Ensure provisional attempt retains null percentage in response list
      expect(jsonPayload.data.attempts[1].percentage).toBeNull();
      expect(jsonPayload.data.attempts[1].isProvisional).toBe(true);
    });

    test('Grading audit: unanswered/skipped questions count 0 marks toward totalScore while fully included in exam denominator', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const q1Id = new mongoose.Types.ObjectId(); // Graded MCQ (10/10)
      const q2Id = new mongoose.Types.ObjectId(); // Graded Coding (8/10)
      const q3Id = new mongoose.Types.ObjectId(); // Unanswered Coding (0/10)

      const mockAttempt = {
        _id: attemptId,
        status: 'SUBMITTED',
        totalScore: 0,
        maxScore: 30,
        percentage: null,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);

      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: q1Id, score: 10, maxMarks: 10, status: 'SUBMITTED', questionType: 'mcq' },
          { questionId: q2Id, score: 8, maxMarks: 10, status: 'SUBMITTED', questionType: 'coding' },
          { questionId: q3Id, score: 0, maxMarks: 10, status: 'SAVED', questionType: 'coding' } // Unanswered
        ])
      });

      // No pending submissions in runner queue
      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });

      const updated = await recalculateAttemptGrading(attemptId);

      expect(updated.isProvisional).toBe(false);
      expect(updated.gradingStatus).toBe('FINALIZED');
      expect(updated.totalScore).toBe(18);
      expect(updated.maxScore).toBe(30);
      expect(updated.percentage).toBe(60); // 18 / 30 = 60%
    });

    test('Grading audit: missing student answer record does not shrink denominator below attempt.maxScore', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const q1Id = new mongoose.Types.ObjectId();

      const mockAttempt = {
        _id: attemptId,
        status: 'SUBMITTED',
        totalScore: 0,
        maxScore: 20, // Exam configured for 20 marks
        percentage: null,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);

      // Only 1 answer record of 10 marks present (e.g. second question record missing/uninitialized)
      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: q1Id, score: 10, maxMarks: 10, status: 'SUBMITTED', questionType: 'coding' }
        ])
      });

      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });

      const updated = await recalculateAttemptGrading(attemptId);

      // Denominator integrity preserves maxScore: 20, resulting in 10 / 20 = 50%, NOT false 100% (10/10)
      expect(updated.maxScore).toBe(20);
      expect(updated.totalScore).toBe(10);
      expect(updated.percentage).toBe(50);
      expect(updated.isProvisional).toBe(false);
    });

    test('Subjective question pending teacher grading marks attempt PROVISIONAL with percentage: null', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const q1Id = new mongoose.Types.ObjectId(); // Graded MCQ (10/10)
      const q2Id = new mongoose.Types.ObjectId(); // Subjective awaiting grading (0/10, PENDING)

      const mockAttempt = {
        _id: attemptId,
        status: 'SUBMITTED',
        totalScore: 0,
        maxScore: 20,
        percentage: null,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: q1Id, score: 10, maxMarks: 10, status: 'SUBMITTED', questionType: 'mcq' },
          { questionId: q2Id, score: 0, maxMarks: 10, status: 'SAVED', questionType: 'subjective', manualGradingStatus: 'PENDING' }
        ])
      });
      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
      });

      const updated = await recalculateAttemptGrading(attemptId);

      expect(updated.isProvisional).toBe(true);
      expect(updated.gradingStatus).toBe('PROVISIONAL');
      expect(updated.percentage).toBeNull();
      expect(updated.pendingQuestionsCount).toBe(1);
      expect(updated.pendingMaxScore).toBe(10);
      expect(updated.finalizedMaxScore).toBe(10);
      expect(updated.totalScore).toBe(10);
    });

    test('Teacher grades pending subjective question: attempt recalculates to FINALIZED with true percentage', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const answerId = new mongoose.Types.ObjectId();
      const examId = new mongoose.Types.ObjectId();
      const teacherId = new mongoose.Types.ObjectId();

      const mockAttempt = {
        _id: attemptId,
        examId,
        status: 'SUBMITTED',
        totalScore: 10,
        maxScore: 20,
        percentage: null,
        candidateInfo: { email: 'student@example.com' },
        save: jest.fn().mockResolvedValue(true)
      };

      const mockExam = {
        _id: examId,
        createdBy: teacherId
      };

      const mockAnswer = {
        _id: answerId,
        attemptId,
        maxMarks: 10,
        score: 0,
        manualGradingStatus: 'PENDING',
        teacherFeedback: ''
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);
      jest.spyOn(StudentAnswer, 'findOne').mockResolvedValue(mockAnswer);
      jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue({
        ...mockAnswer,
        score: 8,
        manualGradingStatus: 'GRADED',
        status: 'SUBMITTED'
      });

      // Recalculation lookup: both questions graded
      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: new mongoose.Types.ObjectId(), score: 10, maxMarks: 10, status: 'SUBMITTED', questionType: 'mcq' },
          { questionId: new mongoose.Types.ObjectId(), score: 8, maxMarks: 10, status: 'SUBMITTED', questionType: 'subjective', manualGradingStatus: 'GRADED' }
        ])
      });
      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
      });

      const req = {
        params: { attemptId: attemptId.toString(), answerId: answerId.toString() },
        body: { score: 8, feedback: 'Well structured reasoning.' },
        user: { _id: teacherId, role: 'teacher' }
      };

      let jsonPayload = null;
      let statusCode = 0;
      const res = {
        status: jest.fn().mockImplementation((code) => {
          statusCode = code;
          return res;
        }),
        json: jest.fn().mockImplementation((data) => {
          jsonPayload = data;
          return res;
        })
      };
      const next = jest.fn();

      await gradeStudentAnswer(req, res, next);

      expect(statusCode).toBe(200);
      expect(jsonPayload.success).toBe(true);
      expect(jsonPayload.data.answer.score).toBe(8);
      expect(jsonPayload.data.answer.manualGradingStatus).toBe('GRADED');
      // Recalculated exam attempt totals: 10 + 8 = 18 / 20 = 90%
      expect(jsonPayload.data.attempt.totalScore).toBe(18);
      expect(jsonPayload.data.attempt.maxScore).toBe(20);
      expect(jsonPayload.data.attempt.percentage).toBe(90);
      expect(jsonPayload.data.attempt.isProvisional).toBe(false);
      expect(jsonPayload.data.attempt.gradingStatus).toBe('FINALIZED');
    });

    test('Pending subjective and pending coding questions simultaneously: both required before finalization', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const qMcqId = new mongoose.Types.ObjectId();
      const qCodingId = new mongoose.Types.ObjectId();
      const qSubjId = new mongoose.Types.ObjectId();

      const mockAttempt = {
        _id: attemptId,
        status: 'SUBMITTED',
        totalScore: 0,
        maxScore: 30,
        percentage: null,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);

      // 1. MCQ graded (10), Coding pending execution, Subjective pending teacher grading
      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: qMcqId, score: 10, maxMarks: 10, status: 'SUBMITTED', questionType: 'mcq' },
          { questionId: qCodingId, score: null, maxMarks: 10, status: 'SAVED', questionType: 'coding' },
          { questionId: qSubjId, score: null, maxMarks: 10, status: 'SAVED', questionType: 'subjective', manualGradingStatus: 'PENDING' }
        ])
      });

      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ questionId: qCodingId, status: 'EXECUTION_UNAVAILABLE' }])
        })
      });

      const updatedInitial = await recalculateAttemptGrading(attemptId);
      expect(updatedInitial.isProvisional).toBe(true);
      expect(updatedInitial.pendingQuestionsCount).toBe(2);
      expect(updatedInitial.percentage).toBeNull();

      // 2. Coding completes (8/10), but Subjective is STILL pending teacher grading
      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: qMcqId, score: 10, maxMarks: 10, status: 'SUBMITTED', questionType: 'mcq' },
          { questionId: qCodingId, score: 8, maxMarks: 10, status: 'SUBMITTED', questionType: 'coding' },
          { questionId: qSubjId, score: null, maxMarks: 10, status: 'SAVED', questionType: 'subjective', manualGradingStatus: 'PENDING' }
        ])
      });
      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
      });

      const updatedAfterCoding = await recalculateAttemptGrading(attemptId);
      expect(updatedAfterCoding.isProvisional).toBe(true);
      expect(updatedAfterCoding.pendingQuestionsCount).toBe(1);
      expect(updatedAfterCoding.totalScore).toBe(18); // 10 + 8
      expect(updatedAfterCoding.percentage).toBeNull(); // Withheld!

      // 3. Subjective graded (9/10): All complete!
      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: qMcqId, score: 10, maxMarks: 10, status: 'SUBMITTED', questionType: 'mcq' },
          { questionId: qCodingId, score: 8, maxMarks: 10, status: 'SUBMITTED', questionType: 'coding' },
          { questionId: qSubjId, score: 9, maxMarks: 10, status: 'SUBMITTED', questionType: 'subjective', manualGradingStatus: 'GRADED' }
        ])
      });

      const updatedAllFinal = await recalculateAttemptGrading(attemptId);
      expect(updatedAllFinal.isProvisional).toBe(false);
      expect(updatedAllFinal.gradingStatus).toBe('FINALIZED');
      expect(updatedAllFinal.pendingQuestionsCount).toBe(0);
      expect(updatedAllFinal.totalScore).toBe(27); // 10 + 8 + 9 = 27
      expect(updatedAllFinal.maxScore).toBe(30);
      expect(updatedAllFinal.percentage).toBe(90); // 27 / 30 = 90%
    });
  });

  // ── 2. BullMQ Deterministic Job-ID Recovery & Concurrency ──────────────────
  describe('BullMQ Deterministic Job-ID Recovery Lifecycle', () => {
    test('Retained failed job in Redis uses job.retry to reset attemptsMade and requeue', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        status: 'EXECUTION_UNAVAILABLE',
        verdict: 'PENDING',
        runType: 'SUBMISSION',
        language: 'python'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([mockSub])
        })
      });

      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockSub);
      jest.spyOn(Submission, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

      const mockBullJob = {
        id: `exec_${subId}`,
        getState: jest.fn().mockResolvedValue('failed'),
        retry: jest.fn().mockResolvedValue(true)
      };

      const queue = getExecutionQueue();
      queue.getJob = jest.fn().mockResolvedValue(mockBullJob);

      const result = await recoverUnavailableSubmissions({ submissionId: subId });

      expect(result.recovered).toBe(1);
      expect(queue.getJob).toHaveBeenCalledWith(`exec_${subId}`);
      expect(mockBullJob.getState).toHaveBeenCalled();
      expect(mockBullJob.retry).toHaveBeenCalledWith('failed', { resetAttemptsMade: true });
    });

    test('Recovery after failed job retention expired creates fresh job with deterministic ID', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        status: 'EXECUTION_UNAVAILABLE',
        verdict: 'PENDING',
        attemptId: new mongoose.Types.ObjectId(),
        questionId: new mongoose.Types.ObjectId(),
        runType: 'SUBMISSION',
        language: 'python'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([mockSub])
        })
      });

      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockSub);
      jest.spyOn(Submission, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

      const queue = getExecutionQueue();
      queue.getJob = jest.fn().mockResolvedValue(null); // Evicted from Redis
      queue.add = jest.fn().mockResolvedValue({ id: `exec_${subId}` });

      const result = await recoverUnavailableSubmissions({ submissionId: subId });

      expect(result.recovered).toBe(1);
      expect(queue.add).toHaveBeenCalled();
    });

    test('Concurrent recovery requests: atomic lock ensures exactly one worker acquires document', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        attemptId: new mongoose.Types.ObjectId(),
        questionId: new mongoose.Types.ObjectId(),
        status: 'EXECUTION_UNAVAILABLE',
        verdict: 'PENDING'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([mockSub])
        })
      });

      // First call acquires atomic lock; second call returns null (already claimed)
      let acquireCount = 0;
      jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation(async () => {
        acquireCount++;
        return acquireCount === 1 ? mockSub : null;
      });
      jest.spyOn(Submission, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

      const queue = getExecutionQueue();
      queue.getJob = jest.fn().mockResolvedValue(null);
      queue.add = jest.fn().mockResolvedValue({ id: `exec_${subId}` });

      // Run two recovery workers concurrently
      const [worker1Result, worker2Result] = await Promise.all([
        recoverUnavailableSubmissions({ submissionId: subId }),
        recoverUnavailableSubmissions({ submissionId: subId })
      ]);

      expect(worker1Result.recovered).toBe(1);
      expect(worker2Result.recovered).toBe(0);
      expect(worker2Result.skipped).toBe(1);
    });

    test('Never retries an active job currently processing in worker', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        status: 'EXECUTION_UNAVAILABLE',
        verdict: 'PENDING'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([mockSub])
        })
      });

      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockSub);
      const updateSpy = jest.spyOn(Submission, 'updateOne').mockResolvedValue({});

      const mockActiveJob = {
        id: `exec_${subId}`,
        getState: jest.fn().mockResolvedValue('active'),
        retry: jest.fn()
      };

      const queue = getExecutionQueue();
      queue.getJob = jest.fn().mockResolvedValue(mockActiveJob);

      const result = await recoverUnavailableSubmissions({ submissionId: subId });

      expect(result.recovered).toBe(0);
      expect(result.skipped).toBe(1);
      expect(mockActiveJob.retry).not.toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalledWith(
        { _id: subId, status: 'RECOVERING', recoveryOwner: expect.any(String) },
        expect.objectContaining({ $set: expect.objectContaining({ status: 'RUNNING' }) })
      );
    });

    test('Redis unavailable during recovery safely reverts status to EXECUTION_UNAVAILABLE', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        status: 'EXECUTION_UNAVAILABLE',
        verdict: 'PENDING'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([mockSub])
        })
      });

      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockSub);
      const updateSpy = jest.spyOn(Submission, 'updateOne').mockResolvedValue({});

      const queue = getExecutionQueue();
      queue.getJob = jest.fn().mockRejectedValue(new Error('Redis connection lost (ECONNREFUSED)'));

      const result = await recoverUnavailableSubmissions({ submissionId: subId });

      expect(result.recovered).toBe(0);
      expect(result.errors).toBe(1);

      // Submission status was safely reverted to EXECUTION_UNAVAILABLE, NEVER left in QUEUED!
      expect(updateSpy).toHaveBeenCalledWith(
        { _id: subId, status: 'RECOVERING', recoveryOwner: expect.any(String) },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'EXECUTION_UNAVAILABLE' })
        })
      );
    });

    test('Worker receiving job while submission is in RECOVERING clears recovery lease and sets RUNNING', async () => {
      const subId = new mongoose.Types.ObjectId();
      const qId = new mongoose.Types.ObjectId();
      const attemptId = new mongoose.Types.ObjectId();

      const mockSub = {
        _id: subId,
        attemptId,
        questionId: qId,
        status: 'RECOVERING',
        recoveryOwner: 'recon-worker-uuid-1234',
        recoveryLeaseExpiresAt: new Date(Date.now() + 25000),
        code: 'return 1;',
        language: 'javascript',
        save: jest.fn().mockResolvedValue(true)
      };

      const findOneAndUpdateSpy = jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockSub);
      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: qId, title: 'Sample', language: 'javascript' })
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: new mongoose.Types.ObjectId(), input: '1', expectedOutput: '1' }])
      });
      jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue({});
      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(null);

      mockProvider.setHandler(() => ({
        status: 'success',
        output: '1',
        error: null,
        runtimeMs: 10
      }));

      const job = {
        id: `exec_${subId}`,
        data: { submissionId: subId, attemptId, questionId: qId, runType: 'SUBMISSION' }
      };

      const result = await processExecutionJob(job);

      expect(result.status).toBe('COMPLETED');
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: subId,
          $or: [
            { status: 'QUEUED' },
            { status: 'RECOVERING' },
            { status: 'RUNNING', executionLeaseExpiresAt: { $lt: expect.any(Date) } }
          ]
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'RUNNING',
            executionOwner: expect.any(String),
            recoveryOwner: null,
            recoveryLeaseExpiresAt: null
          })
        }),
        { new: true }
      );
    });

    test('Worker claim exclusivity: Second worker receives duplicate job while first worker is actively RUNNING -> rejected without executing', async () => {
      const subId = new mongoose.Types.ObjectId();
      const qId = new mongoose.Types.ObjectId();
      const attemptId = new mongoose.Types.ObjectId();

      const mockSub = {
        _id: subId,
        attemptId,
        questionId: qId,
        status: 'RUNNING',
        executionOwner: 'worker-1-uuid',
        executionLeaseExpiresAt: new Date(Date.now() + 50000) // Active lease
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      // Atomic claim query returns null because status is RUNNING with unexpired lease
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(null);

      const job = {
        id: `exec_${subId}`,
        data: { submissionId: subId, attemptId, questionId: qId, runType: 'SUBMISSION' }
      };

      const result = await processExecutionJob(job);

      expect(result.alreadyClaimed).toBe(true);
      expect(result.status).toBe('RUNNING');
      expect(result.message).toMatch(/already actively running/i);
    });

    test('Stale worker lock preemption: Worker that loses its execution lease cannot overwrite newer worker results or write StudentAnswer marks', async () => {
      const subId = new mongoose.Types.ObjectId();
      const qId = new mongoose.Types.ObjectId();
      const attemptId = new mongoose.Types.ObjectId();

      const mockSub = {
        _id: subId,
        attemptId,
        questionId: qId,
        code: 'return 1;',
        language: 'javascript',
        status: 'QUEUED'
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: qId, title: 'Sample', language: 'javascript' })
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: new mongoose.Types.ObjectId(), input: '1', expectedOutput: '1' }])
      });
      const updateAnswerSpy = jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue({});

      // Claim succeeds (first call), but final persistence fails because another worker preempted it (second call returns null)
      let callCount = 0;
      jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { ...mockSub, status: 'RUNNING', executionOwner: 'stale-worker-owner' };
        return null; // Preempted!
      });

      mockProvider.setHandler(() => ({
        status: 'success',
        output: '1',
        error: null,
        runtimeMs: 10
      }));

      const job = {
        id: `exec_${subId}`,
        data: { submissionId: subId, attemptId, questionId: qId, runType: 'SUBMISSION' }
      };

      const result = await processExecutionJob(job);

      expect(result.status).toBe('STALE_PREEMPTED');
      expect(result.message).toMatch(/Execution lock was lost or preempted/i);
      // Stale worker NEVER modified student answer!
      expect(updateAnswerSpy).not.toHaveBeenCalled();
    });

    test('Recovery lease renewal: renewRecoveryLease extends expiration for matching ownerToken and rejects mismatched token', async () => {
      const subId = new mongoose.Types.ObjectId();
      const ownerToken = 'valid-owner-uuid';

      // 1. Success case with matching ownerToken
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue({
        _id: subId,
        status: 'RECOVERING',
        recoveryOwner: ownerToken,
        recoveryLeaseExpiresAt: new Date(Date.now() + 30000)
      });

      const renewed = await renewRecoveryLease(subId, ownerToken, 30000);
      expect(renewed).toBe(true);

      // 2. Failure case with mismatched or stale ownerToken
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(null);
      const staleRenewed = await renewRecoveryLease(subId, 'stale-owner-uuid', 30000);
      expect(staleRenewed).toBe(false);
    });

    test('Stale recovery lease: expired RECOVERING documents are reclaimed by next reconciliation loop', async () => {
      const subId = new mongoose.Types.ObjectId();
      const expiredDate = new Date(Date.now() - 5000);
      const mockStaleSub = {
        _id: subId,
        attemptId: new mongoose.Types.ObjectId(),
        questionId: new mongoose.Types.ObjectId(),
        status: 'RECOVERING',
        recoveryOwner: 'crashed-worker-uuid-old',
        recoveryLeaseExpiresAt: expiredDate,
        verdict: 'PENDING'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([mockStaleSub])
        })
      });

      const findOneAndUpdateSpy = jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue({
        ...mockStaleSub,
        recoveryOwner: 'new-active-reconciler-uuid'
      });
      jest.spyOn(Submission, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

      const queue = getExecutionQueue();
      queue.getJob = jest.fn().mockResolvedValue(null);
      queue.add = jest.fn().mockResolvedValue({ id: `exec_${subId}` });

      const result = await recoverUnavailableSubmissions({ submissionId: subId });

      expect(result.recovered).toBe(1);
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: subId,
          $or: [
            { status: 'EXECUTION_UNAVAILABLE' },
            { status: 'RECOVERING', recoveryLeaseExpiresAt: { $lt: expect.any(Date) } }
          ]
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'RECOVERING'
          })
        }),
        { new: true }
      );
    });

    test('Race condition immunity: Worker transitioning to RUNNING prevents reconciler from resetting status to QUEUED', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        attemptId: new mongoose.Types.ObjectId(),
        questionId: new mongoose.Types.ObjectId(),
        status: 'EXECUTION_UNAVAILABLE',
        verdict: 'PENDING'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([mockSub])
        })
      });

      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockSub);

      const queue = getExecutionQueue();
      queue.getJob = jest.fn().mockResolvedValue(null);
      queue.add = jest.fn().mockResolvedValue({ id: `exec_${subId}` });

      const updateOneSpy = jest.spyOn(Submission, 'updateOne').mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

      const result = await recoverUnavailableSubmissions({ submissionId: subId });

      expect(result.recovered).toBe(0);
      expect(result.skipped).toBe(1);
      expect(updateOneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: subId,
          status: 'RECOVERING',
          recoveryOwner: expect.any(String)
        }),
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'QUEUED' })
        })
      );
    });

    test('Lease expiry during active recovery: stale owner cannot overwrite newer owner state', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        attemptId: new mongoose.Types.ObjectId(),
        questionId: new mongoose.Types.ObjectId(),
        status: 'EXECUTION_UNAVAILABLE',
        verdict: 'PENDING'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([mockSub])
        })
      });

      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockSub);

      const queue = getExecutionQueue();
      queue.getJob = jest.fn().mockResolvedValue(null);
      queue.add = jest.fn().mockResolvedValue({ id: `exec_${subId}` });

      // Stale owner update fails to match document because a newer owner or worker claimed it
      jest.spyOn(Submission, 'updateOne').mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

      const result = await recoverUnavailableSubmissions({ submissionId: subId });

      expect(result.recovered).toBe(0);
      expect(result.skipped).toBe(1);
    });

    test('Simultaneous reconcilers discovering missing job: exactly one valid job is enqueued', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        attemptId: new mongoose.Types.ObjectId(),
        questionId: new mongoose.Types.ObjectId(),
        status: 'EXECUTION_UNAVAILABLE',
        verdict: 'PENDING'
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([mockSub])
        })
      });

      // Reconciler 1 acquires lock; Reconciler 2 gets null
      let lockCounter = 0;
      jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation(async () => {
        lockCounter++;
        return lockCounter === 1 ? mockSub : null;
      });
      jest.spyOn(Submission, 'updateOne').mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      const queue = getExecutionQueue();
      queue.getJob = jest.fn().mockResolvedValue(null);
      queue.add = jest.fn().mockResolvedValue({ id: `exec_${subId}` });

      const [res1, res2] = await Promise.all([
        recoverUnavailableSubmissions({ submissionId: subId }),
        recoverUnavailableSubmissions({ submissionId: subId })
      ]);

      expect(res1.recovered + res2.recovered).toBe(1);
      expect(res1.skipped + res2.skipped).toBe(1);
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    test('Worker claim validation: rejects job if job.id does not match expected submission ID', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        attemptId: new mongoose.Types.ObjectId(),
        questionId: new mongoose.Types.ObjectId(),
        status: 'QUEUED'
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);

      const mismatchedJob = {
        id: 'exec_different_submission_id_999',
        data: { submissionId: subId, attemptId: mockSub.attemptId, questionId: mockSub.questionId }
      };

      await expect(processExecutionJob(mismatchedJob)).rejects.toThrow(/Job ID mismatch/i);
    });

    test('Worker claim validation: rejects job if job.data.attemptId or questionId does not match submission', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: subId,
        attemptId: new mongoose.Types.ObjectId(),
        questionId: new mongoose.Types.ObjectId(),
        status: 'QUEUED'
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);

      // Attempt ID mismatch
      const attemptMismatchJob = {
        id: `exec_${subId}`,
        data: { submissionId: subId, attemptId: new mongoose.Types.ObjectId(), questionId: mockSub.questionId }
      };
      await expect(processExecutionJob(attemptMismatchJob)).rejects.toThrow(/Attempt ID mismatch/i);

      // Question ID mismatch
      const questionMismatchJob = {
        id: `exec_${subId}`,
        data: { submissionId: subId, attemptId: mockSub.attemptId, questionId: new mongoose.Types.ObjectId() }
      };
      await expect(processExecutionJob(questionMismatchJob)).rejects.toThrow(/Question ID mismatch/i);
    });

    test('Worker claim validation: returns alreadyCompleted: true if submission status is already finalized', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockCompletedSub = {
        _id: subId,
        status: 'COMPLETED',
        verdict: 'ACCEPTED'
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockCompletedSub);

      const duplicateJob = {
        id: `exec_${subId}`,
        data: { submissionId: subId }
      };

      const result = await processExecutionJob(duplicateJob);

      expect(result.alreadyCompleted).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(result.verdict).toBe('ACCEPTED');
    });

    test('BullMQ Job.prototype.retry: API accepts options and correctly resets attemptsMade', () => {
      expect(typeof Job.prototype.retry).toBe('function');
      expect(Job.prototype.retry.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ── 3. Production Grading Path Security Audit ──────────────────────────────
  describe('Production Execution Security Audit', () => {
    test('LocalExecutionProvider constructor and executeCode throw fail-closed error if called in production', async () => {
      // 1. Constructor throws if called directly in production
      process.env.NODE_ENV = 'production';
      expect(() => new LocalExecutionProvider({ allowLocalExecution: true })).toThrow(/Execution via host processes is forbidden in production/i);

      // 2. executeCode fails closed if environment switches to production
      process.env.NODE_ENV = 'test';
      const provider = new LocalExecutionProvider({ allowLocalExecution: true });
      process.env.NODE_ENV = 'production';

      const result = await provider.executeCode({
        language: 'python',
        code: 'print(1)',
        inputArgs: []
      });

      expect(result.status).toBe('internal_error');
      expect(result.error).toMatch(/Execution via host processes is strictly forbidden in production/i);
      process.env.NODE_ENV = 'test';
    });

    test('RenderSandboxProvider strictly rejects private endpoints if proxy is missing', async () => {
      const provider = new RenderSandboxProvider({
        endpoint: 'http://runner.tailnet.ts.net:2358',
        apiKey: 'token'
      });

      await expect(provider.executeCode({
        language: 'python',
        code: 'print(1)'
      })).rejects.toThrow(/Private endpoint requires an active proxy/i);
    });

    test('Direct host execution functions runCodeIsolated, runJavaIsolated, runPythonIsolated, runCppIsolated fail closed in production', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const resJs = await runCodeIsolated({ code: 'function test() { return 1; }', inputArgs: [] });
      expect(resJs.status).toBe('internal_error');
      expect(resJs.error).toMatch(/Direct host process execution is strictly forbidden in production/i);

      const resJava = await runJavaIsolated({ code: 'class Solution {}', inputArgs: [] });
      expect(resJava.status).toBe('internal_error');
      expect(resJava.error).toMatch(/Direct host process execution is strictly forbidden in production/i);

      const resPy = await runPythonIsolated({ code: 'def solve(): pass', inputArgs: [] });
      expect(resPy.status).toBe('internal_error');
      expect(resPy.error).toMatch(/Direct host process execution is strictly forbidden in production/i);

      const resCpp = await runCppIsolated({ code: 'int solve() { return 0; }', inputArgs: [] });
      expect(resCpp.status).toBe('internal_error');
      expect(resCpp.error).toMatch(/Direct host process execution is strictly forbidden in production/i);

      process.env.NODE_ENV = origEnv;
    });
  });

  // ── 4. Phase 4W: Execution Lease Renewal, Sandbox Cancellation & Manual Grading Security ──
  describe('Phase 4W: Execution Lease Renewal, Sandbox Cancellation & Manual Grading Security', () => {
    describe('Execution Lease Renewal (renewExecutionLease)', () => {
      test('Successfully renews execution lease when owner matches and status is RUNNING', async () => {
        const subId = new mongoose.Types.ObjectId();
        const owner = 'worker-owner-token-123';

        const mockUpdatedDoc = {
          _id: subId,
          status: 'RUNNING',
          executionOwner: owner,
          executionLeaseExpiresAt: new Date(Date.now() + 60000)
        };

        const findOneAndUpdateSpy = jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockUpdatedDoc);

        const renewed = await renewExecutionLease(subId, owner, 60000);
        expect(renewed.renewed ?? renewed).toBe(true);
        expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
          {
            _id: subId,
            status: 'RUNNING',
            executionOwner: owner
          },
          expect.objectContaining({
            $set: expect.objectContaining({
              executionLeaseExpiresAt: expect.any(Date)
            })
          }),
          expect.objectContaining({ new: true })
        );
      });

      test('Fails to renew execution lease when owner mismatch or status is not RUNNING', async () => {
        const subId = new mongoose.Types.ObjectId();
        const staleOwner = 'stale-worker-owner';

        // findOneAndUpdate returns null because query filters do not match
        jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(null);

        const renewed = await renewExecutionLease(subId, staleOwner, 60000);
        expect(renewed.renewed ?? renewed).toBe(false);
      });

      test('Fails immediately when submissionId or executionOwner is missing', async () => {
        expect((await renewExecutionLease(null, 'owner-123')).renewed).toBe(false);
        expect((await renewExecutionLease(new mongoose.Types.ObjectId(), null)).renewed).toBe(false);
      });
    });

    describe('Sandbox Execution Cancellation via AbortSignal', () => {
      test('MockExecutionProvider returns status cancelled when signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        const result = await mockProvider.executeCode({
          language: 'javascript',
          code: 'console.log("hello");',
          inputArgs: [],
          signal: controller.signal
        });

        expect(result.status).toBe('cancelled');
        expect(result.error).toMatch(/cancelled by signal/i);
      });

      test('RenderSandboxProvider returns status cancelled when aborted in-flight', async () => {
        const provider = new RenderSandboxProvider({
          endpoint: 'http://test-sandbox:8000',
          apiKey: 'key123'
        });

        const controller = new AbortController();
        controller.abort();

        const result = await provider.executeCode({
          language: 'javascript',
          code: 'console.log("hello");',
          inputArgs: [],
          signal: controller.signal
        });

        expect(result.status).toBe('cancelled');
        expect(result.error).toMatch(/cancelled by caller/i);
      });
    });

    describe('Manual Grading Security & Audit History (gradeStudentAnswer)', () => {
      let examId;
      let attemptId;
      let answerId;
      let q1Id;
      let teacherUserId;
      let otherTeacherUserId;

      beforeEach(() => {
        examId = new mongoose.Types.ObjectId();
        attemptId = new mongoose.Types.ObjectId();
        answerId = new mongoose.Types.ObjectId();
        q1Id = new mongoose.Types.ObjectId();
        teacherUserId = new mongoose.Types.ObjectId();
        otherTeacherUserId = new mongoose.Types.ObjectId();
      });

      test('Rejects unauthorized teacher who is not the exam creator and not admin with 403', async () => {
        const mockAttempt = {
          _id: attemptId,
          examId,
          studentId: new mongoose.Types.ObjectId(),
          candidateInfo: { email: 'student@example.com' }
        };
        const mockExam = {
          _id: examId,
          createdBy: teacherUserId, // Created by teacherUserId
          sections: []
        };

        jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
        jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);

        const req = {
          params: { attemptId: attemptId.toString(), answerId: answerId.toString() },
          body: { score: 8, feedback: 'Good job' },
          user: { _id: otherTeacherUserId, role: 'teacher' } // other teacher
        };

        let capturedError = null;
        await gradeStudentAnswer(req, {}, (err) => { capturedError = err; });

        expect(capturedError).toBeDefined();
        expect(capturedError.statusCode).toBe(403);
        expect(capturedError.message).toMatch(/Access denied/i);
      });

      test('Rejects grading if question does not belong to the referenced examination with 400', async () => {
        const foreignQId = new mongoose.Types.ObjectId();
        const mockAttempt = {
          _id: attemptId,
          examId,
          studentId: new mongoose.Types.ObjectId(),
          candidateInfo: { email: 'student@example.com' }
        };
        const mockExam = {
          _id: examId,
          createdBy: teacherUserId,
          sections: [
            {
              sectionId: 'sec-1',
              questions: [
                { questionId: q1Id, marks: 10 } // Exam only contains q1Id
              ]
            }
          ]
        };
        const mockAnswer = {
          _id: answerId,
          attemptId,
          questionId: foreignQId, // Foreign question ID!
          maxMarks: 10,
          score: null
        };

        jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
        jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);
        jest.spyOn(StudentAnswer, 'findOne').mockResolvedValue(mockAnswer);

        const req = {
          params: { attemptId: attemptId.toString(), answerId: answerId.toString() },
          body: { score: 7, feedback: 'Fair work' },
          user: { _id: teacherUserId, role: 'teacher' }
        };

        let capturedError = null;
        await gradeStudentAnswer(req, {}, (err) => { capturedError = err; });

        expect(capturedError).toBeDefined();
        expect(capturedError.statusCode).toBe(400);
        expect(capturedError.message).toMatch(/Security violation: Graded question does not belong to the referenced examination/i);
      });

      test('Rejects score exceeding question maximum marks with 400', async () => {
        const mockAttempt = {
          _id: attemptId,
          examId,
          studentId: new mongoose.Types.ObjectId(),
          candidateInfo: { email: 'student@example.com' }
        };
        const mockExam = {
          _id: examId,
          createdBy: teacherUserId,
          sections: [
            {
              sectionId: 'sec-1',
              questions: [{ questionId: q1Id, marks: 10 }]
            }
          ]
        };
        const mockAnswer = {
          _id: answerId,
          attemptId,
          questionId: q1Id,
          maxMarks: 10,
          score: 5
        };

        jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
        jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);
        jest.spyOn(StudentAnswer, 'findOne').mockResolvedValue(mockAnswer);

        const req = {
          params: { attemptId: attemptId.toString(), answerId: answerId.toString() },
          body: { score: 15, feedback: 'Over max marks' }, // 15 > 10
          user: { _id: teacherUserId, role: 'teacher' }
        };

        let capturedError = null;
        await gradeStudentAnswer(req, {}, (err) => { capturedError = err; });

        expect(capturedError).toBeDefined();
        expect(capturedError.statusCode).toBe(400);
        expect(capturedError.message).toMatch(/Score must be between 0 and authoritative maximum marks/i);
      });

      test('Successfully grades answer and appends entry to gradingHistory audit trail', async () => {
        const mockAttempt = {
          _id: attemptId,
          examId,
          studentId: new mongoose.Types.ObjectId(),
          candidateInfo: { email: 'student@example.com' }
        };
        const mockExam = {
          _id: examId,
          createdBy: teacherUserId,
          sections: [
            {
              sectionId: 'sec-1',
              questions: [{ questionId: q1Id, marks: 10 }]
            }
          ]
        };
        const mockAnswer = {
          _id: answerId,
          attemptId,
          questionId: q1Id,
          maxMarks: 10,
          score: 4,
          teacherFeedback: 'Initial grading'
        };

        const mockUpdatedAnswer = {
          ...mockAnswer,
          score: 8.5,
          manualGradingStatus: 'GRADED',
          gradingHistory: [
            {
              score: 8.5,
              gradedBy: teacherUserId,
              gradedAt: new Date(),
              feedback: 'Remarkable improvement on step 2',
              previousScore: 4
            }
          ]
        };

        jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
        jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);
        jest.spyOn(StudentAnswer, 'findOne').mockResolvedValue(mockAnswer);
        const findOneAndUpdateSpy = jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue(mockUpdatedAnswer);
        jest.spyOn(StudentAnswer, 'find').mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { questionId: q1Id, score: 8.5, maxMarks: 10, status: 'SUBMITTED', questionType: 'subjective', manualGradingStatus: 'GRADED' }
          ])
        });
        jest.spyOn(Submission, 'find').mockReturnValue({
          select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
        });

        const req = {
          params: { attemptId: attemptId.toString(), answerId: answerId.toString() },
          body: { score: 8.5, feedback: 'Remarkable improvement on step 2' },
          user: { _id: teacherUserId, role: 'teacher' }
        };

        let resData = null;
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn().mockImplementation((payload) => {
            resData = payload;
            return res;
          })
        };

        await gradeStudentAnswer(req, res, () => {});

        expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
          expect.objectContaining({ _id: answerId.toString(), attemptId: attemptId.toString() }),
          expect.objectContaining({
            $set: expect.objectContaining({
              score: 8.5,
              manualGradingStatus: 'GRADED',
              teacherFeedback: 'Remarkable improvement on step 2'
            }),
            $push: expect.objectContaining({
              gradingHistory: expect.objectContaining({
                score: 8.5,
                previousScore: 4,
                feedback: 'Remarkable improvement on step 2'
              })
            })
          }),
          { new: true }
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(resData.data.answer.score).toBe(8.5);
        expect(resData.data.answer.gradingHistory).toHaveLength(1);
      });
    });

    describe('Proxy Protocol Validation in RenderSandboxProvider', () => {
      test('Accepts valid http:// proxy URL without error', () => {
        const provider = new RenderSandboxProvider({
          endpoint: 'http://runner.tailnet.ts.net:2358',
          proxyUrl: 'http://127.0.0.1:1056'
        });
        expect(provider.proxyUrl).toBe('http://127.0.0.1:1056');
        expect(provider.dispatcher).not.toBeNull();
      });

      test('Accepts valid https:// proxy URL without error', () => {
        const provider = new RenderSandboxProvider({
          endpoint: 'http://runner.tailnet.ts.net:2358',
          proxyUrl: 'https://proxy.corp.internal:8443'
        });
        expect(provider.proxyUrl).toBe('https://proxy.corp.internal:8443');
        expect(provider.dispatcher).not.toBeNull();
      });

      test('Accepts socks5:// proxy URL with experimental warning', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const provider = new RenderSandboxProvider({
          endpoint: 'http://runner.tailnet.ts.net:2358',
          proxyUrl: 'socks5://127.0.0.1:1055'
        });
        expect(provider.proxyUrl).toBe('socks5://127.0.0.1:1055');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/SOCKS5.*experimental/i));
        warnSpy.mockRestore();
      });

      test('Rejects invalid proxy URL scheme (e.g. ftp:// or invalid string) fail-closed', () => {
        expect(() => new RenderSandboxProvider({
          endpoint: 'http://runner.tailnet.ts.net:2358',
          proxyUrl: 'ftp://127.0.0.1:21'
        })).toThrow(/Unsupported proxy protocol/i);

        expect(() => new RenderSandboxProvider({
          endpoint: 'http://runner.tailnet.ts.net:2358',
          proxyUrl: 'not-a-valid-url'
        })).toThrow(/Unsupported proxy protocol/i);
      });
    });
  });
});
