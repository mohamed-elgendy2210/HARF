import mongoose from 'mongoose';
import { safeError } from '../lib/logger.js';

let connectionEventsRegistered = false;
let disconnecting = false;

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
    await mongoose.connect(uri, { dbName: 'harf', serverSelectionTimeoutMS: 5000 });
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
