import mongoose from 'mongoose';

const paymentMethodSchema = new mongoose.Schema({
  enabled: { type: Boolean, required: true, default: false },
  recipient: { type: String, trim: true, maxlength: 120, default: '' },
  instructions: { type: String, trim: true, maxlength: 500, default: '' }
}, { _id: false, strict: 'throw' });

const subscriptionSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, enum: ['monthly'] },
  amountMinor: { type: Number, required: true, min: 1, max: 100000000 },
  annualAmountMinor: { type: Number, min: 1, max: 100000000, default: null },
  currency: { type: String, required: true, enum: ['EGP'], default: 'EGP' },
  vodafoneCash: { type: paymentMethodSchema, required: true },
  instaPay: { type: paymentMethodSchema, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, versionKey: false, strict: 'throw' });

export const SubscriptionSettings = mongoose.models.SubscriptionSettings
  ?? mongoose.model('SubscriptionSettings', subscriptionSettingsSchema);
