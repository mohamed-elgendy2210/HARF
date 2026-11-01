import { timingSafeEqual } from 'node:crypto';
import { AppError } from './errors.js';

export function createAuthenticationMiddleware(authService, getSessionToken) {
  return async function authenticateRequest(request, _response, next) {
    try {
      const token = getSessionToken(request);
      request.authenticated = token ? await authService.authenticate(token) : null;
      request.sessionToken = token;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAuthentication(request, _response, next) {
  if (!request.authenticated) {
    next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to continue.'));
    return;
  }
  next();
}

export function requireApprovedAccount(request, _response, next) {
  const { user } = request.authenticated ?? {};
  if (!user
    || !user.emailVerifiedAt
    || user.accountStatus !== 'active'
    || (user.role !== 'admin' && user.approvalStatus !== 'approved')) {
    next(new AppError(403, 'ACCOUNT_NOT_APPROVED', 'Verify your email and wait for administrator approval before using protected features.'));
    return;
  }
  next();
}

export function requireRole(...roles) {
  return (request, _response, next) => {
    if (!request.authenticated || !roles.includes(request.authenticated.user.role)) {
      next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}

export function requireCsrf(request, _response, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    next();
    return;
  }
  const expectedToken = request.authenticated?.session.csrfToken;
  const suppliedToken = request.get('x-csrf-token');
  if (!expectedToken || !suppliedToken) {
    next(new AppError(403, 'CSRF_VALIDATION_FAILED', 'The request could not be verified.'));
    return;
  }
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    next(new AppError(403, 'CSRF_VALIDATION_FAILED', 'The request could not be verified.'));
    return;
  }
  next();
}

export function requireTrustedOrigin(clientOrigins) {
  return (request, _response, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      next();
      return;
    }
    const origin = request.get('origin');
    if (!origin || !clientOrigins.includes(origin)) {
      next(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'The request origin is not allowed.'));
      return;
    }
    next();
  };
}

export function requireConfiguredHttps(config) {
  return (request, response, next) => {
    if (config.isProduction && !request.secure) {
      response.status(400).json({
        error: { code: 'HTTPS_REQUIRED', message: 'Use HTTPS to access this API.' }
      });
      return;
    }
    next();
  };
}
