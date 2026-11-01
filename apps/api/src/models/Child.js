import mongoose from 'mongoose';

const registrationDraftSchema = new mongoose.Schema({
  step: {
    type: String,
    enum: ['questionnaire', 'review', 'recommendations', 'needs_review'],
    default: 'questionnaire'
  },
  questionnaireVersion: { type: Number, default: null },
  submissionId: { type: String, trim: true, maxlength: 60, default: null },
  answers: { type: mongoose.Schema.Types.Mixed, default: {} },
  previousDrafts: {
    type: [{
      questionnaireVersion: { type: Number, required: true },
      submissionId: { type: String, trim: true, maxlength: 60, required: true },
      answers: { type: mongoose.Schema.Types.Mixed, required: true },
      savedAt: { type: Date, required: true }
    }],
    default: []
  }
}, { _id: false, strict: 'throw' });

const childSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  registrationId: { type: String, trim: true, maxlength: 60, default: null },
  displayName: { type: String, required: true, trim: true, minlength: 1, maxlength: 50 },
  ageBand: { type: String, enum: ['3-5', '6-8', '9-12', '13+', null], default: null },
  avatar: { type: String, enum: ['cat', 'fox', 'panda', 'turtle', null], default: null },
  status: { type: String, enum: ['pending_registration', 'active', 'archived'], default: 'active', required: true },
  registrationDraft: { type: registrationDraftSchema, default: undefined }
}, {
  timestamps: true,
  versionKey: false,
  strict: 'throw'
});

childSchema.index({ parentUserId: 1, status: 1, createdAt: -1 }, { name: 'children_by_parent_status' });
childSchema.index({ parentUserId: 1, _id: 1 }, { name: 'children_owner_lookup' });
childSchema.index({ parentUserId: 1, registrationId: 1 }, {
  unique: true,
  partialFilterExpression: { registrationId: { $type: 'string' } },
  name: 'unique_child_registration_request'
});

export const Child = mongoose.models.Child ?? mongoose.model('Child', childSchema);
