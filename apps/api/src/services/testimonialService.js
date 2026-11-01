import { AppError } from '../middleware/errors.js';

function serialize(testimonial) {
  const record = typeof testimonial.toObject === 'function' ? testimonial.toObject() : testimonial;
  return {
    id: String(record._id ?? record.id),
    quote: record.quote,
    displayName: record.displayName || 'ولي أمر حرف',
    status: record.status,
    createdAt: record.createdAt,
    reviewedAt: record.reviewedAt ?? null
  };
}

export class TestimonialService {
  constructor({ repository, authRepository, notificationService, logger, now = () => new Date() }) {
    this.repository = repository;
    this.authRepository = authRepository;
    this.notificationService = notificationService;
    this.logger = logger;
    this.now = now;
  }

  async listPublic() {
    return (await this.repository.listPublic()).map(serialize);
  }

  async listForParent(parentUserId) {
    return (await this.repository.listForParent(parentUserId)).map(serialize);
  }

  async submit(parentUserId, { quote, displayName = '' }) {
    if (await this.repository.findPendingByParent(parentUserId)) {
      throw new AppError(409, 'TESTIMONIAL_ALREADY_PENDING', 'لديك رأي بانتظار المراجعة بالفعل.');
    }
    const admins = await this.authRepository.listActiveAdministrators();
    if (!admins.length) {
      throw new AppError(503, 'TESTIMONIAL_REVIEW_UNAVAILABLE', 'لا يمكن إرسال الرأي للمراجعة حاليًا. حاول مرة أخرى لاحقًا.');
    }
    let testimonial;
    try {
      testimonial = await this.repository.create({
        parentUserId,
        quote,
        displayName,
        status: 'pending'
      });
    } catch (error) {
      if (error.code === 11000) {
        throw new AppError(409, 'TESTIMONIAL_ALREADY_PENDING', 'لديك رأي بانتظار المراجعة بالفعل.');
      }
      throw error;
    }
    const notificationResults = await Promise.allSettled(admins.map((admin) => this.notificationService.notify(admin._id, {
      type: 'testimonial_submitted',
      title: 'رأي جديد بانتظار المراجعة',
      message: 'أرسل ولي أمر رأيًا جديدًا للمنصة. راجعه من قسم آراء أولياء الأمور.',
      resourceType: 'testimonial',
      resourceId: testimonial._id ?? testimonial.id
    })));
    const failedNotifications = notificationResults.filter((result) => result.status === 'rejected');
    if (failedNotifications.length) {
      this.logger.error({
        testimonialId: String(testimonial._id ?? testimonial.id),
        failedCount: failedNotifications.length
      }, 'One or more administrator testimonial notifications could not be saved.');
      throw new AppError(503, 'TESTIMONIAL_NOTIFICATION_FAILED', 'تم حفظ رأيك، لكن تعذر إرسال إشعار المراجعة. أعد تحميل الصفحة أو تواصل مع الإدارة.');
    }
    return serialize(testimonial);
  }

  async listForAdmin() {
    return (await this.repository.listForAdmin()).map(serialize);
  }

  async review(actor, testimonialId, decision) {
    const status = decision === 'approved' ? 'approved' : 'rejected';
    const reviewedAt = this.now();
    const testimonial = await this.repository.review(
      testimonialId,
      actor._id ?? actor.id,
      status,
      reviewedAt
    );
    if (!testimonial) {
      const existing = await this.repository.findById(testimonialId);
      if (!existing) throw new AppError(404, 'TESTIMONIAL_NOT_FOUND', 'الرأي غير موجود.');
      throw new AppError(409, 'TESTIMONIAL_ALREADY_REVIEWED', 'تمت مراجعة هذا الرأي مسبقًا.');
    }
    try {
      await this.notificationService.notify(testimonial.parentUserId, {
        type: 'testimonial_decision',
        title: status === 'approved' ? 'تم اعتماد رأيك' : 'تمت مراجعة رأيك',
        message: status === 'approved'
          ? 'شكرًا لمشاركتك. أصبح رأيك ظاهرًا في الصفحة الرئيسية.'
          : 'شكرًا لمشاركة رأيك. لن يظهر في الصفحة الرئيسية.',
        resourceType: 'testimonial',
        resourceId: testimonial._id ?? testimonial.id
      });
    } catch (error) {
      this.logger.error({ error, testimonialId: String(testimonialId), parentUserId: String(testimonial.parentUserId) }, 'Parent testimonial decision notification could not be saved.');
      throw error;
    }
    if (this.authRepository.recordAuditEvent) {
      await this.authRepository.recordAuditEvent({
        action: 'admin.testimonial_reviewed',
        actorUserId: actor._id ?? actor.id,
        targetUserId: testimonial.parentUserId,
        success: true,
        metadata: { testimonialId: String(testimonial._id ?? testimonial.id), status }
      });
    }
    return serialize(testimonial);
  }
}
