import { AppError } from '../middleware/errors.js';

export const PERMISSIONS = Object.freeze({
  'users.view': 'View accounts',
  'users.create': 'Create accounts',
  'users.edit': 'Edit accounts',
  'users.approve': 'Approve accounts',
  'users.disable': 'Disable accounts',
  'users.delete': 'Delete accounts',
  'children.view': 'View children',
  'children.manage': 'Manage children',
  'children.archive': 'Archive children',
  'therapists.view': 'View therapists',
  'therapists.manage': 'Manage therapists',
  'therapists.approve': 'Approve therapists',
  'learningPaths.view': 'View learning paths',
  'learningPaths.manage': 'Manage learning paths',
  'activities.view': 'View activities',
  'activities.manage': 'Manage activities',
  'questionnaires.view': 'View questionnaires',
  'questionnaires.manage': 'Manage questionnaires',
  'bookings.view': 'View bookings',
  'bookings.manage': 'Manage bookings',
  'sessions.manage': 'Manage sessions',
  'payments.view': 'View payments',
  'payments.verify': 'Verify payments',
  'subscriptions.manage': 'Manage subscriptions',
  'reports.view': 'View reports',
  'reports.financial': 'View financial reports',
  'settings.manage': 'Manage platform settings',
  'roles.manage': 'Manage roles',
  'permissions.manage': 'Manage permissions',
  'notifications.manage': 'Manage notifications',
  'testimonials.manage': 'Manage testimonials'
});

export const ALL_PERMISSIONS = Object.freeze(Object.keys(PERMISSIONS));

export const ADMIN_DEFAULT_PERMISSIONS = Object.freeze(
  ALL_PERMISSIONS.filter((permission) => !['roles.manage', 'permissions.manage'].includes(permission))
);

export function getRolePermissions(user) {
  const role = user?.adminRoleId;
  return role && typeof role === 'object' && role.isActive !== false
    && Array.isArray(role.permissions)
    ? role.permissions
    : [];
}

export function requirePermission(permission) {
  return (request, _response, next) => {
    const user = request.authenticated?.user;
    const permissions = getRolePermissions(user);
    if (!user || user.role !== 'admin' || !permissions.includes(permission)) {
      next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}

const isRead = (method) => ['GET', 'HEAD'].includes(method);

export function permissionForAdminRequest(method, requestPath) {
  if (requestPath === '/roles') {
    return isRead(method) ? 'roles.manage' : ['roles.manage', 'permissions.manage'];
  }
  if (/^\/roles\/[^/]+$/.test(requestPath)) {
    return method === 'DELETE' ? 'roles.manage' : 'permissions.manage';
  }
  if (/^\/administrators\/[^/]+\/role$/.test(requestPath)) return 'roles.manage';

  if (requestPath === '/accounts') return 'users.view';
  if (/^\/accounts\/[^/]+\/verification\/[^/]+$/.test(requestPath)) return 'therapists.approve';
  if (/^\/accounts\/[^/]+\/approval$/.test(requestPath)) return 'users.approve';
  if (/^\/accounts\/[^/]+\/status$/.test(requestPath)) return 'users.disable';
  if (/^\/accounts\/[^/]+$/.test(requestPath)) return 'users.delete';

  if (requestPath === '/administrators') {
    return isRead(method) ? 'users.view' : 'users.create';
  }
  if (/^\/administrators\/[^/]+$/.test(requestPath)) return 'users.delete';
  if (requestPath === '/platform-settings') return 'settings.manage';
  if (requestPath === '/notifications') return 'notifications.manage';
  if (requestPath === '/testimonials' || /^\/testimonials\/[^/]+\/review$/.test(requestPath)) {
    return 'testimonials.manage';
  }
  if (requestPath === '/reports') return ['reports.view', 'reports.financial'];
  if (requestPath === '/reports/export.csv') return 'reports.financial';
  if (requestPath === '/appointments') return 'bookings.view';
  if (/^\/appointments\/[^/]+\/meeting\/retry$/.test(requestPath)) return 'sessions.manage';
  if (requestPath.startsWith('/video-tests')) return 'sessions.manage';
  if (requestPath === '/subscription/settings') return isRead(method) ? 'payments.view' : 'subscriptions.manage';
  if (requestPath === '/subscription/child-usage') return 'children.view';
  if (requestPath === '/payments') return 'payments.view';
  if (/^\/payments\/[^/]+\/review$/.test(requestPath)) return 'payments.verify';
  if (/^\/payments\/[^/]+\/receipt$/.test(requestPath)) return 'payments.view';
  if (requestPath === '/session-payment-settings') return isRead(method) ? 'payments.view' : 'subscriptions.manage';
  if (requestPath === '/session-payments') return 'payments.view';
  if (/^\/session-payments\/[^/]+\/review$/.test(requestPath)) return 'payments.verify';
  if (/^\/session-payments\/[^/]+\/receipt$/.test(requestPath)) return 'payments.view';
  if (requestPath === '/learning-registration-reviews') return 'children.view';
  if (requestPath === '/learning-path' || requestPath === '/learning-paths') {
    return isRead(method) ? 'learningPaths.view' : 'learningPaths.manage';
  }
  if (/^\/learning-paths\/[^/]+$/.test(requestPath)) return 'learningPaths.manage';
  if (requestPath === '/learning-questionnaire') {
    return isRead(method) ? 'questionnaires.view' : 'questionnaires.manage';
  }
  if (requestPath === '/learning-assignments') return 'learningPaths.view';
  if (requestPath === '/learning-assignments/review') return 'learningPaths.manage';
  if (requestPath === '/games') return isRead(method) ? 'activities.view' : 'activities.manage';
  if (requestPath.startsWith('/games/')) return 'activities.manage';
  if (requestPath === '/assets') return 'activities.view';
  if (requestPath.startsWith('/assets/')) return isRead(method) ? 'activities.view' : 'activities.manage';
  return null;
}

export function requireAdminRequestPermission(request, _response, next) {
  const permissions = permissionForAdminRequest(request.method, request.path);
  if (!permissions) {
    next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    return;
  }
  const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
  const user = request.authenticated?.user;
  const granted = getRolePermissions(user);
  if (!user || user.role !== 'admin' || requiredPermissions.some((permission) => !granted.includes(permission))) {
    next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    return;
  }
  next();
}
