import mongoose from 'mongoose';

const testimonialSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  quote: { type: String, required: true, trim: true, minlength: 10, maxlength: 600 },
  displayName: { type: String, trim: true, maxlength: 60, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

testimonialSchema.index({ status: 1, createdAt: -1 }, { name: 'testimonials_public_review_queue' });
testimonialSchema.index({ parentUserId: 1, status: 1, createdAt: -1 }, { name: 'testimonials_by_parent' });
testimonialSchema.index(
  { parentUserId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_testimonial_per_parent' }
);

export const Testimonial = mongoose.models.Testimonial
  ?? mongoose.model('Testimonial', testimonialSchema);
