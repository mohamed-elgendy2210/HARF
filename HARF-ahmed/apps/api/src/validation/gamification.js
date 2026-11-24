import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const gameId = z.string().trim().regex(/^[a-z0-9-]{1,60}$/);
const pathKey = z.string().trim().regex(/^[a-z0-9-]{1,60}$/);
const starCount = z.number().int().min(0).max(10000);
const percent = z.number().int().min(0).max(100);

const rewardRuleSchema = z.object({
  stars: starCount.nullable().optional(),
  badgeRewardId: objectId.nullable().optional(),
  giftRewardId: objectId.nullable().optional()
}).strict();

export const learningLevelSchema = z.object({
  learningPathKey: pathKey,
  title: z.string().trim().min(1).max(120),
  titleEnglish: z.string().trim().max(120).default(''),
  description: z.string().trim().min(1).max(500),
  descriptionEnglish: z.string().trim().max(500).default(''),
  coverImageAssetId: objectId.nullable().default(null),
  sortOrder: z.number().int().min(0).max(10000),
  gameIds: z.array(gameId).min(1).max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'Game IDs must be unique.'),
  minimumCompletedGames: z.number().int().min(0).max(50).default(1),
  minimumScorePercent: percent.default(0),
  mandatoryGameIds: z.array(gameId).max(50).default([])
    .refine((ids) => new Set(ids).size === ids.length, 'Mandatory game IDs must be unique.'),
  completionRule: z.enum(['all', 'count', 'mandatory-count', 'mandatory-score']).default('count'),
  additionalGamesCount: z.number().int().min(0).max(50).default(0),
  unlockAfterLevelId: objectId.nullable().default(null),
  completionReward: rewardRuleSchema.default({}),
  rewardsActive: z.boolean().default(true),
  celebrationEnabled: z.boolean().default(true),
  active: z.boolean().default(true)
}).strict().superRefine((level, context) => {
  const gameIds = new Set(level.gameIds);
  if (level.minimumCompletedGames > level.gameIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['minimumCompletedGames'], message: 'Cannot exceed assigned game count.' });
  }
  level.mandatoryGameIds.forEach((id, index) => {
    if (!gameIds.has(id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['mandatoryGameIds', index], message: 'Mandatory games must be assigned to this level.' });
    }
  });
  if (level.completionRule === 'all' && level.gameIds.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['gameIds'], message: 'Assign at least one game.' });
  }
  if (level.completionRule === 'mandatory-count'
    && level.mandatoryGameIds.length + level.additionalGamesCount > level.gameIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['additionalGamesCount'], message: 'Required games exceed assigned games.' });
  }
  if (level.completionRule === 'mandatory-score' && level.mandatoryGameIds.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['mandatoryGameIds'], message: 'Select at least one mandatory game.' });
  }
  if (level.completionRule === 'mandatory-score' && level.minimumScorePercent < 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['minimumScorePercent'], message: 'A score threshold is required for this rule.' });
  }
});

export const rewardDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  type: z.enum(['badge', 'gift']),
  imageAssetId: objectId.nullable().default(null),
  category: z.string().trim().max(60).default('achievement'),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']).default('common'),
  unlockDescription: z.string().trim().max(300).default(''),
  active: z.boolean().default(true)
}).strict();

const gameRewardSchema = z.object({
  gameId,
  completionStars: starCount,
  performanceBonusStars: starCount,
  performanceThresholdPercent: percent,
  firstCompletionBonusStars: starCount,
  repeatRewardsEnabled: z.boolean(),
  maxRepeatRewardCount: z.number().int().min(0).max(1000),
  repeatCooldownMinutes: z.number().int().min(0).max(43200)
}).strict();

export const gamificationSettingsSchema = z.object({
  completionStars: starCount,
  performanceBonusStars: starCount,
  performanceThresholdPercent: percent,
  firstCompletionBonusStars: starCount,
  levelCompletionStars: starCount,
  adventureCompletionStars: starCount,
  repeatRewardsEnabled: z.boolean(),
  maxRepeatRewardCount: z.number().int().min(0).max(1000),
  repeatCooldownMinutes: z.number().int().min(0).max(43200),
  gameRewards: z.array(gameRewardSchema).max(100)
    .refine((rules) => new Set(rules.map(({ gameId: id }) => id)).size === rules.length, 'Only one reward rule is allowed per game.')
}).strict();

export const levelIdSchema = z.object({ levelId: objectId }).strict();
export const rewardIdSchema = z.object({ rewardId: objectId }).strict();
export const gamificationChildParamsSchema = z.object({ childId: objectId }).strict();
export const levelOrderSchema = z.object({ orderedIds: z.array(objectId).min(1).max(500) })
  .strict()
  .refine(({ orderedIds }) => new Set(orderedIds).size === orderedIds.length, 'Level IDs must be unique.');
export const rewardHistoryQuerySchema = z.object({
  childId: objectId.optional(),
  rewardType: z.enum(['stars', 'badge', 'gift']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
}).strict();
export const childSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(50)
}).strict();
export const learningPathLevelsQuerySchema = z.object({
  pathKey: pathKey.optional()
}).strict();
