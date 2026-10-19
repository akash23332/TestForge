import { Router } from 'express';
import { register, login, getMe } from '../controllers/auth.controller.js';
import { validateRegister, validateLogin } from '../validators/auth.validator.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.get('/me', requireAuth, getMe);

export default router;
