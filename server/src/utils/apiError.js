/**
 * Standard API Error class adhering to the TestForge REST specification.
 * Error response schema: { error: { code, message, details, requestId } }
 */
export class ApiError extends Error {
  constructor(statusCode, message, code = 'ERROR', details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad Request', details = null) {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Authentication required', details = null) {
    return new ApiError(401, message, 'UNAUTHORIZED', details);
  }

  static forbidden(message = 'Access forbidden: insufficient permissions', details = null) {
    return new ApiError(403, message, 'FORBIDDEN', details);
  }

  static notFound(message = 'Resource not found', details = null) {
    return new ApiError(404, message, 'NOT_FOUND', details);
  }

  static conflict(message = 'Resource conflict', details = null) {
    return new ApiError(409, message, 'CONFLICT', details);
  }

  static unprocessableEntity(message = 'Validation failed', details = null) {
    return new ApiError(422, message, 'UNPROCESSABLE_ENTITY', details);
  }

  static tooManyRequests(message = 'Rate limit exceeded, please retry later', details = null) {
    return new ApiError(429, message, 'RATE_LIMIT_EXCEEDED', details);
  }

  static internal(message = 'Internal server error', details = null) {
    return new ApiError(500, message, 'INTERNAL_SERVER_ERROR', details);
  }
}

export default ApiError;
