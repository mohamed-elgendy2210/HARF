import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const clockTime = z.string().regex(/^([01]\d|2[0-3]):(?:00|15|30|45)$/);
const scheduleWindow = z.object({
  start: clockTime,
  end: clockTime
}).strict().refine(({ start, end }) => start < end, {
  message: 'Availability windows must end after they start.'
});

function windowsDoNotOverlap(windows) {
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.every((window, index) => index === 0 || sorted[index - 1].end <= window.start);
}

const windowsSchema = z.array(scheduleWindow).max(4).refine(windowsDoNotOverlap, {
  message: 'Availability windows cannot overlap.'
});

const weeklyDay = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  windows: windowsSchema
}).strict();

const exception = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  windows: windowsSchema
}).strict().refine(({ date }) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}, { message: 'Availability exception date is invalid.' });

export const specialistAvailabilitySchema = z.object({
  timeZone: z.string().trim().min(1).max(80),
  appointmentPriceMinor: z.number().int().min(100).max(100000000),
  appointmentCurrency: z.literal('EGP'),
  appointmentDurationMinutes: z.number().int().min(15).max(240).multipleOf(15),
  weeklySchedule: z.array(weeklyDay).length(7).refine(
    (days) => new Set(days.map(({ dayOfWeek }) => dayOfWeek)).size === 7,
    'Provide exactly one weekly schedule for each day.'
  ),
  exceptions: z.array(exception).max(100).refine(
    (items) => new Set(items.map(({ date }) => date)).size === items.length,
    'Only one exception may be configured per date.'
  )
}).strict();

export const specialistAvailabilityParamsSchema = z.object({
  specialistId: objectId
}).strict();

export const appointmentParamsSchema = z.object({
  appointmentId: objectId
}).strict();

export const availabilityQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  days: z.coerce.number().int().min(1).max(30).default(14)
}).strict();

export const createAppointmentSchema = z.object({
  childId: objectId,
  specialistId: objectId,
  startsAt: z.string().datetime({ offset: true })
}).strict();

export const appointmentDecisionSchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
  decisionNote: z.string().trim().max(300).optional().default('')
}).strict();

export const completeAppointmentSessionSchema = z.object({
  privateNotes: z.string().trim().max(4000).default(''),
  parentReport: z.object({
    summary: z.string().trim().min(1).max(2000),
    suggestedActivities: z.array(z.string().trim().min(1).max(120)).max(5).default([])
  }).strict().optional()
}).strict();
