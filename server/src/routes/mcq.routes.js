import { Router } from 'express';
import {
  previewMcq,
  generateMcqBatch,
  saveMcqBatch,
  createSingleMcq,
  getSavedMcqs,
  updateSavedMcq,
  deleteSavedMcq,
  clearSavedMcqs
} from '../controllers/mcq.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// All MCQ Generation & Authoring routes require authenticated faculty/admin role
router.use(requireAuth, requireRole('teacher', 'admin'));

router.post('/preview', previewMcq);
router.post('/generate', generateMcqBatch);
router.post('/save', saveMcqBatch);
router.post('/', createSingleMcq);
router.get('/saved', getSavedMcqs);
router.put('/saved/:id', updateSavedMcq);
router.delete('/saved/:id', deleteSavedMcq);
router.delete('/saved', clearSavedMcqs);

export default router;
