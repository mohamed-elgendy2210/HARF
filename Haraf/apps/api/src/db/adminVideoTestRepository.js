import { AdminVideoTest } from '../models/AdminVideoTest.js';

export async function ensureAdminVideoTestIndexes() {
  await AdminVideoTest.createIndexes();
}

export function createAdminVideoTestRepository() {
  return {
    countRecentForAdministrator(administratorId, since) {
      return AdminVideoTest.countDocuments({ administratorId, createdAt: { $gte: since } });
    },
    expireInProgress(now) {
      return AdminVideoTest.updateMany({
        status: 'in_progress',
        expiresAt: { $lte: now }
      }, {
        $set: { status: 'incomplete', endedAt: now, secondParticipantTokenHash: null }
      });
    },
    create(data) {
      return AdminVideoTest.create(data);
    },
    findById(testId, includeSecondToken = false) {
      const query = AdminVideoTest.findById(testId);
      if (includeSecondToken) query.select('+secondParticipantTokenHash');
      return query.lean();
    },
    update(testId, updates) {
      return AdminVideoTest.findByIdAndUpdate(testId, { $set: updates }, {
        new: true,
        runValidators: true
      }).lean();
    },
    recordResults(testId, updates, now) {
      return AdminVideoTest.findOneAndUpdate({
        _id: testId,
        status: 'in_progress',
        expiresAt: { $gt: now }
      }, {
        $set: updates
      }, { new: true, runValidators: true }).lean();
    },
    consumeSecondParticipantToken(testId, tokenHash, now) {
      return AdminVideoTest.findOneAndUpdate({
        _id: testId,
        status: 'in_progress',
        expiresAt: { $gt: now },
        secondParticipantTokenHash: tokenHash
      }, {
        $set: { secondParticipantTokenHash: null }
      }, { new: true, runValidators: true }).select('+secondParticipantTokenHash').lean();
    },
    list({ page, limit, from, to, administratorId, status }) {
      const filter = {
        ...(from || to ? { createdAt: {
          ...(from ? { $gte: from } : {}),
          ...(to ? { $lte: to } : {})
        } } : {}),
        ...(administratorId ? { administratorId } : {}),
        ...(status && status !== 'all' ? { status } : {})
      };
      return Promise.all([
        AdminVideoTest.find(filter)
          .populate({ path: 'administratorId', select: 'email' })
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        AdminVideoTest.countDocuments(filter)
      ]);
    }
  };
}
