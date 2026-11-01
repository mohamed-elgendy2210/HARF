import { AppError } from '../middleware/errors.js';
import { getGame, getPlayableGame, listGames, scoreGame } from '../games/catalog.js';
import { validateSpatialPlacement } from '../games/spatialValidation.js';

function serializeAttempt(attempt) {
  const record = typeof attempt.toObject === 'function' ? attempt.toObject() : attempt;
  return {
    id: String(record._id ?? record.id),
    childId: String(record.childId),
    gameId: record.gameId,
    gameVersion: record.gameVersion,
    correctCount: record.correctCount,
    totalQuestions: record.totalQuestions,
    durationSeconds: record.durationSeconds,
    ...(record.spatialProgress ? { spatialProgress: record.spatialProgress } : {}),
    completedAt: record.completedAt
  };
}

export class GameService {
  constructor({
    repository,
    childService,
    gameLibraryService = null,
    learningPathService = null,
    subscriptionService = null,
    now = () => new Date()
  }) {
    this.repository = repository;
    this.childService = childService;
    this.gameLibraryService = gameLibraryService;
    this.learningPathService = learningPathService;
    this.subscriptionService = subscriptionService;
    this.now = now;
  }

  async listGames() {
    if (this.gameLibraryService) return this.gameLibraryService.getPublicGames();
    return listGames();
  }

  async getGame(gameId) {
    if (this.gameLibraryService) {
      const [game, trialGameIds] = await Promise.all([
        this.gameLibraryService.getPlayableGame(gameId),
        this.gameLibraryService.getTrialGameIds()
      ]);
      if (!game) throw new AppError(404, 'GAME_NOT_FOUND', 'The game was not found.');
      return {
        ...game,
        access: trialGameIds.includes(gameId) ? 'trial' : 'parent'
      };
    }
    const game = getPlayableGame(gameId);
    if (!game) throw new AppError(404, 'GAME_NOT_FOUND', 'The game was not found.');
    return game;
  }

  async checkAnswer(gameId, {
    questionIndex,
    answerIndex,
    gameVersion,
    submissionId,
    parentUserId,
    childId,
    action,
    position
  }) {
    const game = this.gameLibraryService
      ? await this.gameLibraryService.getScoringGame(gameId, gameVersion ?? null)
      : getGame(gameId);
    if (!game) throw new AppError(404, 'GAME_NOT_FOUND', 'The game was not found.');
    const content = this.gameLibraryService ? game.content : game;
    if (content.template === 'spatial-relationships') {
      if (!action) throw new AppError(400, 'SPATIAL_INTERACTION_REQUIRED', 'A spatial placement or activity event is required.');
      const spatial = content.spatial;
      if (!spatial?.steps[questionIndex]) {
        throw new AppError(400, 'INVALID_GAME_ANSWER', 'The spatial instruction does not exist.');
      }
      if (parentUserId && (!childId || !submissionId)) {
        throw new AppError(400, 'GAME_SESSION_REQUIRED', 'اختر ملف الطفل وابدأ جلسة جديدة قبل تسجيل التفاعل.');
      }
      if (parentUserId) {
        const child = await this.childService.getOwnedChild(parentUserId, childId);
        if (child.status !== 'active') {
          throw new AppError(409, 'CHILD_PROFILE_ARCHIVED', 'Reactivate this child profile before starting a game.');
        }
        const consents = await this.childService.listConsents(parentUserId, childId);
        if (!consents.some(({ consentType, granted }) => consentType === 'learning_data' && granted)) {
          throw new AppError(403, 'LEARNING_CONSENT_REQUIRED', 'The parent must enable learning-data consent before this activity can be saved.');
        }
      }
      const correct = action === 'placement'
        ? validateSpatialPlacement(spatial, questionIndex, position)
        : null;
      let receipt = null;
      if (parentUserId) {
        receipt = await this.repository.recordSpatialReceipt({
          parentUserId,
          childId,
          gameId,
          gameVersion: String(game.version),
          submissionId,
          questionIndex,
          action,
          correct,
          now: this.now(),
          expiresAt: new Date(this.now().getTime() + 24 * 60 * 60 * 1000)
        });
      }
      const incorrectAttempts = receipt?.spatialMetrics?.incorrectAttempts ?? 0;
      return {
        ...(action === 'placement' ? { correct } : {}),
        assistance: {
          visualHint: spatial.assistance.enabled
            && incorrectAttempts >= spatial.assistance.visualHintAfter,
          demonstration: spatial.assistance.enabled
            && incorrectAttempts >= spatial.assistance.demonstrationAfter
        }
      };
    }
    const questions = this.gameLibraryService ? game.content.questions : game.questions;
    const question = questions[questionIndex];
    if (!question || (answerIndex !== -1 && answerIndex >= question.options.length)) {
      throw new AppError(400, 'INVALID_GAME_ANSWER', 'The answer does not match this game question.');
    }

    const correct = answerIndex !== -1 && answerIndex === question.correctAnswerIndex;
    if (parentUserId) {
      if (!childId || !submissionId) {
        throw new AppError(400, 'GAME_SESSION_REQUIRED', 'اختر ملف الطفل وابدأ جلسة جديدة قبل تسجيل الإجابة.');
      }
      await this.repository.recordAnswerReceipt({
        parentUserId,
        childId,
        gameId,
        gameVersion: String(game.version),
        submissionId,
        questionIndex,
        answerIndex,
        correct,
        expiresAt: new Date(this.now().getTime() + 24 * 60 * 60 * 1000)
      });
    }

    return { correct };
  }

  async recordChildAttempt(parentUserId, gameId, input) {
    const game = this.gameLibraryService
      ? await this.gameLibraryService.getScoringGame(gameId, input.gameVersion ?? null)
      : getGame(gameId);
    if (!game) throw new AppError(404, 'GAME_NOT_FOUND', 'The game was not found.');
    await this.subscriptionService?.requireActive(parentUserId);
    const content = this.gameLibraryService ? game.content : game;
    if (this.gameLibraryService
      && (await this.gameLibraryService.getTrialGameIds()).includes(gameId)) {
      throw new AppError(400, 'TRIAL_NOT_RECORDED', 'Public trial games do not save child data.');
    }
    if (!this.gameLibraryService && game.access !== 'parent') {
      throw new AppError(400, 'TRIAL_NOT_RECORDED', 'Public trial games do not save child data.');
    }
    await this.learningPathService?.assertActivityConfigured(gameId);
    const child = await this.childService.getOwnedChild(parentUserId, input.childId);
    if (child.status !== 'active') {
      throw new AppError(409, 'CHILD_PROFILE_ARCHIVED', 'Reactivate this child profile before starting a game.');
    }
    const consents = await this.childService.listConsents(parentUserId, input.childId);
    const learningConsent = consents.find(({ consentType }) => consentType === 'learning_data');
    if (!learningConsent?.granted) {
      throw new AppError(403, 'LEARNING_CONSENT_REQUIRED', 'The parent must enable learning-data consent before this activity can be saved.');
    }
    await this.learningPathService?.assertActivityPlayable(parentUserId, input.childId, gameId);

    if (!input.submissionId) {
      throw new AppError(400, 'GAME_SESSION_REQUIRED', 'ابدأ جلسة جديدة وأكمل النشاط قبل حفظ النتيجة.');
    }
    const existingAttempt = await this.repository.findAttemptBySubmission?.({
      parentUserId,
      childId: input.childId,
      gameId,
      submissionId: input.submissionId
    });
    if (existingAttempt) return serializeAttempt(existingAttempt);

    const receipts = await this.repository.listAnswerReceipts({
      parentUserId,
      childId: input.childId,
      gameId,
      gameVersion: String(game.version),
      submissionId: input.submissionId
    });
    const isSpatial = content.template === 'spatial-relationships';
    const requiredAnswerCount = isSpatial ? content.spatial.steps.length : content.questions.length;
    if (receipts.length !== requiredAnswerCount
      || receipts.some((receipt, index) => receipt.questionIndex !== index)
      || (isSpatial && receipts.some((receipt) => !receipt.correct))) {
      throw new AppError(409, 'GAME_ANSWERS_INCOMPLETE', 'أكملوا أسئلة النشاط قبل حفظ النتيجة.');
    }

    const spatialProgress = isSpatial ? (() => {
      const startedAt = receipts.reduce((earliest, receipt) => (
        receipt.spatialMetrics?.startedAt && (!earliest || receipt.spatialMetrics.startedAt < earliest)
          ? receipt.spatialMetrics.startedAt
          : earliest
      ), null) ?? this.now();
      const timeSpentSeconds = Math.min(3600, Math.max(0, Math.round((this.now() - startedAt) / 1000)));
      const concepts = [...new Set(content.spatial.steps.map(({ relationship }) => relationship))];
      return {
        level: content.spatial.level,
        concepts,
        startedAt,
        instructionCount: content.spatial.steps.length,
        correctPlacements: receipts.filter(({ correct }) => correct).length,
        incorrectAttempts: receipts.reduce((total, item) => total + (item.spatialMetrics?.incorrectAttempts ?? 0), 0),
        instructionReplays: receipts.reduce((total, item) => total + (item.spatialMetrics?.instructionReplays ?? 0), 0),
        hintCount: receipts.reduce((total, item) => total
          + (item.spatialMetrics?.hintsUsed ?? 0)
          + (item.spatialMetrics?.demonstrationsUsed ?? 0), 0),
        hintTypes: [
          ...(receipts.some((item) => item.spatialMetrics?.hintsUsed > 0) ? ['visual'] : []),
          ...(receipts.some((item) => item.spatialMetrics?.demonstrationsUsed > 0) ? ['demonstration'] : [])
        ],
        completionPercent: 100,
        timeSpentSeconds,
        result: 'completed'
      };
    })() : null;
    const totalQuestions = isSpatial ? content.spatial.steps.length : content.questions.length;
    const correctCount = isSpatial
      ? spatialProgress.correctPlacements
      : scoreGame(content, receipts.map(({ answerIndex }) => answerIndex));
    const attempt = await this.repository.createAttempt({
      parentUserId,
      childId: input.childId,
      gameId,
      gameVersion: this.gameLibraryService ? String(game.version) : game.version,
      submissionId: input.submissionId,
      correctCount,
      totalQuestions,
      durationSeconds: spatialProgress?.timeSpentSeconds ?? input.durationSeconds,
      ...(spatialProgress ? { spatialProgress } : {}),
      completedAt: this.now()
    });
    await this.repository.deleteAnswerReceipts({
      parentUserId,
      childId: input.childId,
      gameId,
      submissionId: input.submissionId
    });
    return serializeAttempt(attempt);
  }

  async listChildAttempts(parentUserId, childId, { page = 1, limit = 20, gameId } = {}) {
    await this.childService.getOwnedChild(parentUserId, childId);
    const { attempts, total } = await this.repository.listChildAttempts(parentUserId, childId, {
      page,
      limit,
      gameId
    });
    return {
      attempts: attempts.map(serializeAttempt),
      page,
      limit,
      total,
      hasMore: page * limit < total
    };
  }
}
