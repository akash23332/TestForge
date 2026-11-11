import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  createExam,
  getTeacherExams,
  getExamById,
  updateExam,
  deleteExam,
  getExamAnalytics,
  getWorkspaceActivity
} from '../controllers/exam.controller.js';

const router = express.Router();

// All exam management endpoints require authenticated teacher or admin role
router.use(requireAuth, requireRole('teacher', 'admin'));

router.post('/', createExam);
router.get('/', getTeacherExams);
router.get('/workspace/activity', getWorkspaceActivity);
router.get('/:id', getExamById);
router.put('/:id', updateExam);
router.delete('/:id', deleteExam);
router.get('/:id/analytics', getExamAnalytics);

export default router;
