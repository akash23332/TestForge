import app from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { User } from './models/User.js';
import { runStartupRecovery, recoverUnavailableSubmissions } from './services/queue/executionRecovery.js';
import { recoverStaleMutationRuns } from './services/queue/mutationRecovery.js';

const ensureDemoAccounts = async () => {
  try {
    const teacher = await User.findOne({ email: 'teacher@testforge.edu' });
    if (!teacher) {
      const passwordHash = await User.hashPassword('Teacher@123');
      await User.create({
        name: 'Dr. Sarah Mitchell',
        email: 'teacher@testforge.edu',
        passwordHash,
        role: 'teacher'
      });
      console.log('✔ [TestForge] Demo faculty account auto-seeded: teacher@testforge.edu');
    }

    const student = await User.findOne({ email: 'student@testforge.edu' });
    if (!student) {
      const passwordHash = await User.hashPassword('Student@123');
      await User.create({
        name: 'Alex Rivera',
        email: 'student@testforge.edu',
        passwordHash,
        role: 'student'
      });
      console.log('✔ [TestForge] Demo student account auto-seeded: student@testforge.edu');
    }
  } catch (err) {
    console.warn('[TestForge] Notice: Demo account check skipped:', err.message);
  }
};

const startServer = async () => {
  try {
    console.log(`\x1b[36m[TestForge] Starting server in ${config.env} mode...\x1b[0m`);

    // Connect to MongoDB
    await connectDatabase();

    // Auto-ensure demo accounts exist for both Teacher and Student
    await ensureDemoAccounts();

    // Startup recovery sweep: safely reconcile stalled RUNNING, orphaned QUEUED, or EXECUTION_UNAVAILABLE submissions
    try {
      const recoveryResult = await recoverUnavailableSubmissions();
      console.log(`✔ [TestForge] Startup recovery sweep completed: ${recoveryResult.recovered} recovered, ${recoveryResult.skipped} skipped (${recoveryResult.scanned} scanned).`);
    } catch (recErr) {
      console.warn('[TestForge] Notice: Startup recovery sweep skipped or non-fatal:', recErr.message);
    }

    // Startup mutation run recovery: safely recover stalled or abandoned mutation testing runs
    try {
      const mutRec = await recoverStaleMutationRuns();
      if (mutRec.recovered > 0 || mutRec.unlocked > 0) {
        console.log(`✔ [TestForge] Startup mutation recovery: ${mutRec.recovered} stalled runs reconciled, ${mutRec.unlocked} orphaned locks cleared.`);
      }
    } catch (mutRecErr) {
      console.warn('[TestForge] Notice: Startup mutation recovery skipped or non-fatal:', mutRecErr.message);
    }

    // Start HTTP listener
    const server = app.listen(config.port, () => {
      console.log(`\x1b[32m✔ [TestForge] Server listening at http://localhost:${config.port}\x1b[0m`);
      console.log(`  - Health Check: http://localhost:${config.port}/api/v1/health`);
      console.log(`  - Client Origin: ${config.clientOrigin}`);
    });

    // Ensure server-level HTTP request timeout accommodates complex AI reasoning (3 minutes)
    server.timeout = 180000;
    server.keepAliveTimeout = 65000;

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
