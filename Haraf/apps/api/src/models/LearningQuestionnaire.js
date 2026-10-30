import mongoose from 'mongoose';

const optionSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true, maxlength: 60 },
  label: { type: String, required: true, trim: true, maxlength: 160 },
  skillIds: { type: [String], default: [] }
}, { _id: false, strict: 'throw' });

const questionSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true, maxlength: 60 },
  text: { type: String, required: true, trim: true, maxlength: 240 },
  helpText: { type: String, trim: true, maxlength: 240, default: '' },
  type: { type: String, enum: ['single', 'multiple'], required: true },
  required: { type: Boolean, default: true },
  options: { type: [optionSchema], required: true, validate: [(options) => options.length >= 2 && options.length <= 12, 'A question requires 2–12 options.'] }
}, { _id: false, strict: 'throw' });

const questionnaireSchema = new mongoose.Schema({
  version: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['published', 'archived'], default: 'published', required: true },
  maxAssignments: { type: Number, required: true, min: 1, max: 5, default: 2 },
  questions: { type: [questionSchema], required: true, validate: [(questions) => questions.length >= 1 && questions.length <= 12, 'A questionnaire requires 1–12 questions.'] },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

questionnaireSchema.index({ version: 1 }, { unique: true, name: 'learning_questionnaire_version' });
questionnaireSchema.index({ status: 1, version: -1 }, { name: 'active_learning_questionnaire' });

export const LearningQuestionnaire = mongoose.models.LearningQuestionnaire
  ?? mongoose.model('LearningQuestionnaire', questionnaireSchema);
