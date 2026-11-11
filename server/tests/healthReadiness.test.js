import { jest } from '@jest/globals';
import express from 'express';
import mongoose from 'mongoose';
import healthRouter from '../src/routes/health.routes.js';
import { providerRegistry } from '../src/services/execution/providerRegistry.js';
import { setSharedRedisClient } from '../src/config/redis.js';

describe('Health and Readiness Route Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/health', healthRouter);
  });

  afterEach(() => {
    setSharedRedisClient(null);
    jest.restoreAllMocks();
  });

  test('GET /health returns basic liveness with MongoDB state', async () => {
    const mockReq = { requestId: 'req-123' };
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const routes = healthRouter.stack.filter(s => s.route && s.route.path === '/');
    const handler = routes[0].route.stack[0].handle;

    await handler(mockReq, mockRes);

    // In unit test without live DB, returns 503 degraded
    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'degraded',
        dependencies: expect.objectContaining({
          mongodb: expect.objectContaining({ connected: false })
        })
      })
    );
  });

  test('GET /health/readiness distinguishes application health from runner availability', async () => {
    setSharedRedisClient({ status: 'ready' });

    // Mock active provider reporting unreachable runner
    const mockProvider = {
      name: 'render_sandbox',
      checkHealth: jest.fn().mockResolvedValue({
        healthy: false,
        status: 'unreachable',
        error: 'Connection refused'
      })
    };
    jest.spyOn(providerRegistry, 'getProvider').mockReturnValue(mockProvider);

    const mockReq = { requestId: 'req-456' };
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const routes = healthRouter.stack.filter(s => s.route && s.route.path === '/readiness');
    const handler = routes[0].route.stack[0].handle;

    await handler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'not_ready',
        executionRunner: expect.objectContaining({
          provider: 'render_sandbox',
          reachable: false,
          status: 'unreachable'
        })
      })
    );
  });

  test('GET /health/runner returns 200 when runner is healthy', async () => {
    const mockProvider = {
      name: 'render_sandbox',
      checkHealth: jest.fn().mockResolvedValue({
        healthy: true,
        status: 'healthy',
        latencyMs: 15,
        details: { version: '1.13.1' }
      })
    };
    jest.spyOn(providerRegistry, 'getProvider').mockReturnValue(mockProvider);

    const mockReq = {};
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const routes = healthRouter.stack.filter(s => s.route && s.route.path === '/runner');
    const handler = routes[0].route.stack[0].handle;

    await handler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        healthy: true,
        status: 'healthy',
        latencyMs: 15
      })
    );
  });

  test('GET /health/runner returns 503 when runner is unreachable', async () => {
    const mockProvider = {
      name: 'render_sandbox',
      checkHealth: jest.fn().mockResolvedValue({
        healthy: false,
        status: 'unreachable',
        error: 'Runner offline (HTTP 502)'
      })
    };
    jest.spyOn(providerRegistry, 'getProvider').mockReturnValue(mockProvider);

    const mockReq = {};
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const routes = healthRouter.stack.filter(s => s.route && s.route.path === '/runner');
    const handler = routes[0].route.stack[0].handle;

    await handler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        healthy: false,
        status: 'unreachable'
      })
    );
  });
});
