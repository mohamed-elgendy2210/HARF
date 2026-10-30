import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../middleware/errors.js';
import { isReadableName } from '../lib/nameValidation.js';
import { safeError } from '../lib/logger.js';
import { hashPassword, verifyPassword } from './passwords.js';

const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFICATION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const RESET_LIFETIME_MS = 30 * 60 * 1000;
const PENDING_APPROVAL = 'pending';
const VALID_APPROVAL_STATUS = new Set(['approved', 'rejected']);

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function hashOpaqueToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function isProfessionalProfileComplete(profile = {}) {
  return ['displayName', 'specialty', 'credentials', 'bio']
    .every((field) => typeof profile[field] === 'string' && profile[field].trim().length > 0)
    && isReadableName(profile.displayName);
}

export function hasSpecialistVerificationDocuments(profile = {}) {
  return Boolean(profile.profilePhoto && profile.medicalCardFront && profile.medicalCardBack);
}

export function getDirectoryEligibility(user) {
  const profile = user?.professionalProfile ?? {};
  const requirements = {
    activeAccount: user?.accountStatus === 'active',
    verifiedEmail: Boolean(user?.emailVerifiedAt),
    approvedAccount: user?.approvalStatus === 'approved',
    completeProfile: isProfessionalProfileComplete(profile),
    publicListing: profile.publicListing === true,
    verificationDocuments: hasSpecialistVerificationDocuments(profile)
  };
  return {
    eligible: Object.values(requirements).every(Boolean),
    requirements
  };
}

export function serializeAccount(user) {
  if (!user) return null;
  const record = typeof user.toObject === 'function' ? user.toObject() : user;
  const professionalProfile = record.role === 'specialist' ? {
    displayName: record.professionalProfile?.displayName ?? '',
    specialty: record.professionalProfile?.specialty ?? '',
    credentials: record.professionalProfile?.credentials ?? '',
    bio: record.professionalProfile?.bio ?? '',
    publicListing: record.professionalProfile?.publicListing === true,
    complete: isProfessionalProfileComplete(record.professionalProfile),
    identityDocumentsComplete: hasSpecialistVerificationDocuments(record.professionalProfile),
    directoryEligibility: getDirectoryEligibility(record),
    profilePhotoUrl: record.professionalProfile?.profilePhoto
      ? `/api/v1/directory/specialists/${String(record._id ?? record.id)}/photo`
      : null
  } : undefined;

  return {
    id: String(record._id ?? record.id),
    email: record.email,
    role: record.role,
    emailVerified: Boolean(record.emailVerifiedAt),
    approvalStatus: record.approvalStatus,
    accountStatus: record.accountStatus,
    ...(record.role === 'parent' ? { parentProfile: record.parentProfile ?? {} } : {}),
    ...(professionalProfile ? { professionalProfile } : {})
  };
}

export class AuthService {
  constructor({ repository, emailService, notificationService, logger, appOrigin, specialistDocumentService, now = () => new Date() }) {
    this.repository = repository;
    this.emailService = emailService;
    this.notificationService = notificationService;
    this.logger = logger;
    this.appOrigin = appOrigin;
    this.specialistDocumentService = specialistDocumentService;
    this.now = now;
  }

  serializeAccount(user) {
    return serializeAccount(user);
  }

  assertEmailDeliveryConfigured() {
    if (!this.emailService?.isConfigured()) {
      throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Email delivery is not configured.');
    }
  }

  async recordAudit(action, { actorUserId = null, targetUserId = null, success = true, metadata = {} } = {}) {
    await this.repository.createAuditEvent({
      action,
      actorUserId,
      targetUserId,
      success,
      metadata
    });
  }

  async issueAuthToken(user, purpose, lifetimeMs) {
    const token = createOpaqueToken();
    await this.repository.deleteAuthTokens(user._id ?? user.id, purpose);
    await this.repository.createAuthToken({
      tokenHash: hashOpaqueToken(token),
      userId: user._id ?? user.id,
      purpose,
      expiresAt: new Date(this.now().getTime() + lifetimeMs)
    });
    return token;
  }

  async sendVerification(user) {
    this.assertEmailDeliveryConfigured();
    const token = await this.issueAuthToken(user, 'email_verification', VERIFICATION_LIFETIME_MS);
    const verificationUrl = new URL('/?verify-email=', this.appOrigin);
    verificationUrl.searchParams.set('verify-email', token);
    await this.emailService.sendVerification({
      email: user.email,
      verificationUrl: verificationUrl.toString()
    });
  }

  async createSession(user) {
    const rawToken = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const expiresAt = new Date(this.now().getTime() + SESSION_LIFETIME_MS);
    await this.repository.createSession({
      tokenHash: hashOpaqueToken(rawToken),
      userId: user._id ?? user.id,
      csrfToken,
      expiresAt
    });
    return { rawToken, csrfToken, expiresAt };
  }

  async register({ email, password, role, displayName, files }) {
    if (!['parent', 'specialist'].includes(role)) {
      throw new AppError(400, 'INVALID_ROLE', 'Choose a parent or specialist account.');
    }
    if (role === 'parent' && Object.values(files ?? {}).some((entries) => entries?.length)) {
      throw new AppError(400, 'INVALID_SPECIALIST_DOCUMENTS', 'Verification images are only accepted for specialist accounts.');
    }
    this.assertEmailDeliveryConfigured();
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await hashPassword(password);
    const storedDocuments = role === 'specialist'
      ? await this.specialistDocumentService.storeRequired(files)
      : null;
    const userData = {
      email: normalizedEmail,
      passwordHash,
      role,
      emailVerifiedAt: null,
      approvalStatus: PENDING_APPROVAL,
      accountStatus: 'active',
      ...(role === 'parent' ? { parentProfile: { displayName: displayName.trim() } } : {
        professionalProfile: {
          displayName: displayName.trim(),
          publicListing: false,
          ...storedDocuments
        }
      })
    };

    let user;
    try {
      user = await this.repository.createUser(userData);
    } catch (error) {
      if (error?.code === 11000) {
        if (storedDocuments) await this.specialistDocumentService.remove(storedDocuments);
        return { user: null, session: null };
      }
      if (storedDocuments) await this.specialistDocumentService.remove(storedDocuments);
      throw error;
    }

    try {
      await this.sendVerification(user);
      await this.recordAudit('account.registered', {
        targetUserId: user._id ?? user.id,
        metadata: { role }
      });
      const session = await this.createSession(user);
      return { user: serializeAccount(user), session };
    } catch (error) {
      await this.repository.deleteAuthTokens(user._id ?? user.id);
      await this.repository.deleteUnverifiedUser(user._id ?? user.id);
      if (storedDocuments) await this.specialistDocumentService.remove(storedDocuments);
      throw error;
    }
  }

  async login({ email, password, existingSessionToken }) {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.repository.findUserByEmail(normalizedEmail, true);
    const passwordValid = await verifyPassword(password, user?.passwordHash);
    if (!user || !passwordValid || user.accountStatus !== 'active') {
      await this.recordAudit('account.login_failed', {
        targetUserId: user?._id ?? null,
        success: false,
        metadata: { emailHash: hashOpaqueToken(normalizedEmail).slice(0, 16) }
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }

    await this.recordAudit('account.login_succeeded', {
      actorUserId: user._id ?? user.id,
      targetUserId: user._id ?? user.id
    });
    if (existingSessionToken) await this.repository.deleteSession(hashOpaqueToken(existingSessionToken));
    const session = await this.createSession(user);
    return { user: serializeAccount(user), session };
  }

  async authenticate(rawToken) {
    if (!rawToken || rawToken.length > 128) return null;
    const session = await this.repository.findSession(hashOpaqueToken(rawToken), this.now());
    if (!session || session.expiresAt <= this.now()) return null;
    const user = await this.repository.findUserById(session.userId);
    if (!user || user.accountStatus !== 'active') return null;
    return { session, user };
  }

  async logout(rawToken, userId) {
    if (rawToken) await this.repository.deleteSession(hashOpaqueToken(rawToken));
    await this.recordAudit('account.logout', { actorUserId: userId, targetUserId: userId });
  }

  async verifyEmail(token) {
    const consumed = await this.repository.consumeAuthToken(
      hashOpaqueToken(token),
      'email_verification',
      this.now()
    );
    if (!consumed) throw new AppError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This verification link is invalid or expired.');
    const user = await this.repository.verifyUserEmail(consumed.userId, this.now());
    if (!user) throw new AppError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This verification link is invalid or expired.');
    await this.repository.deleteAuthTokens(user._id ?? user.id, 'email_verification');
    await this.recordAudit('account.email_verified', {
      actorUserId: user._id ?? user.id,
      targetUserId: user._id ?? user.id
    });
    return serializeAccount(user);
  }

  async resendVerification(email) {
    this.assertEmailDeliveryConfigured();
    const user = await this.repository.findUserByEmail(normalizeEmail(email));
    if (!user || user.emailVerifiedAt || user.accountStatus !== 'active') return;
    await this.sendVerification(user);
    await this.recordAudit('account.verification_resent', {
      targetUserId: user._id ?? user.id
    });
  }

  async requestPasswordReset(email) {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.repository.findUserByEmail(normalizedEmail);
    if (!user || user.accountStatus !== 'active' || !this.emailService?.isConfigured()) {
      await this.recordAudit('account.password_reset_requested', {
        targetUserId: user?._id ?? null,
        success: Boolean(this.emailService?.isConfigured()),
        metadata: { emailHash: hashOpaqueToken(normalizedEmail).slice(0, 16) }
      });
      if (user && !this.emailService?.isConfigured()) {
        this.logger.error({ code: 'EMAIL_UNAVAILABLE' }, 'Password recovery email could not be sent because SMTP is not configured.');
      }
      return;
    }

    let token;
    try {
      token = await this.issueAuthToken(user, 'password_reset', RESET_LIFETIME_MS);
      const resetUrl = new URL('/', this.appOrigin);
      resetUrl.searchParams.set('reset-password', token);
      await this.emailService.sendPasswordReset({
        email: user.email,
        resetUrl: resetUrl.toString()
      });
    } catch (error) {
      await this.repository.deleteAuthTokens(user._id ?? user.id, 'password_reset');
      await this.recordAudit('account.password_reset_requested', {
        targetUserId: user._id ?? user.id,
        success: false
      });
      this.logger.error({ error: safeError(error) }, 'Password recovery email delivery failed.');
      return;
    }
    await this.recordAudit('account.password_reset_requested', {
      targetUserId: user._id ?? user.id
    });
  }

  async resetPassword({ token, password }) {
    const consumed = await this.repository.consumeAuthToken(
      hashOpaqueToken(token),
      'password_reset',
      this.now()
    );
    if (!consumed) throw new AppError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This reset link is invalid or expired.');
    const passwordHash = await hashPassword(password);
    await this.repository.updateUserPassword(consumed.userId, passwordHash);
    await this.repository.deleteSessions(consumed.userId);
    await this.repository.deleteAuthTokens(consumed.userId);
    await this.recordAudit('account.password_reset_completed', {
      actorUserId: consumed.userId,
      targetUserId: consumed.userId
    });
  }

  async updateSpecialistProfile(user, profile) {
    const completeProfile = {
      displayName: profile.displayName.trim(),
      specialty: profile.specialty.trim(),
      credentials: profile.credentials.trim(),
      bio: profile.bio.trim(),
      publicListing: profile.publicListing
    };
    if (completeProfile.publicListing && !isProfessionalProfileComplete(completeProfile)) {
      throw new AppError(400, 'PROFILE_INCOMPLETE', 'Complete every professional profile field before enabling public listing.');
    }
    if (completeProfile.publicListing && !hasSpecialistVerificationDocuments(user.professionalProfile)) {
      throw new AppError(400, 'SPECIALIST_DOCUMENTS_REQUIRED', 'Upload the profile photo and both sides of the professional card before requesting public listing.');
    }
    if (completeProfile.publicListing && !user.professionalProfile?.profilePhoto) {
      throw new AppError(400, 'SPECIALIST_PHOTO_REQUIRED', 'Upload a profile photo before enabling public listing.');
    }
    const updatedUser = await this.repository.updateSpecialistProfile(user._id ?? user.id, completeProfile);
    if (!updatedUser) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'The specialist account was not found.');
    await this.recordAudit('account.specialist_profile_updated', {
      actorUserId: user._id ?? user.id,
      targetUserId: user._id ?? user.id,
      metadata: {
        profileComplete: isProfessionalProfileComplete(completeProfile),
        publicListing: completeProfile.publicListing
      }
    });
    return serializeAccount(updatedUser);
  }

  async updateSpecialistDocuments(user, files) {
    const documents = await this.specialistDocumentService.storeRequired(files);
    let result;
    try {
      result = await this.repository.updateSpecialistDocuments(user._id ?? user.id, documents);
      if (!result) {
        throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'The specialist account was not found.');
      }
    } catch (error) {
      await this.specialistDocumentService.remove(documents);
      throw error;
    }
    try {
      await this.specialistDocumentService.remove(result.previous);
    } catch (error) {
      this.logger.error({ error, specialistId: user._id ?? user.id }, 'Previous specialist verification files could not be removed.');
    }
    await this.recordAudit('account.specialist_documents_updated', {
      actorUserId: user._id ?? user.id,
      targetUserId: user._id ?? user.id
    });
    return serializeAccount(result.user);
  }

  async getSpecialistVerificationDocument(actor, specialistId, documentType) {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Only administrators can view verification documents.');
    const fields = {
      front: 'medicalCardFront',
      back: 'medicalCardBack',
      photo: 'profilePhoto'
    };
    const field = fields[documentType];
    if (!field || !/^[a-f\d]{24}$/i.test(specialistId)) {
      throw new AppError(400, 'INVALID_DOCUMENT_REQUEST', 'The verification document request is invalid.');
    }
    const specialist = await this.repository.findUserById(specialistId);
    if (!specialist || specialist.role !== 'specialist') {
      throw new AppError(404, 'SPECIALIST_NOT_FOUND', 'The specialist was not found.');
    }
    const file = await this.specialistDocumentService.read(specialist.professionalProfile?.[field]);
    if (!file) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'The verification document is unavailable.');
    await this.recordAudit('admin.specialist_verification_document_viewed', {
      actorUserId: actor._id ?? actor.id,
      targetUserId: specialistId,
      metadata: { documentType }
    });
    return file;
  }

  async listPendingAccounts(actor) {
    const users = await this.repository.listManagedAccounts();
    await this.recordAudit('admin.accounts_viewed', { actorUserId: actor._id ?? actor.id });
    return users.map(serializeAccount);
  }

  async listAdministrators(actor) {
    const users = await this.repository.listAdministrators();
    await this.recordAudit('admin.administrators_viewed', { actorUserId: actor._id ?? actor.id });
    return users.map(serializeAccount);
  }

  async createAdministrator(actor, { email, password }) {
    const normalizedEmail = normalizeEmail(email);
    if (await this.repository.countExistingEmail(normalizedEmail)) {
      throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'هذا البريد الإلكتروني مرتبط بحساب موجود.');
    }
    let administrator;
    try {
      administrator = await this.repository.createUser({
        email: normalizedEmail,
        passwordHash: await hashPassword(password),
        role: 'admin',
        emailVerifiedAt: this.now(),
        approvalStatus: 'approved',
        accountStatus: 'active'
      });
    } catch (error) {
      if (error?.code === 11000) {
        throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'هذا البريد الإلكتروني مرتبط بحساب موجود.');
      }
      throw error;
    }
    await this.recordAudit('admin.administrator_created', {
      actorUserId: actor._id ?? actor.id,
      targetUserId: administrator._id ?? administrator.id
    });
    return serializeAccount(administrator);
  }

  async deleteAdministrator(actor, targetUserId) {
    const actorId = String(actor._id ?? actor.id);
    if (actorId === String(targetUserId)) {
      throw new AppError(400, 'SELF_DELETION_NOT_ALLOWED', 'لا يمكنك حذف حساب المسؤول الذي تستخدمه حاليًا.');
    }
    const administratorCount = await this.repository.countAdministrators();
    if (administratorCount <= 1) {
      throw new AppError(409, 'LAST_ADMINISTRATOR', 'لا يمكن حذف المسؤول الأخير في المنصة.');
    }
    const deleted = await this.repository.deleteAdministrator(targetUserId);
    if (!deleted) throw new AppError(404, 'ADMINISTRATOR_NOT_FOUND', 'حساب المسؤول غير موجود.');
    const deletedId = String(deleted._id ?? deleted.id);
    await Promise.all([
      this.repository.deleteSessions(deletedId),
      this.repository.deleteAuthTokens(deletedId)
    ]);
    await this.recordAudit('admin.administrator_deleted', {
      actorUserId: actor._id ?? actor.id,
      targetUserId: deletedId
    });
  }

  async setApprovalStatus(actor, targetUserId, approvalStatus) {
    if (!VALID_APPROVAL_STATUS.has(approvalStatus)) {
      throw new AppError(400, 'INVALID_APPROVAL_STATUS', 'Choose approved or rejected.');
    }
    if (!/^[a-f\d]{24}$/i.test(targetUserId)) {
      throw new AppError(400, 'INVALID_ACCOUNT_ID', 'The account identifier is invalid.');
    }
    if (approvalStatus === 'approved') {
      const target = await this.repository.findUserById(targetUserId);
      if (target?.role === 'specialist' && !hasSpecialistVerificationDocuments(target.professionalProfile)) {
        throw new AppError(409, 'SPECIALIST_DOCUMENTS_REQUIRED', 'Specialist verification images must be reviewed before approval.');
      }
    }
    const updatedUser = await this.repository.updateApprovalStatus(targetUserId, approvalStatus);
    if (!updatedUser) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'The parent or specialist account was not found.');
    if (approvalStatus === 'rejected') await this.repository.deleteSessions(targetUserId);
    await this.recordAudit('admin.account_approval_changed', {
      actorUserId: actor._id ?? actor.id,
      targetUserId,
      metadata: { approvalStatus }
    });
    if (this.notificationService) {
      try {
        await this.notificationService.notify(targetUserId, {
          type: 'account_approval',
          title: approvalStatus === 'approved' ? 'تم اعتماد حسابك' : 'تحديث حالة الحساب',
          message: approvalStatus === 'approved'
            ? 'تم اعتماد حسابك ويمكنك استخدام خدمات حرف المتاحة لدورك.'
            : 'تم رفض طلب الحساب. تواصل مع إدارة حرف عند الحاجة.',
          resourceType: 'account',
          resourceId: targetUserId
        });
      } catch (error) {
        this.logger.error({ error, targetUserId }, 'Account approval notification could not be saved.');
      }
    }
    return serializeAccount(updatedUser);
  }

  async deletePendingAccount(actor, targetUserId) {
    if (!/^[a-f\d]{24}$/i.test(targetUserId)) {
      throw new AppError(400, 'INVALID_ACCOUNT_ID', 'The account identifier is invalid.');
    }
    const deletedUser = await this.repository.deletePendingAccount(targetUserId);
    if (!deletedUser) {
      throw new AppError(404, 'PENDING_ACCOUNT_NOT_FOUND', 'Only a pending parent or specialist registration can be removed.');
    }
    await this.repository.deleteSessions(targetUserId);
    await this.repository.deleteAuthTokens(targetUserId);
    if (deletedUser.role === 'specialist') {
      await this.specialistDocumentService?.remove(deletedUser.professionalProfile);
    }
    await this.recordAudit('admin.pending_account_deleted', {
      actorUserId: actor._id ?? actor.id,
      targetUserId,
      metadata: { role: deletedUser.role }
    });
    return { id: String(deletedUser._id ?? deletedUser.id) };
  }

  async setAccountStatus(actor, targetUserId, accountStatus) {
    if (!['active', 'suspended'].includes(accountStatus)) {
      throw new AppError(400, 'INVALID_ACCOUNT_STATUS', 'Choose active or suspended.');
    }
    if (String(actor._id ?? actor.id) === String(targetUserId)) {
      throw new AppError(400, 'SELF_SUSPENSION_NOT_ALLOWED', 'Administrators cannot change their own account status here.');
    }
    if (!/^[a-f\d]{24}$/i.test(targetUserId)) {
      throw new AppError(400, 'INVALID_ACCOUNT_ID', 'The account identifier is invalid.');
    }
    const updatedUser = await this.repository.updateAccountStatus(targetUserId, accountStatus);
    if (!updatedUser) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'The parent or specialist account was not found.');
    if (accountStatus === 'suspended') await this.repository.deleteSessions(targetUserId);
    await this.recordAudit('admin.account_status_changed', {
      actorUserId: actor._id ?? actor.id,
      targetUserId,
      metadata: { accountStatus }
    });
    return serializeAccount(updatedUser);
  }

}

export { SESSION_LIFETIME_MS };
