import { ADMIN_DEFAULT_PERMISSIONS, ALL_PERMISSIONS } from '../auth/permissions.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';

const SYSTEM_ROLES = [
  {
    key: 'super-admin',
    name: 'Super Admin',
    description: 'Full platform access, including role and permission administration.',
    permissions: ALL_PERMISSIONS
  },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Administrative access controlled by assigned permissions.',
    permissions: ADMIN_DEFAULT_PERMISSIONS
  },
  {
    key: 'parent',
    name: 'Parent',
    description: 'Protected parent account role.',
    permissions: []
  },
  {
    key: 'therapist',
    name: 'Therapist',
    description: 'Protected therapist account role.',
    permissions: []
  }
];

export async function ensureRoleIndexes() {
  await Role.createIndexes();
}

export async function seedSystemRoles() {
  for (const role of SYSTEM_ROLES) {
    await Role.updateOne(
      { key: role.key },
      {
        $setOnInsert: {
          ...role,
          isSystemRole: true,
          isActive: true
        }
      },
      { upsert: true }
    );
  }

  const [superAdminRole, adminRole, firstAdmin] = await Promise.all([
    Role.findOne({ key: 'super-admin' }).select('_id').lean(),
    Role.findOne({ key: 'admin' }).select('_id').lean(),
    User.findOne({ role: 'admin' }).sort({ createdAt: 1, _id: 1 }).select('_id adminRoleId').lean()
  ]);
  if (!superAdminRole || !adminRole) throw new Error('System administrator roles could not be initialized.');

  if (firstAdmin && !firstAdmin.adminRoleId) {
    await User.updateOne(
      { _id: firstAdmin._id, $or: [{ adminRoleId: null }, { adminRoleId: { $exists: false } }] },
      { $set: { adminRoleId: superAdminRole._id } }
    );
  }
  await User.updateMany(
    {
      role: 'admin',
      $or: [{ adminRoleId: null }, { adminRoleId: { $exists: false } }],
      ...(firstAdmin ? { _id: { $ne: firstAdmin._id } } : {})
    },
    { $set: { adminRoleId: adminRole._id } }
  );
}

export function createRoleRepository() {
  return {
    list() {
      return Role.find().sort({ isSystemRole: -1, name: 1 }).lean();
    },
    findById(id) {
      return Role.findById(id).lean();
    },
    findByKey(key) {
      return Role.findOne({ key }).lean();
    },
    create(role) {
      return Role.create(role);
    },
    update(id, updates) {
      return Role.findByIdAndUpdate(id, { $set: updates }, {
        new: true,
        runValidators: true
      }).lean();
    },
    delete(id) {
      return Role.findOneAndDelete({ _id: id, isSystemRole: false });
    },
    async countAssignments(roleId) {
      return User.countDocuments({ role: 'admin', adminRoleId: roleId });
    },
    assignAdministratorRole(userId, roleId) {
      return User.findOneAndUpdate(
        { _id: userId, role: 'admin' },
        { $set: { adminRoleId: roleId } },
        { new: true, runValidators: true }
      ).populate('adminRoleId');
    }
  };
}
