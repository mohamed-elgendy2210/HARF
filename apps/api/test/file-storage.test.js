import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FileStorage } from '../src/services/fileStorage.js';

test('local file storage writes, reads, and removes files', async (t) => {
  const storageDirectory = await mkdtemp(path.join(os.tmpdir(), 'harf-storage-'));
  t.after(() => rm(storageDirectory, { recursive: true, force: true }));
  const storage = new FileStorage({ storageDirectory, blobPrefix: 'test', useBlob: false });
  const contents = Buffer.from('local file');

  await storage.initialize();
  await storage.write('asset-id', contents, 'image/png');
  assert.deepEqual(await storage.read('asset-id'), contents);
  assert.equal(await storage.exists('asset-id'), true);

  await storage.remove('asset-id');
  assert.equal(await storage.exists('asset-id'), false);
});

test('private Blob storage uses the configured prefix and authenticated operations', async (t) => {
  const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  t.after(() => {
    if (previousToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previousToken;
  });

  let uploaded;
  let putOptions;
  let getOptions;
  let deletedPath;
  const blobClient = {
    put: async (pathname, contents, options) => {
      uploaded = { pathname, contents: Buffer.from(contents) };
      putOptions = options;
    },
    get: async (pathname, options) => {
      assert.equal(pathname, uploaded.pathname);
      getOptions = options;
      return { statusCode: 200, stream: new Response(uploaded.contents).body };
    },
    head: async (pathname) => {
      assert.equal(pathname, uploaded.pathname);
      return {};
    },
    del: async (pathname) => { deletedPath = pathname; }
  };
  const storage = new FileStorage({
    storageDirectory: os.tmpdir(),
    blobPrefix: 'private-assets',
    useBlob: true,
    blobClient
  });
  const contents = Buffer.from('private file');

  await storage.write('asset-id', contents, 'image/png');
  assert.equal(uploaded.pathname, 'private-assets/asset-id');
  assert.equal(putOptions.access, 'private');
  assert.equal(putOptions.contentType, 'image/png');
  assert.deepEqual(await storage.read('asset-id'), contents);
  assert.deepEqual(getOptions, { access: 'private', useCache: false });
  assert.equal(await storage.exists('asset-id'), true);

  await storage.remove('asset-id');
  assert.equal(deletedPath, 'private-assets/asset-id');
});

test('private Blob storage reports missing credentials explicitly', async (t) => {
  const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  t.after(() => {
    if (previousToken !== undefined) process.env.BLOB_READ_WRITE_TOKEN = previousToken;
  });
  const storage = new FileStorage({
    storageDirectory: os.tmpdir(),
    blobPrefix: 'private-assets',
    useBlob: true
  });

  await assert.rejects(
    storage.write('asset-id', Buffer.from('file'), 'image/png'),
    (error) => error.code === 'BLOB_STORAGE_NOT_CONFIGURED' && error.statusCode === 503
  );
});
