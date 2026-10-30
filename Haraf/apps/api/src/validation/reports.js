import { z } from 'zod';

const dateTime = z.string().datetime({ offset: true }).transform((value) => new Date(value));

export const reportRangeSchema = z.object({
  from: dateTime.optional(),
  to: dateTime.optional()
}).strict().refine(({ from, to }) => !from || !to || from <= to, {
  message: 'The report start date must be before its end date.'
}).refine(({ from, to }) => !from || !to || to.getTime() - from.getTime() <= 366 * 24 * 60 * 60 * 1000, {
  message: 'Report date ranges cannot exceed 366 days.'
});
