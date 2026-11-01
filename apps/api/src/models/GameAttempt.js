import mongoose from 'mongoose';

const gameAttemptSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', required: true },
  gameId: { type: String, required: true, trim: true, maxlength: 60 },
  gameVersion: { type: String, required: true, maxlength: 20 },
  submissionId: { type: String, match: /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i },
  correctCount: { type: Number, required: true, min: 0 },
  totalQuestions: { type: Number, required: true, min: 1 },
  durationSeconds: { type: Number, required: true, min: 0, max: 3600 },
  spatialProgress: {
    level: { type: Number, min: 1, max: 5 },
    concepts: [{ type: String, enum: ['inside', 'outside', 'above', 'below', 'front', 'behind', 'next-to', 'between'] }],
    startedAt: Date,
    instructionCount: { type: Number, min: 1, max: 20 },
    correctPlacements: { type: Number, min: 0, max: 20 },
    incorrectAttempts: { type: Number, min: 0 },
    instructionReplays: { type: Number, min: 0 },
    hintCount: { type: Number, min: 0 },
    hintTypes: [{ type: String, enum: ['visual', 'demonstration'] }],
    completionPercent: { type: Number, min: 0, max: 100 },
    timeSpentSeconds: { type: Number, min: 0, max: 3600 },
    result: { type: String, enum: ['completed'] }
  },
  completedAt: { type: Date, required: true }
}, {
  versionKey: false,
  strict: 'throw'
});

gameAttemptSchema.index(
  { parentUserId: 1, childId: 1, completedAt: -1, _id: -1 },
  { name: 'game_attempts_by_child' }
);
gameAttemptSchema.index(
  { parentUserId: 1, childId: 1, gameId: 1, submissionId: 1 },
  {
    unique: true,
    partialFilterExpression: { submissionId: { $type: 'string' } },
    name: 'game_attempt_submission_idempotency'
  }
);

export const GameAttempt = mongoose.models.GameAttempt
  ?? mongoose.model('GameAttempt', gameAttemptSchema);
