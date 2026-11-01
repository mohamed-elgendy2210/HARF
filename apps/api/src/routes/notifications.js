import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errors.js';
import { requireApprovedAccount, requireAuthentication, requireCsrf } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const notificationParams = z.object({
  notificationId: z.string().regex(/^[a-f\d]{24}$/i)
}).strict();

export function createNotificationsRouter({ authenticationMiddleware, notificationService }) {
  const router = Router();
  router.use(authenticationMiddleware, requireAuthentication, requireApprovedAccount);

  router.get('/', async (request, response) => {
    const notifications = await notificationService.list(request.authenticated.user._id);
    response.json({
      notifications,
      unreadCount: notifications.filter(({ readAt }) => !readAt).length
    });
  });

  router.post('/read-all', requireCsrf, async (request, response) => {
    response.json(await notificationService.markAllRead(request.authenticated.user._id));
  });

  router.post('/:notificationId/read', requireCsrf, validate(notificationParams, 'params'), async (request, response) => {
    const notification = await notificationService.markRead(
      request.authenticated.user._id,
      request.params.notificationId
    );
    if (!notification) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'The notification was not found.');
    response.json({ notification });
  });

  return router;
}
