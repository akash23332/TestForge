import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import supertest from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { Submission } from '../src/models/Submission.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { GradingAuditLog } from '../src/models/GradingAuditLog.js';
import { processExecutionJob, renewExecutionLease, LEASE_OUTCOMES } from '../src/services/queue/executionProcessor.js';
import { recalculateAttemptGrading } from '../src/services/attemptGrading.service.js';
import jwt from 'jsonwebtoken';
import { config } from '../src/config/env.js';

describe('Phase 4Z: Final Backend Security & Distributed Reliability Audit', () => {
  let adminUser;
  let teacherUser;
  let studentUser;
  let adminToken;
  let teacherToken;
  let studentToken;

  beforeEach(() => {
    adminUser = {
      _id: new mongoose.Types.ObjectId(),
      email: 'admin@testforge.internal',
      role: 'admin'
    };
    teacherUser = {
      _id: new mongoose.Types.ObjectId(),
      email: 'teacher@testforge.internal',
      role: 'teacher'
    };
    studentUser = {
      _id: new mongoose.Types.ObjectId(),
      email: 'student@testforge.internal',
      role: 'student'
    };

    adminToken = jwt.sign(
      { id: adminUser._id, email: adminUser.email, role: 'admin' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
    teacherToken = jwt.sign(
      { id: teacherUser._id, email: teacherUser.email, role: 'teacher' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
    studentToken = jwt.sign(
      { id: studentUser._id, email: studentUser.email, role: 'student' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    jest.spyOn(User, 'findById').mockImplementation((id) => {
      const idStr = id?.toString();
      if (idStr === adminUser._id.toString()) return { select: jest.fn().mockResolvedValue(adminUser) };
      if (idStr === teacherUser._id.toString()) return { select: jest.fn().mockResolvedValue(teacherUser) };
      if (idStr === studentUser._id.toString()) return { select: jest.fn().mockResolvedValue(studentUser) };
      return { select: jest.fn().mockResolvedValue(null) };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── 1. Admin Orphan Clearance Endpoint ──────────────────────────────────────
  describe('Admin Orphan Clearance API Security', () => {
    test('Rejects unauthenticated request with 401 Unauthorized', async () => {
      const subId = new mongoose.Types.ObjectId();
      const res = await supertest(app)
        .post(`/api/v1/attempts/admin/submissions/${subId}/clear-orphan`)
        .send({ reason: 'Queue verified drained' });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toMatch(/Authentication token missing/i);
    });

    test('Rejects student caller with 403 Forbidden', async () => {
      const subId = new mongoose.Types.ObjectId();
      const res = await supertest(app)
        .post(`/api/v1/attempts/admin/submissions/${subId}/clear-orphan`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ reason: 'Queue verified drained' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Access denied.*admin/i);
    });

    test('Rejects faculty/teacher caller with 403 Forbidden', async () => {
      const subId = new mongoose.Types.ObjectId();
      const res = await supertest(app)
        .post(`/api/v1/attempts/admin/submissions/${subId}/clear-orphan`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ reason: 'Queue verified drained' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Access denied.*admin/i);
    });

    test('Rejects admin request missing audit reason with 400 Bad Request', async () => {
      const subId = new mongoose.Types.ObjectId();
      const res = await supertest(app)
        .post(`/api/v1/attempts/admin/submissions/${subId}/clear-orphan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/audit reason is required/i);
    });

    test('Admin successfully clears unresolved orphan with audit trail', async () => {
      const subId = new mongoose.Types.ObjectId();
      const mockClearedSub = {
        _id: subId,
        status: 'EXECUTION_UNAVAILABLE',
        remoteExecution: {
          state: 'NOT_CREATED',
          quarantineUntil: null,
          cancellationStatus: 'OPERATOR_CLEARED: Verified queue empty via Sidekiq API'
        }
      };

      const findOneAndUpdateSpy = jest.spyOn(Submission, 'findOneAndUpdate').mockResolvedValue(mockClearedSub);

      const res = await supertest(app)
        .post(`/api/v1/attempts/admin/submissions/${subId}/clear-orphan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Verified queue empty via Sidekiq API' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.submission.remoteExecution.state).toBe('NOT_CREATED');
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: subId.toString(),
          'remoteExecution.state': { $in: ['CANCELLATION_UNCONFIRMED', 'REQUESTING'] }
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            'remoteExecution.state': 'NOT_CREATED',
            'remoteExecution.quarantineUntil': null,
            'remoteExecution.cancellationStatus': expect.stringContaining('OPERATOR_CLEARED')
          })
        }),
        { new: true }
      );
    });
  });

  // ── 2. GradingAuditLog Immutability Hooks ───────────────────────────────────
  describe('GradingAuditLog Append-Only Enforcement', () => {
    test('Rejects updateOne, deleteOne, and findOneAndUpdate queries', async () => {
      await expect(
        GradingAuditLog.updateOne({ _id: new mongoose.Types.ObjectId() }, { $set: { newScore: 10 } })
      ).rejects.toThrow(/Mutating or deleting audit records is strictly forbidden/i);

      await expect(
        GradingAuditLog.deleteOne({ _id: new mongoose.Types.ObjectId() })
      ).rejects.toThrow(/Mutating or deleting audit records is strictly forbidden/i);

      await expect(
        GradingAuditLog.findOneAndUpdate({ _id: new mongoose.Types.ObjectId() }, { $set: { newScore: 10 } })
      ).rejects.toThrow(/Mutating or deleting audit records is strictly forbidden/i);
    });

    test('Rejects mutating an existing audit record via document save()', async () => {
      const doc = new GradingAuditLog({
        answerId: new mongoose.Types.ObjectId(),
        attemptId: new mongoose.Types.ObjectId(),
        examId: new mongoose.Types.ObjectId(),
        graderId: new mongoose.Types.ObjectId(),
        newScore: 8,
        authoritativeMaxMarks: 10,
        gradingVersion: 1
      });

      // Simulate that the document is already saved in MongoDB
      doc.isNew = false;
      await expect(doc.save()).rejects.toThrow(/Mutating existing audit records via save\(\) is strictly forbidden/i);
    });

    test('Rejects update and delete operations in bulkWrite middleware', () => {
      const bulkWriteHooks = GradingAuditLog.schema.s.hooks._pres.get('bulkWrite');
      expect(bulkWriteHooks).toBeDefined();
      const hookFn = bulkWriteHooks[0].fn;
      expect(() => {
        hookFn.call({ operations: [{ updateOne: {} }] });
      }).toThrow(/Mutating or deleting audit records via bulkWrite is strictly forbidden/i);
      expect(() => {
        hookFn.call({ operations: [{ deleteOne: {} }] });
      }).toThrow(/Mutating or deleting audit records via bulkWrite is strictly forbidden/i);
      expect(() => {
        hookFn.call({ operations: [{ deleteMany: {} }] });
      }).toThrow(/Mutating or deleting audit records via bulkWrite is strictly forbidden/i);
    });
  });

  // ── 3. Score Integrity in Attempt Finalization ──────────────────────────────
  describe('Score Integrity: Attempt Finalization with Pending Submissions', () => {
    test('Coding question with unavailable/pending submission and default score 0 marks attempt PROVISIONAL', async () => {
      const attemptId = new mongoose.Types.ObjectId();
      const codingQId = new mongoose.Types.ObjectId();
      const mcqQId = new mongoose.Types.ObjectId();

      const mockAttempt = {
        _id: attemptId,
        status: 'SUBMITTED',
        maxScore: 20,
        save: jest.fn().mockResolvedValue(true)
      };

      const mockAnswers = [
        {
          attemptId,
          questionId: mcqQId,
          questionType: 'mcq',
          score: 10,
          maxMarks: 10,
          status: 'SUBMITTED'
        },
        {
          attemptId,
          questionId: codingQId,
          questionType: 'coding',
          score: 0, // Default score from schema!
          maxMarks: 10,
          status: 'SUBMITTED'
        }
      ];

      // Active submission is EXECUTION_UNAVAILABLE
      const mockPendingSubmissions = [
        {
          questionId: codingQId,
          status: 'EXECUTION_UNAVAILABLE'
        }
      ];

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(mockAttempt);
      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockAnswers)
      });
      jest.spyOn(Submission, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockPendingSubmissions)
        })
      });

      const updatedAttempt = await recalculateAttemptGrading(attemptId);

      expect(updatedAttempt.isProvisional).toBe(true);
      expect(updatedAttempt.gradingStatus).toBe('PROVISIONAL');
      expect(updatedAttempt.percentage).toBeNull();
      expect(updatedAttempt.pendingQuestionsCount).toBe(1);
      expect(updatedAttempt.pendingMaxScore).toBe(10);
      expect(updatedAttempt.totalScore).toBe(10); // Only finalized MCQ marks counted
    });
  });

  // ── 4. Fenced Worker Execution & Write Protection ───────────────────────────
  describe('Fenced Worker Writes in executionProcessor', () => {
    test('Fenced write when question is not found checks executionOwner and executionVersion', async () => {
      const subId = new mongoose.Types.ObjectId();
      const questionId = new mongoose.Types.ObjectId();
      const attemptId = new mongoose.Types.ObjectId();

      const mockSub = {
        _id: subId,
        questionId,
        attemptId,
        status: 'QUEUED',
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      const findOneAndUpdateSpy = jest.spyOn(Submission, 'findOneAndUpdate')
        .mockResolvedValueOnce({
          ...mockSub,
          status: 'RUNNING',
          executionOwner: 'worker-token-xyz',
          executionVersion: 5
        })
        .mockResolvedValueOnce({
          ...mockSub,
          status: 'INTERNAL_ERROR'
        });

      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(null) // Question not found!
      });

      const job = {
        id: `exec_${subId}`,
        data: { submissionId: subId.toString(), attemptId: attemptId.toString(), questionId: questionId.toString() }
      };

      await processExecutionJob(job);

      expect(findOneAndUpdateSpy).toHaveBeenCalledTimes(2);
      expect(findOneAndUpdateSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          _id: subId,
          status: 'RUNNING',
          executionOwner: expect.any(String),
          executionVersion: 5
        }),
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'INTERNAL_ERROR' })
        })
      );
    });

    test('Fenced cancellation update on preemption checks executionOwner and executionVersion', async () => {
      const subId = new mongoose.Types.ObjectId();
      const questionId = new mongoose.Types.ObjectId();
      const attemptId = new mongoose.Types.ObjectId();

      const mockSub = {
        _id: subId,
        questionId,
        attemptId,
        status: 'QUEUED',
        code: 'console.log(1);',
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);

      // Implementation mock: wrong owner returns null
      jest.spyOn(Submission, 'findOneAndUpdate').mockImplementation((query) => {
        if (query.$or && query.$or.some(c => c.status === 'QUEUED')) {
          return Promise.resolve({
            ...mockSub,
            status: 'RUNNING',
            executionOwner: 'worker-token-cancellation',
            executionVersion: 3
          });
        }
        if (query.executionOwner === 'wrong-owner') {
          return Promise.resolve(null);
        }
        return Promise.resolve(mockSub);
      });

      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: questionId, title: 'Q', language: 'javascript' })
      });
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: new mongoose.Types.ObjectId(), input: '1', expectedOutput: '1' }])
      });

      // Force renewExecutionLease to return LOST
      const renewResult = await renewExecutionLease(subId, 'wrong-owner', 60000, 3);
      expect(renewResult.outcome).toBe(LEASE_OUTCOMES.LOST);
    });
  });

  // ── 5. Question Ownership Authorization ────────────────────────────────────
  describe('Question Authorization Guard', () => {
    test('Teacher cannot update another faculty member question (403 Forbidden)', async () => {
      const qId = new mongoose.Types.ObjectId();
      const otherTeacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: qId,
        ownerId: otherTeacherId,
        title: 'Original Q',
        statement: 'Solve'
      };

      jest.spyOn(Question, 'findById').mockResolvedValue(mockQuestion);

      const res = await supertest(app)
        .patch(`/api/v1/questions/${qId}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ title: 'Tampered Title' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/permission to update this question/i);
    });

    test('Teacher cannot delete another faculty member question (403 Forbidden)', async () => {
      const qId = new mongoose.Types.ObjectId();
      const otherTeacherId = new mongoose.Types.ObjectId();

      const mockQuestion = {
        _id: qId,
        ownerId: otherTeacherId,
        title: 'Original Q'
      };

      jest.spyOn(Question, 'findById').mockResolvedValue(mockQuestion);

      const res = await supertest(app)
        .delete(`/api/v1/questions/${qId}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/permission to delete this question/i);
    });
  });
});
