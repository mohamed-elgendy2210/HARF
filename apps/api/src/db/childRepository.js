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
      return Child.find({
        parentUserId,
        $or: [
          { status: { $in: ['active', 'archived'] } },
          { status: { $exists: false } }
        ]
      }).sort({ status: 1, createdAt: -1 });
    },
    async countChildren(parentUserId) {
      const [active, archived, pending] = await Promise.all([
        Child.countDocuments({ parentUserId, $or: [{ status: 'active' }, { status: { $exists: false } }] }),
        Child.countDocuments({ parentUserId, status: 'archived' }),
        Child.countDocuments({ parentUserId, status: 'pending_registration' })
      ]);
      return { active, archived, pending };
    },
    listParentChildCounts(parentIds) {
      return Child.aggregate([
        { $match: { parentUserId: { $in: parentIds } } },
        { $group: {
          _id: '$parentUserId',
          active: { $sum: { $cond: [{ $in: [{ $ifNull: ['$status', 'active'] }, ['active']] }, 1, 0] } },
          archived: { $sum: { $cond: [{ $eq: ['$status', 'archived'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending_registration'] }, 1, 0] } }
        } }
      ]);
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
    archiveOwnedChild(childId, parentUserId) {
      return Child.findOneAndUpdate(
        { _id: childId, parentUserId, $or: [{ status: 'active' }, { status: { $exists: false } }] },
        { $set: { status: 'archived' } },
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
