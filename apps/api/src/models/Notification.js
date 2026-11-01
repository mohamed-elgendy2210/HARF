import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['account_approval', 'payment_review', 'appointment_request', 'appointment_decision', 'session_report', 'testimonial_submitted', 'testimonial_decision'], required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 300 },
  resourceType: { type: String, enum: ['account', 'payment', 'appointment', 'testimonial'], required: true },
  resourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  readAt: { type: Date, default: null }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, strict: 'throw' });

notificationSchema.index({ recipientUserId: 1, createdAt: -1, _id: -1 }, { name: 'notifications_by_recipient' });
notificationSchema.index({ recipientUserId: 1, readAt: 1, createdAt: -1 }, { name: 'notifications_unread_by_recipient' });

export const Notification = mongoose.models.Notification ?? mongoose.model('Notification', notificationSchema);
