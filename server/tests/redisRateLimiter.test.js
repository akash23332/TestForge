import { jest } from '@jest/globals';
import { createRateLimiter } from '../src/middleware/rateLimiter.js';
import { setSharedRedisClient } from '../src/config/redis.js';
import { config } from '../src/config/env.js';

describe('Part 2: Redis Rate Limiter Production & Recovery Tests', () => {
  const originalEnv = config.env;

  afterEach(() => {
    config.env = originalEnv;
    setSharedRedisClient(null);
    jest.restoreAllMocks();
  });

  const createMockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.headers = {};
    res.status = jest.fn().mockImplementation((code) => {
      res.statusCode = code;
      return res;
    });
    res.json = jest.fn().mockImplementation((data) => {
      res.body = data;
      return res;
    });
    res.setHeader = jest.fn().mockImplementation((k, v) => {
      res.headers[k] = v;
    });
    return res;
  };

  test('1. Production with Redis available: uses shared Redis Lua and allows requests within limits', async () => {
    config.env = 'production';

    const mockRedis = {
      status: 'ready',
      eval: jest.fn().mockResolvedValue([5, 45000]) // count = 5, ttl = 45000ms
    };
    setSharedRedisClient(mockRedis);

    const limiter = createRateLimiter({ prefix: 'test', max: 10 });
    const req = { user: { _id: 'u123' } };
    const res = createMockRes();
    const next = jest.fn();

    await limiter(req, res, next);

    expect(mockRedis.eval).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 5);
    expect(next).toHaveBeenCalledWith();
  });

  test('2. Production with Redis exceeding limit: returns HTTP 429 RATE_LIMIT_EXCEEDED with Retry-After', async () => {
    config.env = 'production';

    const mockRedis = {
      status: 'ready',
      eval: jest.fn().mockResolvedValue([15, 30000]) // count = 15 > max = 10, ttl = 30000ms
    };
    setSharedRedisClient(mockRedis);

    const limiter = createRateLimiter({ prefix: 'test', max: 10 });
    const req = { user: { _id: 'u123' } };
    const res = createMockRes();
    const next = jest.fn();

    await limiter(req, res, next);

    expect(mockRedis.eval).toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 30);
    expect(next).not.toHaveBeenCalled();
  });

  test('3. Production with Redis unavailable: strictly fails closed with HTTP 503 SERVICE_UNAVAILABLE', async () => {
    config.env = 'production';

    const mockRedis = {
      status: 'connecting', // Redis down/connecting
      eval: jest.fn().mockRejectedValue(new Error('Connection lost'))
    };
    setSharedRedisClient(mockRedis);

    const limiter = createRateLimiter({ prefix: 'test', max: 10, failClosed: true });
    const req = { user: { _id: 'u123' } };
    const res = createMockRes();
    const next = jest.fn();

    await limiter(req, res, next);

    expect(res.statusCode).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(next).not.toHaveBeenCalled();
  });

  test('4. Production never falls back to in-memory counters when Redis fails', async () => {
    config.env = 'production';

    const mockFailingRedis = {
      status: 'ready',
      eval: jest.fn().mockRejectedValue(new Error('Redis host unreachable'))
    };
    setSharedRedisClient(mockFailingRedis);

    const limiter = createRateLimiter({ prefix: 'test', max: 10 });
    const req = { user: { _id: 'u123' } };
    const res = createMockRes();
    const next = jest.fn();

    await limiter(req, res, next);

    // Must be blocked with 503, never allowed through via in-memory fallback
    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  test('5. Test / development mode safely uses in-memory rate limiting when Redis is absent', async () => {
    config.env = 'test';

    const limiter = createRateLimiter({ prefix: 'devtest', max: 2 });
    const req = { user: { _id: 'dev_user_1' } };
    const res1 = createMockRes();
    const res2 = createMockRes();
    const res3 = createMockRes();
    const next = jest.fn();

    // Call 1
    await limiter(req, res1, next);
    expect(res1.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);

    // Call 2
    await limiter(req, res2, next);
    expect(res2.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(2);

    // Call 3: exceeds max=2
    await limiter(req, res3, next);
    expect(res3.statusCode).toBe(429);
    expect(res3.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
