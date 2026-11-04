import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errors.js';
import { requireApprovedAccount, requireAuthentication, requireCsrf } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const notificationParams = z.object({
  notificationId: z.string().regex(/^[a-f\d]{24}$/i)
}).strict();
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(5000).default(0)
}).strict();

export function createNotificationsRouter({ authenticationMiddleware, notificationService }) {
  const router = Router();
  router.use(authenticationMiddleware, requireAuthentication, requireApprovedAccount);

  router.get('/unread-count', async (request, response) => {
    response.json({ unreadCount: await notificationService.unreadCount(request.authenticated.user._id) });
  });

  router.get('/', validate(listQuery, 'query'), async (request, response) => {
    const { limit, offset } = request.validatedQuery;
    const [notifications, unreadCount, totalCount] = await Promise.all([
      notificationService.list(request.authenticated.user._id, { limit, offset }),
      notificationService.unreadCount(request.authenticated.user._id),
      notificationService.count(request.authenticated.user._id)
    ]);
    response.json({
      notifications,
      unreadCount,
      totalCount,
      nextOffset: offset + notifications.length,
      hasMore: offset + notifications.length < totalCount
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
