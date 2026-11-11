import express from 'express';
import { requireAuth, optionalAuth, requireAttemptAccess, requireRole } from '../middleware/auth.js';
import {
  executionRateLimiter,
  submissionRateLimiter,
  authRateLimiter
} from '../middleware/rateLimiter.js';
import {
  joinExamByCode,
  getAttemptState,
  autosaveAnswer,
  runSampleTests,
  submitQuestion,
  getSubmissionStatus,
  finalizeExam,
  recordActivity,
  getMyExamAttempts,
  getAvailableExamsForStudent,
  getStudentAnalytics,
  getStudentNotifications,
  markNotificationRead,
  gradeStudentAnswer,
  clearOrphanSubmission
} from '../controllers/attempt.controller.js';

const router = express.Router();

// Candidate joins with code & identity (optional auth links logged-in student)
router.post('/join', optionalAuth, authRateLimiter, joinExamByCode);

// Student authenticated personal history and active tests
router.get('/my/history', requireAuth, getMyExamAttempts);
router.get('/my/available-exams', requireAuth, getAvailableExamsForStudent);
router.get('/my/analytics', requireAuth, getStudentAnalytics);
router.get('/my/notifications', requireAuth, getStudentNotifications);
router.post('/my/notifications/:id/read', requireAuth, markNotificationRead);

// Administrative clearance for orphaned unconfirmed submissions (Admin only)
router.post('/admin/submissions/:submissionId/clear-orphan', requireAuth, requireRole('admin'), clearOrphanSubmission);

// Attempt session state (Protected by Attempt Ownership Guard)
router.get('/:attemptId', requireAttemptAccess, getAttemptState);

// Autosave draft code (Protected by Attempt Ownership Guard)
router.post('/:attemptId/save', requireAttemptAccess, autosaveAnswer);

// Run sample tests against student code (Protected & Rate Limited)
router.post('/:attemptId/run', requireAttemptAccess, executionRateLimiter, runSampleTests);

// Submit code for a question (Protected & Rate Limited)
router.post('/:attemptId/submit-question', requireAttemptAccess, submissionRateLimiter, submitQuestion);

// Poll submission execution status and results (Protected by Attempt Ownership Guard)
router.get('/:attemptId/submissions/:submissionId', requireAttemptAccess, getSubmissionStatus);

// Finalize and submit entire exam (Protected by Attempt Ownership Guard)
router.post('/:attemptId/finalize', requireAttemptAccess, finalizeExam);

// Activity and anti-cheat heartbeat (Protected by Attempt Ownership Guard)
router.post('/:attemptId/activity', requireAttemptAccess, recordActivity);

// Teacher/Admin manual grading of subjective question
router.post('/:attemptId/answers/:answerId/grade', requireAuth, requireRole('teacher', 'admin'), gradeStudentAnswer);

export default router;
