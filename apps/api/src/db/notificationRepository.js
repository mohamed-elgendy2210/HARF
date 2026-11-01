import { Notification } from '../models/Notification.js';

export async function ensureNotificationIndexes() {
  await Notification.createIndexes();
}

export function createNotificationRepository() {
  return {
    create(data) {
      return Notification.create(data);
    },
    listForRecipient(recipientUserId, limit = 50) {
      return Notification.find({ recipientUserId })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean();
    },
    markRead(notificationId, recipientUserId, now) {
      return Notification.findOneAndUpdate(
        { _id: notificationId, recipientUserId },
        { $set: { readAt: now } },
        { new: true, runValidators: true }
      ).lean();
    },
    markAllRead(recipientUserId, now) {
      return Notification.updateMany(
        { recipientUserId, readAt: null },
        { $set: { readAt: now } }
      );
    }
  };
}
