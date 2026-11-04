import mongoose from 'mongoose';
import { ALL_NOTIFICATION_TYPES } from '../services/notificationTypes.js';

const notificationSchema = new mongoose.Schema({
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ALL_NOTIFICATION_TYPES, required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 300 },
  resourceType: { type: String, enum: ['account', 'payment', 'appointment', 'testimonial', 'child', 'subscription', 'learning_path'], required: true },
  resourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  actionUrl: { type: String, trim: true, maxlength: 300, default: null },
  dedupeKey: { type: String, trim: true, maxlength: 200, default: null },
  readAt: { type: Date, default: null }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, strict: 'throw' });

notificationSchema.index({ recipientUserId: 1, createdAt: -1, _id: -1 }, { name: 'notifications_by_recipient' });
notificationSchema.index({ recipientUserId: 1, readAt: 1, createdAt: -1 }, { name: 'notifications_unread_by_recipient' });
notificationSchema.index(
  { recipientUserId: 1, dedupeKey: 1 },
  { name: 'notifications_deduplicated', unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);

export const Notification = mongoose.models.Notification ?? mongoose.model('Notification', notificationSchema);
