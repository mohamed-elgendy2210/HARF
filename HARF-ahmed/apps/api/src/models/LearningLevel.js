import mongoose from 'mongoose';

const learningLevelSchema = new mongoose.Schema({
  learningPathKey: { type: String, required: true, trim: true, maxlength: 60, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  titleEnglish: { type: String, trim: true, maxlength: 120, default: '' },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  descriptionEnglish: { type: String, trim: true, maxlength: 500, default: '' },
  coverImageAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
  sortOrder: { type: Number, required: true, min: 0, default: 0 },
  gameIds: { type: [String], required: true, validate: [(value) => value.length > 0, 'At least one game is required.'] },
  minimumCompletedGames: { type: Number, required: true, min: 1, default: 1 },
  minimumScorePercent: { type: Number, min: 0, max: 100, default: 0 },
  mandatoryGameIds: { type: [String], default: [] },
  completionRule: {
    type: String,
    enum: ['all', 'count', 'mandatory-count', 'mandatory-score'],
    default: 'count'
  },
  additionalGamesCount: { type: Number, min: 0, default: 0 },
  unlockAfterLevelId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningLevel', default: null },
  completionReward: {
    stars: { type: Number, min: 0, max: 10000, default: null },
    badgeRewardId: { type: mongoose.Schema.Types.ObjectId, ref: 'RewardDefinition', default: null },
    giftRewardId: { type: mongoose.Schema.Types.ObjectId, ref: 'RewardDefinition', default: null }
  },
  rewardsActive: { type: Boolean, default: true },
  celebrationEnabled: { type: Boolean, default: true },
  active: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

learningLevelSchema.index({ learningPathKey: 1, sortOrder: 1 });
learningLevelSchema.index({ learningPathKey: 1, active: 1, sortOrder: 1 });

export const LearningLevel = mongoose.models.LearningLevel
  ?? mongoose.model('LearningLevel', learningLevelSchema);
