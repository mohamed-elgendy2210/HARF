import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { AuthService, hashOpaqueToken, isProfessionalProfileComplete } from '../src/services/authService.js';
import { hashPassword } from '../src/services/passwords.js';
import { createLogger } from '../src/lib/logger.js';
import { User } from '../src/models/User.js';
import { PUBLIC_SPECIALIST_PROJECTION } from '../src/db/authRepository.js';
import { Session } from '../src/models/Session.js';
import { AuthToken } from '../src/models/AuthToken.js';
import { AuditEvent } from '../src/models/AuditEvent.js';
import { Child } from '../src/models/Child.js';
import { ChildConsent } from '../src/models/ChildConsent.js';
import { ChildService } from '../src/services/childService.js';
import { GameAttempt } from '../src/models/GameAttempt.js';
import { GameAnswerReceipt } from '../src/models/GameAnswerReceipt.js';
import { GameDefinition } from '../src/models/GameDefinition.js';
import { GameVersion } from '../src/models/GameVersion.js';
import { GameSetting } from '../src/models/GameSetting.js';
import { Testimonial } from '../src/models/Testimonial.js';
import { MediaAsset } from '../src/models/MediaAsset.js';
import { Subscription } from '../src/models/Subscription.js';
import { SubscriptionSettings } from '../src/models/SubscriptionSettings.js';
import { PaymentRequest } from '../src/models/PaymentRequest.js';
import { LearningPath } from '../src/models/LearningPath.js';
import { LearningProgress } from '../src/models/LearningProgress.js';
import { SpecialistAvailability } from '../src/models/SpecialistAvailability.js';
import { Appointment } from '../src/models/Appointment.js';
import { AdminVideoTest } from '../src/models/AdminVideoTest.js';
import { GameService } from '../src/services/gameService.js';
import { GameLibraryService } from '../src/services/gameLibraryService.js';
import { LearningPathService } from '../src/services/learningPathService.js';
import { MediaAssetService } from '../src/services/mediaAssetService.js';
import { PlatformSettingsService } from '../src/services/platformSettingsService.js';
import { TestimonialService } from '../src/services/testimonialService.js';
import { SubscriptionService } from '../src/services/subscriptionService.js';
import { PaymentReceiptService } from '../src/services/paymentReceiptService.js';
import { SpecialistDocumentService } from '../src/services/specialistDocumentService.js';
import { getGame, scoreGame } from '../src/games/catalog.js';
import { AppointmentService } from '../src/services/appointmentService.js';
import { JitsiIframeAdapter, VideoProviderService } from '../src/services/videoProviderService.js';
import { AdminVideoTestService } from '../src/services/adminVideoTestService.js';
import {
  addLocalDays,
  assertTimeZone,
  localDateKey,
  localDateTimeToUtc,
  localDayOfWeek,
  reservationKeys
} from '../src/lib/appointmentTime.js';

const config = {
  isProduction: false,
  trustProxy: false,
  appOrigin: 'http://localhost:5173',
  clientOrigins: ['http://localhost:5173']
};
const logger = createLogger({ level: 'silent' });
const verificationEmails = [];
const resetEmails = [];
const emailService = {
  isConfigured: () => true,
  async sendVerification(message) { verificationEmails.push(message); },
  async sendPasswordReset(message) { resetEmails.push(message); }
};

function createMemoryRepository() {
  const users = new Map();
  const sessions = new Map();
  const tokens = new Map();
  const auditEvents = [];
  const children = new Map();
  const childConsents = [];
  const gameAttempts = [];
  const gameAnswerReceipts = new Map();
  const subscriptions = [];
  const paymentRequests = new Map();
  const specialistAvailabilities = new Map();
  const appointments = new Map();
  const videoTests = new Map();
  let subscriptionSettings = null;
  const completedProgress = new Map();
  const learningPath = {
    key: 'default',
    title: 'خطوات التعلّم',
    description: 'أنشطة متدرجة مع إمكانية التكرار.',
    activities: [
      { gameId: 'word-sounds', title: 'فقاعات الأصوات', learningArea: 'تمييز الأصوات', description: 'التدرب على أصوات الحروف.' },
      { gameId: 'word-match', title: 'صندوق الكلمات', learningArea: 'ربط الكلمات', description: 'ربط الكلمة بالصورة.' }
    ],
    rules: { minimumAttempts: 3, sampleSize: 5, targetAccuracyPercent: 75 }
  };
  const gameDefinitions = new Map();
  const gameVersions = new Map();
  const gameSettings = new Map([['trialGameId', { key: 'trialGameId', value: 'first-letter-trial' }]]);
  const mediaAssets = new Map();
  let sequence = 1;
  const idFor = () => (sequence++).toString(16).padStart(24, '0');

  const gameLibraryRepository = {
    async listDefinitions() {
      return [...gameDefinitions.values()].map((item) => structuredClone(item));
    },
    async findDefinition(gameId) {
      const item = gameDefinitions.get(gameId);
      return item ? structuredClone(item) : null;
    },
    async createDefinition(data) {
      if (gameDefinitions.has(data.gameId)) {
        const error = new Error('duplicate');
        error.code = 11000;
        throw error;
      }
      const item = { ...structuredClone(data), createdAt: new Date(), updatedAt: new Date() };
      gameDefinitions.set(data.gameId, item);
      return structuredClone(item);
    },
    async updateDefinition(gameId, updates) {
      const item = gameDefinitions.get(gameId);
      if (!item) return null;
      Object.assign(item, structuredClone(updates), { updatedAt: new Date() });
      return structuredClone(item);
    },
    async createVersion(data) {
      const key = `${data.gameId}:${data.version}`;
      if (gameVersions.has(key)) {
        const error = new Error('duplicate');
        error.code = 11000;
        throw error;
      }
      gameVersions.set(key, structuredClone(data));
      return structuredClone(data);
    },
    async findVersion(gameId, version) {
      const item = gameVersions.get(`${gameId}:${version}`);
      return item ? structuredClone(item) : null;
    },
    async listPublishedVersions() {
      return [...gameDefinitions.values()]
        .filter((definition) => definition.status === 'published')
        .flatMap((definition) => [...gameVersions.values()].filter((version) => version.gameId === definition.gameId))
        .filter(Boolean)
        .map((item) => structuredClone(item));
    },
    async getSetting(key) {
      const item = gameSettings.get(key);
      return item ? structuredClone(item) : null;
    },
    async getTrialGameId() {
      return gameSettings.get('trialGameId') ? structuredClone(gameSettings.get('trialGameId')) : null;
    },
    async listPublishedActivities() {
      return [...gameDefinitions.values()]
        .filter((item) => item.status === 'published' && item.publishedVersion > 0)
        .map((item) => ({
          gameId: item.gameId,
          draftContent: structuredClone(item.draftContent),
          publishedVersion: item.publishedVersion
        }));
    },
    async setSetting(key, value, updatedBy) {
      const item = { key, value, updatedBy };
      gameSettings.set(key, item);
      return structuredClone(item);
    },
    async listAssets() {
      return [...mediaAssets.values()].map((item) => structuredClone(item));
    },
    async findAssetsByIds(assetIds) {
      return assetIds.map((id) => mediaAssets.get(String(id))).filter(Boolean).map((item) => structuredClone(item));
    },
    async findAsset(assetId) {
      const item = mediaAssets.get(String(assetId));
      return item ? structuredClone(item) : null;
    },
    async createAsset(data) {
      const item = { ...structuredClone(data), _id: idFor(), createdAt: new Date() };
      mediaAssets.set(item._id, item);
      return structuredClone(item);
    },
    async updateAsset(assetId, updates) {
      const item = mediaAssets.get(String(assetId));
      if (!item) return null;
      Object.assign(item, updates);
      return structuredClone(item);
    },
    async isAssetReferenced(assetId) {
      return [...gameDefinitions.values()].some((item) => item.draftAssetIds.includes(String(assetId)))
        || [...gameVersions.values()].some((item) => item.assetIds.includes(String(assetId)));
    },
    async listAssetUsage(assetId) {
      const uses = [];
      const addContentUses = (gameId, content, source, version = null) => {
        content.questions.forEach((question, questionIndex) => {
          if (question.promptImageAssetId === assetId) {
            uses.push({ gameId, title: content.title, source, version, location: `السؤال ${questionIndex + 1} · صورة السؤال` });
          }
          if (question.promptAudioAssetId === assetId) {
            uses.push({ gameId, title: content.title, source, version, location: `السؤال ${questionIndex + 1} · الصوت` });
          }
          (question.optionImageAssetIds ?? []).forEach((optionAssetId, optionIndex) => {
            if (optionAssetId === assetId) {
              uses.push({ gameId, title: content.title, source, version, location: `السؤال ${questionIndex + 1} · صورة الاختيار ${optionIndex + 1}` });
            }
          });
        });
        (content.assetAssignments ?? []).forEach((assignment) => {
          if (assignment.assetId === assetId) {
            uses.push({ gameId, title: content.title, source, version, location: `حدث ${assignment.event}` });
          }
        });
      };
      for (const definition of gameDefinitions.values()) {
        if (definition.draftAssetIds.includes(String(assetId))) {
          addContentUses(definition.gameId, definition.draftContent, 'مسودة');
        }
      }
      for (const published of gameVersions.values()) {
        if (published.assetIds.includes(String(assetId))) {
          addContentUses(published.gameId, published.content, 'نسخة منشورة', published.version);
        }
      }
      return uses;
    },
    async replaceDraftAssetReferences(oldAssetId, newAssetId) {
      for (const definition of gameDefinitions.values()) {
        if (!definition.draftAssetIds.includes(oldAssetId)) continue;
        const replace = (value) => value === oldAssetId ? newAssetId : value;
        definition.draftAssetIds = [...new Set(definition.draftAssetIds.map(replace))];
        definition.draftContent.questions = definition.draftContent.questions.map((question) => ({
          ...question,
          ...(question.promptImageAssetId !== undefined
            ? { promptImageAssetId: replace(question.promptImageAssetId) }
            : {}),
          ...(question.promptAudioAssetId !== undefined
            ? { promptAudioAssetId: replace(question.promptAudioAssetId) }
            : {}),
          ...(question.optionImageAssetIds
            ? { optionImageAssetIds: question.optionImageAssetIds.map(replace) }
            : {})
        }));
        definition.draftContent.assetAssignments = definition.draftContent.assetAssignments.map((assignment) => ({
          ...assignment,
          assetId: replace(assignment.assetId)
        }));
      }
    },
    async deleteAsset(assetId) {
      mediaAssets.delete(String(assetId));
    },
    async findActivePublicAsset(assetId) {
      const item = mediaAssets.get(String(assetId));
      return item?.active ? structuredClone(item) : null;
    }
  };
  for (const gameId of ['first-letter-trial', 'word-sounds', 'word-match', 'matching-pairs', 'animal-sounds']) {
    const builtIn = getGame(gameId);
    const content = {
      template: builtIn.template ?? 'multiple-choice',
      title: builtIn.title,
      description: builtIn.description,
      companion: builtIn.companion,
      companionAnimal: builtIn.companionAnimal,
      instructions: builtIn.instructions,
      questions: builtIn.questions,
      assetAssignments: []
    };
    gameDefinitions.set(gameId, {
      gameId,
      template: builtIn.template ?? 'multiple-choice',
      draftContent: content,
      draftAssetIds: [],
      status: 'published',
      publishedVersion: 1
    });
    gameVersions.set(`${gameId}:1`, {
      gameId,
      version: 1,
      content: structuredClone(content),
      assetIds: []
    });
  }

  return {
    users,
    sessions,
    tokens,
    auditEvents,
    children,
    childConsents,
    gameAttempts,
    gameAnswerReceipts,
    subscriptions,
    paymentRequests,
    specialistAvailabilities,
    appointments,
    learningPath,
    completedProgress,
    learningPathRepository: {
      async getPath() { return structuredClone(learningPath); },
      async updatePath(updates) {
        Object.assign(learningPath, structuredClone(updates));
        return structuredClone(learningPath);
      },
      async listPublishedActivities() { return gameLibraryRepository.listPublishedActivities(); },
      async getTrialGameId() { return gameLibraryRepository.getTrialGameId(); },
      async markActivityCompleted(parentUserId, childId, pathKey, completion) {
        const key = `${parentUserId}:${childId}:${pathKey}`;
        const values = completedProgress.get(key) ?? [];
        if (!values.some((value) => value.gameId === completion.gameId)) values.push(structuredClone(completion));
        completedProgress.set(key, values);
      },
      async getChildProgress(parentUserId, childId, pathKey) {
        const activities = completedProgress.get(`${parentUserId}:${childId}:${pathKey}`) ?? [];
        return activities.length ? { completedActivities: structuredClone(activities) } : null;
      }
    },
    subscriptionRepository: {
      async createSubscription(data) {
        if (data.paymentRequestId && subscriptions.some((item) => String(item.paymentRequestId) === String(data.paymentRequestId))) {
          const error = new Error('duplicate payment subscription');
          error.code = 11000;
          throw error;
        }
        const subscription = { ...structuredClone(data), _id: idFor(), createdAt: new Date() };
        subscriptions.push(subscription);
        return structuredClone(subscription);
      },
      async findActiveSubscription(parentUserId, now) {
        return subscriptions
          .filter((item) => String(item.parentUserId) === String(parentUserId)
            && item.startsAt <= now && item.expiresAt > now)
          .sort((left, right) => right.expiresAt - left.expiresAt)[0] ?? null;
      },
      async findLatestSubscription(parentUserId) {
        return subscriptions
          .filter((item) => String(item.parentUserId) === String(parentUserId))
          .sort((left, right) => right.startsAt - left.startsAt)[0] ?? null;
      },
      async findLatestUnexpiredSubscription(parentUserId, now) {
        return subscriptions
          .filter((item) => String(item.parentUserId) === String(parentUserId) && item.expiresAt > now)
          .sort((left, right) => right.expiresAt - left.expiresAt)[0] ?? null;
      },
      async listSubscriptions(parentUserId) {
        return subscriptions.filter((item) => String(item.parentUserId) === String(parentUserId))
          .sort((left, right) => right.startsAt - left.startsAt);
      }
    },
    paymentRepository: {
      async getSettings() { return subscriptionSettings ? structuredClone(subscriptionSettings) : null; },
      async clearSettings() { subscriptionSettings = null; },
      async clearPaymentRequests() { paymentRequests.clear(); },
      async updateSettings(updates, updatedBy) {
        subscriptionSettings = { key: 'monthly', ...structuredClone(updates), updatedBy, updatedAt: new Date() };
        return structuredClone(subscriptionSettings);
      },
      async createPaymentRequest(data) {
        if ([...paymentRequests.values()].some((item) => String(item.parentUserId) === String(data.parentUserId) && item.open)) {
          const error = new Error('duplicate open payment');
          error.code = 11000;
          throw error;
        }
        const payment = { ...structuredClone(data), _id: idFor(), createdAt: new Date(), review: {} };
        paymentRequests.set(String(payment._id), payment);
        return structuredClone(payment);
      },
      async findOwnedPayment(paymentId, parentUserId) {
        const payment = paymentRequests.get(String(paymentId));
        return payment && String(payment.parentUserId) === String(parentUserId) ? structuredClone(payment) : null;
      },
      async findOpenPayment(parentUserId) {
        const payment = [...paymentRequests.values()].find((item) => String(item.parentUserId) === String(parentUserId) && item.open);
        return payment ? structuredClone(payment) : null;
      },
      async listParentPayments(parentUserId) {
        return [...paymentRequests.values()]
          .filter((item) => String(item.parentUserId) === String(parentUserId))
          .sort((left, right) => right.createdAt - left.createdAt)
          .map((item) => structuredClone(item));
      },
      async listAdminPayments() {
        return [...paymentRequests.values()].map((item) => structuredClone(item));
      },
      async findPayment(paymentId) {
        const payment = paymentRequests.get(String(paymentId));
        return payment ? structuredClone(payment) : null;
      },
      async claimPayment(paymentId, reviewedBy, now, staleBefore) {
        const payment = paymentRequests.get(String(paymentId));
        if (!payment?.open || (payment.review.processingAt && payment.review.processingAt >= staleBefore)) return null;
        payment.status = 'reviewing';
        payment.review.reviewedBy = reviewedBy;
        payment.review.processingAt = now;
        return structuredClone(payment);
      },
      async completePayment(paymentId, reviewedBy, reviewedAt, decisionNote, status, subscriptionId = null) {
        const payment = paymentRequests.get(String(paymentId));
        if (!payment?.open) return null;
        Object.assign(payment, {
          status,
          open: false,
          review: { ...payment.review, reviewedBy, reviewedAt, decisionNote, processingAt: null, subscriptionId }
        });
        return structuredClone(payment);
      },
      async releasePaymentClaim(paymentId) {
        const payment = paymentRequests.get(String(paymentId));
        if (payment?.open) payment.review.processingAt = null;
      },
      async findSubscriptionByPayment(paymentRequestId) {
        const subscription = subscriptions.find((item) => String(item.paymentRequestId) === String(paymentRequestId));
        return subscription ? structuredClone(subscription) : null;
      }
    },
    appointmentRepository: {
      async findAvailability(specialistUserId) {
        const availability = specialistAvailabilities.get(String(specialistUserId));
        return availability ? structuredClone(availability) : null;
      },
      async listAvailabilities(specialistUserIds) {
        return specialistUserIds.map((id) => specialistAvailabilities.get(String(id)))
          .filter(Boolean).map((availability) => structuredClone(availability));
      },
      async saveAvailability(specialistUserId, data) {
        const availability = { ...structuredClone(data), specialistUserId: String(specialistUserId), updatedAt: new Date() };
        specialistAvailabilities.set(String(specialistUserId), availability);
        return structuredClone(availability);
      },
      async findReservedAppointments(specialistUserId, startsBefore, endsAfter) {
        return [...appointments.values()]
          .filter((appointment) => String(appointment.specialistUserId) === String(specialistUserId)
            && appointment.slotReserved && appointment.startsAt < startsBefore && appointment.endsAt > endsAfter)
          .map(({ startsAt, endsAt, reservationKeys }) => structuredClone({ startsAt, endsAt, reservationKeys }));
      },
      async createAppointment(data) {
        if ([...appointments.values()].some((appointment) => String(appointment.specialistUserId) === String(data.specialistUserId)
          && appointment.slotReserved
          && appointment.reservationKeys.some((key) => data.reservationKeys.some((requestedKey) => key.getTime() === requestedKey.getTime())))) {
          const error = new Error('conflicting appointment slot');
          error.code = 11000;
          throw error;
        }
        const appointment = { ...structuredClone(data), _id: idFor(), createdAt: new Date(), updatedAt: new Date() };
        appointments.set(String(appointment._id), appointment);
        return structuredClone(appointment);
      },
      async expirePending(now, specialistUserId) {
        let modifiedCount = 0;
        for (const appointment of appointments.values()) {
          if (appointment.status === 'pending' && appointment.slotReserved && appointment.expiresAt <= now
            && (!specialistUserId || String(appointment.specialistUserId) === String(specialistUserId))) {
            Object.assign(appointment, { status: 'expired', slotReserved: false, expiredAt: now });
            modifiedCount += 1;
          }
        }
        return { modifiedCount };
      },
      async listParentAppointments(parentUserId) {
        return [...appointments.values()].filter((item) => String(item.parentUserId) === String(parentUserId))
          .map((item) => ({
            ...structuredClone(item),
            childId: structuredClone(children.get(String(item.childId))),
            specialistUserId: structuredClone(users.get(String(item.specialistUserId)))
          }));
      },
      async listSpecialistAppointments(specialistUserId) {
        return [...appointments.values()].filter((item) => String(item.specialistUserId) === String(specialistUserId))
          .map((item) => ({
            ...structuredClone(item),
            childId: structuredClone(children.get(String(item.childId))),
            parentUserId: structuredClone(users.get(String(item.parentUserId)))
          }));
      },
      async findOwnedAppointment(appointmentId, ownerField, userId) {
        const appointment = appointments.get(String(appointmentId));
        if (!appointment || String(appointment[ownerField]) !== String(userId)) return null;
        return {
          ...structuredClone(appointment),
          childId: structuredClone(children.get(String(appointment.childId)))
        };
      },
      async findAdminAppointment(appointmentId) {
        const appointment = appointments.get(String(appointmentId));
        if (!appointment) return null;
        return {
          ...structuredClone(appointment),
          childId: structuredClone(children.get(String(appointment.childId))),
          parentUserId: structuredClone(users.get(String(appointment.parentUserId))),
          specialistUserId: structuredClone(users.get(String(appointment.specialistUserId)))
        };
      },
      async listAdminAppointments(query) {
        const matches = [...appointments.values()].filter((item) => {
          if (query.bookingStatus !== 'all' && item.status !== query.bookingStatus) return false;
          if (query.from && item.startsAt < query.from) return false;
          if (query.to && item.startsAt > query.to) return false;
          if (query.meetingStatus === 'missing' && item.meeting?.roomName) return false;
          if (query.meetingStatus !== 'all' && query.meetingStatus !== 'missing'
            && item.meeting?.status !== query.meetingStatus) return false;
          const searchText = `${users.get(String(item.parentUserId))?.parentProfile?.displayName ?? ''} ${users.get(String(item.specialistUserId))?.professionalProfile?.displayName ?? ''}`.toLowerCase();
          return !query.search || searchText.includes(query.search.toLowerCase());
        });
        const confirmed = [...appointments.values()].filter(({ status }) => status === 'accepted');
        const withMeeting = confirmed.filter(({ meeting }) => Boolean(meeting?.roomName));
        return {
          appointments: matches.slice((query.page - 1) * query.limit, query.page * query.limit).map((item) => ({
            ...structuredClone(item),
            parentId: item.parentUserId,
            parentName: users.get(String(item.parentUserId))?.parentProfile?.displayName,
            childName: children.get(String(item.childId))?.displayName,
            specialistId: item.specialistUserId,
            specialistName: users.get(String(item.specialistUserId))?.professionalProfile?.displayName
          })),
          total: matches.length,
          stats: {
            total: confirmed.length,
            withMeeting: withMeeting.length,
            missingMeeting: confirmed.length - withMeeting.length,
            failedMeeting: confirmed.filter(({ meeting, meetingProvisioningFailedAt }) => (
              meeting?.status === 'failed' || Boolean(meetingProvisioningFailedAt)
            )).length,
            completed: confirmed.filter(({ sessionStatus }) => sessionStatus === 'completed').length,
            cancelled: confirmed.filter(({ meeting }) => meeting?.status === 'cancelled').length
          }
        };
      },
      async decideAppointment(appointmentId, specialistUserId, status, now, decisionNote) {
        const appointment = appointments.get(String(appointmentId));
        if (!appointment || String(appointment.specialistUserId) !== String(specialistUserId)
          || appointment.status !== 'pending' || !appointment.slotReserved || appointment.expiresAt <= now) return null;
        Object.assign(appointment, {
          status,
          slotReserved: status === 'accepted',
          decidedAt: now,
          ...(status === 'accepted' ? { acceptedAt: now } : { rejectedAt: now }),
          decisionNote
        });
        return {
          ...structuredClone(appointment),
          childId: structuredClone(children.get(String(appointment.childId)))
        };
      },
      async assignMeeting(appointmentId, specialistUserId, meeting) {
        const appointment = appointments.get(String(appointmentId));
        if (!appointment || String(appointment.specialistUserId) !== String(specialistUserId)
          || appointment.status !== 'accepted' || appointment.meeting) return null;
        appointment.meeting = structuredClone(meeting);
        appointment.meetingProvisioningFailedAt = null;
        appointment.meetingProvisioningErrorCode = '';
        return {
          ...structuredClone(appointment),
          childId: structuredClone(children.get(String(appointment.childId)))
        };
      },
      async recordMeetingProvisioningFailure(appointmentId, failedAt, errorCode) {
        const appointment = appointments.get(String(appointmentId));
        if (!appointment || appointment.status !== 'accepted' || appointment.meeting) return null;
        appointment.meetingProvisioningFailedAt = failedAt;
        appointment.meetingProvisioningErrorCode = errorCode;
        return structuredClone(appointment);
      },
      async startSession(appointmentId, specialistUserId, now, joinUntil, hasMeeting) {
        const appointment = appointments.get(String(appointmentId));
        if (!appointment || String(appointment.specialistUserId) !== String(specialistUserId)
          || appointment.status !== 'accepted' || (appointment.sessionStatus ?? 'not_started') !== 'not_started'
          || appointment.startsAt > joinUntil) return null;
        Object.assign(appointment, {
          sessionStatus: 'in_progress',
          sessionStartedAt: now,
          ...(hasMeeting ? { meeting: { ...appointment.meeting, status: 'live', startedAt: now } } : {})
        });
        return structuredClone(appointment);
      },
      async completeSession(appointmentId, specialistUserId, now, { privateNotes, parentReport, hasMeeting }) {
        const appointment = appointments.get(String(appointmentId));
        if (!appointment || String(appointment.specialistUserId) !== String(specialistUserId)
          || appointment.status !== 'accepted' || appointment.sessionStatus !== 'in_progress') return null;
        Object.assign(appointment, {
          sessionStatus: 'completed',
          sessionEndedAt: now,
          privateSpecialistNotes: privateNotes,
          ...(hasMeeting ? { meeting: { ...appointment.meeting, status: 'ended', endedAt: now } } : {}),
          parentProgressReport: { ...structuredClone(parentReport), createdAt: now }
        });
        return structuredClone(appointment);
      }
    },
    adminVideoTestRepository: {
      async countRecentForAdministrator(administratorId, since) {
        return [...videoTests.values()].filter((item) => String(item.administratorId) === String(administratorId)
          && item.createdAt >= since).length;
      },
      async expireInProgress(now) {
        for (const item of videoTests.values()) {
          if (item.status === 'in_progress' && item.expiresAt <= now) {
            item.status = 'incomplete';
            item.endedAt = now;
            item.secondParticipantTokenHash = null;
          }
        }
      },
      async create(data) {
        const item = {
          ...structuredClone(data),
          _id: idFor(),
          results: {
            providerApi: 'pending', meetingInitialization: 'pending', connection: 'pending',
            camera: 'pending', microphone: 'pending', twoParticipants: 'pending',
            ...structuredClone(data.results)
          },
          failureReason: '',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        videoTests.set(String(item._id), item);
        return structuredClone(item);
      },
      async findById(testId) {
        const item = videoTests.get(String(testId));
        return item ? structuredClone(item) : null;
      },
      async update(testId, updates) {
        const item = videoTests.get(String(testId));
        if (!item) return null;
        Object.assign(item, structuredClone(updates), { updatedAt: new Date() });
        return structuredClone(item);
      },
      async recordResults(testId, updates, now) {
        const item = videoTests.get(String(testId));
        if (!item || item.status !== 'in_progress' || item.expiresAt <= now) return null;
        for (const [path, value] of Object.entries(updates)) {
          if (path.startsWith('results.')) item.results[path.slice('results.'.length)] = value;
          else item[path] = value;
        }
        return structuredClone(item);
      },
      async consumeSecondParticipantToken(testId, tokenHash, now) {
        const item = videoTests.get(String(testId));
        if (!item || item.status !== 'in_progress' || item.expiresAt <= now
          || item.secondParticipantTokenHash !== tokenHash) return null;
        item.secondParticipantTokenHash = null;
        return structuredClone(item);
      },
      async list(query) {
        const results = [...videoTests.values()].filter((item) => (
          (!query.from || item.createdAt >= query.from)
          && (!query.to || item.createdAt <= query.to)
          && (!query.administratorId || String(item.administratorId) === String(query.administratorId))
          && (query.status === 'all' || item.status === query.status)
        )).sort((a, b) => b.createdAt - a.createdAt);
        return [
          results.slice((query.page - 1) * query.limit, query.page * query.limit).map((item) => ({
            ...structuredClone(item),
            administratorId: {
              _id: item.administratorId,
              email: users.get(String(item.administratorId))?.email
            }
          })),
          results.length
        ];
      }
    },
    async findUserById(id) { return users.get(String(id)) ?? null; },
    gameLibraryRepository,
    gameDefinitions,
    gameVersions,
    mediaAssets,
    async createUser(data) {
      if ([...users.values()].some((user) => user.email === data.email)) {
        const error = new Error('duplicate');
        error.code = 11000;
        throw error;
      }
      const user = { ...data, _id: idFor(), createdAt: new Date() };
      users.set(user._id, user);
      return user;
    },
    async findUserByEmail(email) {
      return [...users.values()].find((user) => user.email === email) ?? null;
    },
    async listActiveAdministrators() {
      return [...users.values()].filter((user) => user.role === 'admin'
        && user.accountStatus === 'active' && user.emailVerifiedAt);
    },
    async findUserById(id) {
      return users.get(String(id)) ?? null;
    },
    async listPublicSpecialists() {
      return [...users.values()].filter((user) => user.role === 'specialist'
        && user.approvalStatus === 'approved'
        && user.accountStatus === 'active'
        && user.emailVerifiedAt
        && user.professionalProfile?.publicListing);
    },
    async createAuthToken(data) {
      tokens.set(data.tokenHash, data);
      return data;
    },
    async consumeAuthToken(tokenHash, purpose, now) {
      const token = tokens.get(tokenHash);
      if (!token || token.purpose !== purpose || token.expiresAt <= now) return null;
      tokens.delete(tokenHash);
      return token;
    },
    async deleteAuthTokens(userId, purpose) {
      for (const [tokenHash, token] of tokens) {
        if (String(token.userId) === String(userId) && (!purpose || token.purpose === purpose)) tokens.delete(tokenHash);
      }
    },
    async createSession(data) {
      sessions.set(data.tokenHash, data);
      return data;
    },
    async findSession(tokenHash, now) {
      const session = sessions.get(tokenHash);
      return session && session.expiresAt > now ? session : null;
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
    async deleteSessions(userId) {
      for (const [tokenHash, session] of sessions) {
        if (String(session.userId) === String(userId)) sessions.delete(tokenHash);
      }
    },
    async createAuditEvent(data) {
      auditEvents.push(data);
      return data;
    },
    async listManagedAccounts() {
      return [...users.values()].filter((user) => ['parent', 'specialist'].includes(user.role));
    },
    async listAdministrators() {
      return [...users.values()].filter((user) => user.role === 'admin');
    },
    async countAdministrators() {
      return [...users.values()].filter((user) => user.role === 'admin').length;
    },
    async countExistingEmail(email) {
      return [...users.values()].some((user) => user.email === email);
    },
    async deleteAdministrator(id) {
      const user = users.get(String(id));
      if (!user || user.role !== 'admin') return null;
      users.delete(String(id));
      return user;
    },
    async deletePendingAccount(id) {
      const user = users.get(String(id));
      if (!user || !['parent', 'specialist'].includes(user.role) || user.approvalStatus !== 'pending') return null;
      users.delete(String(id));
      return user;
    },
    async updateApprovalStatus(id, approvalStatus) {
      const user = users.get(String(id));
      if (!user || !['parent', 'specialist'].includes(user.role)) return null;
      user.approvalStatus = approvalStatus;
      return user;
    },
    async updateAccountStatus(id, accountStatus) {
      const user = users.get(String(id));
      if (!user || !['parent', 'specialist'].includes(user.role)) return null;
      user.accountStatus = accountStatus;
      return user;
    },
    async updateSpecialistProfile(id, professionalProfile) {
      const user = users.get(String(id));
      if (!user || user.role !== 'specialist') return null;
      user.professionalProfile = { ...user.professionalProfile, ...professionalProfile };
      return user;
    },
    async updateSpecialistDocuments(id, documents) {
      const user = users.get(String(id));
      if (!user || user.role !== 'specialist') return null;
      const previous = {
        profilePhoto: user.professionalProfile?.profilePhoto,
        medicalCardFront: user.professionalProfile?.medicalCardFront,
        medicalCardBack: user.professionalProfile?.medicalCardBack
      };
      Object.assign(user.professionalProfile, documents);
      return { user, previous };
    },
    async updateUserPassword(id, passwordHashValue) {
      const user = users.get(String(id));
      if (user) user.passwordHash = passwordHashValue;
    },
    async verifyUserEmail(id, verifiedAt) {
      const user = users.get(String(id));
      if (!user || user.emailVerifiedAt) return null;
      user.emailVerifiedAt = verifiedAt;
      return user;
    },
    async deleteUnverifiedUser(id) {
      const user = users.get(String(id));
      if (user && !user.emailVerifiedAt) users.delete(String(id));
    },
    async createChild(data) {
      const child = { ...data, _id: idFor(), createdAt: new Date(), updatedAt: new Date() };
      children.set(child._id, child);
      return child;
    },
    async listChildren(parentUserId) {
      return [...children.values()]
        .filter((child) => String(child.parentUserId) === String(parentUserId))
        .sort((left, right) => right.createdAt - left.createdAt);
    },
    async findOwnedChild(childId, parentUserId) {
      const child = children.get(String(childId));
      return child && String(child.parentUserId) === String(parentUserId) ? child : null;
    },
    async updateOwnedChild(childId, parentUserId, updates) {
      const child = await this.findOwnedChild(childId, parentUserId);
      if (!child) return null;
      Object.assign(child, updates, { updatedAt: new Date() });
      return child;
    },
    async createConsent(data) {
      const consent = { ...data, _id: idFor(), createdAt: data.createdAt ?? new Date() };
      childConsents.push(consent);
      return consent;
    },
    async listConsentHistory(childId, parentUserId) {
      return childConsents
        .filter((consent) => String(consent.childId) === String(childId)
          && String(consent.parentUserId) === String(parentUserId))
        .sort((left, right) => right.createdAt - left.createdAt || right._id.localeCompare(left._id));
    },
    async recordAnswerReceipt(data) {
      const key = [
        String(data.parentUserId),
        String(data.childId),
        data.gameId,
        data.submissionId,
        data.questionIndex
      ].join(':');
      gameAnswerReceipts.set(key, structuredClone(data));
      return structuredClone(data);
    },
    async listAnswerReceipts({ parentUserId, childId, gameId, gameVersion, submissionId }) {
      return [...gameAnswerReceipts.values()]
        .filter((receipt) => String(receipt.parentUserId) === String(parentUserId)
          && String(receipt.childId) === String(childId)
          && receipt.gameId === gameId
          && receipt.gameVersion === gameVersion
          && receipt.submissionId === submissionId
          && receipt.expiresAt > new Date())
        .sort((left, right) => left.questionIndex - right.questionIndex)
        .map((receipt) => structuredClone(receipt));
    },
    async deleteAnswerReceipts({ parentUserId, childId, gameId, submissionId }) {
      for (const [key, receipt] of gameAnswerReceipts.entries()) {
        if (String(receipt.parentUserId) === String(parentUserId)
          && String(receipt.childId) === String(childId)
          && receipt.gameId === gameId
          && receipt.submissionId === submissionId) {
          gameAnswerReceipts.delete(key);
        }
      }
    },
    async findAttemptBySubmission({ parentUserId, childId, gameId, submissionId }) {
      return gameAttempts.find((attempt) => attempt.submissionId === submissionId
        && String(attempt.parentUserId) === String(parentUserId)
        && String(attempt.childId) === String(childId)
        && attempt.gameId === gameId) ?? null;
    },
    async createAttempt(data) {
      if (data.submissionId) {
        const existing = gameAttempts.find((attempt) => attempt.submissionId === data.submissionId
          && String(attempt.parentUserId) === String(data.parentUserId)
          && String(attempt.childId) === String(data.childId)
          && attempt.gameId === data.gameId);
        if (existing) return existing;
      }
      const attempt = { ...data, _id: idFor() };
      gameAttempts.push(attempt);
      return attempt;
    },
    async getChildActivityResults(parentUserId, childId, gameIds, sampleSize) {
      return gameIds.map((gameId) => {
        const matchingAttempts = gameAttempts
          .filter((attempt) => String(attempt.parentUserId) === String(parentUserId)
            && String(attempt.childId) === String(childId)
            && attempt.gameId === gameId)
          .sort((left, right) => right.completedAt - left.completedAt || right._id.localeCompare(left._id));
        return matchingAttempts.length ? {
          gameId,
          attemptCount: matchingAttempts.length,
          recentAttempts: matchingAttempts.slice(0, sampleSize).map((attempt) => ({
            correctCount: attempt.correctCount,
            totalQuestions: attempt.totalQuestions,
            completedAt: attempt.completedAt
          }))
        } : null;
      }).filter(Boolean);
    },
    async listChildAttempts(parentUserId, childId, { page, limit, gameId }) {
      const matchingAttempts = gameAttempts
        .filter((attempt) => String(attempt.parentUserId) === String(parentUserId)
          && String(attempt.childId) === String(childId)
          && (!gameId || attempt.gameId === gameId))
        .sort((left, right) => right.completedAt - left.completedAt || right._id.localeCompare(left._id));
      return {
        attempts: matchingAttempts.slice((page - 1) * limit, page * limit),
        total: matchingAttempts.length
      };
    }
  };
}

let repository;
let authService;
let childService;
let gameService;
let gameLibraryService;
let learningPathService;
let subscriptionService;
let platformSettingsService;
let testimonialService;
let appointmentService;
let adminVideoTestService;
let appointmentNow = new Date();
let admin;
let server;
let baseUrl;
let mediaAssetDirectory;
let specialistDocumentService;
let receiptService;
let notificationService;
let reportService;
const storedNotifications = [];

function cookieFrom(response) {
  return response.headers.getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .find((cookie) => cookie.startsWith('harf.sid='));
}

function cookieValue(cookie) {
  return cookie?.slice('harf.sid='.length);
}

async function request(path, { method = 'GET', body, cookie, csrfToken, range } = {}) {
  const headers = { Origin: config.appOrigin };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  if (range) headers.Range = range;
  return fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

async function recordGameAnswers({
  gameId,
  parent,
  childId,
  submissionId,
  answers,
  gameVersion
}) {
  for (const [questionIndex, answerIndex] of answers.entries()) {
    const response = await request(`/games/${gameId}/answer`, {
      method: 'POST',
      cookie: parent.cookie,
      csrfToken: parent.csrfToken,
      body: {
        childId,
        submissionId,
        questionIndex,
        answerIndex,
        ...(gameVersion ? { gameVersion } : {})
      }
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.deepEqual(Object.keys(payload.answer), ['correct']);
  }
}

async function uploadMedia({
  cookie,
  csrfToken,
  kind = 'image',
  displayName = 'أصل تجريبي',
  altText = '',
  category = '',
  tags = '',
  fileName = 'asset.png',
  mimeType = 'image/png',
  buffer
}) {
  const formData = new FormData();
  formData.set('displayName', displayName);
  formData.set('kind', kind);
  formData.set('altText', altText);
  formData.set('category', category);
  formData.set('tags', tags);
  formData.set('file', new Blob([buffer], { type: mimeType }), fileName);
  return fetch(`${baseUrl}/api/v1/admin/assets`, {
    method: 'POST',
    headers: {
      Origin: config.appOrigin,
      Cookie: cookie,
      'X-CSRF-Token': csrfToken
    },
    body: formData
  });
}

async function replaceMedia({ cookie, csrfToken, assetId, fileName = 'replacement.png', mimeType = 'image/png', buffer }) {
  const formData = new FormData();
  formData.set('file', new Blob([buffer], { type: mimeType }), fileName);
  return fetch(`${baseUrl}/api/v1/admin/assets/${assetId}/replace`, {
    method: 'POST',
    headers: {
      Origin: config.appOrigin,
      Cookie: cookie,
      'X-CSRF-Token': csrfToken
    },
    body: formData
  });
}

async function submitPayment({ cookie, csrfToken, method = 'vodafone_cash', period = 'monthly', transactionReference = 'TXN-2026-001', receiptBuffer = null }) {
  const formData = new FormData();
  formData.set('method', method);
  formData.set('period', period);
  formData.set('transactionReference', transactionReference);
  if (receiptBuffer) {
    formData.set('receipt', new Blob([receiptBuffer], { type: 'application/octet-stream' }), 'receipt.bin');
  }
  return fetch(`${baseUrl}/api/v1/payments`, {
    method: 'POST',
    headers: {
      Origin: config.appOrigin,
      Cookie: cookie,
      'X-CSRF-Token': csrfToken
    },
    body: formData
  });
}

async function registerAccount(role, email) {
  if (role === 'specialist') {
    const formData = new FormData();
    formData.set('role', role);
    formData.set('email', email);
    formData.set('password', 'correct horse battery staple');
    formData.set('displayName', 'Harf Test');
    const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2cAAAAASUVORK5CYII=', 'base64');
    for (const field of ['profilePhoto', 'medicalCardFront', 'medicalCardBack']) {
      formData.set(field, new Blob([imageBytes], { type: 'image/png' }), `${field}.png`);
    }
    return fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { Origin: config.appOrigin },
      body: formData
    });
  }
  return request('/auth/register', {
    method: 'POST',
    body: { role, email, password: 'correct horse battery staple', displayName: 'Harf Test' }
  });
}

async function createApprovedParent(email) {
  const user = await repository.createUser({
    email,
    passwordHash: await hashPassword('approved parent account password'),
    role: 'parent',
    emailVerifiedAt: new Date(),
    approvalStatus: 'approved',
    accountStatus: 'active',
    parentProfile: { displayName: 'Parent' }
  });
  const session = await authService.createSession(user);
  return {
    user,
    cookie: `harf.sid=${session.rawToken}`,
    csrfToken: session.csrfToken
  };
}

async function grantActiveSubscription(parentUserId, durationDays = 30) {
  const startsAt = new Date();
  await repository.subscriptionRepository.createSubscription({
    parentUserId,
    startsAt,
    expiresAt: new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000),
    grantedDays: durationDays,
    grantedBy: admin._id,
    source: 'administrator',
    reason: 'اختبار تكامل الاشتراك'
  });
}

async function createApprovedSpecialist(email) {
  const user = await repository.createUser({
    email,
    passwordHash: await hashPassword('approved specialist account password'),
    role: 'specialist',
    emailVerifiedAt: new Date(),
    approvalStatus: 'approved',
    accountStatus: 'active',
    professionalProfile: { displayName: 'Specialist', publicListing: false }
  });
  const session = await authService.createSession(user);
  return `harf.sid=${session.rawToken}`;
}

async function createBookableSpecialist(email) {
  const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2cAAAAASUVORK5CYII=', 'base64');
  const documents = await specialistDocumentService.storeRequired(Object.fromEntries(
    ['profilePhoto', 'medicalCardFront', 'medicalCardBack']
      .map((field) => [field, [{ buffer: imageBytes }]])
  ));
  const user = await repository.createUser({
    email,
    passwordHash: await hashPassword('approved specialist account password'),
    role: 'specialist',
    emailVerifiedAt: new Date(),
    approvalStatus: 'approved',
    accountStatus: 'active',
    professionalProfile: {
      displayName: 'أخصائية حرف',
      specialty: 'أخصائية تخاطب',
      credentials: 'مؤهلات مهنية موثقة',
      bio: 'نبذة مهنية للأخصائية.',
      publicListing: true,
      ...documents
    }
  });
  const session = await authService.createSession(user);
  return {
    user,
    cookie: `harf.sid=${session.rawToken}`,
    csrfToken: session.csrfToken
  };
}

before(async () => {
  verificationEmails.length = 0;
  resetEmails.length = 0;
  repository = createMemoryRepository();
  mediaAssetDirectory = await mkdtemp(path.join(tmpdir(), 'harf-media-test-'));
  specialistDocumentService = new SpecialistDocumentService({
    storageDirectory: path.join(mediaAssetDirectory, 'specialist-verification')
  });
  await specialistDocumentService.initialize();
  notificationService = {
    async notify(recipientUserId, data) {
      const notification = {
        id: String(storedNotifications.length + 1).padStart(24, '0'),
        recipientUserId: String(recipientUserId),
        ...data,
        readAt: null,
        createdAt: new Date()
      };
      storedNotifications.push(notification);
      return notification;
    },
    async list(recipientUserId) {
      return storedNotifications
        .filter((item) => item.recipientUserId === String(recipientUserId))
        .map(({ recipientUserId: _recipientUserId, ...item }) => item);
    },
    async markRead(recipientUserId, notificationId) {
      const notification = storedNotifications.find((item) => item.id === notificationId
        && item.recipientUserId === String(recipientUserId));
      if (!notification) return null;
      notification.readAt = new Date();
      const { recipientUserId: _recipientUserId, ...serialized } = notification;
      return serialized;
    },
    async markAllRead(recipientUserId) {
      let modified = 0;
      for (const notification of storedNotifications) {
        if (notification.recipientUserId === String(recipientUserId) && !notification.readAt) {
          notification.readAt = new Date();
          modified += 1;
        }
      }
      return { modified };
    }
  };
  reportService = {
    async getAdminReport() {
      return {
        generatedAt: new Date().toISOString(),
        registrations: { total: 0, byRoleAndApproval: {} },
        specialists: { byCategory: [] },
        gameUsage: { attemptsCompleted: 0, byGame: [] },
        learningProgress: { childrenWithProgress: 0, completedActivities: 0 },
        subscriptions: { active: 0, expired: 0, scheduled: 0 },
        payments: {
          requests: [
            { requestedCount: 0, requestedAmountMinor: 0 },
            { submittedCount: 0, submittedAmountMinor: 0 },
            { confirmedCount: 0, confirmedAmountMinor: 0 },
            { rejectedCount: 0, rejectedAmountMinor: 0 }
          ],
          requestedAmountMinor: 0,
          submittedAmountMinor: 0,
          confirmedAmountMinor: 0,
          rejectedAmountMinor: 0
        },
        appointments: [],
        auditEvents: []
      };
    }
  };
  authService = new AuthService({
    repository,
    emailService,
    notificationService,
    logger,
    appOrigin: config.appOrigin,
    specialistDocumentService
  });
  childService = new ChildService({ repository });
  appointmentService = new AppointmentService({
    repository: repository.appointmentRepository,
    authRepository: repository,
    childService,
    videoProviderService: new VideoProviderService(),
    notificationService,
    logger,
    specialistDocumentService,
    now: () => appointmentNow
  });
  adminVideoTestService = new AdminVideoTestService({
    repository: repository.adminVideoTestRepository,
    videoProviderService: new VideoProviderService({
      adapter: new JitsiIframeAdapter({ domain: 'meet.jit.si' }),
      now: () => appointmentNow
    }),
    authRepository: repository,
    now: () => appointmentNow
  });
  receiptService = new PaymentReceiptService({
    storageDirectory: path.join(mediaAssetDirectory, 'payment-receipts')
  });
  await receiptService.initialize();
  subscriptionService = new SubscriptionService({
    repository: repository.subscriptionRepository,
    paymentRepository: repository.paymentRepository,
    authRepository: repository,
    notificationService,
    logger,
    receiptService
  });
  learningPathService = new LearningPathService({
    repository: repository.learningPathRepository,
    gameRepository: repository,
    childService,
    subscriptionService,
    authService
  });
  const mediaAssetService = new MediaAssetService({
    repository: repository.gameLibraryRepository,
    storageDirectory: mediaAssetDirectory
  });
  await mediaAssetService.initialize();
  let storedPlatformSettings = null;
  platformSettingsService = new PlatformSettingsService({
    repository: {
      async getSettings() { return storedPlatformSettings ? structuredClone(storedPlatformSettings) : null; },
      async updateSettings(updates, updatedBy) {
        storedPlatformSettings = { ...structuredClone(updates), updatedBy, updatedAt: new Date() };
        return structuredClone(storedPlatformSettings);
      },
      async findActiveImageAsset(assetId) {
        const asset = await repository.gameLibraryRepository.findAsset(assetId);
        return asset?.kind === 'image' && asset.active ? asset : null;
      }
    },
    authService,
    mediaAssetService
  });
  const testimonials = new Map();
  let testimonialSequence = 1;
  testimonialService = new TestimonialService({
    repository: {
      async create(data) {
        const testimonial = {
          ...structuredClone(data),
          _id: testimonialSequence.toString(16).padStart(24, '0'),
          createdAt: new Date(),
          reviewedAt: null
        };
        testimonialSequence += 1;
        testimonials.set(String(testimonial._id), testimonial);
        return structuredClone(testimonial);
      },
      async findPendingByParent(parentUserId) {
        return [...testimonials.values()].find((item) => String(item.parentUserId) === String(parentUserId)
          && item.status === 'pending') ?? null;
      },
      async listForParent(parentUserId) {
        return [...testimonials.values()].filter((item) => String(item.parentUserId) === String(parentUserId));
      },
      async listPublic() {
        return [...testimonials.values()].filter((item) => item.status === 'approved');
      },
      async listForAdmin() {
        return [...testimonials.values()];
      },
      async review(testimonialId, reviewedBy, status, reviewedAt) {
        const testimonial = testimonials.get(String(testimonialId));
        if (!testimonial || testimonial.status !== 'pending') return null;
        Object.assign(testimonial, { status, reviewedBy, reviewedAt });
        return structuredClone(testimonial);
      },
      async findById(testimonialId) {
        return testimonials.get(String(testimonialId)) ?? null;
      }
    },
    authRepository: repository,
    notificationService,
    logger
  });
  gameLibraryService = new GameLibraryService({
    repository: repository.gameLibraryRepository,
    mediaAssetService,
    authService
  });
  gameService = new GameService({
    repository,
    childService,
    gameLibraryService,
    learningPathService,
    subscriptionService
  });
  admin = await repository.createUser({
    email: 'admin@harf.test',
    passwordHash: await hashPassword('administrator password safe'),
    role: 'admin',
    emailVerifiedAt: new Date(),
    approvalStatus: 'approved',
    accountStatus: 'active'
  });
  server = createServer(createApp({
    config,
    logger,
    getDatabaseState: () => 1,
    authService,
    repository,
    childService,
    gameService,
    gameLibraryService,
    learningPathService,
    subscriptionService,
    appointmentService,
    specialistDocumentService,
    notificationService,
    reportService,
    platformSettingsService,
    testimonialService,
    adminVideoTestService
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await once(server, 'close');
  await rm(mediaAssetDirectory, { recursive: true, force: true });
});

test('Mongoose models declare unique email accounts and explicit TTL indexes', () => {
  assert.ok(User.schema.indexes().some(([fields, options]) => fields.email === 1 && options.unique));
  assert.equal(User.schema.indexes().some(([fields, options]) => fields.role === 1 && options.unique), false);
  assert.ok(Session.schema.indexes().some(([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds === 0));
  assert.ok(AuthToken.schema.indexes().some(([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds === 0));
  assert.ok(AuthToken.schema.indexes().some(([fields, options]) => fields.userId === 1 && fields.purpose === 1 && options.unique));
  assert.ok(AuditEvent.schema.indexes().some(([fields]) => fields.targetUserId === 1));
  assert.ok(PaymentRequest.schema.indexes().some(([fields]) => fields.parentUserId === 1 && fields.open === undefined));
  assert.ok(PaymentRequest.schema.indexes().some(([fields, options]) => fields.parentUserId === 1
    && options.unique && options.partialFilterExpression?.open === true));
  assert.ok(SubscriptionSettings.schema.indexes().some(([fields, options]) => fields.key === 1 && options.unique));
  assert.ok(SpecialistAvailability.schema.indexes().some(([fields, options]) => fields.specialistUserId === 1 && options.unique));
  assert.ok(Appointment.schema.indexes().some(([fields, options]) => fields.specialistUserId === 1
    && fields.reservationKeys === 1
    && options.unique
    && options.partialFilterExpression?.slotReserved === true));
  assert.equal(Appointment.schema.path('privateSpecialistNotes').options.maxlength, 4000);
  assert.equal(Appointment.schema.path('sessionStatus').enumValues.includes('completed'), true);
  assert.ok(Appointment.schema.indexes().some(([fields, options]) => fields['meeting.roomName'] === 1 && options.unique));
  assert.ok(AdminVideoTest.schema.indexes().some(([fields]) => fields.administratorId === 1 && fields.createdAt === -1));
  assert.ok(AdminVideoTest.schema.indexes().some(([fields]) => fields.status === 1 && fields.createdAt === -1));
  assert.ok(AdminVideoTest.schema.indexes().some(([fields, options]) => fields.roomName === 1 && options.unique));
  assert.ok(Testimonial.schema.indexes().some(([fields, options]) => fields.parentUserId === 1
    && options.unique && options.partialFilterExpression?.status === 'pending'));
});

test('video provider integration accepts only HTTPS short-lived room credentials', async () => {
  const now = new Date();
  const provider = new VideoProviderService({
    now: () => now,
    adapter: {
      async createRoomAccess() {
        return {
          joinUrl: 'https://video.example.invalid/room/harf',
          token: 'short-lived-participant-token',
          expiresAt: new Date(now.getTime() + 5 * 60 * 1000)
        };
      }
    }
  });
  const access = await provider.createRoomAccess({ appointment: { id: 'appointment' }, participant: { role: 'parent' } });
  assert.equal(access.token, 'short-lived-participant-token');
  assert.equal(new Date(access.expiresAt).getTime() - now.getTime(), 5 * 60 * 1000);

  const longLivedProvider = new VideoProviderService({
    now: () => now,
    adapter: {
      async createRoomAccess() {
        return {
          joinUrl: 'https://video.example.invalid/room/harf',
          token: 'long-lived-token',
          expiresAt: new Date(now.getTime() + 6 * 60 * 1000)
        };
      }
    }
  });
  await assert.rejects(
    () => longLivedProvider.createRoomAccess({ appointment: {}, participant: {} }),
    (error) => error.code === 'VIDEO_PROVIDER_INVALID_EXPIRY'
  );

  const jitsiAdapter = new JitsiIframeAdapter({ domain: 'meet.jit.si' });
  const roomName = 'a'.repeat(64);
  const meeting = jitsiAdapter.createMeetingRecord({ roomName, now });
  const publicAccess = await new VideoProviderService({ adapter: jitsiAdapter, now: () => now })
    .createRoomAccess({ appointment: { meeting }, participant: { role: 'parent' } });
  assert.equal(publicAccess.roomName, roomName);
  assert.equal(publicAccess.domain, 'meet.jit.si');
  assert.equal(Object.hasOwn(publicAccess, 'token'), false);
});

test('video service tests are admin-only, temporary, independently recorded, and never expose room history', async () => {
  const anonymous = await request('/admin/video-tests');
  assert.equal(anonymous.status, 401);
  const parent = await createApprovedParent('video-test-parent@harf.test');
  assert.equal((await request('/admin/video-tests', { cookie: parent.cookie })).status, 403);
  assert.equal((await request('/admin/appointments', { cookie: parent.cookie })).status, 403);

  const administratorSession = await authService.createSession(admin);
  const administratorCookie = `harf.sid=${administratorSession.rawToken}`;
  const createdResponse = await request('/admin/video-tests', {
    method: 'POST',
    cookie: administratorCookie,
    csrfToken: administratorSession.csrfToken
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.test.status, 'in_progress');
  assert.equal(created.access.roomName.length, 64);
  assert.equal(Object.hasOwn(created.test, 'roomName'), false);
  assert.equal(Object.hasOwn(created.test, 'appointmentId'), false);

  const secondAccess = await request(`/admin/video-tests/${created.test.id}/second-participant/access`, {
    method: 'POST',
    cookie: administratorCookie,
    csrfToken: administratorSession.csrfToken,
    body: { token: created.secondParticipantToken }
  });
  assert.equal(secondAccess.status, 200);
  assert.equal((await secondAccess.json()).access.roomName, created.access.roomName);
  const reusedLink = await request(`/admin/video-tests/${created.test.id}/second-participant/access`, {
    method: 'POST',
    cookie: administratorCookie,
    csrfToken: administratorSession.csrfToken,
    body: { token: created.secondParticipantToken }
  });
  assert.equal(reusedLink.status, 404);

  const providerResults = await request(`/admin/video-tests/${created.test.id}/results`, {
    method: 'PATCH',
    cookie: administratorCookie,
    csrfToken: administratorSession.csrfToken,
    body: {
      providerApi: 'passed',
      meetingInitialization: 'passed',
      connection: 'passed'
    }
  });
  assert.equal(providerResults.status, 200);
  const manualDeviceResults = await request(`/admin/video-tests/${created.test.id}/results`, {
    method: 'PATCH',
    cookie: administratorCookie,
    csrfToken: administratorSession.csrfToken,
    body: {
      camera: 'manual_passed',
      microphone: 'manual_passed'
    }
  });
  assert.equal(manualDeviceResults.status, 200);
  const participantResult = await request(`/admin/video-tests/${created.test.id}/results`, {
    method: 'PATCH',
    cookie: administratorCookie,
    csrfToken: administratorSession.csrfToken,
    body: { twoParticipants: 'manual_passed' }
  });
  assert.equal((await participantResult.json()).test.results.providerApi, 'passed');
  const ended = await request(`/admin/video-tests/${created.test.id}/end`, {
    method: 'POST',
    cookie: administratorCookie,
    csrfToken: administratorSession.csrfToken
  });
  assert.equal((await ended.json()).test.status, 'succeeded');
  const historyResponse = await request('/admin/video-tests?page=1&limit=10', { cookie: administratorCookie });
  const { tests } = await historyResponse.json();
  const historyRecord = tests.find((item) => item.id === created.test.id);
  assert.equal(historyRecord.status, 'succeeded');
  assert.equal(Object.hasOwn(historyRecord, 'roomName'), false);
  assert.equal(Object.hasOwn(historyRecord, 'secondParticipantTokenHash'), false);
});

test('specialist schedules reserve overlapping slots atomically and appointments expire after 48 hours', async () => {
  const startingNow = new Date();
  appointmentNow = startingNow;
  const parent = await createApprovedParent('appointment-parent@harf.test');
  const otherParent = await createApprovedParent('appointment-other-parent@harf.test');
  const unrelatedParent = await createApprovedParent('appointment-unrelated-parent@harf.test');
  const child = await childService.createChild(parent.user._id, { displayName: 'طفل الأسرة' });
  const otherChild = await childService.createChild(otherParent.user._id, { displayName: 'طفل آخر' });
  const specialist = await createBookableSpecialist('appointment-specialist@harf.test');
  const unrelatedSpecialist = await createBookableSpecialist('appointment-unrelated-specialist@harf.test');
  const localDate = addLocalDays(localDateKey(startingNow, 'Africa/Cairo'), 3);
  const selectedDay = localDayOfWeek(localDate);
  const weeklySchedule = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    windows: dayOfWeek === selectedDay
      ? [{ start: '10:00', end: '12:00' }]
      : []
  }));
  const savedSchedule = await request('/specialist/availability', {
    method: 'PUT',
    cookie: specialist.cookie,
    csrfToken: specialist.csrfToken,
    body: {
      timeZone: 'Africa/Cairo',
      appointmentPriceMinor: 30000,
      appointmentCurrency: 'EGP',
      appointmentDurationMinutes: 30,
      weeklySchedule,
      exceptions: [
        { date: addLocalDays(localDate, 1), windows: [{ start: '13:00', end: '14:00' }] },
        { date: addLocalDays(localDate, 2), windows: [] }
      ]
    }
  });
  assert.equal(savedSchedule.status, 200);
  const start = localDateTimeToUtc(localDate, '10:00', 'Africa/Cairo');
  assert.ok(start);
  assert.equal(assertTimeZone('Not/AZone'), false);
  assert.equal(reservationKeys(start, 30).length, 2);

  const publicDirectory = await request('/directory/specialists');
  assert.equal((await publicDirectory.json()).specialists[0].appointmentAvailable, true);
  const availability = await request(`/directory/specialists/${specialist.user._id}/availability?from=${encodeURIComponent(start.toISOString())}&days=1`);
  const availabilityBody = await availability.json();
  assert.equal(availability.status, 200, JSON.stringify(availabilityBody));
  const offeredSlots = availabilityBody.availability.slots;
  assert.ok(offeredSlots.some((slot) => slot.startsAt === start.toISOString()));
  const overrideStart = localDateTimeToUtc(addLocalDays(localDate, 1), '13:00', 'Africa/Cairo');
  const overrideAvailability = await request(`/directory/specialists/${specialist.user._id}/availability?from=${encodeURIComponent(overrideStart.toISOString())}&days=1`);
  assert.ok((await overrideAvailability.json()).availability.slots.some((slot) => slot.startsAt === overrideStart.toISOString()));
  const blockedStart = localDateTimeToUtc(addLocalDays(localDate, 2), '10:00', 'Africa/Cairo');
  const blockedAvailability = await request(`/directory/specialists/${specialist.user._id}/availability?from=${encodeURIComponent(blockedStart.toISOString())}&days=1`);
  assert.equal((await blockedAvailability.json()).availability.slots.length, 0);

  const gameBeforeBooking = await request('/games/word-sounds', { cookie: parent.cookie });
  assert.equal(gameBeforeBooking.status, 403);
  assert.equal((await request('/appointments', { method: 'POST', cookie: parent.cookie, csrfToken: parent.csrfToken, body: {
    childId: otherChild.id, specialistId: specialist.user._id, startsAt: start.toISOString()
  } })).status, 404);
  const bookingBody = { childId: child.id, specialistId: specialist.user._id, startsAt: start.toISOString() };
  const concurrentBookings = await Promise.all([
    request('/appointments', { method: 'POST', cookie: parent.cookie, csrfToken: parent.csrfToken, body: bookingBody }),
    request('/appointments', { method: 'POST', cookie: otherParent.cookie, csrfToken: otherParent.csrfToken, body: {
      ...bookingBody,
      childId: otherChild.id
    } })
  ]);
  assert.deepEqual(concurrentBookings.map((response) => response.status).sort(), [201, 409]);
  const acceptedResponse = concurrentBookings.find((response) => response.status === 201);
  const booked = (await acceptedResponse.json()).appointment;
  assert.equal(booked.amountMinor, 30000);
  assert.equal(booked.durationMinutes, 30);
  assert.equal(booked.status, 'pending');
  assert.equal(new Date(booked.expiresAt).getTime() - new Date(booked.requestedAt).getTime(), 48 * 60 * 60 * 1000);
  const changedSchedule = await request('/specialist/availability', {
    method: 'PUT',
    cookie: specialist.cookie,
    csrfToken: specialist.csrfToken,
    body: {
      timeZone: 'Africa/Cairo',
      appointmentPriceMinor: 50000,
      appointmentCurrency: 'EGP',
      appointmentDurationMinutes: 45,
      weeklySchedule,
      exceptions: []
    }
  });
  assert.equal(changedSchedule.status, 200);
  const appointmentOwner = booked.childId === child.id ? parent : otherParent;
  const appointmentChildId = appointmentOwner === parent ? child.id : otherChild.id;
  const priceSnapshot = await request(`/appointments/${booked.id}`, { cookie: appointmentOwner.cookie });
  const bookedSnapshot = (await priceSnapshot.json()).appointment;
  assert.equal(bookedSnapshot.amountMinor, 30000);
  assert.equal(bookedSnapshot.durationMinutes, 30);
  assert.equal((await request(`/appointments/${booked.id}`, { cookie: unrelatedParent.cookie })).status, 404);
  assert.equal((await request(`/appointments/${booked.id}/video-access`, {
    method: 'POST',
    cookie: appointmentOwner.cookie,
    csrfToken: appointmentOwner.csrfToken
  })).status, 409);
  assert.equal((await request(`/appointments/${booked.id}/decision`, {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { decision: 'accepted' }
  })).status, 403);
  assert.equal((await request(`/directory/specialists/${specialist.user._id}/availability?from=${encodeURIComponent(start.toISOString())}&days=1`)
    .then((response) => response.json())).availability.slots
    .some((slot) => slot.startsAt === start.toISOString()), false);

  const specialistAppointments = await request('/appointments', { cookie: specialist.cookie });
  const pending = (await specialistAppointments.json()).appointments[0];
  assert.ok(['طفل الأسرة', 'طفل آخر'].includes(pending.childName));
  assert.equal(pending.parentName, 'Parent');
  const rejected = await request(`/appointments/${booked.id}/decision`, {
    method: 'POST',
    cookie: specialist.cookie,
    csrfToken: specialist.csrfToken,
    body: { decision: 'rejected', decisionNote: 'تعذر تأكيد الموعد' }
  });
  assert.equal((await rejected.json()).appointment.status, 'rejected');
  const rejectedVideo = await request(`/appointments/${booked.id}/video-access`, {
    method: 'POST',
    cookie: appointmentOwner.cookie,
    csrfToken: appointmentOwner.csrfToken
  });
  assert.equal(rejectedVideo.status, 409);
  assert.equal((await rejectedVideo.json()).error.code, 'APPOINTMENT_NOT_CONFIRMED');
  const released = await request(`/directory/specialists/${specialist.user._id}/availability?from=${encodeURIComponent(start.toISOString())}&days=1`);
  assert.ok((await released.json()).availability.slots.some((slot) => slot.startsAt === start.toISOString()));

  const sessionStart = localDateTimeToUtc(localDate, '10:30', 'Africa/Cairo');
  const sessionBooking = await request('/appointments', {
    method: 'POST',
    cookie: appointmentOwner.cookie,
    csrfToken: appointmentOwner.csrfToken,
    body: { childId: appointmentChildId, specialistId: specialist.user._id, startsAt: sessionStart.toISOString() }
  });
  const sessionAppointment = (await sessionBooking.json()).appointment;
  assert.equal(sessionAppointment.sessionStatus, 'not_started');
  const unconfiguredProvider = appointmentService.videoProviderService;
  const configuredProvider = new VideoProviderService({
    adapter: new JitsiIframeAdapter({ domain: 'meet.jit.si' }),
    now: () => appointmentNow
  });
  appointmentService.videoProviderService = configuredProvider;
  const confirmedSession = await request(`/appointments/${sessionAppointment.id}/decision`, {
    method: 'POST',
    cookie: specialist.cookie,
    csrfToken: specialist.csrfToken,
    body: { decision: 'accepted' }
  });
  const confirmedAppointment = (await confirmedSession.json()).appointment;
  assert.equal(confirmedAppointment.status, 'accepted');
  assert.equal(confirmedAppointment.meetingStatus, 'scheduled');
  assert.equal(confirmedAppointment.meetingAvailable, true);
  assert.equal(Object.hasOwn(confirmedAppointment, 'roomName'), false);
  const missingMeetingStart = localDateTimeToUtc(localDate, '11:15', 'Africa/Cairo');
  const missingMeetingBooking = await request('/appointments', {
    method: 'POST',
    cookie: appointmentOwner.cookie,
    csrfToken: appointmentOwner.csrfToken,
    body: { childId: appointmentChildId, specialistId: specialist.user._id, startsAt: missingMeetingStart.toISOString() }
  });
  const missingMeetingAppointment = (await missingMeetingBooking.json()).appointment;
  appointmentService.videoProviderService = unconfiguredProvider;
  const acceptedWithoutMeeting = await request(`/appointments/${missingMeetingAppointment.id}/decision`, {
    method: 'POST',
    cookie: specialist.cookie,
    csrfToken: specialist.csrfToken,
    body: { decision: 'accepted' }
  });
  assert.equal((await acceptedWithoutMeeting.json()).appointment.meetingAvailable, false);
  appointmentService.videoProviderService = configuredProvider;
  const adminSessionForMeetings = await authService.createSession(admin);
  const adminCookieForMeetings = `harf.sid=${adminSessionForMeetings.rawToken}`;
  const monitoredAppointments = await request('/admin/appointments?page=1&limit=20', {
    cookie: adminCookieForMeetings
  });
  assert.equal(monitoredAppointments.status, 200);
  const monitored = await monitoredAppointments.json();
  assert.ok(monitored.stats.total >= 2);
  const monitoredMissing = monitored.appointments.find(({ id }) => id === missingMeetingAppointment.id);
  assert.equal(monitoredMissing.meetingStatus, null);
  assert.equal(Object.hasOwn(monitoredMissing, 'roomName'), false);
  const retriedMeeting = await request(`/admin/appointments/${missingMeetingAppointment.id}/meeting/retry`, {
    method: 'POST',
    cookie: adminCookieForMeetings,
    csrfToken: adminSessionForMeetings.csrfToken
  });
  assert.equal(retriedMeeting.status, 201);
  assert.equal((await retriedMeeting.json()).meeting.meetingConfigured, true);
  assert.equal((await request(`/appointments/${missingMeetingAppointment.id}`, {
    cookie: adminCookieForMeetings
  })).status, 403);
  const notificationCountAfterApproval = storedNotifications.filter((item) => item.resourceId === sessionAppointment.id
    && item.type === 'appointment_decision').length;
  assert.equal(notificationCountAfterApproval, 2);
  const retriedApproval = await request(`/appointments/${sessionAppointment.id}/decision`, {
    method: 'POST',
    cookie: specialist.cookie,
    csrfToken: specialist.csrfToken,
    body: { decision: 'accepted' }
  });
  assert.equal(retriedApproval.status, 200);
  assert.equal(storedNotifications.filter((item) => item.resourceId === sessionAppointment.id
    && item.type === 'appointment_decision').length, notificationCountAfterApproval);
  const publicAppointment = (await (await request(`/appointments/${sessionAppointment.id}`, {
    cookie: appointmentOwner.cookie
  })).json()).appointment;
  assert.equal(Object.hasOwn(publicAppointment, 'meeting'), false);
  assert.equal(Object.hasOwn(publicAppointment, 'roomName'), false);
  assert.equal((await request(`/appointments/${sessionAppointment.id}/session/start`, {
    method: 'POST',
    cookie: appointmentOwner.cookie,
    csrfToken: appointmentOwner.csrfToken
  })).status, 403);
  assert.equal((await request(`/appointments/${sessionAppointment.id}/video-access`, {
    method: 'POST',
    cookie: unrelatedParent.cookie,
    csrfToken: unrelatedParent.csrfToken
  })).status, 404);
  assert.equal((await request(`/appointments/${sessionAppointment.id}`, {
    cookie: unrelatedSpecialist.cookie
  })).status, 404);
  assert.equal((await request(`/appointments/${sessionAppointment.id}/session/start`, {
    method: 'POST',
    cookie: unrelatedSpecialist.cookie,
    csrfToken: unrelatedSpecialist.csrfToken
  })).status, 404);
  appointmentNow = new Date(sessionStart.getTime() - 16 * 60 * 1000);
  const earlySpecialist = await request(`/appointments/${sessionAppointment.id}/video-access`, {
    method: 'POST',
    cookie: specialist.cookie,
    csrfToken: specialist.csrfToken
  });
  assert.equal(earlySpecialist.status, 409);
  assert.equal((await earlySpecialist.json()).error.code, 'MEETING_NOT_OPEN_YET');
  appointmentNow = new Date(sessionStart.getTime() - 11 * 60 * 1000);
  const earlyParent = await request(`/appointments/${sessionAppointment.id}/video-access`, {
    method: 'POST',
    cookie: appointmentOwner.cookie,
    csrfToken: appointmentOwner.csrfToken
  });
  assert.equal(earlyParent.status, 409);
  assert.equal((await earlyParent.json()).error.code, 'MEETING_NOT_OPEN_YET');
  appointmentNow = new Date(sessionStart.getTime() - 10 * 60 * 1000);
  const parentRoomAccess = await request(`/appointments/${sessionAppointment.id}/video-access`, {
    method: 'POST',
    cookie: appointmentOwner.cookie,
    csrfToken: appointmentOwner.csrfToken
  });
  const parentRoomPayload = await parentRoomAccess.json();
  assert.equal(parentRoomAccess.status, 200, JSON.stringify(parentRoomPayload));
  assert.equal(parentRoomAccess.headers.get('cache-control'), 'private, no-store');
  assert.equal(parentRoomPayload.access.domain, 'meet.jit.si');
  assert.equal(parentRoomPayload.access.roomName.length, 64);
  assert.equal(Object.hasOwn(parentRoomPayload.access, 'token'), false);
  const specialistRoomAccess = await request(`/appointments/${sessionAppointment.id}/video-access`, {
    method: 'POST',
    cookie: specialist.cookie,
    csrfToken: specialist.csrfToken
  });
  assert.equal((await specialistRoomAccess.json()).access.roomName, parentRoomPayload.access.roomName);
  appointmentNow = sessionStart;
  const startedSession = await request(`/appointments/${sessionAppointment.id}/session/start`, {
    method: 'POST',
    cookie: specialist.cookie,
    csrfToken: specialist.csrfToken
  });
  const startedAppointment = (await startedSession.json()).appointment;
  assert.equal(startedAppointment.sessionStatus, 'in_progress');
  assert.equal(new Date(startedAppointment.sessionStartedAt).getTime(), sessionStart.getTime());
  for (const participant of [appointmentOwner, specialist]) {
    const availableVideo = await request(`/appointments/${sessionAppointment.id}/video-access`, {
      method: 'POST',
      cookie: participant.cookie,
      csrfToken: participant.csrfToken
    });
    assert.equal(availableVideo.status, 200);
    assert.equal((await availableVideo.json()).access.roomName, parentRoomPayload.access.roomName);
  }
  appointmentNow = new Date(sessionStart.getTime() + 76 * 60 * 1000);
  const expiredWindowAccess = await request(`/appointments/${sessionAppointment.id}/video-access`, {
    method: 'POST',
    cookie: appointmentOwner.cookie,
    csrfToken: appointmentOwner.csrfToken
  });
  assert.equal(expiredWindowAccess.status, 409);
  assert.equal((await expiredWindowAccess.json()).error.code, 'MEETING_JOIN_WINDOW_CLOSED');
  appointmentNow = sessionStart;
  const administratorSession = await authService.createSession(admin);
  const adminAppointmentAccess = await request(`/appointments/${sessionAppointment.id}`, {
    cookie: `harf.sid=${administratorSession.rawToken}`
  });
  assert.equal(adminAppointmentAccess.status, 403);
  assert.equal((await request(`/appointments/${sessionAppointment.id}/video-access`, {
    method: 'POST',
    cookie: appointmentOwner.cookie
  })).status, 403);
  const reportBody = {
    privateNotes: 'ملاحظات مهنية خاصة بالأخصائي.',
    parentReport: {
      summary: 'تدرب الطفل على تمييز الأصوات من خلال نشاط تعليمي.',
      suggestedActivities: ['تكرار نشاط تمييز الأصوات']
    }
  };
  const consentRequired = await request(`/appointments/${sessionAppointment.id}/session/complete`, {
    method: 'POST',
    cookie: specialist.cookie,
    csrfToken: specialist.csrfToken,
    body: reportBody
  });
  assert.equal(consentRequired.status, 403, await consentRequired.text());
  await childService.recordConsent(appointmentOwner.user._id, appointmentChildId, {
    consentType: 'progress_reports',
    granted: true
  });
  const completedSession = await request(`/appointments/${sessionAppointment.id}/session/complete`, {
    method: 'POST',
    cookie: specialist.cookie,
    csrfToken: specialist.csrfToken,
    body: reportBody
  });
  const specialistSessionData = (await completedSession.json()).appointment;
  assert.equal(specialistSessionData.sessionStatus, 'completed');
  assert.equal(specialistSessionData.meetingStatus, 'ended');
  assert.equal(specialistSessionData.privateSpecialistNotes, 'ملاحظات مهنية خاصة بالأخصائي.');
  assert.equal(specialistSessionData.parentProgressReport.summary, 'تدرب الطفل على تمييز الأصوات من خلال نشاط تعليمي.');
  const parentSessionData = (await (await request(`/appointments/${sessionAppointment.id}`, {
    cookie: appointmentOwner.cookie
  })).json()).appointment;
  assert.equal(parentSessionData.sessionStatus, 'completed');
  assert.equal(new Date(parentSessionData.sessionEndedAt).getTime(), sessionStart.getTime());
  assert.equal(parentSessionData.parentProgressReport.summary, specialistSessionData.parentProgressReport.summary);
  assert.equal(Object.hasOwn(parentSessionData, 'privateSpecialistNotes'), false);
  await childService.recordConsent(appointmentOwner.user._id, appointmentChildId, {
    consentType: 'progress_reports',
    granted: false
  });
  const withdrawnReport = (await (await request(`/appointments/${sessionAppointment.id}`, {
    cookie: appointmentOwner.cookie
  })).json()).appointment;
  assert.equal(Object.hasOwn(withdrawnReport, 'parentProgressReport'), false);
  const endedAccess = await request(`/appointments/${sessionAppointment.id}/video-access`, {
    method: 'POST',
    cookie: appointmentOwner.cookie,
    csrfToken: appointmentOwner.csrfToken
  });
  assert.equal(endedAccess.status, 409);
  assert.equal((await endedAccess.json()).error.code, 'MEETING_NOT_AVAILABLE');

  const expiryStart = localDateTimeToUtc(addLocalDays(localDate, 7), '11:15', 'Africa/Cairo');
  const expiringResponse = await request('/appointments', {
    method: 'POST',
    cookie: appointmentOwner.cookie,
    csrfToken: appointmentOwner.csrfToken,
    body: { childId: appointmentChildId, specialistId: specialist.user._id, startsAt: expiryStart.toISOString() }
  });
  const expiringAppointment = (await expiringResponse.json()).appointment;
  appointmentNow = new Date(sessionStart.getTime() + 49 * 60 * 60 * 1000);
  const expiredRead = await request(`/appointments/${expiringAppointment.id}`, { cookie: appointmentOwner.cookie });
  assert.equal((await expiredRead.json()).appointment.status, 'expired');
  const availableAgain = await request(`/directory/specialists/${specialist.user._id}/availability?from=${encodeURIComponent(expiryStart.toISOString())}&days=1`);
  assert.ok((await availableAgain.json()).availability.slots.some((slot) => slot.startsAt === expiryStart.toISOString()));
  appointmentService.videoProviderService = unconfiguredProvider;
  const gameAfterBooking = await request('/games/word-sounds', { cookie: parent.cookie });
  assert.equal(gameAfterBooking.status, 403);
  for (const account of [parent.user, otherParent.user, unrelatedParent.user, specialist.user, unrelatedSpecialist.user]) {
    repository.users.delete(String(account._id));
  }
  for (const childId of [child.id, otherChild.id]) repository.children.delete(childId);
  repository.childConsents.splice(0, repository.childConsents.length, ...repository.childConsents
    .filter((consent) => ![child.id, otherChild.id].includes(String(consent.childId))));
  repository.specialistAvailabilities.delete(String(specialist.user._id));
  repository.specialistAvailabilities.delete(String(unrelatedSpecialist.user._id));
  repository.appointments.clear();
  appointmentNow = startingNow;
  assert.ok(Child.schema.indexes().some(([fields]) => fields.parentUserId === 1 && fields.status === 1));
  assert.ok(Child.schema.indexes().some(([fields]) => fields.parentUserId === 1 && fields._id === 1));
  assert.ok(ChildConsent.schema.indexes().some(([fields]) => fields.parentUserId === 1
    && fields.childId === 1
    && fields.consentType === 1
    && fields.createdAt === -1
    && fields._id === -1));
  assert.ok(GameAttempt.schema.indexes().some(([fields]) => fields.parentUserId === 1
    && fields.childId === 1
    && fields.completedAt === -1));
  assert.ok(GameAttempt.schema.indexes().some(([fields, options]) => fields.submissionId === 1
    && options.unique
    && options.name === 'game_attempt_submission_idempotency'));
  assert.ok(GameAnswerReceipt.schema.indexes().some(([fields, options]) => fields.submissionId === 1
    && fields.questionIndex === 1
    && options.unique
    && options.name === 'game_answer_receipt_session_question'));
  assert.ok(GameAnswerReceipt.schema.indexes().some(([fields, options]) => fields.expiresAt === 1
    && options.expireAfterSeconds === 0));
  assert.ok(GameDefinition.schema.indexes().some(([fields, options]) => fields.gameId === 1 && options.unique));
  assert.ok(GameVersion.schema.indexes().some(([fields, options]) => fields.gameId === 1 && fields.version === 1 && options.unique));
  assert.ok(GameSetting.schema.indexes().some(([fields, options]) => fields.key === 1 && options.unique));
  assert.ok(MediaAsset.schema.indexes().some(([fields]) => fields.kind === 1 && fields.active === 1));
  assert.ok(Subscription.schema.indexes().some(([fields]) => fields.parentUserId === 1 && fields.startsAt === -1));
  assert.ok(LearningPath.schema.indexes().some(([fields, options]) => fields.key === 1 && options.unique));
  assert.ok(LearningProgress.schema.indexes().some(([fields, options]) => fields.parentUserId === 1 && fields.childId === 1 && fields.pathKey === 1 && options.unique));
  assert.ok(repository.gameLibraryRepository);
});

test('registration rejects privilege fields and only creates pending parent/specialist accounts', async () => {
  const response = await registerAccount('parent', 'PARENT@Harf.Test');
  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.user.role, 'parent');
  assert.equal(payload.user.approvalStatus, 'pending');
  assert.equal(payload.user.emailVerified, false);
  assert.equal(Object.hasOwn(payload.user, 'passwordHash'), false);
  assert.equal(repository.users.get(payload.user.id).email, 'parent@harf.test');
  assert.equal(repository.users.get(payload.user.id).approvalStatus, 'pending');
  assert.match(cookieFrom(response), /^harf\.sid=/);
  const duplicate = await authService.register({
    role: 'parent',
    email: 'parent@harf.test',
    password: 'correct horse battery staple',
    displayName: 'Harf Test'
  });
  assert.equal(duplicate.user, null);
  assert.equal(duplicate.session, null);
});

test('specialist profile completeness rejects names corrupted to question marks', () => {
  assert.equal(isProfessionalProfileComplete({
    displayName: '????????',
    specialty: 'أخصائي تخاطب',
    credentials: 'مؤهلات مهنية',
    bio: 'نبذة مكتملة'
  }), false);
  assert.equal(isProfessionalProfileComplete({
    displayName: 'د. ?????',
    specialty: 'أخصائي تخاطب',
    credentials: 'مؤهلات مهنية',
    bio: 'نبذة مكتملة'
  }), false);
  assert.equal(isProfessionalProfileComplete({
    displayName: 'د. �حمد',
    specialty: 'أخصائي تخاطب',
    credentials: 'مؤهلات مهنية',
    bio: 'نبذة مكتملة'
  }), false);
  assert.equal(isProfessionalProfileComplete({
    displayName: 'د. مثال',
    specialty: 'أخصائي تخاطب',
    credentials: 'مؤهلات مهنية',
    bio: 'نبذة مكتملة'
  }), true);
});

test('verification is one-time and does not bypass administrator approval', async () => {
  const email = 'verify@harf.test';
  await registerAccount('parent', email);
  const verificationUrl = verificationEmails.at(-1).verificationUrl;
  const token = new URL(verificationUrl).searchParams.get('verify-email');
  const first = await request('/auth/email/verify', { method: 'POST', body: { token } });
  assert.equal(first.status, 200);
  const account = (await first.json()).user;
  assert.equal(account.emailVerified, true);
  assert.equal(account.approvalStatus, 'pending');
  const second = await request('/auth/email/verify', { method: 'POST', body: { token } });
  assert.equal(second.status, 400);
});

test('pending users cannot access admin APIs and cannot forge session CSRF state', async () => {
  const registered = await registerAccount('parent', 'pending@harf.test');
  const payload = await registered.json();
  const cookie = cookieFrom(registered);
  const session = await request('/auth/session', { cookie });
  const csrfToken = (await session.json()).csrfToken;

  const adminList = await request('/admin/accounts', { cookie, csrfToken });
  assert.equal(adminList.status, 403);

  const missingCsrf = await request('/auth/logout', { method: 'POST', cookie });
  assert.equal(missingCsrf.status, 403);
  const fakeCsrf = await request('/auth/logout', { method: 'POST', cookie, csrfToken: 'not-the-session-token' });
  assert.equal(fakeCsrf.status, 403);

  const account = repository.users.get(payload.user.id);
  assert.equal(account.approvalStatus, 'pending');
});

test('parent child profiles and consent history are isolated by owner and protected account state', async () => {
  const parent = await createApprovedParent('family-one@harf.test');
  const otherParent = await createApprovedParent('family-two@harf.test');

  const missingCsrf = await request('/children', {
    method: 'POST',
    cookie: parent.cookie,
    body: { displayName: 'No CSRF' }
  });
  assert.equal(missingCsrf.status, 403);
  assert.equal(repository.children.size, 0);

  const forgedCreate = await request('/children', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: {
      displayName: 'Forged owner',
      parentUserId: otherParent.user._id,
      status: 'archived'
    }
  });
  assert.equal(forgedCreate.status, 400);
  assert.equal(repository.children.size, 0);

  const created = await request('/children', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { displayName: 'سوسو', ageBand: '6-8', avatar: 'fox' }
  });
  assert.equal(created.status, 201);
  const { child } = await created.json();
  assert.equal(child.displayName, 'سوسو');
  assert.equal(child.ageBand, '6-8');
  assert.equal(child.avatar, 'fox');
  assert.equal(Object.hasOwn(child, 'parentUserId'), false);

  const invalidAvatar = await request('/children', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { displayName: 'Invalid avatar', avatar: 'https://example.invalid/image.png' }
  });
  assert.equal(invalidAvatar.status, 400);

  const ownList = await request('/children', { cookie: parent.cookie });
  assert.deepEqual((await ownList.json()).children.map((item) => item.id), [child.id]);
  const ownRead = await request(`/children/${child.id}`, { cookie: parent.cookie });
  assert.equal(ownRead.status, 200, JSON.stringify(await ownRead.json()));
  assert.deepEqual((await (await request('/children', { cookie: otherParent.cookie })).json()).children, []);

  const forgedOwnership = await request(`/children/${child.id}`, {
    method: 'PATCH',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { displayName: 'Changed', parentUserId: otherParent.user._id }
  });
  assert.equal(forgedOwnership.status, 400);
  assert.equal(repository.children.get(child.id).displayName, 'سوسو');

  const siblingRead = await request(`/children/${child.id}`, { cookie: otherParent.cookie });
  assert.equal(siblingRead.status, 404);
  const siblingUpdate = await request(`/children/${child.id}`, {
    method: 'PATCH',
    cookie: otherParent.cookie,
    csrfToken: otherParent.csrfToken,
    body: { displayName: 'Unauthorized' }
  });
  assert.equal(siblingUpdate.status, 404);
  assert.equal(repository.children.get(child.id).displayName, 'سوسو');

  const consent = await request(`/children/${child.id}/consents`, {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: {
      consentType: 'learning_data',
      granted: true
    }
  });
  assert.equal(consent.status, 201);
  assert.equal((await consent.json()).consent.policyVersion, 'harf-child-data-v1');
  const forgedPolicyVersion = await request(`/children/${child.id}/consents`, {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: {
      consentType: 'learning_data',
      granted: true,
      policyVersion: 'forged-policy-version'
    }
  });
  assert.equal(forgedPolicyVersion.status, 400);
  await request(`/children/${child.id}/consents`, {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: {
      consentType: 'learning_data',
      granted: false
    }
  });
  const ownConsents = await request(`/children/${child.id}/consents`, { cookie: parent.cookie });
  const consentList = (await ownConsents.json()).consents;
  assert.equal(consentList.find((item) => item.consentType === 'learning_data').granted, false);
  assert.equal(consentList.find((item) => item.consentType === 'progress_reports').granted, false);
  assert.equal(repository.childConsents.length, 2);

  const siblingConsentRead = await request(`/children/${child.id}/consents`, { cookie: otherParent.cookie });
  assert.equal(siblingConsentRead.status, 404);
  const siblingConsentWrite = await request(`/children/${child.id}/consents`, {
    method: 'POST',
    cookie: otherParent.cookie,
    csrfToken: otherParent.csrfToken,
    body: {
      consentType: 'progress_reports',
      granted: true
    }
  });
  assert.equal(siblingConsentWrite.status, 404);

  const updated = await request(`/children/${child.id}`, {
    method: 'PATCH',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { displayName: 'سوسو', status: 'archived' }
  });
  assert.equal((await updated.json()).child.status, 'archived');
  const reactivated = await request(`/children/${child.id}`, {
    method: 'PATCH',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { status: 'active' }
  });
  assert.equal((await reactivated.json()).child.status, 'active');

  const pending = await registerAccount('parent', 'pending-family@harf.test');
  assert.equal((await request('/children', { cookie: cookieFrom(pending) })).status, 403);
  assert.equal((await request('/children')).status, 401);

  const specialistCookie = await createApprovedSpecialist('specialist-family@harf.test');
  assert.equal((await request('/children', { cookie: specialistCookie })).status, 403);
  const adminSession = await authService.createSession(admin);
  assert.equal((await request('/children', {
    cookie: `harf.sid=${adminSession.rawToken}`
  })).status, 403);
  assert.equal((await request('/children/invalid-id', { cookie: parent.cookie })).status, 400);
});

test('games provide an anonymous trial and persist parent-owned child results only with consent', async () => {
  const catalogResponse = await request('/games');
  assert.equal(catalogResponse.status, 200);
  const games = (await catalogResponse.json()).games;
  assert.equal(games.length, 5);
  assert.equal(games.find((game) => game.id === 'matching-pairs').template, 'matching-pairs');
  assert.equal(games.find((game) => game.id === 'animal-sounds').template, 'audio-choice');
  assert.equal(games.filter((game) => game.access === 'trial').length, 1);
  assert.equal(Object.hasOwn(games[0], 'questions'), false);

  const trial = await request('/games/first-letter-trial');
  assert.equal(trial.status, 200);
  assert.equal((await trial.json()).game.questions.length, 3);
  const trialAnswer = await request('/games/first-letter-trial/answer', {
    method: 'POST',
    body: { questionIndex: 0, answerIndex: 0 }
  });

  assert.equal(trialAnswer.status, 200);
  assert.deepEqual((await trialAnswer.json()).answer, { correct: true });
  assert.equal(repository.gameAttempts.length, 0);
  assert.equal((await request('/games/word-sounds')).status, 401);
  assert.equal((await request('/games/word-sounds/answer', {
    method: 'POST',
    body: { questionIndex: 0, answerIndex: 0 }
  })).status, 401);
  assert.equal((await request('/games/not-a-game')).status, 404);
  assert.equal((await request('/games/first-letter-trial/answer', {
    method: 'POST',
    body: { questionIndex: 99, answerIndex: 0 }
  })).status, 400);

  const parent = await createApprovedParent('games-family@harf.test');
  const otherParent = await createApprovedParent('games-other-family@harf.test');
  await grantActiveSubscription(parent.user._id);
  await grantActiveSubscription(otherParent.user._id);
  const childResponse = await request('/children', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { displayName: 'نجم' }
  });
  const child = (await childResponse.json()).child;
  const otherChildResponse = await request('/children', {
    method: 'POST',
    cookie: otherParent.cookie,
    csrfToken: otherParent.csrfToken,
    body: { displayName: 'طفل آخر' }
  });
  const otherChild = (await otherChildResponse.json()).child;
  const parentAnswer = await request('/games/word-sounds/answer', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { childId: child.id, questionIndex: 0, answerIndex: 1 }
  });
  assert.equal(parentAnswer.status, 403);
  assert.equal(repository.gameAttempts.length, 0);
  const foreignChildAnswer = await request('/games/word-sounds/answer', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { childId: otherChild.id, questionIndex: 0, answerIndex: 1 }
  });
  assert.equal(foreignChildAnswer.status, 404);

  const noConsent = await request('/games/word-sounds/attempts', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { childId: child.id, answers: [0, 1, 2, 0], durationSeconds: 35 }
  });
  assert.equal(noConsent.status, 403);
  assert.equal(repository.gameAttempts.length, 0);

  const missingCsrf = await request('/games/word-sounds/attempts', {
    method: 'POST',
    cookie: parent.cookie,
    body: { childId: child.id, answers: [0, 1, 2, 0], durationSeconds: 35 }
  });
  assert.equal(missingCsrf.status, 403);

  await request(`/children/${child.id}/consents`, {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { consentType: 'learning_data', granted: true }
  });
  const consentedAnswer = await request('/games/word-sounds/answer', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: {
      childId: child.id,
      submissionId: '7998fb21-5214-4288-9d4c-59d55754c087',
      questionIndex: 0,
      answerIndex: 1
    }
  });
  assert.equal(consentedAnswer.status, 200);
  assert.deepEqual((await consentedAnswer.json()).answer, { correct: false });
  const adminSession = await authService.createSession(admin);
  const currentPath = await learningPathService.getAdminPath();
  const configuredPath = await request('/admin/learning-path', {
    method: 'PUT',
    cookie: `harf.sid=${adminSession.rawToken}`,
    csrfToken: adminSession.csrfToken,
    body: {
      ...currentPath.path,
      rules: { minimumAttempts: 2, sampleSize: 2, targetAccuracyPercent: 50 }
    }
  });
  assert.equal(configuredPath.status, 200);
  const lockedActivity = await request(`/games/word-match?childId=${child.id}`, { cookie: parent.cookie });
  assert.equal(lockedActivity.status, 409);
  const initialProgressResponse = await request(`/children/${child.id}/learning-progress`, { cookie: parent.cookie });
  const initialProgress = (await initialProgressResponse.json()).progress;
  assert.match(initialProgress.suggestedActivity.suggestionReason, /2 محاولات/);

  const submissionId = '401f6e5c-1d3f-4e56-8f12-89b25ab66703';
  const fabricatedAttempt = await request('/games/word-sounds/attempts', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: {
      childId: child.id,
      submissionId: '4a77e6aa-7700-4b54-a4b3-e7c3c4b95d10',
      answers: [0, 1, 2, 0],
      durationSeconds: 35
    }
  });
  assert.equal(fabricatedAttempt.status, 409);
  assert.equal((await fabricatedAttempt.json()).error.code, 'GAME_ANSWERS_INCOMPLETE');
  await recordGameAnswers({
    gameId: 'word-sounds',
    parent,
    childId: child.id,
    submissionId,
    answers: [0, 1, 0, 0]
  });
  const saved = await request('/games/word-sounds/attempts', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { childId: child.id, submissionId, answers: [9, 9, 9, 9], durationSeconds: 35 }
  });
  assert.equal(saved.status, 201);
  const attempt = (await saved.json()).attempt;
  assert.equal(attempt.correctCount, 3);
  assert.equal(attempt.totalQuestions, 4);
  assert.equal(attempt.childId, child.id);
  assert.equal(Object.hasOwn(attempt, 'answers'), false);
  assert.equal(Object.hasOwn(repository.gameAttempts[0], 'answers'), false);
  assert.equal([...repository.gameAnswerReceipts.values()]
    .some((receipt) => receipt.submissionId === submissionId), false);
  const retriedSave = await request('/games/word-sounds/attempts', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { childId: child.id, submissionId, durationSeconds: 35 }
  });
  assert.equal(retriedSave.status, 201);
  assert.equal((await retriedSave.json()).attempt.id, attempt.id);
  assert.equal(repository.gameAttempts.filter((item) => item.submissionId === submissionId).length, 1);

  const secondSubmissionId = '86651ccf-f7d8-4f3d-b8d6-7be6d928475f';
  await recordGameAnswers({
    gameId: 'word-sounds',
    parent,
    childId: child.id,
    submissionId: secondSubmissionId,
    answers: [0, 1, 2, 0]
  });
  const secondSaved = await request('/games/word-sounds/attempts', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { childId: child.id, submissionId: secondSubmissionId, durationSeconds: 42 }
  });
  assert.equal(secondSaved.status, 201);

  const progressResponse = await request(`/children/${child.id}/learning-progress`, { cookie: parent.cookie });
  assert.equal(progressResponse.status, 200);
  const progress = (await progressResponse.json()).progress;
  assert.equal(progress.activities[0].status, 'completed');
  assert.equal(progress.activities[1].status, 'available');
  assert.equal(progress.suggestedActivity.gameId, 'word-match');
  assert.match(progress.note, /ليست تشخيصًا/);

  const siblingProgress = await request(`/children/${child.id}/learning-progress`, { cookie: otherParent.cookie });
  assert.equal(siblingProgress.status, 404);
  const unlockedActivity = await request(`/games/word-match?childId=${child.id}`, { cookie: parent.cookie });
  assert.equal(unlockedActivity.status, 200);

  const history = await request(`/children/${child.id}/game-attempts?limit=1&page=1`, { cookie: parent.cookie });
  const historyPayload = await history.json();
  assert.equal(history.status, 200, JSON.stringify(historyPayload));
  assert.equal(historyPayload.attempts[0].id, (await secondSaved.json()).attempt.id);
  assert.equal(historyPayload.total, 2);
  assert.equal(historyPayload.hasMore, true);
  const secondPage = await request(`/children/${child.id}/game-attempts?limit=1&page=2`, { cookie: parent.cookie });
  assert.equal((await secondPage.json()).attempts[0].id, attempt.id);
  const filteredHistory = await request(`/children/${child.id}/game-attempts?gameId=word-match`, { cookie: parent.cookie });
  assert.equal((await filteredHistory.json()).total, 0);
  assert.equal((await request(`/children/${child.id}/game-attempts`, { cookie: otherParent.cookie })).status, 404);
  assert.equal((await request(`/children/${child.id}/game-attempts?limit=51`, { cookie: parent.cookie })).status, 400);

  const forgedCount = await request('/games/word-sounds/attempts', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { childId: child.id, answers: [0, 1, 2, 0], correctCount: 4, totalQuestions: 4, durationSeconds: 35 }
  });
  assert.equal(forgedCount.status, 400);

  const wrongAnswerCount = await request('/games/word-sounds/attempts', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { childId: child.id, answers: [0, 1], durationSeconds: 35 }
  });
  assert.equal(wrongAnswerCount.status, 400);

  const anonymousTrialAttempt = await request('/games/first-letter-trial/attempts', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { childId: child.id, answers: [0, 1, 2], durationSeconds: 25 }
  });
  assert.equal(anonymousTrialAttempt.status, 400);
  assert.equal(repository.gameAttempts.length, 2);

  await request(`/children/${child.id}/consents`, {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { consentType: 'learning_data', granted: false }
  });
  const withdrawnConsent = await request('/games/word-sounds/attempts', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { childId: child.id, answers: [0, 1, 2, 0], durationSeconds: 35 }
  });
  assert.equal(withdrawnConsent.status, 403);
  assert.equal(repository.gameAttempts.length, 2);
});

test('matching games do not count a matched target more than once', () => {
  const matchingGame = {
    template: 'matching-pairs',
    questions: [
      { options: ['قطة', 'كلب'], correctAnswerIndex: 0 },
      { options: ['قطة', 'سمكة'], correctAnswerIndex: 0 }
    ]
  };
  assert.equal(scoreGame(matchingGame, [0, 0]), 1);
});

test('annual subscription payments snapshot their price and grant twelve calendar months after admin approval', async () => {
  await repository.paymentRepository.clearSettings();
  await repository.paymentRepository.clearPaymentRequests();
  const parent = await createApprovedParent('annual-family@harf.test');
  const adminSession = await authService.createSession(admin);
  const adminCookie = `harf.sid=${adminSession.rawToken}`;
  const monthlyOnly = await request('/admin/subscription/settings', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken: adminSession.csrfToken,
    body: {
      amountMinor: 12500,
      currency: 'EGP',
      vodafoneCash: { enabled: true, recipient: '01000000000', instructions: 'حوّل المبلغ إلى الرقم.' },
      instaPay: { enabled: false, recipient: '', instructions: '' }
    }
  });
  assert.equal(monthlyOnly.status, 200);
  const unavailableAnnual = await submitPayment({
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    period: 'annual',
    transactionReference: 'ANNUAL-NOT-SET'
  });
  assert.equal(unavailableAnnual.status, 409);

  const configured = await request('/admin/subscription/settings', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken: adminSession.csrfToken,
    body: {
      amountMinor: 12500,
      annualAmountMinor: 120000,
      currency: 'EGP',
      vodafoneCash: { enabled: true, recipient: '01000000000', instructions: 'حوّل المبلغ إلى الرقم.' },
      instaPay: { enabled: false, recipient: '', instructions: '' }
    }
  });
  assert.equal(configured.status, 200);
  const plan = (await (await request('/payments/plan')).json()).plan;
  assert.equal(plan.amountMinor, 12500);
  assert.equal(plan.annualAmountMinor, 120000);

  const submitted = await submitPayment({
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    period: 'annual',
    transactionReference: 'ANNUAL-REF-1001'
  });
  assert.equal(submitted.status, 201);
  const payment = (await submitted.json()).payment;
  assert.equal(payment.period, 'annual');
  assert.equal(payment.amountMinor, 120000);

  const approved = await request(`/admin/payments/${payment.id}/review`, {
    method: 'POST',
    cookie: adminCookie,
    csrfToken: adminSession.csrfToken,
    body: { decision: 'approved' }
  });
  assert.equal(approved.status, 200);
  const { subscription } = await approved.json();
  assert.equal(subscription.period, 'annual');
  assert.equal(subscription.amountMinor, 120000);
  assert.ok(new Date(subscription.expiresAt).getTime() - new Date(subscription.startsAt).getTime() >= 364 * 86400000);
  assert.ok(new Date(subscription.expiresAt).getTime() - new Date(subscription.startsAt).getTime() <= 366 * 86400000);
});

test('parent testimonials stay private until admin approval and trigger scoped notifications', async () => {
  const parent = await createApprovedParent('testimonial-family@harf.test');
  const adminSession = await authService.createSession(admin);
  const adminCookie = `harf.sid=${adminSession.rawToken}`;
  const invalidSubmission = await request('/testimonials', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { quote: 'قصير' }
  });
  assert.equal(invalidSubmission.status, 400);
  const unauthorized = await request('/testimonials', {
    method: 'POST',
    body: { quote: 'تجربة جميلة ومفيدة لطفلي.' }
  });
  assert.equal(unauthorized.status, 401);

  const submitted = await request('/testimonials', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { quote: 'تجربة جميلة ومفيدة لطفلي.', displayName: 'أم يوسف' }
  });
  assert.equal(submitted.status, 201);
  const pendingTestimonial = (await submitted.json()).testimonial;
  assert.equal(pendingTestimonial.status, 'pending');
  assert.equal((await (await request('/testimonials')).json()).testimonials.length, 0);
  const duplicate = await request('/testimonials', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { quote: 'أرسل رأيًا ثانيًا وهو الأول قيد المراجعة.' }
  });
  assert.equal(duplicate.status, 409);

  const adminNotice = storedNotifications.find((item) => item.recipientUserId === String(admin._id)
    && item.type === 'testimonial_submitted'
    && String(item.resourceId) === pendingTestimonial.id);
  assert.ok(adminNotice);
  assert.equal(adminNotice.resourceType, 'testimonial');
  const adminQueue = await request('/admin/testimonials', { cookie: adminCookie });
  assert.equal(adminQueue.status, 200);
  assert.equal((await adminQueue.json()).testimonials[0].quote, 'تجربة جميلة ومفيدة لطفلي.');
  const forbiddenQueue = await request('/admin/testimonials', { cookie: parent.cookie });
  assert.equal(forbiddenQueue.status, 403);

  const approved = await request(`/admin/testimonials/${pendingTestimonial.id}/review`, {
    method: 'POST',
    cookie: adminCookie,
    csrfToken: adminSession.csrfToken,
    body: { decision: 'approved' }
  });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).testimonial.status, 'approved');
  const publicTestimonials = await request('/testimonials');
  assert.equal(publicTestimonials.status, 200);
  assert.deepEqual((await publicTestimonials.json()).testimonials.map(({ displayName, quote }) => ({ displayName, quote })), [{
    displayName: 'أم يوسف',
    quote: 'تجربة جميلة ومفيدة لطفلي.'
  }]);
  assert.ok(storedNotifications.some((item) => item.recipientUserId === String(parent.user._id)
    && item.type === 'testimonial_decision'
    && String(item.resourceId) === pendingTestimonial.id));

  const secondParent = await createApprovedParent('testimonial-family-rejected@harf.test');
  const secondSubmission = await request('/testimonials', {
    method: 'POST',
    cookie: secondParent.cookie,
    csrfToken: secondParent.csrfToken,
    body: { quote: 'رأي آخر ينتظر المراجعة.' }
  });
  const rejectedId = (await secondSubmission.json()).testimonial.id;
  const rejected = await request(`/admin/testimonials/${rejectedId}/review`, {
    method: 'POST',
    cookie: adminCookie,
    csrfToken: adminSession.csrfToken,
    body: { decision: 'rejected' }
  });
  assert.equal((await rejected.json()).testimonial.status, 'rejected');
  assert.equal((await (await request('/testimonials')).json()).testimonials.length, 1);
});

test('platform identity settings are public-read, administrator-write, and retain configured branding', async () => {
  const adminSession = await authService.createSession(admin);
  const adminCookie = `harf.sid=${adminSession.rawToken}`;
  const logoImageBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r4sAAAAASUVORK5CYII=',
    'base64'
  );
  const uploadedLogo = await uploadMedia({
    cookie: adminCookie,
    csrfToken: adminSession.csrfToken,
    displayName: 'شعار حرف الجديد',
    buffer: logoImageBuffer
  });
  assert.equal(uploadedLogo.status, 201);
  const logoAsset = (await uploadedLogo.json()).asset;
  const uploadedHeroImage = await uploadMedia({
    cookie: adminCookie,
    csrfToken: adminSession.csrfToken,
    displayName: 'صورة مقدمة الصفحة',
    altText: 'طفل يتعلم مع حروف ملونة',
    category: 'مقدمة',
    buffer: logoImageBuffer
  });
  assert.equal(uploadedHeroImage.status, 201);
  const heroImageAsset = (await uploadedHeroImage.json()).asset;
  const defaults = await request('/platform/settings');
  assert.equal(defaults.status, 200);
  const defaultPlatformSettings = (await defaults.json()).settings;
  assert.equal(defaultPlatformSettings.homepage.primaryAction, 'جرّب اللعبة المجانية');
  assert.equal(defaultPlatformSettings.colors.ink, '#273DA8');
  assert.equal(defaultPlatformSettings.colors.muted, '#7884B5');
  assert.equal(Object.hasOwn(defaultPlatformSettings, 'textColors'), false);

  const settings = {
    logoAssetId: null,
    heroImageAssetIds: [],
    colors: {
      primary: '#253B9A',
      teal: '#159A80',
      purple: '#7650D8',
      yellow: '#E8B343',
      coral: '#E76464',
      ink: '#253B9A',
      muted: '#6677AA'
    },
    homepage: {
      eyebrow: 'تعريف حرف المحدّث',
      title: 'نتعلّم معًا',
      description: 'محتوى تجريبي للصفحة الرئيسية.',
      primaryAction: 'ابدأ التجربة',
      secondaryAction: 'اكتشف المزيد'
    }
  };
  const legacyBrandSettings = {
    ...settings,
    colors: Object.fromEntries(
      Object.entries(settings.colors).filter(([name]) => name !== 'ink' && name !== 'muted')
    )
  };
  const legacyBrandUpdate = await request('/admin/platform-settings', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken: adminSession.csrfToken,
    body: legacyBrandSettings
  });
  assert.equal(legacyBrandUpdate.status, 200);
  assert.equal((await legacyBrandUpdate.json()).settings.colors.ink, '#273DA8');
  const unauthorized = await request('/admin/platform-settings', {
    method: 'PUT',
    cookie: '',
    body: settings
  });
  assert.equal(unauthorized.status, 401);
  const invalidLogo = await request('/admin/platform-settings', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken: adminSession.csrfToken,
    body: { ...settings, logoAssetId: '000000000000000000000099' }
  });
  assert.equal(invalidLogo.status, 400);
  const invalidHeroImage = await request('/admin/platform-settings', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken: adminSession.csrfToken,
    body: { ...settings, heroImageAssetIds: ['000000000000000000000099'] }
  });
  assert.equal(invalidHeroImage.status, 400);
  const removedTextColors = await request('/admin/platform-settings', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken: adminSession.csrfToken,
    body: { ...settings, textColors: { global: '#000000' } }
  });
  assert.equal(removedTextColors.status, 400);
  const updated = await request('/admin/platform-settings', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken: adminSession.csrfToken,
    body: { ...settings, logoAssetId: logoAsset.id, heroImageAssetIds: [heroImageAsset.id] }
  });
  assert.equal(updated.status, 200);
  const publicSettings = (await (await request('/platform/settings')).json()).settings;
  assert.equal(publicSettings.colors.primary, '#253B9A');
  assert.equal(publicSettings.colors.ink, '#253B9A');
  assert.equal(publicSettings.colors.muted, '#6677AA');
  assert.equal(Object.hasOwn(publicSettings, 'textColors'), false);
  assert.equal(publicSettings.homepage.title, 'نتعلّم معًا');
  assert.equal(publicSettings.logoUrl, `/api/v1/platform/logo/${logoAsset.id}`);
  assert.deepEqual(publicSettings.heroImages, [{
    id: heroImageAsset.id,
    url: `/api/v1/platform/hero-image/${heroImageAsset.id}`,
    altText: 'طفل يتعلم مع حروف ملونة',
    category: 'مقدمة'
  }]);
  const publicLogo = await request(`/platform/logo/${logoAsset.id}`);
  assert.equal(publicLogo.status, 200);
  assert.equal(publicLogo.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await publicLogo.arrayBuffer()), logoImageBuffer);
  const publicHeroImage = await request(`/platform/hero-image/${heroImageAsset.id}`);
  assert.equal(publicHeroImage.status, 200);
  assert.deepEqual(Buffer.from(await publicHeroImage.arrayBuffer()), logoImageBuffer);
  const unrelatedAsset = await uploadMedia({
    cookie: adminCookie,
    csrfToken: adminSession.csrfToken,
    displayName: 'صورة غير منشورة',
    buffer: logoImageBuffer
  });
  const unrelatedAssetId = (await unrelatedAsset.json()).asset.id;
  const unrelatedLogoRequest = await request(`/platform/logo/${unrelatedAssetId}`);
  assert.equal(unrelatedLogoRequest.status, 404);
  const unrelatedHeroImageRequest = await request(`/platform/hero-image/${unrelatedAssetId}`);
  assert.equal(unrelatedHeroImageRequest.status, 404);
});

test('manual subscriptions snapshot pricing and payment data, require admin review, and extend monthly history', async () => {
  await repository.paymentRepository.clearSettings();
  await repository.paymentRepository.clearPaymentRequests();
  const parent = await createApprovedParent('subscription-family@harf.test');
  const otherParent = await createApprovedParent('subscription-other@harf.test');
  const adminSession = await authService.createSession(admin);
  const adminCookie = `harf.sid=${adminSession.rawToken}`;
  const csrfToken = adminSession.csrfToken;
  const initialPlan = await request('/payments/plan');
  assert.equal((await initialPlan.json()).plan.configured, false);
  const subscriptionBefore = await request('/auth/subscription', { cookie: parent.cookie });
  assert.deepEqual((await subscriptionBefore.json()).subscription, {
    status: 'none',
    startsAt: null,
    expiresAt: null
  });
  assert.equal((await request('/games/word-sounds', { cookie: parent.cookie })).status, 403);
  assert.equal((await request('/games/first-letter-trial')).status, 200);

  const settings = {
    amountMinor: 12500,
    currency: 'EGP',
    vodafoneCash: { enabled: true, recipient: '01000000000', instructions: 'حوّل المبلغ إلى الرقم ثم أدخل مرجع العملية.' },
    instaPay: { enabled: true, recipient: 'harf@example', instructions: 'حوّل المبلغ عبر InstaPay ثم أدخل مرجع العملية.' }
  };
  const configured = await request('/admin/subscription/settings', {
    method: 'PUT', cookie: adminCookie, csrfToken, body: settings
  });
  assert.equal(configured.status, 200);
  const publicPlan = (await (await request('/payments/plan')).json()).plan;
  assert.equal(publicPlan.amountMinor, 12500);
  assert.equal(publicPlan.methods.vodafone_cash.recipient, '01000000000');
  assert.equal((await request('/admin/payments', { cookie: parent.cookie, csrfToken: parent.csrfToken })).status, 403);

  const paymentImage = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r4sAAAAASUVORK5CYII=',
    'base64'
  );
  const submitted = await submitPayment({
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    method: 'vodafone_cash',
    transactionReference: 'VODA-REF-1001',
    receiptBuffer: paymentImage
  });
  assert.equal(submitted.status, 201);
  const firstPayment = (await submitted.json()).payment;
  assert.equal(firstPayment.amountMinor, 12500);
  assert.equal(firstPayment.currency, 'EGP');
  assert.equal(firstPayment.status, 'pending');
  assert.equal(firstPayment.receiptAvailable, true);
  assert.equal((await request('/games/word-sounds', { cookie: parent.cookie })).status, 403);
  assert.equal((await request('/children/000000000000000000000001/learning-progress', { cookie: parent.cookie })).status, 404);
  assert.equal((await request(firstPayment.receiptUrl, { cookie: otherParent.cookie })).status, 404);
  const parentPayments = (await (await request('/payments', { cookie: parent.cookie })).json()).payments;
  assert.equal(parentPayments.length, 1);
  const adminPayments = (await (await request('/admin/payments', { cookie: adminCookie, csrfToken })).json()).payments;
  assert.equal(adminPayments.length, 1);
  assert.equal(adminPayments[0].parentUserId, String(parent.user._id));
  assert.equal((await request(`/admin/payments/${firstPayment.id}/receipt`, { cookie: adminCookie, csrfToken })).status, 200);
  assert.equal((await request(`/admin/payments/${firstPayment.id}/review`, {
    method: 'POST', cookie: parent.cookie, csrfToken: parent.csrfToken,
    body: { decision: 'approved' }
  })).status, 403);

  await request('/admin/subscription/settings', {
    method: 'PUT', cookie: adminCookie, csrfToken,
    body: { ...settings, amountMinor: 19900 }
  });
  assert.equal(repository.paymentRequests.get(firstPayment.id).amountMinor, 12500);
  const approved = await request(`/admin/payments/${firstPayment.id}/review`, {
    method: 'POST',
    cookie: adminCookie,
    csrfToken,
    body: { decision: 'approved', decisionNote: 'تم التحقق يدويًا من التحويل' }
  });
  assert.equal(approved.status, 200);
  const firstSubscription = (await approved.json()).subscription;
  assert.equal(firstSubscription.status, 'active');
  assert.equal(firstSubscription.amountMinor, 12500);
  assert.equal(firstSubscription.paymentMethod, 'vodafone_cash');
  assert.equal((await request('/games/word-sounds', { cookie: parent.cookie })).status, 200);
  assert.equal((await request('/auth/subscription', { cookie: parent.cookie }).then((response) => response.json())).history.length, 1);
  assert.equal((await request(`/admin/payments/${firstPayment.id}/review`, {
    method: 'POST', cookie: adminCookie, csrfToken, body: { decision: 'approved' }
  })).status, 409);

  const renewal = await submitPayment({
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    method: 'instapay',
    transactionReference: 'INSTA-REF-1002'
  });
  assert.equal(renewal.status, 201);
  const secondPayment = (await renewal.json()).payment;
  assert.equal(secondPayment.amountMinor, 19900);
  const renewed = await request(`/admin/payments/${secondPayment.id}/review`, {
    method: 'POST', cookie: adminCookie, csrfToken, body: { decision: 'approved' }
  });
  assert.equal(renewed.status, 200);
  const secondSubscription = (await renewed.json()).subscription;
  assert.equal(new Date(secondSubscription.startsAt).getTime(), new Date(firstSubscription.expiresAt).getTime());
  assert.equal(secondSubscription.amountMinor, 19900);
  const billing = await request('/auth/subscription', { cookie: parent.cookie }).then((response) => response.json());
  assert.equal(billing.history.length, 2);
  assert.equal(billing.payments.length, 2);
  assert.equal(billing.payments[0].amountMinor, 19900);

  const parentPathChange = await request('/admin/learning-path', {
    method: 'PUT',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: await learningPathService.getAdminPath().then(({ path }) => path)
  });
  assert.equal(parentPathChange.status, 403);

  const rejectedPaymentResponse = await submitPayment({
    cookie: otherParent.cookie,
    csrfToken: otherParent.csrfToken,
    method: 'instapay',
    transactionReference: 'INSTA-REF-REJECT'
  });
  const rejectedPayment = (await rejectedPaymentResponse.json()).payment;
  const rejected = await request(`/admin/payments/${rejectedPayment.id}/review`, {
    method: 'POST', cookie: adminCookie, csrfToken,
    body: { decision: 'rejected', decisionNote: 'مرجع العملية غير مطابق' }
  });
  assert.equal(rejected.status, 200);
  assert.equal((await request('/games/word-sounds', { cookie: otherParent.cookie })).status, 403);
  assert.equal((await request('/admin/payments', { cookie: adminCookie, csrfToken }).then((response) => response.json())).payments.length, 3);

  const expiredParent = await createApprovedParent('expired-subscription@harf.test');
  await repository.subscriptionRepository.createSubscription({
    parentUserId: expiredParent.user._id,
    startsAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    grantedDays: 2,
    grantedBy: admin._id,
    source: 'administrator',
    reason: 'سجل منتهي لاختبار الحالة'
  });
  assert.equal((await request('/auth/subscription', { cookie: expiredParent.cookie })).status, 200);
  assert.equal((await (await request('/auth/subscription', { cookie: expiredParent.cookie })).json()).subscription.status, 'expired');
  assert.equal((await request('/games/word-sounds', { cookie: expiredParent.cookie })).status, 403);
});

test('administrator reports and exports are role-restricted and notifications are recipient-isolated', async () => {
  storedNotifications.length = 0;
  const parent = await createApprovedParent('report-parent@harf.test');
  const otherParent = await createApprovedParent('report-other-parent@harf.test');
  const parentNotification = await notificationService.notify(parent.user._id, {
    type: 'payment_review',
    title: 'تحديث الدفع',
    message: 'تمت مراجعة طلب الدفع.',
    resourceType: 'payment',
    resourceId: '000000000000000000000001'
  });
  await notificationService.notify(otherParent.user._id, {
    type: 'payment_review',
    title: 'إشعار خاص',
    message: 'إشعار مستخدم آخر.',
    resourceType: 'payment',
    resourceId: '000000000000000000000002'
  });

  const ownNotifications = await request('/notifications', { cookie: parent.cookie });
  assert.equal(ownNotifications.status, 200);
  const ownPayload = await ownNotifications.json();
  assert.equal(ownPayload.notifications.length, 1);
  assert.equal(ownPayload.notifications[0].id, parentNotification.id);
  assert.equal('recipientUserId' in ownPayload.notifications[0], false);
  assert.equal((await request(`/notifications/${parentNotification.id}/read`, {
    method: 'POST',
    cookie: otherParent.cookie,
    csrfToken: otherParent.csrfToken
  })).status, 404);
  assert.equal((await request(`/notifications/${parentNotification.id}/read`, {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken
  })).status, 200);

  assert.equal((await request('/admin/reports', { cookie: parent.cookie })).status, 403);
  assert.equal((await request('/admin/reports/export.csv', { cookie: parent.cookie })).status, 403);

  const adminSession = await authService.createSession(admin);
  const adminCookie = `harf.sid=${adminSession.rawToken}`;
  const pendingAccount = await repository.createUser({
    email: 'phase10-pending@harf.test',
    passwordHash: await hashPassword('pending parent account password'),
    role: 'parent',
    emailVerifiedAt: new Date(),
    approvalStatus: 'pending',
    accountStatus: 'active',
    parentProfile: { displayName: 'Pending Parent' }
  });
  const approvalResponse = await request(`/admin/accounts/${pendingAccount._id}/approval`, {
    method: 'PATCH',
    cookie: adminCookie,
    csrfToken: adminSession.csrfToken,
    body: { approvalStatus: 'approved' }
  });
  assert.equal(approvalResponse.status, 200);
  assert.equal((await notificationService.list(pendingAccount._id)).some(({ type }) => type === 'account_approval'), true);

  const reportResponse = await request('/admin/reports?from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-31T23%3A59%3A59.999Z', {
    cookie: adminCookie
  });
  assert.equal(reportResponse.status, 200);
  assert.equal(typeof (await reportResponse.json()).payments.confirmedAmountMinor, 'number');

  const exportResponse = await request('/admin/reports/export.csv', { cookie: adminCookie });
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get('content-disposition'), /harf-admin-report\.csv/);
  assert.match(exportResponse.headers.get('cache-control'), /private, no-store/);
  assert.match(await exportResponse.text(), /administrator_approved/);
  assert.equal((await request('/admin/reports?from=2025-01-01T00%3A00%3A00.000Z&to=2026-02-01T00%3A00%3A00.000Z', {
    cookie: adminCookie
  })).status, 400);
});

test('administrator game library verifies uploads and publishes immutable game versions', async () => {
  const adminSession = await authService.createSession(admin);
  const adminCookie = `harf.sid=${adminSession.rawToken}`;
  const csrfToken = adminSession.csrfToken;
  assert.equal((await request('/admin/games')).status, 401);
  assert.equal((await replaceMedia({
    cookie: '',
    csrfToken: '',
    assetId: '000000000000000000000001',
    buffer: Buffer.from('not-an-image')
  })).status, 401);

  const initialLibraryResponse = await request('/admin/games', {
    cookie: adminCookie,
    csrfToken
  });
  assert.equal(initialLibraryResponse.status, 200);
  assert.equal((await initialLibraryResponse.json()).trialGameId, 'first-letter-trial');
  const nonAdmin = await createApprovedParent('game-library-forbidden@harf.test');
  assert.equal((await request('/admin/games', { cookie: nonAdmin.cookie, csrfToken: nonAdmin.csrfToken })).status, 403);

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r4sAAAAASUVORK5CYII=',
    'base64'
  );
  const mp3 = Buffer.alloc(417);
  mp3.set([0xff, 0xfb, 0x90, 0x64]);
  const uploaded = await uploadMedia({
    cookie: adminCookie,
    csrfToken,
    displayName: 'صورة السلحفاة',
    altText: 'سلحفاة خضراء',
    category: 'حيوانات',
    tags: 'سلحفاة, حيوان',
    fileName: 'misleading.pdf',
    mimeType: 'application/pdf',
    buffer: png
  });
  assert.equal(uploaded.status, 201);
  const asset = (await uploaded.json()).asset;
  assert.equal(asset.kind, 'image');
  assert.equal(asset.mimeType, 'image/png');
  assert.equal(asset.active, true);
  assert.equal(asset.altText, 'سلحفاة خضراء');
  assert.equal(asset.category, 'حيوانات');
  assert.deepEqual(asset.tags, ['سلحفاة', 'حيوان']);
  assert.equal(asset.width, 1);
  assert.equal(asset.height, 1);
  const secondImageResponse = await uploadMedia({
    cookie: adminCookie,
    csrfToken,
    displayName: 'صورة القطة',
    altText: 'قطة',
    fileName: 'cat.png',
    mimeType: 'image/png',
    buffer: png
  });
  assert.equal(secondImageResponse.status, 201);
  const secondImageAsset = (await secondImageResponse.json()).asset;

  const unsupportedUpload = await uploadMedia({
    cookie: adminCookie,
    csrfToken,
    fileName: 'vector.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  });
  assert.equal(unsupportedUpload.status, 400);
  const invalidAnimation = await uploadMedia({
    cookie: adminCookie,
    csrfToken,
    kind: 'animation',
    fileName: 'not-animation.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"layers":[],"v":"test"}')
  });
  assert.equal(invalidAnimation.status, 400);
  const expressionAnimation = await uploadMedia({
    cookie: adminCookie,
    csrfToken,
    kind: 'animation',
    fileName: 'expression.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"v":"5.7.4","fr":30,"ip":0,"op":60,"w":100,"h":100,"layers":[{"x":"unsafe"}]}')
  });
  assert.equal(expressionAnimation.status, 400);
  const uploadedAnimation = await uploadMedia({
    cookie: adminCookie,
    csrfToken,
    displayName: 'حركة آمنة',
    kind: 'animation',
    fileName: 'companion.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"v":"5.7.4","fr":30,"ip":0,"op":60,"w":100,"h":100,"layers":[]}')
  });
  assert.equal(uploadedAnimation.status, 201);
  const animationAsset = (await uploadedAnimation.json()).asset;
  assert.equal(animationAsset.mimeType, 'application/json');
  const mascotVideoBuffer = await readFile(new URL('../../../Branding/Character/Videos/Winnig.mp4', import.meta.url));
  const uploadedMascotVideo = await uploadMedia({
    cookie: adminCookie,
    csrfToken,
    displayName: 'فيديو تشجيع حرف',
    kind: 'video',
    fileName: 'mascot.mp4',
    mimeType: 'video/mp4',
    buffer: mascotVideoBuffer
  });
  assert.equal(uploadedMascotVideo.status, 201);
  const mascotVideoAsset = (await uploadedMascotVideo.json()).asset;
  assert.equal(mascotVideoAsset.kind, 'video');
  assert.equal(mascotVideoAsset.mimeType, 'video/mp4');

  const gameContent = {
    title: 'لعبة تجريب المحتوى',
    description: 'نشاط لإدارة المحتوى من لوحة الإدارة.',
    companion: 'لولو',
    companionAnimal: '🐢',
    instructions: 'اختر الإجابة المناسبة.',
    template: 'matching-pairs',
    questions: [{
      prompt: 'اختر حرف الباء',
      options: ['ب', 'ت'],
      correctAnswerIndex: 0,
      promptImageAssetId: asset.id,
      optionImageAssetIds: [asset.id, asset.id]
    }],
    assetAssignments: [
      { event: 'welcome', kind: 'image', assetId: asset.id },
      { event: 'welcome', kind: 'animation', assetId: animationAsset.id },
      { event: 'result-success', kind: 'video', assetId: mascotVideoAsset.id }
    ]
  };
  const invalidDelimitedContent = await request('/admin/games', {
    method: 'POST',
    cookie: adminCookie,
    csrfToken,
    body: {
      gameId: 'invalid-delimited-game',
      content: { ...gameContent, questions: [{ ...gameContent.questions[0], prompt: 'حرف | الباء' }] }
    }
  });
  assert.equal(invalidDelimitedContent.status, 400);
  const createdGame = await request('/admin/games', {
    method: 'POST',
    cookie: adminCookie,
    csrfToken,
    body: { gameId: 'managed-content-test', content: gameContent }
  });
  assert.equal(createdGame.status, 201, await createdGame.text());
  const forbiddenAssetEdit = await request(`/admin/assets/${asset.id}`, {
    method: 'PATCH',
    cookie: nonAdmin.cookie,
    csrfToken: nonAdmin.csrfToken,
    body: { altText: 'تغيير غير مصرح' }
  });
  assert.equal(forbiddenAssetEdit.status, 403);
  const deleteDraftAssigned = await request(`/admin/assets/${asset.id}`, {
    method: 'DELETE',
    cookie: adminCookie,
    csrfToken
  });
  assert.equal(deleteDraftAssigned.status, 409);

  const unpublishedAccess = await request('/games/managed-content-test');
  assert.equal(unpublishedAccess.status, 404);
  const published = await request('/admin/games/managed-content-test/publish', {
    method: 'POST',
    cookie: adminCookie,
    csrfToken
  });
  assert.equal(published.status, 200);
  const publishedGame = (await published.json()).game;
  assert.equal(publishedGame.publishedVersion, 1);

  const privateGame = await request('/games/managed-content-test');
  assert.equal(privateGame.status, 401);
  const selectedTrial = await request('/admin/games/trial', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken,
    body: { gameId: 'managed-content-test' }
  });
  assert.equal(selectedTrial.status, 200);
  const publicCatalog = await request('/games');
  const managedCatalogEntry = (await publicCatalog.json()).games.find((game) => game.id === 'managed-content-test');
  assert.equal(managedCatalogEntry.access, 'trial');

  const playable = await request('/games/managed-content-test');
  assert.equal(playable.status, 200);
  const playablePayload = (await playable.json()).game;
  assert.equal(playablePayload.questions.length, 1);
  assert.equal(Object.hasOwn(playablePayload.questions[0], 'correctAnswerIndex'), false);
  assert.equal(playablePayload.questions[0].promptImageUrl, `/api/v1/media/${asset.id}`);
  assert.deepEqual(playablePayload.questions[0].optionImageUrls, [
    `/api/v1/media/${asset.id}`,
    `/api/v1/media/${asset.id}`
  ]);
  assert.equal(playablePayload.questions[0].promptImageAlt, 'سلحفاة خضراء');
  assert.equal(playablePayload.assets.welcome.imageUrl, `/api/v1/media/${asset.id}`);
  assert.equal(playablePayload.assets.welcome.animationJsonAvailable, true);
  assert.equal(playablePayload.assets['result-success'].videoUrl, `/api/v1/media/${mascotVideoAsset.id}`);
  const pictureMatchingContent = {
    template: 'picture-matching',
    title: 'وصّل الصورة بمثيلتها',
    description: 'نشاط لمطابقة الصور.',
    companion: 'لولو',
    companionAnimal: '🐢',
    instructions: 'اختر الصورة المطابقة لكل صورة.',
    questions: [],
    pairs: [
      { id: 'cat-pair', label: 'قطة', imageAssetId: secondImageAsset.id },
      { id: 'turtle-pair', label: 'سلحفاة', imageAssetId: asset.id }
    ],
    difficulty: 'beginner',
    assetAssignments: []
  };
  const duplicatePicturePairs = await request('/admin/games', {
    method: 'POST',
    cookie: adminCookie,
    csrfToken,
    body: {
      gameId: 'picture-matching-invalid',
      content: {
        ...pictureMatchingContent,
        pairs: pictureMatchingContent.pairs.map((pair) => ({ ...pair, imageAssetId: asset.id }))
      }
    }
  });
  assert.equal(duplicatePicturePairs.status, 400);
  const delimitedPictureLabel = await request('/admin/games', {
    method: 'POST',
    cookie: adminCookie,
    csrfToken,
    body: {
      gameId: 'picture-matching-delimited',
      content: {
        ...pictureMatchingContent,
        pairs: [{ ...pictureMatchingContent.pairs[0], label: 'قطة | حيوان' }, pictureMatchingContent.pairs[1]]
      }
    }
  });
  assert.equal(delimitedPictureLabel.status, 400);
  const createdPictureMatching = await request('/admin/games', {
    method: 'POST',
    cookie: adminCookie,
    csrfToken,
    body: { gameId: 'picture-matching-test', content: pictureMatchingContent }
  });
  const createdPictureMatchingPayload = await createdPictureMatching.json();
  assert.equal(createdPictureMatching.status, 201, JSON.stringify(createdPictureMatchingPayload));
  assert.equal(createdPictureMatchingPayload.game.draftContent.questions.length, 2);
  const publishedPictureMatching = await request('/admin/games/picture-matching-test/publish', {
    method: 'POST',
    cookie: adminCookie,
    csrfToken
  });
  assert.equal(publishedPictureMatching.status, 200);
  const selectPictureMatchingTrial = await request('/admin/games/trial', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken,
    body: { gameId: 'picture-matching-test' }
  });
  assert.equal(selectPictureMatchingTrial.status, 200);
  const pictureMatchingPlayableResponse = await request('/games/picture-matching-test');
  assert.equal(pictureMatchingPlayableResponse.status, 200);
  const pictureMatchingPlayable = await pictureMatchingPlayableResponse.json();
  assert.equal(pictureMatchingPlayable.game.template, 'picture-matching');
  assert.equal(pictureMatchingPlayable.game.questions.length, 2);
  assert.equal(Object.hasOwn(pictureMatchingPlayable.game.questions[0], 'correctAnswerIndex'), false);
  assert.deepEqual(pictureMatchingPlayable.game.questions.map((question) => question.options), [
    ['قطة', 'سلحفاة'],
    ['قطة', 'سلحفاة']
  ]);
  assert.deepEqual(pictureMatchingPlayable.game.questions.map((question) => question.promptImageUrl), [
    `/api/v1/media/${secondImageAsset.id}`,
    `/api/v1/media/${asset.id}`
  ]);
  assert.deepEqual(pictureMatchingPlayable.game.questions[0].optionImageUrls, [
    `/api/v1/media/${secondImageAsset.id}`,
    `/api/v1/media/${asset.id}`
  ]);
  assert.deepEqual((await (await request('/games/picture-matching-test/answer', {
    method: 'POST',
    body: { questionIndex: 0, answerIndex: 0, gameVersion: '1' }
  })).json()).answer, { correct: true });
  assert.deepEqual((await (await request('/games/picture-matching-test/answer', {
    method: 'POST',
    body: { questionIndex: 0, answerIndex: 1, gameVersion: '1' }
  })).json()).answer, { correct: false });
  const restoreTrialGame = await request('/admin/games/trial', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken,
    body: { gameId: 'managed-content-test' }
  });
  assert.equal(restoreTrialGame.status, 200);
  const publicAsset = await request(`/media/${asset.id}`);
  assert.equal(publicAsset.status, 200);
  assert.equal(publicAsset.headers.get('content-type'), 'image/png');
  assert.equal(publicAsset.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await publicAsset.arrayBuffer()), png);
  const publicMascotVideo = await request(`/media/${mascotVideoAsset.id}`);
  assert.equal(publicMascotVideo.status, 200);
  assert.equal(publicMascotVideo.headers.get('content-type'), 'video/mp4');
  assert.equal(Buffer.from(await publicMascotVideo.arrayBuffer()).length, mascotVideoBuffer.length);
  const lottiePreview = await request(`/admin/assets/${animationAsset.id}/preview`, {
    cookie: adminCookie,
    csrfToken
  });
  assert.equal(lottiePreview.status, 200);
  assert.equal(lottiePreview.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await lottiePreview.text(), /"layers":\[\]/);
  const assetListResponse = await request('/admin/assets', { cookie: adminCookie, csrfToken });
  const listedAsset = (await assetListResponse.json()).assets.find(({ id }) => id === asset.id);
  assert.ok(listedAsset.usage.some((usage) => usage.source === 'مسودة' && usage.location.includes('صورة')));
  assert.ok(listedAsset.usage.some((usage) => usage.source === 'نسخة منشورة' && usage.version === 1));
  const invalidReplacement = await replaceMedia({
    cookie: adminCookie,
    csrfToken,
    assetId: asset.id,
    fileName: 'invalid.png',
    buffer: Buffer.from('not an image')
  });
  assert.equal(invalidReplacement.status, 400);
  const replacement = await replaceMedia({ cookie: adminCookie, csrfToken, assetId: asset.id, buffer: png });
  assert.equal(replacement.status, 200);
  const replacementAsset = (await replacement.json()).asset;
  assert.notEqual(replacementAsset.id, asset.id);
  assert.equal((await (await request('/games/managed-content-test')).json()).game.questions[0].promptImageUrl,
    `/api/v1/media/${asset.id}`);
  assert.equal((await (await request('/admin/games', { cookie: adminCookie, csrfToken })).json())
    .games.find(({ gameId }) => gameId === 'managed-content-test').draftContent.questions[0].promptImageAssetId,
  replacementAsset.id);

  const editedContent = {
    ...gameContent,
    title: 'نسخة محتوى جديدة',
    assetAssignments: gameContent.assetAssignments.map((assignment) => assignment.assetId === asset.id
      ? { ...assignment, assetId: replacementAsset.id }
      : assignment),
    questions: [{
      ...gameContent.questions[0],
      promptImageAssetId: replacementAsset.id,
      optionImageAssetIds: [replacementAsset.id, replacementAsset.id],
      correctAnswerIndex: 1
    }]
  };
  const savedDraft = await request('/admin/games/managed-content-test', {
    method: 'PATCH',
    cookie: adminCookie,
    csrfToken,
    body: { content: editedContent }
  });
  assert.equal(savedDraft.status, 200);
  assert.equal((await (await request('/games/managed-content-test')).json()).game.title, gameContent.title);
  const republished = await request('/admin/games/managed-content-test/publish', {
    method: 'POST',
    cookie: adminCookie,
    csrfToken
  });
  assert.equal(republished.status, 200);
  assert.equal((await (await request('/games/managed-content-test')).json()).game.title, editedContent.title);
  assert.equal((await request(`/media/${asset.id}`)).status, 200);
  assert.ok(repository.gameVersions.has('managed-content-test:1'));
  assert.ok(repository.gameVersions.has('managed-content-test:2'));

  const oldAnswer = await request('/games/managed-content-test/answer', {
    method: 'POST',
    body: { questionIndex: 0, answerIndex: 0, gameVersion: '1' }
  });
  assert.deepEqual((await oldAnswer.json()).answer, { correct: true });
  const newAnswer = await request('/games/managed-content-test/answer', {
    method: 'POST',
    body: { questionIndex: 0, answerIndex: 0, gameVersion: '2' }
  });
  assert.deepEqual((await newAnswer.json()).answer, { correct: false });

  const parent = await createApprovedParent('managed-game-history@harf.test');
  await grantActiveSubscription(parent.user._id);
  const childResponse = await request('/children', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { displayName: 'نجم محفوظ' }
  });
  const child = (await childResponse.json()).child;
  await request(`/children/${child.id}/consents`, {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: { consentType: 'learning_data', granted: true }
  });
  const unpublishTrial = await request('/admin/games/managed-content-test/unpublish', {
    method: 'POST',
    cookie: adminCookie,
    csrfToken
  });
  assert.equal(unpublishTrial.status, 409);
  assert.equal(repository.gameDefinitions.get('managed-content-test').status, 'published');
  await request('/admin/games/trial', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken,
    body: { gameId: 'first-letter-trial' }
  });
  const learningPath = await learningPathService.getAdminPath();
  const pathUpdate = await request('/admin/learning-path', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken,
    body: {
      ...learningPath.path,
      activities: [{
        gameId: 'managed-content-test',
        title: 'محتوى تجريبي',
        learningArea: 'الاستماع',
        description: 'نشاط اختبار لمسار التعلم.'
      }]
    }
  });
  assert.equal(pathUpdate.status, 200);
  const oldAttemptSubmissionId = 'c94d6451-fcf7-49b0-8e74-a00a07020ed7';
  await recordGameAnswers({
    gameId: 'managed-content-test',
    parent,
    childId: child.id,
    submissionId: oldAttemptSubmissionId,
    answers: [0],
    gameVersion: '1'
  });
  const newAttemptSubmissionId = '5e4d76af-0a0a-445a-8d76-b5dca112b341';
  await recordGameAnswers({
    gameId: 'managed-content-test',
    parent,
    childId: child.id,
    submissionId: newAttemptSubmissionId,
    answers: [1],
    gameVersion: '2'
  });
  const rejectLastActivityAsTrial = await request('/admin/games/trial', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken,
    body: { gameId: 'managed-content-test' }
  });
  assert.equal(rejectLastActivityAsTrial.status, 409);
  const oldAttempt = await request('/games/managed-content-test/attempts', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: {
      childId: child.id,
      submissionId: oldAttemptSubmissionId,
      gameVersion: '1',
      durationSeconds: 8
    }
  });
  assert.equal(oldAttempt.status, 201, JSON.stringify(await oldAttempt.clone().json()));
  assert.equal((await oldAttempt.json()).attempt.correctCount, 1);
  const newAttempt = await request('/games/managed-content-test/attempts', {
    method: 'POST',
    cookie: parent.cookie,
    csrfToken: parent.csrfToken,
    body: {
      childId: child.id,
      submissionId: newAttemptSubmissionId,
      gameVersion: '2',
      durationSeconds: 9
    }
  });
  assert.equal((await newAttempt.json()).attempt.correctCount, 1);
  const history = await request(`/children/${child.id}/game-attempts`, { cookie: parent.cookie });
  assert.deepEqual((await history.json()).attempts.map((attempt) => attempt.gameVersion).sort(), ['1', '2']);

  const deleteAssigned = await request(`/admin/assets/${asset.id}`, {
    method: 'DELETE',
    cookie: adminCookie,
    csrfToken
  });
  assert.equal(deleteAssigned.status, 409);
  const deleteAssignedAnimation = await request(`/admin/assets/${animationAsset.id}`, {
    method: 'DELETE',
    cookie: adminCookie,
    csrfToken
  });
  assert.equal(deleteAssignedAnimation.status, 409);

  const disabledAsset = await request(`/admin/assets/${replacementAsset.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    csrfToken,
    body: { active: false }
  });
  assert.equal(disabledAsset.status, 200);
  const fallbackGame = (await (await request('/games/managed-content-test', { cookie: parent.cookie })).json()).game;
  assert.equal(fallbackGame.assets.welcome?.imageUrl, undefined);
  assert.equal((await request(`/media/${replacementAsset.id}`)).status, 404);
  assert.equal((await request(`/media/${asset.id}`)).status, 200);
  await request(`/admin/assets/${replacementAsset.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    csrfToken,
    body: { active: true }
  });
  const storedAsset = repository.mediaAssets.get(replacementAsset.id);
  await rm(path.join(mediaAssetDirectory, storedAsset.storageName), { force: true });
  const missingFileFallback = (await (await request('/games/managed-content-test', { cookie: parent.cookie })).json()).game;
  assert.equal(missingFileFallback.assets.welcome?.imageUrl, undefined);
  assert.equal((await request(`/media/${replacementAsset.id}`)).status, 404);
  const unavailableAssetList = await request('/admin/assets', { cookie: adminCookie, csrfToken });
  const unavailableAsset = (await unavailableAssetList.json()).assets.find(({ id }) => id === replacementAsset.id);
  assert.equal(unavailableAsset.available, false);

  await request('/admin/games/trial', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken,
    body: { gameId: 'first-letter-trial' }
  });
  const unpublished = await request('/admin/games/managed-content-test/unpublish', {
    method: 'POST',
    cookie: adminCookie,
    csrfToken
  });
  assert.equal(unpublished.status, 200);
  assert.equal((await request('/games/managed-content-test')).status, 404);

  const unusedUpload = await uploadMedia({
    cookie: adminCookie,
    csrfToken,
    displayName: 'صوت غير مرتبط',
    kind: 'audio',
    fileName: 'sound.mp3',
    mimeType: 'audio/mpeg',
    buffer: mp3
  });
  const unusedUploadBody = await unusedUpload.json();
  assert.equal(unusedUpload.status, 201, JSON.stringify(unusedUploadBody));
  const unusedAsset = unusedUploadBody.asset;
  const optionImageUpload = await uploadMedia({
    cookie: adminCookie,
    csrfToken,
    displayName: 'صورة حيوان للعبة الصوتية',
    buffer: png
  });
  assert.equal(optionImageUpload.status, 201);
  const optionImage = (await optionImageUpload.json()).asset;
  const audioGameContent = {
    template: 'audio-choice',
    title: 'اسمع الصوت',
    description: 'اختر الحيوان بعد الاستماع.',
    companion: 'لولو',
    companionAnimal: '🐢',
    instructions: 'استمع إلى الصوت ثم اختر الصورة.',
    questions: [{
      prompt: 'من صاحب هذا الصوت؟',
      options: ['قطة', 'كلب'],
      correctAnswerIndex: 0
    }],
    assetAssignments: []
  };
  const audioGameCreated = await request('/admin/games', {
    method: 'POST',
    cookie: adminCookie,
    csrfToken,
    body: { gameId: 'audio-mapping-test', content: audioGameContent }
  });
  assert.equal(audioGameCreated.status, 201);
  const audioGameUnmappedPublish = await request('/admin/games/audio-mapping-test/publish', {
    method: 'POST',
    cookie: adminCookie,
    csrfToken
  });
  assert.equal(audioGameUnmappedPublish.status, 400);
  assert.equal((await audioGameUnmappedPublish.json()).error.code, 'GAME_AUDIO_MAPPING_REQUIRED');

  const mappedAudioContent = {
    ...audioGameContent,
    assetAssignments: [
      { event: 'correct', kind: 'audio', assetId: unusedAsset.id },
      { event: 'encouragement', kind: 'audio', assetId: unusedAsset.id },
      { event: 'background', kind: 'audio', assetId: unusedAsset.id }
    ],
    questions: [{
      ...audioGameContent.questions[0],
      promptAudioAssetId: unusedAsset.id,
      optionImageAssetIds: [optionImage.id, optionImage.id]
    }]
  };
  const audioGameUpdated = await request('/admin/games/audio-mapping-test', {
    method: 'PATCH',
    cookie: adminCookie,
    csrfToken,
    body: { content: mappedAudioContent }
  });
  assert.equal(audioGameUpdated.status, 200);
  const audioGamePublished = await request('/admin/games/audio-mapping-test/publish', {
    method: 'POST',
    cookie: adminCookie,
    csrfToken
  });
  assert.equal(audioGamePublished.status, 200);
  const audioTrialSelected = await request('/admin/games/trial', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken,
    body: { gameId: 'audio-mapping-test' }
  });
  assert.equal(audioTrialSelected.status, 200);
  const configuredAudioGame = (await (await request('/games/audio-mapping-test')).json()).game;
  assert.equal(configuredAudioGame.template, 'audio-choice');
  assert.equal(configuredAudioGame.assets.correct.audioUrl, `/api/v1/media/${unusedAsset.id}`);
  assert.equal(configuredAudioGame.assets.encouragement.audioUrl, `/api/v1/media/${unusedAsset.id}`);
  assert.equal(configuredAudioGame.assets.background.audioUrl, `/api/v1/media/${unusedAsset.id}`);
  assert.equal(configuredAudioGame.questions[0].promptAudioUrl, `/api/v1/media/${unusedAsset.id}`);
  assert.deepEqual(configuredAudioGame.questions[0].optionImageUrls, [
    `/api/v1/media/${optionImage.id}`,
    `/api/v1/media/${optionImage.id}`
  ]);
  assert.equal(Object.hasOwn(configuredAudioGame.questions[0], 'correctAnswerIndex'), false);
  const completeAudio = await request(`/media/${unusedAsset.id}`);
  assert.equal(completeAudio.status, 200);
  assert.equal(completeAudio.headers.get('content-type'), 'audio/mpeg');
  assert.equal(Number(completeAudio.headers.get('content-length')), mp3.length);
  assert.deepEqual(Buffer.from(await completeAudio.arrayBuffer()), mp3);
  const audioRange = await request(`/media/${unusedAsset.id}`, { range: 'bytes=0-3' });
  assert.equal(audioRange.status, 206);
  assert.equal(audioRange.headers.get('content-type'), 'audio/mpeg');
  assert.equal(audioRange.headers.get('content-range'), `bytes 0-3/${mp3.length}`);
  assert.deepEqual(Buffer.from(await audioRange.arrayBuffer()), mp3.subarray(0, 4));
  const invalidRange = await request(`/media/${unusedAsset.id}`, { range: 'bytes=900-999' });
  assert.equal(invalidRange.status, 416);
  const audioTrialReset = await request('/admin/games/trial', {
    method: 'PUT',
    cookie: adminCookie,
    csrfToken,
    body: { gameId: 'first-letter-trial' }
  });
  assert.equal(audioTrialReset.status, 200);
  const audioGameUnpublished = await request('/admin/games/audio-mapping-test/unpublish', {
    method: 'POST',
    cookie: adminCookie,
    csrfToken
  });
  assert.equal(audioGameUnpublished.status, 200);

  const oversized = await uploadMedia({
    cookie: adminCookie,
    csrfToken,
    buffer: Buffer.concat([png, Buffer.alloc((5 * 1024 * 1024) + 1 - png.length)])
  });
  assert.equal(oversized.status, 413);
});

test('admin-only approval rejects parent actors and does not accept role or permission changes', async () => {
  const parentResponse = await registerAccount('parent', 'not-admin@harf.test');
  const parentCookie = cookieFrom(parentResponse);
  const parentSession = await request('/auth/session', { cookie: parentCookie });
  const parentCsrf = (await parentSession.json()).csrfToken;
  const targetId = [...repository.users.values()].find((user) => user.email === 'verify@harf.test')._id;

  const forbidden = await request(`/admin/accounts/${targetId}/approval`, {
    method: 'PATCH',
    cookie: parentCookie,
    csrfToken: parentCsrf,
    body: { approvalStatus: 'approved' }
  });
  assert.equal(forbidden.status, 403);

  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: admin.email, password: 'administrator password safe' }
  });
  assert.equal(adminLogin.status, 200);
  const adminCookie = cookieFrom(adminLogin);
  const adminSession = await request('/auth/session', { cookie: adminCookie });
  const adminCsrf = (await adminSession.json()).csrfToken;

  const attemptedPrivilegeChange = await request(`/admin/accounts/${targetId}/approval`, {
    method: 'PATCH',
    cookie: adminCookie,
    csrfToken: adminCsrf,
    body: { approvalStatus: 'approved', role: 'admin', subscriptionStatus: 'active' }
  });
  assert.equal(attemptedPrivilegeChange.status, 400);

  const approved = await request(`/admin/accounts/${targetId}/approval`, {
    method: 'PATCH',
    cookie: adminCookie,
    csrfToken: adminCsrf,
    body: { approvalStatus: 'approved' }
  });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).user.approvalStatus, 'approved');
  assert.equal(repository.users.get(targetId).role, 'parent');
  assert.ok(repository.auditEvents.some((event) => event.action === 'admin.account_approval_changed'));

  const targetLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: 'verify@harf.test', password: 'correct horse battery staple' }
  });
  assert.equal(targetLogin.status, 200);
  const rejected = await request(`/admin/accounts/${targetId}/approval`, {
    method: 'PATCH',
    cookie: adminCookie,
    csrfToken: adminCsrf,
    body: { approvalStatus: 'rejected' }
  });
  assert.equal(rejected.status, 200);
  assert.equal((await request('/auth/me', { cookie: cookieFrom(targetLogin) })).status, 401);
  const reapproved = await request(`/admin/accounts/${targetId}/approval`, {
    method: 'PATCH',
    cookie: adminCookie,
    csrfToken: adminCsrf,
    body: { approvalStatus: 'approved' }
  });
  assert.equal(reapproved.status, 200);
  const freshTargetLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: 'verify@harf.test', password: 'correct horse battery staple' }
  });
  const targetCookie = cookieFrom(freshTargetLogin);
  const suspended = await request(`/admin/accounts/${targetId}/status`, {
    method: 'PATCH',
    cookie: adminCookie,
    csrfToken: adminCsrf,
    body: { accountStatus: 'suspended' }
  });
  assert.equal(suspended.status, 200);
  const suspendedSession = await request('/auth/me', { cookie: targetCookie });
  assert.equal(suspendedSession.status, 401);
  const reactivated = await request(`/admin/accounts/${targetId}/status`, {
    method: 'PATCH',
    cookie: adminCookie,
    csrfToken: adminCsrf,
    body: { accountStatus: 'active' }
  });
  assert.equal(reactivated.status, 200);
  assert.equal((await request('/auth/me', { cookie: targetCookie })).status, 401);
});

test('admin can remove only pending registration requests and removal invalidates sessions', async () => {
  const pendingUser = await repository.createUser({
    email: 'remove-pending@harf.test',
    passwordHash: await hashPassword('pending account password'),
    role: 'parent',
    emailVerifiedAt: new Date(),
    approvalStatus: 'pending',
    accountStatus: 'active',
    parentProfile: { displayName: 'Harf Test' }
  });
  const pendingSession = await authService.createSession(pendingUser);
  const pendingCookie = `harf.sid=${pendingSession.rawToken}`;
  const adminSession = await authService.createSession(admin);
  const adminCookie = `harf.sid=${adminSession.rawToken}`;
  const adminCsrf = adminSession.csrfToken;

  const removed = await request(`/admin/accounts/${pendingUser._id}`, {
    method: 'DELETE',
    cookie: adminCookie,
    csrfToken: adminCsrf
  });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).id, pendingUser._id);
  assert.equal(repository.users.has(pendingUser._id), false);
  assert.equal((await request('/auth/me', { cookie: pendingCookie })).status, 401);
  assert.ok(repository.auditEvents.some((event) => event.action === 'admin.pending_account_deleted'
    && event.targetUserId === pendingUser._id));

  const approved = await createApprovedParent('retain-approved@harf.test');
  const rejected = await request(`/admin/accounts/${approved.user._id}`, {
    method: 'DELETE',
    cookie: adminCookie,
    csrfToken: adminCsrf
  });
  assert.equal(rejected.status, 404);
  assert.equal(repository.users.has(approved.user._id), true);
});

test('specialist directory excludes incomplete profiles until verified, approved, and explicitly listed', async () => {
  const response = await registerAccount('specialist', 'speech@harf.test');
  const payload = await response.json();
  const cookie = cookieFrom(response);
  const session = await request('/auth/session', { cookie });
  const csrfToken = (await session.json()).csrfToken;
  const token = new URL(verificationEmails.at(-1).verificationUrl).searchParams.get('verify-email');
  await request('/auth/email/verify', { method: 'POST', body: { token } });
  await repository.updateApprovalStatus(payload.user.id, 'approved');

  const incomplete = await request('/directory/specialists');
  assert.deepEqual((await incomplete.json()).specialists, []);

  const parentRegistration = await registerAccount('parent', 'parent-profile@harf.test');
  const parentPayload = await parentRegistration.json();
  const parentCookie = cookieFrom(parentRegistration);
  const parentSession = await request('/auth/session', { cookie: parentCookie });
  const parentCsrf = (await parentSession.json()).csrfToken;
  const forgedProfile = await request('/auth/specialist/profile', {
    method: 'PATCH',
    cookie: parentCookie,
    csrfToken: parentCsrf,
    body: { userId: payload.user.id, displayName: 'غير مسموح' }
  });
  assert.equal(forgedProfile.status, 400);
  assert.equal(repository.users.get(parentPayload.user.id).professionalProfile, undefined);

  const profile = await request('/auth/specialist/profile', {
    method: 'PATCH',
    cookie,
    csrfToken,
    body: {
      displayName: 'د. مثال',
      specialty: 'تخاطب',
      credentials: 'مؤهل مهني',
      bio: 'نبذة مهنية',
      publicListing: true
    }
  });
  assert.equal(profile.status, 200);
  const updatedProfile = (await profile.json()).user.professionalProfile;
  assert.equal(updatedProfile.complete, true);
  assert.equal(updatedProfile.identityDocumentsComplete, true);
  assert.equal(updatedProfile.directoryEligibility.eligible, true);
  assert.equal(Object.hasOwn(updatedProfile, 'profilePhoto'), false);

  const directory = await request('/directory/specialists');
  const specialists = (await directory.json()).specialists;
  assert.equal(specialists.length, 1);
  assert.equal(specialists[0].id, payload.user.id);
  assert.equal(Object.hasOwn(specialists[0], 'email'), false);
  assert.equal(specialists[0].profilePhotoUrl, `/api/v1/directory/specialists/${payload.user.id}/photo`);
  const photo = await request(`/directory/specialists/${payload.user.id}/photo`);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/png');
  const adminSession = await authService.createSession(admin);
  const adminCookie = `harf.sid=${adminSession.rawToken}`;
  const card = await request(`/admin/accounts/${payload.user.id}/verification/front`, { cookie: adminCookie });
  assert.equal(card.status, 200);
  assert.equal(card.headers.get('cache-control'), 'private, no-store');
  const privateCard = await request(`/admin/accounts/${payload.user.id}/verification/back`, { cookie });
  assert.equal(privateCard.status, 403);
});

test('public directory keeps eligible specialists when database projection includes required private verification metadata', async () => {
  for (const field of ['role', 'approvalStatus', 'accountStatus', 'emailVerifiedAt']) {
    assert.ok(PUBLIC_SPECIALIST_PROJECTION.split(' ').includes(field));
  }
  for (const field of [
    'professionalProfile.profilePhoto',
    'professionalProfile.medicalCardFront',
    'professionalProfile.medicalCardBack'
  ]) {
    assert.ok(PUBLIC_SPECIALIST_PROJECTION.split(' ').includes(field));
  }
  const { user } = await createBookableSpecialist('directory-projection@harf.test');
  const profile = user.professionalProfile;
  const projectedUser = {
    _id: user._id,
    role: user.role,
    accountStatus: user.accountStatus,
    approvalStatus: user.approvalStatus,
    emailVerifiedAt: user.emailVerifiedAt,
    professionalProfile: {
      displayName: profile.displayName,
      specialty: profile.specialty,
      credentials: profile.credentials,
      bio: profile.bio,
      publicListing: profile.publicListing,
      profilePhoto: profile.profilePhoto,
      medicalCardFront: profile.medicalCardFront,
      medicalCardBack: profile.medicalCardBack
    }
  };
  const directoryService = new AppointmentService({
    repository: { listAvailabilities: async () => [] },
    authRepository: { listPublicSpecialists: async () => [projectedUser] },
    childService,
    videoProviderService: new VideoProviderService(),
    notificationService,
    logger,
    specialistDocumentService
  });

  const specialists = await directoryService.listPublicSpecialists();
  assert.equal(specialists.length, 1);
  assert.equal(specialists[0].displayName, 'أخصائية حرف');
  assert.equal(Object.hasOwn(specialists[0], 'medicalCardFront'), false);
  assert.equal(Object.hasOwn(specialists[0], 'medicalCardBack'), false);
});

test('pending specialists can upload verification documents before administrator approval', async () => {
  const pendingSpecialist = await repository.createUser({
    email: 'legacy-specialist@harf.test',
    passwordHash: await hashPassword('approved specialist account password'),
    role: 'specialist',
    emailVerifiedAt: new Date(),
    approvalStatus: 'pending',
    accountStatus: 'active',
    professionalProfile: {
      displayName: 'أخصائي جديد',
      specialty: 'تخاطب',
      credentials: 'مؤهل مهني',
      bio: 'نبذة مهنية',
      publicListing: false
    }
  });
  const specialistSession = await authService.createSession(pendingSpecialist);
  const formData = new FormData();
  const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2cAAAAASUVORK5CYII=', 'base64');
  for (const field of ['profilePhoto', 'medicalCardFront', 'medicalCardBack']) {
    formData.set(field, new Blob([imageBytes], { type: 'image/png' }), `${field}.png`);
  }
  const uploadResponse = await fetch(`${baseUrl}/api/v1/auth/specialist/documents`, {
    method: 'POST',
    headers: {
      Origin: config.appOrigin,
      Cookie: `harf.sid=${specialistSession.rawToken}`,
      'X-CSRF-Token': specialistSession.csrfToken
    },
    body: formData
  });
  assert.equal(uploadResponse.status, 200);
  assert.equal((await uploadResponse.json()).user.professionalProfile.identityDocumentsComplete, true);

  const adminSession = await authService.createSession(admin);
  const approvalResponse = await request(`/admin/accounts/${pendingSpecialist._id}/approval`, {
    method: 'PATCH',
    cookie: `harf.sid=${adminSession.rawToken}`,
    csrfToken: adminSession.csrfToken,
    body: { approvalStatus: 'approved' }
  });
  assert.equal(approvalResponse.status, 200);
  assert.equal((await approvalResponse.json()).user.approvalStatus, 'approved');
});

test('specialist document storage rejects missing and signature-mismatched images', async () => {
  await assert.rejects(
    specialistDocumentService.storeRequired({}),
    (error) => error.code === 'SPECIALIST_DOCUMENTS_REQUIRED'
  );
  const invalidFiles = Object.fromEntries(
    ['profilePhoto', 'medicalCardFront', 'medicalCardBack']
      .map((field) => [field, [{ buffer: Buffer.from('not an image') }]])
  );
  await assert.rejects(
    specialistDocumentService.storeRequired(invalidFiles),
    (error) => error.code === 'UNSUPPORTED_SPECIALIST_DOCUMENT'
  );
});

test('password reset consumes its token and revokes previous sessions', async () => {
  const registered = await registerAccount('parent', 'reset@harf.test');
  const cookie = cookieFrom(registered);
  const requestReset = await request('/auth/password/forgot', {
    method: 'POST',
    body: { email: 'reset@harf.test' }
  });
  assert.equal(requestReset.status, 202);
  const token = new URL(resetEmails.at(-1).resetUrl).searchParams.get('reset-password');
  const reset = await request('/auth/password/reset', {
    method: 'POST',
    body: { token, password: 'new secure password phrase' }
  });
  assert.equal(reset.status, 200);
  const staleSession = await request('/auth/me', { cookie });
  assert.equal(staleSession.status, 401);
  const reused = await request('/auth/password/reset', {
    method: 'POST',
    body: { token, password: 'another secure password phrase' }
  });
  assert.equal(reused.status, 400);
  const login = await request('/auth/login', {
    method: 'POST',
    body: { email: 'reset@harf.test', password: 'new secure password phrase' }
  });
  assert.equal(login.status, 200);
});

test('logout invalidates the server session and clears its cookie', async () => {
  const user = await repository.createUser({
    email: 'logout@harf.test',
    passwordHash: await hashPassword('logout account password'),
    role: 'parent',
    emailVerifiedAt: new Date(),
    approvalStatus: 'approved',
    accountStatus: 'active'
  });
  const session = await authService.createSession(user);
  const cookie = `harf.sid=${session.rawToken}`;
  const logout = await request('/auth/logout', {
    method: 'POST',
    cookie,
    csrfToken: session.csrfToken
  });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.getSetCookie().join(';'), /harf\.sid=;/);
  const me = await request('/auth/me', { cookie });
  assert.equal(me.status, 401);
});

test('mutating requests require a configured browser origin', async () => {
  const response = await fetch(`${baseUrl}/api/v1/auth/password/forgot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'someone@harf.test' })
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'ORIGIN_NOT_ALLOWED');
});

test('account routes fail explicitly when MongoDB is unavailable', async () => {
  const unavailableServer = createServer(createApp({
    config,
    logger,
    getDatabaseState: () => 0,
    authService,
    repository,
    childService
  }));
  unavailableServer.listen(0, '127.0.0.1');
  await once(unavailableServer, 'listening');
  const unavailableUrl = `http://127.0.0.1:${unavailableServer.address().port}/api/v1/auth/session`;
  try {
    const response = await fetch(unavailableUrl);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'DATABASE_UNAVAILABLE');
    const childrenResponse = await fetch(`${unavailableUrl.replace('/auth/session', '/children')}`);
    assert.equal(childrenResponse.status, 503);
    assert.equal((await childrenResponse.json()).error.code, 'DATABASE_UNAVAILABLE');
  } finally {
    unavailableServer.close();
    await once(unavailableServer, 'close');
  }
});

test('administrators can provision and remove other administrator accounts safely', async () => {
  const session = await authService.createSession(admin);
  const cookie = `harf.sid=${session.rawToken}`;
  const csrfToken = session.csrfToken;
  const initialList = await request('/admin/administrators', { cookie, csrfToken });
  assert.equal(initialList.status, 200);
  assert.equal((await initialList.json()).administrators.length, 1);

  const created = await request('/admin/administrators', {
    method: 'POST',
    cookie,
    csrfToken,
    body: { email: 'additional-admin@harf.test', password: 'temporary admin password' }
  });
  assert.equal(created.status, 201);
  const { administrator } = await created.json();
  assert.equal(administrator.role, 'admin');
  assert.equal(administrator.emailVerified, true);

  const duplicate = await request('/admin/administrators', {
    method: 'POST',
    cookie,
    csrfToken,
    body: { email: 'additional-admin@harf.test', password: 'temporary admin password' }
  });
  assert.equal(duplicate.status, 409);

  const selfDelete = await request(`/admin/administrators/${admin._id}`, {
    method: 'DELETE',
    cookie,
    csrfToken
  });
  assert.equal(selfDelete.status, 400);

  const addedSession = await authService.createSession(repository.users.get(administrator.id));
  const deleted = await request(`/admin/administrators/${administrator.id}`, {
    method: 'DELETE',
    cookie,
    csrfToken
  });
  assert.equal(deleted.status, 204);
  assert.equal(await request('/auth/me', { cookie: `harf.sid=${addedSession.rawToken}` }).then(({ status }) => status), 401);
  assert.equal((await (await request('/admin/administrators', { cookie, csrfToken })).json()).administrators.length, 1);
});

test('administrators can select exactly four published public trial games', async () => {
  const session = await authService.createSession(admin);
  const cookie = `harf.sid=${session.rawToken}`;
  const csrfToken = session.csrfToken;
  const gameIds = ['first-letter-trial', 'word-sounds', 'matching-pairs', 'animal-sounds'];
  const saved = await request('/admin/games/trials', {
    method: 'PUT',
    cookie,
    csrfToken,
    body: { gameIds }
  });
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).trialGameIds, gameIds);

  const publicGames = await request('/games');
  const trialGames = (await publicGames.json()).games.filter((game) => game.access === 'trial');
  assert.equal(trialGames.length, 4);
  assert.deepEqual(new Set(trialGames.map(({ id }) => id)), new Set(gameIds));
  assert.equal((await request('/games/animal-sounds')).status, 200);

  const wrongCount = await request('/admin/games/trials', {
    method: 'PUT',
    cookie,
    csrfToken,
    body: { gameIds: gameIds.slice(0, 3) }
  });
  assert.equal(wrongCount.status, 400);
});

test('login rate limiting is enforced before body processing', async () => {
  const limitServer = createServer(createApp({
    config,
    logger,
    getDatabaseState: () => 1,
    authService,
    repository
  }));
  limitServer.listen(0, '127.0.0.1');
  await once(limitServer, 'listening');
  const limitUrl = `http://127.0.0.1:${limitServer.address().port}`;
  const invalidLogin = {
    method: 'POST',
    headers: { Origin: config.appOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email', password: '' })
  };
  try {
    const forbiddenRegistration = await fetch(`${limitUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { Origin: config.appOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'admin',
        email: 'attacker@harf.test',
        password: 'correct horse battery staple',
        displayName: 'Attacker',
        approvalStatus: 'approved',
        accountStatus: 'active'
      })
    });
    assert.equal(forbiddenRegistration.status, 400);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await fetch(`${limitUrl}/api/v1/auth/login`, invalidLogin);
      assert.equal(response.status, 400);
    }
    const limited = await fetch(`${limitUrl}/api/v1/auth/login`, invalidLogin);
    assert.equal(limited.status, 429);
  } finally {
    limitServer.close();
    await once(limitServer, 'close');
  }
});
