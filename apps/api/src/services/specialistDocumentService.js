import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../middleware/errors.js';
import { FileStorage } from './fileStorage.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DOCUMENT_KEYS = ['profilePhoto', 'medicalCardFront', 'medicalCardBack'];
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const DOCUMENT_KEY_SET = new Set(DOCUMENT_KEYS);

export class SpecialistDocumentService {
  constructor({ storageDirectory }) {
    this.storage = new FileStorage({
      storageDirectory,
      blobPrefix: 'specialist-verification'
    });
  }

  async initialize() {
    await this.storage.initialize();
  }

  async storeRequired(files) {
    if (Object.keys(files ?? {}).some((key) => !DOCUMENT_KEY_SET.has(key))) {
      throw new AppError(400, 'INVALID_SPECIALIST_DOCUMENTS', 'Only the designated specialist image fields are accepted.');
    }
    const uploads = Object.fromEntries(DOCUMENT_KEYS.map((key) => [key, files?.[key]?.[0]]));
    const missing = DOCUMENT_KEYS.filter((key) => !uploads[key]?.buffer?.length);
    if (missing.length) {
      throw new AppError(400, 'SPECIALIST_DOCUMENTS_REQUIRED', 'ارفع الصورة الشخصية وصورتي الكارنيه الطبي من الأمام والخلف.');
    }

    const metadata = {};
    for (const key of DOCUMENT_KEYS) {
      const file = uploads[key];
      if (file.buffer.length > MAX_IMAGE_BYTES) {
        throw new AppError(413, 'SPECIALIST_DOCUMENT_TOO_LARGE', 'الحد الأقصى لكل صورة 5 ميجابايت.');
      }
      const detected = await fileTypeFromBuffer(file.buffer);
      if (!detected || !ALLOWED_IMAGE_TYPES.has(detected.mime)) {
        throw new AppError(400, 'UNSUPPORTED_SPECIALIST_DOCUMENT', 'ارفع صور PNG أو JPEG أو WebP صالحة فقط.');
      }
      metadata[key] = {
        storageName: randomUUID(),
        mimeType: detected.mime,
        sizeBytes: file.buffer.length
      };
    }

    const written = [];
    try {
      for (const key of DOCUMENT_KEYS) {
        const storageName = metadata[key].storageName;
        await this.storage.write(storageName, uploads[key].buffer, metadata[key].mimeType);
        written.push(storageName);
      }
      return metadata;
    } catch (error) {
      await Promise.all(written.map((storageName) => this.storage.remove(storageName)));
      throw error;
    }
  }

  async read(document) {
    if (!document?.storageName || !/^[a-f\d-]{36}$/i.test(document.storageName)) return null;
    const buffer = await this.storage.read(document.storageName);
    return buffer ? { buffer, mimeType: document.mimeType } : null;
  }

  async remove(documents) {
    const stored = DOCUMENT_KEYS
      .map((key) => documents?.[key]?.storageName)
      .filter((name) => typeof name === 'string' && /^[a-f\d-]{36}$/i.test(name));
    await Promise.all(stored.map((name) => this.storage.remove(name)));
  }
}
