import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../middleware/errors.js';

const MAX_SIZES = Object.freeze({
  image: 5 * 1024 * 1024,
  audio: 10 * 1024 * 1024,
  animation: 3 * 1024 * 1024,
  video: 20 * 1024 * 1024
});
const ALLOWED_SIGNATURES = Object.freeze({
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/x-wav': 'audio',
  'audio/ogg': 'audio',
  'image/gif': 'animation',
  'video/mp4': 'video'
});

function imageDimensions(buffer, mimeType) {
  if (mimeType === 'image/png' && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === 'image/gif' && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (mimeType === 'image/webp' && buffer.length >= 30 && buffer.toString('ascii', 12, 16) === 'VP8X') {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (mimeType === 'image/webp' && buffer.length >= 30 && buffer.toString('ascii', 12, 16) === 'VP8 ') {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (mimeType === 'image/webp' && buffer.length >= 25 && buffer.toString('ascii', 12, 16) === 'VP8L'
    && buffer[20] === 0x2f) {
    return {
      width: 1 + buffer[21] + ((buffer[22] & 0x3f) << 8),
      height: 1 + (buffer[22] >> 6) + (buffer[23] << 2) + ((buffer[24] & 0x0f) << 10)
    };
  }
  if (mimeType === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      if (segmentLength < 2) break;
      offset += segmentLength + 2;
    }
  }
  return null;
}

function inspectLottie(buffer) {
  let document;
  try {
    document = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new AppError(400, 'INVALID_ANIMATION', 'The animation file is not valid JSON.');
  }
  if (!document || typeof document !== 'object'
    || typeof document.v !== 'string'
    || !Array.isArray(document.layers)
    || document.layers.length > 300
    || !Number.isFinite(document.fr)
    || document.fr <= 0
    || document.fr > 60
    || !Number.isFinite(document.ip)
    || !Number.isFinite(document.op)
    || document.op <= document.ip
    || document.op - document.ip > 3600
    || !Number.isInteger(document.w)
    || !Number.isInteger(document.h)
    || document.w < 1
    || document.h < 1
    || document.w > 4096
    || document.h > 4096
    || (Array.isArray(document.assets) && document.assets.length > 0)) {
    throw new AppError(400, 'INVALID_ANIMATION', 'The animation must use supported Lottie fields and cannot include external assets.');
  }

  let visited = 0;
  function inspect(value, depth = 0) {
    visited += 1;
    if (visited > 100000 || depth > 40) {
      throw new AppError(400, 'INVALID_ANIMATION', 'The animation structure is too complex.');
    }
    if (Array.isArray(value)) {
      for (const item of value) inspect(item, depth + 1);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        if (['x', 'expression', 'u'].includes(key)) {
          throw new AppError(400, 'INVALID_ANIMATION', 'Expressions and external animation references are not supported.');
        }
        if (typeof nested === 'string' && /(?:https?:|file:|javascript:|data:)/i.test(nested)) {
          throw new AppError(400, 'INVALID_ANIMATION', 'External animation references are not supported.');
        }
        inspect(nested, depth + 1);
      }
    }
  }
  inspect(document);
  return 'application/json';
}

async function verifyFile(buffer, expectedKind) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1) {
    throw new AppError(400, 'EMPTY_UPLOAD', 'Choose a non-empty media file.');
  }
  let mimeType;
  let kind;
  if (expectedKind === 'animation' && buffer[0] === 0x7b) {
    mimeType = inspectLottie(buffer);
    kind = 'animation';
  } else {
    const detected = await fileTypeFromBuffer(buffer);
    const detectedMime = detected?.mime === 'audio/x-wav' ? 'audio/wav' : detected?.mime;
    kind = ALLOWED_SIGNATURES[detectedMime];
    mimeType = detectedMime;
    if (!kind || kind !== expectedKind) {
      throw new AppError(400, 'UNSUPPORTED_MEDIA_TYPE', 'The file content does not match an allowed format for this asset type.');
    }
  }
  if (buffer.length > MAX_SIZES[expectedKind]) {
    throw new AppError(413, 'MEDIA_TOO_LARGE', `This ${expectedKind} file exceeds the allowed size.`);
  }
  const dimensions = kind === 'image' || mimeType === 'image/gif' ? imageDimensions(buffer, mimeType) : null;
  if ((kind === 'image' || mimeType === 'image/gif') && (!dimensions || dimensions.width < 1 || dimensions.height < 1
    || dimensions.width > 8192 || dimensions.height > 8192)) {
    throw new AppError(400, 'INVALID_IMAGE_DIMENSIONS', 'The image dimensions are invalid or exceed 8192 pixels.');
  }
  return { mimeType, kind, ...dimensions };
}

export function serializeAsset(asset, { includeUrl = true } = {}) {
  const record = typeof asset.toObject === 'function' ? asset.toObject() : asset;
  return {
    id: String(record._id ?? record.id),
    displayName: record.displayName,
    altText: record.altText ?? '',
    category: record.category ?? '',
    tags: record.tags ?? [],
    kind: record.kind,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    width: record.width ?? null,
    height: record.height ?? null,
    active: record.active,
    createdAt: record.createdAt,
    ...(includeUrl ? { url: `/api/v1/media/${String(record._id ?? record.id)}` } : {})
  };
}

export class MediaAssetService {
  constructor({ repository, storageDirectory, now = () => new Date() }) {
    this.repository = repository;
    this.storageDirectory = path.resolve(storageDirectory);
    this.now = now;
  }

  async initialize() {
    await mkdir(this.storageDirectory, { recursive: true, mode: 0o700 });
  }

  async listAssets() {
    const assets = await this.repository.listAssets();
    return Promise.all(assets.map(async (asset) => ({
      ...serializeAsset(asset),
      available: await this.isAvailable(asset)
    })));
  }

  async upload({ file, displayName, kind, createdBy, altText = '', category = '', tags = [] }) {
    if (!file?.buffer) throw new AppError(400, 'FILE_REQUIRED', 'Choose a media file to upload.');
    const verified = await verifyFile(file.buffer, kind);
    const storageName = randomUUID();
    const storagePath = path.join(this.storageDirectory, storageName);
    await writeFile(storagePath, file.buffer, { flag: 'wx', mode: 0o600 });
    try {
      const asset = await this.repository.createAsset({
        displayName,
        altText,
        category,
        tags,
        kind: verified.kind,
        mimeType: verified.mimeType,
        width: verified.width ?? null,
        height: verified.height ?? null,
        storageName,
        sizeBytes: file.buffer.length,
        active: true,
        createdBy,
        createdAt: this.now()
      });
      return serializeAsset(asset);
    } catch (error) {
      await rm(storagePath, { force: true });
      throw error;
    }
  }

  async updateMetadata(assetId, updates) {
    const asset = await this.repository.updateAsset(assetId, updates);
    if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'The media asset was not found.');
    return serializeAsset(asset);
  }

  async replace({ assetId, file, createdBy }) {
    if (!file?.buffer) throw new AppError(400, 'FILE_REQUIRED', 'Choose a replacement file.');
    const asset = await this.repository.findAsset(assetId);
    if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'The media asset was not found.');
    const verified = await verifyFile(file.buffer, asset.kind);
    const storageName = randomUUID();
    const storagePath = path.join(this.storageDirectory, storageName);
    await writeFile(storagePath, file.buffer, { flag: 'wx', mode: 0o600 });
    let replacement;
    try {
      replacement = await this.repository.createAsset({
        displayName: asset.displayName,
        altText: asset.altText ?? '',
        category: asset.category ?? '',
        tags: asset.tags ?? [],
        kind: verified.kind,
        mimeType: verified.mimeType,
        width: verified.width ?? null,
        height: verified.height ?? null,
        storageName,
        sizeBytes: file.buffer.length,
        active: true,
        createdBy,
        createdAt: this.now()
      });
      await this.repository.replaceDraftAssetReferences(String(assetId), String(replacement._id ?? replacement.id));
    } catch (error) {
      if (replacement) await this.repository.deleteAsset(String(replacement._id ?? replacement.id));
      await rm(storagePath, { force: true });
      throw error;
    }
    if (!(await this.repository.isAssetReferenced(String(assetId)))) {
      await this.repository.deleteAsset(String(assetId));
      await rm(path.join(this.storageDirectory, asset.storageName), { force: true });
    }
    return serializeAsset(replacement);
  }

  async setActive(assetId, active) {
    const asset = await this.repository.updateAsset(assetId, { active });
    if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'The media asset was not found.');
    return serializeAsset(asset);
  }

  async delete(assetId) {
    const asset = await this.repository.findAsset(assetId);
    if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'The media asset was not found.');
    if (await this.repository.isAssetReferenced(assetId)) {
      throw new AppError(409, 'ASSET_IN_USE', 'This asset is assigned to a draft or published game. Remove the assignments and publish the change before deleting it.');
    }
    await this.repository.deleteAsset(assetId);
    await rm(path.join(this.storageDirectory, asset.storageName), { force: true });
  }

  async readPublicAsset(assetId) {
    const asset = await this.repository.findActivePublicAsset(assetId);
    if (!asset) return null;
    const versions = await this.repository.listPublishedVersions();
    const isReferenced = versions.some((version) => version.assetIds.includes(String(assetId)));
    if (!isReferenced) return null;
    return this.readAssetFile(asset);
  }

  async readAdminAsset(assetId) {
    const asset = await this.repository.findAsset(assetId);
    if (!asset) return null;
    return this.readAssetFile(asset);
  }

  async readAssetFile(asset) {
    const filePath = path.join(this.storageDirectory, asset.storageName);
    let buffer;
    try {
      buffer = await readFile(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    const verified = await verifyFile(buffer, asset.kind);
    if (verified.mimeType !== asset.mimeType) {
      throw new AppError(500, 'MEDIA_FILE_INVALID', 'The stored media file does not match its verified metadata.');
    }
    return { buffer, asset: serializeAsset(asset, { includeUrl: false }) };
  }

  async isAvailable(asset) {
    try {
      await access(path.join(this.storageDirectory, asset.storageName));
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }
}
