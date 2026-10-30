import { AppError } from '../middleware/errors.js';

const METHOD_NAMES = Object.freeze({
  vodafone_cash: 'Vodafone Cash',
  instapay: 'InstaPay'
});

function accountId(account) {
  return account._id ?? account.id;
}

function statusOf(subscription, now) {
  if (!subscription) return 'none';
  if (new Date(subscription.startsAt) <= now && new Date(subscription.expiresAt) > now) return 'active';
  return new Date(subscription.expiresAt) <= now ? 'expired' : 'scheduled';
}

function serializeSubscription(subscription, now) {
  if (!subscription) return { status: 'none', startsAt: null, expiresAt: null };
  return {
    id: String(subscription._id ?? subscription.id),
    status: statusOf(subscription, now),
    period: subscription.period ?? 'monthly',
    startsAt: subscription.startsAt,
    expiresAt: subscription.expiresAt,
    amountMinor: subscription.amountMinor ?? null,
    currency: subscription.currency ?? null,
    paymentMethod: subscription.paymentMethod ?? null,
    transactionReference: subscription.transactionReference ?? null,
    source: subscription.source
  };
}

function serializePayment(payment, { includeOwner = false } = {}) {
  const record = typeof payment.toObject === 'function' ? payment.toObject() : payment;
  const owner = includeOwner && record.parentUserId && typeof record.parentUserId === 'object'
    ? record.parentUserId
    : null;
  return {
    id: String(record._id ?? record.id),
    ...(includeOwner ? {
      parentUserId: String(owner?._id ?? record.parentUserId),
      parentEmail: owner?.email ?? null,
      parentDisplayName: owner?.parentProfile?.displayName ?? null
    } : {}),
    method: record.method,
    methodLabel: METHOD_NAMES[record.method],
    period: record.period ?? 'monthly',
    transactionReference: record.transactionReference,
    amountMinor: record.amountMinor,
    currency: record.currency,
    paymentInstructions: record.paymentInstructions,
    status: record.status,
    receiptAvailable: Boolean(record.receipt?.storageName),
    receiptUrl: record.receipt?.storageName ? `/api/v1/payments/${String(record._id ?? record.id)}/receipt` : null,
    createdAt: record.createdAt,
    review: record.review?.reviewedAt ? {
      reviewedAt: record.review.reviewedAt,
      decisionNote: record.review.decisionNote ?? ''
    } : null,
    subscription: null
  };
}

function addCalendarMonths(date, months) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  target.setUTCHours(
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  );
  return target;
}

export class SubscriptionService {
  constructor({ repository, paymentRepository, authRepository, receiptService, notificationService, logger, now = () => new Date() }) {
    this.repository = repository;
    this.paymentRepository = paymentRepository;
    this.authRepository = authRepository;
    this.receiptService = receiptService;
    this.notificationService = notificationService;
    this.logger = logger;
    this.now = now;
  }

  async getStatus(parentUserId) {
    const now = this.now();
    const [active, latest] = await Promise.all([
      this.repository.findActiveSubscription(parentUserId, now),
      this.repository.findLatestSubscription(parentUserId)
    ]);
    return serializeSubscription(active ?? latest, now);
  }

  async getHistory(parentUserId) {
    const now = this.now();
    const subscriptions = await this.repository.listSubscriptions(parentUserId);
    return subscriptions.map((subscription) => serializeSubscription(subscription, now));
  }

  async getBilling(parentUserId) {
    const [subscription, history, payments] = await Promise.all([
      this.getStatus(parentUserId),
      this.getHistory(parentUserId),
      this.listParentPayments(parentUserId)
    ]);
    return { subscription, history, payments };
  }

  async requireActive(parentUserId) {
    const status = await this.getStatus(parentUserId);
    if (status.status !== 'active') {
      throw new AppError(403, 'SUBSCRIPTION_REQUIRED', 'يلزم اشتراك نشط للوصول إلى هذا النشاط التعليمي.');
    }
    return status;
  }

  async getPublicPlan() {
    const settings = await this.paymentRepository.getSettings();
    if (!settings) {
      return {
        configured: false,
        amountMinor: null,
        annualAmountMinor: null,
        currency: 'EGP',
        methods: { vodafone_cash: { enabled: false }, instapay: { enabled: false } }
      };
    }
    return {
      configured: true,
      amountMinor: settings.amountMinor,
      annualAmountMinor: settings.annualAmountMinor ?? null,
      currency: settings.currency,
      methods: {
        vodafone_cash: {
          enabled: settings.vodafoneCash.enabled,
          recipient: settings.vodafoneCash.recipient,
          instructions: settings.vodafoneCash.instructions
        },
        instapay: {
          enabled: settings.instaPay.enabled,
          recipient: settings.instaPay.recipient,
          instructions: settings.instaPay.instructions
        }
      }
    };
  }

  async getAdminSettings() {
    const settings = await this.paymentRepository.getSettings();
    return settings ? {
      amountMinor: settings.amountMinor,
      annualAmountMinor: settings.annualAmountMinor ?? null,
      currency: settings.currency,
      vodafoneCash: settings.vodafoneCash,
      instaPay: settings.instaPay,
      updatedAt: settings.updatedAt
    } : {
      amountMinor: null,
      annualAmountMinor: null,
      currency: 'EGP',
      vodafoneCash: { enabled: false, recipient: '', instructions: '' },
      instaPay: { enabled: false, recipient: '', instructions: '' },
      updatedAt: null
    };
  }

  async updateSettings(actor, input) {
    const settings = await this.paymentRepository.updateSettings(input, accountId(actor));
    await this.audit('admin.subscription_settings_updated', accountId(actor), null, {
      amountMinor: input.amountMinor,
      annualAmountMinor: input.annualAmountMinor ?? null,
      currency: input.currency,
      vodafoneCashEnabled: input.vodafoneCash.enabled,
      instaPayEnabled: input.instaPay.enabled
    });
    return {
      amountMinor: settings.amountMinor,
      annualAmountMinor: settings.annualAmountMinor ?? null,
      currency: settings.currency,
      vodafoneCash: settings.vodafoneCash,
      instaPay: settings.instaPay,
      updatedAt: settings.updatedAt
    };
  }

  async createPaymentRequest(parent, input, file) {
    const parentUserId = accountId(parent);
    const settings = await this.paymentRepository.getSettings();
    if (!settings) throw new AppError(409, 'SUBSCRIPTION_NOT_CONFIGURED', 'لم يتم إعداد سعر الاشتراك وطرق الدفع بعد.');
    const amountMinor = input.period === 'annual'
      ? settings.annualAmountMinor
      : settings.amountMinor;
    if (!amountMinor) {
      throw new AppError(409, 'SUBSCRIPTION_PERIOD_NOT_CONFIGURED', 'لم يتم إعداد سعر الاشتراك السنوي بعد.');
    }
    const methodConfig = input.method === 'vodafone_cash' ? settings.vodafoneCash : settings.instaPay;
    if (!methodConfig.enabled) throw new AppError(409, 'PAYMENT_METHOD_DISABLED', 'طريقة الدفع المختارة غير متاحة حاليًا.');
    if (await this.paymentRepository.findOpenPayment(parentUserId)) {
      throw new AppError(409, 'PAYMENT_REVIEW_PENDING', 'لديك طلب دفع مفتوح بالفعل. انتظر مراجعته قبل إنشاء طلب آخر.');
    }

    const receipt = file ? await this.receiptService.store(file) : null;
    let payment;
    try {
      payment = await this.paymentRepository.createPaymentRequest({
        parentUserId,
        method: input.method,
        period: input.period ?? 'monthly',
        transactionReference: input.transactionReference,
        amountMinor,
        currency: settings.currency,
        paymentInstructions: {
          recipient: methodConfig.recipient,
          instructions: methodConfig.instructions
        },
        ...(receipt ? { receipt } : {}),
        status: 'pending',
        open: true
      });
    } catch (error) {
      if (receipt) await this.receiptService.remove(receipt);
      if (error.code === 11000) throw new AppError(409, 'PAYMENT_REVIEW_PENDING', 'لديك طلب دفع مفتوح بالفعل.');
      throw error;
    }
    await this.audit('payment.request_submitted', parentUserId, parentUserId, {
      paymentId: String(payment._id),
      method: input.method,
      period: input.period ?? 'monthly',
      amountMinor,
      currency: settings.currency,
      receiptAttached: Boolean(receipt)
    });
    if (this.notificationService) {
      try {
        const administrator = await this.authRepository.findAdministrator?.();
        if (administrator) {
          await this.notify(administrator._id ?? administrator.id, {
            type: 'payment_review',
            title: 'طلب دفع جديد',
            message: 'يوجد طلب دفع جديد بانتظار المراجعة اليدوية.',
            resourceType: 'payment',
            resourceId: payment._id ?? payment.id
          });
        }
      } catch (error) {
        this.logger?.error({ error }, 'Payment review notification could not be created.');
      }
    }
    return serializePayment(payment);
  }

  async listParentPayments(parentUserId) {
    const payments = await this.paymentRepository.listParentPayments(parentUserId);
    return payments.map((payment) => serializePayment(payment));
  }

  async listAdminPayments() {
    const payments = await this.paymentRepository.listAdminPayments();
    return payments.map((payment) => serializePayment(payment, { includeOwner: true }));
  }

  async readParentReceipt(paymentId, parentUserId) {
    const payment = await this.paymentRepository.findOwnedPayment(paymentId, parentUserId);
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'طلب الدفع غير موجود.');
    const receipt = await this.receiptService.read(payment.receipt);
    if (!receipt) throw new AppError(404, 'RECEIPT_NOT_FOUND', 'ملف الإيصال غير متاح.');
    return receipt;
  }

  async readAdminReceipt(paymentId) {
    const payment = await this.paymentRepository.findPayment(paymentId);
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'طلب الدفع غير موجود.');
    const receipt = await this.receiptService.read(payment.receipt);
    if (!receipt) throw new AppError(404, 'RECEIPT_NOT_FOUND', 'ملف الإيصال غير متاح.');
    return receipt;
  }

  async reviewPayment(actor, paymentId, { decision, decisionNote }) {
    const adminId = accountId(actor);
    const now = this.now();
    const payment = await this.paymentRepository.findPayment(paymentId);
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'طلب الدفع غير موجود.');
    if (!payment.open) throw new AppError(409, 'PAYMENT_ALREADY_REVIEWED', 'تمت مراجعة طلب الدفع بالفعل.');

    const claimed = await this.paymentRepository.claimPayment(
      paymentId,
      adminId,
      now,
      new Date(now.getTime() - 10 * 60 * 1000)
    );
    if (!claimed) throw new AppError(409, 'PAYMENT_REVIEW_IN_PROGRESS', 'طلب الدفع قيد المراجعة من مسؤول آخر.');

    let subscription = await this.paymentRepository.findSubscriptionByPayment(paymentId);
    let finalDecision = decision;
    if (subscription) finalDecision = 'approved';

    try {
      if (finalDecision === 'approved' && !subscription) {
        const parent = await this.authRepository.findUserById(payment.parentUserId);
        if (!parent || parent.role !== 'parent'
          || parent.accountStatus !== 'active'
          || parent.approvalStatus !== 'approved'
          || !parent.emailVerifiedAt) {
          throw new AppError(409, 'PARENT_ACCOUNT_NOT_ELIGIBLE', 'حساب ولي الأمر غير مؤهل لتفعيل الاشتراك.');
        }
        const latest = await this.repository.findLatestUnexpiredSubscription(payment.parentUserId, now);
        const startsAt = latest && new Date(latest.expiresAt) > now
          ? new Date(latest.expiresAt)
          : now;
        const period = payment.period ?? 'monthly';
        const expiresAt = addCalendarMonths(startsAt, period === 'annual' ? 12 : 1);
        try {
          subscription = await this.repository.createSubscription({
            parentUserId: payment.parentUserId,
            startsAt,
            expiresAt,
            grantedDays: Math.max(1, Math.ceil((expiresAt - startsAt) / 86400000)),
            period,
            grantedBy: adminId,
            source: 'manual_payment',
            reason: `Manual payment ${payment.transactionReference}`,
            paymentRequestId: payment._id,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            paymentMethod: payment.method,
            transactionReference: payment.transactionReference
          });
        } catch (error) {
          if (error.code !== 11000) throw error;
          subscription = await this.paymentRepository.findSubscriptionByPayment(paymentId);
          if (!subscription) throw error;
        }
      }

      const reviewed = await this.paymentRepository.completePayment(
        paymentId,
        adminId,
        now,
        decisionNote,
        finalDecision,
        subscription?._id ?? subscription?.id
      );
      if (!reviewed) throw new AppError(409, 'PAYMENT_REVIEW_IN_PROGRESS', 'تعذر إكمال مراجعة طلب الدفع.');
      await this.audit(`payment.${finalDecision}`, adminId, payment.parentUserId, {
        paymentId: String(paymentId),
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        requestedDecision: decision,
        subscriptionId: subscription ? String(subscription._id ?? subscription.id) : null
      });
      await this.notify(payment.parentUserId, {
        type: 'payment_review',
        title: finalDecision === 'approved' ? 'تم تأكيد الدفع' : 'تم رفض طلب الدفع',
        message: finalDecision === 'approved'
          ? 'تمت مراجعة التحويل يدويًا وتفعيل الاشتراك.'
          : 'تمت مراجعة طلب الدفع ورفضه. راجع تفاصيله من لوحة الأسرة.',
        resourceType: 'payment',
        resourceId: paymentId
      });
      return {
        payment: serializePayment(reviewed),
        ...(subscription ? { subscription: serializeSubscription(subscription, now) } : {})
      };
    } catch (error) {
      await this.paymentRepository.releasePaymentClaim(paymentId);
      throw error;
    }
  }

  async audit(action, actorUserId, targetUserId, metadata) {
    await this.authRepository.createAuditEvent({
      action,
      actorUserId,
      targetUserId,
      success: true,
      metadata
    });
  }

  async notify(recipientUserId, notification) {
    try {
      await this.notificationService?.notify(recipientUserId, notification);
    } catch (error) {
      this.logger?.error({ error, recipientUserId, notificationType: notification.type }, 'Payment notification could not be saved.');
    }
  }
}
