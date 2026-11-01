import { z } from 'zod';

const color = z.string().regex(/^#[\da-f]{6}$/i);
const homepage = z.object({
  eyebrow: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(300),
  primaryAction: z.string().trim().min(1).max(50),
  secondaryAction: z.string().trim().min(1).max(50)
}).strict();
export const platformSettingsSchema = z.object({
  logoAssetId: z.string().regex(/^[a-f\d]{24}$/i).nullable(),
  heroImageAssetIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(8).default([])
    .refine((assetIds) => new Set(assetIds).size === assetIds.length, 'Hero images must be unique.'),
  colors: z.object({
    primary: color,
    teal: color,
    purple: color,
    yellow: color,
    coral: color,
    ink: color.default('#273DA8'),
    muted: color.default('#7884B5')
  }).strict(),
  homepage
}).strict();
