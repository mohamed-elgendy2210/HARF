import { z } from 'zod';

const paymentMethod = z.enum(['vodafone_cash', 'instapay']);

export const paymentRequestSchema = z.object({
  method: paymentMethod,
  period: z.enum(['monthly', 'annual']).default('monthly'),
  transactionReference: z.string().trim().min(3).max(100)
}).strict();

const methodSettingsSchema = z.object({
  enabled: z.boolean(),
  recipient: z.string().trim().max(120),
  instructions: z.string().trim().max(500)
}).strict().refine(
  (method) => !method.enabled || (method.recipient.length > 0 && method.instructions.length > 0),
  'Enabled payment methods need recipient and instructions.'
);

export const subscriptionSettingsSchema = z.object({
  amountMinor: z.number().int().min(100).max(100000000),
  annualAmountMinor: z.number().int().min(100).max(100000000).nullable().optional(),
  currency: z.literal('EGP'),
  vodafoneCash: methodSettingsSchema,
  instaPay: methodSettingsSchema
}).strict();

export const paymentRequestParamsSchema = z.object({
  paymentId: z.string().regex(/^[a-f\d]{24}$/i)
}).strict();

export const paymentDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  decisionNote: z.string().trim().max(300).optional().default('')
}).strict();
