import { Router } from 'express';
import { getDatabaseState } from '../config/database.js';
import { getRedisClient } from '../config/redis.js';
import { providerRegistry } from '../services/execution/providerRegistry.js';
import { config } from '../config/env.js';

const router = Router();

/**
 * Liveness probe: returns 200 if the Node.js API process is responsive and DB is connected.
 */
router.get('/', (req, res) => {
  const dbState = getDatabaseState();
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
        ...(config.env !== 'production' ? {
          databaseName: dbState.name,
          host: dbState.host
        } : {})
      }
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

/**
 * Readiness probe: checks application readiness and distinguishes application health
 * from isolated runner availability.
 * Does NOT report the execution runner as healthy merely because the backend process is running.
 */
router.get('/readiness', async (req, res) => {
  const dbState = getDatabaseState();
  const redisClient = getRedisClient();
  const redisConnected = redisClient ? (redisClient.status === 'ready' || redisClient.status === 'connect') : false;

  const activeProvider = providerRegistry.getProvider();
  let runnerHealth = {
    healthy: false,
    status: 'unconfigured',
    provider: activeProvider.name,
    latencyMs: null,
    error: null
  };

  if (typeof activeProvider.checkHealth === 'function') {
    try {
      runnerHealth = await activeProvider.checkHealth({ timeoutMs: 2500 });
      runnerHealth.provider = activeProvider.name;
    } catch (err) {
      runnerHealth = {
        healthy: false,
        status: 'error',
        provider: activeProvider.name,
        latencyMs: null,
        error: err.message
      };
    }
  } else {
    // Mock / Local providers
    runnerHealth = {
      healthy: true,
      status: 'in_process',
      provider: activeProvider.name,
      latencyMs: 0,
      details: { isMock: activeProvider.name === 'mock' }
    };
  }

  // Application core readiness: Database and Redis must be connected
  const isAppReady = dbState.isConnected;
  const isExecutionReady = runnerHealth.healthy;

  // Overall status: ready only if app is ready and execution backend is operational
  const overallStatus = isAppReady && isExecutionReady ? 'ready' : (isAppReady ? 'degraded' : 'not_ready');
  const statusCode = isAppReady ? 200 : 503;

  return res.status(statusCode).json({
    status: overallStatus,
    service: 'TestForge Readiness Check',
    timestamp: new Date().toISOString(),
    application: {
      ready: isAppReady,
      uptimeSeconds: Math.floor(process.uptime())
    },
    dependencies: {
      mongodb: {
        connected: dbState.isConnected,
        status: dbState.state
      },
      redis: {
        connected: redisConnected,
        status: redisClient ? redisClient.status : 'disconnected'
      }
    },
    executionRunner: {
      provider: activeProvider.name,
      reachable: runnerHealth.healthy,
      status: runnerHealth.status,
      latencyMs: runnerHealth.latencyMs,
      error: runnerHealth.error || null
    },
    requestId: req.requestId
  });
});

/**
 * Dedicated Runner health probe. Returns 200 if runner is reachable and authenticated, 503 otherwise.
 */
router.get('/runner', async (req, res) => {
  const activeProvider = providerRegistry.getProvider();
  if (typeof activeProvider.checkHealth !== 'function') {
    return res.status(200).json({
      provider: activeProvider.name,
      healthy: true,
      status: 'in_process',
      note: 'Active provider does not use a remote runner'
    });
  }

  try {
    const health = await activeProvider.checkHealth({ timeoutMs: 3000 });
    const statusCode = health.healthy ? 200 : 503;
    return res.status(statusCode).json({
      provider: activeProvider.name,
      ...health
    });
  } catch (err) {
    return res.status(503).json({
      provider: activeProvider.name,
      healthy: false,
      status: 'error',
      error: err.message
    });
  }
});

export default router;
