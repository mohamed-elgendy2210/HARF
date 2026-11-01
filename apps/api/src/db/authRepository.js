import { AuditEvent } from '../models/AuditEvent.js';
import { AuthToken } from '../models/AuthToken.js';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';

export const PUBLIC_SPECIALIST_PROJECTION = [
  'role',
  'approvalStatus',
  'accountStatus',
  'emailVerifiedAt',
  'professionalProfile.displayName',
  'professionalProfile.specialty',
  'professionalProfile.credentials',
  'professionalProfile.bio',
  'professionalProfile.publicListing',
  'professionalProfile.profilePhoto',
  'professionalProfile.medicalCardFront',
  'professionalProfile.medicalCardBack'
].join(' ');

export async function ensureAuthIndexes() {
  await Promise.all([
    User.createIndexes(),
    Session.createIndexes(),
    AuthToken.createIndexes(),
    AuditEvent.createIndexes()
  ]);
  const indexes = await User.collection.indexes();
  if (indexes.some(({ name }) => name === 'single_admin_bootstrap')) {
    await User.collection.dropIndex('single_admin_bootstrap');
  }
}

export function createAuthRepository() {
  return {
    createUser(data) {
      return User.create(data);
    },
    findUserByEmail(email, includePassword = false) {
      const query = User.findOne({ email });
      return includePassword ? query.select('+passwordHash') : query;
    },
    findUserById(id) {
      return User.findById(id);
    },
    findAdministrator() {
      return User.findOne({ role: 'admin', accountStatus: 'active', emailVerifiedAt: { $ne: null } })
        .select('_id email');
    },
    listActiveAdministrators() {
      return User.find({ role: 'admin', accountStatus: 'active', emailVerifiedAt: { $ne: null } })
        .select('_id email');
    },
    listPublicSpecialists() {
      return User.find({
        role: 'specialist',
        approvalStatus: 'approved',
        accountStatus: 'active',
        emailVerifiedAt: { $ne: null },
        'professionalProfile.publicListing': true,
        'professionalProfile.displayName': { $type: 'string', $ne: '' },
        'professionalProfile.specialty': { $type: 'string', $ne: '' },
        'professionalProfile.credentials': { $type: 'string', $ne: '' },
        'professionalProfile.bio': { $type: 'string', $ne: '' },
        'professionalProfile.profilePhoto.storageName': { $type: 'string' },
        'professionalProfile.medicalCardFront.storageName': { $type: 'string' },
        'professionalProfile.medicalCardBack.storageName': { $type: 'string' }
      }).select(PUBLIC_SPECIALIST_PROJECTION);
    },
    createAuthToken(data) {
      return AuthToken.create(data);
    },
    consumeAuthToken(tokenHash, purpose, now) {
      return AuthToken.findOneAndDelete({ tokenHash, purpose, expiresAt: { $gt: now } });
    },
    deleteAuthTokens(userId, purpose) {
      return AuthToken.deleteMany({ userId, ...(purpose ? { purpose } : {}) });
    },
    createSession(data) {
      return Session.create(data);
    },
    findSession(tokenHash, now) {
      return Session.findOne({ tokenHash, expiresAt: { $gt: now } });
    },
    deleteSession(tokenHash) {
      return Session.deleteOne({ tokenHash });
    },
    deleteSessions(userId) {
      return Session.deleteMany({ userId });
    },
    createAuditEvent(data) {
      return AuditEvent.create(data);
    },
    listManagedAccounts() {
      return User.find({ role: { $in: ['parent', 'specialist'] } })
        .sort({ createdAt: -1 })
        .limit(100)
        .select('email role emailVerifiedAt approvalStatus accountStatus parentProfile professionalProfile createdAt');
    },
    listAdministrators() {
      return User.find({ role: 'admin' })
        .sort({ createdAt: 1 })
        .select('email role emailVerifiedAt approvalStatus accountStatus createdAt');
    },
    countAdministrators() {
      return User.countDocuments({ role: 'admin' });
    },
    countExistingEmail(email) {
      return User.exists({ email });
    },
    deleteAdministrator(userId) {
      return User.findOneAndDelete({ _id: userId, role: 'admin' });
    },
    deletePendingAccount(userId) {
      return User.findOneAndDelete({
        _id: userId,
        role: { $in: ['parent', 'specialist'] },
        approvalStatus: 'pending'
      });
    },
    updateApprovalStatus(userId, approvalStatus) {
      return User.findOneAndUpdate(
        { _id: userId, role: { $in: ['parent', 'specialist'] } },
        { $set: { approvalStatus } },
        { new: true, runValidators: true }
      );
    },
    updateSpecialistProfile(userId, profile) {
      return User.findOneAndUpdate(
        { _id: userId, role: 'specialist' },
        { $set: Object.fromEntries(
          Object.entries(profile).map(([key, value]) => [`professionalProfile.${key}`, value])
        ) },
        { new: true, runValidators: true }
      );
    },
    async updateSpecialistDocuments(userId, documents) {
      const current = await User.findOne({ _id: userId, role: 'specialist' })
        .select('professionalProfile.profilePhoto professionalProfile.medicalCardFront professionalProfile.medicalCardBack');
      if (!current) return null;
      const previous = {
        profilePhoto: current.professionalProfile?.profilePhoto,
        medicalCardFront: current.professionalProfile?.medicalCardFront,
        medicalCardBack: current.professionalProfile?.medicalCardBack
      };
      const updated = await User.findOneAndUpdate(
        { _id: userId, role: 'specialist' },
        { $set: Object.fromEntries(
          Object.entries(documents).map(([key, value]) => [`professionalProfile.${key}`, value])
        ) },
        { new: true, runValidators: true }
      );
      return updated ? { user: updated, previous } : null;
    },
    updateAccountStatus(userId, accountStatus) {
      return User.findOneAndUpdate(
        { _id: userId, role: { $in: ['parent', 'specialist'] } },
        { $set: { accountStatus } },
        { new: true, runValidators: true }
      );
    },
    updateUserPassword(userId, passwordHash) {
      return User.updateOne({ _id: userId }, { $set: { passwordHash } });
    },
    verifyUserEmail(userId, verifiedAt) {
      return User.findOneAndUpdate(
        { _id: userId, emailVerifiedAt: null },
        { $set: { emailVerifiedAt: verifiedAt } },
        { new: true }
      );
    },
    deleteUnverifiedUser(userId) {
      return User.deleteOne({ _id: userId, emailVerifiedAt: null });
    }
  };
}
