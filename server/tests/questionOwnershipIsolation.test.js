import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { jest } from '@jest/globals';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { Question } from '../src/models/Question.js';
import { config } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

jest.setTimeout(30000);

describe('Question Bank Ownership & Privacy Isolation', () => {
  let demoTeacher;
  let demoToken;
  let akashTeacher;
  let akashToken;
  let otherTeacher;
  let otherToken;
  let studentUser;
  let studentToken;

  beforeAll(async () => {
    await connectDatabase();

    // 1. Get or create demo teacher
    demoTeacher = await User.findOne({ email: 'teacher@testforge.edu' });
    if (!demoTeacher) {
      demoTeacher = await User.create({
        name: 'Dr. Sarah Mitchell',
        email: 'teacher@testforge.edu',
        passwordHash: await User.hashPassword('Teacher@123'),
        role: 'teacher'
      });
    }
    demoToken = jwt.sign(
      { id: demoTeacher._id.toString(), email: demoTeacher.email, role: demoTeacher.role },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    // 2. Get or create akash teacher
    akashTeacher = await User.findOne({ email: 'akash3102.beai24@chitkara.edu.in' });
    if (!akashTeacher) {
      akashTeacher = await User.create({
        name: 'Akash Sharma',
        email: 'akash3102.beai24@chitkara.edu.in',
        passwordHash: await User.hashPassword('Akash@123'),
        role: 'teacher'
      });
    }
    akashToken = jwt.sign(
      { id: akashTeacher._id.toString(), email: akashTeacher.email, role: akashTeacher.role },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    // 3. Create a distinct 3rd teacher
    const otherEmail = `test_other_teacher_${Date.now()}@testforge.edu`;
    otherTeacher = await User.create({
      name: 'Professor Other',
      email: otherEmail,
      passwordHash: await User.hashPassword('Other@123'),
      role: 'teacher'
    });
    otherToken = jwt.sign(
      { id: otherTeacher._id.toString(), email: otherTeacher.email, role: otherTeacher.role },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    // 4. Student user
    studentUser = await User.findOne({ email: 'student@testforge.edu' });
    if (!studentUser) {
      studentUser = await User.create({
        name: 'Alex Rivera',
        email: 'student@testforge.edu',
        passwordHash: await User.hashPassword('Student@123'),
        role: 'student'
      });
    }
    studentToken = jwt.sign(
      { id: studentUser._id.toString(), email: studentUser.email, role: studentUser.role },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    if (otherTeacher) {
      await Question.deleteMany({ ownerId: otherTeacher._id });
      await User.findByIdAndDelete(otherTeacher._id);
    }
    await disconnectDatabase();
  });

  test('1. Dummy demo account (teacher@testforge.edu) only sees specific demo/platform questions and NO personal questions from other teachers', async () => {
    const res = await request(app)
      .get('/api/v1/questions?limit=50')
      .set('Authorization', `Bearer ${demoToken}`);

    expect(res.status).toBe(200);
    const questions = res.body.data;
    expect(questions.length).toBeGreaterThan(0);

    // Verify all returned questions are marked as demo or platform
    for (const q of questions) {
      expect(q.isDemo || q.isPlatform).toBe(true);
      // Must NOT include Akash's personal questions
      expect(q.title).not.toBe('Next Greater Element II with Monotonic Stack');
      expect(q.title).not.toBe('Contains Duplicate');
    }
  });

  test('2. Authentic teacher (Akash) sees ONLY their personal questions, and NEVER another teacher\'s personal questions or dummy questions', async () => {
    // Create a private question for otherTeacher
    const otherPrivateQ = await Question.create({
      ownerId: otherTeacher._id,
      title: 'Secret Question by Professor Other',
      statement: 'Secret problem statement',
      language: 'javascript',
      status: 'published',
      isPlatform: false,
      isDemo: false
    });

    const res = await request(app)
      .get('/api/v1/questions?limit=50')
      .set('Authorization', `Bearer ${akashToken}`);

    expect(res.status).toBe(200);
    const questions = res.body.data;
    const titles = questions.map(q => q.title);

    // Must include Akash's personal questions
    expect(titles).toContain('Contains Duplicate');
    expect(titles).toContain('Next Greater Element II with Monotonic Stack');
    expect(questions.length).toBe(2);

    // MUST NOT include dummy questions
    expect(titles).not.toContain('Two Sum');
    expect(titles).not.toContain('Valid Parentheses');

    // MUST NOT include other teacher's personal question
    expect(titles).not.toContain('Secret Question by Professor Other');

    // Cleanup
    await Question.findByIdAndDelete(otherPrivateQ._id);
  });

  test('3. Authenticated teacher questions strictly match their own account ownerId', async () => {
    const res = await request(app)
      .get('/api/v1/questions?limit=50')
      .set('Authorization', `Bearer ${akashToken}`);

    expect(res.status).toBe(200);
    const questions = res.body.data;

    expect(questions.length).toBe(2);
    for (const q of questions) {
      expect(q.ownerId.toString()).toBe(akashTeacher._id.toString());
    }
  });

  test('4. Cross-account access guard: Other teacher cannot GET, PATCH or DELETE a personal question owned by Akash', async () => {
    const akashQ = await Question.findOne({ title: 'Contains Duplicate', ownerId: akashTeacher._id });
    expect(akashQ).not.toBeNull();

    // GET by ID by another teacher -> 403 Forbidden
    const getRes = await request(app)
      .get(`/api/v1/questions/${akashQ._id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(getRes.status).toBe(403);

    // PATCH by another teacher -> 403 Forbidden
    const patchRes = await request(app)
      .patch(`/api/v1/questions/${akashQ._id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Hacked Title' });
    expect(patchRes.status).toBe(403);

    // DELETE by another teacher -> 403 Forbidden
    const deleteRes = await request(app)
      .delete(`/api/v1/questions/${akashQ._id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(deleteRes.status).toBe(403);
  });

  test('5. Students cannot see teachers\' personal questions in discovery', async () => {
    const res = await request(app)
      .get('/api/v1/questions?limit=50')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    const questions = res.body.data;
    const titles = questions.map(q => q.title);

    expect(titles).not.toContain('Next Greater Element II with Monotonic Stack');
    expect(titles).not.toContain('Contains Duplicate');

    for (const q of questions) {
      const dbDoc = await Question.findById(q._id).lean();
      expect(Boolean(dbDoc.isDemo || dbDoc.isPlatform)).toBe(true);
    }
  });
});
