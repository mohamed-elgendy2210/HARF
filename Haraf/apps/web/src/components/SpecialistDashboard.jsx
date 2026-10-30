import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { displayNameOrFallback } from '../lib/displayName.js';
import NotificationCenter from './NotificationCenter.jsx';
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
  accepted: 'تم التأكيد',
  rejected: 'مرفوض',
  expired: 'انتهت مهلة الرد'
};
const sessionStatuses = {
  not_started: 'لم تبدأ',
  in_progress: 'جارية',
  completed: 'مكتملة'
};

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

export default function SpecialistDashboard({ user, onSignOut, onReauthenticate, onProfileUpdated }) {
  const [section, setSection] = useState(() => (
    new URLSearchParams(window.location.search).get('section') === 'appointments'
      ? 'appointments'
      : 'availability'
  ));
  const [form, setForm] = useState(blankSchedule);
  const [appointments, setAppointments] = useState([]);
  const [meetingAppointment, setMeetingAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [documentsSaving, setDocumentsSaving] = useState(false);
  const [busyAppointmentId, setBusyAppointmentId] = useState('');
  const [busySessionId, setBusySessionId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionStart, setExceptionStart] = useState('10:00');
  const [exceptionEnd, setExceptionEnd] = useState('11:00');
  const [exceptionUnavailable, setExceptionUnavailable] = useState(false);
  const [profile, setProfile] = useState(user.professionalProfile ?? {});

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
      const summary = window.prompt('ملخص تعليمي اختياري لولي الأمر (يتطلب موافقة التقارير):', '');
      if (summary === null) return false;
      body = {
        privateNotes,
        ...(summary.trim() ? { parentReport: { summary: summary.trim(), suggestedActivities: [] } } : {})
      };
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
      setNotice(action === 'start' ? 'بدأت الجلسة وتم تسجيل وقت البدء.' : 'انتهت الجلسة وحُفظ الملخص التعليمي لولي الأمر.');
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

  const pendingCount = appointments.filter(({ status }) => status === 'pending').length;
  const approvedProfile = user.approvalStatus === 'approved' && user.emailVerified && user.accountStatus === 'active';

  return (
    <div className="parent-dashboard specialist-dashboard" dir="rtl">
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar__heading">
          <span className="dashboard-avatar" aria-hidden="true">✚</span>
          <div><strong>مساحة الأخصائي</strong><small>{displayNameOrFallback(user.professionalProfile?.displayName, user.email)}</small></div>
        </div>
        <nav className="dashboard-nav" aria-label="أقسام لوحة الأخصائي">
          <button type="button" className={section === 'availability' ? 'dashboard-nav__item is-active' : 'dashboard-nav__item'}
            aria-current={section === 'availability' ? 'page' : undefined} onClick={() => setSection('availability')}>
            جدول المواعيد
          </button>
          <button type="button" className={section === 'profile' ? 'dashboard-nav__item is-active' : 'dashboard-nav__item'}
            aria-current={section === 'profile' ? 'page' : undefined} onClick={() => setSection('profile')}>
            الملف المهني
          </button>
          <button type="button" className={section === 'appointments' ? 'dashboard-nav__item is-active' : 'dashboard-nav__item'}
            aria-current={section === 'appointments' ? 'page' : undefined} onClick={() => setSection('appointments')}>
            طلبات وسجل المواعيد{pendingCount ? ` (${pendingCount})` : ''}
          </button>
          <button type="button" className={section === 'notifications' ? 'dashboard-nav__item is-active' : 'dashboard-nav__item'}
            aria-current={section === 'notifications' ? 'page' : undefined} onClick={() => setSection('notifications')}>
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
            <h2>{section === 'availability' ? 'مواعيدك المتاحة' : section === 'profile' ? 'ملفك المهني' : section === 'notifications' ? 'الإشعارات' : 'طلبات وسجل المواعيد'}</h2>
          </div>
          <button className="button button--small button--outline" type="button" onClick={onSignOut}>تسجيل الخروج</button>
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
                {appointments.map((appointment) => (
                  <article className="specialist-appointment-card" key={appointment.id}>
                    <div>
                      <h4>{appointment.childName || 'ملف طفل'}</h4>
                      <time dateTime={appointment.startsAt}>{formatAppointmentTime(appointment)}</time>
                      <p>ولي الأمر: {appointment.parentName || 'غير متاح'} · {appointment.durationMinutes} دقيقة · {formatPrice(appointment.amountMinor, appointment.currency)}</p>
                      <span className={`appointment-status appointment-status--${appointment.status}`}>{statuses[appointment.status]}</span>
                      {appointment.status === 'accepted' && (
                        <p>حالة الجلسة: {sessionStatuses[appointment.sessionStatus] || sessionStatuses.not_started}
                          {appointment.sessionStartedAt ? ` · بدأت ${formatAppointmentTime({ ...appointment, startsAt: appointment.sessionStartedAt })}` : ''}
                          {appointment.sessionEndedAt ? ` · انتهت ${formatAppointmentTime({ ...appointment, startsAt: appointment.sessionEndedAt })}` : ''}
                        </p>
                      )}
                      {appointment.status === 'pending' && <p>مهلة الرد حتى {new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(appointment.expiresAt))}</p>}
                      {appointment.decisionNote && <p>ملاحظة القرار: {appointment.decisionNote}</p>}
                      {appointment.privateSpecialistNotes && <p>ملاحظات مهنية خاصة: {appointment.privateSpecialistNotes}</p>}
                      {appointment.parentProgressReport && <p>ملخص ولي الأمر: {appointment.parentProgressReport.summary}</p>}
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
                    {appointment.status === 'accepted' && appointment.sessionStatus !== 'completed' && (
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
                  </article>
                ))}
              </div>
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
