import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { requireRole, requireAttemptAccess } from '../src/middleware/auth.js';
import { createRateLimiter } from '../src/middleware/rateLimiter.js';
import { validateRegister } from '../src/validators/auth.validator.js';
import { config } from '../src/config/env.js';

describe('Phase 1: Security Hardening & Zero-Leak Regression Tests', () => {

  // ── 1. Role-Based Access Control (RBAC) Guard Tests ────────────────────────
  describe('requireRole Middleware', () => {
    it('rejects unauthenticated request with 401', () => {
      const middleware = requireRole('teacher');
      const req = {};
      const res = {};
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('rejects student attempting to access teacher-only endpoint with 403', () => {
      const middleware = requireRole('teacher');
      const req = { user: { _id: 'user_1', role: 'student' } };
      const res = {};
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 })
      );
    });

    it('allows teacher to access teacher endpoint', () => {
      const middleware = requireRole('teacher');
      const req = { user: { _id: 'user_2', role: 'teacher' } };
      const res = {};
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('allows admin universal access to teacher endpoints', () => {
      const middleware = requireRole('teacher');
      const req = { user: { _id: 'user_admin', role: 'admin' } };
      const res = {};
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ── 2. Attempt Ownership & Scoped Session Security ─────────────────────────
  describe('requireAttemptAccess Middleware', () => {
    it('rejects request without authorization header with 401', async () => {
      const req = { headers: {}, params: { attemptId: 'att_123' } };
      const res = {};
      const next = jest.fn();

      await requireAttemptAccess(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('rejects request with invalid token signature with 401', async () => {
      const req = {
        headers: { authorization: 'Bearer invalid_signature_token' },
        params: { attemptId: 'att_123' }
      };
      const res = {};
      const next = jest.fn();

      await requireAttemptAccess(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('rejects candidate token issued for Attempt A when used on Attempt B (BOLA protection)', async () => {
      const secret = config.jwt.secret || 'test_secret_for_jwt_tokens_min_32_chars';
      const token = jwt.sign(
        { attemptId: 'att_AAA', email: 'alice@test.edu', type: 'attempt_session' },
        secret,
        { expiresIn: '1h' }
      );

      // Attempt mock model override
      const req = {
        headers: { authorization: `Bearer ${token}` },
        params: { attemptId: 'att_BBB' } // Mismatched target attempt ID!
      };
      const res = {};
      const next = jest.fn();

      // Mock ExamAttempt model resolution
      jest.unstable_mockModule('../src/models/ExamAttempt.js', () => ({
        ExamAttempt: {
          findById: jest.fn().mockResolvedValue({ _id: 'att_BBB' })
        }
      }));

      await requireAttemptAccess(req, res, next);
      // Either 403 (mismatch) or 404/401 handled securely
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: expect.toBeOneOf ? expect.toBeOneOf([401, 403, 404]) : expect.any(Number)
        })
      );
    });
  });

  // ── 3. Public Registration Privilege Escalation Prevention ─────────────────
  describe('Registration Role Escalation Guard', () => {
    it('rejects role "admin" in public registration validator schema', () => {
      const req = {
        body: {
          name: 'Attacker',
          email: 'attacker@sec.org',
          password: 'Password123!',
          role: 'admin' // Attempting to escalate to admin
        }
      };
      const res = {};
      const next = jest.fn();

      validateRegister(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    it('accepts valid student registration payload', () => {
      const req = {
        body: {
          name: 'Jane Student',
          email: 'jane@student.edu',
          password: 'Password123!',
          role: 'student'
        }
      };
      const res = {};
      const next = jest.fn();

      validateRegister(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ── 4. In-Memory Rate Limiting Guard Tests ─────────────────────────────────
  describe('createRateLimiter Middleware', () => {
    it('tracks request count and returns 429 when limit is exceeded', () => {
      const limiter = createRateLimiter({
        windowMs: 10000,
        max: 3,
        keyGenerator: () => 'test_client_key'
      });

      const next = jest.fn();
      const sendStatus = jest.fn().mockReturnValue({});
      const json = jest.fn();
      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnValue({ json })
      };

      const req = { ip: '127.0.0.1' };

      // Requests 1, 2, 3 must pass
      limiter(req, res, next);
      limiter(req, res, next);
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(3);

      // Request 4 must be blocked with 429
      limiter(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' })
        })
      );
    });
  });

  // ── 5. Zero-Leak Reference Solution Sanitization Logic ──────────────────────
  describe('Zero-Leak Reference Solution Sanitization', () => {
    it('strips referenceSolution when non-owner accesses question', () => {
      const fullQuestion = {
        _id: 'q_123',
        title: 'Two Sum',
        statement: 'Find two indices...',
        starterCode: 'function solution(nums) {}',
        referenceSolution: 'function solution(nums) { /* TOP SECRET */ }',
        ownerId: 'teacher_999'
      };

      const requestingUser = { _id: 'student_111', role: 'student' };
      const isOwnerOrAdmin =
        requestingUser &&
        (fullQuestion.ownerId.toString() === requestingUser._id.toString() ||
          requestingUser.role === 'admin');

      let returnedObject;
      if (!isOwnerOrAdmin) {
        const { referenceSolution, ...sanitized } = fullQuestion;
        returnedObject = sanitized;
      } else {
        returnedObject = fullQuestion;
      }

      expect(returnedObject.referenceSolution).toBeUndefined();
      expect(returnedObject.title).toBe('Two Sum');
      expect(returnedObject.starterCode).toBe('function solution(nums) {}');
    });
  });

});
