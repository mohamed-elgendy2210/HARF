import pino from 'pino';

export function safeError(error) {
  const message = typeof error?.message === 'string' ? error.message : 'An unknown error occurred.';
  const redactedMessage = message
    .replace(/\b(?:mongodb(?:\+srv)?|https?):\/\/[^\s"'<>]+/gi, '[REDACTED_URL]')
    .replace(/\b(password|passwd|pwd|token|secret|api[_-]?key)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]');

  return {
    name: typeof error?.name === 'string' ? error.name : 'Error',
    message: redactedMessage.slice(0, 500)
  };
}

export function createLogger({ level = 'info', isProduction = false } = {}) {
  return pino({
    level,
    base: { service: 'harf-api' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["set-cookie"]',
        'password',
        'token',
        'accessToken',
        'refreshToken',
        'receipt',
        'consultationNotes'
      ],
      censor: '[REDACTED]'
    },
    ...(isProduction ? {} : { timestamp: pino.stdTimeFunctions.isoTime })
  });
}
