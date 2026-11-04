import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { mock, test } from 'node:test';
import { connectMongo } from '../src/db/mongo.js';

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
    serverSelectionTimeoutMS: 5000
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
