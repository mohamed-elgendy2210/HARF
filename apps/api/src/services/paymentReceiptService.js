import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../middleware/errors.js';
import { FileStorage } from './fileStorage.js';

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

export class PaymentReceiptService {
  constructor({ storageDirectory, blobPrefix = 'payment-receipts' }) {
    this.storage = new FileStorage({
      storageDirectory,
      blobPrefix
    });
  }

  async initialize() {
    await this.storage.initialize();
  }

  async store(file, { imagesOnly = false } = {}) {
    if (!file?.buffer?.length) throw new AppError(400, 'EMPTY_RECEIPT', 'ملف الإيصال فارغ أو غير موجود.');
    if (file.buffer.length > MAX_RECEIPT_BYTES) throw new AppError(413, 'RECEIPT_TOO_LARGE', 'الحد الأقصى لحجم الإيصال 5 ميجابايت.');
    const detected = await fileTypeFromBuffer(file.buffer);
    const allowedTypes = imagesOnly
      ? new Set(['image/png', 'image/jpeg', 'image/webp'])
      : ALLOWED_MIME_TYPES;
    if (!detected || !allowedTypes.has(detected.mime)) {
      throw new AppError(400, 'UNSUPPORTED_RECEIPT_TYPE', 'ارفع صورة PNG أو JPEG أو WebP صالحة.');
    }
    const storageName = randomUUID();
    await this.storage.write(storageName, file.buffer, detected.mime);
    return { storageName, mimeType: detected.mime, sizeBytes: file.buffer.length };
  }

  async read(receipt) {
    if (!receipt?.storageName || !/^[a-f\d-]{36}$/i.test(receipt.storageName)) return null;
    const buffer = await this.storage.read(receipt.storageName);
    return buffer ? { buffer, mimeType: receipt.mimeType } : null;
  }

  async remove(receipt) {
    if (receipt?.storageName) await this.storage.remove(receipt.storageName);
  }
}
