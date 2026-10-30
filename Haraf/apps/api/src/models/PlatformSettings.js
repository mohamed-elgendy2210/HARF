import mongoose from 'mongoose';

const homepageSchema = new mongoose.Schema({
  eyebrow: { type: String, trim: true, required: true, maxlength: 120 },
  title: { type: String, trim: true, required: true, maxlength: 100 },
  description: { type: String, trim: true, required: true, maxlength: 300 },
  primaryAction: { type: String, trim: true, required: true, maxlength: 50 },
  secondaryAction: { type: String, trim: true, required: true, maxlength: 50 }
}, { _id: false, strict: 'throw' });

const platformSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, enum: ['platform'] },
  logoAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
  heroImageAssetIds: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' }],
    default: [],
    validate: {
      validator: (assetIds) => assetIds.length <= 8 && new Set(assetIds.map(String)).size === assetIds.length,
      message: 'Hero images must be unique and limited to eight.'
    }
  },
  colors: {
    primary: { type: String, required: true, match: /^#[\da-f]{6}$/i },
    teal: { type: String, required: true, match: /^#[\da-f]{6}$/i },
    purple: { type: String, required: true, match: /^#[\da-f]{6}$/i },
    yellow: { type: String, required: true, match: /^#[\da-f]{6}$/i },
    coral: { type: String, required: true, match: /^#[\da-f]{6}$/i },
    ink: { type: String, default: '#273DA8', match: /^#[\da-f]{6}$/i },
    muted: { type: String, default: '#7884B5', match: /^#[\da-f]{6}$/i }
  },
  textColors: { type: mongoose.Schema.Types.Mixed, select: false },
  homepage: { type: homepageSchema, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

export const PlatformSettings = mongoose.models.PlatformSettings
  ?? mongoose.model('PlatformSettings', platformSettingsSchema);
