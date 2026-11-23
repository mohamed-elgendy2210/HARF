import { BlobNotFoundError, del, get, head, put } from '@vercel/blob';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../middleware/errors.js';

function assertStorageName(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..'
    || name.includes('/') || name.includes('\\')) {
    throw new Error('Stored file name is invalid.');
  }
}

export class FileStorage {
  constructor({
    storageDirectory,
    blobPrefix,
    useBlob = process.env.VERCEL === '1',
    blobClient = { del, get, head, put }
  }) {
    this.storageDirectory = path.resolve(storageDirectory);
    this.blobPrefix = blobPrefix;
    this.useBlob = useBlob;
    this.blobClient = blobClient;
  }

  async initialize() {
    if (!this.useBlob) {
      await mkdir(this.storageDirectory, { recursive: true, mode: 0o700 });
    }
  }

  async write(name, buffer, contentType) {
    assertStorageName(name);
    if (this.useBlob) {
      this.assertBlobConnected();
      await this.blobClient.put(`${this.blobPrefix}/${name}`, buffer, {
        access: 'private',
        addRandomSuffix: false,
        contentType
      });
      return;
    }
    await writeFile(path.join(this.storageDirectory, name), buffer, { flag: 'wx', mode: 0o600 });
  }

  async read(name) {
    assertStorageName(name);
    if (this.useBlob) {
      this.assertBlobConnected();
      const result = await this.blobClient.get(`${this.blobPrefix}/${name}`, {
        access: 'private',
        useCache: false
      });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    }
    try {
      return await readFile(path.join(this.storageDirectory, name));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async exists(name) {
    assertStorageName(name);
    if (this.useBlob) {
      this.assertBlobConnected();
      try {
        await this.blobClient.head(`${this.blobPrefix}/${name}`);
        return true;
      } catch (error) {
        if (error instanceof BlobNotFoundError) return false;
        throw error;
      }
    }
    try {
      await access(path.join(this.storageDirectory, name));
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async remove(name) {
    assertStorageName(name);
    if (this.useBlob) {
      this.assertBlobConnected();
      await this.blobClient.del(`${this.blobPrefix}/${name}`);
      return;
    }
    await rm(path.join(this.storageDirectory, name), { force: true });
  }

  assertBlobConnected() {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new AppError(
        503,
        'BLOB_STORAGE_NOT_CONFIGURED',
        'Connect a private Vercel Blob store and configure BLOB_READ_WRITE_TOKEN before using uploaded files.'
      );
    }
  }
}
