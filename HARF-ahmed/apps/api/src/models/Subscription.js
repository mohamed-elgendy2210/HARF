import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startsAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  grantedDays: { type: Number, required: true, min: 1, max: 366 },
  period: { type: String, enum: ['monthly', 'annual'], default: 'monthly' },
  grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  source: { type: String, enum: ['administrator', 'manual_payment'], required: true, default: 'administrator' },
  reason: { type: String, trim: true, maxlength: 240 },
  paymentRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentRequest', default: null },
  amountMinor: { type: Number, min: 1 },
  currency: { type: String, enum: ['EGP'] },
  paymentMethod: { type: String, enum: ['vodafone_cash', 'instapay'] },
  transactionReference: { type: String, trim: true, maxlength: 100 }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, strict: 'throw' });

subscriptionSchema.index(
  { parentUserId: 1, startsAt: -1, expiresAt: -1 },
  { name: 'subscriptions_by_parent_period' }
);
subscriptionSchema.index({ paymentRequestId: 1 }, { unique: true, sparse: true, name: 'subscription_by_payment_request' });

export const Subscription = mongoose.models.Subscription
  ?? mongoose.model('Subscription', subscriptionSchema);
