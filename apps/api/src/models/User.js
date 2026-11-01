import mongoose from 'mongoose';

const parentProfileSchema = new mongoose.Schema({
  displayName: { type: String, trim: true, maxlength: 80 }
}, { _id: false, strict: 'throw' });

const storedImageSchema = new mongoose.Schema({
  storageName: { type: String, required: true, match: /^[a-f\d-]{36}$/i },
  mimeType: { type: String, enum: ['image/png', 'image/jpeg', 'image/webp'], required: true },
  sizeBytes: { type: Number, required: true, min: 1, max: 5 * 1024 * 1024 }
}, { _id: false, strict: 'throw' });

const professionalProfileSchema = new mongoose.Schema({
  displayName: { type: String, trim: true, maxlength: 100 },
  specialty: { type: String, trim: true, maxlength: 100 },
  credentials: { type: String, trim: true, maxlength: 160 },
  bio: { type: String, trim: true, maxlength: 1200 },
  publicListing: { type: Boolean, default: false },
  profilePhoto: { type: storedImageSchema, default: undefined },
  medicalCardFront: { type: storedImageSchema, default: undefined },
  medicalCardBack: { type: storedImageSchema, default: undefined }
}, { _id: false, strict: 'throw' });

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['parent', 'specialist', 'admin'], required: true, immutable: true },
  emailVerifiedAt: { type: Date, default: null },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], required: true },
  accountStatus: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
  parentProfile: { type: parentProfileSchema, default: undefined },
  professionalProfile: { type: professionalProfileSchema, default: undefined }
}, {
  timestamps: true,
  strict: 'throw',
  minimize: true
});

userSchema.index({ email: 1 }, { unique: true, name: 'users_email_unique' });
userSchema.index({
  role: 1,
  approvalStatus: 1,
  accountStatus: 1,
  emailVerifiedAt: 1,
  'professionalProfile.publicListing': 1
}, { name: 'public_specialists_lookup' });

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
