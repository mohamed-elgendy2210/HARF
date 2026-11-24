import mongoose from 'mongoose';

const gameAnswerReceiptSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', required: true },
  gameId: { type: String, required: true, trim: true, maxlength: 60 },
  gameVersion: { type: String, required: true, maxlength: 20 },
  submissionId: {
    type: String,
    required: true,
    match: /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i
  },
  questionIndex: { type: Number, required: true, min: 0, max: 19 },
  answerIndex: { type: Number, required: true, min: -1, max: 9 },
  correct: { type: Boolean, required: true },
  spatialMetrics: {
    attempts: { type: Number, min: 0, default: 0 },
    incorrectAttempts: { type: Number, min: 0, default: 0 },
    instructionReplays: { type: Number, min: 0, default: 0 },
    hintsUsed: { type: Number, min: 0, default: 0 },
    demonstrationsUsed: { type: Number, min: 0, default: 0 },
    startedAt: { type: Date, default: null }
  },
  expiresAt: { type: Date, required: true }
}, { versionKey: false, strict: 'throw' });

gameAnswerReceiptSchema.index(
  { parentUserId: 1, childId: 1, gameId: 1, submissionId: 1, questionIndex: 1 },
  { unique: true, name: 'game_answer_receipt_session_question' }
);
gameAnswerReceiptSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'game_answer_receipt_expiry' }
);

export const GameAnswerReceipt = mongoose.models.GameAnswerReceipt
  ?? mongoose.model('GameAnswerReceipt', gameAnswerReceiptSchema);
