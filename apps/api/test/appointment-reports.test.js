import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppointmentService, serializeAppointment } from '../src/services/appointmentService.js';

const appointmentId = '000000000000000000000001';
const parentId = '000000000000000000000002';
const childId = '000000000000000000000003';
const specialistId = '000000000000000000000004';

function appointmentWithReport(parentProgressReport) {
  return {
    _id: appointmentId,
    parentUserId: parentId,
    childId,
    specialistUserId: specialistId,
    startsAt: new Date('2026-01-01T10:00:00Z'),
    endsAt: new Date('2026-01-01T10:30:00Z'),
    parentProgressReport
  };
}

test('legacy parent reports remain readable while drafts stay specialist-only', () => {
  const legacyReport = serializeAppointment(appointmentWithReport({
    summary: 'ملخص قديم محفوظ',
    suggestedActivities: ['نشاط مقترح'],
    createdAt: new Date('2026-01-02T10:00:00Z')
  }), 'parent').parentProgressReport;

  assert.equal(legacyReport.status, 'published');
  assert.equal(legacyReport.sessionSummary, 'ملخص قديم محفوظ');
  assert.deepEqual(legacyReport.suggestedActivities, ['نشاط مقترح']);

  const draftAppointment = appointmentWithReport({
    status: 'draft',
    sessionSummary: 'مسودة',
    createdAt: new Date('2026-01-02T10:00:00Z')
  });
  assert.equal(Object.hasOwn(serializeAppointment(draftAppointment, 'parent'), 'parentProgressReport'), false);
  assert.equal(serializeAppointment(draftAppointment, 'specialist').parentProgressReport.status, 'draft');
});

test('session report drafts require consent and only become parent-visible after publication', async () => {
  const record = {
    ...appointmentWithReport(null),
    status: 'accepted',
    sessionStatus: 'completed'
  };
  const notifications = [];
  const service = new AppointmentService({
    repository: {
      async findOwnedAppointment() {
        return structuredClone(record);
      },
      async saveSessionReportDraft(_appointmentId, _specialistId, report, createdAt, now) {
        record.parentProgressReport = { ...report, status: 'draft', createdAt, updatedAt: now };
        return structuredClone(record);
      },
      async publishSessionReport(_appointmentId, _specialistId, now) {
        record.parentProgressReport.status = 'published';
        record.parentProgressReport.publishedAt = now;
        return structuredClone(record);
      }
    },
    childService: {
      async hasConsent() {
        return true;
      }
    },
    authRepository: { async createAuditEvent() {} },
    notificationService: { async notify(_recipient, notification) { notifications.push(notification); } },
    now: () => new Date('2026-01-03T10:00:00Z')
  });
  const specialist = { _id: specialistId };
  const report = { sessionSummary: 'تدرب الطفل على الأصوات.' };

  const draft = await service.saveSessionReportDraft(specialist, appointmentId, report);
  assert.equal(draft.parentProgressReport.status, 'draft');
  assert.equal(Object.hasOwn(serializeAppointment(record, 'parent'), 'parentProgressReport'), false);

  const published = await service.publishSessionReport(specialist, appointmentId);
  assert.equal(published.parentProgressReport.status, 'published');
  assert.equal(serializeAppointment(record, 'parent').parentProgressReport.sessionSummary, report.sessionSummary);
  assert.equal(notifications.length, 1);
});

test('session report drafts cannot be saved without parent consent', async () => {
  const service = new AppointmentService({
    repository: {
      async findOwnedAppointment() {
        return {
          ...appointmentWithReport(null),
          status: 'accepted',
          sessionStatus: 'completed'
        };
      }
    },
    childService: { async hasConsent() { return false; } }
  });

  await assert.rejects(
    service.saveSessionReportDraft({ _id: specialistId }, appointmentId, { sessionSummary: 'ملخص' }),
    { code: 'PROGRESS_REPORT_CONSENT_REQUIRED' }
  );
});
