import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALL_PERMISSIONS,
  getRolePermissions,
  permissionForAdminRequest,
  requireAdminRequestPermission,
  requirePermission
} from '../src/auth/permissions.js';

function authorize(user, permission) {
  let error;
  requirePermission(permission)({ authenticated: { user } }, {}, (nextError) => {
    error = nextError;
  });
  return error;
}

test('permission middleware grants only active admin roles with the requested permission', () => {
  assert.equal(authorize({
    role: 'admin',
    adminRoleId: { permissions: ['reports.view'], isActive: true }
  }, 'reports.view'), undefined);
  assert.equal(authorize({
    role: 'admin',
    adminRoleId: { permissions: ['reports.view'], isActive: true }
  }, 'payments.view').statusCode, 403);
  assert.equal(authorize({
    role: 'admin',
    adminRoleId: { permissions: ALL_PERMISSIONS, isActive: false }
  }, 'reports.view').statusCode, 403);
  assert.equal(authorize({
    role: 'parent',
    adminRoleId: { permissions: ALL_PERMISSIONS, isActive: true }
  }, 'reports.view').statusCode, 403);
});

test('super-admin gets every current permission even when its stored permission list is stale', () => {
  const user = {
    role: 'admin',
    adminRoleId: { key: 'super-admin', permissions: ['users.view'], isActive: true }
  };
  assert.deepEqual(getRolePermissions(user), ALL_PERMISSIONS);

  let error;
  requireAdminRequestPermission({
    method: 'GET',
    path: '/games',
    authenticated: { user }
  }, {}, (nextError) => { error = nextError; });
  assert.equal(error, undefined);
});

test('super-admin can pass both read and manage checks for the admin game library', () => {
  const user = {
    role: 'admin',
    adminRoleId: { key: 'super-admin', permissions: ['users.view'], isActive: true }
  };
  for (const [method, path] of [['GET', '/games'], ['POST', '/games/test/preview/answer']]) {
    let error;
    requireAdminRequestPermission({ method, path, authenticated: { user } }, {}, (nextError) => {
      error = nextError;
    });
    assert.equal(error, undefined);
  }
});

test('admin endpoints map to centralized permissions and unknown endpoints fail closed', () => {
  assert.equal(permissionForAdminRequest('PATCH', '/accounts/0123456789abcdef01234567/approval'), 'users.approve');
  assert.equal(permissionForAdminRequest('POST', '/payments/0123456789abcdef01234567/review'), 'payments.verify');
  assert.equal(permissionForAdminRequest('PUT', '/learning-questionnaire'), 'questionnaires.manage');
  assert.equal(permissionForAdminRequest('GET', '/learning-levels'), 'learningPaths.view');
  assert.equal(permissionForAdminRequest('POST', '/learning-levels'), 'learningPaths.manage');
  assert.equal(permissionForAdminRequest('PUT', '/learning-levels/0123456789abcdef01234567'), 'learningPaths.manage');
  assert.equal(permissionForAdminRequest('PATCH', '/learning-paths/vocabulary/learning-levels/reorder'), 'learningPaths.manage');
  assert.equal(permissionForAdminRequest('GET', '/rewards'), 'learningPaths.view');
  assert.equal(permissionForAdminRequest('DELETE', '/rewards/0123456789abcdef01234567'), 'learningPaths.manage');
  assert.deepEqual(permissionForAdminRequest('GET', '/reports'), ['reports.view', 'reports.financial']);
  assert.equal(permissionForAdminRequest('GET', '/unregistered-route'), null);
});

test('role creation requires both role and permission management rights', () => {
  const request = {
    method: 'POST',
    path: '/roles',
    authenticated: {
      user: {
        role: 'admin',
        adminRoleId: { permissions: ['roles.manage'], isActive: true }
      }
    }
  };
  let error;
  requireAdminRequestPermission(request, {}, (nextError) => { error = nextError; });
  assert.equal(error.statusCode, 403);

  request.authenticated.user.adminRoleId.permissions.push('permissions.manage');
  error = null;
  requireAdminRequestPermission(request, {}, (nextError) => { error = nextError; });
  assert.equal(error, undefined);
});
