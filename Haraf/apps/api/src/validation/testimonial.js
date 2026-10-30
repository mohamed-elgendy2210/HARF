import { z } from 'zod';

export const testimonialSchema = z.object({
  quote: z.string().trim().min(10).max(600),
  displayName: z.string().trim().max(60).default('')
}).strict();

export const testimonialIdSchema = z.object({
  testimonialId: z.string().regex(/^[a-f\d]{24}$/i)
}).strict();

export const testimonialDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected'])
}).strict();
