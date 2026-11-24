import { safeError } from '../lib/logger.js';

export class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(_request, _response, next) {
  next(new AppError(404, 'NOT_FOUND', 'The requested resource was not found.'));
}

export function errorHandler(error, request, response, _next) {
  if (response.headersSent) {
    request.log.error({ error: safeError(error) }, 'Error occurred after response headers were sent.');
    return;
  }

  const isKnown = error instanceof AppError;
  const parserError = error.type === 'entity.parse.failed' || error.type === 'entity.too.large';
  const statusCode = isKnown
    ? error.statusCode
    : error.type === 'entity.too.large'
      ? 413
      : error.type === 'entity.parse.failed'
        ? 400
        : 500;
  const code = isKnown
    ? error.code
    : error.type === 'entity.too.large'
      ? 'REQUEST_TOO_LARGE'
      : error.type === 'entity.parse.failed'
        ? 'INVALID_JSON'
        : 'INTERNAL_SERVER_ERROR';
  const message = isKnown
    ? error.message
    : parserError
      ? statusCode === 413 ? 'The request body is too large.' : 'The request body contains invalid JSON.'
      : 'An unexpected error occurred.';

  if (statusCode >= 500) {
    request.log.error({ error: safeError(error) }, 'Unhandled request error.');
  } else {
    request.log.warn({ code, statusCode }, 'Request rejected.');
  }

  const responseError = { code, message };
  if (isKnown && error.details) responseError.details = error.details;
  response.status(statusCode).json({ error: responseError });
}
