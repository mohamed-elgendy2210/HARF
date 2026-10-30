import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api.js';

const jitsiScripts = new Map();
const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;
const meetingErrorMessages = {
  APPOINTMENT_NOT_CONFIRMED: 'لا يمكن الانضمام قبل تأكيد الموعد.',
  MEETING_NOT_OPEN_YET: 'لم يحن وقت الانضمام بعد. ستتمكن من الدخول قبل الموعد بوقت قصير.',
  MEETING_JOIN_WINDOW_CLOSED: 'انتهت المهلة المسموحة للانضمام إلى هذه الجلسة.',
  MEETING_NOT_READY: 'لم يتم تجهيز غرفة لهذه الجلسة بعد.',
  MEETING_NOT_AVAILABLE: 'هذه الجلسة غير متاحة أو انتهت.',
  VIDEO_PROVIDER_NOT_CONFIGURED: 'خدمة الجلسات المرئية غير مهيأة حاليًا.'
};

function readableMeetingError(error) {
  return meetingErrorMessages[error.code] ?? error.message;
}

export function loadJitsiApi(domain) {
  if (!hostnamePattern.test(domain)) {
    return Promise.reject(new Error('إعداد خادم الجلسات غير صالح.'));
  }
  if (window.JitsiMeetExternalAPI) return Promise.resolve(window.JitsiMeetExternalAPI);
  if (jitsiScripts.has(domain)) return jitsiScripts.get(domain);

  const script = document.createElement('script');
  script.src = `https://${domain}/external_api.js`;
  script.async = true;
  script.referrerPolicy = 'no-referrer';
  const loading = new Promise((resolve, reject) => {
    script.onload = () => {
      if (window.JitsiMeetExternalAPI) resolve(window.JitsiMeetExternalAPI);
      else reject(new Error('تعذر تجهيز خدمة الجلسات المرئية.'));
    };
    script.onerror = () => reject(new Error('تعذر تحميل خدمة الجلسات المرئية. تحقق من اتصال الإنترنت ثم أعد المحاولة.'));
  }).catch((error) => {
    jitsiScripts.delete(domain);
    script.remove();
    throw error;
  });
  jitsiScripts.set(domain, loading);
  document.head.append(script);
  return loading;
}

function formatTime(value, timeZone) {
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function AppointmentJoinButton({ appointment, viewerRole, onJoin }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const opensAt = new Date(appointment.meetingJoinOpensAt).getTime();
  const closesAt = new Date(appointment.meetingJoinClosesAt).getTime();
  const configured = appointment.meetingAvailable;
  const ended = ['ended', 'cancelled', 'failed'].includes(appointment.meetingStatus)
    || appointment.sessionStatus === 'completed';
  const inWindow = now >= opensAt && now <= closesAt;
  const canJoin = configured && !ended && inWindow;
  if (!configured) {
    return <p className="appointment-meeting-hint">الجلسة المرئية غير متاحة حاليًا.</p>;
  }
  if (ended) {
    return <p className="appointment-meeting-hint">
      {appointment.meetingStatus === 'failed'
        ? 'تعذر تجهيز الجلسة المرئية. يرجى التواصل مع الأخصائي أو الدعم.'
        : 'انتهت الجلسة أو لم تعد متاحة.'}
    </p>;
  }

  return (
    <div className="appointment-meeting-join">
      <button
        type="button"
        className="button button--small button--primary"
        disabled={!canJoin}
        onClick={onJoin}
      >
        {viewerRole === 'specialist' ? 'بدء الجلسة' : 'انضم للجلسة'}
      </button>
      {!inWindow && now < opensAt && (
        <small role="status">
          يفتح الانضمام {viewerRole === 'specialist' ? 'للأخصائي' : 'لولي الأمر'} قبل الموعد بـ
          {' '}{Math.ceil((opensAt - now) / 60000)} دقيقة.
        </small>
      )}
      {!inWindow && now > closesAt && (
        <small role="status">انتهت المهلة المسموحة للانضمام.</small>
      )}
    </div>
  );
}

export default function AppointmentMeeting({ appointment, viewerRole, displayName, onClose, onEndSession }) {
  const [phase, setPhase] = useState('prejoin');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [ending, setEnding] = useState(false);
  const [access, setAccess] = useState(null);
  const dialogRef = useRef(null);
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const handlersRef = useRef([]);
  const mountedRef = useRef(true);
  const startRequestRef = useRef(false);

  const disposeMeeting = () => {
    const api = apiRef.current;
    apiRef.current = null;
    if (!api) return;
    for (const [eventName, handler] of handlersRef.current) {
      api.removeEventListener(eventName, handler);
    }
    handlersRef.current = [];
    api.dispose();
  };

  useEffect(() => {
    mountedRef.current = true;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialogRef.current.querySelectorAll(
        'button:not([disabled]), a[href], iframe, [tabindex]:not([tabindex="-1"])'
      )];
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialogRef.current?.focus();
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      mountedRef.current = false;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      disposeMeeting();
      previousFocus?.focus?.();
    };
  }, []);

  const joinMeeting = async () => {
    setPhase('connecting');
    setStatus('جارٍ تجهيز الجلسة...');
    setError('');
    startRequestRef.current = false;
    disposeMeeting();
    try {
      const { access: roomAccess } = await apiRequest(
        `/api/v1/appointments/${encodeURIComponent(appointment.id)}/video-access`,
        { method: 'POST' }
      );
      if (!mountedRef.current) return;
      setAccess(roomAccess);
      const JitsiMeetExternalAPI = await loadJitsiApi(roomAccess.domain);
      if (!mountedRef.current) return;
      setStatus('جارٍ الاتصال...');
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      if (!mountedRef.current || !mountRef.current) return;
      const options = {
        domain: roomAccess.domain,
        roomName: roomAccess.roomName,
        parentNode: mountRef.current,
        width: '100%',
        height: '100%',
        userInfo: { displayName },
        configOverwrite: {
          startWithAudioMuted: true,
          startWithVideoMuted: true,
          prejoinPageEnabled: true,
          disableDeepLinking: true,
          toolbarButtons: ['microphone', 'camera', 'hangup', 'fullscreen']
        },
        ...(roomAccess.token ? { jwt: roomAccess.token } : {})
      };
      const api = new JitsiMeetExternalAPI(roomAccess.domain, options);
      apiRef.current = api;
      const addHandler = (eventName, handler) => {
        api.addEventListener(eventName, handler);
        handlersRef.current.push([eventName, handler]);
      };
      addHandler('ready', () => setStatus('جاري الاتصال...'));
      addHandler('connectionEstablished', () => setStatus('تم الاتصال بخدمة الجلسة.'));
      addHandler('videoConferenceJoined', () => {
        setPhase('live');
        setStatus('تم الاتصال بنجاح.');
        if (viewerRole === 'specialist' && !startRequestRef.current) {
          startRequestRef.current = true;
          apiRequest(`/api/v1/appointments/${encodeURIComponent(appointment.id)}/session/start`, {
            method: 'POST'
          }).catch((requestError) => {
            if (mountedRef.current) setError(`تم الاتصال، لكن تعذر تسجيل بدء الجلسة: ${readableMeetingError(requestError)}`);
          });
        }
      });
      addHandler('connectionInterrupted', () => {
        setPhase('disconnected');
        setStatus('انقطع الاتصال. تحقق من الإنترنت وحاول إعادة الاتصال.');
      });
      addHandler('connectionFailed', () => {
        setPhase('disconnected');
        setError('تعذر الاتصال بخدمة الجلسة. تحقق من اتصال الإنترنت ثم أعد المحاولة.');
      });
      addHandler('cameraError', () => setError('تعذر الوصول إلى الكاميرا. تحقق من إذن المتصفح أو أغلق التطبيقات التي تستخدمها.'));
      addHandler('micError', () => setError('تعذر الوصول إلى الميكروفون. تحقق من إذن المتصفح أو أغلق التطبيقات التي تستخدمه.'));
      addHandler('videoConferenceLeft', () => {
        setPhase('ended');
        setStatus('غادرت الجلسة. لم يتم إنهاء الموعد أو تسجيله كمكتمل.');
      });
      addHandler('readyToClose', () => {
        setPhase('ended');
        setStatus('انتهت الجلسة المرئية. لم يتم تغيير حالة الموعد.');
      });
    } catch (joinError) {
      if (!mountedRef.current) return;
      setPhase('error');
      startRequestRef.current = false;
      setError(readableMeetingError(joinError));
    }
  };

  const leaveMeeting = () => {
    if (apiRef.current) {
      try {
        apiRef.current.executeCommand('hangup');
      } catch {
        setError('تعذر إنهاء الاتصال من داخل الجلسة. يمكنك إغلاق النافذة بأمان.');
      }
    }
    disposeMeeting();
    onClose();
  };

  const endSession = async () => {
    setEnding(true);
    setError('');
    const ended = await onEndSession();
    if (ended) {
      onClose();
      return;
    }
    if (mountedRef.current) {
      setEnding(false);
      setError('لم يكتمل إنهاء الجلسة. راجع الرسالة في لوحة المواعيد ثم أعد المحاولة.');
    }
  };

  return (
    <div className="appointment-meeting-overlay">
      <section
        ref={dialogRef}
        className="appointment-meeting-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-meeting-title"
        tabIndex="-1"
        dir="rtl"
      >
        <header className="appointment-meeting-dialog__header">
          <div>
            <span className="dashboard-eyebrow">حرف · جلسة مرئية</span>
            <h2 id="appointment-meeting-title">جلسة مع {viewerRole === 'parent'
              ? appointment.specialistName || 'الأخصائي'
              : appointment.parentName || 'ولي الأمر'}</h2>
            <p>{formatTime(appointment.startsAt, appointment.timeZone)}</p>
          </div>
          <button type="button" className="button button--small button--outline" onClick={leaveMeeting}>
            {phase === 'prejoin' ? 'إغلاق' : 'مغادرة الجلسة'}
          </button>
        </header>
        {phase === 'prejoin' && (
          <div className="appointment-meeting-prejoin">
            <h3>قبل الانضمام</h3>
            <p>سيُفتح اتصال Jitsi بعد اختيارك. الكاميرا والميكروفون مكتومان عند الدخول؛ شغّلهما من أدوات الجلسة عند الاستعداد.</p>
            <p className="appointment-meeting-privacy">
              تنبيه خصوصية: خادم Jitsi العام لا يضمن حصر الدخول على طرفي هذا الموعد. استخدموا خادمًا خاصًا موثّقًا عند الحاجة إلى تحكم فعلي في الوصول.
            </p>
            <button type="button" className="button button--primary" onClick={joinMeeting}>
              انضم للجلسة
            </button>
          </div>
        )}
        {phase !== 'prejoin' && (
          <>
            <p className="appointment-meeting-status" role="status" aria-live="polite">
              {status || 'جارٍ تجهيز الجلسة...'}
            </p>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <div className="appointment-meeting-frame" ref={mountRef} />
            {(phase === 'error' || phase === 'disconnected') && (
              <button type="button" className="button button--primary" onClick={joinMeeting}>
                إعادة المحاولة
              </button>
            )}
            {phase === 'ended' && (
              <button type="button" className="button button--outline" onClick={onClose}>إغلاق</button>
            )}
            {viewerRole === 'specialist' && onEndSession && ['live', 'disconnected', 'ended'].includes(phase) && (
              <button type="button" className="button button--primary" disabled={ending} onClick={() => void endSession()}>
                {ending ? 'جارٍ إنهاء الجلسة…' : 'إنهاء وتوثيق الجلسة'}
              </button>
            )}
          </>
        )}
        {access?.expiresAt && (
          <small className="appointment-meeting-expiry">تنتهي صلاحية بيانات الانضمام المؤقتة عند {formatTime(access.expiresAt, appointment.timeZone)}.</small>
        )}
      </section>
    </div>
  );
}
