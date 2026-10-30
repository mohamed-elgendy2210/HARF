import mongoose from 'mongoose';

const gameVersionSchema = new mongoose.Schema({
  gameId: { type: String, required: true, match: /^[a-z0-9-]{1,60}$/ },
  version: { type: Number, required: true, min: 1 },
  content: { type: mongoose.Schema.Types.Mixed, required: true },
  assetIds: [{ type: String, match: /^[a-f\d]{24}$/i }],
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publishedAt: { type: Date, required: true }
}, { versionKey: false, strict: 'throw' });

gameVersionSchema.index({ gameId: 1, version: 1 }, { unique: true, name: 'game_version_immutable' });
gameVersionSchema.index({ publishedAt: -1 }, { name: 'game_versions_by_date' });

export const GameVersion = mongoose.models.GameVersion
  ?? mongoose.model('GameVersion', gameVersionSchema);
