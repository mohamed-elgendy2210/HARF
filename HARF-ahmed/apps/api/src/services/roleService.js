import { randomUUID } from 'node:crypto';
import { ALL_PERMISSIONS, getRolePermissions, PERMISSIONS } from '../auth/permissions.js';
import { AppError } from '../middleware/errors.js';

const protectedRoleKeys = new Set(['super-admin', 'parent', 'therapist']);

function serializeRole(role) {
  if (!role) return null;
  return {
    id: String(role._id ?? role.id),
    key: role.key,
    name: role.name,
    description: role.description ?? '',
    permissions: [...(role.permissions ?? [])],
    isSystemRole: role.isSystemRole === true,
    isActive: role.isActive !== false
  };
}

export class RoleService {
  constructor({ repository, authRepository }) {
    this.repository = repository;
    this.authRepository = authRepository;
  }

  async list() {
    return (await this.repository.list()).map(serializeRole);
  }

  permissionCatalog() {
    return Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description }));
  }

  async findSystemRole(key) {
    const role = await this.repository.findByKey(key);
    if (!role) throw new Error(`Required system role "${key}" is missing.`);
    return role;
  }

  async create(actor, { name, description, permissions }) {
    const actorPermissions = getRolePermissions(actor);
    if (permissions.some((permission) => !actorPermissions.includes(permission))) {
      throw new AppError(403, 'PERMISSION_ESCALATION_BLOCKED', 'A role cannot grant permissions the acting administrator does not have.');
    }
    const role = await this.repository.create({
      key: `custom-${randomUUID()}`,
      name: name.trim(),
      description: description.trim(),
      permissions: [...new Set(permissions)],
      isSystemRole: false,
      isActive: true
    });
    await this.authRepository.createAuditEvent({
      action: 'admin.role_created',
      actorUserId: actor._id ?? actor.id,
      metadata: { roleId: String(role._id), roleName: role.name }
    });
    return serializeRole(role);
  }

  async update(actor, roleId, updates) {
    if (!/^[a-f\d]{24}$/i.test(roleId)) {
      throw new AppError(400, 'INVALID_ROLE_ID', 'The role identifier is invalid.');
    }
    const current = await this.repository.findById(roleId);
    if (!current) throw new AppError(404, 'ROLE_NOT_FOUND', 'The role was not found.');
    if (protectedRoleKeys.has(current.key)) {
      throw new AppError(409, 'PROTECTED_ROLE', 'This system role cannot be changed.');
    }
    if (current.key === 'admin' && !updates.permissions.includes('users.view')) {
      throw new AppError(400, 'ESSENTIAL_PERMISSION_REQUIRED', 'The Admin role must retain users.view.');
    }
    const actorPermissions = getRolePermissions(actor);
    if (updates.permissions.some((permission) => !actorPermissions.includes(permission))) {
      throw new AppError(403, 'PERMISSION_ESCALATION_BLOCKED', 'A role cannot grant permissions the acting administrator does not have.');
    }
    if (updates.isActive === false && await this.repository.countAssignments(roleId)) {
      throw new AppError(409, 'ROLE_IN_USE', 'A role assigned to an administrator cannot be deactivated.');
    }
    const permissions = [...new Set(updates.permissions)];
    if (permissions.some((permission) => !ALL_PERMISSIONS.includes(permission))) {
      throw new AppError(400, 'INVALID_PERMISSION', 'One or more permissions are not recognized.');
    }
    const updated = await this.repository.update(roleId, {
      name: updates.name.trim(),
      description: updates.description.trim(),
      permissions,
      ...(updates.isActive === undefined ? {} : { isActive: updates.isActive })
    });
    await this.authRepository.createAuditEvent({
      action: 'admin.role_permissions_changed',
      actorUserId: actor._id ?? actor.id,
      metadata: { roleId: String(roleId), roleName: updated.name, permissions }
    });
    return serializeRole(updated);
  }

  async remove(actor, roleId) {
    if (!/^[a-f\d]{24}$/i.test(roleId)) {
      throw new AppError(400, 'INVALID_ROLE_ID', 'The role identifier is invalid.');
    }
    const role = await this.repository.findById(roleId);
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'The role was not found.');
    if (role.isSystemRole) {
      throw new AppError(409, 'PROTECTED_ROLE', 'System roles cannot be deleted.');
    }
    if (await this.repository.countAssignments(roleId)) {
      throw new AppError(409, 'ROLE_IN_USE', 'A role assigned to an administrator cannot be deleted.');
    }
    await this.repository.delete(roleId);
    await this.authRepository.createAuditEvent({
      action: 'admin.role_deleted',
      actorUserId: actor._id ?? actor.id,
      metadata: { roleId: String(roleId), roleName: role.name }
    });
  }

  async assignAdministratorRole(actor, userId, roleId) {
    if (!/^[a-f\d]{24}$/i.test(userId) || !/^[a-f\d]{24}$/i.test(roleId)) {
      throw new AppError(400, 'INVALID_ROLE_ASSIGNMENT', 'The role assignment is invalid.');
    }
    if (String(actor._id ?? actor.id) === String(userId)) {
      throw new AppError(400, 'SELF_ROLE_CHANGE_NOT_ALLOWED', 'You cannot change your own administrator role.');
    }
    const target = await this.authRepository.findUserById(userId);
    if (target?.adminRoleId?.key === 'super-admin') {
      throw new AppError(409, 'PROTECTED_ADMINISTRATOR', 'The Super Admin role cannot be reassigned.');
    }
    const role = await this.repository.findById(roleId);
    if (!role || !role.isActive || role.key === 'super-admin') {
      throw new AppError(400, 'INVALID_ADMIN_ROLE', 'Choose an active administrator role.');
    }
    const actorPermissions = getRolePermissions(actor);
    if (role.permissions.some((permission) => !actorPermissions.includes(permission))) {
      throw new AppError(403, 'PERMISSION_ESCALATION_BLOCKED', 'You cannot assign an administrator a role with permissions you do not have.');
    }
    const updated = await this.repository.assignAdministratorRole(userId, roleId);
    if (!updated) throw new AppError(404, 'ADMINISTRATOR_NOT_FOUND', 'The administrator was not found.');
    await this.authRepository.deleteSessions(userId);
    await this.authRepository.createAuditEvent({
      action: 'admin.role_assigned',
      actorUserId: actor._id ?? actor.id,
      targetUserId: userId,
      metadata: { roleId: String(roleId), roleKey: role.key }
    });
    return {
      id: String(updated._id),
      email: updated.email,
      role: updated.role,
      adminRole: serializeRole(updated.adminRoleId)
    };
  }

  async roleForNewAdministrator(actor, email) {
    const actorPermissions = getRolePermissions(actor);
    const defaultRole = await this.findSystemRole('admin');
    if (defaultRole.permissions.every((permission) => actorPermissions.includes(permission))) {
      return defaultRole;
    }
    const role = await this.repository.create({
      key: `custom-${randomUUID()}`,
      name: `Admin: ${email}`,
      description: 'Automatically limited to the creating administrator permissions.',
      permissions: actorPermissions,
      isSystemRole: false,
      isActive: true
    });
    await this.authRepository.createAuditEvent({
      action: 'admin.role_created',
      actorUserId: actor._id ?? actor.id,
      metadata: { roleId: String(role._id), roleName: role.name, source: 'administrator_provisioning' }
    });
    return role;
  }
}
