import { Subscription } from '../models/Subscription.js';

export async function ensureSubscriptionIndexes() {
  await Subscription.createIndexes();
}

export function createSubscriptionRepository() {
  return {
    createSubscription(data) {
      return Subscription.create(data);
    },
    findActiveSubscription(parentUserId, now) {
      return Subscription.findOne({
        parentUserId,
        startsAt: { $lte: now },
        expiresAt: { $gt: now }
      }).sort({ expiresAt: -1, createdAt: -1 }).lean();
    },
    findLatestSubscription(parentUserId) {
      return Subscription.findOne({ parentUserId }).sort({ startsAt: -1, createdAt: -1 }).lean();
    },
    listSubscriptions(parentUserId) {
      return Subscription.find({ parentUserId }).sort({ startsAt: -1, createdAt: -1 }).limit(50).lean();
    },
    findLatestUnexpiredSubscription(parentUserId, now) {
      return Subscription.findOne({ parentUserId, expiresAt: { $gt: now } })
        .sort({ expiresAt: -1, createdAt: -1 }).lean();
    }
  };
}
