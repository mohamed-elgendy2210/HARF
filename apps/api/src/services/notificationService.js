export class NotificationService {
  constructor({ repository, authRepository, emailService, publisher, logger }) {
    this.repository = repository;
    this.authRepository = authRepository;
    this.emailService = emailService;
    this.publisher = publisher;
    this.logger = logger;
  }

  async notify(recipientUserId, notification) {
    if (notification.actionUrl
      && (typeof notification.actionUrl !== 'string'
        || !notification.actionUrl.startsWith('/')
        || notification.actionUrl.startsWith('//')
        || notification.actionUrl.includes('\\'))) {
      throw new TypeError('Notification action URLs must be relative to the application origin.');
    }
    const saved = await this.repository.create({
      recipientUserId,
      ...notification
    });
    try {
      await this.publisher?.publish(serializeNotification(saved));
    } catch (error) {
      this.logger?.error({ error, recipientUserId, notificationType: notification.type }, 'Notification real-time delivery failed.');
    }
    try {
      const recipient = await this.authRepository.findUserById(recipientUserId);
      if (recipient?.email && this.emailService?.isConfigured()) {
        await this.emailService.sendNotification({
          email: recipient.email,
          title: notification.title,
          message: notification.message
        });
      }
    } catch (error) {
      this.logger?.error({ error, recipientUserId, notificationType: notification.type }, 'Notification email delivery failed.');
    }
    return saved;
  }

  async list(userId, options) {
    const notifications = await this.repository.listForRecipient(userId, options);
    return notifications.map(serializeNotification);
  }

  unreadCount(userId) {
    return this.repository.countUnread(userId);
  }

  count(userId) {
    return this.repository.countForRecipient(userId);
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
    actionUrl: record.actionUrl ?? null,
    readAt: record.readAt ?? null,
    createdAt: record.createdAt
  };
}
