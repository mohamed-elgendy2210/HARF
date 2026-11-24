import mongoose from 'mongoose';

const rewardDefinitionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  type: { type: String, enum: ['badge', 'gift', 'stars'], required: true },
  imageUrl: { type: String, trim: true, maxlength: 500, default: '' },
  imageAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
  category: { type: String, trim: true, maxlength: 60, default: 'achievement' },
  rarity: { type: String, enum: ['common', 'rare', 'epic', 'legendary'], default: 'common' },
  starAmount: { type: Number, min: 0, max: 10000, default: 0 },
  repeatable: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  unlockDescription: { type: String, trim: true, maxlength: 300, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

rewardDefinitionSchema.index({ active: 1, type: 1 });

export const RewardDefinition = mongoose.models.RewardDefinition
  ?? mongoose.model('RewardDefinition', rewardDefinitionSchema);
