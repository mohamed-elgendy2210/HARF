import mongoose from 'mongoose';

const childSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  displayName: { type: String, required: true, trim: true, minlength: 1, maxlength: 50 },
  ageBand: { type: String, enum: ['3-5', '6-8', '9-12', '13+', null], default: null },
  avatar: { type: String, enum: ['cat', 'fox', 'panda', 'turtle', null], default: null },
  status: { type: String, enum: ['active', 'archived'], default: 'active', required: true }
}, {
  timestamps: true,
  versionKey: false,
  strict: 'throw'
});

childSchema.index({ parentUserId: 1, status: 1, createdAt: -1 }, { name: 'children_by_parent_status' });
childSchema.index({ parentUserId: 1, _id: 1 }, { name: 'children_owner_lookup' });

export const Child = mongoose.models.Child ?? mongoose.model('Child', childSchema);
