import mongoose from 'mongoose';

const questionnaireResponseSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', required: true },
  submissionId: { type: String, required: true, trim: true, maxlength: 60 },
  questionnaireVersion: { type: Number, required: true },
  ageBand: { type: String, enum: ['3-5', '6-8', '9-12', '13+', null], default: null },
  answers: { type: mongoose.Schema.Types.Mixed, required: true },
  recommendationKeys: { type: [String], default: [] },
  confirmedPathKeys: { type: [String], default: [] }
}, { timestamps: true, versionKey: false, strict: 'throw' });

questionnaireResponseSchema.index(
  { parentUserId: 1, childId: 1, submissionId: 1 },
  { unique: true, name: 'unique_child_questionnaire_submission' }
);
questionnaireResponseSchema.index({ parentUserId: 1, childId: 1, createdAt: -1 }, {
  name: 'questionnaire_responses_by_child'
});

export const LearningQuestionnaireResponse = mongoose.models.LearningQuestionnaireResponse
  ?? mongoose.model('LearningQuestionnaireResponse', questionnaireResponseSchema);
