import { getRedisClient } from '../config/redis.js';
import { config } from '../config/env.js';

// In-memory fallback map used strictly for offline test environments
const inMemoryStore = new Map();

// Atomic sliding-window/fixed-window counter Lua script
const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

/**
 * Creates a rate limiter middleware backed by Redis/Valkey with atomic Lua execution.
 * Enforces fail-closed semantics for sensitive execution/submission routes if Redis is unavailable.
 */
const applyInMemoryRateLimit = (key, windowMs, max, message, res, next) => {
  const now = Date.now();
  let record = inMemoryStore.get(key);
  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + windowMs };
    inMemoryStore.set(key, record);
  } else {
    record.count += 1;
  }

  res.setHeader('X-RateLimit-Limit', max);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

  if (record.count > max) {
    res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
    return res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message }
    });
  }
  return next();
};

export const createRateLimiter = ({
  prefix = 'rl',
  windowMs = 60 * 1000,
  max = 30,
  message = 'Too many requests. Please wait a moment before trying again.',
  failClosed = true,
  keyGenerator = (req) => {
    return (
      req.attempt?._id?.toString() ||
      req.params?.attemptId ||
      req.user?._id?.toString() ||
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'anonymous'
    );
  }
}) => {
  return async (req, res, next) => {
    const identifier = keyGenerator(req);
    const key = `tf:ratelimit:${prefix}:${identifier}`;

    // Test environment in-memory mode when running in test
    if ((config.env === 'test' || process.env.NODE_ENV === 'test') && config.env !== 'production' && config.env !== 'development') {
      return applyInMemoryRateLimit(key, windowMs, max, message, res, next);
    }

    // Development environment: Use Redis if connected, otherwise allow in-memory fallback
    if (config.env === 'development') {
      try {
        const redis = getRedisClient();
        if (redis.status === 'ready') {
          const [count, ttlMs] = await redis.eval(RATE_LIMIT_LUA, 1, key, windowMs);
          const remainingTtlSec = Math.max(1, Math.ceil(Number(ttlMs) / 1000));

          res.setHeader('X-RateLimit-Limit', max);
          res.setHeader('X-RateLimit-Remaining', Math.max(0, max - Number(count)));
          res.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + Number(ttlMs)) / 1000));

          if (Number(count) > max) {
            res.setHeader('Retry-After', remainingTtlSec);
            return res.status(429).json({
              success: false,
              error: { code: 'RATE_LIMIT_EXCEEDED', message }
            });
          }
          return next();
        }
      } catch (err) {
        console.warn(`[RateLimiter Dev Fallback] In-memory limiter active: ${err.message}`);
      }
      return applyInMemoryRateLimit(key, windowMs, max, message, res, next);
    }

    // PRODUCTION ENVIRONMENT: Strictly require shared Redis. NO fallback to in-memory counters.
    try {
      const redis = getRedisClient();
      if (redis.status !== 'ready') {
        throw new Error(`Redis connection status is not ready (status: ${redis.status})`);
      }

      const [count, ttlMs] = await redis.eval(RATE_LIMIT_LUA, 1, key, windowMs);
      const remainingTtlSec = Math.max(1, Math.ceil(Number(ttlMs) / 1000));

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - Number(count)));
      res.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + Number(ttlMs)) / 1000));

      if (Number(count) > max) {
        res.setHeader('Retry-After', remainingTtlSec);
        return res.status(429).json({
          success: false,
          error: { code: 'RATE_LIMIT_EXCEEDED', message }
        });
      }

      next();
    } catch (err) {
      console.error(`[RateLimiter FAIL-CLOSED] Production Redis failure on [${prefix}]: ${err.message}`);
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Rate limiting validation is temporarily unavailable. Please retry in a few moments.'
        }
      });
    }
  };
};

// Preset rate limiters
export const authRateLimiter = createRateLimiter({
  prefix: 'auth',
  windowMs: 15 * 60 * 1000,
  max: 30,
  failClosed: false,
  message: 'Too many authentication attempts. Please wait 15 minutes before trying again.'
});

export const executionRateLimiter = createRateLimiter({
  prefix: 'exec',
  windowMs: 60 * 1000,
  max: 20,
  failClosed: true,
  message: 'Code execution rate limit reached (20 runs/minute). Please wait a few seconds.'
});

export const submissionRateLimiter = createRateLimiter({
  prefix: 'sub',
  windowMs: 60 * 1000,
  max: 30,
  failClosed: true,
  message: 'Question submission rate limit reached. Please wait a moment.'
});

export default {
  createRateLimiter,
  authRateLimiter,
  executionRateLimiter,
  submissionRateLimiter
};
