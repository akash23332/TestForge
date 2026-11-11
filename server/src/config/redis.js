import Redis from 'ioredis';
import { config } from './env.js';

let sharedClient = null;

/**
 * Creates an isolated Redis/Valkey connection instance configured for BullMQ and Rate Limiting.
 * @param {Object} [overrideOptions]
 * @returns {Redis}
 */
export const createRedisConnection = (overrideOptions = {}) => {
  const redisUrl = config.redis?.url || process.env.REDIS_URL || process.env.VALKEY_URL || 'redis://127.0.0.1:6379';

  const defaultOptions = {
    maxRetriesPerRequest: null, // Required by BullMQ for blocking commands
    enableReadyCheck: false,
    retryStrategy: (times) => {
      // In development, stop retrying after 3 failed attempts to prevent log spam if Redis is not running
      if (config.env !== 'production' && times > 3) {
        return null;
      }
      const delay = Math.min(times * 300, 3000);
      return delay;
    },
    lazyConnect: true // Allows Express to start and handle connect errors gracefully
  };

  const client = new Redis(redisUrl, {
    ...defaultOptions,
    ...overrideOptions
  });

  let loggedRefused = false;
  client.on('error', (err) => {
    if (err.code === 'ECONNREFUSED') {
      if (!loggedRefused && config.env !== 'test') {
        loggedRefused = true;
        console.warn('[Redis/Valkey] Local Redis instance not running at 127.0.0.1:6379. In-memory mode active.');
      }
      return;
    }
    // Avoid unhandled crash; log other warnings
    if (config.env !== 'test') {
      console.warn(`[Redis/Valkey] Connection issue: ${err.message}`);
    }
  });

  return client;
};

/**
 * Returns the singleton Redis client instance used by shared services (Rate Limiting).
 * @returns {Redis}
 */
export const getRedisClient = () => {
  if (!sharedClient) {
    sharedClient = createRedisConnection({
      lazyConnect: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 1500
    });
  }
  return sharedClient;
};

/**
 * Injects or overrides the shared Redis client instance (used for testing and lifecycle control).
 * @param {Redis|null} client
 */
export const setSharedRedisClient = (client) => {
  sharedClient = client;
};

/**
 * Gracefully disconnects the shared Redis client during server shutdown.
 */
export const disconnectRedis = async () => {
  if (sharedClient) {
    try {
      await sharedClient.quit();
    } catch {
      sharedClient.disconnect();
    } finally {
      sharedClient = null;
    }
  }
};

export default {
  createRedisConnection,
  getRedisClient,
  disconnectRedis
};
