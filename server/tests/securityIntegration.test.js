import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { config } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Question } from '../src/models/Question.js';
import { Exam } from '../src/models/Exam.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { McqQuestion } from '../src/models/McqQuestion.js';
import { TestCase } from '../src/models/TestCase.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { Submission } from '../src/models/Submission.js';

describe('Phase 1.1: Security Remediation & Integration Test Suite', () => {
  const jwtSecret = config.jwt.secret || 'test_secret_for_jwt_tokens_min_32_chars';

  // Identifiers for isolated test actors
  const studentId = new mongoose.Types.ObjectId().toString();
  const teacherAId = new mongoose.Types.ObjectId().toString();
  const teacherBId = new mongoose.Types.ObjectId().toString();
  const adminId = new mongoose.Types.ObjectId().toString();

  const studentUser = {
    _id: studentId,
    name: 'Alice Student',
    email: 'alice@student.edu',
    role: 'student'
  };

  const teacherA = {
    _id: teacherAId,
    name: 'Professor Alpha',
    email: 'alpha@faculty.edu',
    role: 'teacher'
  };

  const teacherB = {
    _id: teacherBId,
    name: 'Professor Beta',
    email: 'beta@faculty.edu',
    role: 'teacher'
  };

  const studentToken = jwt.sign(
    { id: studentId, email: studentUser.email, role: 'student' },
    jwtSecret,
    { expiresIn: '2h' }
  );

  const teacherAToken = jwt.sign(
    { id: teacherAId, email: teacherA.email, role: 'teacher' },
    jwtSecret,
    { expiresIn: '2h' }
  );

  const teacherBToken = jwt.sign(
    { id: teacherBId, email: teacherB.email, role: 'teacher' },
    jwtSecret,
    { expiresIn: '2h' }
  );

  let server;

  beforeAll((done) => {
    server = app.listen(0, '127.0.0.1', done);
  });

  afterAll((done) => {
    if (server) server.close(done);
    else done();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── 1. Priority 1: Registration Security ───────────────────────────────────
  describe('Priority 1: Public Registration Security', () => {
    test('POST /api/v1/auth/register rejects role "teacher" with 400 Bad Request', async () => {
      const res = await request(server)
        .post('/api/v1/auth/register')
        .send({
          name: 'Mallory Malicious',
          email: 'mallory@evil.com',
          password: 'Password123!',
          role: 'teacher'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code', 'BAD_REQUEST');
      expect(res.body.error.message).toMatch(/Registration validation failed/i);
    });

    test('POST /api/v1/auth/register rejects role "admin" with 400 Bad Request', async () => {
      const res = await request(server)
        .post('/api/v1/auth/register')
        .send({
          name: 'Mallory Malicious',
          email: 'admin_escalate@evil.com',
          password: 'Password123!',
          role: 'admin'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code', 'BAD_REQUEST');
    });

    test('POST /api/v1/auth/register successfully creates student account without role field', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValue(null);
      jest.spyOn(User, 'hashPassword').mockResolvedValue('$2a$10$mockedhashedpasswordstring');
      jest.spyOn(User, 'create').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        name: 'Bob Student',
        email: 'bob@student.edu',
        role: 'student',
        createdAt: new Date()
      });

      const res = await request(server)
        .post('/api/v1/auth/register')
        .send({
          name: 'Bob Student',
          email: 'bob@student.edu',
          password: 'Password123!'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user).toHaveProperty('role', 'student');
    });
  });

  // ── 2. Priority 6: RBAC Route Authorization ────────────────────────────────
  describe('Priority 6: Role-Based Endpoint Protection', () => {
    test('POST /api/v1/exams blocks student account with 403 Forbidden', async () => {
      // Mock User.findById for requireAuth middleware
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(studentUser)
      });

      const res = await request(server)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Unauthorized Exam',
          durationMinutes: 60
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Access denied/i);
    });
  });

  // ── 3. Priority 2: Question Zero-Leak Security ──────────────────────────────
  describe('Priority 2: Question Zero-Leak Security', () => {
    const mockQuestion = {
      _id: new mongoose.Types.ObjectId(),
      ownerId: teacherAId,
      title: 'Reverse Linked List',
      statement: 'Given head of singly linked list, reverse it.',
      starterCode: 'function reverseList(head) {}',
      referenceSolution: 'function reverseList(head) { /* TOP SECRET PROPRIETARY SOLUTION */ }',
      constraints: 'N <= 1000',
      difficulty: 'Medium',
      language: 'javascript',
      tags: ['linked-list'],
      examples: [{ input: '[1,2,3]', output: '[3,2,1]', explanation: '' }],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    test('GET /api/v1/questions (anonymous) NEVER leaks referenceSolution in list view', async () => {
      // Mock Question.find().sort().skip().limit().lean()
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockQuestion])
      };
      jest.spyOn(Question, 'find').mockReturnValue(mockQuery);
      jest.spyOn(Question, 'countDocuments').mockResolvedValue(1);

      const res = await request(server).get('/api/v1/questions');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(1);

      const returnedQuestion = res.body.data[0];
      expect(returnedQuestion).toHaveProperty('title', 'Reverse Linked List');
      expect(returnedQuestion).toHaveProperty('statement');
      expect(returnedQuestion.referenceSolution).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('TOP SECRET PROPRIETARY SOLUTION');
    });

    test('GET /api/v1/questions/:id (student) NEVER leaks referenceSolution in detail view', async () => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(studentUser)
      });
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockQuestion)
      });

      const res = await request(server)
        .get(`/api/v1/questions/${mockQuestion._id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('title', 'Reverse Linked List');
      expect(res.body.data.referenceSolution).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('TOP SECRET PROPRIETARY SOLUTION');
    });

    test('GET /api/v1/questions/:id (owner teacher) ALLOWS legitimate referenceSolution access', async () => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(teacherA)
      });
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockQuestion)
      });

      const res = await request(server)
        .get(`/api/v1/questions/${mockQuestion._id}`)
        .set('Authorization', `Bearer ${teacherAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('referenceSolution');
      expect(res.body.data.referenceSolution).toContain('TOP SECRET PROPRIETARY SOLUTION');
    });
  });

  // ── 4. Priority 3 & 4: Attempt Lifecycle & Hidden Test Security ─────────────
  describe('Priority 3 & 4: Attempt Session & Hidden Test Security', () => {
    const attemptId1 = new mongoose.Types.ObjectId().toString();
    const attemptId2 = new mongoose.Types.ObjectId().toString();
    const examId = new mongoose.Types.ObjectId().toString();

    const activeAttempt = {
      _id: attemptId1,
      examId,
      candidateInfo: { email: 'alice@student.edu', name: 'Alice Student' },
      status: 'IN_PROGRESS',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      save: jest.fn().mockResolvedValue(true)
    };

    const submittedAttempt = {
      _id: attemptId1,
      examId,
      candidateInfo: { email: 'alice@student.edu', name: 'Alice Student' },
      status: 'SUBMITTED',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      save: jest.fn().mockResolvedValue(true)
    };

    const scopedTokenAttempt1 = jwt.sign(
      { attemptId: attemptId1, email: 'alice@student.edu', examId, type: 'attempt_session' },
      jwtSecret,
      { expiresIn: '2h' }
    );

    test('Cross-Attempt Access: Token for Attempt 1 is rejected with 403 on Attempt 2', async () => {
      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue({
        _id: attemptId2,
        examId,
        status: 'IN_PROGRESS'
      });

      const res = await request(server)
        .get(`/api/v1/attempts/${attemptId2}`)
        .set('Authorization', `Bearer ${scopedTokenAttempt1}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Credential does not match this attempt session/i);
    });

    test('Lifecycle Guard: POST activity on SUBMITTED attempt is rejected with 400', async () => {
      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(submittedAttempt);

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId1}/activity`)
        .set('Authorization', `Bearer ${scopedTokenAttempt1}`)
        .send({ eventType: 'TAB_SWITCH' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/Cannot modify examination session with status 'SUBMITTED'/i);
    });

    test('Lifecycle Guard: Read-only GET on SUBMITTED attempt remains allowed', async () => {
      const queryObj = Object.assign(Promise.resolve(submittedAttempt), {
        lean: jest.fn().mockResolvedValue(submittedAttempt)
      });
      jest.spyOn(ExamAttempt, 'findById').mockReturnValue(queryObj);
      jest.spyOn(StudentAnswer, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });

      const res = await request(server)
        .get(`/api/v1/attempts/${attemptId1}`)
        .set('Authorization', `Bearer ${scopedTokenAttempt1}`);

      expect(res.status).toBe(200);
      expect(res.body.data.attempt).toHaveProperty('status', 'SUBMITTED');
    });

    test('Hidden Test Security: Never leaks MongoDB _id, input, or expectedOutput for hidden tests', async () => {
      const qId = new mongoose.Types.ObjectId();
      const hiddenTestId = new mongoose.Types.ObjectId();
      const publicTestId = new mongoose.Types.ObjectId();

      jest.spyOn(ExamAttempt, 'findById').mockResolvedValue(activeAttempt);
      jest.spyOn(Exam, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: examId, sections: [] })
      });
      jest.spyOn(Question, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: qId,
          title: 'Palindrome Number',
          language: 'javascript'
        })
      });

      const mockTests = [
        {
          _id: publicTestId,
          questionId: qId,
          category: 'sample',
          visibility: 'public',
          input: '121',
          expectedOutput: 'true'
        },
        {
          _id: hiddenTestId,
          questionId: qId,
          category: 'edge_case',
          visibility: 'hidden',
          input: '-121000',
          expectedOutput: 'false'
        }
      ];

      const subId = new mongoose.Types.ObjectId().toString();
      jest.spyOn(TestCase, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTests)
      });
      jest.spyOn(StudentAnswer, 'findOne').mockResolvedValue(null);
      jest.spyOn(StudentAnswer, 'create').mockResolvedValue({});
      jest.spyOn(Submission, 'findOne').mockImplementation((query) => {
        if (query?.status) {
          // In-flight check
          return { sort: jest.fn().mockResolvedValue(null) };
        }
        return {
          lean: jest.fn().mockResolvedValue({
            _id: subId,
            attemptId: attemptId1,
            questionId: qId,
            runType: 'SUBMISSION',
            status: 'COMPLETED',
            testResults: [
              { testIndex: 1, category: 'standard', visibility: 'public', isHidden: false, passed: true, input: '121', expectedOutput: 'true', actualOutput: 'true' },
              { testIndex: 2, category: 'edge_case', visibility: 'hidden', isHidden: true, passed: true, input: '-121000', expectedOutput: 'false', actualOutput: 'false' }
            ]
          })
        };
      });
      jest.spyOn(Submission, 'create').mockResolvedValue({
        _id: subId,
        attemptId: attemptId1,
        questionId: qId,
        runType: 'SUBMISSION',
        status: 'QUEUED',
        save: jest.fn().mockResolvedValue(true)
      });

      const res = await request(server)
        .post(`/api/v1/attempts/${attemptId1}/submit-question`)
        .set('Authorization', `Bearer ${scopedTokenAttempt1}`)
        .send({
          questionId: qId.toString(),
          code: 'function solution(x) { return x.toString() === x.toString().split("").reverse().join(""); }',
          language: 'javascript'
        });

      // Phase 3 Asynchronous Queue Contract: 202 Accepted
      expect(res.status).toBe(202);
      expect(res.body.data.status).toBe('QUEUED');
      expect(res.body.data.pollUrl).toBe(`/api/v1/attempts/${attemptId1}/submissions/${subId}`);

      // Poll status endpoint to verify Zero-Leak assertions
      const pollRes = await request(server)
        .get(res.body.data.pollUrl)
        .set('Authorization', `Bearer ${scopedTokenAttempt1}`);

      expect(pollRes.status).toBe(200);
      expect(pollRes.body.data).toHaveProperty('testResults');
      const results = pollRes.body.data.testResults;
      expect(results.length).toBe(2);

      const hiddenResult = results.find((r) => r.visibility === 'hidden' || r.isHidden);
      expect(hiddenResult).toBeDefined();
      expect(hiddenResult.testIndex).toBe(2);
      expect(hiddenResult.isHidden).toBe(true);

      // STRICT ZERO-LEAK ASSERTIONS:
      // MongoDB ObjectId of hidden test MUST NOT be exposed
      expect(hiddenResult.testCaseId).toBeUndefined();
      expect(hiddenResult._id).toBeUndefined();
      // Input and expectedOutput MUST NOT be exposed
      expect(hiddenResult.input).toBeUndefined();
      expect(hiddenResult.expectedOutput).toBeUndefined();
      expect(hiddenResult.actualOutput).toBeUndefined();

      // Ensure hidden input data does not exist anywhere in the serialized payload
      expect(JSON.stringify(pollRes.body)).not.toContain('-121000');
    });
  });

  // ── 5. Priority 5: MCQ Ownership Security ──────────────────────────────────
  describe('Priority 5: MCQ Ownership Security', () => {
    const mcqId = new mongoose.Types.ObjectId().toString();
    const mcqOwnedByTeacherB = {
      _id: mcqId,
      ownerId: teacherBId,
      question: 'What is the time complexity of binary search?',
      optionA: 'O(1)',
      optionB: 'O(log n)',
      optionC: 'O(n)',
      optionD: 'O(n^2)',
      correctAnswer: 'B'
    };

    test('Teacher A attempting to modify Teacher B MCQ is rejected with 403 Forbidden', async () => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(teacherA)
      });
      jest.spyOn(McqQuestion, 'findById').mockResolvedValue(mcqOwnedByTeacherB);

      const res = await request(server)
        .put(`/api/v1/mcq/saved/${mcqId}`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          marks: 5
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/You do not have permission to modify this MCQ/i);
    });

    test('Teacher B modifying their own MCQ succeeds with 200', async () => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(teacherB)
      });
      jest.spyOn(McqQuestion, 'findById').mockResolvedValue(mcqOwnedByTeacherB);
      jest.spyOn(McqQuestion, 'findByIdAndUpdate').mockResolvedValue({
        ...mcqOwnedByTeacherB,
        marks: 5
      });

      const res = await request(server)
        .put(`/api/v1/mcq/saved/${mcqId}`)
        .set('Authorization', `Bearer ${teacherBToken}`)
        .send({
          marks: 5
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/MCQ updated successfully/i);
    });
  });

  // ── 6. Priority 6: Exam Cross-Tenant Ownership Security ────────────────────
  describe('Priority 6: Exam Cross-Tenant Access Security', () => {
    const examId = new mongoose.Types.ObjectId().toString();

    test('Teacher A attempting to access Teacher B Exam is rejected with 404/Access Denied', async () => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(teacherA)
      });

      // Exam.findOne with { _id: examId, createdBy: teacherAId } will return null because exam belongs to teacherB
      jest.spyOn(Exam, 'findOne').mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      });

      const res = await request(server)
        .get(`/api/v1/exams/${examId}`)
        .set('Authorization', `Bearer ${teacherAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.message).toMatch(/Exam not found or you do not have permission/i);
    });
  });
});
