import mongoose from 'mongoose';

const gameRewardSchema = new mongoose.Schema({
  gameId: { type: String, required: true, trim: true, maxlength: 60 },
  completionStars: { type: Number, min: 0, max: 10000, default: 5 },
  performanceBonusStars: { type: Number, min: 0, max: 10000, default: 2 },
  performanceThresholdPercent: { type: Number, min: 0, max: 100, default: 90 },
  firstCompletionBonusStars: { type: Number, min: 0, max: 10000, default: 0 },
  repeatRewardsEnabled: { type: Boolean, default: false },
  maxRepeatRewardCount: { type: Number, min: 0, max: 1000, default: 0 },
  repeatCooldownMinutes: { type: Number, min: 0, max: 43200, default: 1440 }
}, { _id: false, strict: 'throw' });

const gamificationSettingsSchema = new mongoose.Schema({
  key: { type: String, enum: ['global'], unique: true, default: 'global' },
  completionStars: { type: Number, min: 0, max: 10000, default: 5 },
  performanceBonusStars: { type: Number, min: 0, max: 10000, default: 2 },
  performanceThresholdPercent: { type: Number, min: 0, max: 100, default: 90 },
  firstCompletionBonusStars: { type: Number, min: 0, max: 10000, default: 0 },
  levelCompletionStars: { type: Number, min: 0, max: 10000, default: 20 },
  adventureCompletionStars: { type: Number, min: 0, max: 10000, default: 50 },
  repeatRewardsEnabled: { type: Boolean, default: false },
  maxRepeatRewardCount: { type: Number, min: 0, max: 1000, default: 0 },
  repeatCooldownMinutes: { type: Number, min: 0, max: 43200, default: 1440 },
  gameRewards: { type: [gameRewardSchema], default: [] },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

export const GamificationSettings = mongoose.models.GamificationSettings
  ?? mongoose.model('GamificationSettings', gamificationSettingsSchema);
