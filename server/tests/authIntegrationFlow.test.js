import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { login, getMe } from '../src/controllers/auth.controller.js';
import { validateLogin } from '../src/validators/auth.validator.js';
import { requireAuth, requireRole } from '../src/middleware/auth.js';

describe('Part B: Critical Authentication Flow Tests', () => {
  const jwtSecret = config.jwt.secret;

  const studentId = new mongoose.Types.ObjectId().toString();
  const teacherId = new mongoose.Types.ObjectId().toString();

  let studentPasswordHash;
  let teacherPasswordHash;

  let studentMockDoc;
  let teacherMockDoc;

  beforeAll(async () => {
    studentPasswordHash = await bcrypt.hash('Student@123', 10);
    teacherPasswordHash = await bcrypt.hash('Teacher@123', 10);

    studentMockDoc = {
      _id: studentId,
      name: 'Alex Rivera',
      email: 'student@testforge.edu',
      passwordHash: studentPasswordHash,
      role: 'student',
      createdAt: new Date(),
      comparePassword: async function (pwd) {
        return bcrypt.compare(pwd, this.passwordHash);
      }
    };

    teacherMockDoc = {
      _id: teacherId,
      name: 'Dr. Sarah Mitchell',
      email: 'teacher@testforge.edu',
      passwordHash: teacherPasswordHash,
      role: 'teacher',
      createdAt: new Date(),
      comparePassword: async function (pwd) {
        return bcrypt.compare(pwd, this.passwordHash);
      }
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createMockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.headers = {};
    res.status = jest.fn().mockImplementation((code) => {
      res.statusCode = code;
      return res;
    });
    res.json = jest.fn().mockImplementation((data) => {
      res.body = data;
      return res;
    });
    res.setHeader = jest.fn().mockImplementation((k, v) => {
      res.headers[k] = v;
    });
    return res;
  };

  // ── Scenario 1: Student login with correct credentials ────────────────────
  test('1. Student login with correct credentials returns 200, JWT token, and student profile', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(studentMockDoc);

    const req = { body: { email: 'student@testforge.edu', password: 'Student@123' } };
    const res = createMockRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user.role).toBe('student');
    expect(res.body.data.user.email).toBe('student@testforge.edu');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');

    // Verify token payload
    const decoded = jwt.verify(res.body.data.token, jwtSecret);
    expect(decoded.id).toBe(studentId);
    expect(decoded.role).toBe('student');
  });

  // ── Scenario 2: Student login with incorrect password ─────────────────────
  test('2. Student login with incorrect password returns 401 Unauthorized', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(studentMockDoc);

    const req = { body: { email: 'student@testforge.edu', password: 'WrongPassword999!' } };
    const res = createMockRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: expect.stringMatching(/Invalid email or password/i)
      })
    );
  });

  // ── Scenario 3: Student login with nonexistent email ──────────────────────
  test('3. Student login with nonexistent email returns 401 Unauthorized', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(null);

    const req = { body: { email: 'unknown.student@testforge.edu', password: 'Student@123' } };
    const res = createMockRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: expect.stringMatching(/Invalid email or password/i)
      })
    );
  });

  // ── Scenario 4: Teacher login with correct credentials ────────────────────
  test('4. Teacher login with correct credentials returns 200, JWT token, and teacher profile', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(teacherMockDoc);

    const req = { body: { email: 'teacher@testforge.edu', password: 'Teacher@123' } };
    const res = createMockRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user.role).toBe('teacher');
    expect(res.body.data.user.email).toBe('teacher@testforge.edu');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');

    // Verify token payload
    const decoded = jwt.verify(res.body.data.token, jwtSecret);
    expect(decoded.id).toBe(teacherId);
    expect(decoded.role).toBe('teacher');
  });

  // ── Scenario 5: Teacher login with incorrect password ─────────────────────
  test('5. Teacher login with incorrect password returns 401 Unauthorized', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(teacherMockDoc);

    const req = { body: { email: 'teacher@testforge.edu', password: 'BadPassword!' } };
    const res = createMockRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: expect.stringMatching(/Invalid email or password/i)
      })
    );
  });

  // ── Scenario 6: Teacher login with nonexistent email ──────────────────────
  test('6. Teacher login with nonexistent email returns 401 Unauthorized', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(null);

    const req = { body: { email: 'unknown.teacher@testforge.edu', password: 'Teacher@123' } };
    const res = createMockRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: expect.stringMatching(/Invalid email or password/i)
      })
    );
  });

  // ── Scenario 7: Missing credentials ───────────────────────────────────────
  test('7. Missing credentials returns 400 Bad Request via validateLogin', () => {
    const next1 = jest.fn();
    validateLogin({ body: { password: 'Pwd' } }, {}, next1);
    expect(next1).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));

    const next2 = jest.fn();
    validateLogin({ body: { email: 'test@example.com' } }, {}, next2);
    expect(next2).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));

    const next3 = jest.fn();
    validateLogin({ body: {} }, {}, next3);
    expect(next3).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  // ── Scenario 8: Invalid JWT ───────────────────────────────────────────────
  test('8. Request with invalid/tampered JWT header returns 401 Unauthorized', async () => {
    const req = { headers: { authorization: 'Bearer invalid.tampered.token' } };
    const res = createMockRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  // ── Scenario 9: Expired JWT ───────────────────────────────────────────────
  test('9. Request with expired JWT returns 401 Unauthorized', async () => {
    const expiredToken = jwt.sign(
      { id: studentId, email: 'student@testforge.edu', role: 'student' },
      jwtSecret,
      { expiresIn: '-1s' }
    );

    const req = { headers: { authorization: `Bearer ${expiredToken}` } };
    const res = createMockRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  // ── Scenario 10: Student accessing teacher-only routes ────────────────────
  test('10. Student attempting to access teacher-only routes is rejected with 403 Forbidden', () => {
    const guard = requireRole('teacher');
    const req = { user: { _id: studentId, email: 'student@testforge.edu', role: 'student' } };
    const res = createMockRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: expect.stringMatching(/Access denied/i)
      })
    );
  });

  // ── Scenario 11: Teacher accessing student-only routes ────────────────────
  test('11. Teacher attempting to access student-only routes is rejected with 403 Forbidden', () => {
    const guard = requireRole('student');
    const req = { user: { _id: teacherId, email: 'teacher@testforge.edu', role: 'teacher' } };
    const res = createMockRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: expect.stringMatching(/Access denied/i)
      })
    );
  });

  // ── Scenario 12: Token persistence after page refresh (Session Restore) ────
  test('12. Token persistence: requireAuth + getMe re-hydrates authenticated user profile', async () => {
    const validToken = jwt.sign(
      { id: studentId, email: 'student@testforge.edu', role: 'student' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    jest.spyOn(User, 'findById').mockReturnValue({
      select: jest.fn().mockResolvedValue(studentMockDoc)
    });

    const req = { headers: { authorization: `Bearer ${validToken}` } };
    const res = createMockRes();
    const next = jest.fn();

    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();

    // Now execute getMe controller
    await getMe(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.email).toBe('student@testforge.edu');
    expect(res.body.data.user.role).toBe('student');
  });

  // ── Scenario 13: Case-insensitive email login and explicit role mapping ───
  test('13. Authenticated response handles case-insensitive email and returns explicit role', async () => {
    jest.spyOn(User, 'findOne').mockImplementation(({ email }) => {
      if (email === 'student@testforge.edu') {
        return Promise.resolve(studentMockDoc);
      }
      return Promise.resolve(null);
    });

    const req = { body: { email: '   Student@TestForge.Edu   ', password: 'Student@123' } };
    const res = createMockRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.role).toBe('student');
    expect(res.body.data.user.email).toBe('student@testforge.edu');
  });

  // ── Scenario 14: Student account logging in with role 'teacher' rejected ──
  test('14. Student account attempting login with role=teacher returns 403 Forbidden', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(studentMockDoc);

    const req = { body: { email: 'student@testforge.edu', password: 'Student@123', role: 'teacher' } };
    const res = createMockRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: 'This account is not registered as faculty.'
      })
    );
  });

  // ── Scenario 15: Teacher account logging in with role=student rejected ────
  test('15. Teacher account attempting login with role=student returns 403 Forbidden', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(teacherMockDoc);

    const req = { body: { email: 'teacher@testforge.edu', password: 'Teacher@123', role: 'student' } };
    const res = createMockRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: 'This account is not registered as a student.'
      })
    );
  });
});
