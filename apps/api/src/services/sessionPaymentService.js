import { AppError } from '../middleware/errors.js';

function idOf(record) {
  return String(record?._id ?? record?.id ?? record);
}

function safePayment(payment, appointmentId) {
  return {
    status: payment.status,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    deadline: payment.deadline,
    method: payment.method ?? null,
    submittedAt: payment.submittedAt ?? null,
    verifiedAt: payment.verifiedAt ?? null,
    rejectionReason: payment.rejectionReason ?? '',
    receiptAvailable: Boolean(payment.receipt?.storageName),
    receiptUrl: payment.receipt?.storageName
      ? `/api/v1/appointments/${appointmentId}/payment/receipt`
      : null,
    history: (payment.history ?? []).map((item) => ({
      status: item.status,
      method: item.method,
      submittedAt: item.submittedAt,
      reviewedAt: item.reviewedAt,
      decisionNote: item.decisionNote ?? '',
      receiptAvailable: Boolean(item.receipt?.storageName)
    }))
  };
}

export class SessionPaymentService {
  constructor({
    repository,
    paymentRepository,
    authRepository,
    receiptService,
    appointmentService,
    notificationService,
    logger,
    now = () => new Date()
  }) {
    this.repository = repository;
    this.paymentRepository = paymentRepository;
    this.authRepository = authRepository;
    this.receiptService = receiptService;
    this.appointmentService = appointmentService;
    this.notificationService = notificationService;
    this.logger = logger;
    this.now = now;
  }

  async getAdminSettings() {
    const settings = await this.repository.getSettings();
    return {
      enabled: settings?.enabled ?? false,
      paymentDeadlineHours: settings?.paymentDeadlineHours ?? 24,
      updatedAt: settings?.updatedAt ?? null
    };
  }

  async updateAdminSettings(actor, input) {
    await this.repository.updateSettings(input, idOf(actor));
    await this.audit('admin.session_payment_settings_updated', actor, null, input);
    return this.getAdminSettings();
  }

  async getParentPayment(parent, appointmentId) {
    const appointment = await this.repository.findOwnedAppointment(appointmentId, idOf(parent));
    if (!appointment?.payment) throw new AppError(404, 'SESSION_PAYMENT_NOT_FOUND', 'تفاصيل الدفع غير متاحة لهذا الموعد.');
    return {
      appointmentId,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      timeZone: appointment.timeZone,
      childName: appointment.childId?.displayName ?? null,
      specialistName: appointment.specialistUserId?.professionalProfile?.displayName ?? null,
      payment: safePayment(appointment.payment, appointmentId),
      methods: appointment.payment.methods ?? {}
    };
  }

  async submitReceipt(parent, appointmentId, { method }, file) {
    if (!file?.buffer?.length) throw new AppError(400, 'RECEIPT_REQUIRED', 'ارفع صورة إيصال التحويل قبل الإرسال.');
    const appointment = await this.repository.findOwnedAppointment(appointmentId, idOf(parent));
    if (!appointment?.payment) throw new AppError(404, 'SESSION_PAYMENT_NOT_FOUND', 'تفاصيل الدفع غير متاحة لهذا الموعد.');
    const methodConfig = appointment.payment.methods?.[method];
    if (!methodConfig) {
      throw new AppError(409, 'SESSION_PAYMENT_METHOD_DISABLED', 'طريقة الدفع المختارة غير متاحة لهذا الموعد.');
    }
    const now = this.now();
    if (appointment.payment.deadline <= now || appointment.payment.status === 'expired') {
      throw new AppError(409, 'SESSION_PAYMENT_EXPIRED', 'انتهت مهلة دفع هذه الجلسة.');
    }
    const receipt = await this.receiptService.store(file, { imagesOnly: true });
    let updated;
    try {
      updated = await this.repository.submitReceipt(appointmentId, idOf(parent), now, method, receipt);
      if (!updated) {
        const current = await this.repository.findOwnedAppointment(appointmentId, idOf(parent));
        if (!current) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'الموعد غير موجود.');
        if (current.payment?.status === 'pending_verification') {
          throw new AppError(409, 'SESSION_PAYMENT_UNDER_REVIEW', 'إيصال الدفع قيد المراجعة بالفعل.');
        }
        throw new AppError(409, 'SESSION_PAYMENT_NOT_SUBMITTABLE', 'لا يمكن إرسال إيصال لهذا الموعد في حالته الحالية.');
      }
    } catch (error) {
      await this.receiptService.remove(receipt);
      throw error;
    }
    await this.audit(
      appointment.payment.status === 'rejected' ? 'session_payment.resubmitted' : 'session_payment.receipt_submitted',
      parent,
      idOf(appointment.specialistUserId),
      { appointmentId, method, amountMinor: appointment.payment.amountMinor }
    );
    await this.notify(idOf(parent), {
      type: 'payment_review',
      title: 'تم إرسال إيصال الجلسة',
      message: 'تم استلام الإيصال، والدفع الآن قيد المراجعة الإدارية.',
      resourceType: 'appointment',
      resourceId: appointmentId
    });
    try {
      for (const administrator of await this.authRepository.listActiveAdministrators()) {
        await this.notify(idOf(administrator), {
          type: 'payment_review',
          title: 'إيصال جلسة جديد للمراجعة',
          message: 'يوجد إيصال دفع جلسة بانتظار المراجعة الإدارية.',
          resourceType: 'appointment',
          resourceId: appointmentId
        });
      }
    } catch (error) {
      this.logger?.error({ error }, 'Session payment administrator notifications could not be loaded.');
    }
    return safePayment(updated.payment, appointmentId);
  }

  async readParentReceipt(parent, appointmentId) {
    const appointment = await this.repository.findOwnedAppointment(appointmentId, idOf(parent));
    if (!appointment?.payment?.receipt) throw new AppError(404, 'RECEIPT_NOT_FOUND', 'ملف الإيصال غير متاح.');
    const receipt = await this.receiptService.read(appointment.payment.receipt);
    if (!receipt) throw new AppError(404, 'RECEIPT_NOT_FOUND', 'ملف الإيصال غير متاح.');
    return receipt;
  }

  async listAdminPayments(query) {
    const result = await this.repository.listAdminPayments(query);
    return {
      payments: result.appointments.map((appointment) => ({
        id: idOf(appointment),
        paymentReference: idOf(appointment),
        bookingReference: idOf(appointment),
        parentName: appointment.parentUserId?.parentProfile?.displayName ?? null,
        parentEmail: appointment.parentUserId?.email ?? null,
        childName: appointment.childId?.displayName ?? null,
        specialistName: appointment.specialistUserId?.professionalProfile?.displayName ?? null,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        timeZone: appointment.timeZone,
        status: appointment.payment.status,
        appointmentStatus: appointment.status,
        amountMinor: appointment.payment.amountMinor,
        currency: appointment.payment.currency,
        method: appointment.payment.method ?? null,
        submittedAt: appointment.payment.submittedAt ?? null,
        deadline: appointment.payment.deadline,
        rejectionReason: appointment.payment.rejectionReason ?? '',
        receiptAvailable: Boolean(appointment.payment.receipt?.storageName),
        receiptUrl: appointment.payment.receipt?.storageName
          ? `/api/v1/admin/session-payments/${idOf(appointment)}/receipt`
          : null,
        history: (appointment.payment.history ?? []).map((item) => ({
          status: item.status,
          reviewedAt: item.reviewedAt,
          decisionNote: item.decisionNote ?? '',
          submittedAt: item.submittedAt,
          method: item.method
        }))
      })),
      stats: result.stats,
      page: query.page,
      limit: query.limit,
      total: result.total,
      pages: Math.ceil(result.total / query.limit)
    };
  }

  async readAdminReceipt(appointmentId) {
    const appointment = await this.repository.findAdminPayment(appointmentId);
    if (!appointment?.payment?.receipt) throw new AppError(404, 'RECEIPT_NOT_FOUND', 'ملف الإيصال غير متاح.');
    const receipt = await this.receiptService.read(appointment.payment.receipt);
    if (!receipt) throw new AppError(404, 'RECEIPT_NOT_FOUND', 'ملف الإيصال غير متاح.');
    return receipt;
  }

  async reviewPayment(actor, appointmentId, { decision, decisionNote }) {
    const appointment = await this.repository.findAdminPayment(appointmentId);
    if (!appointment?.payment) throw new AppError(404, 'SESSION_PAYMENT_NOT_FOUND', 'طلب دفع الجلسة غير موجود.');
    if (appointment.payment.status !== 'pending_verification'
      || appointment.status !== 'payment_under_review') {
      throw new AppError(409, 'SESSION_PAYMENT_ALREADY_REVIEWED', 'طلب الدفع لم يعد بانتظار المراجعة.');
    }
    const previousReceipt = await this.receiptService.read(appointment.payment.receipt);
    if (!previousReceipt) throw new AppError(409, 'SESSION_PAYMENT_RECEIPT_MISSING', 'تعذر العثور على صورة الإيصال.');
    const now = this.now();
    if (appointment.payment.deadline <= now) {
      throw new AppError(409, 'SESSION_PAYMENT_EXPIRED', 'انتهت مهلة الدفع ولا يمكن اعتماد هذا الطلب.');
    }
    const reviewed = await this.repository.reviewPayment(
      appointmentId,
      idOf(actor),
      now,
      decision,
      decision === 'rejected' ? decisionNote : '',
      {
        method: appointment.payment.method,
        receipt: appointment.payment.receipt,
        submittedAt: appointment.payment.submittedAt
      }
    );
    if (!reviewed) throw new AppError(409, 'SESSION_PAYMENT_ALREADY_REVIEWED', 'تم تحديث حالة الدفع بواسطة مسؤول آخر.');
    await this.audit(`session_payment.${decision}`, actor, idOf(appointment.parentUserId), {
      appointmentId,
      amountMinor: appointment.payment.amountMinor,
      method: appointment.payment.method
    });
    if (decision === 'approved') {
      try {
        await this.appointmentService.activatePaidAppointment(actor, appointmentId);
      } catch (error) {
        this.logger?.error({ error, appointmentId }, 'Paid appointment meeting setup failed.');
      }
      await this.notify(idOf(reviewed.parentUserId), {
        type: 'payment_review',
        title: 'تم تأكيد دفع الجلسة',
        message: 'تم اعتماد إيصال الدفع وتأكيد الجلسة. ستظهر لك تفاصيل الانضمام عند اقتراب الموعد.',
        resourceType: 'appointment',
        resourceId: appointmentId
      });
      await this.notify(idOf(reviewed.specialistUserId), {
        type: 'appointment_decision',
        title: 'تم تأكيد الجلسة بعد الدفع',
        message: 'اعتمدت الإدارة دفع الجلسة وأصبح الموعد مؤكدًا.',
        resourceType: 'appointment',
        resourceId: appointmentId
      });
    } else {
      await this.notify(idOf(reviewed.parentUserId), {
        type: 'payment_review',
        title: 'تم رفض إيصال الدفع',
        message: `تعذر اعتماد الإيصال. السبب: ${decisionNote}`,
        resourceType: 'appointment',
        resourceId: appointmentId
      });
    }
    return { payment: safePayment(reviewed.payment, appointmentId), appointmentStatus: reviewed.status };
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
      this.logger?.error({ error, recipientUserId, notificationType: notification.type }, 'Session payment notification could not be saved.');
    }
  }
}
