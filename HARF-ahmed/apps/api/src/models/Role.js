import mongoose from 'mongoose';
import { ALL_PERMISSIONS } from '../auth/permissions.js';

const roleSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z][a-z0-9-]{1,39}$/ },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  permissions: { type: [{ type: String, enum: ALL_PERMISSIONS }], default: [] },
  isSystemRole: { type: Boolean, default: false, required: true },
  isActive: { type: Boolean, default: true, required: true }
}, { timestamps: true, strict: 'throw', minimize: true });

roleSchema.index({ key: 1 }, { unique: true, name: 'roles_key_unique' });
roleSchema.index({ isActive: 1, name: 1 }, { name: 'roles_active_name' });

export const Role = mongoose.models.Role ?? mongoose.model('Role', roleSchema);
