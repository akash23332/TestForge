import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
};

export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      throw ApiError.conflict('An account with this email address already exists.');
    }

    // Public registration strictly provisions student accounts only.
    // Teachers and Admins must be provisioned via authorized invitation/admin workflows.
    const assignedRole = 'student';

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      name: name?.trim(),
      email: cleanEmail,
      passwordHash,
      role: assignedRole
    });

    const token = generateToken(user);

    return ApiResponse.success(
      res,
      201,
      {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt
        },
        token
      },
      'Account registered successfully'
    );
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      throw ApiError.unauthorized('Invalid email or password.');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw ApiError.unauthorized('Invalid email or password.');
    }

    // Role verification: ensure user account matches the expected portal tab
    if (role) {
      const expectedRole = String(role).trim().toLowerCase();
      const userRole = String(user.role || '').toLowerCase();

      if ((expectedRole === 'teacher' || expectedRole === 'faculty') && userRole !== 'teacher' && userRole !== 'admin') {
        throw ApiError.forbidden('This account is not registered as faculty.');
      }

      if ((expectedRole === 'student' || expectedRole === 'candidate') && userRole !== 'student') {
        throw ApiError.forbidden('This account is not registered as a student.');
      }
    }

    // Check account status if configured
    if (user.isActive === false || user.status === 'disabled') {
      throw ApiError.forbidden('Your account has not been approved or has been disabled.');
    }

    const token = generateToken(user);

    return ApiResponse.success(
      res,
      200,
      {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt
        },
        token
      },
      'Login successful'
    );
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    return ApiResponse.success(
      res,
      200,
      {
        user: req.user
      },
      'Teacher profile retrieved'
    );
  } catch (error) {
    next(error);
  }
};

export default {
  register,
  login,
  getMe
};
