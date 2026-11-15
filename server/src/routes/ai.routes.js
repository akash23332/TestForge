import { Router } from 'express';
import { generateQuestion, regenerateSection, clearSessionHistory } from '../controllers/ai.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// AI generation rate limiter: bounded to 20 calls per minute per faculty user
const aiRateLimiter = createRateLimiter({
  prefix: 'ai-gen',
  max: 20,
  windowMs: 60 * 1000,
  message: 'AI generation limit reached. Please wait a minute before generating again.'
});

// Faculty/Admin restricted AI Generation Endpoints
router.post(
  '/generate-question',
  requireAuth,
  requireRole('teacher', 'admin'),
  aiRateLimiter,
  generateQuestion
);

router.post(
  '/regenerate-section',
  requireAuth,
  requireRole('teacher', 'admin'),
  aiRateLimiter,
  regenerateSection
);

router.post(
  '/clear-history',
  requireAuth,
  requireRole('teacher', 'admin'),
  clearSessionHistory
);

export default router;
