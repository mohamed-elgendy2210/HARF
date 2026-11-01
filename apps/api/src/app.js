import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { AppError, errorHandler, notFoundHandler } from './middleware/errors.js';
import { requireConfiguredHttps, requireTrustedOrigin } from './middleware/auth.js';
import { createAuthenticationMiddleware } from './middleware/auth.js';
import { getSessionCookieName } from './config/cookies.js';
import { createAuthRouter, readCookie } from './routes/auth.js';
import { createAdminRouter } from './routes/admin.js';
import { createDirectoryRouter } from './routes/directory.js';
import { createChildrenRouter } from './routes/children.js';
import { createGamesRouter } from './routes/games.js';
import { createMediaRouter } from './routes/media.js';
import { createPaymentsRouter } from './routes/payments.js';
import { createAppointmentsRouter } from './routes/appointments.js';
import { createSpecialistRouter } from './routes/specialist.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createPlatformRouter } from './routes/platform.js';
import { createTestimonialsRouter } from './routes/testimonials.js';

const API_PREFIX = '/api/v1';

function requireDatabase(getDatabaseState) {
  return (_request, _response, next) => {
    if (getDatabaseState() !== 1) {
      next(new AppError(503, 'DATABASE_UNAVAILABLE', 'The service is temporarily unavailable.'));
      return;
    }
    next();
  };
}

export function createApp({
  config,
  logger,
  getDatabaseState,
  authService,
  repository,
  childService,
  gameService,
  gameLibraryService,
  learningPathService,
  subscriptionService,
  appointmentService,
  specialistDocumentService,
  notificationService,
  reportService,
  platformSettingsService,
  testimonialService,
  adminVideoTestService
}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({
    strictTransportSecurity: config.isProduction ? undefined : false
  }));
  app.use(pinoHttp({
    logger,
    serializers: {
      req(request) {
        return { method: request.method, url: request.url.split('?')[0] };
      },
      res(response) {
        return { statusCode: response.statusCode };
      }
    },
    autoLogging: {
      ignore: (request) => request.url.startsWith(`${API_PREFIX}/health/live`)
    }
  }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.clientOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new AppError(403, 'CORS_ORIGIN_DENIED', 'This browser origin is not allowed.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-CSRF-Token']
  }));
  app.get(`${API_PREFIX}/health/live`, (_request, response) => {
    response.json({ status: 'ok', service: 'harf-api' });
  });

  app.get(`${API_PREFIX}/health/ready`, (_request, response) => {
    const databaseReady = getDatabaseState() === 1;
    response.status(databaseReady ? 200 : 503).json({
      status: databaseReady ? 'ready' : 'not-ready',
      database: databaseReady ? 'connected' : 'disconnected'
    });
  });

  app.use(`${API_PREFIX}/`, requireConfiguredHttps(config));
  app.use(`${API_PREFIX}/`, requireTrustedOrigin(config.clientOrigins));
  app.use(express.json({ limit: '32kb', strict: true }));
  if (gameService && authService) {
    const databaseMiddleware = requireDatabase(getDatabaseState);
    const authenticationMiddleware = createAuthenticationMiddleware(
      authService,
      (request) => readCookie(request, getSessionCookieName(config.isProduction))
    );
    app.use(`${API_PREFIX}/games`, createGamesRouter({
      gameService,
      authenticationMiddleware,
      databaseMiddleware,
      learningPathService,
      subscriptionService
    }));
    if (gameLibraryService) {
      app.use(`${API_PREFIX}/media`, databaseMiddleware, createMediaRouter({ gameLibraryService }));
    }
  }
  if (authService && repository) {
    const databaseMiddleware = requireDatabase(getDatabaseState);
    const authenticationMiddleware = createAuthenticationMiddleware(
      authService,
      (request) => readCookie(request, getSessionCookieName(config.isProduction))
    );
    if (notificationService) {
      app.use(`${API_PREFIX}/notifications`, requireDatabase(getDatabaseState), createNotificationsRouter({
        authenticationMiddleware,
        notificationService
      }));
    }
    app.use(`${API_PREFIX}/auth`, databaseMiddleware);
    app.use(`${API_PREFIX}/auth`, createAuthRouter({
      authService,
      config,
      authenticationMiddleware,
      subscriptionService
    }));
    if (subscriptionService) {
      app.use(`${API_PREFIX}/payments`, databaseMiddleware, createPaymentsRouter({
        authenticationMiddleware,
        subscriptionService
      }));
    }
    if (platformSettingsService) {
      app.use(`${API_PREFIX}/platform`, databaseMiddleware, createPlatformRouter({ platformSettingsService }));
    }
    if (testimonialService) {
      app.use(`${API_PREFIX}/testimonials`, databaseMiddleware, createTestimonialsRouter({
        authenticationMiddleware,
        testimonialService
      }));
    }
    app.use(`${API_PREFIX}/admin`, databaseMiddleware);
    app.use(`${API_PREFIX}/admin`, createAdminRouter({
      authService,
      authenticationMiddleware,
      gameLibraryService,
      learningPathService,
      subscriptionService,
      reportService,
      notificationService,
      specialistDocumentService,
      platformSettingsService,
      testimonialService,
      appointmentService,
      adminVideoTestService
    }));
    app.use(`${API_PREFIX}/directory`, databaseMiddleware);
    app.use(`${API_PREFIX}/directory`, createDirectoryRouter({ repository, appointmentService }));
    if (appointmentService) {
      app.use(`${API_PREFIX}/specialist`, databaseMiddleware);
      app.use(`${API_PREFIX}/specialist`, createSpecialistRouter({
        authenticationMiddleware,
        appointmentService
      }));
      app.use(`${API_PREFIX}/appointments`, databaseMiddleware);
      app.use(`${API_PREFIX}/appointments`, createAppointmentsRouter({
        authenticationMiddleware,
        appointmentService
      }));
    }
    if (childService) {
      app.use(`${API_PREFIX}/children`, databaseMiddleware);
      app.use(`${API_PREFIX}/children`, createChildrenRouter({
        childService,
        gameService,
        learningPathService,
        authenticationMiddleware
      }));
    }
  }
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
