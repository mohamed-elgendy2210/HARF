import { AppError } from '../middleware/errors.js';

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

  async createChild(parentUserId, input) {
    const child = await this.repository.createChild({
      parentUserId,
      displayName: input.displayName,
      ageBand: input.ageBand ?? null,
      avatar: input.avatar ?? null,
      status: 'active'
    });
    return serializeChild(child);
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
    await this.getOwnedChild(parentUserId, childId);
    const child = await this.repository.updateOwnedChild(childId, parentUserId, updates);
    if (!child) throw new AppError(404, 'CHILD_NOT_FOUND', 'The child profile was not found.');
    return serializeChild(child);
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

export { serializeChild };
