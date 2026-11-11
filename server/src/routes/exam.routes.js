import express from 'express';
import { requireAuth } from '../middleware/auth.js';
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

router.use(requireAuth);

router.post('/', createExam);
router.get('/', getTeacherExams);
router.get('/workspace/activity', getWorkspaceActivity);
router.get('/:id', getExamById);
router.put('/:id', updateExam);
router.delete('/:id', deleteExam);
router.get('/:id/analytics', getExamAnalytics);

export default router;
