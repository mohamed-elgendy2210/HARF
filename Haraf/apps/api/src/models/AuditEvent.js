import mongoose from 'mongoose';

const auditEventSchema = new mongoose.Schema({
  action: { type: String, required: true, maxlength: 80 },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  success: { type: Boolean, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, strict: 'throw' });

auditEventSchema.index({ createdAt: 1 }, { name: 'audit_created_at' });
auditEventSchema.index({ targetUserId: 1, createdAt: -1 }, { name: 'audit_target_created_at' });

export const AuditEvent = mongoose.models.AuditEvent ?? mongoose.model('AuditEvent', auditEventSchema);
