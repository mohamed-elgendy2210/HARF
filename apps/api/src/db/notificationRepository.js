import { Notification } from '../models/Notification.js';

export async function ensureNotificationIndexes() {
  await Notification.createIndexes();
}

export function createNotificationRepository() {
  return {
    async create(data) {
      try {
        return await Notification.create(data);
      } catch (error) {
        if (error.code !== 11000 || !data.dedupeKey) throw error;
        const existing = await Notification.findOne({
          recipientUserId: data.recipientUserId,
          dedupeKey: data.dedupeKey
        });
        if (!existing) throw error;
        return existing;
      }
    },
    listForRecipient(recipientUserId, { limit = 20, offset = 0 } = {}) {
      return Notification.find({ recipientUserId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(offset)
        .limit(limit)
        .lean();
    },
    countUnread(recipientUserId) {
      return Notification.countDocuments({ recipientUserId, readAt: null });
    },
    countForRecipient(recipientUserId) {
      return Notification.countDocuments({ recipientUserId });
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
