import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { mock, test } from 'node:test';
import { connectMongo, ensureMongoConnected } from '../src/db/mongo.js';

test('MongoDB connects to the existing harf database', async (t) => {
  const logger = {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn()
  };
  const connect = t.mock.method(mongoose, 'connect', async () => mongoose);

  assert.equal(await connectMongo('mongodb+srv://cluster.example.invalid', {
    isProduction: false,
    logger
  }), true);
  assert.deepEqual(connect.mock.calls[0].arguments[1], {
    dbName: 'harf',
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 5,
    minPoolSize: 0,
    maxIdleTimeMS: 30000,
    maxConnecting: 2
  });
  assert.deepEqual(logger.info.mock.calls[0].arguments, ['MongoDB connection established.']);
});

test('MongoDB connection failures are actionable without exposing the URI', async (t) => {
  const logger = {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn()
  };
  const connect = t.mock.method(mongoose, 'connect', async () => {
    throw new Error('Unable to connect to mongodb+srv://cluster.example.invalid/harf');
  });

  await assert.rejects(connectMongo('mongodb+srv://cluster.example.invalid/harf', {
    isProduction: false,
    logger
  }), {
    message: 'MongoDB connection failed. Verify MONGODB_URI, network access, and database user permissions.'
  });
  assert.equal(connect.mock.calls.length, 1);
  assert.equal(JSON.stringify(logger.error.mock.calls).includes('mongodb+srv://cluster.example.invalid'), false);
});

test('MongoDB reconnects after an established connection is lost', async (t) => {
  const logger = {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn()
  };
  const previousReadyState = mongoose.connection.readyState;
  t.after(() => { mongoose.connection.readyState = previousReadyState; });
  mongoose.connection.readyState = 0;
  const connect = t.mock.method(mongoose, 'connect', async () => {
    mongoose.connection.readyState = 1;
    return mongoose;
  });

  assert.equal(await ensureMongoConnected('mongodb+srv://cluster.example.invalid/harf', {
    isProduction: true,
    logger
  }), true);
  assert.equal(connect.mock.calls.length, 1);
});

test('concurrent MongoDB reconnects share one connection attempt', async (t) => {
  const logger = {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn()
  };
  const previousReadyState = mongoose.connection.readyState;
  t.after(() => { mongoose.connection.readyState = previousReadyState; });
  mongoose.connection.readyState = 0;
  let releaseConnection;
  const connectionGate = new Promise((resolve) => { releaseConnection = resolve; });
  const connect = t.mock.method(mongoose, 'connect', async () => {
    await connectionGate;
    mongoose.connection.readyState = 1;
    return mongoose;
  });

  const first = ensureMongoConnected('mongodb+srv://cluster.example.invalid/harf', {
    isProduction: true,
    logger
  });
  const second = ensureMongoConnected('mongodb+srv://cluster.example.invalid/harf', {
    isProduction: true,
    logger
  });

  assert.equal(connect.mock.calls.length, 1);
  releaseConnection();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
});
