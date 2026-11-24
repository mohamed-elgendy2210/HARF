import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeAppointment } from '../src/services/appointmentService.js';

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
