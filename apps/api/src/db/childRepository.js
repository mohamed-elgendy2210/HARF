import { Child } from '../models/Child.js';
import { ChildConsent } from '../models/ChildConsent.js';

export async function ensureChildIndexes() {
  await Promise.all([Child.createIndexes(), ChildConsent.createIndexes()]);
}

export function createChildRepository() {
  return {
    createChild(data) {
      return Child.create(data);
    },
    listChildren(parentUserId) {
      return Child.find({ parentUserId, status: { $in: ['active', 'archived'] } }).sort({ status: 1, createdAt: -1 });
    },
    async listPendingRegistrations(parentUserId) {
      return Child.find({ parentUserId, status: 'pending_registration' }).sort({ createdAt: -1 });
    },
    findRegistration(parentUserId, registrationId) {
      return Child.findOne({ parentUserId, registrationId });
    },
    findOwnedChild(childId, parentUserId) {
      return Child.findOne({ _id: childId, parentUserId });
    },
    updateOwnedChild(childId, parentUserId, updates) {
      return Child.findOneAndUpdate(
        { _id: childId, parentUserId },
        { $set: updates },
        { new: true, runValidators: true }
      );
    },
    updateRegistrationDraft(childId, parentUserId, registrationDraft) {
      return Child.findOneAndUpdate(
        { _id: childId, parentUserId, status: 'pending_registration' },
        { $set: { registrationDraft } },
        { new: true, runValidators: true }
      );
    },
    completeRegistration(childId, parentUserId) {
      return Child.findOneAndUpdate(
        { _id: childId, parentUserId, status: 'pending_registration' },
        { $set: { status: 'active' }, $unset: { registrationDraft: 1 } },
        { new: true, runValidators: true }
      );
    },
    listRegistrationReviews() {
      return Child.find({
        status: 'pending_registration',
        'registrationDraft.step': 'needs_review'
      }).select('_id parentUserId displayName ageBand createdAt updatedAt registrationDraft').sort({ updatedAt: -1 }).limit(200).lean();
    },
    createConsent(data) {
      return ChildConsent.create(data);
    },
    listConsentHistory(childId, parentUserId) {
      return ChildConsent.find({ childId, parentUserId }).sort({ createdAt: -1, _id: -1 });
    }
  };
}
