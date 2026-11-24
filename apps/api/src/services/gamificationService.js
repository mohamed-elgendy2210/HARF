import mongoose from 'mongoose';
import { AppError } from '../middleware/errors.js';
import { LearningLevel } from '../models/LearningLevel.js';
import { RewardDefinition } from '../models/RewardDefinition.js';
import { ChildReward } from '../models/ChildReward.js';
import { RewardTransaction } from '../models/RewardTransaction.js';
import { ChildLevelProgress } from '../models/ChildLevelProgress.js';
import { ChildGameRewardState } from '../models/ChildGameRewardState.js';
import { GamificationSettings } from '../models/GamificationSettings.js';
import { GameDefinition } from '../models/GameDefinition.js';
import { GameVersion } from '../models/GameVersion.js';
import { GameSetting } from '../models/GameSetting.js';
import { LearningPath } from '../models/LearningPath.js';
import { LearningPathAssignment } from '../models/LearningPathAssignment.js';
import { MediaAsset } from '../models/MediaAsset.js';
import { Child } from '../models/Child.js';
import { ChildConsent } from '../models/ChildConsent.js';
import { LearningProgress } from '../models/LearningProgress.js';
import { GameAttempt } from '../models/GameAttempt.js';
import { NOTIFICATION_TYPES } from './notificationTypes.js';

export async function ensureGamificationIndexes() {
  await Promise.all([
    LearningLevel.createIndexes(),
    RewardDefinition.createIndexes(),
    ChildReward.createIndexes(),
    RewardTransaction.createIndexes(),
    ChildLevelProgress.createIndexes(),
    ChildGameRewardState.createIndexes(),
    GamificationSettings.createIndexes()
  ]);
}

const defaultGamificationSettings = Object.freeze({
  key: 'global',
  completionStars: 5,
  performanceBonusStars: 2,
  performanceThresholdPercent: 90,
  firstCompletionBonusStars: 0,
  levelCompletionStars: 20,
  adventureCompletionStars: 50,
  repeatRewardsEnabled: false,
  maxRepeatRewardCount: 0,
  repeatCooldownMinutes: 1440,
  gameRewards: []
});
const GAME_SUCCESS_THRESHOLD_PERCENT = 80;

function objectId(value) {
  return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(value);
}

export function calculateGameStars(rule, scorePercent, { firstCompletion = false } = {}) {
  const performanceBonus = scorePercent >= rule.performanceThresholdPercent
    ? rule.performanceBonusStars
    : 0;
  return rule.completionStars + performanceBonus
    + (firstCompletion ? rule.firstCompletionBonusStars : 0);
}

export function isRewardEligibleScore(scorePercent) {
  return scorePercent >= GAME_SUCCESS_THRESHOLD_PERCENT;
}

export function evaluateLevelCompletion(level, completedGameIds) {
  const completed = new Set(completedGameIds);
  const gameIds = level.gameIds ?? [];
  const mandatoryGameIds = level.mandatoryGameIds ?? [];
  const assignedCompletedCount = [...completed].filter((gameId) => gameIds.includes(gameId)).length;
  const mandatoryComplete = mandatoryGameIds.every((gameId) => completed.has(gameId));
  const optionalCompletedCount = [...completed].filter((gameId) =>
    gameIds.includes(gameId) && !mandatoryGameIds.includes(gameId)
  ).length;
  if (level.completionRule === 'all') return assignedCompletedCount === gameIds.length;
  if (level.completionRule === 'mandatory-count') {
    return mandatoryComplete && optionalCompletedCount >= (level.additionalGamesCount ?? 0);
  }
  if (level.completionRule === 'mandatory-score') {
    return mandatoryComplete && mandatoryGameIds.length > 0;
  }
  return mandatoryComplete && assignedCompletedCount >= (level.minimumCompletedGames ?? 1);
}

export function getRemainingRequiredGames(level, completedGameIds) {
  const completed = new Set(completedGameIds);
  const gameIds = level.gameIds ?? [];
  const mandatoryGameIds = level.mandatoryGameIds ?? [];
  const assignedCompleted = gameIds.filter((gameId) => completed.has(gameId));
  const missingMandatory = mandatoryGameIds.filter((gameId) => !completed.has(gameId)).length;
  if (level.completionRule === 'all') return gameIds.length - assignedCompleted.length;
  if (level.completionRule === 'mandatory-count') {
    const optionalCompleted = assignedCompleted.filter((gameId) => !mandatoryGameIds.includes(gameId)).length;
    return missingMandatory + Math.max(0, (level.additionalGamesCount ?? 0) - optionalCompleted);
  }
  if (level.completionRule === 'mandatory-score') return missingMandatory;
  return Math.max(missingMandatory, (level.minimumCompletedGames ?? 1) - assignedCompleted.length, 0);
}

export class GamificationService {
  constructor({ childService, notificationService = null, now = () => new Date() }) {
    this.childService = childService;
    this.notificationService = notificationService;
    this.now = now;
  }

  async listLevels(parentUserId, childId) {
    await this.childService.getOwnedChild(parentUserId, childId);
    const [assignments, allLevels, progressRows, settings] = await Promise.all([
      LearningPathAssignment.find({
        parentUserId,
        childId,
        status: { $in: ['active', 'completed'] }
      }).select('pathKey').lean(),
      LearningLevel.find({ active: true }).sort({ learningPathKey: 1, sortOrder: 1 }).lean(),
      ChildLevelProgress.find({ parentUserId, childId }).lean(),
      this.getGamificationSettings()
    ]);
    const assignedPathKeys = new Set(assignments.map(({ pathKey }) => pathKey));
    const levels = allLevels.filter(({ learningPathKey }) => assignedPathKeys.has(learningPathKey));
    const progressByLevel = new Map(progressRows.map((row) => [String(row.levelId), row]));
    const pathKeys = [...assignedPathKeys];
    const paths = await LearningPath.find({ key: { $in: pathKeys } }).select('key title description').lean();
    const pathByKey = new Map(paths.map((path) => [path.key, path]));
    const levelTransactions = levels.length
      ? await RewardTransaction.find({
        parentUserId,
        childId,
        sourceLevelId: { $in: levels.map(({ _id }) => _id) }
      }).select('sourceLevelId rewardType quantity rewardDefinitionId createdAt')
        .populate('rewardDefinitionId', 'name').sort({ createdAt: 1 }).lean()
      : [];
    const rewardsByLevel = new Map();
    for (const transaction of levelTransactions) {
      const key = String(transaction.sourceLevelId);
      if (!rewardsByLevel.has(key)) rewardsByLevel.set(key, []);
      rewardsByLevel.get(key).push({
        type: transaction.rewardType,
        quantity: transaction.quantity,
        name: transaction.rewardDefinitionId?.name
          ?? (transaction.rewardType === 'stars' ? 'نجوم' : 'مكافأة'),
        awardedAt: transaction.createdAt
      });
    }
    const levelsByPath = new Map();
    for (const level of levels) {
      if (!levelsByPath.has(level.learningPathKey)) levelsByPath.set(level.learningPathKey, []);
      levelsByPath.get(level.learningPathKey).push(level);
    }
    return [...levelsByPath.entries()].flatMap(([pathKey, pathLevels]) => pathLevels.map((level, index) => {
      const progress = progressByLevel.get(String(level._id));
      const previousLevel = pathLevels[index - 1];
      const unlockedByOrder = index === 0
        || progressByLevel.get(String(previousLevel?._id))?.status === 'completed';
      const unlockedByReference = !level.unlockAfterLevelId
        || progressByLevel.get(String(level.unlockAfterLevelId))?.status === 'completed';
      const status = progress?.status === 'completed'
        ? 'completed'
        : progress?.status === 'in-progress'
          ? 'in-progress'
          : progress?.status === 'available' || (unlockedByOrder && unlockedByReference)
            ? 'available'
            : 'locked';
      const completedGameIds = progress?.completedGameIds ?? [];
      return {
        id: String(level._id),
        learningPathKey: level.learningPathKey,
        learningPathTitle: pathByKey.get(pathKey)?.title ?? pathKey,
        adventureDescription: pathByKey.get(pathKey)?.description ?? '',
        title: level.title,
        titleEnglish: level.titleEnglish,
        description: level.description,
        descriptionEnglish: level.descriptionEnglish,
        coverImageUrl: level.coverImageAssetId ? `/api/v1/media/${String(level.coverImageAssetId)}` : '',
        sortOrder: level.sortOrder,
        gameIds: level.gameIds,
        minimumCompletedGames: level.minimumCompletedGames,
        minimumScorePercent: level.minimumScorePercent,
        mandatoryGameIds: level.mandatoryGameIds,
        completionRule: level.completionRule,
        additionalGamesCount: level.additionalGamesCount,
        completionReward: {
          ...level.completionReward,
          stars: level.completionReward?.stars ?? settings.levelCompletionStars
        },
        rewardsActive: level.rewardsActive,
        celebrationEnabled: level.celebrationEnabled,
        status,
        completionPercent: progress?.completionPercent ?? 0,
        completedGameIds,
        completedAt: progress?.completedAt ?? null,
        earnedRewards: rewardsByLevel.get(String(level._id)) ?? [],
        remainingRequiredGames: getRemainingRequiredGames(level, completedGameIds)
      };
    }));
  }

  async listAdminLevels(pathKey = '') {
    const filter = pathKey ? { learningPathKey: pathKey } : {};
    const levels = await LearningLevel.find(filter).sort({ learningPathKey: 1, sortOrder: 1 }).lean();
    return levels.map((level) => ({
      ...level,
      id: String(level._id),
      coverImageUrl: level.coverImageAssetId
        ? `/api/v1/admin/assets/${String(level.coverImageAssetId)}/preview`
        : ''
    }));
  }

  async assertActivityPlayable(parentUserId, childId, gameId) {
    const assignments = await LearningPathAssignment.find({
      parentUserId,
      childId,
      status: { $in: ['active', 'completed'] }
    }).select('pathKey').lean();
    const pathKeys = assignments.map(({ pathKey }) => pathKey);
    if (!pathKeys.length) return;
    const targetLevels = await LearningLevel.find({
      active: true,
      learningPathKey: { $in: pathKeys },
      gameIds: gameId
    }).select('_id learningPathKey sortOrder unlockAfterLevelId').lean();
    if (!targetLevels.length) return;
    const accessible = await Promise.all(targetLevels.map(async (level) => {
      const progress = await ChildLevelProgress.findOne({
        parentUserId,
        childId,
        levelId: level._id
      }).select('status').lean();
      if (progress?.status === 'completed' || progress?.status === 'available' || progress?.status === 'in-progress') {
        return true;
      }
      const prerequisite = level.unlockAfterLevelId
        ? await LearningLevel.findById(level.unlockAfterLevelId).select('_id').lean()
        : await LearningLevel.findOne({
          learningPathKey: level.learningPathKey,
          active: true,
          sortOrder: { $lt: level.sortOrder }
        }).sort({ sortOrder: -1 }).select('_id').lean();
      if (!prerequisite) return true;
      return Boolean(await ChildLevelProgress.exists({
        parentUserId,
        childId,
        levelId: prerequisite._id,
        status: 'completed'
      }));
    }));
    if (!accessible.some(Boolean)) {
      throw new AppError(409, 'LEARNING_LEVEL_LOCKED', 'أكمل المستوى السابق قبل بدء هذه اللعبة.');
    }
  }

  async getGamificationSettings() {
    const settings = await GamificationSettings.findOneAndUpdate(
      { key: 'global' },
      { $setOnInsert: { key: 'global' } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return { ...defaultGamificationSettings, ...settings };
  }

  async updateGamificationSettings(actor, input) {
    const gameIds = input.gameRewards.map(({ gameId }) => gameId);
    if (gameIds.length) {
      const [games, trials, legacyTrial] = await Promise.all([
        GameDefinition.find({
          gameId: { $in: gameIds },
          status: 'published',
          publishedVersion: { $gt: 0 }
        }).select('gameId').lean(),
        GameSetting.findOne({ key: 'trialGameIds' }).select('value').lean(),
        GameSetting.findOne({ key: 'trialGameId' }).select('value').lean()
      ]);
      const validIds = new Set(games.map(({ gameId }) => gameId));
      const trialIds = new Set(Array.isArray(trials?.value) ? trials.value : [legacyTrial?.value].filter(Boolean));
      const invalid = gameIds.find((gameId) => !validIds.has(gameId) || trialIds.has(gameId));
      if (invalid) {
        throw new AppError(400, 'GAME_REWARD_UNAVAILABLE', 'اختر لعبة منشورة وغير تجريبية لضبط مكافآتها.');
      }
    }
    const settings = await GamificationSettings.findOneAndUpdate(
      { key: 'global' },
      { $set: { ...input, updatedBy: actor._id ?? actor.id } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    return { ...defaultGamificationSettings, ...settings };
  }

  async getChildRewards(parentUserId, childId) {
    await this.childService.getOwnedChild(parentUserId, childId);
    const [definitions, history, starRows, gameStarRows, badgeIds, giftIds] = await Promise.all([
      RewardDefinition.find({ active: true }).sort({ type: 1, name: 1 }).lean(),
      RewardTransaction.find({ parentUserId, childId }).sort({ createdAt: -1 }).limit(100)
        .populate('rewardDefinitionId', 'name type').lean(),
      RewardTransaction.aggregate([
        { $match: { parentUserId: objectId(parentUserId), childId: objectId(childId), rewardType: 'stars' } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      RewardTransaction.aggregate([
        {
          $match: {
            parentUserId: objectId(parentUserId),
            childId: objectId(childId),
            rewardType: 'stars',
            sourceGameId: { $type: 'string' }
          }
        },
        { $group: { _id: '$sourceGameId', total: { $sum: '$quantity' } } }
      ]),
      RewardTransaction.distinct('rewardDefinitionId', {
        parentUserId,
        childId,
        rewardType: 'badge'
      }),
      RewardTransaction.distinct('rewardDefinitionId', {
        parentUserId,
        childId,
        rewardType: 'gift'
      })
    ]);
    const earnedBadgeIds = new Set(badgeIds.map(String));
    const earnedGiftIds = new Set(giftIds.map(String));
    return {
      totalStars: starRows[0]?.total ?? 0,
      starsByGame: Object.fromEntries(gameStarRows.map(({ _id, total }) => [String(_id), total])),
      badges: definitions.filter((item) => item.type === 'badge').map((item) => ({
        ...item,
        id: String(item._id),
        imageUrl: item.imageAssetId ? `/api/v1/media/${String(item.imageAssetId)}` : '',
        earned: earnedBadgeIds.has(String(item._id))
      })),
      gifts: definitions.filter((item) => item.type === 'gift').map((item) => ({
        ...item,
        id: String(item._id),
        imageUrl: item.imageAssetId ? `/api/v1/media/${String(item.imageAssetId)}` : '',
        earned: earnedGiftIds.has(String(item._id))
      })),
      history: history.map((item) => ({
        id: String(item._id),
        transactionReference: item.transactionReference,
        rewardType: item.rewardType,
        quantity: item.quantity,
        rewardName: item.rewardDefinitionId?.name ?? null,
        sourceGameId: item.sourceGameId,
        sourceLevelId: item.sourceLevelId ? String(item.sourceLevelId) : null,
        learningPathKey: item.learningPathKey,
        awardedAt: item.createdAt
      }))
    };
  }

  async getAchievements(parentUserId, childId) {
    await this.childService.getOwnedChild(parentUserId, childId);
    const [levels, progress, learning, rewards] = await Promise.all([
      LearningLevel.find({ active: true }).lean(),
      ChildLevelProgress.find({ parentUserId, childId }).lean(),
      LearningProgress.find({ parentUserId, childId }).lean(),
      this.getChildRewards(parentUserId, childId)
    ]);
    const completedLevels = progress.filter(({ status }) => status === 'completed').length;
    const completedGames = new Set(progress.flatMap((item) => item.completedGameIds)).size;
    const completedPaths = learning.filter((item) => item.completedActivities?.length > 0).length;
    return {
      completedGames,
      completedLevels,
      completedLearningPaths: completedPaths,
      totalStars: rewards.totalStars,
      earnedBadges: rewards.badges.filter(({ earned }) => earned).length,
      milestones: progress
        .filter(({ status }) => status === 'completed')
        .sort((a, b) => (b.completedAt?.getTime?.() ?? 0) - (a.completedAt?.getTime?.() ?? 0))
        .slice(0, 20)
        .map((item) => ({
          type: 'level',
          levelId: String(item.levelId),
          completedAt: item.completedAt
        })),
      recentAchievements: rewards.history.slice(0, 10)
    };
  }

  async refreshChildRewardBalance(parentUserId, childId) {
    const groups = await RewardTransaction.aggregate([
      { $match: { parentUserId: objectId(parentUserId), childId: objectId(childId) } },
      {
        $group: {
          _id: '$rewardType',
          quantity: { $sum: '$quantity' },
          rewardIds: { $addToSet: '$rewardDefinitionId' }
        }
      }
    ]);
    const badges = groups.find(({ _id }) => _id === 'badge')?.rewardIds.filter(Boolean) ?? [];
    const gifts = groups.find(({ _id }) => _id === 'gift')?.rewardIds.filter(Boolean) ?? [];
    const totalStars = groups.find(({ _id }) => _id === 'stars')?.quantity ?? 0;
    await ChildReward.findOneAndUpdate(
      { parentUserId, childId },
      {
        $set: { totalStars, badgeIds: badges, giftIds: gifts },
        $setOnInsert: { parentUserId, childId }
      },
      { upsert: true, new: true, runValidators: true }
    );
    return { totalStars };
  }

  async awardStars({ parentUserId, childId, reference, quantity, sourceGameId = null, sourceLevelId = null, learningPathKey = null }) {
    if (quantity < 1) return false;
    try {
      await RewardTransaction.create({
        transactionReference: reference,
        parentUserId,
        childId,
        rewardType: 'stars',
        quantity,
        sourceGameId,
        sourceLevelId,
        learningPathKey
      });
    } catch (error) {
      if (error?.code === 11000) return false;
      throw error;
    }
    await this.refreshChildRewardBalance(parentUserId, childId);
    return true;
  }

  async awardDefinition({ parentUserId, childId, reward, sourceGameId = null, sourceLevelId = null, learningPathKey = null, reference }) {
    const rewardType = reward.type;
    try {
      await RewardTransaction.create({
        transactionReference: reference,
        parentUserId,
        childId,
        rewardType,
        rewardDefinitionId: reward._id,
        quantity: 1,
        sourceGameId,
        sourceLevelId,
        learningPathKey
      });
    } catch (error) {
      if (error?.code === 11000) return false;
      throw error;
    }
    await this.refreshChildRewardBalance(parentUserId, childId);
    return true;
  }

  async processCompletedAttempt(parentUserId, childId, attempt) {
    await this.childService.getOwnedChild(parentUserId, childId);
    if (!attempt?._id || !(attempt.completedAt instanceof Date)
      || !Number.isInteger(attempt.correctCount)
      || !Number.isInteger(attempt.totalQuestions)
      || attempt.totalQuestions < 1
      || attempt.correctCount < 0
      || attempt.correctCount > attempt.totalQuestions) {
      throw new AppError(409, 'INVALID_SAVED_ATTEMPT', 'لا يمكن صرف مكافآت لمحاولة غير مكتملة أو غير صالحة.');
    }
    const scorePercent = attempt.totalQuestions
      ? Math.round((attempt.correctCount / attempt.totalQuestions) * 100)
      : 0;
    const awarded = [];
    if (!isRewardEligibleScore(scorePercent)) return { scorePercent, awarded };

    const [settings, assignments] = await Promise.all([
      this.getGamificationSettings(),
      LearningPathAssignment.find({
        parentUserId,
        childId,
        status: { $in: ['active', 'completed'] }
      }).select('pathKey').lean()
    ]);
    const assignedPathKeys = assignments.map(({ pathKey }) => pathKey);
    const gameRule = settings.gameRewards.find(({ gameId }) => gameId === attempt.gameId) ?? {
      completionStars: settings.completionStars,
      performanceBonusStars: settings.performanceBonusStars,
      performanceThresholdPercent: settings.performanceThresholdPercent,
      firstCompletionBonusStars: settings.firstCompletionBonusStars,
      repeatRewardsEnabled: settings.repeatRewardsEnabled,
      maxRepeatRewardCount: settings.maxRepeatRewardCount,
      repeatCooldownMinutes: settings.repeatCooldownMinutes
    };

    let rewardState;
    try {
      rewardState = await ChildGameRewardState.findOneAndUpdate(
        { childId, gameId: attempt.gameId },
        { $setOnInsert: { parentUserId, childId, gameId: attempt.gameId } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
      rewardState = await ChildGameRewardState.findOne({ childId, gameId: attempt.gameId });
    }
    const firstReference = `game:${childId}:${attempt.gameId}:first`;
    const repeatReference = `game:${childId}:${attempt.gameId}:repeat:${attempt._id}`;
    const alreadyFirstRewarded = await RewardTransaction.exists({ transactionReference: firstReference });
    const alreadyRepeatRewarded = await RewardTransaction.exists({ transactionReference: repeatReference });
    let firstCompletion = !rewardState.firstCompletedAt && !alreadyFirstRewarded;
    if (firstCompletion) {
      const claimed = await ChildGameRewardState.findOneAndUpdate(
        { _id: rewardState._id, firstCompletedAt: null },
        { $set: { firstCompletedAt: attempt.completedAt, firstAttemptId: attempt._id } },
        { new: true }
      );
      firstCompletion = Boolean(claimed);
      if (claimed) rewardState = claimed;
    } else if (!alreadyFirstRewarded
      && String(rewardState.firstAttemptId) === String(attempt._id)) {
      firstCompletion = true;
    }

    let gameStars = 0;
    if (firstCompletion) {
      gameStars = calculateGameStars(gameRule, scorePercent, { firstCompletion: true });
      if (await this.awardStars({
        parentUserId,
        childId,
        reference: firstReference,
        quantity: gameStars,
        sourceGameId: attempt.gameId
      })) {
        awarded.push({ type: 'stars', source: 'game-completion', quantity: gameStars });
      }
    } else if (gameRule.repeatRewardsEnabled && gameRule.maxRepeatRewardCount > 0
      && rewardState.firstCompletedAt
      && String(rewardState.firstAttemptId) !== String(attempt._id)
      && !alreadyRepeatRewarded) {
      const now = this.now();
      const cooldownCutoff = new Date(now.getTime() - gameRule.repeatCooldownMinutes * 60 * 1000);
      const pendingClaim = String(rewardState.lastRepeatRewardAttemptId) === String(attempt._id);
      const reserved = pendingClaim
        ? rewardState
        : await ChildGameRewardState.findOneAndUpdate(
          {
            _id: rewardState._id,
            repeatRewardCount: { $lt: gameRule.maxRepeatRewardCount },
            lastRepeatRewardAttemptId: { $ne: attempt._id },
            $or: [
              { lastRepeatRewardAt: null },
              { lastRepeatRewardAt: { $lte: cooldownCutoff } }
            ]
          },
          {
            $inc: { repeatRewardCount: 1 },
            $set: {
              lastRepeatRewardAt: now,
              lastRepeatRewardAttemptId: attempt._id
            }
          },
          { new: true }
        );
      if (reserved) {
        gameStars = calculateGameStars(gameRule, scorePercent);
        if (await this.awardStars({
          parentUserId,
          childId,
          reference: repeatReference,
          quantity: gameStars,
          sourceGameId: attempt.gameId
        })) {
          awarded.push({ type: 'stars', source: 'game-repeat', quantity: gameStars });
        }
      }
    }

    const levels = await LearningLevel.find({
      active: true,
      learningPathKey: { $in: assignedPathKeys },
      gameIds: attempt.gameId
    }).sort({ learningPathKey: 1, sortOrder: 1 });

    for (const level of levels) {
      let progress;
      try {
        const previousLevel = level.unlockAfterLevelId
          ? await LearningLevel.findById(level.unlockAfterLevelId).select('learningPathKey').lean()
          : await LearningLevel.findOne({
            learningPathKey: level.learningPathKey,
            active: true,
            sortOrder: { $lt: level.sortOrder }
          }).sort({ sortOrder: -1 }).select('_id').lean();
        let isUnlocked = !previousLevel;
        if (previousLevel) {
          const previousProgress = await ChildLevelProgress.findOne({
            parentUserId,
            childId,
            levelId: previousLevel._id ?? level.unlockAfterLevelId,
            status: 'completed'
          }).select('_id').lean();
          isUnlocked = Boolean(previousProgress);
        }
        progress = await ChildLevelProgress.findOneAndUpdate(
          { parentUserId, childId, levelId: level._id },
          {
            $setOnInsert: {
              parentUserId,
              childId,
              learningPathKey: level.learningPathKey,
              levelId: level._id,
              status: isUnlocked ? 'available' : 'locked'
            }
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
      } catch (error) {
        if (error?.code !== 11000) throw error;
        progress = await ChildLevelProgress.findOne({ parentUserId, childId, levelId: level._id });
      }
      if (!progress || progress.status === 'locked') continue;

      const completedSet = new Set(progress.completedGameIds);
      if (scorePercent >= level.minimumScorePercent) completedSet.add(attempt.gameId);
      const assignedCompletedCount = [...completedSet].filter((gameId) => level.gameIds.includes(gameId)).length;
      const completed = evaluateLevelCompletion(level, completedSet);
      const percent = level.gameIds.length
        ? Math.min(100, Math.round((assignedCompletedCount / level.gameIds.length) * 100))
        : 0;
      let newlyCompleted = false;
      if (completed) {
        const transitioned = await ChildLevelProgress.updateOne(
          { _id: progress._id, status: { $ne: 'completed' } },
          {
            $addToSet: { completedGameIds: { $each: [...completedSet] } },
            $set: { status: 'completed', completionPercent: 100, completedAt: this.now() }
          }
        );
        newlyCompleted = Boolean(transitioned.modifiedCount);
        if (!newlyCompleted && progress.status !== 'completed') continue;
      } else {
        await ChildLevelProgress.updateOne(
          { _id: progress._id, status: { $ne: 'completed' } },
          {
            $addToSet: { completedGameIds: { $each: [...completedSet] } },
            $set: { status: 'in-progress', completionPercent: percent }
          }
        );
        continue;
      }

      if (level.rewardsActive !== false) {
        const stars = level.completionReward?.stars ?? settings.levelCompletionStars;
        const starReference = `level:${level._id}:stars:${childId}`;
        if (await this.awardStars({
          parentUserId,
          childId,
          reference: starReference,
          quantity: stars,
          sourceLevelId: level._id,
          learningPathKey: level.learningPathKey
        })) awarded.push({ type: 'stars', source: 'level-completion', quantity: stars });

        for (const [field, rewardType] of [['badgeRewardId', 'badge'], ['giftRewardId', 'gift']]) {
          const rewardId = level.completionReward?.[field];
          if (!rewardId) continue;
          const reward = await RewardDefinition.findById(rewardId);
          if (!reward || !reward.active || reward.type !== rewardType) continue;
          const rewardReference = `level:${level._id}:${rewardType}:${childId}`;
          const awardedDefinition = await this.awardDefinition({
            parentUserId,
            childId,
            reward,
            reference: rewardReference,
            sourceLevelId: level._id,
            learningPathKey: level.learningPathKey
          });
          if (awardedDefinition) awarded.push({ type: rewardType, rewardId: String(reward._id), name: reward.name });
        }

        if (newlyCompleted && this.notificationService) {
          await this.notificationService.notify(parentUserId, {
            type: NOTIFICATION_TYPES.LEVEL_COMPLETED,
            resourceType: 'child',
            resourceId: childId,
            dedupeKey: `level_completed:${childId}:${level._id}`,
            title: 'أكمل الطفل مستوى!',
            message: `أتم الطفل مستوى «${level.title}».`
          });
        }
      }

      if (newlyCompleted) {
        awarded.push({
          type: 'level-completed',
          levelId: String(level._id),
          title: level.title,
          celebrationEnabled: level.celebrationEnabled !== false
        });
      }

      const nextLevel = await LearningLevel.findOne({
          learningPathKey: level.learningPathKey,
          active: true,
          sortOrder: { $gt: level.sortOrder }
        }).sort({ sortOrder: 1 });
      if (nextLevel && (!nextLevel.unlockAfterLevelId
        || String(nextLevel.unlockAfterLevelId) === String(level._id))) {
        await ChildLevelProgress.findOneAndUpdate(
          { parentUserId, childId, levelId: nextLevel._id },
          {
            $setOnInsert: {
              parentUserId,
              childId,
              learningPathKey: nextLevel.learningPathKey,
              levelId: nextLevel._id
            },
            $set: { status: 'available' }
          },
          { upsert: true, new: true, runValidators: true }
        );
      }

    }
    for (const pathKey of assignedPathKeys) {
      const activeLevelIds = await LearningLevel.find({
        learningPathKey: pathKey,
        active: true
      }).distinct('_id');
      const completedLevels = await ChildLevelProgress.countDocuments({
        parentUserId,
        childId,
        levelId: { $in: activeLevelIds },
        status: 'completed'
      });
      if (activeLevelIds.length > 0 && completedLevels === activeLevelIds.length) {
        const adventureStars = settings.adventureCompletionStars;
        if (await this.awardStars({
          parentUserId,
          childId,
          reference: `adventure:${childId}:${pathKey}:stars`,
          quantity: adventureStars,
          learningPathKey: pathKey
        })) awarded.push({ type: 'stars', source: 'adventure-completion', quantity: adventureStars });
      }
    }
    return { scorePercent, awarded };
  }

  async createOrUpdateLevel(actor, input, levelId = null) {
    if (input.minimumCompletedGames > input.gameIds.length
      || (input.completionRule === 'mandatory-count'
        && (input.mandatoryGameIds ?? []).length + input.additionalGamesCount > input.gameIds.length)
      || (input.completionRule === 'mandatory-score'
        && ((input.mandatoryGameIds ?? []).length === 0 || input.minimumScorePercent < 1))) {
      throw new AppError(400, 'INVALID_LEVEL_RULES', 'قواعد إكمال المستوى لا تتوافق مع الألعاب المحددة.');
    }
    if ((input.mandatoryGameIds ?? []).some((gameId) => !input.gameIds.includes(gameId))) {
      throw new AppError(400, 'INVALID_MANDATORY_GAME', 'يجب أن تكون اللعبة الإلزامية ضمن ألعاب المستوى.');
    }
    const path = await LearningPath.findOne({ key: input.learningPathKey }).lean();
    if (!path) throw new AppError(404, 'LEARNING_PATH_NOT_FOUND', 'مسار التعلّم غير موجود.');
    const pathGameIds = new Set(path.activities.map(({ gameId }) => gameId));
    const invalidGameId = input.gameIds.find((gameId) => !pathGameIds.has(gameId));
    if (invalidGameId) {
      throw new AppError(400, 'LEVEL_GAME_NOT_IN_PATH', 'يجب أن تكون ألعاب المستوى ضمن أنشطة مسار التعلّم المحدد.');
    }
    const [publishedGames, trialSetting, legacyTrial] = await Promise.all([
      GameDefinition.find({
        gameId: { $in: input.gameIds },
        status: 'published',
        publishedVersion: { $gt: 0 }
      }).select('gameId').lean(),
      GameSetting.findOne({ key: 'trialGameIds' }).select('value').lean(),
      GameSetting.findOne({ key: 'trialGameId' }).select('value').lean()
    ]);
    const publishedIds = new Set(publishedGames.map(({ gameId }) => gameId));
    const trialIds = new Set(Array.isArray(trialSetting?.value)
      ? trialSetting.value
      : [legacyTrial?.value].filter(Boolean));
    if (input.gameIds.some((gameId) => !publishedIds.has(gameId) || trialIds.has(gameId))) {
      throw new AppError(400, 'LEVEL_GAME_UNAVAILABLE', 'اختر ألعابًا منشورة وغير تجريبية فقط.');
    }
    const peerFilter = {
      learningPathKey: input.learningPathKey,
      ...(levelId ? { _id: { $ne: levelId } } : {})
    };
    const peerCount = await LearningLevel.countDocuments(peerFilter);
    if (input.sortOrder > peerCount) {
      throw new AppError(400, 'INVALID_LEVEL_ORDER', 'رتّب المستويات دون ترك فجوات في ترتيب المغامرة.');
    }
    const duplicateOrder = await LearningLevel.findOne({
      learningPathKey: input.learningPathKey,
      sortOrder: input.sortOrder,
      ...(levelId ? { _id: { $ne: levelId } } : {})
    }).select('_id').lean();
    if (duplicateOrder) {
      throw new AppError(409, 'LEVEL_ORDER_IN_USE', 'ترتيب هذا المستوى مستخدم بالفعل في المسار.');
    }
    if (input.coverImageAssetId) {
      const image = await MediaAsset.findOne({
        _id: input.coverImageAssetId,
        kind: 'image',
        active: true
      }).select('_id').lean();
      if (!image) throw new AppError(400, 'LEVEL_IMAGE_INVALID', 'اختر صورة نشطة من مكتبة الوسائط.');
    }
    if (input.unlockAfterLevelId) {
      const prerequisite = await LearningLevel.findOne({
        _id: input.unlockAfterLevelId,
        learningPathKey: input.learningPathKey,
        sortOrder: { $lt: input.sortOrder }
      }).select('_id').lean();
      if (!prerequisite || String(prerequisite._id) === String(levelId)) {
        throw new AppError(400, 'INVALID_LEVEL_UNLOCK_RULE', 'يجب أن يكون شرط الفتح مستوى سابقًا في المسار نفسه.');
      }
    }
    for (const [field, expectedType] of [['badgeRewardId', 'badge'], ['giftRewardId', 'gift']]) {
      const rewardId = input.completionReward?.[field];
      if (!rewardId) continue;
      const reward = await RewardDefinition.findOne({ _id: rewardId, type: expectedType }).select('_id').lean();
      if (!reward) throw new AppError(400, 'LEVEL_REWARD_INVALID', 'نوع مكافأة المستوى غير صالح.');
    }
    if (levelId) {
      const existing = await LearningLevel.findById(levelId).lean();
      if (!existing) throw new AppError(404, 'LEVEL_NOT_FOUND', 'مستوى التعلّم غير موجود.');
      if (existing.learningPathKey !== input.learningPathKey
        && await ChildLevelProgress.exists({ levelId })) {
        throw new AppError(409, 'LEVEL_HAS_PROGRESS', 'لا يمكن نقل مستوى له تقدم محفوظ إلى مسار آخر.');
      }
    }
    const data = {
      ...input,
      updatedBy: actor._id ?? actor.id
    };
    const level = levelId
      ? await LearningLevel.findByIdAndUpdate(levelId, data, { new: true, runValidators: true })
      : await LearningLevel.create(data);
    if (!level) throw new AppError(404, 'LEVEL_NOT_FOUND', 'مستوى التعلّم غير موجود.');
    return level.toObject();
  }

  async reorderLevels(actor, pathKey, orderedIds) {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      throw new AppError(400, 'INVALID_LEVEL_ORDER', 'يجب إرسال ترتيب مستوى واحد على الأقل.');
    }
    const path = await LearningPath.exists({ key: pathKey });
    if (!path) throw new AppError(404, 'LEARNING_PATH_NOT_FOUND', 'مسار التعلّم غير موجود.');
    const existing = await LearningLevel.find({ learningPathKey: pathKey }).select('_id').lean();
    const existingIds = new Set(existing.map(({ _id }) => String(_id)));
    if (orderedIds.length !== existingIds.size
      || orderedIds.some((id) => !existingIds.has(String(id)))
      || new Set(orderedIds.map(String)).size !== orderedIds.length) {
      throw new AppError(400, 'INVALID_LEVEL_ORDER', 'يجب إرسال جميع مستويات المسار مرة واحدة وبالترتيب الجديد.');
    }
    const candidateIndex = new Map(orderedIds.map((id, index) => [String(id), index]));
    const levels = await LearningLevel.find({ learningPathKey: pathKey })
      .select('_id unlockAfterLevelId').lean();
    const invalidUnlock = levels.some((level) => level.unlockAfterLevelId
      && candidateIndex.get(String(level.unlockAfterLevelId)) >= candidateIndex.get(String(level._id)));
    if (invalidUnlock) {
      throw new AppError(400, 'INVALID_LEVEL_ORDER', 'لا يمكن وضع المستوى قبل شرط فتحه.');
    }
    await Promise.all(orderedIds.map((id, index) => LearningLevel.updateOne(
      { _id: id, learningPathKey: pathKey },
      { $set: { sortOrder: index, updatedBy: actor._id ?? actor.id } }
    )));
  }

  async deleteLevel(levelId) {
    const [inUse, referenced] = await Promise.all([
      ChildLevelProgress.exists({ levelId }),
      LearningLevel.exists({ unlockAfterLevelId: levelId })
    ]);
    if (inUse || referenced) {
      throw new AppError(409, 'LEVEL_HAS_PROGRESS', 'لا يمكن حذف مستوى له تقدم محفوظ أو تعتمد عليه مستويات أخرى. عطّله بدلًا من ذلك.');
    }
    const deleted = await LearningLevel.findByIdAndDelete(levelId);
    if (!deleted) throw new AppError(404, 'LEVEL_NOT_FOUND', 'مستوى التعلّم غير موجود.');
    const following = await LearningLevel.find({
      learningPathKey: deleted.learningPathKey,
      sortOrder: { $gt: deleted.sortOrder }
    }).sort({ sortOrder: 1 }).select('_id').lean();
    await Promise.all(following.map((level, index) => LearningLevel.updateOne(
      { _id: level._id },
      { $set: { sortOrder: deleted.sortOrder + index } }
    )));
  }

  async listDefinitions() {
    return RewardDefinition.find({}).sort({ type: 1, name: 1 }).lean();
  }

  async listRewardHistory({ childId, rewardType, page = 1, limit = 25 } = {}) {
    const filter = {
      ...(childId ? { childId } : {}),
      ...(rewardType ? { rewardType } : {})
    };
    const [transactions, total] = await Promise.all([
      RewardTransaction.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('childId', 'displayName')
        .populate('rewardDefinitionId', 'name type')
        .lean(),
      RewardTransaction.countDocuments(filter)
    ]);
    const childIds = [...new Set(transactions.map(({ childId: child }) => String(child?._id ?? child)))];
    const balances = await ChildReward.find({ childId: { $in: childIds } }).select('childId totalStars').lean();
    const balanceByChild = new Map(balances.map((wallet) => [String(wallet.childId), wallet.totalStars]));
    return {
      transactions: transactions.map((item) => ({
        id: String(item._id),
        transactionReference: item.transactionReference,
        childId: String(item.childId?._id ?? item.childId),
        childName: item.childId?.displayName ?? '—',
        rewardType: item.rewardType,
        rewardName: item.rewardDefinitionId?.name ?? null,
        quantity: item.quantity,
        sourceGameId: item.sourceGameId,
        sourceLevelId: item.sourceLevelId ? String(item.sourceLevelId) : null,
        learningPathKey: item.learningPathKey,
        totalStars: balanceByChild.get(String(item.childId?._id ?? item.childId)) ?? 0,
        awardedAt: item.createdAt
      })),
      page,
      limit,
      total,
      hasMore: page * limit < total
    };
  }

  async searchChildren(query) {
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const children = await Child.find({
      displayName: { $regex: safeQuery, $options: 'i' },
      status: { $ne: 'archived' }
    }).select('displayName').sort({ displayName: 1 }).limit(20).lean();
    return children.map((child) => ({ id: String(child._id), displayName: child.displayName }));
  }

  async getAdminChildRewards(childId) {
    const child = await Child.findById(childId).select('parentUserId').lean();
    if (!child) throw new AppError(404, 'CHILD_NOT_FOUND', 'ملف الطفل غير موجود.');
    return this.getChildRewards(child.parentUserId, childId);
  }

  async getSpecialistChildJourney(childId) {
    const child = await Child.findById(childId).select('parentUserId').lean();
    if (!child) throw new AppError(404, 'CHILD_NOT_FOUND', 'ملف الطفل غير موجود.');
    const consent = await ChildConsent.findOne({
      parentUserId: child.parentUserId,
      childId,
      consentType: 'progress_reports'
    }).sort({ createdAt: -1 }).select('granted').lean();
    if (!consent?.granted) {
      throw new AppError(403, 'SPECIALIST_PROGRESS_CONSENT_REQUIRED', 'يلزم موافقة ولي الأمر على مشاركة تقارير التقدم مع الأخصائي.');
    }
    const [levels, rewards, achievements, attempts, attemptCount] = await Promise.all([
      this.listLevels(child.parentUserId, childId),
      this.getChildRewards(child.parentUserId, childId),
      this.getAchievements(child.parentUserId, childId),
      GameAttempt.find({ parentUserId: child.parentUserId, childId })
        .sort({ completedAt: -1 }).limit(20)
        .select('gameId correctCount totalQuestions completedAt').lean(),
      GameAttempt.countDocuments({ parentUserId: child.parentUserId, childId })
    ]);
    const gameIds = [...new Set(attempts.map(({ gameId }) => gameId))];
    const definitions = gameIds.length
      ? await GameDefinition.find({ gameId: { $in: gameIds }, status: 'published' })
        .select('gameId publishedVersion').lean()
      : [];
    const versions = definitions.length
      ? await GameVersion.find({
        $or: definitions.map(({ gameId, publishedVersion }) => ({ gameId, version: publishedVersion }))
      }).select('gameId content.title').lean()
      : [];
    const gameTitles = new Map(versions.map(({ gameId, content }) => [gameId, content?.title ?? gameId]));
    return {
      levels,
      rewards,
      achievements,
      attemptCount,
      attempts: attempts.map((attempt) => ({
        id: String(attempt._id),
        gameId: attempt.gameId,
        gameTitle: gameTitles.get(attempt.gameId) ?? attempt.gameId,
        correctCount: attempt.correctCount,
        totalQuestions: attempt.totalQuestions,
        completedAt: attempt.completedAt
      }))
    };
  }

  async createOrUpdateDefinition(actor, input, rewardId = null) {
    if (input.imageAssetId) {
      const image = await MediaAsset.findOne({
        _id: input.imageAssetId,
        kind: 'image',
        active: true
      }).select('_id').lean();
      if (!image) throw new AppError(400, 'REWARD_IMAGE_INVALID', 'اختر صورة نشطة من مكتبة الوسائط.');
    }
    if (rewardId) {
      const current = await RewardDefinition.findById(rewardId).select('type').lean();
      if (!current) throw new AppError(404, 'REWARD_NOT_FOUND', 'المكافأة غير موجودة.');
      if (current.type !== input.type
        && await RewardTransaction.exists({ rewardDefinitionId: rewardId })) {
        throw new AppError(409, 'REWARD_TYPE_IN_USE', 'لا يمكن تغيير نوع مكافأة لها تاريخ صرف.');
      }
    }
    const data = { ...input, updatedBy: actor._id ?? actor.id };
    const reward = rewardId
      ? await RewardDefinition.findByIdAndUpdate(rewardId, data, { new: true, runValidators: true })
      : await RewardDefinition.create(data);
    if (!reward) throw new AppError(404, 'REWARD_NOT_FOUND', 'المكافأة غير موجودة.');
    return reward.toObject();
  }

  async deleteDefinition(rewardId) {
    const [inUse, configured] = await Promise.all([
      RewardTransaction.exists({ rewardDefinitionId: rewardId }),
      LearningLevel.exists({
        $or: [
          { 'completionReward.badgeRewardId': rewardId },
          { 'completionReward.giftRewardId': rewardId }
        ]
      })
    ]);
    if (inUse || configured) throw new AppError(409, 'REWARD_HAS_HISTORY', 'لا يمكن حذف مكافأة لها تاريخ صرف أو مرتبطة بمستوى.');
    const deleted = await RewardDefinition.findByIdAndDelete(rewardId);
    if (!deleted) throw new AppError(404, 'REWARD_NOT_FOUND', 'المكافأة غير موجودة.');
  }
}
