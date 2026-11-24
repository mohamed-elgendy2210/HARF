import mongoose from 'mongoose';

const childLevelProgressSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', required: true },
  learningPathKey: { type: String, required: true, trim: true, maxlength: 60 },
  levelId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningLevel', required: true },
  completedGameIds: { type: [String], default: [] },
  status: { type: String, enum: ['locked', 'available', 'in-progress', 'completed'], default: 'locked' },
  completionPercent: { type: Number, min: 0, max: 100, default: 0 },
  completedAt: { type: Date, default: null },
  rewardTransactionIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'RewardTransaction', default: [] }
}, { timestamps: true, versionKey: false, strict: 'throw' });

childLevelProgressSchema.index(
  { parentUserId: 1, childId: 1, levelId: 1 },
  { unique: true, name: 'child_level_progress_unique' }
);
childLevelProgressSchema.index({ childId: 1, learningPathKey: 1, status: 1 });

export const ChildLevelProgress = mongoose.models.ChildLevelProgress
  ?? mongoose.model('ChildLevelProgress', childLevelProgressSchema);
