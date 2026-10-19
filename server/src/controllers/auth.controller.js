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
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw ApiError.conflict('An account with this email address already exists.');
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role: role || 'teacher'
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
      'Teacher registered successfully'
    );
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      throw ApiError.unauthorized('Invalid email or password.');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw ApiError.unauthorized('Invalid email or password.');
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
