import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));
dotenv.config({ path: path.join(projectRoot, '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().trim().optional(),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  CLIENT_ORIGINS: z.string().default('http://localhost:5173'),
  MEDIA_STORAGE_DIR: z.string().trim().optional(),
  TRUST_PROXY: z.string().default('false'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SMTP_HOST: z.string().trim().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.string().default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().trim().optional(),
  JITSI_DOMAIN: z.string().trim().min(1).max(253).default('meet.jit.si'),
  JITSI_PARENT_EARLY_JOIN_MINUTES: z.coerce.number().int().min(0).max(60).default(10),
  JITSI_SPECIALIST_EARLY_JOIN_MINUTES: z.coerce.number().int().min(0).max(60).default(15),
  JITSI_POST_APPOINTMENT_GRACE_MINUTES: z.coerce.number().int().min(0).max(180).default(30),
  VIDEO_TEST_LIFETIME_MINUTES: z.coerce.number().int().min(5).max(60).default(30)
});

function parseOrigins(value) {
  const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`CLIENT_ORIGINS must contain exact HTTP(S) origins, not paths: ${origin}`);
    }
  }
  return [...new Set(origins)];
}

function parseTrustProxy(value) {
  const normalized = value.trim();
  if (normalized === 'false' || normalized === '') return false;
  if (['loopback', 'linklocal', 'uniquelocal'].includes(normalized)) return normalized;
  if (/^\d+$/.test(normalized)) {
    const hops = Number(normalized);
    if (hops < 1) throw new Error('TRUST_PROXY hop count must be greater than zero.');
    return hops;
  }
  const proxies = normalized.split(',').map((proxy) => proxy.trim()).filter(Boolean);
  const invalidProxy = proxies.some((proxy) => {
    const [address, prefix, ...extra] = proxy.split('/');
    const ipVersion = isIP(address);
    const prefixLimit = ipVersion === 4 ? 32 : 128;
    return ipVersion === 0
      || extra.length > 0
      || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > prefixLimit));
  });
  if (invalidProxy) {
    throw new Error('TRUST_PROXY must be false, a reviewed preset, a hop count, or a comma-separated list of proxy addresses.');
  }
  return proxies;
}

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

const values = parsed.data;
const jitsiDomain = values.JITSI_DOMAIN.toLowerCase();
if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/.test(jitsiDomain)) {
  throw new Error('JITSI_DOMAIN must be a hostname without a scheme, port, or path.');
}
const mediaStorageDir = path.resolve(values.MEDIA_STORAGE_DIR || path.join(projectRoot, '..', 'harf-media'));
const mediaRelativePath = path.relative(projectRoot, mediaStorageDir);
if (mediaRelativePath === '' || (
  mediaRelativePath !== '..'
  && !mediaRelativePath.startsWith(`..${path.sep}`)
  && !path.isAbsolute(mediaRelativePath)
)) {
  throw new Error('MEDIA_STORAGE_DIR must be outside the project directory.');
}
const clientOrigins = parseOrigins(values.CLIENT_ORIGINS);
const appOrigin = new URL(values.APP_ORIGIN).origin;
if (!clientOrigins.includes(appOrigin)) {
  throw new Error('APP_ORIGIN must also be included in CLIENT_ORIGINS.');
}
if (values.NODE_ENV === 'production' && !values.MONGODB_URI) {
  throw new Error('MONGODB_URI is required in production.');
}
if (values.NODE_ENV === 'production') {
  if (new URL(appOrigin).protocol !== 'https:' || clientOrigins.some((origin) => new URL(origin).protocol !== 'https:')) {
    throw new Error('APP_ORIGIN and CLIENT_ORIGINS must use HTTPS in production.');
  }
  if (!values.SMTP_HOST || !values.SMTP_FROM) {
    throw new Error('SMTP_HOST and SMTP_FROM are required in production.');
  }
  if ((values.SMTP_USER && !values.SMTP_PASSWORD) || (!values.SMTP_USER && values.SMTP_PASSWORD)) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together.');
  }
}
const smtpSecure = values.SMTP_SECURE === 'true';
if (!['true', 'false'].includes(values.SMTP_SECURE)) {
  throw new Error('SMTP_SECURE must be true or false.');
}
if ((values.SMTP_USER || values.SMTP_PASSWORD) && !values.SMTP_HOST) {
  throw new Error('SMTP_HOST is required when SMTP authentication is configured.');
}
if ((values.SMTP_USER || values.SMTP_PASSWORD) && !values.SMTP_FROM) {
  throw new Error('SMTP_FROM is required when SMTP authentication is configured.');
}

export const config = Object.freeze({
  nodeEnv: values.NODE_ENV,
  isProduction: values.NODE_ENV === 'production',
  host: values.HOST,
  port: values.PORT,
  mongodbUri: values.MONGODB_URI,
  appOrigin,
  clientOrigins,
  mediaStorageDir,
  trustProxy: parseTrustProxy(values.TRUST_PROXY),
  logLevel: values.LOG_LEVEL,
  jitsi: Object.freeze({
    domain: jitsiDomain,
    parentEarlyJoinMinutes: values.JITSI_PARENT_EARLY_JOIN_MINUTES,
    specialistEarlyJoinMinutes: values.JITSI_SPECIALIST_EARLY_JOIN_MINUTES,
    postAppointmentGraceMinutes: values.JITSI_POST_APPOINTMENT_GRACE_MINUTES
  }),
  videoTestLifetimeMinutes: values.VIDEO_TEST_LIFETIME_MINUTES,
  smtp: values.SMTP_HOST && values.SMTP_FROM
    ? Object.freeze({
        host: values.SMTP_HOST,
        port: values.SMTP_PORT,
        secure: smtpSecure,
        user: values.SMTP_USER,
        password: values.SMTP_PASSWORD,
        from: values.SMTP_FROM
      })
    : null
});
