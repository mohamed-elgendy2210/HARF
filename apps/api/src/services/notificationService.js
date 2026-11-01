export class NotificationService {
  constructor({ repository, authRepository, emailService, logger }) {
    this.repository = repository;
    this.authRepository = authRepository;
    this.emailService = emailService;
    this.logger = logger;
  }

  async notify(recipientUserId, notification) {
    const saved = await this.repository.create({
      recipientUserId,
      ...notification
    });
    const recipient = await this.authRepository.findUserById(recipientUserId);
    if (recipient?.email && this.emailService?.isConfigured()) {
      try {
        await this.emailService.sendNotification({
          email: recipient.email,
          title: notification.title,
          message: notification.message
        });
      } catch (error) {
        this.logger.error({ error, recipientUserId, notificationType: notification.type }, 'Notification email delivery failed.');
      }
    }
    return saved;
  }

  async list(userId) {
    const notifications = await this.repository.listForRecipient(userId);
    return notifications.map(serializeNotification);
  }

  async markRead(userId, notificationId, now = new Date()) {
    const notification = await this.repository.markRead(notificationId, userId, now);
    if (!notification) return null;
    return serializeNotification(notification);
  }

  async markAllRead(userId, now = new Date()) {
    const result = await this.repository.markAllRead(userId, now);
    return { modified: result.modifiedCount ?? 0 };
  }
}

function serializeNotification(notification) {
  const record = typeof notification.toObject === 'function' ? notification.toObject() : notification;
  return {
    id: String(record._id ?? record.id),
    type: record.type,
    title: record.title,
    message: record.message,
    resourceType: record.resourceType,
    resourceId: String(record.resourceId),
    readAt: record.readAt ?? null,
    createdAt: record.createdAt
  };
}
