import { jest } from '@jest/globals';
import http from 'http';
import mongoose from 'mongoose';
import { processExecutionJob, renewExecutionLease, LEASE_OUTCOMES } from '../src/services/queue/executionProcessor.js';
import { reconcileRemoteSubmissions, clearUnresolvedRemoteExecution } from '../src/services/queue/executionRecovery.js';
import { RenderSandboxProvider } from '../src/services/execution/RenderSandboxProvider.js';
import { MockExecutionProvider } from '../src/services/execution/MockExecutionProvider.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import { gradeStudentAnswer } from '../src/controllers/attempt.controller.js';
import { Submission } from '../src/models/Submission.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { Exam } from '../src/models/Exam.js';
import { GradingAuditLog } from '../src/models/GradingAuditLog.js';

describe('Phase 4X: Remote Execution Lifecycle, Cancellation Reconciliation & Concurrent Grading Integrity', () => {
  let mockProvider;

  beforeEach(() => {
    mockProvider = providerRegistry.getProvider('mock');
    mockProvider.reset();
  });

  afterEach(() => {
    mockProvider.reset();
    jest.restoreAllMocks();
  });

  // ── 1. Remote Execution Lifecycle & Token Persistence ─────────────────────
  describe('Remote Execution Lifecycle & Token Persistence', () => {
    test('Persists remote token to Submission immediately upon remote creation callback', async () => {
      const subId = new mongoose.Types.ObjectId();
      const questionId = new mongoose.Types.ObjectId();
      const attemptId = new mongoose.Types.ObjectId();

      const mockSub = {
        _id: subId,
        questionId,
        attemptId,
        status: 'QUEUED',
        code: 'console.log("ok");',
        language: 'javascript',
        maxMarks: 10,
        runType: 'SUBMISSION',
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      const findOneAndUpdateSpy = jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue({
        ...mockSub,
        status: 'RUNNING',
        executionOwner: 'owner-uuid-1'
      });

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(null);
      jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue({});

      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: questionId, title: 'Sample Q', language: 'javascript' })
      });

      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: new mongoose.Types.ObjectId(), input: '1', expectedOutput: '1', category: 'sample', visibility: 'public' }
        ])
      });

      // Provider calls onTokenCreated
      mockProvider.setHandler(async (params) => {
        if (params.onTokenCreated) {
          await params.onTokenCreated('judge0-remote-token-abc');
        }
        return {
          status: 'success',
          output: '1',
          runtimeMs: 15
        };
      });

      const job = {
        id: `exec_${subId}`,
        data: { submissionId: subId.toString(), attemptId: attemptId.toString(), questionId: questionId.toString(), runType: 'SUBMISSION' }
      };

      await processExecutionJob(job);

      // Verify token persistence was called with remoteExecution details
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ _id: subId, status: 'RUNNING' }),
        expect.objectContaining({
          $set: expect.objectContaining({
            'remoteExecution.token': 'judge0-remote-token-abc',
            'remoteExecution.state': 'QUEUED'
          })
        })
      );
    });

    test('Worker crash after remote creation before token persistence: reconciler enforces quarantine', async () => {
      const subId = new mongoose.Types.ObjectId();
      const candidate = {
        _id: subId,
        status: 'EXECUTION_UNAVAILABLE',
        remoteExecution: {
          token: null, // Worker crashed before token saved!
          state: 'REQUESTING',
          requestedAt: new Date(Date.now() - 5000) // Only 5 seconds ago (< 25s quarantine)
        }
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockResolvedValue([candidate])
      });
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue({
        ...candidate,
        status: 'RECOVERING'
      });
      const updateOneSpy = jest.spyOn(Submission, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

      const result = await reconcileRemoteSubmissions({ submissionId: subId });

      expect(result.quarantined).toBe(1);
      expect(result.reconciled).toBe(0);
      expect(updateOneSpy).toHaveBeenCalledWith(
        expect.objectContaining({ _id: subId }),
        expect.objectContaining({
          $set: expect.objectContaining({
            'remoteExecution.state': 'CANCELLATION_UNCONFIRMED'
          })
        })
      );
    });

    test('Worker crash during creation: token is null so queue delay is unbounded; preserves CANCELLATION_UNCONFIRMED fail-closed without timer reset', async () => {
      const subId = new mongoose.Types.ObjectId();
      const candidate = {
        _id: subId,
        status: 'EXECUTION_UNAVAILABLE',
        remoteExecution: {
          token: null,
          state: 'REQUESTING',
          requestedAt: new Date(Date.now() - 30000) // Even after 30s
        }
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockResolvedValue([candidate])
      });
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue({
        ...candidate,
        status: 'RECOVERING'
      });
      const updateOneSpy = jest.spyOn(Submission, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

      const result = await reconcileRemoteSubmissions({ submissionId: subId });

      // Fail-closed: preserved as quarantined / unresolved, never silently reset by timer alone
      expect(result.quarantined).toBe(1);
      expect(result.reconciled).toBe(0);
      expect(updateOneSpy).toHaveBeenCalledWith(
        expect.objectContaining({ _id: subId }),
        expect.objectContaining({
          $set: expect.objectContaining({
            'remoteExecution.state': 'CANCELLATION_UNCONFIRMED',
            'remoteExecution.lastObservedState': 'UNRESOLVED_ORPHAN',
            'remoteExecution.quarantineUntil': null
          })
        })
      );
    });

    test('Operator clearance: clearUnresolvedRemoteExecution explicitly resets unconfirmed orphan after queue drain verification', async () => {
      const subId = new mongoose.Types.ObjectId();
      const findOneAndUpdateSpy = jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue({
        _id: subId,
        remoteExecution: {
          state: 'NOT_CREATED',
          quarantineUntil: null,
          cancellationStatus: 'OPERATOR_CLEARED: Verified queue empty'
        }
      });

      const cleared = await clearUnresolvedRemoteExecution(subId, 'operator-admin-1', 'Verified queue empty');
      expect(cleared.remoteExecution.state).toBe('NOT_CREATED');
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ _id: subId, 'remoteExecution.state': expect.any(Object) }),
        expect.objectContaining({
          $set: expect.objectContaining({
            'remoteExecution.state': 'NOT_CREATED',
            'remoteExecution.quarantineUntil': null
          })
        }),
        expect.any(Object)
      );
    });

    test('Worker claim guard: worker rejects claiming a submission with active quarantine or unresolved remote state', async () => {
      const subId = new mongoose.Types.ObjectId();
      const questionId = new mongoose.Types.ObjectId();
      const attemptId = new mongoose.Types.ObjectId();

      const quarantinedSub = {
        _id: subId,
        questionId,
        attemptId,
        status: 'QUEUED',
        remoteExecution: {
          token: null,
          state: 'CANCELLATION_UNCONFIRMED',
          quarantineUntil: new Date(Date.now() + 15000)
        }
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(quarantinedSub);
      // Atomic claim returns null because remoteExecution is quarantined
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(null);

      const job = {
        id: `exec_${subId}`,
        data: { submissionId: subId.toString(), attemptId: attemptId.toString(), questionId: questionId.toString() }
      };

      const claimResult = await processExecutionJob(job);
      expect(claimResult.alreadyClaimed).toBe(true);
      expect(claimResult.quarantined).toBe(true);
      expect(claimResult.message).toMatch(/quarantine or unresolved remote execution/i);
    });

    test('Reconciler retrieves completed remote execution result without losing work', async () => {
      const subId = new mongoose.Types.ObjectId();
      const candidate = {
        _id: subId,
        status: 'EXECUTION_UNAVAILABLE',
        remoteExecution: {
          token: 'token-finished-123',
          state: 'PROCESSING',
          requestedAt: new Date(Date.now() - 10000)
        }
      };

      const mockProviderWithRemote = {
        name: 'judge0',
        getSubmission: jest.fn().mockResolvedValue({
          token: 'token-finished-123',
          status: 'success',
          output: 'correct_result',
          runtimeMs: 25,
          exists: true
        })
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockResolvedValue([candidate])
      });
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue({
        ...candidate,
        status: 'RECOVERING'
      });
      const updateOneSpy = jest.spyOn(Submission, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

      const result = await reconcileRemoteSubmissions({ submissionId: subId, provider: mockProviderWithRemote });

      expect(result.reconciled).toBe(1);
      expect(mockProviderWithRemote.getSubmission).toHaveBeenCalledWith('token-finished-123');
      expect(updateOneSpy).toHaveBeenCalledWith(
        expect.objectContaining({ _id: subId }),
        expect.objectContaining({
          $set: expect.objectContaining({
            'remoteExecution.state': 'COMPLETED'
          })
        })
      );
    });

    test('Reconciler marks remote submission NOT_FOUND when deleted or evicted from Judge0', async () => {
      const subId = new mongoose.Types.ObjectId();
      const candidate = {
        _id: subId,
        status: 'EXECUTION_UNAVAILABLE',
        remoteExecution: {
          token: 'token-evicted-404',
          state: 'QUEUED'
        }
      };

      const mockProviderWith404 = {
        name: 'judge0',
        getSubmission: jest.fn().mockResolvedValue({
          token: 'token-evicted-404',
          status: 'not_found',
          exists: false
        })
      };

      jest.spyOn(Submission, 'find').mockReturnValue({
        limit: jest.fn().mockResolvedValue([candidate])
      });
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue({
        ...candidate,
        status: 'RECOVERING'
      });
      const updateOneSpy = jest.spyOn(Submission, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

      const result = await reconcileRemoteSubmissions({ submissionId: subId, provider: mockProviderWith404 });

      expect(result.reconciled).toBe(1);
      expect(updateOneSpy).toHaveBeenCalledWith(
        expect.objectContaining({ _id: subId }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'EXECUTION_UNAVAILABLE',
            'remoteExecution.state': 'NOT_FOUND'
          })
        })
      );
    });
  });

  // ── 2. Judge0 Cancellation Semantics & Limitations ────────────────────────
  describe('Judge0 Cancellation Semantics & Limitations', () => {
    test('cancelSubmission notes that DB row is deleted but isolate process cannot be killed via API', async () => {
      const provider = new RenderSandboxProvider({
        endpoint: 'http://localhost:2358',
        apiKey: 'token'
      });

      // Mock fetch DELETE /submissions/:token returning 204 No Content
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        status: 204,
        ok: true
      });

      const cancelResult = await provider.cancelSubmission('test-token-uuid');
      global.fetch = originalFetch;

      expect(cancelResult.success).toBe(true);
      expect(cancelResult.cancellationStatus).toBe('DELETED_FROM_QUEUE_WALL_TIME_UNCONFIRMED');
      expect(cancelResult.isolateProcessKilled).toBe(false);
      expect(cancelResult.wallTimeEnforced).toBe(false);
    });

    test('cancelSubmission returns NOT_FOUND if submission does not exist', async () => {
      const provider = new RenderSandboxProvider({
        endpoint: 'http://localhost:2358',
        apiKey: 'token'
      });

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        status: 404,
        ok: false
      });

      const cancelResult = await provider.cancelSubmission('nonexistent-token');
      global.fetch = originalFetch;

      expect(cancelResult.success).toBe(false);
      expect(cancelResult.cancellationStatus).toBe('NOT_FOUND');
    });

    test('cancelSubmission fails closed when proxy is required but missing', async () => {
      const provider = new RenderSandboxProvider({
        endpoint: 'http://runner.tailnet.ts.net:2358',
        requireProxy: true
      });

      await expect(provider.cancelSubmission('token-123')).rejects.toThrow(/Private endpoint requires an active proxy/i);
    });
  });

  // ── 3. Execution Lease Failure Semantics & Fencing ─────────────────────────
  describe('Execution Lease Failure Semantics & Fencing', () => {
    test('renewExecutionLease times out and returns LEASE_UNVERIFIED when MongoDB query hangs', async () => {
      const subId = new mongoose.Types.ObjectId();
      const owner = 'owner-test-1';

      // Mock a hanging findOneAndUpdate that never resolves
      jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation(() => new Promise(() => {}));

      // Bounded renewal with 50ms timeout
      const result = await renewExecutionLease(subId, owner, 60000, 1, 50);
      expect(result.renewed).toBe(false);
      expect(result.outcome).toBe(LEASE_OUTCOMES.UNVERIFIED);
      expect(result.reason).toMatch(/timeout/i);
    });

    test('renewExecutionLease returns LEASE_RENEWAL_ERROR when mongoose is disconnected', async () => {
      const subId = new mongoose.Types.ObjectId();
      const origState = mongoose.connection.readyState;
      mongoose.connection.readyState = 0; // Disconnected

      const result = await renewExecutionLease(subId, 'owner-test', 60000);
      expect(result.renewed).toBe(false);
      expect(result.outcome).toBe(LEASE_OUTCOMES.ERROR);
      expect(result.reason).toMatch(/disconnected/i);

      mongoose.connection.readyState = origState;
    });

    test('renewExecutionLease returns LEASE_LOST when document not found or owner mismatch', async () => {
      const subId = new mongoose.Types.ObjectId();
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(null);

      const result = await renewExecutionLease(subId, 'stale-owner', 60000, 1);
      expect(result.renewed).toBe(false);
      expect(result.outcome).toBe(LEASE_OUTCOMES.LOST);
    });

    test('renewExecutionLease returns LEASE_RENEWED with updated expiresAt upon success', async () => {
      const subId = new mongoose.Types.ObjectId();
      const owner = 'active-owner-123';
      const mockDoc = { _id: subId, status: 'RUNNING', executionOwner: owner };
      jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockDoc);

      const result = await renewExecutionLease(subId, owner, 60000, 2);
      expect(result.renewed).toBe(true);
      expect(result.outcome).toBe(LEASE_OUTCOMES.RENEWED);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    test('Old worker resuming after lease expiry is preempted and cannot persist results', async () => {
      const subId = new mongoose.Types.ObjectId();
      const questionId = new mongoose.Types.ObjectId();
      const attemptId = new mongoose.Types.ObjectId();

      const mockSub = {
        _id: subId,
        questionId,
        attemptId,
        status: 'QUEUED',
        code: 'function test() { return 1; }',
        language: 'javascript',
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);

      // Implementation-aware mock: claim succeeds, token persist succeeds, final completion query returns null
      jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation((query) => {
        if (query.$or && query.$or.some(c => c.status === 'QUEUED')) {
          return Promise.resolve({
            ...mockSub,
            status: 'RUNNING',
            executionOwner: 'owner-original',
            executionVersion: 1
          });
        }
        if (query['remoteExecution.token']) {
          return Promise.resolve(mockSub);
        }
        // Final completion query: simulate preemption
        return Promise.resolve(null);
      });

      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: questionId, title: 'Sample Q', language: 'javascript' })
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: new mongoose.Types.ObjectId(), input: '1', expectedOutput: '1', category: 'sample', visibility: 'public' }
        ])
      });

      const studentAnswerSpy = jest.spyOn(StudentAnswer, 'findOneAndUpdate');

      const job = {
        id: `exec_${subId}`,
        data: { submissionId: subId.toString(), attemptId: attemptId.toString(), questionId: questionId.toString() }
      };

      const result = await processExecutionJob(job);

      expect(result.status).toBe('STALE_PREEMPTED');
      // Must not write marks to StudentAnswer!
      expect(studentAnswerSpy).not.toHaveBeenCalled();
    });
  });

  // ── 4. Manual Grading Concurrency, RBAC & Audit Immutability ──────────────
  describe('Manual Grading Concurrency, RBAC & Audit Immutability', () => {
    let examId;
    let attemptId;
    let answerId;
    let q1Id;
    let teacherUserId;

    beforeEach(() => {
      examId = new mongoose.Types.ObjectId();
      attemptId = new mongoose.Types.ObjectId();
      answerId = new mongoose.Types.ObjectId();
      q1Id = new mongoose.Types.ObjectId();
      teacherUserId = new mongoose.Types.ObjectId();
    });

    test('Rejects grading if attempt session is still IN_PROGRESS with 400', async () => {
      const mockAttempt = {
        _id: attemptId,
        examId,
        studentId: new mongoose.Types.ObjectId(),
        status: 'IN_PROGRESS', // IN_PROGRESS cannot be graded yet
        candidateInfo: { email: 'student@example.com' }
      };
      const mockExam = {
        _id: examId,
        createdBy: teacherUserId,
        sections: [{ sectionId: 's1', questions: [{ questionId: q1Id, marks: 10 }] }]
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);

      const req = {
        params: { attemptId: attemptId.toString(), answerId: answerId.toString() },
        body: { score: 8, feedback: 'Done' },
        user: { _id: teacherUserId, role: 'teacher' }
      };

      let capturedError = null;
      await gradeStudentAnswer(req, {}, (err) => { capturedError = err; });

      expect(capturedError).toBeDefined();
      expect(capturedError.statusCode).toBe(400);
      expect(capturedError.message).toMatch(/Attempt session is still in progress/i);
    });

    test('Regrading an already graded answer requires explicit regradeReason', async () => {
      const mockAttempt = {
        _id: attemptId,
        examId,
        studentId: new mongoose.Types.ObjectId(),
        status: 'SUBMITTED',
        candidateInfo: { email: 'student@example.com' }
      };
      const mockExam = {
        _id: examId,
        createdBy: teacherUserId,
        sections: [{ sectionId: 's1', questions: [{ questionId: q1Id, marks: 10 }] }]
      };
      const mockAnswer = {
        _id: answerId,
        attemptId,
        questionId: q1Id,
        maxMarks: 10,
        score: 5,
        manualGradingStatus: 'GRADED', // Already graded!
        teacherFeedback: 'Initial'
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);
      jest.spyOn(StudentAnswer, 'findOne').mockResolvedValue(mockAnswer);

      const req = {
        params: { attemptId: attemptId.toString(), answerId: answerId.toString() },
        body: { score: 8, feedback: 'Updated mark' }, // Missing regradeReason!
        user: { _id: teacherUserId, role: 'teacher' }
      };

      let capturedError = null;
      await gradeStudentAnswer(req, {}, (err) => { capturedError = err; });

      expect(capturedError).toBeDefined();
      expect(capturedError.statusCode).toBe(400);
      expect(capturedError.message).toMatch(/regradeReason is required/i);
    });

    test('Duplicate grading request with identical score and feedback returns without duplicate audit entry', async () => {
      const mockAttempt = {
        _id: attemptId,
        examId,
        studentId: new mongoose.Types.ObjectId(),
        status: 'SUBMITTED',
        candidateInfo: { email: 'student@example.com' }
      };
      const mockExam = {
        _id: examId,
        createdBy: teacherUserId,
        sections: [{ sectionId: 's1', questions: [{ questionId: q1Id, marks: 10 }] }]
      };
      const mockAnswer = {
        _id: answerId,
        attemptId,
        questionId: q1Id,
        maxMarks: 10,
        score: 8,
        manualGradingStatus: 'GRADED',
        teacherFeedback: 'Good reasoning'
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);
      jest.spyOn(StudentAnswer, 'findOne').mockResolvedValue(mockAnswer);
      const auditCreateSpy = jest.spyOn(GradingAuditLog, 'create');

      const req = {
        params: { attemptId: attemptId.toString(), answerId: answerId.toString() },
        body: { score: 8, feedback: 'Good reasoning', regradeReason: 'Resubmitted identical' },
        user: { _id: teacherUserId, role: 'teacher' }
      };

      let resPayload = null;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockImplementation((d) => { resPayload = d; return res; })
      };

      await gradeStudentAnswer(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(200);
      expect(resPayload.message).toMatch(/Duplicate grading request ignored/i);
      expect(auditCreateSpy).not.toHaveBeenCalled();
    });

    test('Concurrent grading race condition detected via gradingVersion: returns 409 Conflict', async () => {
      const mockAttempt = {
        _id: attemptId,
        examId,
        studentId: new mongoose.Types.ObjectId(),
        status: 'SUBMITTED',
        candidateInfo: { email: 'student@example.com' }
      };
      const mockExam = {
        _id: examId,
        createdBy: teacherUserId,
        sections: [{ sectionId: 's1', questions: [{ questionId: q1Id, marks: 10 }] }]
      };
      const mockAnswer = {
        _id: answerId,
        attemptId,
        questionId: q1Id,
        maxMarks: 10,
        score: 0,
        gradingVersion: 1, // Current version is 1
        manualGradingStatus: 'PENDING'
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);
      jest.spyOn(StudentAnswer, 'findOne').mockResolvedValue(mockAnswer);

      // findOneAndUpdate returns null because another request modified gradingVersion to 2
      jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue(null);

      const req = {
        params: { attemptId: attemptId.toString(), answerId: answerId.toString() },
        body: { score: 9, feedback: 'Great job' },
        user: { _id: teacherUserId, role: 'teacher' }
      };

      let capturedError = null;
      await gradeStudentAnswer(req, {}, (err) => { capturedError = err; });

      expect(capturedError).toBeDefined();
      expect(capturedError.statusCode).toBe(409);
      expect(capturedError.message).toMatch(/Grading conflict/i);
    });

    test('Creates an immutable GradingAuditLog entry upon successful grade and regrade', async () => {
      const mockAttempt = {
        _id: attemptId,
        examId,
        studentId: new mongoose.Types.ObjectId(),
        status: 'SUBMITTED',
        candidateInfo: { email: 'student@example.com' }
      };
      const mockExam = {
        _id: examId,
        createdBy: teacherUserId,
        sections: [{ sectionId: 's1', questions: [{ questionId: q1Id, marks: 10 }] }]
      };
      const mockAnswer = {
        _id: answerId,
        attemptId,
        questionId: q1Id,
        maxMarks: 10,
        score: 0,
        gradingVersion: 1,
        manualGradingStatus: 'PENDING'
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue({
        ...mockAttempt,
        totalScore: 8.5,
        maxScore: 10,
        percentage: 85,
        isProvisional: false,
        gradingStatus: 'FINALIZED',
        save: jest.fn().mockResolvedValue(true)
      });
      jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);
      jest.spyOn(StudentAnswer, 'findOne').mockResolvedValue(mockAnswer);
      jest.spyOn(StudentAnswer, 'findOneAndUpdate').mockResolvedValue({
        ...mockAnswer,
        score: 8.5,
        gradingVersion: 2,
        manualGradingStatus: 'GRADED'
      });
      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { questionId: q1Id, score: 8.5, maxMarks: 10, status: 'SUBMITTED', questionType: 'subjective', manualGradingStatus: 'GRADED' }
        ])
      });
      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
      });

      const auditCreateSpy = jest.spyOn(GradingAuditLog, 'create').mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

      const req = {
        params: { attemptId: attemptId.toString(), answerId: answerId.toString() },
        body: { score: 8.5, feedback: 'Excellent step-by-step clarity.' },
        user: { _id: teacherUserId, role: 'teacher' },
        ip: '192.168.1.100',
        get: jest.fn().mockReturnValue('Mozilla/5.0 JestTest')
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      await gradeStudentAnswer(req, res, () => {});

      expect(auditCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          answerId,
          attemptId,
          examId,
          graderId: teacherUserId,
          previousScore: 0,
          newScore: 8.5,
          scoreDelta: 8.5,
          authoritativeMaxMarks: 10,
          gradingVersion: 2,
          isRegrade: false
        })
      );
    });

    test('Transactional grading integrity: 2-phase compensating rollback restores previous answer state if audit log fails', async () => {
      const mockAttempt = {
        _id: attemptId,
        examId,
        studentId: new mongoose.Types.ObjectId(),
        status: 'SUBMITTED',
        candidateInfo: { email: 'student@example.com' }
      };
      const mockExam = {
        _id: examId,
        createdBy: teacherUserId,
        sections: [{ sectionId: 's1', questions: [{ questionId: q1Id, marks: 10 }] }]
      };
      const mockAnswer = {
        _id: answerId,
        attemptId,
        questionId: q1Id,
        maxMarks: 10,
        score: 4,
        gradingVersion: 1,
        manualGradingStatus: 'GRADED'
      };

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(Exam, 'findById').mockResolvedValue(mockExam);
      jest.spyOn(StudentAnswer, 'findOne').mockResolvedValue(mockAnswer);

      const findOneAndUpdateSpy = jest.spyOn(StudentAnswer, 'findOneAndUpdate')
        .mockResolvedValueOnce({
          ...mockAnswer,
          score: 8,
          gradingVersion: 2,
          manualGradingStatus: 'GRADED'
        })
        .mockResolvedValueOnce({
          ...mockAnswer,
          score: 4,
          gradingVersion: 1
        });

      // Audit log creation fails (e.g. disk full / database constraint)
      jest.spyOn(GradingAuditLog, 'create').mockRejectedValue(new Error('Audit collection write failure'));

      const req = {
        params: { attemptId: attemptId.toString(), answerId: answerId.toString() },
        body: { score: 8, feedback: 'Updated feedback', regradeReason: 'Regrading question' },
        user: { _id: teacherUserId, role: 'teacher' }
      };

      let capturedErr = null;
      await gradeStudentAnswer(req, {}, (err) => { capturedErr = err; });

      expect(capturedErr).toBeDefined();
      expect(capturedErr.statusCode).toBe(500);
      expect(capturedErr.message).toMatch(/rolled back to maintain audit trail integrity/i);

      // Verify the compensating rollback was called
      expect(findOneAndUpdateSpy).toHaveBeenCalledTimes(2);
      expect(findOneAndUpdateSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ _id: answerId.toString(), attemptId: attemptId.toString(), gradingVersion: 2 }),
        expect.objectContaining({
          $set: expect.objectContaining({ score: 4 }),
          $inc: { gradingVersion: -1 }
        })
      );
    });

    test('Strict append-only immutability hooks on GradingAuditLog block updates and deletions', async () => {
      // Test updateOne rejects
      await expect(
        GradingAuditLog.updateOne({ _id: new mongoose.Types.ObjectId() }, { $set: { newScore: 10 } })
      ).rejects.toThrow(/Mutating or deleting audit records is strictly forbidden/i);

      // Test deleteMany rejects
      await expect(
        GradingAuditLog.deleteMany({})
      ).rejects.toThrow(/Mutating or deleting audit records is strictly forbidden/i);

      // Test findOneAndUpdate rejects
      await expect(
        GradingAuditLog.findOneAndUpdate({ _id: new mongoose.Types.ObjectId() }, { $set: { newScore: 10 } })
      ).rejects.toThrow(/Mutating or deleting audit records is strictly forbidden/i);
    });
  });

  // ── 5. Proxy Dispatcher & Private Route Testing ───────────────────────────
  describe('Proxy Dispatcher & Private Route Verification', () => {
    const origFetch = global.fetch;

    afterEach(() => {
      global.fetch = origFetch;
    });

    test('RenderSandboxProvider dispatches HTTP requests via the configured ProxyAgent dispatcher', async () => {
      const provider = new RenderSandboxProvider({
        endpoint: 'http://runner.tailnet.ts.net:2358',
        proxyUrl: 'http://127.0.0.1:1056',
        requireProxy: true,
        apiKey: 'proxy-test-token',
        providerType: 'judge0'
      });

      expect(provider.dispatcher).not.toBeNull();

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: { id: 3, description: 'Accepted' },
          stdout: '1\n'
        })
      });

      const result = await provider.executeCode({
        language: 'javascript',
        code: 'console.log(1);',
        inputArgs: []
      });

      expect(result.status).toBe('success');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const fetchOpts = global.fetch.mock.calls[0][1];
      expect(fetchOpts.dispatcher).toBe(provider.dispatcher);
      expect(fetchOpts.headers['X-Auth-Token']).toBe('proxy-test-token');
    });

    test('Cancellation requests route through the configured proxy dispatcher and private route', async () => {
      const provider = new RenderSandboxProvider({
        endpoint: 'http://runner.tailnet.ts.net:2358',
        proxyUrl: 'http://127.0.0.1:1056',
        requireProxy: true,
        apiKey: 'proxy-test-token'
      });

      global.fetch = jest.fn().mockResolvedValue({
        status: 204,
        ok: true
      });

      const cancelResult = await provider.cancelSubmission('cancel-token-123');

      expect(cancelResult.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [calledUrl, fetchOpts] = global.fetch.mock.calls[0];
      expect(calledUrl).toContain('cancel-token-123');
      expect(fetchOpts.method).toBe('DELETE');
      expect(fetchOpts.dispatcher).toBe(provider.dispatcher);
      expect(fetchOpts.headers['X-Auth-Token']).toBe('proxy-test-token');
    });

    test('Private endpoint execution strictly fails closed if proxy is missing (no public fallback)', async () => {
      const provider = new RenderSandboxProvider({
        endpoint: 'http://runner.tailnet.ts.net:2358',
        requireProxy: true
      });

      await expect(provider.executeCode({
        language: 'javascript',
        code: '1',
        inputArgs: []
      })).rejects.toThrow(/Private endpoint requires an active proxy/i);
    });
  });
});
