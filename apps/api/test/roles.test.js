import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoleService } from '../src/services/roleService.js';

const actor = {
  _id: '000000000000000000000001',
  role: 'admin',
  adminRoleId: {
    key: 'limited-admin',
    isActive: true,
    permissions: ['users.view', 'users.create', 'roles.manage']
  }
};

function createService(overrides = {}) {
  const role = {
    _id: '000000000000000000000002',
    key: 'custom-limited',
    name: 'Limited',
    description: '',
    permissions: ['users.view'],
    isSystemRole: false,
    isActive: true
  };
  const repository = {
    async list() { return [role]; },
    async findById() { return role; },
    async findByKey(key) {
      return key === 'admin'
        ? { ...role, key: 'admin', permissions: ['users.view', 'users.create'] }
        : null;
    },
    async create(data) { return { ...data, _id: '000000000000000000000003' }; },
    async update(_id, updates) { return { ...role, ...updates }; },
    async delete() { return role; },
    async countAssignments() { return 0; },
    async assignAdministratorRole() {
      return {
        _id: '000000000000000000000004',
        email: 'admin@example.invalid',
        role: 'admin',
        adminRoleId: role
      };
    },
    ...overrides
  };
  const authRepository = {
    async createAuditEvent() {},
    async deleteSessions() {},
    async findUserById() {
      return { _id: '000000000000000000000004', role: 'admin', adminRoleId: role };
    }
  };
  return new RoleService({ repository, authRepository });
}

test('new administrator roles cannot exceed the creator permission set', async () => {
  const service = createService({
    async findByKey(key) {
      return key === 'admin'
        ? { _id: '000000000000000000000005', key: 'admin', permissions: ['users.view', 'users.create', 'payments.verify'] }
        : null;
    }
  });
  const role = await service.roleForNewAdministrator(actor, 'new-admin@example.invalid');
  assert.deepEqual(role.permissions, actor.adminRoleId.permissions);
  assert.notEqual(role.key, 'admin');
});

test('role creation rejects permissions the acting administrator does not have', async () => {
  const service = createService();
  await assert.rejects(service.create(actor, {
    name: 'Escalated',
    description: '',
    permissions: ['permissions.manage']
  }), (error) => error.statusCode === 403 && error.code === 'PERMISSION_ESCALATION_BLOCKED');
});

test('role assignment rejects permissions outside the acting administrator grant', async () => {
  const service = createService({
    async findById() {
      return {
        _id: '000000000000000000000002',
        key: 'custom-elevated',
        name: 'Elevated',
        permissions: ['payments.verify'],
        isActive: true
      };
    }
  });
  await assert.rejects(service.assignAdministratorRole(
    actor,
    '000000000000000000000004',
    '000000000000000000000002'
  ), (error) => error.statusCode === 403 && error.code === 'PERMISSION_ESCALATION_BLOCKED');
});

test('protected system roles cannot be changed or deleted', async () => {
  const service = createService({
    async findById() {
      return {
        _id: '000000000000000000000002',
        key: 'super-admin',
        name: 'Super Admin',
        permissions: [],
        isSystemRole: true,
        isActive: true
      };
    }
  });
  await assert.rejects(service.update(actor, '000000000000000000000002', {
    name: 'Changed',
    description: '',
    permissions: []
  }), (error) => error.code === 'PROTECTED_ROLE');
  await assert.rejects(service.remove(actor, '000000000000000000000002'), (error) => error.code === 'PROTECTED_ROLE');
});
