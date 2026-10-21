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
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

router.post('/preview', optionalAuth, previewMcq);
router.post('/generate', optionalAuth, generateMcqBatch);
router.post('/save', optionalAuth, saveMcqBatch);
router.post('/', optionalAuth, createSingleMcq);
router.get('/saved', optionalAuth, getSavedMcqs);
router.put('/saved/:id', optionalAuth, updateSavedMcq);
router.delete('/saved/:id', optionalAuth, deleteSavedMcq);
router.delete('/saved', optionalAuth, clearSavedMcqs);

export default router;
