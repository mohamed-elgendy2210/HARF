import { z } from 'zod';

const childId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid child identifier.');
const gameId = z.string().regex(/^[a-z0-9-]{1,60}$/);

export const gameIdSchema = z.object({ gameId }).strict();

export const gameAttemptSchema = z.object({
  childId,
  submissionId: z.string().uuid().optional(),
  gameVersion: z.string().regex(/^\d{1,10}$/).optional(),
  answers: z.array(z.number().int().min(-1).max(9)).min(1).max(20).optional(),
  durationSeconds: z.number().int().min(0).max(3600)
}).strict();

export const gameAnswerSchema = z.object({
  childId: childId.optional(),
  submissionId: z.string().uuid().optional(),
  questionIndex: z.number().int().min(0).max(19),
  answerIndex: z.number().int().min(-1).max(9),
  gameVersion: z.string().regex(/^\d{1,10}$/).optional()
}).strict();

export const gameSpatialInteractionSchema = z.object({
  childId: childId.optional(),
  submissionId: z.string().uuid().optional(),
  questionIndex: z.number().int().min(0).max(19),
  gameVersion: z.string().regex(/^\d{1,10}$/).optional(),
  action: z.enum(['session_started', 'placement', 'instruction_replay', 'hint', 'demonstration']),
  position: z.object({
    x: z.number().min(0).max(1000),
    y: z.number().min(0).max(1000)
  }).strict().optional()
}).strict().refine((value) => (
  value.action === 'placement' ? Boolean(value.position) : value.position === undefined
), { message: 'A final scene position is required only for placement checks.' });

export const gameInteractionSchema = z.union([gameAnswerSchema, gameSpatialInteractionSchema]);

export const childAttemptsParamsSchema = z.object({ childId }).strict();

export const childAttemptsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  gameId: gameId.optional()
}).strict();

export const gameChildQuerySchema = z.object({
  childId: childId.optional()
}).strict();
