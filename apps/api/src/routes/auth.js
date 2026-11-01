import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { getSessionCookieName, getSessionCookieOptions } from '../config/cookies.js';
import { AppError } from '../middleware/errors.js';
import {
  requireApprovedAccount,
  requireAuthentication,
  requireCsrf,
  requireRole,
  requireTrustedOrigin
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  emailSchema,
  loginSchema,
  passwordResetSchema,
  registrationSchema,
  specialistProfileSchema,
  tokenSchema
} from '../validation/auth.js';

const SESSION_COOKIE_PATH = '/';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const specialistRegistrationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3, fields: 4, parts: 7, fieldNameSize: 80, fieldSize: 1024 }
});
const specialistDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3, fields: 0, parts: 3, fieldNameSize: 80 }
});

function parseUpload(upload, fileFields) {
  return (request, _response, next) => {
    upload.fields(fileFields.map((name) => ({ name, maxCount: 1 })))(request, _response, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, 'SPECIALIST_DOCUMENT_TOO_LARGE', 'الحد الأقصى لكل صورة 5 ميجابايت.'));
      }
      if (error instanceof multer.MulterError) {
        return next(new AppError(400, 'INVALID_SPECIALIST_UPLOAD', 'ارفع صورة شخصية وصورتي الكارنيه في الحقول المخصصة.'));
      }
      return next(error);
    });
  };
}

function registrationUpload(request, response, next) {
  if (!request.is('multipart/form-data')) return next();
  return parseUpload(specialistRegistrationUpload, ['profilePhoto', 'medicalCardFront', 'medicalCardBack'])(request, response, next);
}

function verificationUpload(request, response, next) {
  return parseUpload(specialistDocumentUpload, ['profilePhoto', 'medicalCardFront', 'medicalCardBack'])(request, response, next);
}

function readCookie(request, name) {
  const prefix = `${name}=`;
  const part = request.headers.cookie?.split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix));
  if (!part) return null;
  try {
    return decodeURIComponent(part.slice(prefix.length));
  } catch {
    return null;
  }
}

function setSessionCookie(response, session, config) {
  response.cookie(
    getSessionCookieName(config.isProduction),
    session.rawToken,
    getSessionCookieOptions(config.isProduction, session.expiresAt.getTime() - Date.now())
  );
}

function clearSessionCookie(response, config) {
  response.clearCookie(getSessionCookieName(config.isProduction), {
    ...getSessionCookieOptions(config.isProduction),
    path: SESSION_COOKIE_PATH
  });
}

function makeRateLimiter({ limit, windowMs }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(_request, _response, next) {
      next(new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please wait before trying again.'));
    }
  });
}

export function createAuthRouter({ authService, config, authenticationMiddleware, subscriptionService }) {
  const router = Router();
  const registrationLimiter = makeRateLimiter({ limit: 8, windowMs: 15 * 60 * 1000 });
  const loginLimiter = makeRateLimiter({ limit: 8, windowMs: 15 * 60 * 1000 });
  const emailLimiter = makeRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });
  const resetLimiter = makeRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });
  const specialistDocumentLimiter = makeRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });
  const sessionName = getSessionCookieName(config.isProduction);

  router.post('/register', registrationLimiter, registrationUpload, validate(registrationSchema), async (request, response) => {
    const result = await authService.register({ ...request.body, files: request.files });
    if (result.session) setSessionCookie(response, result.session, config);
    response.status(202).json({
      user: result.user,
      ...(result.session ? { csrfToken: result.session.csrfToken } : {}),
      message: 'If registration can proceed, check your email for next steps.'
    });
  });

  router.post('/login', loginLimiter, validate(loginSchema), async (request, response) => {
    const result = await authService.login({
      ...request.body,
      existingSessionToken: readCookie(request, sessionName)
    });
    setSessionCookie(response, result.session, config);
    response.json({ user: result.user, csrfToken: result.session.csrfToken });
  });

  router.post('/logout', authenticationMiddleware, requireAuthentication, requireCsrf, async (request, response) => {
    await authService.logout(request.sessionToken, request.authenticated.user._id);
    clearSessionCookie(response, config);
    response.status(204).end();
  });

  router.get('/session', authenticationMiddleware, (request, response) => {
    response.json(request.authenticated
      ? {
          user: authService.serializeAccount
            ? authService.serializeAccount(request.authenticated.user)
            : undefined,
          csrfToken: request.authenticated.session.csrfToken
        }
      : { user: null, role: 'visitor' });
  });

  router.get('/me', authenticationMiddleware, requireAuthentication, (request, response) => {
    response.json({ user: authService.serializeAccount(request.authenticated.user) });
  });

  if (subscriptionService) {
    router.get('/subscription', authenticationMiddleware, requireAuthentication, requireApprovedAccount, requireRole('parent'), async (request, response) => {
      response.json(await subscriptionService.getBilling(request.authenticated.user._id));
    });
  }

  router.post('/email/verify', emailLimiter, validate(tokenSchema), async (request, response) => {
    const user = await authService.verifyEmail(request.body.token);
    response.json({
      user,
      message: user.approvalStatus === 'approved'
        ? 'Email verified.'
        : 'Email verified. Your account is awaiting administrator approval.'
    });
  });

  router.post('/email/resend', emailLimiter, validate(emailSchema), async (request, response) => {
    await authService.resendVerification(request.body.email);
    response.status(202).json({ message: 'If the account needs verification, an email will be sent.' });
  });

  router.post('/password/forgot', resetLimiter, validate(emailSchema), async (request, response) => {
    await authService.requestPasswordReset(request.body.email);
    response.status(202).json({ message: 'If an eligible account exists, password recovery instructions will be sent.' });
  });

  router.post('/password/reset', resetLimiter, validate(passwordResetSchema), async (request, response) => {
    await authService.resetPassword(request.body);
    response.json({ message: 'Password updated. Sign in with your new password.' });
  });

  router.patch('/specialist/profile', authenticationMiddleware, requireAuthentication, requireCsrf, validate(specialistProfileSchema), async (request, response) => {
    if (request.authenticated.user.role !== 'specialist') {
      throw new AppError(403, 'FORBIDDEN', 'Only specialists can edit a professional profile.');
    }
    const user = await authService.updateSpecialistProfile(request.authenticated.user, request.body);
    response.json({ user });
  });

  router.post('/specialist/documents', authenticationMiddleware, requireAuthentication, requireRole('specialist'), requireCsrf, specialistDocumentLimiter, verificationUpload, async (request, response) => {
    const user = await authService.updateSpecialistDocuments(request.authenticated.user, request.files);
    response.json({ user });
  });

  return router;
}

export { readCookie };
