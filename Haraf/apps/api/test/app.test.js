import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { getSessionCookieOptions } from '../src/config/cookies.js';
import { createLogger, safeError } from '../src/lib/logger.js';
import { validate } from '../src/middleware/validate.js';
import { z } from 'zod';

const config = {
  trustProxy: false,
  isProduction: false,
  clientOrigins: ['http://localhost:5173']
};
const logger = createLogger({ level: 'silent' });
let server;
let baseUrl;

before(async () => {
  server = createServer(createApp({ config, logger, getDatabaseState: () => 0 }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await once(server, 'close');
});

test('liveness responds without exposing configuration', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health/live`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'harf-api' });
});

test('readiness reports unavailable database without a success-shaped fallback', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health/ready`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'not-ready', database: 'disconnected' });
});

test('unknown API paths return a safe JSON error', async () => {
  const response = await fetch(`${baseUrl}/api/v1/missing`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' }
  });
});

test('malformed JSON receives a safe client error', async () => {
  const response = await fetch(`${baseUrl}/api/v1/unknown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: '{'
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: 'INVALID_JSON', message: 'The request body contains invalid JSON.' }
  });
});

test('JSON request bodies over the configured limit are rejected', async () => {
  const response = await fetch(`${baseUrl}/api/v1/unknown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ value: 'x'.repeat(33 * 1024) })
  });
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    error: { code: 'REQUEST_TOO_LARGE', message: 'The request body is too large.' }
  });
});

test('CORS allows only configured browser origins', async () => {
  const allowed = await fetch(`${baseUrl}/api/v1/health/live`, {
    headers: { Origin: 'http://localhost:5173' }
  });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');

  const denied = await fetch(`${baseUrl}/api/v1/health/live`, {
    headers: { Origin: 'https://untrusted.example' }
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('production API rejects plain HTTP without redirecting', async () => {
  const productionApp = createApp({
    config: { ...config, isProduction: true },
    logger,
    getDatabaseState: () => 1
  });
  const productionServer = createServer(productionApp);
  productionServer.listen(0, '127.0.0.1');
  await once(productionServer, 'listening');

  try {
    const response = await fetch(`http://127.0.0.1:${productionServer.address().port}/api/v1/resource`, {
      headers: { 'X-Forwarded-Proto': 'https' }
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('location'), null);
    assert.deepEqual(await response.json(), {
      error: { code: 'HTTPS_REQUIRED', message: 'Use HTTPS to access this API.' }
    });
  } finally {
    productionServer.close();
    await once(productionServer, 'close');
  }
});

test('session cookie defaults are secure in production and HttpOnly in every environment', () => {
  assert.deepEqual(getSessionCookieOptions(false), {
    httpOnly: true, secure: false, sameSite: 'lax', path: '/'
  });
  assert.deepEqual(getSessionCookieOptions(true), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/'
  });
});

test('request validation rejects invalid values with field details', () => {
  let passedError;
  const middleware = validate(z.object({ name: z.string().min(2) }));
  middleware({ body: { name: '' } }, {}, (error) => { passedError = error; });
  assert.equal(passedError.code, 'VALIDATION_ERROR');
  assert.equal(passedError.statusCode, 400);
  assert.equal(passedError.details[0].path, 'name');
});

test('logged error summaries redact database URLs and key-value secrets', () => {
  const error = safeError(new Error('Connection failed: mongodb://parent:secret@database.example/harf token=private-token'));
  assert.equal(error.message.includes('parent:secret'), false);
  assert.equal(error.message.includes('private-token'), false);
  assert.match(error.message, /\[REDACTED_URL\]/);
  assert.match(error.message, /token=\[REDACTED\]/);
});
