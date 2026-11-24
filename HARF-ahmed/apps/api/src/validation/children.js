import { z } from 'zod';

const childId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid child identifier.');
const displayName = z.string().trim().min(1).max(50);
const ageBand = z.enum(['3-5', '6-8', '9-12', '13+']).nullable();
const avatar = z.enum(['cat', 'fox', 'panda', 'turtle']).nullable();

export const childIdSchema = z.object({ childId }).strict();

export const createChildSchema = z.object({
  registrationId: z.string().uuid().optional(),
  displayName,
  ageBand: ageBand.optional(),
  avatar: avatar.optional()
}).strict();

const draftAnswers = z.record(
  z.string().regex(/^[a-z0-9-]{1,60}$/),
  z.union([
    z.string().regex(/^[a-z0-9-]{1,60}$/),
    z.array(z.string().regex(/^[a-z0-9-]{1,60}$/)).max(12)
  ])
).refine((answers) => Object.keys(answers).length <= 12, 'Too many questionnaire answers.');

export const childRegistrationDraftSchema = z.object({
  questionnaireVersion: z.number().int().min(1),
  submissionId: z.string().uuid(),
  answers: draftAnswers,
  step: z.enum(['questionnaire', 'review', 'recommendations', 'needs_review'])
}).strict();

export const completeChildRegistrationSchema = z.object({
  questionnaireVersion: z.number().int().min(1),
  submissionId: z.string().uuid(),
  ageBand: z.enum(['3-5', '6-8', '9-12', '13+']).nullable().optional(),
  answers: draftAnswers,
  pathKeys: z.array(z.string().regex(/^[a-z0-9-]{1,60}$/)).max(5)
}).strict();

export const updateChildSchema = z.object({
  displayName: displayName.optional(),
  ageBand: ageBand.optional(),
  avatar: avatar.optional(),
  status: z.enum(['active', 'archived']).optional()
}).strict().refine((updates) => Object.keys(updates).length > 0, {
  message: 'Provide at least one child profile field to update.'
});

export const childConsentSchema = z.object({
  consentType: z.enum(['learning_data', 'progress_reports']),
  granted: z.boolean()
}).strict();
