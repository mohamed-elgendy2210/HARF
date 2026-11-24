import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionPaymentService } from '../src/services/sessionPaymentService.js';

const parentId = '000000000000000000000001';
const specialistId = '000000000000000000000002';
const adminId = '000000000000000000000003';
const appointmentId = '000000000000000000000004';

function createPaymentHarness() {
  const now = new Date('2026-02-01T10:00:00.000Z');
  const appointment = {
    _id: appointmentId,
    parentUserId: parentId,
    specialistUserId: specialistId,
    childId: { displayName: 'طفل' },
    startsAt: new Date('2026-02-02T10:00:00.000Z'),
    endsAt: new Date('2026-02-02T10:45:00.000Z'),
    timeZone: 'Africa/Cairo',
    status: 'awaiting_payment',
    payment: {
      status: 'awaiting_payment',
      amountMinor: 50000,
      currency: 'EGP',
      deadline: new Date('2026-02-01T22:00:00.000Z'),
      methods: { instapay: { recipient: 'account@example' } },
      history: []
    }
  };
  const storedReceipts = new Map();
  const notifications = [];
  let receiptSequence = 0;
  const repository = {
    async findOwnedAppointment(id, ownerId) {
      return id === appointmentId && ownerId === parentId ? appointment : null;
    },
    async submitReceipt(id, ownerId, submittedAt, method, receipt) {
      if (id !== appointmentId || ownerId !== parentId
        || appointment.status !== 'awaiting_payment'
        || !['awaiting_payment', 'rejected'].includes(appointment.payment.status)
        || appointment.payment.deadline <= submittedAt) return null;
      appointment.status = 'payment_under_review';
      Object.assign(appointment.payment, {
        status: 'pending_verification',
        method,
        receipt,
        submittedAt,
        verifiedBy: null,
        verifiedAt: null,
        rejectionReason: ''
      });
      return appointment;
    },
    async findAdminPayment(id) {
      return id === appointmentId ? appointment : null;
    },
    async reviewPayment(id, reviewedBy, reviewedAt, decision, decisionNote, historyEntry) {
      if (id !== appointmentId || appointment.status !== 'payment_under_review'
        || appointment.payment.status !== 'pending_verification') return null;
      appointment.status = decision === 'approved' ? 'accepted' : 'awaiting_payment';
      Object.assign(appointment.payment, {
        status: decision,
        verifiedBy: reviewedBy,
        verifiedAt: reviewedAt,
        rejectionReason: decision === 'approved' ? '' : decisionNote
      });
      appointment.payment.history.push({
        ...historyEntry,
        status: decision,
        reviewedBy,
        reviewedAt,
        decisionNote
      });
      return appointment;
    }
  };
  const receiptService = {
    async store(file) {
      const receipt = {
        storageName: `receipt-${++receiptSequence}`,
        mimeType: file.mimetype,
        sizeBytes: file.buffer.length
      };
      storedReceipts.set(receipt.storageName, file.buffer);
      return receipt;
    },
    async read(receipt) {
      const buffer = storedReceipts.get(receipt?.storageName);
      return buffer ? { buffer, mimeType: receipt.mimeType } : null;
    },
    async remove(receipt) {
      storedReceipts.delete(receipt.storageName);
    }
  };
  let activatedCount = 0;
  const service = new SessionPaymentService({
    repository,
    paymentRepository: {},
    authRepository: {
      async createAuditEvent() {},
      async listActiveAdministrators() { return [{ _id: adminId }]; }
    },
    receiptService,
    appointmentService: {
      async activatePaidAppointment() { activatedCount += 1; }
    },
    notificationService: {
      async notify(userId, notification) { notifications.push({ userId, notification }); }
    },
    logger: { error() {} },
    now: () => now
  });
  return { appointment, service, storedReceipts, notifications, getActivatedCount: () => activatedCount };
}

test('session payment receipt can be rejected, resubmitted, and approved once', async () => {
  const harness = createPaymentHarness();
  const { appointment, service } = harness;
  const firstFile = { mimetype: 'image/png', buffer: Buffer.from('receipt-one') };
  const rejectedReceipt = await service.submitReceipt(
    { _id: parentId },
    appointmentId,
    { method: 'instapay' },
    firstFile
  );
  assert.equal(rejectedReceipt.status, 'pending_verification');
  assert.equal(appointment.status, 'payment_under_review');
  assert.ok(harness.notifications.some(({ userId, notification }) => (
    userId === adminId && notification.title === 'إيصال جلسة جديد للمراجعة'
  )));

  const rejected = await service.reviewPayment(
    { _id: adminId },
    appointmentId,
    { decision: 'rejected', decisionNote: 'الإيصال غير واضح' }
  );
  assert.equal(rejected.payment.status, 'rejected');
  assert.equal(appointment.status, 'awaiting_payment');
  assert.equal(appointment.payment.history.length, 1);
  assert.ok(harness.notifications.some(({ userId, notification }) => (
    userId === parentId && notification.title === 'تم رفض إيصال الدفع'
  )));

  const correctedReceipt = await service.submitReceipt(
    { _id: parentId },
    appointmentId,
    { method: 'instapay' },
    { mimetype: 'image/png', buffer: Buffer.from('receipt-two') }
  );
  assert.equal(correctedReceipt.status, 'pending_verification');
  const approved = await service.reviewPayment(
    { _id: adminId },
    appointmentId,
    { decision: 'approved', decisionNote: '' }
  );

  assert.equal(approved.payment.status, 'approved');
  assert.equal(approved.appointmentStatus, 'accepted');
  assert.equal(appointment.payment.history.length, 2);
  assert.equal(harness.getActivatedCount(), 1);
  assert.ok(harness.notifications.some(({ userId, notification }) => (
    userId === parentId && notification.title === 'تم تأكيد دفع الجلسة'
  )));
  assert.ok(harness.notifications.some(({ userId, notification }) => (
    userId === specialistId && notification.title === 'تم تأكيد الجلسة بعد الدفع'
  )));
  await assert.rejects(
    service.reviewPayment({ _id: adminId }, appointmentId, { decision: 'approved', decisionNote: '' }),
    { code: 'SESSION_PAYMENT_ALREADY_REVIEWED' }
  );
});

test('session payment receipt access is restricted to the appointment parent', async () => {
  const { service } = createPaymentHarness();
  await assert.rejects(
    service.getParentPayment({ _id: specialistId }, appointmentId),
    { code: 'SESSION_PAYMENT_NOT_FOUND' }
  );
  await assert.rejects(
    service.readParentReceipt({ _id: specialistId }, appointmentId),
    { code: 'RECEIPT_NOT_FOUND' }
  );
});

test('expired session payments cannot accept a receipt', async () => {
  const { appointment, service } = createPaymentHarness();
  appointment.payment.deadline = new Date('2026-02-01T09:59:59.000Z');
  await assert.rejects(
    service.submitReceipt(
      { _id: parentId },
      appointmentId,
      { method: 'instapay' },
      { mimetype: 'image/png', buffer: Buffer.from('receipt') }
    ),
    { code: 'SESSION_PAYMENT_EXPIRED' }
  );
});
