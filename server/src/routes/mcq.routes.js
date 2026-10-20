import { Router } from 'express';
import { previewMcq, generateMcqBatch } from '../controllers/mcq.controller.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

router.post('/preview', optionalAuth, previewMcq);
router.post('/generate', optionalAuth, generateMcqBatch);

export default router;
