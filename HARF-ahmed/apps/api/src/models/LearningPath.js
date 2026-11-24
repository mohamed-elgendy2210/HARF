import mongoose from 'mongoose';

const learningActivitySchema = new mongoose.Schema({
  gameId: { type: String, required: true, trim: true, maxlength: 60 },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  learningArea: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, required: true, trim: true, maxlength: 240 },
  required: { type: Boolean, default: true },
  repeatable: { type: Boolean, default: true },
  skillIds: { type: [String], default: [] }
}, { _id: false, strict: 'throw' });

const matchingRulesSchema = new mongoose.Schema({
  skillIds: { type: [String], default: [] },
  answerOptionIds: { type: [String], default: [] },
  ageBands: { type: [String], default: [] },
  minimumMatches: { type: Number, min: 1, max: 20, default: 1 },
  priority: { type: Number, min: 0, max: 1000, default: 0 },
  assignmentType: { type: String, enum: ['primary', 'complementary', 'either'], default: 'either' }
}, { _id: false, strict: 'throw' });

const learningPathSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true, lowercase: true, match: /^[a-z0-9-]{1,60}$/ },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  activities: { type: [learningActivitySchema], required: true, validate: [(activities) => activities.length > 0, 'At least one activity is required.'] },
  rules: {
    minimumAttempts: { type: Number, required: true, min: 2, max: 10 },
    sampleSize: { type: Number, required: true, min: 2, max: 10 },
    targetAccuracyPercent: { type: Number, required: true, min: 50, max: 100 }
  },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'published', required: true },
  ageBands: { type: [String], enum: ['3-5', '6-8', '9-12', '13+'], default: [] },
  skillIds: { type: [String], default: [] },
  objectives: { type: [String], default: [] },
  matchingRules: { type: matchingRulesSchema, default: () => ({}) },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

export const LearningPath = mongoose.models.LearningPath
  ?? mongoose.model('LearningPath', learningPathSchema);
