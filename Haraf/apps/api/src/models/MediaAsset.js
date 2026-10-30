import mongoose from 'mongoose';

const mediaAssetSchema = new mongoose.Schema({
  displayName: { type: String, required: true, trim: true, maxlength: 100 },
  altText: { type: String, trim: true, maxlength: 200, default: '' },
  category: { type: String, trim: true, maxlength: 40, default: '' },
  tags: { type: [String], default: [] },
  kind: { type: String, enum: ['image', 'audio', 'animation', 'video'], required: true },
  mimeType: { type: String, enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'video/mp4', 'application/json'], required: true },
  storageName: { type: String, required: true, unique: true, match: /^[a-f\d-]{36}$/i },
  sizeBytes: { type: Number, required: true, min: 1, max: 20971520 },
  width: { type: Number, min: 1, max: 8192, default: null },
  height: { type: Number, min: 1, max: 8192, default: null },
  active: { type: Boolean, default: true, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true, versionKey: false, strict: 'throw' });

mediaAssetSchema.index({ kind: 1, active: 1, createdAt: -1 }, { name: 'media_assets_by_kind' });

export const MediaAsset = mongoose.models.MediaAsset ?? mongoose.model('MediaAsset', mediaAssetSchema);
