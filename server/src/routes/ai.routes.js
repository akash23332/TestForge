import { Router } from 'express';
import {
  generateQuestion,
  regenerateSection,
  clearSessionHistory,
  generateMcq,
  generateExplanation,
  generateHints,
  improveQuestion
} from '../controllers/ai.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// AI generation rate limiter: bounded to 20 calls per minute per user
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
  '/generate-mcq',
  requireAuth,
  requireRole('teacher', 'admin'),
  aiRateLimiter,
  generateMcq
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

router.post(
  '/improve-question',
  requireAuth,
  requireRole('teacher', 'admin'),
  aiRateLimiter,
  improveQuestion
);

// Educational Explanations & Progressive Hints (Authenticated Users)
router.post(
  '/generate-explanation',
  requireAuth,
  aiRateLimiter,
  generateExplanation
);

router.post(
  '/generate-hints',
  requireAuth,
  aiRateLimiter,
  generateHints
);

export default router;
