import mongoose from 'mongoose';

const childRewardSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', required: true, unique: true },
  totalStars: { type: Number, min: 0, default: 0 },
  badgeIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'RewardDefinition', default: [] },
  giftIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'RewardDefinition', default: [] }
}, { timestamps: true, versionKey: false, strict: 'throw' });

export const ChildReward = mongoose.models.ChildReward
  ?? mongoose.model('ChildReward', childRewardSchema);
