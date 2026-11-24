import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { LearningLevel } from '../src/models/LearningLevel.js';
import { RewardDefinition } from '../src/models/RewardDefinition.js';
import { ChildLevelProgress } from '../src/models/ChildLevelProgress.js';
import { RewardTransaction } from '../src/models/RewardTransaction.js';
import {
  calculateGameStars,
  evaluateLevelCompletion,
  getRemainingRequiredGames,
  isRewardEligibleScore,
  GamificationService
} from '../src/services/gamificationService.js';

test('learning-level and reward models define the gamification constraints', () => {
  assert.equal(LearningLevel.schema.path('gameIds').isRequired, true);
  assert.equal(LearningLevel.schema.path('active').defaultValue, true);
  assert.equal(RewardDefinition.schema.path('type').enumValues.includes('badge'), true);
  assert.equal(RewardDefinition.schema.path('type').enumValues.includes('gift'), true);
  assert.equal(ChildLevelProgress.schema.path('status').enumValues.includes('locked'), true);
  assert.equal(RewardTransaction.schema.indexes().some(([keys]) => keys.transactionReference === 1), true);
});

test('gamification level validation rejects impossible and non-member rules', async () => {
  const service = new GamificationService({ childService: { getOwnedChild: async () => ({}) } });
  await assert.rejects(
    service.createOrUpdateLevel(
      { _id: new mongoose.Types.ObjectId() },
      { learningPathKey: 'test', title: 'Test', description: 'Test', gameIds: ['one'], minimumCompletedGames: 2, minimumScorePercent: 0 }
    ),
    (error) => error.statusCode === 400 && error.code === 'INVALID_LEVEL_RULES'
  );
  await assert.rejects(
    service.createOrUpdateLevel(
      { _id: new mongoose.Types.ObjectId() },
      { learningPathKey: 'test', title: 'Test', description: 'Test', gameIds: ['one'], minimumCompletedGames: 1, minimumScorePercent: 0, mandatoryGameIds: ['two'] }
    ),
    (error) => error.statusCode === 400 && error.code === 'INVALID_MANDATORY_GAME'
  );
});

test('level completion supports all, count, mandatory-plus-count, and mandatory-score rules', () => {
  const games = ['one', 'two', 'three'];
  assert.equal(evaluateLevelCompletion({
    gameIds: games, mandatoryGameIds: [], completionRule: 'all'
  }, ['one', 'two']), false);
  assert.equal(evaluateLevelCompletion({
    gameIds: games, mandatoryGameIds: [], completionRule: 'all'
  }, games), true);
  assert.equal(evaluateLevelCompletion({
    gameIds: games, mandatoryGameIds: ['one'], completionRule: 'count', minimumCompletedGames: 2
  }, ['one', 'three']), true);
  assert.equal(evaluateLevelCompletion({
    gameIds: games, mandatoryGameIds: ['one'], completionRule: 'mandatory-count', additionalGamesCount: 1
  }, ['one', 'two']), true);
  assert.equal(evaluateLevelCompletion({
    gameIds: games, mandatoryGameIds: ['one'], completionRule: 'mandatory-count', additionalGamesCount: 1
  }, ['two']), false);
  assert.equal(evaluateLevelCompletion({
    gameIds: games, mandatoryGameIds: ['one', 'two'], completionRule: 'mandatory-score'
  }, ['one']), false);
  assert.equal(evaluateLevelCompletion({
    gameIds: games, mandatoryGameIds: ['one', 'two'], completionRule: 'mandatory-score'
  }, ['one', 'two']), true);
});

test('game star calculations apply configurable performance and first-completion bonuses', () => {
  const rule = {
    completionStars: 5,
    performanceBonusStars: 2,
    performanceThresholdPercent: 90,
    firstCompletionBonusStars: 3
  };
  assert.equal(calculateGameStars(rule, 89), 5);
  assert.equal(calculateGameStars(rule, 90), 7);
  assert.equal(calculateGameStars(rule, 100, { firstCompletion: true }), 10);
  assert.equal(isRewardEligibleScore(79), false);
  assert.equal(isRewardEligibleScore(80), true);
});

test('remaining required games respects mandatory, count, all, and score rules', () => {
  const gameIds = ['one', 'two', 'three', 'four'];
  assert.equal(getRemainingRequiredGames({
    gameIds, mandatoryGameIds: [], completionRule: 'all'
  }, ['one']), 3);
  assert.equal(getRemainingRequiredGames({
    gameIds, mandatoryGameIds: ['one', 'two'], completionRule: 'count', minimumCompletedGames: 2
  }, ['one']), 1);
  assert.equal(getRemainingRequiredGames({
    gameIds, mandatoryGameIds: ['one'], completionRule: 'mandatory-count', additionalGamesCount: 2
  }, ['one', 'two']), 1);
  assert.equal(getRemainingRequiredGames({
    gameIds, mandatoryGameIds: ['one', 'two'], completionRule: 'mandatory-score'
  }, ['one']), 1);
});

test('child reward summaries report lifetime stars for each game', async () => {
  const service = new GamificationService({ childService: { getOwnedChild: async () => ({}) } });
  const originals = {
    definitionFind: RewardDefinition.find,
    transactionFind: RewardTransaction.find,
    aggregate: RewardTransaction.aggregate,
    distinct: RewardTransaction.distinct
  };
  const query = (value) => ({
    sort() { return this; },
    limit() { return this; },
    populate() { return this; },
    lean: async () => value
  });
  RewardDefinition.find = () => query([]);
  RewardTransaction.find = () => query([]);
  RewardTransaction.aggregate = async ([{ $match: filter }]) => (
    filter.sourceGameId
      ? [{ _id: 'word-match', total: 7 }, { _id: 'animal-sounds', total: 4 }]
      : [{ _id: null, total: 11 }]
  );
  RewardTransaction.distinct = async () => [];
  try {
    const rewards = await service.getChildRewards(
      new mongoose.Types.ObjectId(),
      new mongoose.Types.ObjectId()
    );
    assert.equal(rewards.totalStars, 11);
    assert.deepEqual(rewards.starsByGame, { 'word-match': 7, 'animal-sounds': 4 });
  } finally {
    RewardDefinition.find = originals.definitionFind;
    RewardTransaction.find = originals.transactionFind;
    RewardTransaction.aggregate = originals.aggregate;
    RewardTransaction.distinct = originals.distinct;
  }
});
