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

export const sessionPaymentSettingsSchema = z.object({
  enabled: z.boolean(),
  paymentDeadlineHours: z.number().int().min(1).max(168)
}).strict();

export const sessionPaymentSubmissionSchema = z.object({
  method: paymentMethod
}).strict();

export const sessionPaymentDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  decisionNote: z.string().trim().max(300).optional().default('')
}).strict().refine(
  (value) => value.decision !== 'rejected' || value.decisionNote.length >= 3,
  { message: 'يجب كتابة سبب واضح لرفض الإيصال.', path: ['decisionNote'] }
);

export const sessionPaymentParamsSchema = z.object({
  appointmentId: z.string().regex(/^[a-f\d]{24}$/i)
}).strict();

export const adminSessionPaymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['all', 'awaiting_payment', 'pending_verification', 'approved', 'rejected', 'expired']).default('all'),
  method: z.enum(['all', 'vodafone_cash', 'instapay']).default('all'),
  search: z.string().trim().max(80).default(''),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'نطاق التاريخ غير صحيح.'
});
