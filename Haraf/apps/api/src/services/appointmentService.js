import { randomBytes } from 'node:crypto';
import { AppError } from '../middleware/errors.js';
import {
  appointmentLocalLabel,
  addLocalDays,
  assertTimeZone,
  localDateKey,
  localDateTimeToUtc,
  localDayOfWeek,
  reservationKeys
} from '../lib/appointmentTime.js';
import { hasSpecialistVerificationDocuments, isProfessionalProfileComplete } from './authService.js';
import { isReadableName } from '../lib/nameValidation.js';

const APPOINTMENT_REQUEST_LIFETIME_MS = 48 * 60 * 60 * 1000;

function idOf(record) {
  if (record && typeof record.toHexString === 'function') return record.toHexString();
  return String(record && typeof record === 'object' ? record._id ?? record.id : record);
}

function minuteOf(clockTime) {
  const [hour, minute] = clockTime.split(':').map(Number);
  return hour * 60 + minute;
}

function publicSpecialist(user) {
  const profile = user?.professionalProfile;
  if (!user || user.role !== 'specialist' || user.accountStatus !== 'active'
    || user.approvalStatus !== 'approved' || !user.emailVerifiedAt
    || profile?.publicListing !== true || !isProfessionalProfileComplete(profile)
    || !hasSpecialistVerificationDocuments(profile)) return null;
  return user;
}

function serializeAvailability(record) {
  if (!record) return null;
  return {
    timeZone: record.timeZone,
    appointmentPriceMinor: record.appointmentPriceMinor,
    appointmentCurrency: record.appointmentCurrency,
    appointmentDurationMinutes: record.appointmentDurationMinutes,
    weeklySchedule: record.weeklySchedule,
    exceptions: record.exceptions,
    updatedAt: record.updatedAt
  };
}

function serializeAppointment(record, viewerRole) {
  const specialist = record.specialistUserId && typeof record.specialistUserId === 'object'
    ? record.specialistUserId
    : null;
  const parent = record.parentUserId && typeof record.parentUserId === 'object'
    ? record.parentUserId
    : null;
  const child = record.childId && typeof record.childId === 'object' ? record.childId : null;
  const appointment = {
    id: idOf(record),
    childId: String(child?._id ?? record.childId),
    childName: child?.displayName ?? null,
    specialistId: String(specialist?._id ?? record.specialistUserId),
    specialistName: isReadableName(specialist?.professionalProfile?.displayName)
      ? specialist.professionalProfile.displayName
      : null,
    specialistProfilePhotoUrl: specialist?.professionalProfile?.profilePhoto?.storageName
      ? `/api/v1/directory/specialists/${idOf(specialist)}/photo`
      : null,
    specialty: specialist?.professionalProfile?.specialty ?? null,
    parentName: parent?.parentProfile?.displayName ?? null,
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    timeZone: record.timeZone,
    durationMinutes: record.durationMinutes,
    amountMinor: record.amountMinor,
    currency: record.currency,
    status: record.status,
    requestedAt: record.requestedAt,
    expiresAt: record.expiresAt,
    decidedAt: record.decidedAt,
    acceptedAt: record.acceptedAt,
    rejectedAt: record.rejectedAt,
    expiredAt: record.expiredAt,
    decisionNote: record.decisionNote ?? '',
    sessionStatus: record.sessionStatus ?? 'not_started',
    sessionStartedAt: record.sessionStartedAt ?? null,
    sessionEndedAt: record.sessionEndedAt ?? null,
    meetingStatus: record.meeting?.status ?? (record.meetingProvisioningFailedAt ? 'failed' : null),
    meetingAvailable: Boolean(record.meeting?.roomName)
  };
  if (viewerRole === 'parent' && record.parentProgressReport?.createdAt) {
    appointment.parentProgressReport = {
      summary: record.parentProgressReport.summary,
      suggestedActivities: record.parentProgressReport.suggestedActivities,
      createdAt: record.parentProgressReport.createdAt
    };
  }
  if (viewerRole === 'specialist') {
    appointment.privateSpecialistNotes = record.privateSpecialistNotes ?? '';
    appointment.parentProgressReport = record.parentProgressReport?.createdAt
      ? record.parentProgressReport
      : null;
  }
  return appointment;
}

export class AppointmentService {
  constructor({
    repository,
    authRepository,
    childService,
    videoProviderService,
    notificationService,
    logger,
    specialistDocumentService,
    meetingRules = {},
    now = () => new Date()
  }) {
    this.repository = repository;
    this.authRepository = authRepository;
    this.childService = childService;
    this.videoProviderService = videoProviderService;
    this.notificationService = notificationService;
    this.logger = logger;
    this.specialistDocumentService = specialistDocumentService;
    this.meetingRules = {
      parentEarlyJoinMinutes: meetingRules.parentEarlyJoinMinutes ?? 10,
      specialistEarlyJoinMinutes: meetingRules.specialistEarlyJoinMinutes ?? 15,
      postAppointmentGraceMinutes: meetingRules.postAppointmentGraceMinutes ?? 30
    };
    this.now = now;
    this.expiryTimer = null;
  }

  startExpiryWorker() {
    if (this.expiryTimer) return;
    const expire = async () => {
      try {
        await this.repository.expirePending(this.now());
      } catch (error) {
        this.logger.error({ error }, 'Pending appointment expiration failed.');
      }
    };
    void expire();
    this.expiryTimer = setInterval(() => void expire(), 60 * 1000);
    this.expiryTimer.unref?.();
  }

  stopExpiryWorker() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
    this.expiryTimer = null;
  }

  async getSpecialistAvailability(specialistUserId) {
    const record = await this.repository.findAvailability(specialistUserId);
    return serializeAvailability(record);
  }

  async updateSpecialistAvailability(specialist, input) {
    if (!assertTimeZone(input.timeZone)) {
      throw new AppError(400, 'INVALID_TIME_ZONE', 'Choose a supported time zone.');
    }
    const userId = idOf(specialist);
    const record = await this.repository.saveAvailability(userId, input);
    await this.audit('specialist.availability_updated', specialist, userId, {
      exceptionCount: input.exceptions.length,
      configuredDays: input.weeklySchedule.filter(({ windows }) => windows.length > 0).length,
      appointmentDurationMinutes: input.appointmentDurationMinutes
    });
    return serializeAvailability(record);
  }

  async listPublicSpecialists() {
    const specialists = await this.authRepository.listPublicSpecialists();
    const availabilities = await this.repository.listAvailabilities(
      specialists.map((specialist) => specialist._id ?? specialist.id)
    );
    const availabilityBySpecialist = new Map(
      availabilities.map((availability) => [String(availability.specialistUserId), availability])
    );
    const available = [];
    for (const candidate of specialists) {
      const user = publicSpecialist(candidate);
      if (!user) continue;
      const availability = availabilityBySpecialist.get(idOf(user));
      const hasSlots = availability?.weeklySchedule?.some(({ windows }) => windows.length > 0)
        || availability?.exceptions?.some(({ windows }) => windows.length > 0);
      available.push({
        id: idOf(user),
        displayName: user.professionalProfile.displayName,
        specialty: user.professionalProfile.specialty,
        credentials: user.professionalProfile.credentials,
        bio: user.professionalProfile.bio,
        profilePhotoUrl: user.professionalProfile.profilePhoto
          ? `/api/v1/directory/specialists/${idOf(user)}/photo`
          : null,
        appointmentAvailable: Boolean(hasSlots && availability?.appointmentPriceMinor),
        ...(availability ? {
          appointmentPriceMinor: availability.appointmentPriceMinor,
          appointmentCurrency: availability.appointmentCurrency,
          appointmentDurationMinutes: availability.appointmentDurationMinutes,
          timeZone: availability.timeZone
        } : {})
      });
    }
    return available;
  }

  async getPublicProfilePhoto(specialistId) {
    const specialist = publicSpecialist(await this.authRepository.findUserById(specialistId));
    if (!specialist?.professionalProfile?.profilePhoto) {
      throw new AppError(404, 'SPECIALIST_PHOTO_NOT_FOUND', 'The specialist photo was not found.');
    }
    const photo = await this.specialistDocumentService.read(specialist.professionalProfile.profilePhoto);
    if (!photo) throw new AppError(404, 'SPECIALIST_PHOTO_NOT_FOUND', 'The specialist photo was not found.');
    return photo;
  }

  async getAvailableSlots(specialistId, { from, days = 14 }) {
    await this.repository.expirePending(this.now(), specialistId);
    const specialist = publicSpecialist(await this.authRepository.findUserById(specialistId));
    if (!specialist) throw new AppError(404, 'SPECIALIST_NOT_FOUND', 'The specialist profile was not found.');
    const availability = await this.repository.findAvailability(specialistId);
    if (!availability) return { specialistId, configured: false, timeZone: null, slots: [] };
    if (!assertTimeZone(availability.timeZone)) {
      throw new AppError(503, 'SPECIALIST_SCHEDULE_INVALID', 'The specialist schedule is temporarily unavailable.');
    }
    const now = this.now();
    const rangeStart = from ? new Date(from) : now;
    if (!Number.isFinite(rangeStart.getTime()) || rangeStart < new Date(now.getTime() - 86400000)) {
      throw new AppError(400, 'INVALID_AVAILABILITY_RANGE', 'The requested availability range is invalid.');
    }
    const dateStart = localDateKey(rangeStart, availability.timeZone);
    const dateEnd = addLocalDays(dateStart, days);
    const rangeEnd = new Date(rangeStart.getTime() + (days + 2) * 86400000);
    const occupied = await this.repository.findReservedAppointments(specialistId, rangeEnd, new Date(rangeStart.getTime() - 86400000));
    const reservedKeys = new Set(occupied.flatMap(({ reservationKeys: keys }) => keys.map((date) => new Date(date).getTime())));
    const exceptionsByDate = new Map(availability.exceptions.map((item) => [item.date, item.windows]));
    const slots = [];

    for (let date = dateStart; date < dateEnd; date = addLocalDays(date, 1)) {
      const windows = exceptionsByDate.has(date)
        ? exceptionsByDate.get(date)
        : availability.weeklySchedule.find(({ dayOfWeek }) => dayOfWeek === localDayOfWeek(date))?.windows ?? [];
      for (const window of windows) {
        const startLimit = minuteOf(window.start);
        const endLimit = minuteOf(window.end);
        for (let startMinute = startLimit; startMinute + availability.appointmentDurationMinutes <= endLimit; startMinute += 15) {
          const startClock = `${String(Math.floor(startMinute / 60)).padStart(2, '0')}:${String(startMinute % 60).padStart(2, '0')}`;
          const startsAt = localDateTimeToUtc(date, startClock, availability.timeZone);
          if (!startsAt || startsAt < now || startsAt < rangeStart) continue;
          const keys = reservationKeys(startsAt, availability.appointmentDurationMinutes);
          if (!keys || keys.some((key) => reservedKeys.has(key.getTime()))) continue;
          slots.push({
            startsAt: startsAt.toISOString(),
            endsAt: new Date(startsAt.getTime() + availability.appointmentDurationMinutes * 60000).toISOString(),
            timeZone: availability.timeZone,
            durationMinutes: availability.appointmentDurationMinutes,
            amountMinor: availability.appointmentPriceMinor,
            currency: availability.appointmentCurrency
          });
        }
      }
    }
    return {
      specialistId: idOf(specialist),
      configured: true,
      timeZone: availability.timeZone,
      appointmentPriceMinor: availability.appointmentPriceMinor,
      appointmentCurrency: availability.appointmentCurrency,
      appointmentDurationMinutes: availability.appointmentDurationMinutes,
      slots
    };
  }

  async createAppointment(parent, input) {
    const parentUserId = idOf(parent);
    const child = await this.childService.getOwnedChild(parentUserId, input.childId);
    if (child.status !== 'active') throw new AppError(409, 'CHILD_PROFILE_INACTIVE', 'Appointments require an active child profile.');
    const selectedStart = new Date(input.startsAt);
    const selectedAvailability = await this.getAvailableSlots(input.specialistId, {
      from: selectedStart.toISOString(),
      days: 1
    });
    const slot = selectedAvailability.slots.find(({ startsAt }) => new Date(startsAt).getTime() === selectedStart.getTime());
    if (!slot) throw new AppError(409, 'APPOINTMENT_SLOT_UNAVAILABLE', 'That appointment time is no longer available.');
    const keys = reservationKeys(slot.startsAt, slot.durationMinutes);
    if (!keys) throw new AppError(400, 'INVALID_APPOINTMENT_TIME', 'The appointment time is invalid.');
    const requestedAt = this.now();
    try {
      const appointment = await this.repository.createAppointment({
        parentUserId,
        childId: input.childId,
        specialistUserId: input.specialistId,
        startsAt: new Date(slot.startsAt),
        endsAt: new Date(slot.endsAt),
        timeZone: slot.timeZone,
        durationMinutes: slot.durationMinutes,
        amountMinor: slot.amountMinor,
        currency: slot.currency,
        status: 'pending',
        requestedAt,
        expiresAt: new Date(requestedAt.getTime() + APPOINTMENT_REQUEST_LIFETIME_MS),
        slotReserved: true,
        reservationKeys: keys
      });
      await this.audit('appointment.requested', parent, input.specialistId, {
        appointmentId: idOf(appointment),
        childId: input.childId,
        startsAt: slot.startsAt,
        amountMinor: slot.amountMinor,
        currency: slot.currency,
        durationMinutes: slot.durationMinutes
      });
      await this.notify(input.specialistId, {
        type: 'appointment_request',
        title: 'طلب موعد جديد',
        message: 'لديك طلب موعد جديد بانتظار قرارك.',
        resourceType: 'appointment',
        resourceId: idOf(appointment)
      });
      return serializeAppointment(appointment, 'parent');
    } catch (error) {
      if (error.code === 11000) {
        throw new AppError(409, 'APPOINTMENT_SLOT_UNAVAILABLE', 'That appointment time was just booked. Choose another available time.');
      }
      throw error;
    }
  }

  async listAppointments(user) {
    const userId = idOf(user);
    await this.repository.expirePending(this.now(), user.role === 'specialist' ? userId : undefined);
    const records = user.role === 'parent'
      ? await this.repository.listParentAppointments(userId)
      : await this.repository.listSpecialistAppointments(userId);
    return Promise.all(records.map((record) => this.serializeForViewer(record, user.role)));
  }

  async listAdminAppointments(query) {
    const result = await this.repository.listAdminAppointments(query);
    return {
      appointments: result.appointments.map((record) => ({
        id: idOf(record),
        parentId: idOf(record.parentId),
        parentName: record.parentName ?? null,
        childId: idOf(record.childId),
        childName: record.childName ?? null,
        specialistId: idOf(record.specialistId),
        specialistName: record.specialistName ?? null,
        startsAt: record.startsAt,
        endsAt: record.endsAt,
        timeZone: record.timeZone,
        durationMinutes: record.durationMinutes,
        status: record.status,
        sessionStatus: record.sessionStatus ?? 'not_started',
        sessionStartedAt: record.sessionStartedAt ?? null,
        sessionEndedAt: record.sessionEndedAt ?? null,
        meetingStatus: record.meeting?.status ?? (record.meetingProvisioningFailedAt ? 'failed' : null),
        meetingCreatedAt: record.meeting?.createdAt ?? null,
        meetingProvisioningErrorCode: record.meetingProvisioningErrorCode ?? '',
        meetingConfigured: Boolean(record.meeting?.roomName),
        createdAt: record.createdAt
      })),
      stats: result.stats,
      page: query.page,
      limit: query.limit,
      total: result.total,
      pages: Math.ceil(result.total / query.limit)
    };
  }

  async retryAdminMeeting(administrator, appointmentId) {
    const appointment = await this.repository.findAdminAppointment(appointmentId);
    if (!appointment) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'The appointment was not found.');
    if (appointment.status !== 'accepted') {
      throw new AppError(409, 'APPOINTMENT_NOT_CONFIRMED', 'Only a confirmed appointment can have a meeting provisioned.');
    }
    if (appointment.meeting?.roomName) {
      throw new AppError(409, 'MEETING_ALREADY_CONFIGURED', 'This appointment already has a meeting room.');
    }
    if (new Date(appointment.startsAt).getTime() <= this.now().getTime()) {
      throw new AppError(409, 'MEETING_NOT_READY', 'A meeting cannot be provisioned for a past appointment.');
    }
    try {
      const ensured = await this.ensureMeeting(appointment, idOf(appointment.specialistUserId), { allowPast: false });
      if (ensured.created) await this.notifyMeetingReady(ensured.appointment);
      await this.audit('admin.appointment.meeting_provisioned', administrator, appointment.specialistUserId, {
        appointmentId,
        meetingCreatedAt: ensured.appointment.meeting?.createdAt
      });
      return {
        appointmentId,
        meetingStatus: ensured.appointment.meeting?.status ?? null,
        meetingConfigured: Boolean(ensured.appointment.meeting?.roomName)
      };
    } catch (error) {
      await this.audit('admin.appointment.meeting_provisioning_failed', administrator, appointment.specialistUserId, {
        appointmentId,
        errorCode: /^[A-Z0-9_]{1,80}$/.test(error.code ?? '') ? error.code : 'VIDEO_PROVIDER_ERROR'
      });
      throw error;
    }
  }

  async getAppointment(user, appointmentId) {
    await this.repository.expirePending(this.now(), user.role === 'specialist' ? idOf(user) : undefined);
    const field = user.role === 'parent' ? 'parentUserId' : 'specialistUserId';
    const record = await this.repository.findOwnedAppointment(appointmentId, field, idOf(user));
    if (!record) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'The appointment was not found.');
    return this.serializeForViewer(record, user.role);
  }

  async serializeForViewer(record, viewerRole) {
    const appointment = serializeAppointment(record, viewerRole);
    const earlyMinutes = viewerRole === 'specialist'
      ? this.meetingRules.specialistEarlyJoinMinutes
      : this.meetingRules.parentEarlyJoinMinutes;
    appointment.meetingJoinOpensAt = new Date(
      new Date(record.startsAt).getTime() - earlyMinutes * 60 * 1000
    ).toISOString();
    appointment.meetingJoinClosesAt = new Date(
      new Date(record.endsAt).getTime() + this.meetingRules.postAppointmentGraceMinutes * 60 * 1000
    ).toISOString();
    appointment.meetingAvailable = Boolean(this.videoProviderService?.isConfigured()
      && record.status === 'accepted'
      && record.sessionStatus !== 'completed'
      && !['ended', 'cancelled', 'failed'].includes(record.meeting?.status));
    appointment.meetingJoinAvailable = this.canJoinMeeting(record, viewerRole, this.now());
    if (viewerRole === 'parent' && appointment.parentProgressReport
      && !await this.childService.hasConsent(
        idOf(record.parentUserId),
        idOf(record.childId),
        'progress_reports'
      )) {
      delete appointment.parentProgressReport;
    }
    return appointment;
  }

  async decideAppointment(specialist, appointmentId, { decision, decisionNote }) {
    const specialistId = idOf(specialist);
    const now = this.now();
    await this.repository.expirePending(now, specialistId);
    const updated = await this.repository.decideAppointment(
      appointmentId,
      specialistId,
      decision,
      now,
      decisionNote
    );
    if (!updated) {
      const owned = await this.repository.findOwnedAppointment(appointmentId, 'specialistUserId', specialistId);
      if (!owned) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'The appointment was not found.');
      if (decision === 'accepted' && owned.status === 'accepted') {
        if (new Date(owned.startsAt).getTime() <= now.getTime()) {
          return this.serializeForViewer(owned, 'specialist');
        }
        const ensured = await this.ensureMeeting(owned, specialistId, { allowPast: false });
        if (ensured.created) await this.notifyMeetingReady(ensured.appointment);
        return this.serializeForViewer(ensured.appointment, 'specialist');
      }
      throw new AppError(409, owned.status === 'expired'
        ? 'APPOINTMENT_REQUEST_EXPIRED'
        : 'APPOINTMENT_ALREADY_DECIDED', 'This appointment request is no longer pending.');
    }
    await this.audit(`appointment.${decision}`, specialist, updated.parentUserId, {
      appointmentId,
      startsAt: updated.startsAt,
      decisionNote
    });
    let appointment = updated;
    if (decision === 'accepted' && this.videoProviderService?.isConfigured()
      && new Date(updated.startsAt).getTime() > now.getTime()) {
      const ensured = await this.ensureMeeting(updated, specialistId, { allowPast: false });
      appointment = ensured.appointment;
      if (ensured.created) await this.notifyMeetingReady(appointment);
    }
    if (decision !== 'accepted' || !appointment.meeting?.roomName) {
      await this.notify(updated.parentUserId, {
        type: 'appointment_decision',
        title: decision === 'accepted' ? 'تم تأكيد الموعد' : 'تم رفض طلب الموعد',
        message: decision === 'accepted'
          ? 'وافق الأخصائي على طلب الموعد.'
          : 'لم يتم قبول طلب الموعد. يمكنك اختيار موعد آخر.',
        resourceType: 'appointment',
        resourceId: appointmentId
      });
    }
    return this.serializeForViewer(appointment, 'specialist');
  }

  async startSession(specialist, appointmentId) {
    const now = this.now();
    const joinUntil = new Date(now.getTime() + this.meetingRules.specialistEarlyJoinMinutes * 60 * 1000);
    const owned = await this.repository.findOwnedAppointment(appointmentId, 'specialistUserId', idOf(specialist));
    if (!owned) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'The appointment was not found.');
    this.assertJoinable(owned, 'specialist', now);
    if (owned.sessionStatus === 'in_progress') return this.serializeForViewer(owned, 'specialist');
    const updated = await this.repository.startSession(
      appointmentId,
      idOf(specialist),
      now,
      joinUntil,
      Boolean(owned.meeting?.roomName)
    );
    if (!updated) {
      throw new AppError(409, 'APPOINTMENT_SESSION_NOT_STARTABLE', 'Only an eligible confirmed appointment can start.');
    }
    await this.audit('appointment.session_started', specialist, updated.parentUserId, {
      appointmentId,
      sessionStartedAt: now
    });
    return serializeAppointment(updated, 'specialist');
  }

  async completeSession(specialist, appointmentId, { privateNotes, parentReport }) {
    const now = this.now();
    const owned = await this.repository.findOwnedAppointment(
      appointmentId,
      'specialistUserId',
      idOf(specialist)
    );
    if (!owned) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'The appointment was not found.');
    if (parentReport && !await this.childService.hasConsent(
      idOf(owned.parentUserId),
      idOf(owned.childId),
      'progress_reports'
    )) {
      throw new AppError(403, 'PROGRESS_REPORT_CONSENT_REQUIRED', 'The parent must enable progress-report consent before a report can be saved.');
    }
    const updated = await this.repository.completeSession(
      appointmentId,
      idOf(specialist),
      now,
      { privateNotes, parentReport, hasMeeting: Boolean(owned.meeting?.roomName) }
    );
    if (!updated) {
      throw new AppError(409, 'APPOINTMENT_SESSION_NOT_IN_PROGRESS', 'Only an in-progress appointment can be completed.');
    }
    await this.audit('appointment.session_completed', specialist, updated.parentUserId, {
      appointmentId,
      sessionEndedAt: now
    });
    await this.notify(updated.parentUserId, {
      type: 'session_report',
      title: 'تم إنهاء الجلسة',
      message: parentReport
        ? 'أنهى الأخصائي الجلسة وأعدّ ملخصًا تعليميًا متاحًا في لوحة الأسرة.'
        : 'أنهى الأخصائي الجلسة.',
      resourceType: 'appointment',
      resourceId: appointmentId
    });
    return serializeAppointment(updated, 'specialist');
  }

  async createVideoRoomAccess(user, appointmentId) {
    const field = user.role === 'parent' ? 'parentUserId' : 'specialistUserId';
    let appointment = await this.repository.findOwnedAppointment(appointmentId, field, idOf(user));
    if (!appointment) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'The appointment was not found.');
    const now = this.now();
    this.assertJoinable(appointment, user.role, now);
    if (!this.videoProviderService?.isConfigured()) {
      throw new AppError(503, 'VIDEO_PROVIDER_NOT_CONFIGURED', 'Video consultations are not configured.');
    }
    if (!appointment.meeting?.roomName) {
      if (new Date(appointment.startsAt).getTime() <= now.getTime()) {
        throw new AppError(409, 'MEETING_NOT_READY', 'This confirmed appointment does not have a meeting room.');
      }
      appointment = (await this.ensureMeeting(appointment, idOf(appointment.specialistUserId), { allowPast: false })).appointment;
    }
    if (!appointment.meeting || !['scheduled', 'live'].includes(appointment.meeting.status)) {
      throw new AppError(409, 'MEETING_NOT_AVAILABLE', 'This meeting is no longer available.');
    }
    const access = await this.videoProviderService.createRoomAccess({
      appointment: {
        id: idOf(appointment),
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        sessionStatus: appointment.sessionStatus,
        meeting: appointment.meeting
      },
      participant: { userId: idOf(user), role: user.role }
    });
    if (access.roomName !== appointment.meeting.roomName
      || access.domain !== appointment.meeting.domain) {
      throw new AppError(502, 'VIDEO_PROVIDER_ROOM_MISMATCH', 'The video provider returned details for another meeting.');
    }
    return access;
  }

  canJoinMeeting(appointment, role, now) {
    if (!this.videoProviderService?.isConfigured()
      || appointment.status !== 'accepted'
      || appointment.sessionStatus === 'completed'
      || ['ended', 'cancelled', 'failed'].includes(appointment.meeting?.status)) return false;
    const earlyMinutes = role === 'specialist'
      ? this.meetingRules.specialistEarlyJoinMinutes
      : this.meetingRules.parentEarlyJoinMinutes;
    const opensAt = new Date(appointment.startsAt).getTime() - earlyMinutes * 60 * 1000;
    const closesAt = new Date(appointment.endsAt).getTime()
      + this.meetingRules.postAppointmentGraceMinutes * 60 * 1000;
    return now.getTime() >= opensAt && now.getTime() <= closesAt;
  }

  assertJoinable(appointment, role, now) {
    if (appointment.status !== 'accepted') {
      throw new AppError(409, 'APPOINTMENT_NOT_CONFIRMED', 'Video access is available only for a confirmed appointment.');
    }
    if (appointment.sessionStatus === 'completed'
      || ['ended', 'cancelled', 'failed'].includes(appointment.meeting?.status)) {
      throw new AppError(409, 'MEETING_NOT_AVAILABLE', 'This meeting is no longer available.');
    }
    const earlyMinutes = role === 'specialist'
      ? this.meetingRules.specialistEarlyJoinMinutes
      : this.meetingRules.parentEarlyJoinMinutes;
    const opensAt = new Date(appointment.startsAt).getTime() - earlyMinutes * 60 * 1000;
    const closesAt = new Date(appointment.endsAt).getTime()
      + this.meetingRules.postAppointmentGraceMinutes * 60 * 1000;
    if (now.getTime() < opensAt) {
      throw new AppError(409, 'MEETING_NOT_OPEN_YET', 'The meeting can be joined shortly before the appointment.');
    }
    if (now.getTime() > closesAt) {
      throw new AppError(409, 'MEETING_JOIN_WINDOW_CLOSED', 'The meeting join period has ended.');
    }
  }

  async ensureMeeting(appointment, specialistId, { allowPast }) {
    if (appointment.meeting?.roomName) return { appointment, created: false };
    if (!this.videoProviderService?.isConfigured()) {
      const error = new AppError(503, 'VIDEO_PROVIDER_NOT_CONFIGURED', 'Video consultations are not configured.');
      await this.repository.recordMeetingProvisioningFailure(
        idOf(appointment),
        this.now(),
        error.code
      );
      throw error;
    }
    if (!allowPast && new Date(appointment.startsAt).getTime() <= this.now().getTime()) {
      throw new AppError(409, 'MEETING_NOT_READY', 'A meeting cannot be created for a past appointment.');
    }
    const roomName = randomBytes(32).toString('hex');
    let meeting;
    try {
      meeting = await this.videoProviderService.createMeetingRecord({
        appointment: {
          id: idOf(appointment),
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt
        },
        roomName
      });
    } catch (error) {
      const errorCode = /^[A-Z0-9_]{1,80}$/.test(error.code ?? '')
        ? error.code
        : 'VIDEO_PROVIDER_ERROR';
      await this.repository.recordMeetingProvisioningFailure(idOf(appointment), this.now(), errorCode);
      throw error;
    }
    const assigned = await this.repository.assignMeeting(idOf(appointment), specialistId, meeting);
    if (assigned) return { appointment: assigned, created: true };
    const current = await this.repository.findOwnedAppointment(idOf(appointment), 'specialistUserId', specialistId);
    if (!current?.meeting?.roomName) {
      throw new AppError(409, 'MEETING_ASSOCIATION_CONFLICT', 'The meeting could not be associated with this appointment.');
    }
    return { appointment: current, created: false };
  }

  async notifyMeetingReady(appointment) {
    const appointmentLabel = appointmentLocalLabel(appointment.startsAt, appointment.timeZone);
    for (const recipientUserId of [appointment.parentUserId, appointment.specialistUserId]) {
      await this.notify(recipientUserId, {
        type: 'appointment_decision',
        title: 'تم تأكيد الموعد والجلسة المرئية',
        message: `تم تأكيد الموعد يوم ${appointmentLabel}. تفاصيل الانضمام متاحة من لوحة المواعيد.`,
        resourceType: 'appointment',
        resourceId: idOf(appointment)
      });
    }
  }

  async audit(action, actor, targetUserId, metadata) {
    await this.authRepository.createAuditEvent({
      action,
      actorUserId: idOf(actor),
      targetUserId,
      success: true,
      metadata
    });
  }

  async notify(recipientUserId, notification) {
    try {
      await this.notificationService?.notify(recipientUserId, notification);
    } catch (error) {
      this.logger.error({ error, recipientUserId, notificationType: notification.type }, 'Appointment notification could not be saved.');
    }
  }
}

export { serializeAppointment, serializeAvailability, APPOINTMENT_REQUEST_LIFETIME_MS };
