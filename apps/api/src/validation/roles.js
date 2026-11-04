import { z } from 'zod';
import { ALL_PERMISSIONS } from '../auth/permissions.js';

const permissionSchema = z.enum(ALL_PERMISSIONS);

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(''),
  permissions: z.array(permissionSchema).max(ALL_PERMISSIONS.length)
}).strict();

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500),
  permissions: z.array(permissionSchema).max(ALL_PERMISSIONS.length),
  isActive: z.boolean().optional()
}).strict();

export const administratorRoleSchema = z.object({
  roleId: z.string().regex(/^[a-f\d]{24}$/i)
}).strict();
