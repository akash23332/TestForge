import { Router } from 'express';
import { register, login, getMe, getStudents, createStudent } from '../controllers/auth.controller.js';
import { validateRegister, validateLogin } from '../validators/auth.validator.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', authRateLimiter, validateRegister, register);
router.post('/login', authRateLimiter, validateLogin, login);
router.get('/me', requireAuth, getMe);
router.get('/students', requireAuth, requireRole('teacher', 'admin'), getStudents);
router.post('/students', requireAuth, requireRole('teacher', 'admin'), createStudent);

export default router;
