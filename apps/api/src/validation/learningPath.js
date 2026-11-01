import { z } from 'zod';

const gameId = z.string().regex(/^[a-z0-9-]{1,60}$/);
const pathKey = z.string().regex(/^[a-z0-9-]{1,60}$/);
const skillId = z.string().regex(/^[a-z0-9-]{1,60}$/);
const answerId = z.string().regex(/^[a-z0-9-]{1,60}$/);
const ageBands = z.array(z.enum(['3-5', '6-8', '9-12', '13+'])).max(4);
const activitySchema = z.object({
  gameId,
  title: z.string().trim().min(1).max(100),
  learningArea: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(240),
  required: z.boolean().default(true),
  repeatable: z.boolean().default(true),
  skillIds: z.array(skillId).max(10).default([])
}).strict();
const rulesSchema = z.object({
  minimumAttempts: z.number().int().min(2).max(10),
  sampleSize: z.number().int().min(2).max(10),
  targetAccuracyPercent: z.number().int().min(50).max(100)
}).strict().refine((rules) => rules.sampleSize >= rules.minimumAttempts, {
  message: 'The result sample must be at least as large as the minimum attempt count.'
});

export const learningPathSchema = z.object({
  key: pathKey.optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  ageBands: ageBands.optional(),
  skillIds: z.array(skillId).max(20).default([]),
  objectives: z.array(z.string().trim().min(1).max(180)).max(12).default([]),
  matchingRules: z.object({
    skillIds: z.array(skillId).max(20).default([]),
    answerOptionIds: z.array(answerId).max(30).default([]),
    ageBands: ageBands.default([]),
    minimumMatches: z.number().int().min(1).max(20).default(1),
    priority: z.number().int().min(0).max(1000).default(0),
    assignmentType: z.enum(['primary', 'complementary', 'either']).default('either')
  }).strict().default({}),
  activities: z.array(activitySchema).min(1).max(20).refine(
    (activities) => new Set(activities.map(({ gameId: id }) => id)).size === activities.length,
    'Each game can appear only once in the learning path.'
  ),
  rules: rulesSchema
}).strict();

export const learningPathParamsSchema = z.object({ pathKey }).strict();
export const learningPathCreateSchema = learningPathSchema.extend({ key: pathKey });
export const learningAssignmentReviewSchema = z.object({
  parentUserId: z.string().regex(/^[a-f\d]{24}$/i),
  childId: z.string().regex(/^[a-f\d]{24}$/i),
  pathKey,
  status: z.enum(['active', 'paused', 'removed']),
  reason: z.string().trim().max(300).default('')
}).strict();
export const learningAssignmentQuerySchema = z.object({
  childId: z.string().regex(/^[a-f\d]{24}$/i).optional()
}).strict();

const questionnaireBaseSchema = z.object({
  maxAssignments: z.number().int().min(1).max(5),
  questions: z.array(z.object({
    id: answerId,
    text: z.string().trim().min(1).max(240),
    helpText: z.string().trim().max(240).default(''),
    type: z.enum(['single', 'multiple']),
    required: z.boolean(),
    options: z.array(z.object({
      id: answerId,
      label: z.string().trim().min(1).max(160),
      skillIds: z.array(skillId).max(10).default([])
    }).strict()).min(2).max(12).refine(
      (options) => new Set(options.map(({ id }) => id)).size === options.length,
      'Question option identifiers must be unique.'
    )
  }).strict()).min(1).max(12).refine(
    (questions) => new Set(questions.map(({ id }) => id)).size === questions.length,
    'Question identifiers must be unique.'
  )
}).strict();
export const questionnaireSchema = questionnaireBaseSchema.refine(
  ({ questions }) => {
    const optionIds = questions.flatMap(({ options }) => options.map(({ id }) => id));
    return new Set(optionIds).size === optionIds.length;
  },
  { message: 'Option identifiers must be unique across the questionnaire.', path: ['questions'] }
);

export const questionnaireSubmissionSchema = z.object({
  questionnaireVersion: z.number().int().min(1),
  submissionId: z.string().uuid(),
  ageBand: z.enum(['3-5', '6-8', '9-12', '13+']).nullable().optional(),
  answers: z.record(z.string().regex(/^[a-z0-9-]{1,60}$/), z.union([
    z.string().regex(/^[a-z0-9-]{1,60}$/),
    z.array(z.string().regex(/^[a-z0-9-]{1,60}$/)).max(12)
  ])).refine((answers) => Object.keys(answers).length <= 12, 'Too many questionnaire answers.')
}).strict();

export const confirmPathAssignmentsSchema = questionnaireSubmissionSchema.extend({
  pathKeys: z.array(pathKey).max(5)
}).strict();

export const childLearningProgressParamsSchema = z.object({
  childId: z.string().regex(/^[a-f\d]{24}$/i)
}).strict();
