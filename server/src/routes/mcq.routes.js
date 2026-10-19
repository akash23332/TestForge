import { Router } from 'express';
import { previewMcq } from '../controllers/mcq.controller.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

router.post('/preview', optionalAuth, previewMcq);

export default router;
