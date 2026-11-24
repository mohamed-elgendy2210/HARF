import { Router } from 'express';
import {
  requireAuthentication,
  requireApprovedAccount,
  requireCsrf,
  requireRole
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { specialistAvailabilitySchema } from '../validation/appointments.js';
import { gamificationChildParamsSchema } from '../validation/gamification.js';

export function createSpecialistRouter({ authenticationMiddleware, appointmentService, gamificationService }) {
  const router = Router();
  router.use(authenticationMiddleware, requireAuthentication, requireApprovedAccount, requireRole('specialist'));

  router.get('/availability', async (request, response) => {
    const availability = await appointmentService.getSpecialistAvailability(request.authenticated.user._id);
    response.json({ availability });
  });

  if (gamificationService) {
    router.get('/children/:childId/learning-journey', validate(gamificationChildParamsSchema, 'params'), async (request, response) => {
      response.set('Cache-Control', 'private, no-store');
      await appointmentService.assertSpecialistAssignedChild(
        request.authenticated.user._id,
        request.params.childId
      );
      response.json(await gamificationService.getSpecialistChildJourney(request.params.childId));
    });
  }

  router.put('/availability', requireCsrf, validate(specialistAvailabilitySchema), async (request, response) => {
    const availability = await appointmentService.updateSpecialistAvailability(
      request.authenticated.user,
      request.body
    );
    response.json({ availability });
  });

  return router;
}
