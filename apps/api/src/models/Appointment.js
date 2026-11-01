import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema({
  provider: { type: String, enum: ['jitsi'], required: true },
  domain: { type: String, required: true, trim: true, lowercase: true },
  roomName: { type: String, required: true, minlength: 64, maxlength: 64 },
  status: { type: String, enum: ['scheduled', 'live', 'ended', 'cancelled', 'failed'], required: true, default: 'scheduled' },
  createdAt: { type: Date, required: true },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null }
}, { _id: false, versionKey: false, strict: 'throw' });

const appointmentSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', required: true },
  specialistUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  timeZone: { type: String, required: true },
  durationMinutes: { type: Number, required: true, min: 15, max: 240 },
  amountMinor: { type: Number, required: true, min: 100 },
  currency: { type: String, enum: ['EGP'], required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'expired'], required: true, default: 'pending' },
  requestedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  decidedAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  expiredAt: { type: Date, default: null },
  decisionNote: { type: String, trim: true, maxlength: 300, default: '' },
  sessionStatus: { type: String, enum: ['not_started', 'in_progress', 'completed'], required: true, default: 'not_started' },
  sessionStartedAt: { type: Date, default: null },
  sessionEndedAt: { type: Date, default: null },
  meeting: { type: meetingSchema, default: undefined },
  meetingProvisioningFailedAt: { type: Date, default: null },
  meetingProvisioningErrorCode: { type: String, trim: true, maxlength: 80, default: '' },
  privateSpecialistNotes: { type: String, trim: true, maxlength: 4000, default: '' },
  parentProgressReport: {
    summary: { type: String, trim: true, maxlength: 2000, default: '' },
    suggestedActivities: { type: [String], default: [] },
    createdAt: { type: Date, default: null }
  },
  slotReserved: { type: Boolean, required: true, default: true },
  reservationKeys: { type: [Date], required: true }
}, { timestamps: true, versionKey: false, strict: 'throw' });

appointmentSchema.index(
  { specialistUserId: 1, reservationKeys: 1 },
  { unique: true, partialFilterExpression: { slotReserved: true }, name: 'appointments_no_overlapping_reserved_slots' }
);
appointmentSchema.index({ parentUserId: 1, requestedAt: -1, _id: -1 }, { name: 'appointments_by_parent' });
appointmentSchema.index({ specialistUserId: 1, requestedAt: -1, _id: -1 }, { name: 'appointments_by_specialist' });
appointmentSchema.index({ status: 1, expiresAt: 1 }, { name: 'appointments_pending_expiry' });
appointmentSchema.index({ 'meeting.roomName': 1 }, {
  unique: true,
  partialFilterExpression: { 'meeting.roomName': { $type: 'string' } },
  name: 'appointments_unique_video_room'
});

export const Appointment = mongoose.models.Appointment ?? mongoose.model('Appointment', appointmentSchema);
