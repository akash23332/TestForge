import app from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { initRedis } from './config/redis.js';

const startServer = async () => {
  try {
    console.log(`\x1b[36m[TestForge] Starting server in ${config.env} mode...\x1b[0m`);

    // Connect to MongoDB
    await connectDatabase();

    // Initialize Redis (or disabled fallback)
    initRedis();

    // Start HTTP listener
    const server = app.listen(config.port, () => {
      console.log(`\x1b[32m✔ [TestForge] Server listening at http://localhost:${config.port}\x1b[0m`);
      console.log(`  - Health Check: http://localhost:${config.port}/api/v1/health`);
      console.log(`  - Client Origin: ${config.clientOrigin}`);
    });

    // Graceful shutdown handling
    const shutdown = async (signal) => {
      console.log(`\n\x1b[33m[TestForge] Received ${signal}. Closing server gracefully...\x1b[0m`);
      server.close(async () => {
        console.log('[TestForge] HTTP server closed.');
        try {
          await disconnectDatabase();
          console.log('[TestForge] MongoDB connection closed.');
          process.exit(0);
        } catch (err) {
          console.error('[TestForge] Error during disconnect:', err);
          process.exit(1);
        }
      });

      // Force close after 10s timeout
      setTimeout(() => {
        console.error('[TestForge] Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason, promise) => {
      console.error('\x1b[31m[TestForge] Unhandled Rejection at:\x1b[0m', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('\x1b[31m[TestForge] Uncaught Exception:\x1b[0m', error);
      process.exit(1);
    });

    return server;
  } catch (error) {
    console.error(`\x1b[31m[TestForge] Failed to start server: ${error.message}\x1b[0m`);
    process.exit(1);
  }
};

startServer();
