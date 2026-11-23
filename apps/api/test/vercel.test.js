import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('Vercel uses its trusted HTTPS proxy and writable temporary media directory', () => {
  const apiRoot = fileURLToPath(new URL('..', import.meta.url));
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "import { config } from './src/config/env.js'; console.log(JSON.stringify({ isVercel: config.isVercel, trustProxy: config.trustProxy, mediaStorageDir: config.mediaStorageDir }));"
  ], {
    cwd: apiRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VERCEL: '1',
      TRUST_PROXY: 'false',
      MEDIA_STORAGE_DIR: ''
    }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    isVercel: true,
    trustProxy: 1,
    mediaStorageDir: path.resolve(tmpdir(), 'harf-media')
  });
});
