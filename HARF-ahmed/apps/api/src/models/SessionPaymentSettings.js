import mongoose from 'mongoose';

const sessionPaymentSettingsSchema = new mongoose.Schema({
  key: { type: String, enum: ['sessions'], unique: true, required: true, default: 'sessions' },
  enabled: { type: Boolean, required: true, default: false },
  paymentDeadlineHours: { type: Number, required: true, min: 1, max: 168, default: 24 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

export const SessionPaymentSettings = mongoose.models.SessionPaymentSettings
  ?? mongoose.model('SessionPaymentSettings', sessionPaymentSettingsSchema);
