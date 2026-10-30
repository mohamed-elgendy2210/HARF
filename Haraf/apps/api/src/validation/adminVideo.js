import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const date = z.coerce.date();

export const adminAppointmentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(80).default(''),
  from: date.optional(),
  to: date.optional(),
  bookingStatus: z.enum(['all', 'pending', 'accepted', 'rejected', 'expired']).default('accepted'),
  meetingStatus: z.enum(['all', 'missing', 'scheduled', 'live', 'ended', 'cancelled', 'failed']).default('all')
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'Date range is inverted.'
});

export const adminAppointmentParamsSchema = z.object({ appointmentId: objectId }).strict();
export const adminVideoTestParamsSchema = z.object({ testId: objectId }).strict();

export const adminVideoTestHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  from: date.optional(),
  to: date.optional(),
  administratorId: objectId.optional(),
  status: z.enum(['all', 'succeeded', 'partial', 'failed', 'incomplete', 'in_progress']).default('all')
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'Date range is inverted.'
});

export const adminVideoTestResultsSchema = z.object({
  providerApi: z.enum(['passed', 'failed']).optional(),
  meetingInitialization: z.enum(['passed', 'failed']).optional(),
  connection: z.enum(['passed', 'failed']).optional(),
  camera: z.enum(['manual_passed', 'failed']).optional(),
  microphone: z.enum(['manual_passed', 'failed']).optional(),
  twoParticipants: z.enum(['manual_passed', 'failed']).optional(),
  failureReason: z.enum([
    'JITSI_SCRIPT_LOAD_FAILED',
    'JITSI_MEETING_INITIALIZATION_FAILED',
    'JITSI_CONNECTION_FAILED',
    'CAMERA_ACCESS_FAILED',
    'MICROPHONE_ACCESS_FAILED'
  ]).optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one test result is required.'
});

export const adminSecondParticipantSchema = z.object({
  token: z.string().regex(/^[a-f\d]{64}$/i)
}).strict();
