import assert from 'node:assert/strict';
import test from 'node:test';
import { reportRangeSchema } from '../src/validation/reports.js';
import { NotificationService } from '../src/services/notificationService.js';
import { ReportService, reportCsvRows } from '../src/services/reportService.js';

function createReportRepository() {
  const dateFilters = [];
  return {
    dateFilters,
    registrationSummary: async (match) => {
      dateFilters.push(match);
      return { total: 3, byRoleAndApproval: { 'parent:approved': 2, 'specialist:pending': 1 } };
    },
    specialistCategories: async () => [{ category: 'لغة', count: 1 }],
    gameUsage: async () => [{ gameId: 'word-match', attemptCount: 2, correctAnswers: 3, answeredQuestions: 5 }],
    learningProgressSummary: async () => ({ childrenWithProgress: 1, completedActivities: 1 }),
    subscriptionRecords: async () => [{ status: 'active' }, { status: 'expired' }],
    paymentSummary: async () => [
      { status: 'all', requestedCount: 4, requestedAmountMinor: 4000 },
      { status: 'submitted', submittedCount: 2, submittedAmountMinor: 2000 },
      { status: 'confirmed', confirmedCount: 1, confirmedAmountMinor: 1000 },
      { status: 'rejected', rejectedCount: 1, rejectedAmountMinor: 1000 }
    ],
    appointmentSummary: async () => [{ status: 'accepted', sessionStatus: 'completed', count: 1, sessionCount: 1 }],
    auditSummary: async () => [{ action: 'payment.approved', count: 1 }]
  };
}

test('admin report totals separate requested, submitted, confirmed, and rejected payments', async () => {
  const repository = createReportRepository();
  const service = new ReportService({ repository, now: () => new Date('2026-03-01T00:00:00.000Z') });
  const report = await service.getAdminReport({
    from: new Date('2026-02-01T00:00:00.000Z'),
    to: new Date('2026-02-28T23:59:59.999Z')
  });

  assert.equal(report.registrations.total, 3);
  assert.equal(report.gameUsage.attemptsCompleted, 2);
  assert.equal(report.subscriptions.expired, 1);
  assert.equal(report.payments.requestedAmountMinor, 4000);
  assert.equal(report.payments.submittedAmountMinor, 2000);
  assert.equal(report.payments.confirmedAmountMinor, 1000);
  assert.equal(report.payments.rejectedAmountMinor, 1000);
  assert.deepEqual(repository.dateFilters[0], {
    createdAt: { $gte: new Date('2026-02-01T00:00:00.000Z'), $lte: new Date('2026-02-28T23:59:59.999Z') }
  });

  const csv = reportCsvRows(report);
  assert.match(csv, /requests_not_revenue/);
  assert.match(csv, /pending_or_reviewing_not_revenue/);
  assert.match(csv, /administrator_approved/);
  assert.doesNotMatch(csv, /childId|childName|parentUserId/);
});

test('CSV export neutralizes spreadsheet formulas in untrusted report values', () => {
  const report = {
    registrations: { total: 0, byRoleAndApproval: {} },
    specialists: { byCategory: [
      { category: '=HYPERLINK("https://example.invalid","open")', count: 1 },
      { category: '  @SUM(1,1)', count: 1 }
    ] },
    gameUsage: { attemptsCompleted: 0, byGame: [{ gameId: '\t+1+1', attemptCount: 1 }] },
    learningProgress: { childrenWithProgress: 0, completedActivities: 0 },
    subscriptions: {},
    payments: {
      requests: [],
      requestedAmountMinor: 0,
      submittedAmountMinor: 0,
      confirmedAmountMinor: 0,
      rejectedAmountMinor: 0
    },
    appointments: [],
    auditEvents: []
  };

  const csv = reportCsvRows(report);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.invalid"",""open""\)"/);
  assert.match(csv, /"'  @SUM\(1,1\)"/);
  assert.match(csv, /"'\t\+1\+1"/);
});

test('report date validation limits ranges and rejects inverted dates', () => {
  assert.equal(reportRangeSchema.safeParse({
    from: '2025-01-01T00:00:00.000Z',
    to: '2026-02-01T00:00:00.000Z'
  }).success, false);
  assert.equal(reportRangeSchema.safeParse({
    from: '2026-02-01T00:00:00.000Z',
    to: '2026-01-01T00:00:00.000Z'
  }).success, false);
  assert.equal(reportRangeSchema.safeParse({ from: '2026-02-01T00:00:00.000Z' }).success, true);
});

test('notifications are serialized without recipient data and read actions remain recipient-scoped', async () => {
  const stored = [];
  const recipient = 'parent-id';
  const notification = {
    _id: 'notification-id',
    recipientUserId: recipient,
    type: 'payment_review',
    title: 'تم تأكيد الدفع',
    message: 'تمت مراجعة التحويل يدويًا.',
    resourceType: 'payment',
    resourceId: 'payment-id',
    readAt: null,
    createdAt: new Date('2026-02-01T00:00:00.000Z')
  };
  const repository = {
    create: async (data) => {
      stored.push(data);
      return notification;
    },
    listForRecipient: async (userId) => userId === recipient ? [notification] : [],
    markRead: async (id, userId, now) => id === 'notification-id' && userId === recipient
      ? { ...notification, readAt: now }
      : null,
    markAllRead: async () => ({ modifiedCount: 1 })
  };
  let emailSent = false;
  const service = new NotificationService({
    repository,
    authRepository: { findUserById: async () => ({ email: 'parent@example.test' }) },
    emailService: { isConfigured: () => false, sendNotification: async () => { emailSent = true; } },
    logger: { error() {} }
  });

  const saved = await service.notify(recipient, {
    type: 'payment_review',
    title: notification.title,
    message: notification.message,
    resourceType: 'payment',
    resourceId: notification.resourceId
  });
  const listed = await service.list(recipient);
  const otherUserNotifications = await service.list('another-parent');

  assert.equal(saved._id, 'notification-id');
  assert.equal(stored.length, 1);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, 'notification-id');
  assert.equal('recipientUserId' in listed[0], false);
  assert.deepEqual(otherUserNotifications, []);
  assert.equal(await service.markRead('another-parent', 'notification-id'), null);
  assert.ok((await service.markRead(recipient, 'notification-id')).readAt);
  assert.equal(emailSent, false);
});

test('notification persistence is not undone by an optional email delivery failure', async () => {
  let persisted = false;
  let logged = false;
  const service = new NotificationService({
    repository: {
      create: async (data) => {
        persisted = true;
        return data;
      }
    },
    authRepository: { findUserById: async () => ({ email: 'parent@example.test' }) },
    emailService: {
      isConfigured: () => true,
      async sendNotification() { throw new Error('SMTP unavailable'); }
    },
    logger: { error() { logged = true; } }
  });

  await service.notify('parent-id', {
    type: 'account_approval',
    title: 'تحديث الحساب',
    message: 'تم تحديث حالة الحساب.',
    resourceType: 'account',
    resourceId: 'parent-id'
  });

  assert.equal(persisted, true);
  assert.equal(logged, true);
});
