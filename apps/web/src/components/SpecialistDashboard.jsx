import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { displayNameOrFallback } from '../lib/displayName.js';
import NotificationCenter from './NotificationCenter.jsx';
import NotificationBell from './NotificationBell.jsx';
import AppointmentMeeting, { AppointmentJoinButton } from './appointments/AppointmentMeeting.jsx';

const days = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت'
];

const statuses = {
  pending: 'بانتظار القرار',
  awaiting_payment: 'في انتظار دفع ولي الأمر',
  payment_under_review: 'الدفع قيد المراجعة الإدارية',
  accepted: 'تم التأكيد',
  rejected: 'مرفوض',
  expired: 'انتهت مهلة الرد'
};
const sessionStatuses = {
  not_started: 'لم تبدأ',
  in_progress: 'جارية',
  completed: 'مكتملة',
  no_show: 'لم يحضر الطفل',
  specialist_no_show: 'أبلغ ولي الأمر عن عدم حضور الأخصائي'
};
const APPOINTMENTS_PER_PAGE = 6;
const sessionReportFields = [
  { key: 'sessionSummary', label: 'ملخص الجلسة', rows: 4 },
  { key: 'sessionGoals', label: 'أهداف الجلسة', rows: 3 },
  { key: 'activitiesPerformed', label: 'الأنشطة المنفذة', rows: 3 },
  { key: 'specialistObservations', label: 'ملاحظات الأخصائي', rows: 3 },
  { key: 'positiveAchievements', label: 'الإنجازات الإيجابية', rows: 3 },
  { key: 'furtherPractice', label: 'نقاط تحتاج إلى تدريب إضافي', rows: 3 },
  { key: 'parentRecommendations', label: 'توصيات لولي الأمر', rows: 3 },
  { key: 'nextSessionPlan', label: 'خطة الجلسة القادمة', rows: 3 }
];

function blankSessionReport(report = {}) {
  return Object.fromEntries(sessionReportFields.map(({ key }) => [key, report[key] ?? '']));
}

function isPublishedSessionReport(report) {
  return report?.status === 'published' || Boolean(report?.createdAt && !report.status);
}

function blankSchedule() {
  return {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo',
    price: '',
    appointmentDurationMinutes: 30,
    weeklySchedule: days.map((_, dayOfWeek) => ({ dayOfWeek, windows: [] })),
    exceptions: []
  };
}

function formatPrice(amountMinor, currency = 'EGP') {
  return new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(amountMinor / 100);
}

function formatAppointmentTime(appointment) {
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: appointment.timeZone,
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(appointment.startsAt));
}

function appointmentRequestTimestamp(appointment) {
  const requestedAt = Date.parse(appointment.requestedAt ?? '');
  if (Number.isFinite(requestedAt)) return requestedAt;
  const startsAt = Date.parse(appointment.startsAt ?? '');
  return Number.isFinite(startsAt) ? startsAt : 0;
}

export default function SpecialistDashboard({ user, onSignOut, onReauthenticate, onProfileUpdated }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [section, setSection] = useState(() => (
    new URLSearchParams(window.location.search).get('section') === 'appointments'
      ? 'appointments'
      : 'availability'
  ));
  const [form, setForm] = useState(blankSchedule);
  const [appointments, setAppointments] = useState([]);
  const [selectedLearningChildId, setSelectedLearningChildId] = useState('');
  const [specialistJourney, setSpecialistJourney] = useState(null);
  const [loadingSpecialistJourney, setLoadingSpecialistJourney] = useState(false);
  const [appointmentClock, setAppointmentClock] = useState(Date.now());
  const [visibleAppointmentCount, setVisibleAppointmentCount] = useState(APPOINTMENTS_PER_PAGE);
  const [meetingAppointment, setMeetingAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [documentsSaving, setDocumentsSaving] = useState(false);
  const [busyAppointmentId, setBusyAppointmentId] = useState('');
  const [busySessionId, setBusySessionId] = useState('');
  const [reportAppointmentId, setReportAppointmentId] = useState('');
  const [sessionReportDraft, setSessionReportDraft] = useState(blankSessionReport);
  const [reportPreview, setReportPreview] = useState(false);
  const [busyReportId, setBusyReportId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionStart, setExceptionStart] = useState('10:00');
  const [exceptionEnd, setExceptionEnd] = useState('11:00');
  const [exceptionUnavailable, setExceptionUnavailable] = useState(false);
  const [profile, setProfile] = useState(user.professionalProfile ?? {});

  useEffect(() => {
    if (section !== 'appointments') return undefined;
    const timer = window.setInterval(() => setAppointmentClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [section]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [{ availability }, { appointments: history }] = await Promise.all([
        apiRequest('/api/v1/specialist/availability'),
        apiRequest('/api/v1/appointments')
      ]);
      if (availability) {
        setForm({
          timeZone: availability.timeZone,
          price: (availability.appointmentPriceMinor / 100).toFixed(2),
          appointmentDurationMinutes: availability.appointmentDurationMinutes,
          weeklySchedule: availability.weeklySchedule,
          exceptions: availability.exceptions
        });
      } else {
        setForm(blankSchedule());
      }
      setAppointments(history);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (section !== 'learning' || !selectedLearningChildId) {
      setSpecialistJourney(null);
      return undefined;
    }
    let active = true;
    setLoadingSpecialistJourney(true);
    apiRequest(`/api/v1/specialist/children/${selectedLearningChildId}/learning-journey`)
      .then((journey) => { if (active) setSpecialistJourney(journey); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoadingSpecialistJourney(false); });
    return () => { active = false; };
  }, [section, selectedLearningChildId]);

  useEffect(() => {
    if (section !== 'appointments') return;
    const appointmentId = new URLSearchParams(window.location.search).get('appointmentId');
    const appointment = appointments.find((item) => item.id === appointmentId && item.status === 'accepted');
    if (appointment) {
      const location = new URL(window.location.href);
      location.searchParams.delete('appointmentId');
      window.history.replaceState(window.history.state, '', location);
      setMeetingAppointment(appointment);
    }
  }, [appointments, section]);

  const saveAvailability = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { availability } = await apiRequest('/api/v1/specialist/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeZone: form.timeZone,
          appointmentPriceMinor: Math.round(Number(form.price) * 100),
          appointmentCurrency: 'EGP',
          appointmentDurationMinutes: Number(form.appointmentDurationMinutes),
          weeklySchedule: form.weeklySchedule,
          exceptions: form.exceptions
        })
      });
      setForm((current) => ({ ...current, price: (availability.appointmentPriceMinor / 100).toFixed(2) }));
      setNotice('تم حفظ السعر والجدول والاستثناءات. ستظهر المواعيد للوالدين إذا كان ملفك معتمدًا ومعلنًا.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const updateDayWindow = (dayOfWeek, property, value) => {
    if (!value) {
      clearDay(dayOfWeek);
      return;
    }
    setForm((current) => ({
      ...current,
      weeklySchedule: current.weeklySchedule.map((day) => {
        if (day.dayOfWeek !== dayOfWeek) return day;
        const windows = day.windows.length
          ? [{ ...day.windows[0], [property]: value }]
          : [{ start: property === 'start' ? value : '09:00', end: property === 'end' ? value : '17:00' }];
        return { ...day, windows };
      })
    }));
  };

  const clearDay = (dayOfWeek) => {
    setForm((current) => ({
      ...current,
      weeklySchedule: current.weeklySchedule.map((day) => day.dayOfWeek === dayOfWeek
        ? { ...day, windows: [] } : day)
    }));
  };

  const addException = () => {
    if (!exceptionDate || (!exceptionUnavailable
      && (!exceptionStart || !exceptionEnd || exceptionStart >= exceptionEnd))) {
      setError('اختر تاريخًا صحيحًا وتأكد أن وقت النهاية بعد وقت البداية.');
      return;
    }
    const exception = {
      date: exceptionDate,
      windows: exceptionUnavailable ? [] : [{ start: exceptionStart, end: exceptionEnd }]
    };
    setForm((current) => ({
      ...current,
      exceptions: [...current.exceptions.filter((item) => item.date !== exceptionDate), exception]
        .sort((left, right) => left.date.localeCompare(right.date))
    }));
    setExceptionDate('');
    setError('');
  };

  const decideAppointment = async (appointment, decision) => {
    if (decision === 'accepted'
      && !window.confirm(`تأكيد موعد ${appointment.childName} يوم ${formatAppointmentTime(appointment)}؟`)) return;
    setBusyAppointmentId(appointment.id);
    setError('');
    setNotice('');
    try {
      const decisionNote = decision === 'rejected'
        ? window.prompt('سبب الرفض (اختياري):', '') ?? ''
        : '';
      await apiRequest(`/api/v1/appointments/${appointment.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, decisionNote })
      });
      setNotice(decision === 'accepted' ? 'تم تأكيد الموعد.' : 'تم رفض الطلب وإتاحة الموعد مجددًا.');
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.status === 401) onReauthenticate();
    } finally {
      setBusyAppointmentId('');
    }
  };

  const updateSession = async (appointment, action) => {
    let body;
    if (action === 'complete') {
      const privateNotes = window.prompt('ملاحظات مهنية خاصة بالأخصائي (لا يراها ولي الأمر):', '');
      if (privateNotes === null) return false;
      body = { privateNotes };
    }
    setBusySessionId(appointment.id);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/v1/appointments/${appointment.id}/session/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      setNotice(action === 'start'
        ? 'بدأت الجلسة وتم تسجيل وقت البدء.'
        : action === 'complete'
          ? 'انتهت الجلسة. يمكنك الآن إعداد تقريرها ومراجعته قبل نشره.'
          : 'تم تسجيل عدم حضور الطفل للموعد.');
      await loadData();
      return true;
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.status === 401) onReauthenticate();
      return false;
    } finally {
      setBusySessionId('');
    }
  };

  const openSessionReport = (appointment) => {
    setReportAppointmentId(appointment.id);
    setSessionReportDraft(blankSessionReport(appointment.parentProgressReport));
    setReportPreview(false);
    setError('');
    setNotice('');
  };

  const saveSessionReport = async (appointment, publish = false) => {
    if (publish && !sessionReportDraft.sessionSummary.trim()) {
      setError('اكتب ملخص الجلسة قبل نشر التقرير.');
      return;
    }
    if (publish && !window.confirm('سيظهر التقرير لولي الأمر في صفحة التقارير. هل تريد نشره؟')) return;
    setBusyReportId(appointment.id);
    setError('');
    setNotice('');
    try {
      const { appointment: savedDraft } = await apiRequest(`/api/v1/appointments/${appointment.id}/session-report`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionReportDraft)
      });
      setAppointments((current) => current.map((item) => item.id === savedDraft.id ? savedDraft : item));
      if (publish) {
        const { appointment: published } = await apiRequest(
          `/api/v1/appointments/${appointment.id}/session-report/publish`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
        );
        setAppointments((current) => current.map((item) => item.id === published.id ? published : item));
        setReportAppointmentId('');
        setNotice('تم نشر تقرير الجلسة وإتاحته لولي الأمر.');
      } else {
        setNotice('تم حفظ مسودة التقرير. لن تظهر لولي الأمر حتى تنشرها.');
      }
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.status === 401) onReauthenticate();
    } finally {
      setBusyReportId('');
    }
  };

  const pendingCount = appointments.filter(({ status }) => status === 'pending').length;
  const assignedChildren = [...new Map(appointments
    .filter(({ status, childId }) => status === 'accepted' && childId)
    .map((appointment) => [appointment.childId, {
      id: appointment.childId,
      name: appointment.childName || 'ملف طفل'
    }])).values()];
  const orderedAppointments = useMemo(() => [...appointments].sort(
    (first, second) => appointmentRequestTimestamp(second) - appointmentRequestTimestamp(first)
  ), [appointments]);
  const approvedProfile = user.approvalStatus === 'approved' && user.emailVerified && user.accountStatus === 'active';
  const journeyLevels = specialistJourney?.levels ?? [];
  const journeyAttempts = specialistJourney?.attempts ?? [];
  const completedLevels = journeyLevels.filter(({ status }) => status === 'completed').length;
  const completedActivities = journeyLevels.reduce((total, level) => total + level.completedGameIds.length, 0);
  const totalLevelActivities = journeyLevels.reduce((total, level) => total + level.gameIds.length, 0);
  const remainingRequiredGames = journeyLevels
    .filter(({ status }) => status !== 'locked')
    .reduce((total, level) => total + level.remainingRequiredGames, 0);
  const earnedBadges = specialistJourney?.rewards.badges.filter(({ earned }) => earned) ?? [];
  const earnedGifts = specialistJourney?.rewards.gifts.filter(({ earned }) => earned) ?? [];
  const journeyAttemptGroups = [...journeyAttempts.reduce((groups, attempt) => {
    const group = groups.get(attempt.gameId) ?? {
      gameId: attempt.gameId,
      title: attempt.gameTitle || attempt.gameId,
      count: 0,
      latestAttempt: attempt
    };
    group.count += 1;
    groups.set(attempt.gameId, group);
    return groups;
  }, new Map()).values()].sort((first, second) => second.count - first.count);
  const maxJourneyAttemptCount = Math.max(1, ...journeyAttemptGroups.map(({ count }) => count));
  const currentJourneyLevel = journeyLevels.find(({ status }) => status === 'in-progress')
    ?? journeyLevels.find(({ status }) => status === 'available');

  return (
    <div className="parent-dashboard specialist-dashboard" dir="rtl">
      <aside className={`dashboard-sidebar${mobileMenuOpen ? ' is-mobile-menu-open' : ''}`}>
        <div className="dashboard-sidebar__heading">
          <span className="dashboard-avatar" aria-hidden="true">✚</span>
          <div><strong>مساحة الأخصائي</strong><small>{displayNameOrFallback(user.professionalProfile?.displayName, user.email)}</small></div>
          <button type="button" className="dashboard-sidebar__toggle"
            aria-label={mobileMenuOpen ? 'إغلاق قائمة الأخصائي' : 'فتح قائمة الأخصائي'}
            aria-expanded={mobileMenuOpen} aria-controls="specialist-dashboard-navigation"
            onClick={() => setMobileMenuOpen((open) => !open)}>
            <span /><span /><span />
          </button>
        </div>
        <nav className="dashboard-nav" id="specialist-dashboard-navigation" aria-label="أقسام لوحة الأخصائي">
          <button type="button" className={section === 'availability' ? 'dashboard-nav__item is-active' : 'dashboard-nav__item'}
            aria-current={section === 'availability' ? 'page' : undefined} onClick={() => {
              setSection('availability');
              setMobileMenuOpen(false);
            }}>
            جدول المواعيد
          </button>
          <button type="button" className={section === 'profile' ? 'dashboard-nav__item is-active' : 'dashboard-nav__item'}
            aria-current={section === 'profile' ? 'page' : undefined} onClick={() => {
              setSection('profile');
              setMobileMenuOpen(false);
            }}>
            تعديل الملف الشخصي
          </button>
          <button type="button" className={section === 'appointments' ? 'dashboard-nav__item is-active' : 'dashboard-nav__item'}
            aria-current={section === 'appointments' ? 'page' : undefined} onClick={() => {
              setSection('appointments');
              setMobileMenuOpen(false);
            }}>
            طلبات وسجل المواعيد{pendingCount ? ` (${pendingCount})` : ''}
          </button>
          {assignedChildren.length > 0 && (
            <button type="button" className={section === 'learning' ? 'dashboard-nav__item is-active' : 'dashboard-nav__item'}
              aria-current={section === 'learning' ? 'page' : undefined} onClick={() => {
                setSection('learning');
                setMobileMenuOpen(false);
              }}>
              تقدم الأطفال
            </button>
          )}
          <button type="button" className={section === 'notifications' ? 'dashboard-nav__item is-active' : 'dashboard-nav__item'}
            aria-current={section === 'notifications' ? 'page' : undefined} onClick={() => {
              setSection('notifications');
              setMobileMenuOpen(false);
            }}>
            الإشعارات
          </button>
        </nav>
        <div className="dashboard-sidebar__note">
          حجز الجلسة خدمة اختيارية، ولا يمنع الأسرة من استخدام الألعاب التعليمية.
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-main__header">
          <div>
            <span className="dashboard-eyebrow">حرف · الأخصائيون</span>
            <h2>{section === 'availability' ? 'مواعيدك المتاحة' : section === 'profile' ? 'تعديل الملف الشخصي' : section === 'notifications' ? 'الإشعارات' : section === 'learning' ? 'التقدم التعليمي للأطفال' : 'طلبات وسجل المواعيد'}</h2>
          </div>
          <div className="dashboard-main__header-actions">
            <NotificationBell onOpenNotifications={() => setSection('notifications')} />
            <button className="button button--small button--outline" type="button" onClick={onSignOut}>تسجيل الخروج</button>
          </div>
        </header>

        {!approvedProfile && (
          <div className="dashboard-consent-prompt">
            <p>لن يظهر ملفك في الدليل قبل توثيق البريد واعتماد الإدارة واكتمال الملف واختيار النشر. يمكنك مراجعة الشروط أدناه.</p>
          </div>
        )}
        {notice && <p className="auth-message" role="status">{notice}</p>}
        {error && (
          <div className="auth-error" role="alert">
            <p>{error}</p>
            {error.includes('جلسة') && <button className="auth-text-button" type="button" onClick={onReauthenticate}>تسجيل الدخول مجددًا</button>}
          </div>
        )}
        {loading ? <p className="dashboard-loading" role="status">جارٍ تحميل بيانات المواعيد…</p> : section === 'notifications' ? (
          <NotificationCenter appointmentHref="/specialist?section=appointments" />
        ) : section === 'profile' ? (
          <>
          <section className="specialist-visibility-status" aria-labelledby="specialist-visibility-title">
            <h3 id="specialist-visibility-title">حالة الظهور في دليل الأخصائيين</h3>
            <ul>
              <li>{user.emailVerified ? '✓ البريد الإلكتروني موثّق' : 'بانتظار توثيق البريد الإلكتروني'}</li>
              <li>{user.approvalStatus === 'approved' ? '✓ اعتماد الإدارة مكتمل' : 'بانتظار اعتماد الإدارة'}</li>
              <li>{user.accountStatus === 'active' ? '✓ الحساب نشط' : 'الحساب غير نشط حاليًا'}</li>
              <li>{profile.complete ? '✓ بيانات الملف المهني مكتملة' : 'أكمل الاسم المهني والتخصص والمؤهلات والنبذة، وتأكد من عدم ظهور الاسم كعلامات استفهام'}</li>
              <li>{profile.publicListing ? '✓ طلبت الظهور في الدليل' : 'فعّل خيار الظهور في الدليل واحفظ التغييرات'}</li>
              <li>{profile.identityDocumentsComplete ? '✓ تم رفع صور التحقق المطلوبة' : 'ارفع الصورة الشخصية وصورتي الكارنيه لإكمال التحقق'}</li>
            </ul>
            {profile.directoryEligibility && (
              <p className={profile.directoryEligibility.eligible ? 'auth-message' : 'auth-description'} role="status">
                {profile.directoryEligibility.eligible
                  ? 'ملفك مستوفٍ لشروط دليل الأخصائيين. إذا لم يظهر بعد إعادة تحميل الصفحة، اطلب من المسؤول مراجعة إعدادات النشر أو حالة الخدمة.'
                  : 'لن يظهر ملفك بعد. أكمل الشروط غير المستوفاة أعلاه ثم احفظ الملف المهني.'}
              </p>
            )}
          </section>
          <form className="auth-form specialist-profile-form" onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError('');
            setNotice('');
            try {
              const { user: updatedUser } = await apiRequest('/api/v1/auth/specialist/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  displayName: profile.displayName ?? '',
                  specialty: profile.specialty ?? '',
                  credentials: profile.credentials ?? '',
                  bio: profile.bio ?? '',
                  publicListing: profile.publicListing === true
                })
              });
              onProfileUpdated(updatedUser);
              setNotice('تم حفظ الملف المهني.');
            } catch (requestError) {
              setError(requestError.message);
            } finally {
              setSaving(false);
            }
          }}>
            <p className="auth-description">يظهر ملفك في الدليل بعد اعتماد الإدارة، وتأكيد البريد، وإكمال التفاصيل واختيار النشر.</p>
            <label>الاسم المهني
              <input required minLength={2} maxLength={100} value={profile.displayName ?? ''}
                onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))} />
            </label>
            <label>التخصص
              <input required minLength={2} maxLength={100} value={profile.specialty ?? ''}
                onChange={(event) => setProfile((current) => ({ ...current, specialty: event.target.value }))} />
            </label>
            <label>المؤهلات المهنية
              <input required minLength={2} maxLength={160} value={profile.credentials ?? ''}
                onChange={(event) => setProfile((current) => ({ ...current, credentials: event.target.value }))} />
            </label>
            <label>نبذة مهنية
              <textarea required minLength={2} maxLength={1200} rows={5} value={profile.bio ?? ''}
                onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))} />
            </label>
            <label className="dashboard-checkbox">
              <input type="checkbox" checked={profile.publicListing === true}
                onChange={(event) => setProfile((current) => ({ ...current, publicListing: event.target.checked }))} />
              أرغب في إظهار ملفي في دليل الأخصائيين
            </label>
            <button type="submit" className="button button--primary" disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ الملف المهني'}
            </button>
          </form>
          <form className="auth-form specialist-profile-form specialist-document-update" onSubmit={async (event) => {
            event.preventDefault();
            const uploadForm = event.currentTarget;
            setDocumentsSaving(true);
            setError('');
            setNotice('');
            try {
              const { user: updatedUser } = await apiRequest('/api/v1/auth/specialist/documents', {
                method: 'POST',
                body: new FormData(uploadForm)
              });
              onProfileUpdated(updatedUser);
              setProfile(updatedUser.professionalProfile);
              uploadForm.reset();
              setNotice('تم تحديث صور التحقق.');
            } catch (requestError) {
              setError(requestError.message);
            } finally {
              setDocumentsSaving(false);
            }
          }}>
            <h3>صور التحقق المهني</h3>
            <p className="dashboard-privacy-note">مستندات الكارنيه لا تظهر في الدليل ولا لولي الأمر، وتتاح للمسؤولين المخولين للمراجعة فقط. ارفع الصور الثلاث عند التحديث.</p>
            <label>الصورة الشخصية
              <input name="profilePhoto" type="file" accept="image/png,image/jpeg,image/webp" required />
            </label>
            <label>الوجه الأمامي للكارنيه
              <input name="medicalCardFront" type="file" accept="image/png,image/jpeg,image/webp" required />
            </label>
            <label>الوجه الخلفي للكارنيه
              <input name="medicalCardBack" type="file" accept="image/png,image/jpeg,image/webp" required />
            </label>
            <button type="submit" className="button button--outline" disabled={documentsSaving}>
              {documentsSaving ? 'جارٍ رفع الصور…' : 'تحديث صور التحقق'}
            </button>
          </form>
          </>
        ) : section === 'learning' ? (
          <section className="dashboard-section">
            <h3>التقدم التعليمي للأطفال</h3>
            <p className="dashboard-privacy-note">تظهر بيانات الرحلة بعد وجود موعد مؤكد وموافقة ولي الأمر على مشاركة تقارير التقدم. النجوم مكافآت تفاعلية وليست قياسًا تشخيصيًا.</p>
            <div className="admin-reward-child-results">
              {assignedChildren.map((child) => (
                <button type="button" key={child.id}
                  className={selectedLearningChildId === child.id ? 'is-selected' : ''}
                  onClick={() => {
                    setError('');
                    setSelectedLearningChildId(child.id);
                  }}>{child.name}</button>
              ))}
            </div>
            {loadingSpecialistJourney && <p className="dashboard-loading" role="status">جارٍ تحميل رحلة الطفل…</p>}
            {specialistJourney && (
              <>
                <div className="specialist-journey-summary">
                  <article className="specialist-journey-stat specialist-journey-stat--teal">
                    <span className="specialist-journey-stat__icon" aria-hidden="true">✦</span>
                    <div><small>إجمالي المحاولات</small><strong>{specialistJourney.attemptCount ?? '—'}</strong>
                      <p>محاولة محفوظة في سجل الطفل</p></div>
                  </article>
                  <article className="specialist-journey-stat specialist-journey-stat--orange">
                    <span className="specialist-journey-stat__icon" aria-hidden="true">★</span>
                    <div><small>النجوم المكتسبة</small><strong>{specialistJourney.rewards.totalStars}</strong>
                      <p>مكافآت تفاعلية مسجلة</p></div>
                  </article>
                  <article className="specialist-journey-stat specialist-journey-stat--purple">
                    <span className="specialist-journey-stat__icon" aria-hidden="true">▰</span>
                    <div><small>المستويات المكتملة</small><strong>{completedLevels}<span> / {journeyLevels.length}</span></strong>
                      <p>من مستويات المسارات المعينة</p></div>
                  </article>
                  <article className="specialist-journey-stat specialist-journey-stat--blue">
                    <span className="specialist-journey-stat__icon" aria-hidden="true">✓</span>
                    <div><small>الأنشطة المكتملة</small><strong>{completedActivities}<span> / {totalLevelActivities}</span></strong>
                      <p>ضمن مستويات الطفل المعينة</p></div>
                  </article>
                </div>
                {currentJourneyLevel && (
                  <div className="specialist-journey-current">
                    <span className="specialist-journey-current__marker" aria-hidden="true">➜</span>
                    <div><small>{currentJourneyLevel.status === 'in-progress' ? 'المستوى الجاري' : 'المستوى التالي المتاح'}</small>
                      <strong>{currentJourneyLevel.learningPathTitle} · {currentJourneyLevel.title}</strong>
                      <p>{remainingRequiredGames} نشاطًا مطلوبًا متبقيًا في المستويات المفتوحة</p></div>
                    <b>{currentJourneyLevel.completionPercent}%</b>
                  </div>
                )}
                <div className="specialist-journey-charts">
                  <section className="specialist-journey-chart">
                    <header><div><h4>التقدم في المستويات</h4>
                      <p>نسبة الأنشطة المكتملة من إجمالي أنشطة كل مستوى.</p></div>
                      <span>{journeyLevels.length} مستويات</span></header>
                    {journeyLevels.length ? journeyLevels.map((level) => {
                      const percent = Math.max(0, Math.min(100, Number(level.completionPercent) || 0));
                      return (
                        <article className="specialist-level-bar" key={level.id}>
                          <div className="specialist-level-bar__heading">
                            <strong>{level.title}</strong>
                            <span>{level.status === 'completed' ? 'مكتمل' : level.status === 'locked' ? 'مقفل' : level.status === 'in-progress' ? 'قيد التقدم' : 'متاح'}</span>
                          </div>
                          <div className="specialist-chart-track" role="progressbar" aria-label={`إنجاز ${level.title}`}
                            aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
                            <span className="specialist-chart-track__fill specialist-chart-track__fill--level"
                              style={{ width: `${percent}%` }} />
                          </div>
                          <small>{level.completedGameIds.length} من {level.gameIds.length} أنشطة مكتملة · {percent}%</small>
                        </article>
                      );
                    }) : <p className="specialist-journey-empty">لا توجد مستويات تعليمية معينة لهذا الطفل بعد.</p>}
                  </section>
                  <section className="specialist-journey-chart">
                    <header><div><h4>المحاولات حسب النشاط</h4>
                      <p>عدد المحاولات ضمن آخر 20 سجلًا، دون مقارنة درجات ألعاب مختلفة.</p></div>
                      <span>الإجمالي: {specialistJourney.attemptCount ?? '—'}</span></header>
                    {journeyAttemptGroups.length ? journeyAttemptGroups.slice(0, 6).map((group) => (
                      <article className="specialist-activity-bar" key={group.gameId}>
                        <div className="specialist-activity-bar__heading">
                          <strong>{group.title}</strong>
                          <b>{group.count} {group.count === 1 ? 'محاولة' : 'محاولات'}</b>
                        </div>
                        <div className="specialist-chart-track" aria-hidden="true">
                          <span className="specialist-chart-track__fill specialist-chart-track__fill--activity"
                            style={{ width: `${(group.count / maxJourneyAttemptCount) * 100}%` }} />
                        </div>
                        <small>آخر نتيجة مسجلة: {group.latestAttempt.correctCount} من {group.latestAttempt.totalQuestions}</small>
                      </article>
                    )) : <p className="specialist-journey-empty">لا توجد محاولات محفوظة لعرضها حتى الآن.</p>}
                  </section>
                </div>
                <section className="specialist-journey-rewards">
                  <div><h4>الشارات المكتسبة</h4>
                    {earnedBadges.length
                      ? <div className="specialist-journey-reward-list">{earnedBadges.map(({ id, name }) => <span key={id}>{name}</span>)}</div>
                      : <p>لا توجد شارات مكتسبة بعد.</p>}
                  </div>
                  <div><h4>الهدايا المفتوحة</h4>
                    {earnedGifts.length
                      ? <div className="specialist-journey-reward-list specialist-journey-reward-list--gifts">{earnedGifts.map(({ id, name }) => <span key={id}>{name}</span>)}</div>
                      : <p>لا توجد هدايا مفتوحة بعد.</p>}
                  </div>
                </section>
                <section className="specialist-journey-recent">
                  <h4>أحدث المحاولات المحفوظة</h4>
                  {journeyAttempts.length ? journeyAttempts.slice(0, 5).map((attempt) => (
                    <article key={attempt.id}>
                      <strong>{attempt.gameTitle || attempt.gameId}</strong>
                      <span>{attempt.correctCount} من {attempt.totalQuestions} إجابات صحيحة</span>
                      <time dateTime={attempt.completedAt}>{new Date(attempt.completedAt).toLocaleDateString('ar')}</time>
                    </article>
                  )) : <p className="specialist-journey-empty">لم تُسجل محاولات بعد.</p>}
                </section>
              </>
            )}
          </section>
        ) : section === 'availability' ? (
          <form className="specialist-availability-form" onSubmit={saveAvailability}>
            <section className="dashboard-section">
              <h3>سعر الجلسة ومدتها</h3>
              <p>السعر مستقل عن اشتراك الألعاب. لا تُحصّل المنصة رسوم الجلسات في هذه المرحلة.</p>
              <div className="specialist-availability-form__settings">
                <label>السعر بالجنيه المصري
                  <input type="number" min="1" max="1000000" step="0.01" required value={form.price}
                    onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} />
                </label>
                <label>مدة الموعد بالدقائق
                  <select value={form.appointmentDurationMinutes}
                    onChange={(event) => setForm((current) => ({ ...current, appointmentDurationMinutes: Number(event.target.value) }))}>
                    {[15, 30, 45, 60, 90, 120, 180, 240].map((duration) => (
                      <option key={duration} value={duration}>{duration} دقيقة</option>
                    ))}
                  </select>
                </label>
                <label>المنطقة الزمنية (IANA)
                  <input required maxLength={80} value={form.timeZone}
                    onChange={(event) => setForm((current) => ({ ...current, timeZone: event.target.value }))} />
                </label>
              </div>
              <p className="dashboard-privacy-note">مثال: Africa/Cairo. الأوقات المعروضة للأسر تُحوّل إلى منطقتك الزمنية.</p>
            </section>

            <section className="dashboard-section">
              <h3>التوفر الأسبوعي</h3>
              <p>أدخل وقتًا واحدًا لكل يوم. اترك اليوم بلا وقت إذا كنت غير متاح. تُقسم الفترات إلى مواعيد كل ١٥ دقيقة.</p>
              <div className="specialist-weekly-schedule">
                {days.map((dayName, dayOfWeek) => {
                  const scheduleDay = form.weeklySchedule.find((item) => item.dayOfWeek === dayOfWeek);
                  const window = scheduleDay?.windows[0];
                  return (
                    <fieldset key={dayOfWeek}>
                      <legend>{dayName}</legend>
                      <label>من
                        <input type="time" step="900" value={window?.start ?? ''}
                          onChange={(event) => updateDayWindow(dayOfWeek, 'start', event.target.value)} />
                      </label>
                      <label>إلى
                        <input type="time" step="900" value={window?.end ?? ''}
                          onChange={(event) => updateDayWindow(dayOfWeek, 'end', event.target.value)} />
                      </label>
                      <button type="button" className="button button--small button--outline"
                        disabled={!window} onClick={() => clearDay(dayOfWeek)}>إزالة</button>
                    </fieldset>
                  );
                })}
              </div>
            </section>

            <section className="dashboard-section">
              <h3>استثناءات التوفر</h3>
              <p>يمكن حظر يوم محدد أو استبدال جدوله الأسبوعي بفترة خاصة.</p>
              <div className="specialist-availability-form__settings">
                <label>التاريخ
                  <input type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} />
                </label>
                <label className="dashboard-checkbox">
                  <input type="checkbox" checked={exceptionUnavailable} onChange={(event) => setExceptionUnavailable(event.target.checked)} />
                  غير متاح طوال اليوم
                </label>
                {!exceptionUnavailable && <>
                  <label>من
                    <input type="time" step="900" value={exceptionStart} onChange={(event) => setExceptionStart(event.target.value)} />
                  </label>
                  <label>إلى
                    <input type="time" step="900" value={exceptionEnd} onChange={(event) => setExceptionEnd(event.target.value)} />
                  </label>
                </>}
                <button type="button" className="button button--small button--outline" onClick={addException}>إضافة الاستثناء</button>
              </div>
              {form.exceptions.length === 0 ? <p className="dashboard-empty-state">لا توجد استثناءات محفوظة.</p> : (
                <ul className="specialist-exception-list">
                  {form.exceptions.map((exception) => (
                    <li key={exception.date}>
                      <span>{exception.date} · {exception.windows.length
                        ? exception.windows.map((window) => `${window.start}–${window.end}`).join('، ')
                        : 'غير متاح'}</span>
                      <button type="button" className="auth-text-button"
                        onClick={() => setForm((current) => ({
                          ...current,
                          exceptions: current.exceptions.filter((item) => item.date !== exception.date)
                        }))}>حذف</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <button type="submit" className="button button--primary" disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ التوفر والسعر'}
            </button>
          </form>
        ) : (
          <section className="dashboard-section">
            <h3>سجل المواعيد</h3>
            <p>طلبات الحجز تنتهي بعد ٤٨ ساعة دون قرار. ردّك على الطلب يحجز أو يحرر الموعد.</p>
            {appointments.length === 0 ? <div className="dashboard-empty-state">لا توجد طلبات أو مواعيد مسجلة.</div> : (
              <div className="specialist-appointment-list">
                {orderedAppointments.slice(0, visibleAppointmentCount).map((appointment) => (
                  <article className="specialist-appointment-card" key={appointment.id}>
                    <div>
                      <h4>{appointment.childName || 'ملف طفل'}</h4>
                      <time dateTime={appointment.startsAt}>{formatAppointmentTime(appointment)}</time>
                      <p>ولي الأمر: {appointment.parentName || 'غير متاح'} · {appointment.durationMinutes} دقيقة · {formatPrice(appointment.amountMinor, appointment.currency)}</p>
                      <span className={`appointment-status appointment-status--${appointment.status}`}>{statuses[appointment.status]}</span>
                      {['awaiting_payment', 'payment_under_review'].includes(appointment.status) && (
                        <p className="dashboard-privacy-note">
                          {appointment.status === 'awaiting_payment'
                            ? 'وافق الأخصائي على الطلب، والموعد ينتظر إتمام ولي الأمر للدفع.'
                            : 'أرسل ولي الأمر إيصال الدفع، وهو قيد المراجعة الإدارية.'}
                        </p>
                      )}
                      {appointment.status === 'accepted' && (
                        <p>حالة الجلسة: {sessionStatuses[appointment.sessionStatus] || sessionStatuses.not_started}
                          {appointment.sessionStartedAt ? ` · بدأت ${formatAppointmentTime({ ...appointment, startsAt: appointment.sessionStartedAt })}` : ''}
                          {appointment.sessionEndedAt ? ` · انتهت ${formatAppointmentTime({ ...appointment, startsAt: appointment.sessionEndedAt })}` : ''}
                        </p>
                      )}
                      {appointment.status === 'pending' && <p>مهلة الرد حتى {new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(appointment.expiresAt))}</p>}
                      {appointment.decisionNote && <p>ملاحظة القرار: {appointment.decisionNote}</p>}
                      {appointment.privateSpecialistNotes && <p>ملاحظات مهنية خاصة: {appointment.privateSpecialistNotes}</p>}
                      {appointment.parentProgressReport?.status === 'draft' && (
                        <p className="dashboard-privacy-note">توجد مسودة تقرير محفوظة، ولا تظهر لولي الأمر قبل نشرها.</p>
                      )}
                    </div>
                    {appointment.status === 'pending' && (
                      <div className="specialist-appointment-card__actions">
                        <button type="button" className="button button--small button--primary"
                          disabled={Boolean(busyAppointmentId)} onClick={() => decideAppointment(appointment, 'accepted')}>
                          تأكيد الموعد
                        </button>
                        <button type="button" className="button button--small button--outline"
                          disabled={Boolean(busyAppointmentId)} onClick={() => decideAppointment(appointment, 'rejected')}>
                          رفض الطلب
                        </button>
                        {busyAppointmentId === appointment.id && <span role="status">جارٍ الحفظ…</span>}
                      </div>
                    )}
                    {appointment.status === 'accepted'
                      && !['completed', 'no_show', 'specialist_no_show'].includes(appointment.sessionStatus) && (
                      <div className="specialist-appointment-card__actions">
                        {appointment.meetingAvailable && (
                          <AppointmentJoinButton
                            appointment={appointment}
                            viewerRole="specialist"
                            onJoin={() => setMeetingAppointment(appointment)}
                          />
                        )}
                        {appointment.sessionStatus === 'in_progress' && (
                          <button type="button" className="button button--small button--outline"
                            disabled={Boolean(busySessionId)}
                            onClick={() => updateSession(appointment, 'complete')}>
                            {busySessionId === appointment.id ? 'جارٍ الحفظ…' : 'إنهاء وتوثيق الجلسة'}
                          </button>
                        )}
                        {!appointment.meetingAvailable && appointment.sessionStatus !== 'in_progress' && (
                          <button type="button" className="button button--small button--primary"
                            disabled={Boolean(busySessionId)}
                            onClick={() => updateSession(appointment, 'start')}>
                            {busySessionId === appointment.id ? 'جارٍ الحفظ…' : 'بدء تسجيل الجلسة'}
                          </button>
                        )}
                        {appointment.sessionStatus === 'not_started'
                          && new Date(appointment.endsAt).getTime() <= appointmentClock && (
                            <button type="button" className="button button--small button--outline"
                              disabled={Boolean(busySessionId)}
                              onClick={() => {
                                if (window.confirm('هل تريد تسجيل عدم حضور الطفل لهذا الموعد؟ لا يمكن التراجع عن هذا الإجراء.')) {
                                  void updateSession(appointment, 'no-show');
                                }
                              }}>
                              {busySessionId === appointment.id ? 'جارٍ الحفظ…' : 'تسجيل عدم حضور الطفل'}
                            </button>
                          )}
                      </div>
                    )}
                    {appointment.status === 'accepted' && (
                      <p className="dashboard-privacy-note">
                        حالة الجلسة المرئية: {appointment.meetingStatus === 'live' ? 'جارية'
                          : appointment.meetingStatus === 'ended' ? 'منتهية'
                            : appointment.meetingAvailable ? 'مجدولة' : 'غير متاحة'}.
                        ملاحظاتك المهنية الخاصة لا تظهر إلا لك.
                      </p>
                    )}
                    {appointment.status === 'accepted' && appointment.sessionStatus === 'completed' && (
                      <section className="specialist-session-report" aria-label="تقرير الجلسة">
                        {isPublishedSessionReport(appointment.parentProgressReport) ? (
                          <details className="specialist-session-report__published">
                            <summary>عرض التقرير المنشور · {formatAppointmentTime({
                              ...appointment,
                              startsAt: appointment.parentProgressReport.publishedAt
                                ?? appointment.parentProgressReport.createdAt
                                ?? appointment.startsAt
                            })}</summary>
                            <div className="specialist-session-report__content">
                              {sessionReportFields.map(({ key, label }) => {
                                const value = key === 'sessionSummary'
                                  ? appointment.parentProgressReport.sessionSummary
                                    || appointment.parentProgressReport.summary
                                  : appointment.parentProgressReport[key];
                                return <section key={key}><h5>{label}</h5>
                                  <p>{value || 'لم تتم إضافة محتوى لهذا القسم.'}</p>
                                </section>;
                              })}
                              {appointment.parentProgressReport.suggestedActivities?.length > 0 && (
                                <section><h5>أنشطة مقترحة</h5>
                                  <ul>{appointment.parentProgressReport.suggestedActivities.map((activity) => <li key={activity}>{activity}</li>)}</ul>
                                </section>
                              )}
                            </div>
                          </details>
                        ) : (
                          <>
                            <button type="button" className="button button--small button--outline"
                              onClick={() => openSessionReport(appointment)}>
                              {appointment.parentProgressReport?.status === 'draft' ? 'تعديل مسودة التقرير' : 'إعداد تقرير الجلسة'}
                            </button>
                            {reportAppointmentId === appointment.id && (
                              <div className="specialist-session-report__editor">
                                {reportPreview ? (
                                  <article className="specialist-session-report__content" aria-label="معاينة التقرير">
                                    <h4>معاينة تقرير الجلسة · {appointment.childName || 'ملف طفل'}</h4>
                                    {sessionReportFields.map(({ key, label }) => (
                                      <section key={key}><h5>{label}</h5>
                                        <p>{sessionReportDraft[key] || 'لم تتم إضافة محتوى لهذا القسم.'}</p>
                                      </section>
                                    ))}
                                  </article>
                                ) : (
                                  <div className="specialist-session-report__fields">
                                    {sessionReportFields.map(({ key, label, rows }) => (
                                      <label key={key} htmlFor={`session-report-${appointment.id}-${key}`}>
                                        {label}
                                        <textarea id={`session-report-${appointment.id}-${key}`} rows={rows}
                                          maxLength={key === 'sessionSummary' || key === 'activitiesPerformed'
                                            || key === 'specialistObservations' ? 4000 : 3000}
                                          value={sessionReportDraft[key]}
                                          onChange={(event) => setSessionReportDraft((current) => ({
                                            ...current,
                                            [key]: event.target.value
                                          }))} />
                                      </label>
                                    ))}
                                  </div>
                                )}
                                <div className="specialist-session-report__actions">
                                  <button type="button" className="button button--small button--outline"
                                    disabled={Boolean(busyReportId)}
                                    onClick={() => setReportPreview((current) => !current)}>
                                    {reportPreview ? 'العودة للتحرير' : 'معاينة التقرير'}
                                  </button>
                                  <button type="button" className="button button--small button--outline"
                                    disabled={Boolean(busyReportId)}
                                    onClick={() => saveSessionReport(appointment)}>
                                    {busyReportId === appointment.id ? 'جارٍ الحفظ…' : 'حفظ كمسودة'}
                                  </button>
                                  <button type="button" className="button button--small button--primary"
                                    disabled={Boolean(busyReportId)}
                                    onClick={() => saveSessionReport(appointment, true)}>
                                    {busyReportId === appointment.id ? 'جارٍ النشر…' : 'نشر لولي الأمر'}
                                  </button>
                                  <button type="button" className="button button--small button--outline"
                                    disabled={Boolean(busyReportId)}
                                    onClick={() => setReportAppointmentId('')}>إغلاق</button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </section>
                    )}
                  </article>
                ))}
              </div>
            )}
            {orderedAppointments.length > visibleAppointmentCount && (
              <button
                type="button"
                className="button button--outline"
                onClick={() => setVisibleAppointmentCount((count) => count + APPOINTMENTS_PER_PAGE)}
              >
                إظهار المزيد
              </button>
            )}
          </section>
        )}
      </main>
      {meetingAppointment && (
        <AppointmentMeeting
          appointment={meetingAppointment}
          viewerRole="specialist"
          displayName={displayNameOrFallback(user.professionalProfile?.displayName, user.email)}
          onEndSession={() => updateSession(meetingAppointment, 'complete')}
          onClose={() => {
            setMeetingAppointment(null);
            void loadData();
          }}
        />
      )}
    </div>
  );
}
