import mongoose from 'mongoose';
import { config } from './env.js';

let isConnected = false;

export const connectDatabase = async (uri = config.mongodb.uri) => {
  if (isConnected || mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.connection.on('connected', () => {
    isConnected = true;
    console.log(`\x1b[32m[MongoDB] Connected successfully to ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}\x1b[0m`);
  });

  mongoose.connection.on('error', (err) => {
    isConnected = false;
    console.error(`\x1b[31m[MongoDB] Connection error: ${err.message}\x1b[0m`);
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('\x1b[33m[MongoDB] Connection disconnected.\x1b[0m');
  });

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 20000
    });
    isConnected = true;
    return conn;
  } catch (err) {
    console.error(`\x1b[31m[MongoDB] Initial connection failure: ${err.message}\x1b[0m`);
    throw err;
  }
};

export const disconnectDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
};

export const getDatabaseState = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  const readyState = mongoose.connection.readyState;
  return {
    state: states[readyState] || 'unknown',
    readyState,
    isConnected: readyState === 1,
    name: mongoose.connection.name || null,
    host: mongoose.connection.host || null
  };
};

export default {
  connectDatabase,
  disconnectDatabase,
  getDatabaseState
};
