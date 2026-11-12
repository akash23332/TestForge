import Joi from 'joi';
import { ApiError } from '../utils/apiError.js';

export const validateRegister = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required().messages({
      'any.required': 'Full name is required.',
      'string.min': 'Name must be at least 2 characters long.'
    }),
    email: Joi.string().trim().lowercase().email().required().messages({
      'any.required': 'Valid email is required.',
      'string.email': 'Email must be a valid email address.'
    }),
    password: Joi.string().min(6).max(100).required().messages({
      'any.required': 'Password is required.',
      'string.min': 'Password must be at least 6 characters.'
    }),
    role: Joi.string().valid('student').default('student').messages({
      'any.only': 'Public registration only permits student accounts.'
    })
  });

  const { error, value } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const details = error.details.reduce((acc, curr) => {
      acc[curr.path[0]] = curr.message;
      return acc;
    }, {});
    return next(ApiError.badRequest('Registration validation failed', details));
  }
  req.body = value;
  next();
};

export const validateLogin = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().trim().lowercase().email().required().messages({
      'any.required': 'Email is required to log in.',
      'string.email': 'Email must be a valid email address.'
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required.'
    }),
    role: Joi.string().trim().lowercase().valid('teacher', 'student', 'faculty', 'candidate', 'admin').optional()
  });

  const { error, value } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const details = error.details.reduce((acc, curr) => {
      acc[curr.path[0]] = curr.message;
      return acc;
    }, {});
    return next(ApiError.badRequest('Login credentials validation failed', details));
  }
  req.body = value;
  next();
};

export default {
  validateRegister,
  validateLogin
};
