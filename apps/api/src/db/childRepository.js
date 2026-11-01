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
      return Child.find({ parentUserId }).sort({ status: 1, createdAt: -1 });
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
    createConsent(data) {
      return ChildConsent.create(data);
    },
    listConsentHistory(childId, parentUserId) {
      return ChildConsent.find({ childId, parentUserId }).sort({ createdAt: -1, _id: -1 });
    }
  };
}
