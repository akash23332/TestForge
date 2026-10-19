import { Router } from 'express';
import { getDatabaseState } from '../config/database.js';
import { getRedisStatus } from '../config/redis.js';
import { config } from '../config/env.js';

const router = Router();

router.get('/', (req, res) => {
  const dbState = getDatabaseState();
  const redisStatus = getRedisStatus();
  const memoryUsage = process.memoryUsage();

  const isHealthy = dbState.isConnected;
  const statusCode = isHealthy ? 200 : 503;

  return res.status(statusCode).json({
    status: isHealthy ? 'healthy' : 'degraded',
    service: 'TestForge REST API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.env,
    dependencies: {
      mongodb: {
        status: dbState.state,
        connected: dbState.isConnected,
        databaseName: dbState.name,
        host: dbState.host
      },
      redis: redisStatus
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024)
      }
    },
    requestId: req.requestId
  });
});

export default router;
