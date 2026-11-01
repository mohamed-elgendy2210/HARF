import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { availabilityQuerySchema, specialistAvailabilityParamsSchema } from '../validation/appointments.js';
import { isProfessionalProfileComplete } from '../services/authService.js';

export function createDirectoryRouter({ repository, appointmentService }) {
  const router = Router();
  router.get('/specialists', async (_request, response) => {
    if (appointmentService) {
      response.json({ specialists: await appointmentService.listPublicSpecialists() });
      return;
    }
    const specialists = await repository.listPublicSpecialists();
    response.json({
      specialists: specialists
        .filter((user) => isProfessionalProfileComplete(user.professionalProfile))
        .map((user) => ({
          id: String(user._id ?? user.id),
          displayName: user.professionalProfile.displayName,
          specialty: user.professionalProfile.specialty,
          credentials: user.professionalProfile.credentials,
          bio: user.professionalProfile.bio
        }))
    });
  });
  if (appointmentService) {
    router.get('/specialists/:specialistId/photo', validate(specialistAvailabilityParamsSchema, 'params'), async (request, response) => {
      const photo = await appointmentService.getPublicProfilePhoto(request.params.specialistId);
      response.set({
        'Content-Type': photo.mimeType,
        'Content-Length': photo.buffer.length,
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      });
      response.send(photo.buffer);
    });
    router.get('/specialists/:specialistId/availability', validate(specialistAvailabilityParamsSchema, 'params'), validate(availabilityQuerySchema, 'query'), async (request, response) => {
      const availability = await appointmentService.getAvailableSlots(
        request.params.specialistId,
        request.validatedQuery
      );
      response.json({ availability });
    });
  }
  return router;
}
