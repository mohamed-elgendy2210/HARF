import mongoose from 'mongoose';

const paymentRequestSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  method: { type: String, enum: ['vodafone_cash', 'instapay'], required: true },
  period: { type: String, enum: ['monthly', 'annual'], required: true, default: 'monthly' },
  transactionReference: { type: String, required: true, trim: true, maxlength: 100 },
  amountMinor: { type: Number, required: true, min: 1 },
  currency: { type: String, required: true, enum: ['EGP'] },
  paymentInstructions: {
    recipient: { type: String, trim: true, maxlength: 120 },
    instructions: { type: String, trim: true, maxlength: 500 }
  },
  receipt: {
    storageName: { type: String, trim: true, maxlength: 80 },
    mimeType: { type: String, enum: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] },
    sizeBytes: { type: Number, min: 1, max: 5 * 1024 * 1024 }
  },
  status: { type: String, enum: ['pending', 'reviewing', 'approved', 'rejected'], default: 'pending', required: true },
  open: { type: Boolean, required: true, default: true },
  review: {
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    decisionNote: { type: String, trim: true, maxlength: 300 },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
    processingAt: { type: Date }
  }
}, { timestamps: true, versionKey: false, strict: 'throw' });

paymentRequestSchema.index({ parentUserId:  1, createdAt: -1, _id: -1 }, { name: 'payments_by_parent' });
paymentRequestSchema.index({ status: 1, createdAt: 1 }, { name: 'payments_by_review_status' });
paymentRequestSchema.index(
  { parentUserId: 1 },
  { unique: true, partialFilterExpression: { open: true }, name: 'one_open_payment_per_parent' }
);

export const PaymentRequest = mongoose.models.PaymentRequest
  ?? mongoose.model('PaymentRequest', paymentRequestSchema);
