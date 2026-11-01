import mongoose from 'mongoose';

export async function connectMongo(uri, { isProduction, logger }) {
  if (!uri) {
    if (isProduction) throw new Error('MONGODB_URI is required in production.');
    logger.warn('MONGODB_URI is not set; the API will run without a database connection in development.');
    return false;
  }

  mongoose.set('strictQuery', true);
  mongoose.set('autoIndex', !isProduction);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  logger.info('MongoDB connection established.');
  return true;
}

export function getDatabaseState() {
  return mongoose.connection.readyState;
}

export async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
