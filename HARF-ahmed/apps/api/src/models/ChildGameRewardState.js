import mongoose from 'mongoose';

const childGameRewardStateSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', required: true },
  gameId: { type: String, required: true, trim: true, maxlength: 60 },
  firstCompletedAt: { type: Date, default: null },
  firstAttemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameAttempt', default: null },
  repeatRewardCount: { type: Number, min: 0, default: 0 },
  lastRepeatRewardAt: { type: Date, default: null },
  lastRepeatRewardAttemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameAttempt', default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

childGameRewardStateSchema.index(
  { childId: 1, gameId: 1 },
  { unique: true, name: 'child_game_reward_state_unique' }
);

export const ChildGameRewardState = mongoose.models.ChildGameRewardState
  ?? mongoose.model('ChildGameRewardState', childGameRewardStateSchema);
