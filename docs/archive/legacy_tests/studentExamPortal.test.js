import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Exam } from '../src/models/Exam.js';
import { ExamAttempt } from '../src/models/ExamAttempt.js';
import { StudentAnswer } from '../src/models/StudentAnswer.js';
import { Submission } from '../src/models/Submission.js';
import { ActivityLog } from '../src/models/ActivityLog.js';

describe('Student Examination Portal & Zero-Leak Integrity Tests', () => {
  jest.setTimeout(30000);
  let teacherToken = '';
  let questionId = '';
  let examId = '';
  let examCode = '';
  let attemptId = '';

  beforeAll(async () => {
    await connectDatabase();

    // Authenticate as teacher
    const authRes = await request(app).post('/api/v1/auth/login').send({
      email: 'teacher@testforge.edu',
      password: 'Teacher@123'
    });
    teacherToken = authRes.body.data.token;

    // Fetch existing question to attach to exam
    const qRes = await request(app).get('/api/v1/questions?limit=1');
    if (qRes.body.data && qRes.body.data.length > 0) {
      questionId = qRes.body.data[0]._id;
    }
  });

  afterAll(async () => {
    // Clean up test attempts and exam
    if (examId) {
      await Exam.findByIdAndDelete(examId);
      await ExamAttempt.deleteMany({ examId });
      if (attemptId) {
        await StudentAnswer.deleteMany({ attemptId });
        await Submission.deleteMany({ attemptId });
        await ActivityLog.deleteMany({ attemptId });
      }
    }
    await disconnectDatabase();
  });

  test('1. Teacher publishes new exam with MCQ and Coding questions and gets access code', async () => {
    const res = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: 'Midterm Algorithms & Theory Evaluation',
        durationMinutes: 45,
        sections: [
          {
            name: 'Section A: Algorithmic Concepts (MCQ)',
            questions: [
              {
                type: 'mcq',
                mcqData: {
                  question: 'What is the average time complexity of quicksort?',
                  optionA: 'O(n)',
                  optionB: 'O(n log n)',
                  optionC: 'O(n^2)',
                  optionD: 'O(1)',
                  correctAnswer: 'B',
                  explanation: 'Average case is O(n log n).'
                },
                marks: 5,
                order: 1
              }
            ]
          },
          {
            name: 'Section B: Problem Solving (Coding)',
            questions: [
              {
                type: 'coding',
                questionId,
                marks: 20,
                order: 1
              }
            ]
          }
        ],
        status: 'LIVE'
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('examCode');
    expect(res.body.data.examCode).toMatch(/^TF-[A-F0-9]{6}$/);
    expect(res.body.data.status).toBe('LIVE');
    expect(res.body.data.durationMinutes).toBe(45);
    expect(res.body.data.totalMarks).toBe(25);

    examId = res.body.data._id;
    examCode = res.body.data.examCode;
  });

  test('2. Student joins exam using examCode: Zero-Leak verification for MCQ & Coding', async () => {
    const res = await request(app)
      .post('/api/v1/attempts/join')
      .send({
        examCode,
        candidateInfo: {
          name: 'Sarah Connor',
          email: 'sarah.connor@testforge.edu',
          rollNumber: 'CS-2026-901'
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('attempt');
    expect(res.body.data.attempt.candidateInfo.email).toBe('sarah.connor@testforge.edu');
    expect(res.body.data).toHaveProperty('remainingSeconds');
    expect(res.body.data.remainingSeconds).toBeGreaterThan(0);
    expect(res.body.data).toHaveProperty('questions');
    expect(res.body.data.questions.length).toBe(2);

    // Verify MCQ sanitization
    const mcqQuestion = res.body.data.questions.find((q) => q.type === 'mcq');
    expect(mcqQuestion).toBeDefined();
    expect(mcqQuestion.optionB).toBe('O(n log n)');
    expect(mcqQuestion.correctAnswer).toBeUndefined(); // STRICT ZERO-LEAK

    // Verify Coding sanitization
    const codingQuestion = res.body.data.questions.find((q) => q.type === 'coding');
    expect(codingQuestion).toBeDefined();
    expect(codingQuestion.referenceSolution).toBeUndefined(); // STRICT ZERO-LEAK

    attemptId = res.body.data.attempt._id;
  });

  test('3. Student answers and submits MCQ question', async () => {
    const joinRes = await request(app)
      .post('/api/v1/attempts/join')
      .send({
        examCode,
        candidateInfo: {
          name: 'Sarah Connor',
          email: 'sarah.connor@testforge.edu'
        }
      });

    const mcqQuestion = joinRes.body.data.questions.find((q) => q.type === 'mcq');

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/submit-question`)
      .send({
        questionId: mcqQuestion._id,
        selectedOption: 'B'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.isMcq).toBe(true);
    expect(res.body.data.verdict).toBe('ACCEPTED');
    expect(res.body.data.scoreAwarded).toBe(5);
  });

  test('3. Student autosaves draft code', async () => {
    const studentCode = 'function solution(nums) { return nums.sort(); }';

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/save`)
      .send({
        questionId,
        code: studentCode,
        language: 'javascript',
        isMarkedForReview: false
      });

    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe(studentCode);
    expect(res.body.data.status).toBe('SAVED');
  });

  test('4. Student runs sample tests', async () => {
    const testCode = 'function solution(a) { return a; }';

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/run`)
      .send({
        questionId,
        code: testCode,
        language: 'javascript'
      });

    expect([200, 202]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.data).toHaveProperty('testResults');
      expect(res.body.data).toHaveProperty('passedCount');
      expect(res.body.data).toHaveProperty('totalCount');
    } else {
      expect(res.body.data).toHaveProperty('submissionId');
    }
  });

  test('5. Student submits question code: Zero-Leak hidden suite protection', async () => {
    const studentCode = 'function solution(nums) { return nums; }';

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/submit-question`)
      .send({
        questionId,
        code: studentCode,
        language: 'javascript'
      });

    expect([200, 202]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.data).toHaveProperty('scoreAwarded');
      expect(res.body.data).toHaveProperty('verdict');
      expect(res.body.data).toHaveProperty('testResults');

      // ZERO LEAK: For any hidden test case, input and expectedOutput MUST NOT be leaked
      for (const tr of res.body.data.testResults) {
        if (tr.isHidden) {
          expect(tr.input).toBeUndefined();
          expect(tr.expectedOutput).toBeUndefined();
          expect(tr.actualOutput).toBeUndefined();
        }
      }
    } else {
      expect(res.body.data).toHaveProperty('submissionId');
    }
  });

  test('6. Proctoring logs candidate tab-switch infraction', async () => {
    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/activity`)
      .send({
        eventType: 'TAB_SWITCH',
        details: 'Candidate navigated away from browser tab.'
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('tabSwitchCount');
    expect(res.body.data.tabSwitchCount).toBeGreaterThanOrEqual(1);
  });

  test('7. Student finalizes examination and receives certified score', async () => {
    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/finalize`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUBMITTED');
    expect(res.body.data).toHaveProperty('totalScore');
    expect(res.body.data).toHaveProperty('percentage');
    expect(res.body.data).toHaveProperty('submittedAt');
  });

  test('8. Teacher checks exam analytics and verifies candidate leaderboard', async () => {
    const res = await request(app)
      .get(`/api/v1/exams/${examId}/analytics`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('exam');
    expect(res.body.data.exam.examCode).toBe(examCode);
    expect(res.body.data.attempts).toBeInstanceOf(Array);
    expect(res.body.data.attempts.length).toBeGreaterThanOrEqual(1);

    const candidate = res.body.data.attempts[0];
    expect(candidate.candidateInfo.name).toBe('Sarah Connor');
    expect(candidate.status).toBe('SUBMITTED');
    expect(candidate.tabSwitchCount).toBeGreaterThanOrEqual(1);
  });
});
