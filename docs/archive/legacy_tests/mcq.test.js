import request from 'supertest';
import app from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

describe('MCQ API Endpoints', () => {
  beforeAll(async () => {
    try {
      await connectDatabase();
    } catch (e) {
      // Ignore if db fails in offline test
    }
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  let createdId = null;

  test('POST /api/v1/mcq should create a single MCQ directly in MongoDB', async () => {
    const res = await request(app)
      .post('/api/v1/mcq')
      .send({
        question: 'Which of the following is a balanced Binary Search Tree?',
        optionA: 'AVL Tree',
        optionB: 'Linked List',
        optionC: 'Binary Heap',
        optionD: 'Queue',
        correctAnswer: 'A',
        marks: 2,
        topic: 'Data Structures',
        explanation: 'AVL trees maintain O(log N) height via self-balancing rotations.'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('_id');
    expect(res.body.data.question).toBe('Which of the following is a balanced Binary Search Tree?');
    createdId = res.body.data._id;
  });

  test('GET /api/v1/mcq/saved should return saved MCQs', async () => {
    const res = await request(app).get('/api/v1/mcq/saved');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  test('PUT /api/v1/mcq/saved/:id should update the MCQ', async () => {
    if (!createdId) return;
    const res = await request(app)
      .put(`/api/v1/mcq/saved/${createdId}`)
      .send({
        marks: 4
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.marks).toBe(4);
  });

  test('DELETE /api/v1/mcq/saved/:id should delete the MCQ', async () => {
    if (!createdId) return;
    const res = await request(app).delete(`/api/v1/mcq/saved/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
