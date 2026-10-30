import { Router } from 'express';
import { requireApprovedAccount, requireAuthentication, requireCsrf, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { testimonialSchema } from '../validation/testimonial.js';

export function createTestimonialsRouter({ authenticationMiddleware, testimonialService }) {
  const router = Router();

  router.get('/', async (_request, response) => {
    response.json({ testimonials: await testimonialService.listPublic() });
  });

  router.use(authenticationMiddleware, requireAuthentication, requireApprovedAccount, requireRole('parent'), requireCsrf);

  router.get('/mine', async (request, response) => {
    response.json({ testimonials: await testimonialService.listForParent(request.authenticated.user._id) });
  });

  router.post('/', validate(testimonialSchema), async (request, response) => {
    const testimonial = await testimonialService.submit(request.authenticated.user._id, request.body);
    response.status(201).json({ testimonial });
  });

  return router;
}
