import mongoose from 'mongoose';

const gameDefinitionSchema = new mongoose.Schema({
  gameId: { type: String, required: true, unique: true, match: /^[a-z0-9-]{1,60}$/ },
  template: { type: String, enum: ['multiple-choice', 'matching-pairs', 'picture-matching', 'audio-choice', 'spatial-relationships'], required: true, default: 'multiple-choice' },
  draftContent: { type: mongoose.Schema.Types.Mixed, required: true },
  draftAssetIds: [{ type: String, match: /^[a-f\d]{24}$/i }],
  status: { type: String, enum: ['draft', 'published', 'unpublished'], default: 'draft', required: true },
  publishedVersion: { type: Number, default: 0, min: 0, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

gameDefinitionSchema.index({ status: 1, updatedAt: -1 }, { name: 'game_definitions_by_status' });

export const GameDefinition = mongoose.models.GameDefinition
  ?? mongoose.model('GameDefinition', gameDefinitionSchema);
