import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const PASSWORD_HASH_PATTERN = /^\$scrypt\$32768\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `$scrypt$32768$8$1$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password, encodedHash) {
  const match = PASSWORD_HASH_PATTERN.exec(encodedHash ?? '');
  if (!match) {
    await hashPassword(password);
    return false;
  }

  const salt = Buffer.from(match[1], 'hex');
  const expectedKey = Buffer.from(match[2], 'hex');
  const actualKey = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return timingSafeEqual(expectedKey, actualKey);
}
