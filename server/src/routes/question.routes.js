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
  validateReferenceSolution
} from '../controllers/testCase.controller.js';
import { runMutations } from '../controllers/mutation.controller.js';
import {
  validateCreateQuestion,
  validateListQuestions
} from '../validators/question.validator.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

// Question CRUD
router.get('/', optionalAuth, validateListQuestions, getQuestions);
router.post('/', optionalAuth, validateCreateQuestion, createQuestion);
router.get('/:id', optionalAuth, getQuestionById);
router.get('/:id/student-view', optionalAuth, getQuestionStudentView);
router.patch('/:id', optionalAuth, updateQuestion);
router.delete('/:id', optionalAuth, deleteQuestion);

// Test Cases & Verification
router.get('/:id/tests', optionalAuth, getTestCases);
router.post('/:id/tests', optionalAuth, createTestCase);
router.patch('/:id/tests/:testId', optionalAuth, updateTestCase);
router.delete('/:id/tests/:testId', optionalAuth, deleteTestCase);
router.post('/:id/validate', optionalAuth, validateReferenceSolution);

// Mutation Testing
router.post('/:id/mutation-runs', optionalAuth, runMutations);

export default router;
