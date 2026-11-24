function dateMatch(start, end, field = 'createdAt') {
  const [minimum, maximum] = [start, end];
  if (!minimum && !maximum) return {};
  return {
    [field]: {
      ...(minimum ? { $gte: minimum } : {}),
      ...(maximum ? { $lte: maximum } : {})
    }
  };
}

function sumBy(items, field) {
  return items.reduce((total, item) => total + Number(item[field] ?? 0), 0);
}

export class ReportService {
  constructor({ repository, now = () => new Date() }) {
    this.repository = repository;
    this.now = now;
  }

  async getAdminReport({ from = null, to = null } = {}) {
    const now = this.now();
    const [registrations, specialistsByCategory, gameUsage, learningProgress, subscriptions, payments, appointments, auditEvents] = await Promise.all([
      this.repository.registrationSummary(dateMatch(from, to)),
      this.repository.specialistCategories(dateMatch(from, to)),
      this.repository.gameUsage(dateMatch(from, to, 'completedAt')),
      this.repository.learningProgressSummary({}, from, to),
      this.repository.subscriptionRecords(dateMatch(from, to), now),
      this.repository.paymentSummary(dateMatch(from, to)),
      this.repository.appointmentSummary(dateMatch(from, to)),
      this.repository.auditSummary(dateMatch(from, to))
    ]);

    return {
      filters: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
      generatedAt: now.toISOString(),
      registrations,
      specialists: {
        byCategory: specialistsByCategory
      },
      gameUsage: {
        attemptsCompleted: gameUsage.reduce((total, item) => total + item.attemptCount, 0),
        byGame: gameUsage
      },
      learningProgress,
      subscriptions: {
        active: subscriptions.filter(({ status }) => status === 'active').length,
        expired: subscriptions.filter(({ status }) => status === 'expired').length,
        scheduled: subscriptions.filter(({ status }) => status === 'scheduled').length
      },
      payments: {
        requests: payments,
        requestedAmountMinor: sumBy(payments, 'requestedAmountMinor'),
        submittedAmountMinor: sumBy(payments, 'submittedAmountMinor'),
        confirmedAmountMinor: sumBy(payments, 'confirmedAmountMinor'),
        rejectedAmountMinor: sumBy(payments, 'rejectedAmountMinor')
      },
      appointments,
      auditEvents
    };
  }
}

export function reportCsvRows(report) {
  const rows = [
    ['section', 'metric', 'status', 'count', 'amount_minor', 'currency'],
    ['registrations', 'accounts', 'all', report.registrations.total, '', ''],
    ...Object.entries(report.registrations.byRoleAndApproval).map(([key, count]) => {
      const [role, approvalStatus] = key.split(':');
      return ['registrations', role, approvalStatus, count, '', ''];
    }),
    ...report.specialists.byCategory.map((item) => ['specialists', 'category', item.category, item.count, '', '']),
    ['games', 'completed_attempts', 'all', report.gameUsage.attemptsCompleted, '', ''],
    ...report.gameUsage.byGame.map((item) => ['games', item.gameId, 'completed', item.attemptCount, '', '']),
    ['learning_progress', 'children_with_progress', 'aggregate_only', report.learningProgress.childrenWithProgress, '', ''],
    ['learning_progress', 'completed_activities', 'aggregate_only', report.learningProgress.completedActivities, '', ''],
    ...Object.entries(report.subscriptions).map(([status, count]) => ['subscriptions', 'periods', status, count, '', '']),
    ['payments', 'requested_amount', 'requests_not_revenue', report.payments.requests.reduce((sum, item) => sum + item.requestedCount, 0), report.payments.requestedAmountMinor, 'EGP'],
    ['payments', 'submitted_amount', 'pending_or_reviewing_not_revenue', report.payments.requests.reduce((sum, item) => sum + item.submittedCount, 0), report.payments.submittedAmountMinor, 'EGP'],
    ['payments', 'confirmed_amount', 'administrator_approved', report.payments.requests.reduce((sum, item) => sum + item.confirmedCount, 0), report.payments.confirmedAmountMinor, 'EGP'],
    ['payments', 'rejected_amount', 'administrator_rejected', report.payments.requests.reduce((sum, item) => sum + item.rejectedCount, 0), report.payments.rejectedAmountMinor, 'EGP'],
    ...report.appointments.map((item) => ['appointments', 'booking_status', item.status, item.count, '', '']),
    ...report.appointments.map((item) => ['sessions', 'execution_status', item.sessionStatus, item.sessionCount, '', '']),
    ...report.auditEvents.map((item) => ['audit_events', item.action, 'events', item.count, '', ''])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value) {
  const rawText = String(value ?? '');
  const text = /^[\u0000-\u0020]*[=+\-@]/.test(rawText) ? `'${rawText}` : rawText;
  return `"${text.replace(/"/g, '""')}"`;
}
