import express from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import {
  joinExamByCode,
  getAttemptState,
  autosaveAnswer,
  runSampleTests,
  submitQuestion,
  finalizeExam,
  recordActivity,
  getMyExamAttempts,
  getAvailableExamsForStudent
} from '../controllers/attempt.controller.js';

const router = express.Router();

// Candidate joins with code & identity (optional auth links logged-in student)
router.post('/join', optionalAuth, joinExamByCode);

// Student authenticated personal history and active tests
router.get('/my/history', requireAuth, getMyExamAttempts);
router.get('/my/available-exams', requireAuth, getAvailableExamsForStudent);

// Attempt session state
router.get('/:attemptId', getAttemptState);

// Autosave draft code
router.post('/:attemptId/save', autosaveAnswer);

// Run sample tests against student code
router.post('/:attemptId/run', runSampleTests);

// Submit code for a question (evaluates against full hidden suite with Zero-Leak)
router.post('/:attemptId/submit-question', submitQuestion);

// Finalize and submit entire exam
router.post('/:attemptId/finalize', finalizeExam);

// Activity and anti-cheat heartbeat
router.post('/:attemptId/activity', recordActivity);

export default router;
