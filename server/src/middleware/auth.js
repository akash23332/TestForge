import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { User } from '../models/User.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Authentication token missing. Please provide a Bearer token.');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw ApiError.unauthorized('Malformed authorization header.');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw ApiError.unauthorized('Authentication token has expired. Please sign in again.');
      }
      throw ApiError.unauthorized('Authentication token is invalid or has been tampered with.');
    }

    const user = await User.findById(decoded.id).select('-passwordHash');

    if (!user) {
      throw ApiError.unauthorized('User associated with token no longer exists.');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional auth middleware for endpoints accessible publicly or anonymously,
 * but still populates req.user if a valid token is provided.
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await User.findById(decoded.id).select('-passwordHash');
      if (user) {
        req.user = user;
      }
    }
  } catch {
    // Ignore invalid token in optional auth
  }
  next();
};

/**
 * Role-Based Access Control (RBAC) Guard.
 * Restricts endpoint to specified roles (e.g. 'teacher', 'admin').
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required to access this resource.'));
    }

    if (req.user.role === 'admin' || allowedRoles.includes(req.user.role)) {
      return next();
    }

    return next(
      ApiError.forbidden(
        `Access denied. Requires one of [${allowedRoles.join(', ')}] permissions, but user has '${req.user.role}'.`
      )
    );
  };
};

/**
 * Attempt Ownership & Security Guard.
 * Validates either:
 * 1. Scoped Attempt-Session Token (signed specifically for this attemptId upon joining).
 * 2. Authenticated Candidate User Token (candidate user account matching attempt).
 * 3. Authenticated Author/Teacher Token (the faculty member who created the exam).
 * 4. System Admin Token.
 */
export const requireAttemptAccess = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Valid attempt session credentials required.');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw ApiError.unauthorized('Malformed authorization header.');
    }

    const attemptId = req.params.attemptId;
    if (!attemptId) {
      throw ApiError.badRequest('Attempt identifier is required.');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch {
      throw ApiError.unauthorized('Session credential expired or invalid. Please re-enter the exam.');
    }

    // Lazy load models to avoid circular dependencies
    const { ExamAttempt } = await import('../models/ExamAttempt.js');
    const { Exam } = await import('../models/Exam.js');

    const attempt = await ExamAttempt.findById(attemptId);
    if (!attempt) {
      throw ApiError.notFound('Exam session not found.');
    }

    let authorized = false;

    // Scenario 1: Scoped Attempt Token (Issued on joinExamByCode)
    if (decoded.attemptId) {
      if (decoded.attemptId.toString() !== attempt._id.toString()) {
        throw ApiError.forbidden('Access denied. Credential does not match this attempt session.');
      }
      req.attempt = attempt;
      req.attemptSession = decoded;
      authorized = true;
    }

    // Scenario 2: Authenticated User Token (Account JWT)
    if (!authorized && decoded.id) {
      const user = await User.findById(decoded.id).select('-passwordHash');
      if (!user) {
        throw ApiError.unauthorized('User associated with credential no longer exists.');
      }
      req.user = user;

      // Admin has universal oversight
      if (user.role === 'admin') {
        req.attempt = attempt;
        authorized = true;
      } else {
        // Teacher ownership: Teacher who created the exam can monitor attempt
        const exam = await Exam.findById(attempt.examId).lean();
        if (user.role === 'teacher' && exam && exam.createdBy && exam.createdBy.toString() === user._id.toString()) {
          req.attempt = attempt;
          req.exam = exam;
          authorized = true;
        } else {
          // Candidate ownership: Logged-in student matching attempt candidate user or email
          const isMatchingUser = attempt.candidateUserId && attempt.candidateUserId.toString() === user._id.toString();
          const isMatchingEmail =
            attempt.candidateInfo?.email &&
            attempt.candidateInfo.email.trim().toLowerCase() === user.email.trim().toLowerCase();

          if (isMatchingUser || isMatchingEmail) {
            req.attempt = attempt;
            authorized = true;
          }
        }
      }

      if (!authorized) {
        throw ApiError.forbidden('Access denied. You do not have permission to view or modify this exam attempt.');
      }
    }

    if (!authorized) {
      throw ApiError.unauthorized('Unrecognized credential format.');
    }

    // ── Attempt Lifecycle Security Guard ──────────────────────────────────────
    // Reject state-changing operations on finalized, submitted, disqualified, or timed-out attempts.
    const isMutatingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (isMutatingMethod) {
      if (attempt.status !== 'IN_PROGRESS') {
        throw ApiError.badRequest(
          `Cannot modify examination session with status '${attempt.status}'. Only active exams can be modified.`
        );
      }

      if (attempt.expiresAt && Date.now() > new Date(attempt.expiresAt).getTime()) {
        attempt.status = 'TIMED_OUT';
        await attempt.save();
        throw ApiError.badRequest('Examination session time has expired. Further submissions are locked.');
      }
    }

    return next();
  } catch (error) {
    next(error);
  }
};

export default {
  requireAuth,
  optionalAuth,
  requireRole,
  requireAttemptAccess
};
