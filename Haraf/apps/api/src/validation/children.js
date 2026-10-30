import { z } from 'zod';

const childId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid child identifier.');
const displayName = z.string().trim().min(1).max(50);
const ageBand = z.enum(['3-5', '6-8', '9-12', '13+']).nullable();
const avatar = z.enum(['cat', 'fox', 'panda', 'turtle']).nullable();

export const childIdSchema = z.object({ childId }).strict();

export const createChildSchema = z.object({
  displayName,
  ageBand: ageBand.optional(),
  avatar: avatar.optional()
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
