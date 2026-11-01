import { Testimonial } from '../models/Testimonial.js';

export async function ensureTestimonialIndexes() {
  await Testimonial.createIndexes();
}

export function createTestimonialRepository() {
  return {
    create(data) {
      return Testimonial.create(data);
    },
    findPendingByParent(parentUserId) {
      return Testimonial.findOne({ parentUserId, status: 'pending' }).lean();
    },
    listForParent(parentUserId) {
      return Testimonial.find({ parentUserId }).sort({ createdAt: -1, _id: -1 }).limit(20).lean();
    },
    listPublic() {
      return Testimonial.find({ status: 'approved' }).sort({ reviewedAt: -1, _id: -1 }).limit(12).lean();
    },
    listForAdmin() {
      return Testimonial.find().sort({ status: 1, createdAt: -1, _id: -1 }).limit(100).lean();
    },
    review(testimonialId, reviewedBy, status, reviewedAt) {
      return Testimonial.findOneAndUpdate(
        { _id: testimonialId, status: 'pending' },
        { $set: { status, reviewedBy, reviewedAt } },
        { new: true, runValidators: true }
      ).lean();
    },
    findById(testimonialId) {
      return Testimonial.findById(testimonialId).lean();
    }
  };
}
