import { Router } from 'express';
import {
  requireAuthentication,
  requireApprovedAccount,
  requireCsrf,
  requireRole
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { specialistAvailabilitySchema } from '../validation/appointments.js';

export function createSpecialistRouter({ authenticationMiddleware, appointmentService }) {
  const router = Router();
  router.use(authenticationMiddleware, requireAuthentication, requireApprovedAccount, requireRole('specialist'));

  router.get('/availability', async (request, response) => {
    const availability = await appointmentService.getSpecialistAvailability(request.authenticated.user._id);
    response.json({ availability });
  });

  router.put('/availability', requireCsrf, validate(specialistAvailabilitySchema), async (request, response) => {
    const availability = await appointmentService.updateSpecialistAvailability(
      request.authenticated.user,
      request.body
    );
    response.json({ availability });
  });

  return router;
}
