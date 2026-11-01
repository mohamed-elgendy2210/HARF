import { AppError } from '../middleware/errors.js';
import { randomUUID } from 'node:crypto';

const CONSENT_TYPES = ['learning_data', 'progress_reports'];
const CHILD_DATA_POLICY_VERSION = 'harf-child-data-v1';

function serializeChild(child) {
  const record = typeof child.toObject === 'function' ? child.toObject() : child;
  return {
    id: String(record._id ?? record.id),
    displayName: record.displayName,
    ageBand: record.ageBand ?? null,
    avatar: record.avatar ?? null,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function serializeConsent(consent) {
  const record = typeof consent.toObject === 'function' ? consent.toObject() : consent;
  return {
    consentType: record.consentType,
    granted: record.granted,
    policyVersion: record.policyVersion,
    recordedAt: record.createdAt
  };
}

export class ChildService {
  constructor({ repository, now = () => new Date() }) {
    this.repository = repository;
    this.now = now;
  }

  async listChildren(parentUserId) {
    return (await this.repository.listChildren(parentUserId)).map(serializeChild);
  }

  async listPendingRegistrations(parentUserId) {
    return (await this.repository.listPendingRegistrations(parentUserId)).map(serializeRegistration);
  }

  async createChild(parentUserId, input, { pendingRegistration = false } = {}) {
    const registrationId = pendingRegistration ? input.registrationId ?? randomUUID() : null;
    if (registrationId) {
      const existing = await this.repository.findRegistration?.(parentUserId, registrationId);
      if (existing) return serializeChild(existing);
    }
    let child;
    try {
      child = await this.repository.createChild({
        parentUserId,
        ...(registrationId ? {
          registrationId,
          status: 'pending_registration',
          registrationDraft: {
            step: 'questionnaire',
            questionnaireVersion: null,
            submissionId: null,
            answers: {}
          }
        } : { status: 'active' }),
        displayName: input.displayName,
        ageBand: input.ageBand ?? null,
        avatar: input.avatar ?? null
      });
    } catch (error) {
      if (error?.code !== 11000 || !registrationId) throw error;
      child = await this.repository.findRegistration?.(parentUserId, registrationId);
      if (!child) throw error;
    }
    return serializeChild(child);
  }

  async saveRegistrationDraft(parentUserId, childId, registrationDraft) {
    const child = await this.getOwnedChild(parentUserId, childId);
    if (child.status !== 'pending_registration') {
      throw new AppError(409, 'CHILD_REGISTRATION_NOT_PENDING', 'لا يمكن استئناف تسجيل هذا الملف.');
    }
    const previousDrafts = [...(child.registrationDraft?.previousDrafts ?? [])];
    if (child.registrationDraft?.questionnaireVersion
      && child.registrationDraft.questionnaireVersion !== registrationDraft.questionnaireVersion
      && child.registrationDraft.submissionId) {
      previousDrafts.push({
        questionnaireVersion: child.registrationDraft.questionnaireVersion,
        submissionId: child.registrationDraft.submissionId,
        answers: child.registrationDraft.answers ?? {},
        savedAt: this.now()
      });
    }
    const updated = await this.repository.updateRegistrationDraft(childId, parentUserId, {
      ...registrationDraft,
      previousDrafts: previousDrafts.slice(-5)
    });
    if (!updated) throw new AppError(409, 'CHILD_REGISTRATION_NOT_PENDING', 'اكتمل تسجيل هذا الملف أو لم يعد متاحًا.');
    return serializeRegistration(updated);
  }

  async completeRegistration(parentUserId, childId) {
    const child = await this.repository.completeRegistration(childId, parentUserId);
    if (!child) {
      const existing = await this.getOwnedChild(parentUserId, childId);
      if (existing.status === 'active') return serializeChild(existing);
      throw new AppError(409, 'CHILD_REGISTRATION_NOT_PENDING', 'لا يمكن إكمال تسجيل هذا الملف.');
    }
    return serializeChild(child);
  }

  async listRegistrationReviews() {
    const records = await this.repository.listRegistrationReviews?.() ?? [];
    return records.map((record) => ({
      childId: String(record._id ?? record.id),
      displayName: record.displayName,
      ageBand: record.ageBand ?? null,
      questionnaireVersion: record.registrationDraft?.questionnaireVersion ?? null,
      answers: record.registrationDraft?.answers ?? {},
      updatedAt: record.updatedAt
    }));
  }

  async getOwnedChild(parentUserId, childId) {
    if (!/^[a-f\d]{24}$/i.test(childId)) {
      throw new AppError(400, 'INVALID_CHILD_ID', 'The child identifier is invalid.');
    }
    const child = await this.repository.findOwnedChild(childId, parentUserId);
    if (!child) throw new AppError(404, 'CHILD_NOT_FOUND', 'The child profile was not found.');
    return child;
  }

  async updateChild(parentUserId, childId, updates) {
    const child = await this.getOwnedChild(parentUserId, childId);
    if (child.status === 'pending_registration' && updates.status) {
      throw new AppError(409, 'CHILD_REGISTRATION_NOT_PENDING', 'أكمل إعداد مسار التعلّم قبل تفعيل ملف الطفل.');
    }
    const updated = await this.repository.updateOwnedChild(childId, parentUserId, updates);
    if (!updated) throw new AppError(404, 'CHILD_NOT_FOUND', 'The child profile was not found.');
    return serializeChild(updated);
  }

  async listConsents(parentUserId, childId) {
    await this.getOwnedChild(parentUserId, childId);
    const history = await this.repository.listConsentHistory(childId, parentUserId);
    const current = new Map();
    for (const record of history) {
      if (!current.has(record.consentType)) current.set(record.consentType, serializeConsent(record));
    }
    return CONSENT_TYPES.map((consentType) => ({
      consentType,
      ...(current.has(consentType) ? current.get(consentType) : {
        granted: false,
        policyVersion: null,
        recordedAt: null
      })
    }));
  }

  async hasConsent(parentUserId, childId, consentType) {
    if (!CONSENT_TYPES.includes(consentType)) return false;
    await this.getOwnedChild(parentUserId, childId);
    const history = await this.repository.listConsentHistory(childId, parentUserId);
    return history.find((record) => record.consentType === consentType)?.granted === true;
  }

  async recordConsent(parentUserId, childId, input) {
    await this.getOwnedChild(parentUserId, childId);
    const consent = await this.repository.createConsent({
      childId,
      parentUserId,
      consentType: input.consentType,
      granted: input.granted,
      policyVersion: CHILD_DATA_POLICY_VERSION,
      createdAt: this.now()
    });
    return serializeConsent(consent);
  }
}

function serializeRegistration(child) {
  const record = typeof child.toObject === 'function' ? child.toObject() : child;
  return {
    ...serializeChild(record),
    registrationDraft: record.registrationDraft ?? null
  };
}

export { serializeChild };
