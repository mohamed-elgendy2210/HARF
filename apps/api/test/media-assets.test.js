import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MediaAssetService } from '../src/services/mediaAssetService.js';

function wavFile(sizeBytes) {
  const buffer = Buffer.alloc(sizeBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(sizeBytes - 8, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(44_100, 24);
  buffer.writeUInt32LE(88_200, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(sizeBytes - 44, 40);
  return buffer;
}

test('direct Blob finalization accepts a valid 4.5 MB audio file', async (t) => {
  const storageDirectory = await mkdtemp(path.join(os.tmpdir(), 'harf-media-'));
  t.after(() => rm(storageDirectory, { recursive: true, force: true }));
  const assets = [];
  const repository = {
    findAssetByStorageName: async (storageName) => assets.find((asset) => asset.storageName === storageName) ?? null,
    createAsset: async (data) => {
      const asset = { ...data, _id: `asset-${assets.length + 1}` };
      assets.push(asset);
      return asset;
    }
  };
  const service = new MediaAssetService({ repository, storageDirectory });
  await service.initialize();
  const storageName = '123e4567-e89b-12d3-a456-426614174000';
  const buffer = wavFile(4.5 * 1024 * 1024);
  await service.storage.write(storageName, buffer, 'audio/wav');

  const asset = await service.uploadFromStorage({
    storageName,
    displayName: 'Test audio',
    kind: 'audio',
    createdBy: 'admin-id'
  });

  assert.equal(asset.sizeBytes, buffer.length);
  assert.equal(asset.mimeType, 'audio/wav');
  assert.equal(asset.kind, 'audio');
  assert.equal(await service.storage.exists(storageName), true);
});

test('direct Blob finalization removes files that fail server-side signature validation', async (t) => {
  const storageDirectory = await mkdtemp(path.join(os.tmpdir(), 'harf-media-'));
  t.after(() => rm(storageDirectory, { recursive: true, force: true }));
  const service = new MediaAssetService({
    repository: {
      findAssetByStorageName: async () => null,
      createAsset: async () => assert.fail('invalid content must not create an asset')
    },
    storageDirectory
  });
  await service.initialize();
  const storageName = '123e4567-e89b-12d3-a456-426614174001';
  await service.storage.write(storageName, Buffer.from('not an audio file'), 'audio/mpeg');

  await assert.rejects(
    service.uploadFromStorage({
      storageName,
      displayName: 'Invalid audio',
      kind: 'audio',
      createdBy: 'admin-id'
    }),
    (error) => error.code === 'UNSUPPORTED_MEDIA_TYPE'
  );
  assert.equal(await service.storage.exists(storageName), false);
});

test('direct Blob replacement keeps metadata and updates draft references', async (t) => {
  const storageDirectory = await mkdtemp(path.join(os.tmpdir(), 'harf-media-'));
  t.after(() => rm(storageDirectory, { recursive: true, force: true }));
  const original = {
    _id: 'asset-original',
    displayName: 'Existing audio',
    altText: 'Audio description',
    category: 'Sounds',
    tags: ['animal'],
    kind: 'audio',
    storageName: 'original-file',
    active: true
  };
  let replacement;
  let updatedReference;
  const service = new MediaAssetService({
    repository: {
      findAssetByStorageName: async (storageName) => replacement?.storageName === storageName ? replacement : null,
      findAsset: async (assetId) => assetId === original._id ? original : null,
      createAsset: async (data) => {
        replacement = { ...data, _id: 'asset-replacement' };
        return replacement;
      },
      replaceDraftAssetReferences: async (fromId, toId) => { updatedReference = { fromId, toId }; },
      isAssetReferenced: async () => true
    },
    storageDirectory
  });
  await service.initialize();
  const storageName = '123e4567-e89b-12d3-a456-426614174002';
  await service.storage.write(storageName, wavFile(4.5 * 1024 * 1024), 'audio/wav');

  const asset = await service.replaceFromStorage({
    assetId: original._id,
    storageName,
    createdBy: 'admin-id'
  });

  assert.equal(asset.id, 'asset-replacement');
  assert.equal(asset.displayName, original.displayName);
  assert.equal(asset.altText, original.altText);
  assert.deepEqual(updatedReference, { fromId: 'asset-original', toId: 'asset-replacement' });
  assert.equal(await service.storage.exists(storageName), true);
});
