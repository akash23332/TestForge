import { Router } from 'express';
import {
  createQuestion,
  getQuestions,
  getQuestionById,
  getQuestionStudentView,
  updateQuestion,
  deleteQuestion
} from '../controllers/question.controller.js';
import {
  getTestCases,
  createTestCase,
  updateTestCase,
  deleteTestCase,
  validateReferenceSolution,
  validateSingleTestCaseHandler,
  acceptComputedOutputHandler,
  getValidationStatusHandler
} from '../controllers/testCase.controller.js';
import { runMutations } from '../controllers/mutation.controller.js';
import {
  validateCreateQuestion,
  validateListQuestions
} from '../validators/question.validator.js';
import { requireAuth, optionalAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Question Discovery & Management
router.get('/', optionalAuth, validateListQuestions, getQuestions);
router.post('/', requireAuth, requireRole('teacher', 'admin'), validateCreateQuestion, createQuestion);
router.get('/:id', optionalAuth, getQuestionById);
router.get('/:id/student-view', optionalAuth, getQuestionStudentView);
router.patch('/:id', requireAuth, requireRole('teacher', 'admin'), updateQuestion);
router.delete('/:id', requireAuth, requireRole('teacher', 'admin'), deleteQuestion);

// Test Cases & Verification (Strictly Restricted to Authorized Faculty / Admins)
router.get('/:id/tests', requireAuth, requireRole('teacher', 'admin'), getTestCases);
router.post('/:id/tests', requireAuth, requireRole('teacher', 'admin'), createTestCase);
router.patch('/:id/tests/:testId', requireAuth, requireRole('teacher', 'admin'), updateTestCase);
router.delete('/:id/tests/:testId', requireAuth, requireRole('teacher', 'admin'), deleteTestCase);
router.post('/:id/validate', requireAuth, requireRole('teacher', 'admin'), validateReferenceSolution);
router.post('/:id/validate-suite', requireAuth, requireRole('teacher', 'admin'), validateReferenceSolution);
router.post('/:id/tests/:testId/run', requireAuth, requireRole('teacher', 'admin'), validateSingleTestCaseHandler);
router.post('/:id/tests/:testId/accept-computed', requireAuth, requireRole('teacher', 'admin'), acceptComputedOutputHandler);
router.get('/:id/validation-status', requireAuth, requireRole('teacher', 'admin'), getValidationStatusHandler);

// Mutation Testing
router.post('/:id/mutation-runs', requireAuth, requireRole('teacher', 'admin'), runMutations);

export default router;
