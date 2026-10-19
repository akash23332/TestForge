import request from 'supertest';
import app from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

describe('Auth, Question CRUD, and Visibility Boundary Tests', () => {
  let teacherToken = '';
  let createdQuestionId = '';

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  test('POST /api/v1/auth/login should authenticate teacher and return JWT token', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'teacher@testforge.edu',
      password: 'Teacher@123'
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user).toHaveProperty('email', 'teacher@testforge.edu');
    teacherToken = res.body.data.token;
  });

  test('GET /api/v1/auth/me should return current teacher profile', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toHaveProperty('email', 'teacher@testforge.edu');
  });

  test('GET /api/v1/questions should return paginated question list', async () => {
    const res = await request(app).get('/api/v1/questions');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta).toHaveProperty('totalItems');
    createdQuestionId = res.body.data[0]._id;
  });

  test('GET /api/v1/questions/:id/student-view MUST NEVER leak reference solution or hidden tests', async () => {
    const res = await request(app).get(`/api/v1/questions/${createdQuestionId}/student-view`);
    expect(res.status).toBe(200);
    // Strict assertion: referenceSolution MUST NOT exist in student view
    expect(res.body.data).not.toHaveProperty('referenceSolution');
    expect(res.body.data).toHaveProperty('title');
    expect(res.body.data).toHaveProperty('statement');
    expect(res.body.data).toHaveProperty('publicTestCases');
    // Ensure no hidden tests exist in publicTestCases
    const hasHiddenTests = res.body.data.publicTestCases.some((t) => t.visibility === 'hidden');
    expect(hasHiddenTests).toBe(false);
  });

  test('POST /api/v1/mcq-imports/preview should validate rows and flag errors', async () => {
    const res = await request(app)
      .post('/api/v1/mcq-imports/preview')
      .send({
        rows: [
          {
            question: 'What does REST stand for?',
            optionA: 'Representational State Transfer',
            optionB: 'Random Execution State Thread',
            optionC: 'Realtime Echo Socket Test',
            optionD: 'Remote Engine System Tool',
            correctAnswer: 'A',
            marks: 1
          },
          {
            // Invalid row: missing question and invalid answer key 'Z'
            question: '',
            optionA: 'Opt A',
            optionB: 'Opt B',
            optionC: 'Opt C',
            optionD: 'Opt D',
            correctAnswer: 'Z',
            marks: -2
          }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.data.summary.valid).toBe(1);
    expect(res.body.data.summary.invalid).toBe(1);
    expect(res.body.data.rows[1].isValid).toBe(false);
    expect(res.body.data.rows[1].errors.length).toBeGreaterThan(0);
  });
});
