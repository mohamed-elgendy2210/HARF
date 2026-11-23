import mongoose from 'mongoose';
import { safeError } from '../lib/logger.js';

let connectionEventsRegistered = false;
let disconnecting = false;
let reconnectionPromise = null;

function registerConnectionEvents(logger) {
  if (connectionEventsRegistered) return;
  connectionEventsRegistered = true;

  mongoose.connection.on('disconnected', () => {
    if (!disconnecting) {
      logger.warn('MongoDB connection lost; Mongoose will attempt to reconnect.');
    }
  });
  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB connection re-established.');
  });
  mongoose.connection.on('error', (error) => {
    logger.error({ error: safeError(error) }, 'MongoDB connection error.');
  });
}

export async function connectMongo(uri, { isProduction, logger }) {
  if (!uri) {
    if (isProduction) throw new Error('MONGODB_URI is required in production.');
    logger.warn('MONGODB_URI is not set; the API will run without a database connection in development.');
    return false;
  }

  registerConnectionEvents(logger);
  mongoose.set('strictQuery', true);
  mongoose.set('autoIndex', !isProduction);
  try {
    await mongoose.connect(uri, {
      dbName: 'harf',
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 30000,
      maxConnecting: 2
    });
  } catch (error) {
    logger.error({ error: safeError(error) }, 'MongoDB connection failed.');
    throw new Error('MongoDB connection failed. Verify MONGODB_URI, network access, and database user permissions.');
  }
  logger.info('MongoDB connection established.');
  return true;
}

export function getDatabaseState() {
  return mongoose.connection.readyState;
}

export async function ensureMongoConnected(uri, options) {
  if (getDatabaseState() === 1) return true;
  if (!uri) return false;
  if (reconnectionPromise) return reconnectionPromise;

  reconnectionPromise = (async () => {
    if (getDatabaseState() === 2) {
      try {
        await mongoose.connection.asPromise();
      } catch (error) {
        options.logger.warn(
          { error: safeError(error) },
          'MongoDB connection attempt ended before readiness; retrying.'
        );
        if (getDatabaseState() !== 0) throw new Error('MongoDB is still reconnecting.');
      }
      if (getDatabaseState() === 1) return true;
    }
    return connectMongo(uri, options);
  })();

  try {
    return await reconnectionPromise;
  } finally {
    reconnectionPromise = null;
  }
}

export async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    disconnecting = true;
    try {
      await mongoose.disconnect();
    } finally {
      disconnecting = false;
    }
  }
}
