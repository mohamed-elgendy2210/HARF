import mongoose from 'mongoose';

const assignmentHistorySchema = new mongoose.Schema({
  action: { type: String, enum: ['assigned', 'paused', 'resumed', 'removed', 'role-changed', 'completed'], required: true },
  reason: { type: String, trim: true, maxlength: 300, default: '' },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  source: { type: String, enum: ['automatic', 'parent', 'admin'], required: true },
  createdAt: { type: Date, required: true }
}, { _id: false, strict: 'throw' });

const assignmentSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', required: true },
  pathKey: { type: String, required: true, maxlength: 60 },
  assignmentType: { type: String, enum: ['primary', 'complementary'], required: true },
  status: { type: String, enum: ['active', 'paused', 'completed', 'removed'], default: 'active', required: true },
  source: { type: String, enum: ['automatic', 'parent', 'admin'], required: true },
  reason: { type: String, trim: true, maxlength: 300, default: '' },
  questionnaireVersion: { type: Number, default: null },
  lastSubmissionId: { type: String, trim: true, maxlength: 60, default: null },
  answers: { type: mongoose.Schema.Types.Mixed, default: null },
  history: { type: [assignmentHistorySchema], default: [] }
}, { timestamps: true, versionKey: false, strict: 'throw' });

assignmentSchema.index({ parentUserId: 1, childId: 1, pathKey: 1 }, {
  unique: true,
  name: 'unique_child_learning_path_assignment'
});
assignmentSchema.index({ parentUserId: 1, childId: 1, status: 1 }, { name: 'learning_paths_by_child' });

export const LearningPathAssignment = mongoose.models.LearningPathAssignment
  ?? mongoose.model('LearningPathAssignment', assignmentSchema);
