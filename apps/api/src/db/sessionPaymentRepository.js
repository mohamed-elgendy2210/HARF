import { Appointment } from '../models/Appointment.js';
import { Child } from '../models/Child.js';
import { SessionPaymentSettings } from '../models/SessionPaymentSettings.js';
import { User } from '../models/User.js';

export async function ensureSessionPaymentIndexes() {
  await SessionPaymentSettings.createIndexes();
}

export function createSessionPaymentRepository() {
  return {
    getSettings() {
      return SessionPaymentSettings.findOne({ key: 'sessions' }).lean();
    },
    updateSettings(updates, updatedBy) {
      return SessionPaymentSettings.findOneAndUpdate(
        { key: 'sessions' },
        { $set: { ...updates, updatedBy } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      ).lean();
    },
    findOwnedAppointment(appointmentId, parentUserId) {
      return Appointment.findOne({ _id: appointmentId, parentUserId })
        .populate({ path: 'childId', select: 'displayName' })
        .populate({ path: 'specialistUserId', select: 'professionalProfile.displayName professionalProfile.specialty' })
        .lean();
    },
    submitReceipt(appointmentId, parentUserId, now, method, receipt) {
      return Appointment.findOneAndUpdate({
        _id: appointmentId,
        parentUserId,
        status: 'awaiting_payment',
        slotReserved: true,
        'payment.status': { $in: ['awaiting_payment', 'rejected'] },
        'payment.deadline': { $gt: now }
      }, {
        $set: {
          status: 'payment_under_review',
          'payment.status': 'pending_verification',
          'payment.method': method,
          'payment.receipt': receipt,
          'payment.submittedAt': now,
          'payment.verifiedBy': null,
          'payment.verifiedAt': null,
          'payment.rejectionReason': ''
        }
      }, { new: true, runValidators: true }).lean();
    },
    async listAdminPayments({ page, limit, status, method, from, to, search = '' }) {
      const match = { 'payment.status': { $exists: true } };
      if (status !== 'all') match['payment.status'] = status;
      if (method !== 'all') match['payment.method'] = method;
      if (from || to) {
        match['payment.submittedAt'] = {
          ...(from ? { $gte: from } : {}),
          ...(to ? { $lte: to } : {})
        };
      }
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pipeline = [
        { $match: match },
        { $lookup: { from: User.collection.name, localField: 'parentUserId', foreignField: '_id', as: 'parent' } },
        { $unwind: { path: '$parent', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: User.collection.name, localField: 'specialistUserId', foreignField: '_id', as: 'specialist' } },
        { $unwind: { path: '$specialist', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: Child.collection.name, localField: 'childId', foreignField: '_id', as: 'child' } },
        { $unwind: { path: '$child', preserveNullAndEmptyArrays: true } },
        ...(escapedSearch ? [{
          $match: { $or: [
            { 'parent.parentProfile.displayName': { $regex: escapedSearch, $options: 'i' } },
            { 'parent.email': { $regex: escapedSearch, $options: 'i' } },
            { 'specialist.professionalProfile.displayName': { $regex: escapedSearch, $options: 'i' } },
            { 'child.displayName': { $regex: escapedSearch, $options: 'i' } },
            { $expr: { $regexMatch: { input: { $toString: '$_id' }, regex: escapedSearch, options: 'i' } } }
          ] }
        }] : []),
        { $sort: { 'payment.submittedAt': -1, updatedAt: -1, _id: -1 } },
        { $facet: {
          rows: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $project: {
              _id: 1, startsAt: 1, endsAt: 1, timeZone: 1, status: 1, payment: 1,
              parentUserId: { _id: '$parent._id', email: '$parent.email', parentProfile: '$parent.parentProfile' },
              childId: { _id: '$child._id', displayName: '$child.displayName' },
              specialistUserId: { _id: '$specialist._id', professionalProfile: '$specialist.professionalProfile' }
            } }
          ],
          count: [{ $count: 'total' }]
        } }
      ];
      const [[result = { rows: [], count: [] }], statusCounts] = await Promise.all([
        Appointment.aggregate(pipeline),
        Appointment.aggregate([
          { $match: { 'payment.status': { $exists: true } } },
          { $group: { _id: '$payment.status', count: { $sum: 1 } } }
        ])
      ]);
      return {
        appointments: result.rows,
        total: result.count[0]?.total ?? 0,
        stats: Object.fromEntries(statusCounts.map(({ _id, count }) => [_id, count]))
      };
    },
    findAdminPayment(appointmentId) {
      return Appointment.findOne({ _id: appointmentId, 'payment.status': { $exists: true } })
        .populate({ path: 'parentUserId', select: 'email parentProfile.displayName' })
        .populate({ path: 'childId', select: 'displayName' })
        .populate({ path: 'specialistUserId', select: 'professionalProfile.displayName professionalProfile.specialty' })
        .lean();
    },
    reviewPayment(appointmentId, reviewedBy, now, decision, decisionNote, historyEntry) {
      const approved = decision === 'approved';
      return Appointment.findOneAndUpdate({
        _id: appointmentId,
        status: 'payment_under_review',
        slotReserved: true,
        'payment.status': 'pending_verification',
        'payment.deadline': { $gt: now },
        'payment.receipt.storageName': { $type: 'string' }
      }, {
        $set: {
          status: approved ? 'accepted' : 'awaiting_payment',
          'payment.status': decision,
          'payment.verifiedBy': reviewedBy,
          'payment.verifiedAt': now,
          'payment.rejectionReason': approved ? '' : decisionNote
        },
        $push: {
          'payment.history': { ...historyEntry, status: decision, reviewedBy, reviewedAt: now, decisionNote }
        }
      }, { new: true, runValidators: true }).lean();
    },
  };
}
