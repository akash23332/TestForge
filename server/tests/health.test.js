import request from 'supertest';
import app from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

describe('Health and API Infrastructure Tests', () => {
  beforeAll(async () => {
    try {
      await connectDatabase();
    } catch (e) {
      // In test runner if MongoDB is not reachable, test still validates degraded response
    }
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  test('GET / should return basic service information', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'TestForge API');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('healthCheck', '/api/v1/health');
  });

  test('GET /api/v1/health should return system status and dependencies', async () => {
    const res = await request(app).get('/api/v1/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('service', 'TestForge REST API');
    expect(res.body).toHaveProperty('dependencies');
    expect(res.body.dependencies).toHaveProperty('mongodb');
    expect(res.body.dependencies).toHaveProperty('redis');
    expect(res.body).toHaveProperty('system');
    expect(res.body).toHaveProperty('requestId');
    expect(res.headers).toHaveProperty('x-request-id');
  });

  test('GET /api/v1/unknown-endpoint should return 404 with standardized error structure', async () => {
    const res = await request(app).get('/api/v1/unknown-endpoint');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(res.body.error).toHaveProperty('message');
    expect(res.body.error).toHaveProperty('requestId');
  });
});
