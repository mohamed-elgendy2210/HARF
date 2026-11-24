import mongoose from 'mongoose';

const resultSchema = new mongoose.Schema({
  providerApi: { type: String, enum: ['pending', 'passed', 'failed'], default: 'pending' },
  meetingInitialization: { type: String, enum: ['pending', 'passed', 'failed'], default: 'pending' },
  connection: { type: String, enum: ['pending', 'passed', 'failed'], default: 'pending' },
  camera: { type: String, enum: ['pending', 'manual_passed', 'failed'], default: 'pending' },
  microphone: { type: String, enum: ['pending', 'manual_passed', 'failed'], default: 'pending' },
  twoParticipants: { type: String, enum: ['pending', 'manual_passed', 'failed'], default: 'pending' }
}, { _id: false, versionKey: false, strict: 'throw' });

const adminVideoTestSchema = new mongoose.Schema({
  administratorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: String, enum: ['jitsi'], required: true },
  domain: { type: String, required: true, trim: true, lowercase: true },
  roomName: { type: String, required: true, minlength: 64, maxlength: 64 },
  secondParticipantTokenHash: { type: String, default: null, select: false },
  status: { type: String, enum: ['in_progress', 'succeeded', 'partial', 'failed', 'incomplete'], required: true },
  results: { type: resultSchema, default: () => ({}) },
  failureReason: { type: String, trim: true, maxlength: 300, default: '' },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true }
}, { timestamps: true, versionKey: false, strict: 'throw' });

adminVideoTestSchema.index({ administratorId: 1, createdAt: -1 }, { name: 'admin_video_tests_by_admin' });
adminVideoTestSchema.index({ status: 1, createdAt: -1 }, { name: 'admin_video_tests_by_status' });
adminVideoTestSchema.index({ roomName: 1 }, { unique: true, name: 'admin_video_tests_unique_room' });

export const AdminVideoTest = mongoose.models.AdminVideoTest
  ?? mongoose.model('AdminVideoTest', adminVideoTestSchema);
