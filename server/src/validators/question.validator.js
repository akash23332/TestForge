import Joi from 'joi';
import { ApiError } from '../utils/apiError.js';

export const validateCreateQuestion = (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().trim().min(3).max(200).required().messages({
      'any.required': 'Question title is required.',
      'string.min': 'Title must be at least 3 characters long.'
    }),
    statement: Joi.string().min(10).required().messages({
      'any.required': 'Problem statement is required.',
      'string.min': 'Statement must be at least 10 characters long.'
    }),
    constraints: Joi.string().allow('').default(''),
    language: Joi.string().valid('javascript', 'python', 'java', 'cpp').default('javascript'),
    difficulty: Joi.string().valid('Easy', 'Medium', 'Hard').default('Medium'),
    tags: Joi.array().items(Joi.string().trim()).default([]),
    examples: Joi.array().items(
      Joi.object({
        input: Joi.string().required(),
        output: Joi.string().required(),
        explanation: Joi.string().allow('').default('')
      })
    ).default([]),
    starterCode: Joi.string().allow('').default(''),
    referenceSolution: Joi.string().allow('').default(''),
    status: Joi.string().valid('draft', 'published', 'archived').default('draft'),
    ownerId: Joi.string().optional().allow('')
  }).unknown(true);

  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const details = error.details.reduce((acc, curr) => {
      acc[curr.path.join('.')] = curr.message;
      return acc;
    }, {});
    const message = error.details.map((d) => d.message).join(' | ');
    return next(ApiError.badRequest(message || 'Question creation validation failed', details));
  }
  next();
};

export const validateListQuestions = (req, res, next) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().allow('').default(''),
    difficulty: Joi.string().valid('Easy', 'Medium', 'Hard', '').default(''),
    language: Joi.string().valid('javascript', 'python', 'java', 'cpp', '').default(''),
    sort: Joi.string().valid('updatedAt', '-updatedAt', 'title', '-title', 'createdAt', '-createdAt').default('-updatedAt')
  });

  const { error, value } = schema.validate(req.query);
  if (error) {
    return next(ApiError.badRequest('Invalid query parameters', error.message));
  }
  req.query = value;
  next();
};

export default {
  validateCreateQuestion,
  validateListQuestions
};
