import { PaymentRequest } from '../models/PaymentRequest.js';
import { Subscription } from '../models/Subscription.js';
import { SubscriptionSettings } from '../models/SubscriptionSettings.js';

export async function ensurePaymentIndexes() {
  await Promise.all([PaymentRequest.createIndexes(), SubscriptionSettings.createIndexes()]);
}

export function createPaymentRepository() {
  return {
    getSettings() {
      return SubscriptionSettings.findOne({ key: 'monthly' }).lean();
    },
    updateSettings(updates, updatedBy) {
      return SubscriptionSettings.findOneAndUpdate(
        { key: 'monthly' },
        { $set: { ...updates, updatedBy } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      ).lean();
    },
    createPaymentRequest(data) {
      return PaymentRequest.create(data);
    },
    findOwnedPayment(paymentId, parentUserId) {
      return PaymentRequest.findOne({ _id: paymentId, parentUserId }).lean();
    },
    findOpenPayment(parentUserId) {
      return PaymentRequest.findOne({ parentUserId, open: true }).lean();
    },
    listParentPayments(parentUserId) {
      return PaymentRequest.find({ parentUserId }).sort({ createdAt: -1, _id: -1 }).limit(50).lean();
    },
    listAdminPayments() {
      return PaymentRequest.find({})
        .populate({ path: 'parentUserId', select: 'email parentProfile.displayName' })
        .sort({ open: -1, createdAt: 1, _id: 1 }).limit(100).lean();
    },
    findPayment(paymentId) {
      return PaymentRequest.findById(paymentId).lean();
    },
    claimPayment(paymentId, reviewedBy, now, staleBefore) {
      return PaymentRequest.findOneAndUpdate(
        {
          _id: paymentId,
          open: true,
          status: { $in: ['pending', 'reviewing'] },
          $or: [
            { 'review.processingAt': { $exists: false } },
            { 'review.processingAt': null },
            { 'review.processingAt': { $lt: staleBefore } }
          ]
        },
        { $set: { status: 'reviewing', 'review.reviewedBy': reviewedBy, 'review.processingAt': now } },
        { new: true, runValidators: true }
      ).lean();
    },
    completePayment(paymentId, reviewedBy, reviewedAt, decisionNote, status, subscriptionId = null) {
      return PaymentRequest.findOneAndUpdate(
        { _id: paymentId, open: true, status: 'reviewing' },
        { $set: {
          status,
          open: false,
          'review.reviewedBy': reviewedBy,
          'review.reviewedAt': reviewedAt,
          'review.decisionNote': decisionNote,
          'review.processingAt': null,
          ...(subscriptionId ? { 'review.subscriptionId': subscriptionId } : {})
        } },
        { new: true, runValidators: true }
      ).lean();
    },
    releasePaymentClaim(paymentId) {
      return PaymentRequest.updateOne(
        { _id: paymentId, status: 'reviewing', open: true },
        { $set: { 'review.processingAt': null } }
      );
    },
    findSubscriptionByPayment(paymentRequestId) {
      return Subscription.findOne({ paymentRequestId }).lean();
    }
  };
}
