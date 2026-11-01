import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../middleware/errors.js';

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

export class PaymentReceiptService {
  constructor({ storageDirectory }) {
    this.storageDirectory = path.resolve(storageDirectory);
  }

  async initialize() {
    await mkdir(this.storageDirectory, { recursive: true, mode: 0o700 });
  }

  async store(file) {
    if (!file?.buffer?.length) throw new AppError(400, 'EMPTY_RECEIPT', 'ملف الإيصال فارغ أو غير موجود.');
    if (file.buffer.length > MAX_RECEIPT_BYTES) throw new AppError(413, 'RECEIPT_TOO_LARGE', 'الحد الأقصى لحجم الإيصال 5 ميجابايت.');
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new AppError(400, 'UNSUPPORTED_RECEIPT_TYPE', 'ارفع صورة PNG أو JPEG أو WebP أو ملف PDF صالحًا.');
    }
    const storageName = randomUUID();
    await writeFile(path.join(this.storageDirectory, storageName), file.buffer, { flag: 'wx', mode: 0o600 });
    return { storageName, mimeType: detected.mime, sizeBytes: file.buffer.length };
  }

  async read(receipt) {
    if (!receipt?.storageName) return null;
    try {
      return { buffer: await readFile(path.join(this.storageDirectory, receipt.storageName)), mimeType: receipt.mimeType };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async remove(receipt) {
    if (receipt?.storageName) await rm(path.join(this.storageDirectory, receipt.storageName), { force: true });
  }
}
