import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../middleware/errors.js';
import {
  requireApprovedAccount,
  requireAuthentication,
  requireCsrf,
  requireRole
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  appointmentDecisionSchema,
  appointmentParamsSchema,
  createAppointmentSchema,
  completeAppointmentSessionSchema
} from '../validation/appointments.js';

const appointmentRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler(_request, _response, next) {
    next(new AppError(429, 'APPOINTMENT_REQUEST_RATE_LIMITED', 'طلبات المواعيد كثيرة جدًا. يرجى الانتظار قبل المحاولة مجددًا.'));
  }
});

const videoAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler(_request, _response, next) {
    next(new AppError(429, 'VIDEO_ACCESS_RATE_LIMITED', 'محاولات الانضمام كثيرة جدًا. يرجى الانتظار قبل المحاولة مجددًا.'));
  }
});

export function createAppointmentsRouter({ authenticationMiddleware, appointmentService }) {
  const router = Router();
  router.use(
    authenticationMiddleware,
    requireAuthentication,
    requireApprovedAccount,
    requireRole('parent', 'specialist')
  );

  router.get('/', async (request, response) => {
    response.json({ appointments: await appointmentService.listAppointments(request.authenticated.user) });
  });

  router.post('/', requireRole('parent'), requireCsrf, appointmentRequestLimiter, validate(createAppointmentSchema), async (request, response) => {
    const appointment = await appointmentService.createAppointment(
      request.authenticated.user,
      request.body
    );
    response.status(201).json({ appointment });
  });

  router.get('/:appointmentId', validate(appointmentParamsSchema, 'params'), async (request, response) => {
    const appointment = await appointmentService.getAppointment(
      request.authenticated.user,
      request.params.appointmentId
    );
    response.json({ appointment });
  });

  router.post('/:appointmentId/decision', requireRole('specialist'), requireCsrf, validate(appointmentParamsSchema, 'params'), validate(appointmentDecisionSchema), async (request, response) => {
    const appointment = await appointmentService.decideAppointment(
      request.authenticated.user,
      request.params.appointmentId,
      request.body
    );
    response.json({ appointment });
  });

  router.post('/:appointmentId/session/start', requireRole('specialist'), requireCsrf, validate(appointmentParamsSchema, 'params'), async (request, response) => {
    const appointment = await appointmentService.startSession(
      request.authenticated.user,
      request.params.appointmentId
    );
    response.json({ appointment });
  });

  router.post('/:appointmentId/session/complete', requireRole('specialist'), requireCsrf, validate(appointmentParamsSchema, 'params'), validate(completeAppointmentSessionSchema), async (request, response) => {
    const appointment = await appointmentService.completeSession(
      request.authenticated.user,
      request.params.appointmentId,
      request.body
    );
    response.json({ appointment });
  });

  router.post('/:appointmentId/video-access', requireCsrf, videoAccessLimiter, validate(appointmentParamsSchema, 'params'), async (request, response) => {
    response.set('Cache-Control', 'private, no-store');
    const access = await appointmentService.createVideoRoomAccess(
      request.authenticated.user,
      request.params.appointmentId
    );
    response.json({ access });
  });

  return router;
}
