import mongoose from 'mongoose';

const gameSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, enum: ['trialGameId', 'trialGameIds'] },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

export const GameSetting = mongoose.models.GameSetting
  ?? mongoose.model('GameSetting', gameSettingSchema);
