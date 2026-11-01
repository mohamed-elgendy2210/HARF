import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { loadJitsiApi } from './appointments/AppointmentMeeting.jsx';

const bookingLabels = {
  pending: 'بانتظار القرار',
  accepted: 'مؤكد',
  rejected: 'مرفوض',
  expired: 'منتهي'
};
const meetingLabels = {
  missing: 'لم يُجهز',
  scheduled: 'مجدول — غرفة محفوظة',
  live: 'بدأ الاتصال حسب تسجيل الأخصائي',
  ended: 'منتهٍ',
  cancelled: 'ملغي',
  failed: 'فشل الإعداد'
};
const testLabels = {
  in_progress: 'قيد الاختبار',
  succeeded: 'ناجح',
  partial: 'ناجح جزئيًا',
  failed: 'فشل',
  incomplete: 'لم يكتمل'
};
const testCheckLabels = {
  providerApi: 'تحميل واجهة Jitsi',
  meetingInitialization: 'تهيئة الاجتماع',
  connection: 'الاتصال بالخادم',
  camera: 'الكاميرا',
  microphone: 'الميكروفون',
  twoParticipants: 'اتصال الطرفين'
};

function localDateTime(value, timeZone) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {})
  }).format(new Date(value));
}

function resultLabel(value) {
  if (value === 'passed') return 'اجتاز آليًا';
  if (value === 'manual_passed') return 'اجتاز بتحقق يدوي';
  if (value === 'failed') return 'فشل';
  return 'لم يكتمل';
}

function dateQuery(date, end = false) {
  if (!date) return '';
  return `${date}T${end ? '23:59:59.999' : '00:00:00.000'}Z`;
}

function Stat({ label, value }) {
  return <article className="admin-session-stat"><span>{label}</span><strong>{value ?? 0}</strong></article>;
}

function Paginator({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <nav className="dashboard-pagination" aria-label="صفحات النتائج">
      <span>صفحة {page} من {pages}</span>
      <div>
        <button type="button" className="button button--small button--outline" disabled={page <= 1}
          onClick={() => onChange(page - 1)}>السابق</button>
        <button type="button" className="button button--small button--outline" disabled={page >= pages}
          onClick={() => onChange(page + 1)}>التالي</button>
      </div>
    </nav>
  );
}

function useQueryState(initial) {
  const [filters, setFilters] = useState(initial);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ page: String(page), limit: '20' });
      for (const [key, value] of Object.entries(filters)) {
        if (value) query.set(key, value);
      }
      setLoading(true);
      setError('');
      apiRequest(`/api/v1/admin/appointments?${query}`)
        .then((result) => { if (active) setData(result); })
        .catch((requestError) => { if (active) setError(requestError.message); })
        .finally(() => { if (active) setLoading(false); });
    }, filters.search ? 250 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [filters, page, reload]);
  const update = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };
  return { filters, data, loading, error, page, setPage, update, reload: () => setReload((value) => value + 1) };
}

function AppointmentMonitor() {
  const state = useQueryState({ search: '', from: '', to: '', bookingStatus: 'accepted', meetingStatus: 'all' });
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const records = state.data?.appointments ?? [];
  const stats = state.data?.stats;

  const retryMeeting = async (appointment) => {
    if (!window.confirm('تجهيز غرفة لهذا الموعد المؤكد؟ لن يمنح هذا الإجراء الإدارة صلاحية الانضمام إلى الجلسة.')) return;
    setBusy(appointment.id);
    setActionError('');
    try {
      await apiRequest(`/api/v1/admin/appointments/${appointment.id}/meeting/retry`, { method: 'POST' });
      state.reload();
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="admin-dashboard__content admin-dashboard-panel">
      <div className="admin-dashboard-panel__heading">
        <div><h2>الحجوزات والجلسات</h2><p>عرض إداري لحالة الموعد والغرفة دون إظهار رابطها أو إتاحة الانضمام.</p></div>
        <button type="button" className="button button--small button--outline" disabled={state.loading}
          onClick={state.reload}>تحديث</button>
      </div>
      <div className="admin-session-stats">
        <Stat label="الحجوزات المؤكدة" value={stats?.total} />
        <Stat label="غرفة مجهزة" value={stats?.withMeeting} />
        <Stat label="دون غرفة" value={stats?.missingMeeting} />
        <Stat label="إعداد فاشل" value={stats?.failedMeeting} />
        <Stat label="جلسات مكتملة" value={stats?.completed} />
        <Stat label="غرف ملغاة" value={stats?.cancelled} />
      </div>
      <div className="admin-dashboard-filters">
        <label><span>بحث بالاسم</span><input type="search" value={state.filters.search}
          onChange={(event) => state.update('search', event.target.value)} placeholder="ولي الأمر أو الأخصائي" /></label>
        <label><span>من تاريخ</span><input type="date" value={state.filters.from}
          onChange={(event) => state.update('from', dateQuery(event.target.value))} /></label>
        <label><span>إلى تاريخ</span><input type="date" value={state.filters.to ? state.filters.to.slice(0, 10) : ''}
          onChange={(event) => state.update('to', dateQuery(event.target.value, true))} /></label>
        <label><span>حالة الحجز</span><select value={state.filters.bookingStatus}
          onChange={(event) => state.update('bookingStatus', event.target.value)}>
          <option value="accepted">المؤكدة</option><option value="all">الكل</option>
          <option value="pending">بانتظار القرار</option><option value="rejected">مرفوضة</option><option value="expired">منتهية</option>
        </select></label>
        <label><span>حالة الاجتماع</span><select value={state.filters.meetingStatus}
          onChange={(event) => state.update('meetingStatus', event.target.value)}>
          <option value="all">الكل</option><option value="missing">دون غرفة</option>
          <option value="scheduled">مجدول</option><option value="live">بدأ الاتصال</option>
          <option value="ended">منتهٍ</option><option value="cancelled">ملغي</option><option value="failed">فشل الإعداد</option>
        </select></label>
      </div>
      {state.error && <p className="auth-error" role="alert">{state.error}</p>}
      {actionError && <p className="auth-error" role="alert">{actionError}</p>}
      {state.loading ? <p className="dashboard-loading" role="status">جارٍ تحميل الحجوزات…</p>
        : records.length === 0 ? <p className="dashboard-empty-state">لا توجد حجوزات تطابق عوامل التصفية.</p>
          : (
            <div className="admin-session-table-wrap">
              <table className="admin-session-table">
                <thead><tr><th>ولي الأمر</th><th>الطفل</th><th>الأخصائي</th><th>الموعد</th><th>الحجز</th><th>الاجتماع</th><th>الإجراءات</th></tr></thead>
                <tbody>{records.map((appointment) => (
                  <tr key={appointment.id}>
                    <td>{appointment.parentName || 'غير متاح'}</td>
                    <td>{appointment.childName || 'غير متاح'}</td>
                    <td>{appointment.specialistName || 'غير متاح'}</td>
                    <td>{localDateTime(appointment.startsAt, appointment.timeZone)}</td>
                    <td>{bookingLabels[appointment.status] ?? appointment.status}</td>
                    <td>{meetingLabels[appointment.meetingStatus ?? 'missing'] ?? 'غير معروف'}
                      {appointment.meetingCreatedAt && <small>{localDateTime(appointment.meetingCreatedAt)}</small>}</td>
                    <td className="admin-session-actions">
                      <button type="button" className="button button--small button--outline"
                        onClick={() => setSelected(appointment)}>التفاصيل</button>
                      {appointment.status === 'accepted' && !appointment.meetingConfigured
                        && new Date(appointment.startsAt) > new Date() && (
                          <button type="button" className="button button--small button--primary"
                            disabled={Boolean(busy)} onClick={() => void retryMeeting(appointment)}>
                            {busy === appointment.id ? 'جارٍ التجهيز…' : 'إعادة التجهيز'}
                          </button>
                        )}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
      <Paginator page={state.page} pages={state.data?.pages ?? 0} onChange={state.setPage} />
      {selected && (
        <section className="admin-session-details" aria-label="تفاصيل الموعد">
          <div className="admin-dashboard-panel__heading"><h3>تفاصيل الموعد</h3>
            <button type="button" className="button button--small button--outline" onClick={() => setSelected(null)}>إغلاق</button></div>
          <dl>
            <dt>مرجع الحجز</dt><dd><bdi dir="ltr">{selected.id}</bdi></dd>
            <dt>ولي الأمر / الطفل</dt><dd>{selected.parentName || 'غير متاح'} · {selected.childName || 'غير متاح'}</dd>
            <dt>الأخصائي</dt><dd>{selected.specialistName || 'غير متاح'}</dd>
            <dt>التاريخ والوقت</dt><dd>{localDateTime(selected.startsAt, selected.timeZone)} · {selected.durationMinutes} دقيقة ({selected.timeZone})</dd>
            <dt>الحجز / الجلسة</dt><dd>{bookingLabels[selected.status]} · {selected.sessionStatus === 'completed' ? 'مكتملة' : selected.sessionStatus === 'in_progress' ? 'بدأت حسب تسجيل الأخصائي' : 'لم تبدأ'}</dd>
            <dt>الاجتماع</dt><dd>{meetingLabels[selected.meetingStatus ?? 'missing']}</dd>
            <dt>إنشاء الاجتماع</dt><dd>{localDateTime(selected.meetingCreatedAt)}</dd>
            <dt>رمز خطأ الإعداد</dt><dd>{selected.meetingProvisioningErrorCode || 'لا يوجد'}</dd>
            <dt>بدء / انتهاء الجلسة</dt><dd>{localDateTime(selected.sessionStartedAt)} / {localDateTime(selected.sessionEndedAt)}</dd>
          </dl>
          <p className="dashboard-privacy-note">لا تُعرض بيانات الوصول للغرفة للإدارة، ولا يعني وجود غرفة أن الاجتماع نشط الآن.</p>
        </section>
      )}
    </section>
  );
}

function VideoTestPanel() {
  const [test, setTest] = useState(null);
  const [access, setAccess] = useState(null);
  const [secondToken, setSecondToken] = useState('');
  const [administratorOptions, setAdministratorOptions] = useState([]);
  const [historyFilters, setHistoryFilters] = useState({ from: '', to: '', administratorId: '', status: 'all' });
  const [history, setHistory] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyReload, setHistoryReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState('لم يبدأ الاتصال');
  const [localTracks, setLocalTracks] = useState({ camera: false, microphone: false });
  const [remoteParticipants, setRemoteParticipants] = useState(0);
  const [providerStatus, setProviderStatus] = useState('pending');
  const mountedRef = useRef(true);
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const handlersRef = useRef([]);
  const resultQueue = useRef(Promise.resolve());
  const testRef = useRef(null);

  const dispose = () => {
    const api = apiRef.current;
    apiRef.current = null;
    if (!api) return;
    for (const [event, handler] of handlersRef.current) api.removeEventListener(event, handler);
    handlersRef.current = [];
    api.dispose();
  };

  const record = (updates) => {
    const currentTest = testRef.current;
    if (!currentTest) return Promise.resolve();
    resultQueue.current = resultQueue.current.then(() => apiRequest(
      `/api/v1/admin/video-tests/${currentTest.id}/results`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) }
    )).then(({ test: updated }) => {
      testRef.current = updated;
      setTest(updated);
    }).catch((requestError) => {
      setError(requestError.message);
    });
    return resultQueue.current;
  };

  const connect = async (roomAccess, currentTest, secondParticipant = false) => {
    setError('');
    setConnection('جارٍ تحميل واجهة Jitsi…');
    let apiLoaded = false;
    try {
      const JitsiMeetExternalAPI = await loadJitsiApi(roomAccess.domain);
      apiLoaded = true;
      if (!mountedRef.current || !mountRef.current) return;
      setProviderStatus('passed');
      await apiRequest(`/api/v1/admin/video-tests/${currentTest.id}/results`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerApi: 'passed' })
      });
      const api = new JitsiMeetExternalAPI(roomAccess.domain, {
        roomName: roomAccess.roomName,
        parentNode: mountRef.current,
        width: '100%',
        height: '100%',
        userInfo: { displayName: secondParticipant ? 'طرف الاختبار الثاني' : 'مسؤول الاختبار' },
        configOverwrite: {
          startWithAudioMuted: true,
          startWithVideoMuted: true,
          prejoinPageEnabled: true,
          disableDeepLinking: true,
          toolbarButtons: ['microphone', 'camera', 'hangup', 'fullscreen']
        },
        ...(roomAccess.token ? { jwt: roomAccess.token } : {})
      });
      apiRef.current = api;
      const listen = (event, handler) => {
        api.addEventListener(event, handler);
        handlersRef.current.push([event, handler]);
      };
      await record({ meetingInitialization: 'passed' });
      listen('videoConferenceJoined', () => {
        setConnection('متصل بالغرفة');
        void record({ connection: 'passed' });
      });
      listen('connectionFailed', () => {
        setConnection('فشل الاتصال');
        void record({ connection: 'failed', failureReason: 'JITSI_CONNECTION_FAILED' });
      });
      listen('connectionInterrupted', () => {
        setConnection('انقطع الاتصال');
        void record({ connection: 'failed', failureReason: 'JITSI_CONNECTION_FAILED' });
      });
      listen('localTrackStarted', (event) => {
        if (event.type === 'video') setLocalTracks((current) => ({ ...current, camera: true }));
        if (event.type === 'audio') setLocalTracks((current) => ({ ...current, microphone: true }));
      });
      listen('cameraError', () => {
        setLocalTracks((current) => ({ ...current, camera: false }));
        void record({ camera: 'failed', failureReason: 'CAMERA_ACCESS_FAILED' });
      });
      listen('micError', () => {
        setLocalTracks((current) => ({ ...current, microphone: false }));
        void record({ microphone: 'failed', failureReason: 'MICROPHONE_ACCESS_FAILED' });
      });
      listen('participantJoined', () => setRemoteParticipants((count) => count + 1));
      listen('participantLeft', () => setRemoteParticipants((count) => Math.max(0, count - 1)));
      listen('videoConferenceLeft', () => setConnection('غادرت الغرفة'));
      setNotice('تم تجهيز واجهة الاجتماع. وافق على الأذونات عند الطلب، ثم شغّل الكاميرا والميكروفون يدويًا.');
    } catch (connectError) {
      if (!mountedRef.current) return;
      setConnection('تعذر التحميل أو الاتصال');
      setProviderStatus(apiLoaded ? 'passed' : 'failed');
      setError(connectError.message);
      if (testRef.current) void record({
        providerApi: apiLoaded ? 'passed' : 'failed',
        meetingInitialization: 'failed',
        failureReason: apiLoaded ? 'JITSI_MEETING_INITIALIZATION_FAILED' : 'JITSI_SCRIPT_LOAD_FAILED'
      });
    }
  };

  const start = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest('/api/v1/admin/video-tests', { method: 'POST' });
      testRef.current = result.test;
      setTest(result.test);
      setAccess(result.access);
      setSecondToken(result.secondParticipantToken);
      await connect(result.access, result.test);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest('/api/v1/admin/administrators'),
      apiRequest(`/api/v1/admin/video-tests?page=${historyPage}&limit=10${historyFilters.from ? `&from=${encodeURIComponent(dateQuery(historyFilters.from))}` : ''}${historyFilters.to ? `&to=${encodeURIComponent(dateQuery(historyFilters.to, true))}` : ''}${historyFilters.administratorId ? `&administratorId=${historyFilters.administratorId}` : ''}${historyFilters.status !== 'all' ? `&status=${historyFilters.status}` : ''}`)
    ]).then(([{ administrators }, result]) => {
      if (!active) return;
      setAdministratorOptions(administrators);
      setHistory(result);
    }).catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [historyPage, historyFilters, historyReload]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const testId = params.get('videoTestId');
    const token = params.get('participantToken');
    if (!testId || !token) return undefined;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    let active = true;
    setBusy(true);
    apiRequest(`/api/v1/admin/video-tests/${encodeURIComponent(testId)}/second-participant/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    }).then(({ test: currentTest, access: roomAccess }) => {
      if (!active) return;
      testRef.current = currentTest;
      setTest(currentTest);
      setAccess(roomAccess);
      void connect(roomAccess, currentTest, true);
    }).catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => () => { dispose(); }, []);

  const confirmManual = (field, label) => {
    if (!window.confirm(`هل تحققت يدويًا من ${label} عبر الطرف الثاني؟`)) return;
    void record({ [field]: 'manual_passed' });
  };

  const copySecondLink = async () => {
    const link = new URL(window.location.href);
    link.searchParams.set('view', 'sessions');
    link.hash = new URLSearchParams({ videoTestId: test.id, participantToken: secondToken }).toString();
    try {
      await navigator.clipboard.writeText(link.toString());
      setNotice('تم نسخ الرابط المؤقت. يجب فتحه بحساب مسؤول، ويُستخدم مرة واحدة فقط.');
    } catch (copyError) {
      setError(`تعذر نسخ الرابط: ${copyError.message}`);
    }
  };

  const endTest = async () => {
    if (!window.confirm('إنهاء الاختبار الحالي وحفظ نتيجته؟')) return;
    setBusy(true);
    try {
      await resultQueue.current;
      await apiRequest(`/api/v1/admin/video-tests/${test.id}/end`, { method: 'POST' });
      dispose();
      testRef.current = null;
      setTest(null);
      setAccess(null);
      setSecondToken('');
      setNotice('تم إنهاء الاختبار وحفظ نتيجته في السجل.');
      setHistoryReload((value) => value + 1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const updateFilter = (key, value) => {
    setHistoryPage(1);
    setHistoryFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="admin-dashboard__content admin-dashboard-panel">
      <div className="admin-dashboard-panel__heading">
        <div><h2>اختبار خدمة الفيديو</h2>
          <p>الاختبار مستقل عن المواعيد ولا ينشئ سجلات أولياء أمور أو أطفال أو أخصائيين.</p></div>
        {!test && <button type="button" className="button button--primary" disabled={busy} onClick={() => void start()}>
          {busy ? 'جارٍ تجهيز الاختبار…' : 'بدء اختبار الاجتماع'}</button>}
      </div>
      <p className="appointment-meeting-privacy">
        خادم Jitsi العام لا يضمن خصوصية الغرفة أو حصر الحضور؛ رابط الطرف الثاني مؤقت ومرة واحدة، لكن لا يمنع دخول من يعرف اسم الغرفة على الخادم العام.
      </p>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-message" role="status">{notice}</p>}
      {test && (
        <div className="admin-video-test">
          <div className="admin-video-test__checks">
            <h3>الاختبار الحالي · {testLabels[test.status]}</h3>
            <p>تحميل واجهة Jitsi: {providerStatus === 'passed' ? 'اجتاز' : providerStatus === 'failed' ? 'فشل' : 'قيد الفحص'}</p>
            <p>تهيئة الاجتماع: {resultLabel(test.results?.meetingInitialization)} · الاتصال: {connection}</p>
            <p>الكاميرا: مسار محلي {localTracks.camera ? 'بدأ' : 'لم يبدأ'} · تحقق الاستقبال: {resultLabel(test.results?.camera)}</p>
            <p>الميكروفون: مسار محلي {localTracks.microphone ? 'بدأ' : 'لم يبدأ'} · تحقق الاستقبال: {resultLabel(test.results?.microphone)}</p>
            <p>المشاركون الآخرون: {remoteParticipants} · تحقق الطرفين: {resultLabel(test.results?.twoParticipants)}</p>
            <p>صلاحية الاختبار حتى: {localDateTime(test.expiresAt)}</p>
            <p className="dashboard-privacy-note">بدء المسار المحلي لا يثبت وصول الصوت أو الصورة للطرف الآخر. سجّل التحقق اليدوي بعد التأكد من الجهة الثانية.</p>
            {secondToken && <button type="button" className="button button--small button--outline" onClick={() => void copySecondLink()}>
              نسخ رابط الطرف الثاني (مرة واحدة)
            </button>}
            {error && access && !apiRef.current && (
              <button type="button" className="button button--small button--outline"
                onClick={() => void connect(access, test)}>إعادة الاتصال بالغرفة</button>
            )}
            <div className="admin-video-test__manual">
              <button type="button" className="button button--small button--outline"
                disabled={!localTracks.camera || remoteParticipants < 1} onClick={() => confirmManual('camera', 'وصول الفيديو للطرف الثاني')}>
                تأكيد وصول الفيديو يدويًا
              </button>
              <button type="button" className="button button--small button--outline"
                disabled={!localTracks.microphone || remoteParticipants < 1} onClick={() => confirmManual('microphone', 'وصول الصوت للطرف الثاني')}>
                تأكيد وصول الصوت يدويًا
              </button>
              <button type="button" className="button button--small button--outline"
                disabled={remoteParticipants < 1} onClick={() => confirmManual('twoParticipants', 'اتصال الطرفين بالصوت والصورة')}>
                تأكيد اتصال الطرفين يدويًا
              </button>
            </div>
            <button type="button" className="button button--outline" disabled={busy} onClick={() => void endTest()}>إنهاء الاختبار</button>
          </div>
          <div className="admin-video-test__frame" ref={mountRef} />
        </div>
      )}
      <div className="admin-dashboard-panel__heading admin-video-test__history-heading">
        <div><h3>سجل اختبارات الخدمة</h3><p>لا يُحفظ الصوت أو الفيديو أو تسجيلات الاجتماع.</p></div>
      </div>
      <div className="admin-dashboard-filters">
        <label><span>من تاريخ</span><input type="date" value={historyFilters.from} onChange={(event) => updateFilter('from', event.target.value)} /></label>
        <label><span>إلى تاريخ</span><input type="date" value={historyFilters.to} onChange={(event) => updateFilter('to', event.target.value)} /></label>
        <label><span>المسؤول</span><select value={historyFilters.administratorId} onChange={(event) => updateFilter('administratorId', event.target.value)}>
          <option value="">كل المسؤولين</option>{administratorOptions.map((item) => <option value={item.id} key={item.id}>{item.email}</option>)}
        </select></label>
        <label><span>النتيجة</span><select value={historyFilters.status} onChange={(event) => updateFilter('status', event.target.value)}>
          <option value="all">الكل</option>{Object.entries(testLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select></label>
      </div>
      {!history ? <p className="dashboard-loading" role="status">جارٍ تحميل سجل الاختبارات…</p>
        : history.tests.length === 0 ? <p className="dashboard-empty-state">لا توجد اختبارات محفوظة.</p>
          : <div className="admin-session-table-wrap"><table className="admin-session-table">
            <thead><tr><th>المرجع</th><th>المسؤول</th><th>تاريخ الاختبار</th><th>المزود</th><th>النتيجة</th><th>ملخص التحقق</th></tr></thead>
            <tbody>{history.tests.map((item) => (
              <tr key={item.id}><td><bdi dir="ltr">{item.id.slice(-8)}</bdi></td>
                <td>{item.administratorEmail || item.administratorId}</td>
                <td>{localDateTime(item.createdAt)}</td><td>{item.provider} · {item.domain}</td>
                <td>{testLabels[item.status]}</td>
                <td>
                  {Object.entries(item.results ?? {}).filter(([, value]) => value !== 'pending')
                    .map(([key, value]) => `${testCheckLabels[key] ?? key}: ${value === 'manual_passed' ? 'تحقق يدوي' : value === 'passed' ? 'اجتاز آليًا' : 'فشل'}`).join(' · ') || 'لم تكتمل الفحوصات'}
                  {item.failureReason && <small>سبب تقني: {item.failureReason}</small>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>}
      <Paginator page={historyPage} pages={history?.pages ?? 0} onChange={setHistoryPage} />
    </section>
  );
}

export default function AdminSessions() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const [tab, setTab] = useState(params.has('participantToken') ? 'video' : 'appointments');
  const [videoTabVisited, setVideoTabVisited] = useState(params.has('participantToken'));
  return (
    <div className="admin-sessions">
      <nav className="admin-sessions__tabs" aria-label="إدارة الجلسات والاجتماعات">
        <button type="button" className={tab === 'appointments' ? 'is-active' : ''} onClick={() => setTab('appointments')}>الحجوزات والجلسات</button>
        <button type="button" className={tab === 'video' ? 'is-active' : ''} onClick={() => {
          setVideoTabVisited(true);
          setTab('video');
        }}>اختبار خدمة الفيديو</button>
      </nav>
      {tab === 'appointments' && <AppointmentMonitor />}
      {videoTabVisited && <div hidden={tab !== 'video'}><VideoTestPanel /></div>}
    </div>
  );
}
