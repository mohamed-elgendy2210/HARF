import mongoose from 'mongoose';

const completionSchema = new mongoose.Schema({
  gameId: { type: String, required: true, maxlength: 60 },
  completedAt: { type: Date, required: true },
  qualifyingAttempts: { type: Number, required: true, min: 2, max: 10 },
  accuracyPercent: { type: Number, required: true, min: 0, max: 100 }
}, { _id: false, strict: 'throw' });

const learningProgressSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', required: true },
  pathKey: { type: String, required: true, maxlength: 60 },
  completedActivities: { type: [completionSchema], default: [] }
}, { timestamps: true, versionKey: false, strict: 'throw' });

learningProgressSchema.index(
  { parentUserId: 1, childId: 1, pathKey: 1 },
  { unique: true, name: 'learning_progress_by_child_path' }
);

export const LearningProgress = mongoose.models.LearningProgress
  ?? mongoose.model('LearningProgress', learningProgressSchema);
