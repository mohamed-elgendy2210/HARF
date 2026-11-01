import { z } from 'zod';

const gameId = z.string().regex(/^[a-z0-9-]{1,60}$/);
const delimitedText = (maximum) => z.string().trim().min(1).max(maximum)
  .refine((value) => !value.includes('|'), 'The vertical bar character is reserved as the question editor delimiter.');
const answerOption = delimitedText(80);
const mediaAssetId = z.string().regex(/^[a-f\d]{24}$/i);
const question = z.object({
  prompt: delimitedText(300),
  options: z.array(answerOption).min(2).max(8),
  correctAnswerIndex: z.number().int().min(0).max(7),
  promptImageAssetId: mediaAssetId.nullable().optional(),
  promptAudioAssetId: mediaAssetId.nullable().optional(),
  optionImageAssetIds: z.array(mediaAssetId.nullable()).max(8).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional().default('beginner'),
  correctFeedback: z.string().trim().max(180).optional().default(''),
  incorrectFeedback: z.string().trim().max(180).optional().default('')
}).strict().refine((item) => item.correctAnswerIndex < item.options.length, {
  message: 'The correct answer must refer to an available option.'
});
const picturePair = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,30}$/),
  label: delimitedText(80),
  imageAssetId: mediaAssetId.nullable()
}).strict();
const spatialObject = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,30}$/),
  label: z.string().trim().min(1).max(80),
  assetId: mediaAssetId.nullable(),
  movable: z.boolean(),
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(1000),
  width: z.number().min(20).max(1000),
  height: z.number().min(20).max(1000),
  layer: z.number().int().min(0).max(20)
}).strict().refine((item) => item.x + item.width <= 1000 && item.y + item.height <= 1000, {
  message: 'Spatial objects must fit inside the scene.'
});
const spatialRegion = z.object({
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(1000),
  width: z.number().min(1).max(1000),
  height: z.number().min(1).max(1000)
}).strict().refine((region) => region.x + region.width <= 1000 && region.y + region.height <= 1000, {
  message: 'The target region must fit inside the scene.'
});
const spatialStep = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,30}$/),
  instruction: z.string().trim().min(1).max(240),
  instructionAudioAssetId: mediaAssetId.nullable().optional(),
  movableObjectId: z.string().regex(/^[a-z0-9-]{1,30}$/),
  relationship: z.enum(['inside', 'outside', 'above', 'below', 'front', 'behind', 'next-to', 'between']),
  targetObjectId: z.string().regex(/^[a-z0-9-]{1,30}$/).nullable().optional(),
  secondTargetObjectId: z.string().regex(/^[a-z0-9-]{1,30}$/).nullable().optional(),
  targetRegion: spatialRegion,
  tolerance: z.number().min(0).max(250).default(35)
}).strict();
const spatialContent = z.object({
  level: z.number().int().min(1).max(5),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  scene: z.object({
    backgroundAssetId: mediaAssetId.nullable(),
    aspectRatio: z.number().min(0.5).max(2.5).default(1.6),
    objects: z.array(spatialObject).min(2).max(20)
  }).strict(),
  steps: z.array(spatialStep).min(1).max(20),
  assistance: z.object({
    enabled: z.boolean().default(true),
    visualHintAfter: z.number().int().min(1).max(10).default(3),
    demonstrationAfter: z.number().int().min(2).max(15).default(5)
  }).strict().default({ enabled: true, visualHintAfter: 3, demonstrationAfter: 5 })
}).strict().superRefine((spatial, context) => {
  const objectsById = new Map(spatial.scene.objects.map((item) => [item.id, item]));
  if (objectsById.size !== spatial.scene.objects.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['scene', 'objects'], message: 'Spatial object IDs must be unique.' });
  }
  if (!spatial.scene.objects.some(({ movable }) => movable)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['scene', 'objects'], message: 'At least one object must be movable.' });
  }
  const stepIds = new Set();
  spatial.steps.forEach((step, index) => {
    const movable = objectsById.get(step.movableObjectId);
    if (!movable?.movable) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', index, 'movableObjectId'], message: 'Each step must reference a movable object.' });
    }
    if (stepIds.has(step.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', index, 'id'], message: 'Step IDs must be unique.' });
    }
    stepIds.add(step.id);
    for (const id of [step.targetObjectId, step.secondTargetObjectId].filter(Boolean)) {
      if (!objectsById.has(id) || objectsById.get(id)?.movable) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', index, 'targetObjectId'], message: 'Spatial references must point to a static scene object.' });
      }
    }
    if (['inside', 'outside', 'above', 'below', 'front', 'behind', 'next-to'].includes(step.relationship)
      && !step.targetObjectId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', index, 'targetObjectId'], message: 'This relationship requires a reference object.' });
    }
    if (step.relationship === 'between' && (!step.targetObjectId || !step.secondTargetObjectId
      || step.targetObjectId === step.secondTargetObjectId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', index, 'secondTargetObjectId'], message: 'Between requires two different reference objects.' });
    }
  });
  if (spatial.assistance.demonstrationAfter <= spatial.assistance.visualHintAfter) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['assistance', 'demonstrationAfter'], message: 'The demonstration must come after the visual hint.' });
  }
});
const eventAssignment = z.object({
  event: z.enum(['welcome', 'idle', 'listening', 'thinking', 'encouragement', 'correct', 'completion', 'result-success', 'result-practice', 'background']),
  kind: z.enum(['image', 'audio', 'animation', 'video']),
  assetId: z.string().regex(/^[a-f\d]{24}$/i)
}).strict();
const gameContent = z.object({
  template: z.enum(['multiple-choice', 'matching-pairs', 'picture-matching', 'audio-choice', 'spatial-relationships']).default('multiple-choice'),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(240),
  companion: z.string().trim().min(1).max(80),
  companionAnimal: z.string().trim().min(1).max(12),
  instructions: z.string().trim().min(1).max(500),
  questions: z.array(question).max(20).default([]),
  pairs: z.array(picturePair).min(2).max(8).optional(),
  spatial: spatialContent.optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional().default('beginner'),
  assetAssignments: z.array(eventAssignment).max(40)
}).strict().refine((content) => {
  const keys = content.assetAssignments.map(({ event, kind }) => `${event}:${kind}`);
  return new Set(keys).size === keys.length;
}, { message: 'Each media type may be assigned only once per event.' }).refine((content) => (
  content.questions.every((item) => !item.optionImageAssetIds
    || item.optionImageAssetIds.length === item.options.length)
), { message: 'Every configured option image must align with its question option.' }).refine((content) => (
  content.template === 'spatial-relationships'
    ? Boolean(content.spatial && content.questions.length === 0)
    : content.template === 'picture-matching'
    ? Boolean(content.pairs?.length
      && new Set(content.pairs.map(({ id }) => id)).size === content.pairs.length
      && new Set(content.pairs.filter(({ imageAssetId }) => imageAssetId).map(({ imageAssetId }) => imageAssetId)).size
        === content.pairs.filter(({ imageAssetId }) => imageAssetId).length)
    : content.questions.length > 0
), { message: 'Spatial games require a valid scene and steps, picture matching requires two to eight uniquely identified pairs, and other games require at least one question.' });

export const createGameSchema = z.object({
  gameId,
  content: gameContent
}).strict();

export const updateGameSchema = z.object({
  content: gameContent
}).strict();

export const gameLibraryParamsSchema = z.object({ gameId }).strict();
export const trialGameSchema = z.object({ gameId }).strict();
export const trialGamesSchema = z.object({
  gameIds: z.array(gameId).length(4).refine((ids) => new Set(ids).size === ids.length, 'Choose four different games.')
}).strict();

export const uploadAssetMetadataSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  kind: z.enum(['image', 'audio', 'animation', 'video']),
  altText: z.string().trim().max(200).optional().default(''),
  category: z.string().trim().max(40).optional().default(''),
  tags: z.string().trim().max(500).optional().default('')
    .transform((value) => [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))])
    .pipe(z.array(z.string().min(1).max(30)).max(10))
}).strict();

export const updateAssetSchema = z.object({
  active: z.boolean().optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
  altText: z.string().trim().max(200).optional(),
  category: z.string().trim().max(40).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one asset field must be updated.');

export const assetIdSchema = z.object({
  assetId: z.string().regex(/^[a-f\d]{24}$/i)
}).strict();
