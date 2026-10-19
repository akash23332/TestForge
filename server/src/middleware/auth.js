import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { User } from '../models/User.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Authentication token missing. Please provide a Bearer token.');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw ApiError.unauthorized('Malformed authorization header.');
    }

    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(decoded.id).select('-passwordHash');

    if (!user) {
      throw ApiError.unauthorized('User associated with token no longer exists.');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional auth middleware for endpoints accessible publicly or anonymously,
 * but still populates req.user if a valid token is provided.
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await User.findById(decoded.id).select('-passwordHash');
      if (user) {
        req.user = user;
      }
    }
  } catch {
    // Ignore invalid token in optional auth
  }
  next();
};

export default {
  requireAuth,
  optionalAuth
};
