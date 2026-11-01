import { z } from 'zod';
import { isReadableName } from '../lib/nameValidation.js';

const email = z.string().trim().email().max(254);
const password = z.string().min(12).max(128);
const displayName = z.string().trim().min(2).max(100).refine(
  isReadableName,
  'Enter a name containing letters or numbers.'
);

export const registrationSchema = z.object({
  email,
  password,
  role: z.enum(['parent', 'specialist']),
  displayName
}).strict();

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128)
}).strict();

export const emailSchema = z.object({ email }).strict();

export const tokenSchema = z.object({
  token: z.string().min(32).max(128)
}).strict();

export const passwordResetSchema = z.object({
  token: z.string().min(32).max(128),
  password
}).strict();

export const specialistProfileSchema = z.object({
  displayName: z.string().trim().max(100).refine(
    (value) => value.length === 0 || isReadableName(value),
    'Enter a professional name containing letters or numbers.'
  ).default(''),
  specialty: z.string().trim().max(100).default(''),
  credentials: z.string().trim().max(160).default(''),
  bio: z.string().trim().max(1200).default(''),
  publicListing: z.boolean().default(false)
}).strict();

export const approvalSchema = z.object({
  approvalStatus: z.enum(['approved', 'rejected'])
}).strict();

export const accountStatusSchema = z.object({
  accountStatus: z.enum(['active', 'suspended'])
}).strict();

export const administratorCreateSchema = z.object({
  email,
  password
}).strict();

export const accountIdSchema = z.object({
  accountId: z.string().regex(/^[a-f\d]{24}$/i)
}).strict();
