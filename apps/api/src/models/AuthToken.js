import mongoose from 'mongoose';

const authTokenSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  purpose: { type: String, enum: ['email_verification', 'password_reset'], required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true, versionKey: false });

authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'auth_tokens_expiry_ttl' });
authTokenSchema.index({ userId: 1, purpose: 1 }, { unique: true, name: 'auth_tokens_user_purpose_unique' });

export const AuthToken = mongoose.models.AuthToken ?? mongoose.model('AuthToken', authTokenSchema);
