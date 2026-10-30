import mongoose from 'mongoose';

const childConsentSchema = new mongoose.Schema({
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', required: true },
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  consentType: { type: String, enum: ['learning_data', 'progress_reports'], required: true },
  granted: { type: Boolean, required: true },
  policyVersion: { type: String, required: true, trim: true, maxlength: 40 }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
  strict: 'throw'
});

childConsentSchema.index(
  { parentUserId: 1, childId: 1, consentType: 1, createdAt: -1, _id: -1 },
  { name: 'child_consent_history' }
);

export const ChildConsent = mongoose.models.ChildConsent
  ?? mongoose.model('ChildConsent', childConsentSchema);
