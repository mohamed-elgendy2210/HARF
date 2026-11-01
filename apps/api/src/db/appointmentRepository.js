import { Appointment } from '../models/Appointment.js';
import { SpecialistAvailability } from '../models/SpecialistAvailability.js';
import { Child } from '../models/Child.js';
import { User } from '../models/User.js';

export async function ensureAppointmentIndexes() {
  await Promise.all([Appointment.createIndexes(), SpecialistAvailability.createIndexes()]);
}

export function createAppointmentRepository() {
  return {
    findAvailability(specialistUserId) {
      return SpecialistAvailability.findOne({ specialistUserId }).lean();
    },
    listAvailabilities(specialistUserIds) {
      return SpecialistAvailability.find({ specialistUserId: { $in: specialistUserIds } }).lean();
    },
    saveAvailability(specialistUserId, data) {
      return SpecialistAvailability.findOneAndUpdate(
        { specialistUserId },
        { $set: { ...data, specialistUserId } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      ).lean();
    },
    findReservedAppointments(specialistUserId, startsBefore, endsAfter) {
      return Appointment.find({
        specialistUserId,
        slotReserved: true,
        startsAt: { $lt: startsBefore },
        endsAt: { $gt: endsAfter }
      }).select('startsAt endsAt reservationKeys').lean();
    },
    createAppointment(data) {
      return Appointment.create(data);
    },
    expirePending(now, specialistUserId) {
      return Appointment.updateMany({
        status: 'pending',
        slotReserved: true,
        expiresAt: { $lte: now },
        ...(specialistUserId ? { specialistUserId } : {})
      }, {
        $set: { status: 'expired', slotReserved: false, expiredAt: now }
      });
    },
    listParentAppointments(parentUserId) {
      return Appointment.find({ parentUserId })
        .populate({ path: 'childId', select: 'displayName' })
        .populate({ path: 'specialistUserId', select: 'professionalProfile.displayName professionalProfile.specialty professionalProfile.profilePhoto' })
        .sort({ startsAt: -1, _id: -1 }).limit(100).lean();
    },
    listSpecialistAppointments(specialistUserId) {
      return Appointment.find({ specialistUserId })
        .populate({ path: 'childId', select: 'displayName' })
        .populate({ path: 'parentUserId', select: 'parentProfile.displayName' })
        .sort({ startsAt: 1, _id: 1 }).limit(100).lean();
    },
    findOwnedAppointment(appointmentId, ownerField, userId) {
      return Appointment.findOne({ _id: appointmentId, [ownerField]: userId })
        .populate({ path: 'childId', select: 'displayName' })
        .lean();
    },
    async listAdminAppointments({ page, limit, search, from, to, bookingStatus, meetingStatus }) {
      const match = {};
      if (bookingStatus !== 'all') match.status = bookingStatus;
      if (from || to) {
        match.startsAt = {
          ...(from ? { $gte: from } : {}),
          ...(to ? { $lte: to } : {})
        };
      }
      if (meetingStatus === 'missing') match['meeting.roomName'] = { $exists: false };
      else if (meetingStatus === 'failed') {
        match.$or = [
          { 'meeting.status': 'failed' },
          { meetingProvisioningFailedAt: { $ne: null } }
        ];
      } else if (meetingStatus !== 'all') match['meeting.status'] = meetingStatus;
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pipeline = [
        { $lookup: { from: User.collection.name, localField: 'parentUserId', foreignField: '_id', as: 'parent' } },
        { $unwind: { path: '$parent', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: User.collection.name, localField: 'specialistUserId', foreignField: '_id', as: 'specialist' } },
        { $unwind: { path: '$specialist', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: Child.collection.name, localField: 'childId', foreignField: '_id', as: 'child' } },
        { $unwind: { path: '$child', preserveNullAndEmptyArrays: true } },
        ...(escapedSearch ? [{
          $match: { $or: [
            { 'parent.parentProfile.displayName': { $regex: escapedSearch, $options: 'i' } },
            { 'specialist.professionalProfile.displayName': { $regex: escapedSearch, $options: 'i' } }
          ] }
        }] : []),
        { $match: match },
        { $sort: { startsAt: -1, _id: -1 } },
        {
          $facet: {
            rows: [
              { $skip: (page - 1) * limit },
              { $limit: limit },
              { $project: {
                _id: 1, startsAt: 1, endsAt: 1, timeZone: 1, durationMinutes: 1, status: 1,
                sessionStatus: 1, sessionStartedAt: 1, sessionEndedAt: 1, meeting: 1, createdAt: 1,
                meetingProvisioningFailedAt: 1, meetingProvisioningErrorCode: 1,
                parentId: '$parent._id', parentName: '$parent.parentProfile.displayName',
                childId: '$child._id', childName: '$child.displayName',
                specialistId: '$specialist._id', specialistName: '$specialist.professionalProfile.displayName'
              } }
            ],
            count: [{ $count: 'total' }]
          }
        }
      ];
      const [result = { rows: [], count: [] }] = await Appointment.aggregate(pipeline);
      const [stats = { total: 0, withMeeting: 0, missingMeeting: 0, failedMeeting: 0, completed: 0, cancelled: 0 }] =
        await Appointment.aggregate([
          { $match: { status: 'accepted' } },
          { $group: {
            _id: null,
            total: { $sum: 1 },
            withMeeting: { $sum: { $cond: [{ $and: [
              { $ne: [{ $type: '$meeting.roomName' }, 'missing'] },
              { $ne: ['$meeting.roomName', ''] }
            ] }, 1, 0] } },
            failedMeeting: { $sum: { $cond: [{ $or: [
              { $eq: ['$meeting.status', 'failed'] },
              { $ne: [{ $ifNull: ['$meetingProvisioningFailedAt', null] }, null] }
            ] }, 1, 0] } },
            completed: { $sum: { $cond: [{ $eq: ['$sessionStatus', 'completed'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$meeting.status', 'cancelled'] }, 1, 0] } }
          } },
          { $project: { _id: 0, total: 1, withMeeting: 1, failedMeeting: 1, completed: 1, cancelled: 1,
            missingMeeting: { $subtract: ['$total', '$withMeeting'] } } }
        ]);
      return {
        appointments: result.rows,
        total: result.count[0]?.total ?? 0,
        stats
      };
    },
    findAdminAppointment(appointmentId) {
      return Appointment.findById(appointmentId)
        .populate({ path: 'childId', select: 'displayName' })
        .populate({ path: 'parentUserId', select: 'parentProfile.displayName' })
        .populate({ path: 'specialistUserId', select: 'professionalProfile.displayName professionalProfile.specialty' })
        .lean();
    },
    decideAppointment(appointmentId, specialistUserId, status, now, decisionNote) {
      return Appointment.findOneAndUpdate({
        _id: appointmentId,
        specialistUserId,
        status: 'pending',
        slotReserved: true,
        expiresAt: { $gt: now }
      }, {
        $set: {
          status,
          slotReserved: status === 'accepted',
          decidedAt: now,
          ...(status === 'accepted' ? { acceptedAt: now } : { rejectedAt: now }),
          decisionNote
        }
      }, { new: true, runValidators: true })
        .populate({ path: 'childId', select: 'displayName' })
        .lean();
    },
    startSession(appointmentId, specialistUserId, now, joinUntil, hasMeeting) {
      return Appointment.findOneAndUpdate({
        _id: appointmentId,
        specialistUserId,
        status: 'accepted',
        $or: [
          { sessionStatus: 'not_started' },
          { sessionStatus: { $exists: false } }
        ],
        startsAt: { $lte: joinUntil }
      }, {
        $set: {
          sessionStatus: 'in_progress',
          sessionStartedAt: now,
          ...(hasMeeting ? { 'meeting.status': 'live', 'meeting.startedAt': now } : {})
        }
      }, { new: true, runValidators: true }).lean();
    },
    assignMeeting(appointmentId, specialistUserId, meeting) {
      return Appointment.findOneAndUpdate({
        _id: appointmentId,
        specialistUserId,
        status: 'accepted',
        'meeting.roomName': { $exists: false }
      }, {
        $set: {
          meeting,
          meetingProvisioningFailedAt: null,
          meetingProvisioningErrorCode: ''
        }
      }, { new: true, runValidators: true }).lean();
    },
    recordMeetingProvisioningFailure(appointmentId, now, errorCode) {
      return Appointment.findOneAndUpdate({
        _id: appointmentId,
        status: 'accepted',
        'meeting.roomName': { $exists: false }
      }, {
        $set: {
          meetingProvisioningFailedAt: now,
          meetingProvisioningErrorCode: errorCode
        }
      }, { new: true, runValidators: true }).lean();
    },
    completeSession(appointmentId, specialistUserId, now, { privateNotes, parentReport, hasMeeting }) {
      return Appointment.findOneAndUpdate({
        _id: appointmentId,
        specialistUserId,
        status: 'accepted',
        sessionStatus: 'in_progress'
      }, {
        $set: {
          sessionStatus: 'completed',
          sessionEndedAt: now,
          privateSpecialistNotes: privateNotes,
          ...(hasMeeting ? { 'meeting.status': 'ended', 'meeting.endedAt': now } : {}),
          parentProgressReport: parentReport
            ? {
                summary: parentReport.summary,
                suggestedActivities: parentReport.suggestedActivities,
                createdAt: now
              }
            : null
        }
      }, { new: true, runValidators: true }).lean();
    }
  };
}
