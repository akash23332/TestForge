import Redis from 'ioredis';
import { config } from './env.js';

let redisClient = null;
let redisAvailable = false;

export const initRedis = () => {
  if (!config.redis.enabled || !config.redis.url) {
    console.log('\x1b[34mℹ [Redis] Running in local direct-DB fallback mode.\x1b[0m');
    return null;
  }

  try {
    redisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1500,
      retryStrategy: () => null, // Do not spam retries if offline
      lazyConnect: true
    });

    redisClient.connect().then(() => {
      redisAvailable = true;
      console.log('\x1b[32m✔ [Redis] Connected successfully to Redis cache server.\x1b[0m');
    }).catch(() => {
      redisAvailable = false;
      console.log('\x1b[34mℹ [Redis] Redis server not detected. Gracefully enabled direct-DB fallback mode.\x1b[0m');
    });

    redisClient.on('error', () => {
      redisAvailable = false;
    });

    return redisClient;
  } catch {
    redisAvailable = false;
    return null;
  }
};

export const getRedisStatus = () => ({
  configured: Boolean(config.redis.url),
  connected: redisAvailable,
  mode: redisAvailable ? 'active' : 'disabled_fallback'
});

export const getRedisClient = () => (redisAvailable ? redisClient : null);

export default {
  initRedis,
  getRedisStatus,
  getRedisClient
};
