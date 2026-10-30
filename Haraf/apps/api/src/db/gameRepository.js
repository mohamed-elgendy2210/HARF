import mongoose from 'mongoose';
import { GameAttempt } from '../models/GameAttempt.js';
import { GameAnswerReceipt } from '../models/GameAnswerReceipt.js';
import { ensureGameLibraryIndexes } from './gameLibraryRepository.js';

export async function ensureGameIndexes() {
  await Promise.all([
    GameAttempt.createIndexes(),
    GameAnswerReceipt.createIndexes(),
    ensureGameLibraryIndexes()
  ]);
}

export function createGameRepository() {
  return {
    async recordAnswerReceipt(data) {
      const filter = {
        parentUserId: data.parentUserId,
        childId: data.childId,
        gameId: data.gameId,
        submissionId: data.submissionId,
        questionIndex: data.questionIndex
      };
      try {
        return await GameAnswerReceipt.findOneAndUpdate(
          filter,
          { $set: data },
          { new: true, upsert: true, runValidators: true }
        );
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const existing = await GameAnswerReceipt.findOne(filter);
        if (!existing) throw error;
        return existing;
      }
    },
    async recordSpatialReceipt(data) {
      const filter = {
        parentUserId: data.parentUserId,
        childId: data.childId,
        gameId: data.gameId,
        submissionId: data.submissionId,
        questionIndex: data.questionIndex
      };
      const increments = {
        ...(data.action === 'placement' ? { 'spatialMetrics.attempts': 1 } : {}),
        ...(data.action === 'placement' && !data.correct ? { 'spatialMetrics.incorrectAttempts': 1 } : {}),
        ...(data.action === 'instruction_replay' ? { 'spatialMetrics.instructionReplays': 1 } : {}),
        ...(data.action === 'hint' ? { 'spatialMetrics.hintsUsed': 1 } : {}),
        ...(data.action === 'demonstration' ? { 'spatialMetrics.demonstrationsUsed': 1 } : {})
      };
      const update = {
        $setOnInsert: {
          ...filter,
          gameVersion: data.gameVersion,
          expiresAt: data.expiresAt,
          'spatialMetrics.startedAt': data.now,
          ...(data.action === 'placement' ? {} : { answerIndex: -1, correct: false })
        }
      };
      if (Object.keys(increments).length) update.$inc = increments;
      if (data.action === 'placement') {
        update.$set = { correct: data.correct, answerIndex: data.correct ? 0 : -1 };
      }
      try {
        return await GameAnswerReceipt.findOneAndUpdate(filter, update, {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: false
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const existing = await GameAnswerReceipt.findOneAndUpdate(filter, update, {
          new: true,
          runValidators: true,
          setDefaultsOnInsert: false
        });
        if (!existing) throw error;
        return existing;
      }
    },
    listAnswerReceipts({ parentUserId, childId, gameId, gameVersion, submissionId }) {
      return GameAnswerReceipt.find({
        parentUserId,
        childId,
        gameId,
        gameVersion,
        submissionId,
        expiresAt: { $gt: new Date() }
      }).sort({ questionIndex: 1 });
    },
    deleteAnswerReceipts({ parentUserId, childId, gameId, submissionId }) {
      return GameAnswerReceipt.deleteMany({ parentUserId, childId, gameId, submissionId });
    },
    findAttemptBySubmission({ parentUserId, childId, gameId, submissionId }) {
      return GameAttempt.findOne({ parentUserId, childId, gameId, submissionId });
    },
    async createAttempt(data) {
      if (data.submissionId) {
        const filter = {
          parentUserId: data.parentUserId,
          childId: data.childId,
          gameId: data.gameId,
          submissionId: data.submissionId
        };
        try {
          return await GameAttempt.findOneAndUpdate(
            filter,
            { $setOnInsert: data },
            { new: true, upsert: true, runValidators: true }
          );
        } catch (error) {
          if (error?.code !== 11000) throw error;
          const existing = await GameAttempt.findOne(filter);
          if (!existing) throw error;
          return existing;
        }
      }
      return GameAttempt.create(data);
    },
    async listChildAttempts(parentUserId, childId, { page, limit, gameId }) {
      const filter = { parentUserId, childId };
      if (gameId) filter.gameId = gameId;
      const [attempts, total] = await Promise.all([
        GameAttempt.find(filter)
          .sort({ completedAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        GameAttempt.countDocuments(filter)
      ]);
      return { attempts, total };
    },
    getChildActivityResults(parentUserId, childId, gameIds, sampleSize) {
      if (!gameIds.length) return [];
      return GameAttempt.aggregate([
        {
          $match: {
            parentUserId: parentUserId instanceof mongoose.Types.ObjectId
              ? parentUserId
              : new mongoose.Types.ObjectId(String(parentUserId)),
            childId: childId instanceof mongoose.Types.ObjectId
              ? childId
              : new mongoose.Types.ObjectId(String(childId)),
            gameId: { $in: gameIds }
          }
        },
        { $sort: { completedAt: -1, _id: -1 } },
        {
          $group: {
            _id: '$gameId',
            attemptCount: { $sum: 1 },
            recentAttempts: {
              $topN: {
                output: {
                  correctCount: '$correctCount',
                  totalQuestions: '$totalQuestions',
                  completedAt: '$completedAt'
                },
                sortBy: { completedAt: -1, _id: -1 },
                n: sampleSize
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            gameId: '$_id',
            attemptCount: 1,
            recentAttempts: 1
          }
        }
      ]);
    }
  };
}
