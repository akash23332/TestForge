import { ApiError } from '../utils/apiError.js';
import { config } from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected server error occurred';
  let details = null;

  // Handle known ApiError
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  }
  // Handle JSON Syntax Error (body-parser)
  else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    code = 'MALFORMED_JSON';
    message = 'Request body contains malformed JSON';
  }
  // Handle Mongoose Validation Error
  else if (err.name === 'ValidationError') {
    statusCode = 422;
    code = 'DATABASE_VALIDATION_ERROR';
    message = 'Database model validation failed';
    details = Object.keys(err.errors || {}).reduce((acc, key) => {
      acc[key] = err.errors[key].message;
      return acc;
    }, {});
  }
  // Handle Mongoose Duplicate Key Error (E11000)
  else if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `A resource with that ${field} already exists`;
    details = err.keyValue;
  }
  // Handle Mongoose CastError (invalid ObjectId)
  else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID_FORMAT';
    message = `Invalid identifier format: ${err.value}`;
  }
  // Handle JWT verification errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Provided authorization token is malformed or invalid';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authorization token has expired. Please re-authenticate';
  } else {
    // Unexpected error logging
    if (config.env !== 'test') {
      console.error(`\x1b[31m[ERROR ${requestId}]`, err, '\x1b[0m');
    }
  }

  return res.status(statusCode).json({
    error: {
      code,
      message,
      ...(details && { details }),
      requestId
    }
  });
};

export const notFoundHandler = (req, res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

export default {
  errorHandler,
  notFoundHandler
};
