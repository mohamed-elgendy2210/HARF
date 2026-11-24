import mongoose from 'mongoose';

const rewardTransactionSchema = new mongoose.Schema({
  transactionReference: { type: String, required: true, maxlength: 100 },
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', required: true },
  rewardType: { type: String, enum: ['stars', 'badge', 'gift'], required: true },
  rewardDefinitionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RewardDefinition', default: null },
  quantity: { type: Number, min: 1, max: 10000, default: 1 },
  sourceGameId: { type: String, maxlength: 60, default: null },
  sourceLevelId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningLevel', default: null },
  learningPathKey: { type: String, maxlength: 60, default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

rewardTransactionSchema.index(
  { transactionReference: 1 },
  { unique: true, name: 'reward_transaction_reference_unique' }
);
rewardTransactionSchema.index({ childId: 1, createdAt: -1 });

export const RewardTransaction = mongoose.models.RewardTransaction
  ?? mongoose.model('RewardTransaction', rewardTransactionSchema);
