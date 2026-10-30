import { emitKeypressEvents } from 'node:readline';
import { config } from '../config/env.js';
import { connectMongo, disconnectMongo } from '../db/mongo.js';
import { ensureAuthIndexes } from '../db/authRepository.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { User } from '../models/User.js';
import { createLogger } from '../lib/logger.js';
import { hashPassword } from '../services/passwords.js';
import { normalizeEmail } from '../services/authService.js';

function ask(question) {
  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    process.stdin.once('data', (input) => resolve(input.toString().trim()));
    process.stdin.once('error', reject);
    process.stdin.resume();
  });
}

function askSecret(question) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Administrator provisioning requires an interactive terminal so the password is not echoed.');
  }

  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let password = '';

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('keypress', onKeypress);
    };
    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('Administrator provisioning was cancelled.'));
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        process.stdout.write('\n');
        resolve(password);
        return;
      }
      if (key.name === 'backspace') {
        password = password.slice(0, -1);
        return;
      }
      if (character && !key.ctrl && !key.meta && character.length === 1) password += character;
    };
    process.stdin.on('keypress', onKeypress);
  });
}

async function main() {
  if (!config.mongodbUri) throw new Error('Set MONGODB_URI in the untracked .env before provisioning an administrator.');
  const logger = createLogger({ level: 'info', isProduction: config.isProduction });
  await connectMongo(config.mongodbUri, { isProduction: config.isProduction, logger });
  try {
    await ensureAuthIndexes();
    if (await User.exists({ role: 'admin' })) {
      throw new Error('An administrator already exists. Additional administrator provisioning is intentionally disabled in this bootstrap command.');
    }
    const email = normalizeEmail(await ask('Administrator email: '));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new Error('Enter a valid email address.');
    }
    const password = await askSecret('Administrator password (12-128 characters): ');
    if (password.length < 12 || password.length > 128) {
      throw new Error('Administrator password must be between 12 and 128 characters.');
    }

    const admin = await User.create({
      email,
      passwordHash: await hashPassword(password),
      role: 'admin',
      emailVerifiedAt: new Date(),
      approvalStatus: 'approved',
      accountStatus: 'active'
    });
    await AuditEvent.create({
      action: 'admin.bootstrap_created',
      actorUserId: admin._id,
      targetUserId: admin._id,
      success: true,
      metadata: {}
    });
    logger.info('Initial administrator created. Store credentials in an approved password manager.');
  } finally {
    await disconnectMongo();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
