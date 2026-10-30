import { useEffect, useMemo, useState } from 'react';
import { apiRequest, getApiUrl } from '../lib/api.js';
import { displayNameOrFallback } from '../lib/displayName.js';
import NotificationCenter from './NotificationCenter.jsx';
import ParentTestimonials from './ParentTestimonials.jsx';
import AppointmentMeeting, { AppointmentJoinButton } from './appointments/AppointmentMeeting.jsx';

const ageBands = [
  { value: '', label: 'يفضل عدم المشاركة' },
  { value: '3-5', label: '٣–٥ سنوات' },
  { value: '6-8', label: '٦–٨ سنوات' },
  { value: '9-12', label: '٩–١٢ سنة' },
  { value: '13+', label: '١٣ سنة فأكثر' }
];

const avatars = [
  { value: '', label: 'بدون صورة رمزية', emoji: '🧒' },
  { value: 'cat', label: 'قطة', emoji: '🐱' },
  { value: 'fox', label: 'ثعلب', emoji: '🦊' },
  { value: 'panda', label: 'باندا', emoji: '🐼' },
  { value: 'turtle', label: 'سلحفاة', emoji: '🐢' }
];

const consentLabels = {
  learning_data: 'حفظ أنشطة التعلّم',
  progress_reports: 'إعداد تقارير التقدم'
};

const gameNames = {
  'word-sounds': 'فقاعات الأصوات',
  'word-match': 'صندوق الكلمات',
  'spatial-relationships': 'فين المكان؟',
  'matching-pairs': 'لعبة توصيل الصور',
  'animal-sounds': 'اسمع صوت الحيوان'
};

const sections = [
  { id: 'overview', label: 'الرئيسية', icon: '⌂' },
  { id: 'children', label: 'أطفالي', icon: '♧' },
  { id: 'addChild', label: 'إضافة طفل', icon: '+' },
  { id: 'progress', label: 'التقدم', icon: '↗' },
  { id: 'activity', label: 'سجل الأنشطة', icon: '◷' },
  { id: 'reports', label: 'التقارير', icon: '▤' },
  { id: 'specialists', label: 'الأخصائيون والمواعيد', icon: '✚' },
  { id: 'appointments', label: 'سجل المواعيد', icon: '▦' },
  { id: 'payments', label: 'الاشتراك والدفع', icon: 'ج.م' },
  { id: 'notifications', label: 'الإشعارات', icon: '♧' },
  { id: 'testimonials', label: 'آرائي عن حرف', icon: '♡' },
  { id: 'settings', label: 'إعدادات الحساب', icon: '⚙' }
];
const sectionTitles = Object.fromEntries(sections.map(({ id, label }) => [id, label]));

function avatarFor(value) {
  return avatars.find((avatar) => avatar.value === value)?.emoji ?? '🧒';
}

function formatDate(value) {
  if (!value) return 'التاريخ غير متاح';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'التاريخ غير متاح';
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function ProgressNotice({ children }) {
  return <div className="dashboard-empty-state">{children}</div>;
}

export default function ParentDashboard({
  user,
  onBack,
  backLabel = 'العودة للحساب',
  onPasswordRecovery,
  onSignOut,
  onReauthenticate
}) {
  const [children, setChildren] = useState([]);
  const [section, setSection] = useState(() => {
    const requestedSection = new URLSearchParams(window.location.search).get('section');
    return sections.some(({ id }) => id === requestedSection) ? requestedSection : 'overview';
  });
  const [selectedChildId, setSelectedChildId] = useState('');
  const [editingChild, setEditingChild] = useState(null);
  const [consentChildId, setConsentChildId] = useState('');
  const [consents, setConsents] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [attemptTotal, setAttemptTotal] = useState(0);
  const [hasMoreAttempts, setHasMoreAttempts] = useState(false);
  const [attemptPage, setAttemptPage] = useState(1);
  const [gameFilter, setGameFilter] = useState('');
  const [learningProgress, setLearningProgress] = useState(null);
  const [loadingLearningProgress, setLoadingLearningProgress] = useState(false);
  const [learningProgressMessage, setLearningProgressMessage] = useState('');
  const [learningRefresh, setLearningRefresh] = useState(0);
  const [learningSetup, setLearningSetup] = useState(null);
  const [learningSetupBusy, setLearningSetupBusy] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [subscriptionHistory, setSubscriptionHistory] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [subscriptionPlan, setSubscriptionPlan] = useState(null);
  const [billingPeriod, setBillingPeriod] = useState(() => new URLSearchParams(window.location.search).get('period') === 'annual' ? 'annual' : 'monthly');
  const [specialists, setSpecialists] = useState([]);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState('');
  const [specialistAvailability, setSpecialistAvailability] = useState(null);
  const [loadingSpecialists, setLoadingSpecialists] = useState(false);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [meetingAppointment, setMeetingAppointment] = useState(null);
  const [bookingAppointment, setBookingAppointment] = useState(false);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);

  const clearError = () => {
    setError('');
    setSessionExpired(false);
  };

  const reportError = (requestError) => {
    setSessionExpired(requestError.status === 401);
    setError(requestError.status === 401
      ? 'انتهت جلسة الدخول. سجّل الدخول مجددًا للمتابعة.'
      : requestError.message);
  };

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedChildId) ?? null,
    [children, selectedChildId]
  );

  const loadChildren = async () => {
    setLoadingChildren(true);
    clearError();
    try {
      const result = await apiRequest('/api/v1/children');
      setChildren(result.children);
      setSelectedChildId((current) => (
        result.children.some((child) => child.id === current)
          ? current
          : result.children.some((child) => child.id === new URLSearchParams(window.location.search).get('childId'))
            ? new URLSearchParams(window.location.search).get('childId')
            : result.children[0]?.id ?? ''
      ));
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setLoadingChildren(false);
    }
  };

  useEffect(() => {
    loadChildren();
  }, []);

  useEffect(() => {
    if (!selectedChildId || !['progress', 'activity'].includes(section)) {
      setAttempts([]);
      setAttemptTotal(0);
      setHasMoreAttempts(false);
      return undefined;
    }

    let active = true;
    setLoadingAttempts(true);
    clearError();
    const query = new URLSearchParams({ page: String(attemptPage), limit: '10' });
    if (gameFilter) query.set('gameId', gameFilter);
    apiRequest(`/api/v1/children/${selectedChildId}/game-attempts?${query}`)
      .then((result) => {
        if (!active) return;
        setAttempts(result.attempts);
        setAttemptTotal(result.total);
        setHasMoreAttempts(result.hasMore);
      })
      .catch((requestError) => {
        if (active) reportError(requestError);
      })
      .finally(() => {
        if (active) setLoadingAttempts(false);
      });

    return () => {
      active = false;
    };
  }, [selectedChildId, section, attemptPage, gameFilter]);

  useEffect(() => {
    if (section !== 'progress' || !selectedChildId) {
      setLearningProgress(null);
      setLearningProgressMessage('');
      return undefined;
    }
    let active = true;
    setLoadingLearningProgress(true);
    setLearningProgressMessage('');
    apiRequest(`/api/v1/children/${selectedChildId}/learning-progress`)
      .then(({ progress }) => {
        if (active) setLearningProgress(progress);
      })
      .catch((requestError) => {
        if (!active) return;
        setLearningProgress(null);
        setLearningProgressMessage(requestError.status === 403
          ? requestError.message
          : requestError.message || 'تعذر تحميل مسار التعلّم.');
        if (requestError.status === 401) reportError(requestError);
      })
      .finally(() => {
        if (active) setLoadingLearningProgress(false);
      });
    return () => {
      active = false;
    };
  }, [selectedChildId, section, learningRefresh]);

  useEffect(() => {
    if (section !== 'payments') return undefined;
    let active = true;
    setLoadingBilling(true);
    Promise.all([
      apiRequest('/api/v1/auth/subscription'),
      apiRequest('/api/v1/payments/plan')
    ])
      .then(([billing, { plan }]) => {
        if (!active) return;
        setSubscription(billing.subscription);
        setSubscriptionHistory(billing.history);
        setPaymentHistory(billing.payments);
        setSubscriptionPlan(plan);
        if (!plan.annualAmountMinor) setBillingPeriod('monthly');
      })
      .catch((requestError) => {
        if (active) reportError(requestError);
      })
      .finally(() => {
        if (active) setLoadingBilling(false);
      });
    return () => {
      active = false;
    };
  }, [section]);

  const submitPayment = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(true);
    clearError();
    setNotice('');
    try {
      await apiRequest('/api/v1/payments', {
        method: 'POST',
        body: formData
      });
      const billing = await apiRequest('/api/v1/auth/subscription');
      setSubscription(billing.subscription);
      setSubscriptionHistory(billing.history);
      setPaymentHistory(billing.payments);
      setNotice('تم إرسال طلب الدفع للمراجعة. لن يتفعّل الاشتراك قبل موافقة المسؤول.');
      form.reset();
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (section !== 'specialists') return undefined;
    let active = true;
    setLoadingSpecialists(true);
    apiRequest('/api/v1/directory/specialists')
      .then(({ specialists: directory }) => {
        if (!active) return;
        setSpecialists(directory);
        setSelectedSpecialistId('');
      })
      .catch((requestError) => {
        if (active) reportError(requestError);
      })
      .finally(() => {
        if (active) setLoadingSpecialists(false);
      });
    return () => {
      active = false;
    };
  }, [section]);

  useEffect(() => {
    if (section !== 'specialists' || !selectedSpecialistId) {
      setSpecialistAvailability(null);
      return undefined;
    }
    let active = true;
    setSpecialistAvailability(null);
    setLoadingAvailability(true);
    const query = new URLSearchParams({ from: new Date().toISOString(), days: '14' });
    apiRequest(`/api/v1/directory/specialists/${selectedSpecialistId}/availability?${query}`)
      .then(({ availability }) => {
        if (active) setSpecialistAvailability(availability);
      })
      .catch((requestError) => {
        if (active) reportError(requestError);
      })
      .finally(() => {
        if (active) setLoadingAvailability(false);
      });
    return () => {
      active = false;
    };
  }, [section, selectedSpecialistId]);

  useEffect(() => {
    if (!['appointments', 'reports'].includes(section)) return undefined;
    let active = true;
    setLoadingAppointments(true);
    apiRequest('/api/v1/appointments')
      .then(({ appointments: history }) => {
        if (active) setAppointments(history);
      })
      .catch((requestError) => {
        if (active) reportError(requestError);
      })
      .finally(() => {
        if (active) setLoadingAppointments(false);
      });
    return () => {
      active = false;
    };
  }, [section]);

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

  const bookAppointment = async (slot) => {
    const activeChild = children.find((child) => child.id === selectedChildId && child.status === 'active')
      ?? children.find((child) => child.status === 'active');
    if (!activeChild) {
      setError('اختر ملف طفل نشطًا قبل طلب الموعد.');
      return;
    }
    setSelectedChildId(activeChild.id);
    setBookingAppointment(true);
    clearError();
    setNotice('');
    try {
      const { appointment } = await apiRequest('/api/v1/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childId: activeChild.id,
          specialistId: selectedSpecialistId,
          startsAt: slot.startsAt
        })
      });
      setNotice(`تم إرسال طلب الموعد لـ ${activeChild.displayName}. ينتظر رد الأخصائي خلال ٤٨ ساعة.`);
      setAppointments((current) => [appointment, ...current.filter(({ id }) => id !== appointment.id)]);
      selectSection('appointments');
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setBookingAppointment(false);
    }
  };

  const formatSpecialistSlot = (slot) => new Intl.DateTimeFormat('ar-EG', {
    timeZone: slot.timeZone,
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(slot.startsAt));

  const formatAppointmentPrice = (amountMinor, currency = 'EGP') => new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency
  }).format(amountMinor / 100);

  const appointmentStatuses = {
    pending: 'بانتظار رد الأخصائي',
    accepted: 'تم تأكيد الموعد',
    rejected: 'مرفوض',
    expired: 'انتهت مهلة الرد'
  };

  useEffect(() => {
    if (!selectedChildId || !['reports', 'profile', 'progress'].includes(section)) return undefined;
    let active = true;
    apiRequest(`/api/v1/children/${selectedChildId}/consents`)
      .then((result) => {
        if (active) setConsents(result.consents);
      })
      .catch((requestError) => {
        if (active) reportError(requestError);
      });
    return () => {
      active = false;
    };
  }, [selectedChildId, section]);

  useEffect(() => {
    setLearningSetup(null);
  }, [selectedChildId]);

  const startCreate = () => {
    setEditingChild(null);
    clearError();
    setNotice('');
    setSection('addChild');
  };

  const startLearningSetup = async () => {
    if (!selectedChild) return;
    clearError();
    setNotice('');
    setLearningSetupBusy(true);
    const child = selectedChild;
    try {
      const { questionnaire } = await apiRequest(
        `/api/v1/children/${child.id}/learning-questionnaire`
      );
      if (selectedChildId !== child.id) return;
      setLearningSetup({
        questionnaire,
        answers: {},
        submissionId: window.crypto.randomUUID(),
        recommendations: null,
        selectedPathKeys: []
      });
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setLearningSetupBusy(false);
    }
  };

  const setLearningAnswer = (question, optionId, checked = true) => {
    setLearningSetup((current) => {
      if (!current) return current;
      const nextAnswers = { ...current.answers };
      if (question.type === 'multiple') {
        const selected = new Set(nextAnswers[question.id] ?? []);
        if (checked) selected.add(optionId);
        else selected.delete(optionId);
        nextAnswers[question.id] = [...selected];
      } else {
        nextAnswers[question.id] = optionId;
      }
      return { ...current, answers: nextAnswers, recommendations: null, selectedPathKeys: [] };
    });
  };

  const previewLearningPaths = async (event) => {
    event.preventDefault();
    if (!learningSetup || !selectedChild) return;
    const child = selectedChild;
    const setup = learningSetup;
    setLearningSetupBusy(true);
    clearError();
    try {
      const result = await apiRequest(
        `/api/v1/children/${child.id}/learning-recommendations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questionnaireVersion: setup.questionnaire.version,
            submissionId: setup.submissionId,
            ageBand: child.ageBand,
            answers: setup.answers
          })
        }
      );
      if (selectedChildId === child.id) {
        setLearningSetup((current) => current ? ({
          ...current,
          recommendations: result,
          selectedPathKeys: result.recommendations.map(({ key }) => key)
        }) : current);
      }
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setLearningSetupBusy(false);
    }
  };

  const confirmLearningPaths = async () => {
    if (!learningSetup || !selectedChild || !learningSetup.recommendations) return;
    if (!currentConsent('learning_data')) {
      setError('فعّل موافقة حفظ أنشطة التعلّم من ملف الطفل قبل حفظ الاستبيان والتعيينات.');
      return;
    }
    setLearningSetupBusy(true);
    clearError();
    const child = selectedChild;
    const setup = learningSetup;
    try {
      await apiRequest(
        `/api/v1/children/${child.id}/learning-path-assignments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questionnaireVersion: setup.questionnaire.version,
            submissionId: setup.submissionId,
            ageBand: child.ageBand,
            answers: setup.answers,
            pathKeys: setup.selectedPathKeys
          })
        }
      );
      setLearningSetup(null);
      setLearningRefresh((current) => current + 1);
      setNotice('تم حفظ إجاباتك وتعيين المسارات المختارة للطفل.');
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setLearningSetupBusy(false);
    }
  };

  const startEdit = (child) => {
    setEditingChild(child);
    setSelectedChildId(child.id);
    clearError();
    setNotice('');
    setSection('addChild');
  };

  const saveChild = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ageBand = form.get('ageBand');
    const avatar = form.get('avatar');
    const payload = {
      displayName: form.get('displayName'),
      ageBand: ageBand || null,
      avatar: avatar || null
    };
    setBusy(true);
    clearError();
    setNotice('');
    try {
      if (editingChild) {
        const result = await apiRequest(`/api/v1/children/${editingChild.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        setChildren((current) => current.map((child) => child.id === result.child.id ? result.child : child));
        setSelectedChildId(result.child.id);
        setNotice('تم تحديث ملف الطفل.');
        setSection('profile');
      } else {
        const result = await apiRequest('/api/v1/children', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        setChildren((current) => [result.child, ...current]);
        setSelectedChildId(result.child.id);
        setNotice('تم إنشاء ملف الطفل. يمكنك إدارة موافقات مشاركة البيانات من ملفه.');
        setSection('profile');
      }
      setEditingChild(null);
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setBusy(false);
    }
  };

  const setChildStatus = async (child) => {
    const status = child.status === 'active' ? 'archived' : 'active';
    if (status === 'archived'
      && !window.confirm('سيتم إيقاف الملف مؤقتًا مع الاحتفاظ بسجلاته. هل تريد المتابعة؟')) return;
    setBusy(true);
    clearError();
    setNotice('');
    try {
      const result = await apiRequest(`/api/v1/children/${child.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      setChildren((current) => current.map((item) => item.id === child.id ? result.child : item));
      setNotice(status === 'archived'
        ? 'تم إيقاف الملف مؤقتًا، مع الاحتفاظ بسجلاته.'
        : 'تمت إعادة تفعيل الملف.');
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setBusy(false);
    }
  };

  const toggleConsents = async (child) => {
    clearError();
    setNotice('');
    if (consentChildId === child.id) {
      setConsentChildId('');
      return;
    }
    setBusy(true);
    try {
      const result = await apiRequest(`/api/v1/children/${child.id}/consents`);
      setConsents(result.consents);
      setConsentChildId(child.id);
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setBusy(false);
    }
  };

  const recordConsent = async (child, consentType, granted) => {
    setBusy(true);
    clearError();
    setNotice('');
    try {
      const result = await apiRequest(`/api/v1/children/${child.id}/consents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentType, granted })
      });
      setConsents((current) => current.map((consent) => (
        consent.consentType === result.consent.consentType ? result.consent : consent
      )));
      setNotice('تم حفظ اختيارك.');
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setBusy(false);
    }
  };

  const selectSection = (nextSection) => {
    setSection(nextSection);
    setNotice('');
    clearError();
    if (nextSection === 'activity' || nextSection === 'progress') {
      setAttemptPage(1);
    }
  };

  const currentConsent = (consentType) => consents.find(
    (consent) => consent.consentType === consentType
  )?.granted ?? false;

  const renderConsentControls = (child) => (
    <div className="dashboard-consents" aria-label={`موافقات ${child.displayName}`}>
      {consents.map((consent) => (
        <div className="dashboard-consent" key={consent.consentType}>
          <div>
            <strong>{consentLabels[consent.consentType]}</strong>
            <span>{consent.granted ? 'مسموح' : 'غير مسموح'}</span>
          </div>
          <button
            type="button"
            className="button button--small button--outline"
            disabled={busy}
            onClick={() => recordConsent(child, consent.consentType, !consent.granted)}
          >
            {consent.granted ? 'سحب الموافقة' : 'منح الموافقة'}
          </button>
        </div>
      ))}
    </div>
  );

  const renderChildCard = (child) => (
    <article
      className={`child-card${child.status === 'archived' ? ' child-card--archived' : ''}`}
      key={child.id}
    >
      <div className="child-card__heading">
        <span className="dashboard-avatar" aria-hidden="true">{avatarFor(child.avatar)}</span>
        <div className="child-card__identity">
          <h3>{child.displayName}</h3>
          <p>{ageBands.find((band) => band.value === child.ageBand)?.label ?? 'الفئة العمرية غير مشاركة'}</p>
        </div>
        <span className="child-status">{child.status === 'active' ? 'نشط' : 'متوقف مؤقتًا'}</span>
      </div>
      <div className="child-card__actions">
        <button type="button" className="button button--small button--outline" onClick={() => {
          setSelectedChildId(child.id);
          selectSection('profile');
        }}>
          الملف والتقدم
        </button>
        <button type="button" className="button button--small button--outline" disabled={busy} onClick={() => startEdit(child)}>
          تعديل
        </button>
        <button type="button" className="button button--small button--outline" disabled={busy} onClick={() => setChildStatus(child)}>
          {child.status === 'active' ? 'إيقاف مؤقت' : 'إعادة تفعيل'}
        </button>
        <button type="button" className="auth-text-button" disabled={busy} onClick={() => toggleConsents(child)}>
          {consentChildId === child.id ? 'إخفاء الموافقات' : 'إدارة الموافقات'}
        </button>
      </div>
      {consentChildId === child.id && renderConsentControls(child)}
    </article>
  );

  const renderAttemptList = () => {
    if (loadingAttempts) return <p className="dashboard-loading" role="status">جارٍ تحميل سجل الأنشطة…</p>;
    if (attempts.length === 0) {
      return (
        <ProgressNotice>
          لا توجد محاولات ألعاب مسجلة لهذا الطفل حتى الآن. عند توفر أنشطة مدعومة وموافقة حفظ البيانات، ستظهر النتائج المسجلة هنا.
        </ProgressNotice>
      );
    }
    return (
      <>
        <div className="dashboard-attempt-list">
          {attempts.map((attempt) => (
            <article className="dashboard-attempt" key={attempt.id}>
              <div>
                <h4>{gameNames[attempt.gameId] ?? 'نشاط تعليمي'}</h4>
                <time dateTime={attempt.completedAt}>{formatDate(attempt.completedAt)}</time>
              </div>
              <p>
                {attempt.correctCount} من {attempt.totalQuestions} إجابات صحيحة
                <span> · مدة النشاط {attempt.durationSeconds} ثانية</span>
              </p>
              {attempt.spatialProgress && (
                <p className="dashboard-attempt__spatial">
                  المستوى {attempt.spatialProgress.level} · اكتملت {attempt.spatialProgress.completionPercent}٪
                  · محاولات إضافية {attempt.spatialProgress.incorrectAttempts}
                  · تكرار التعليمات {attempt.spatialProgress.instructionReplays}
                  · تلميحات {attempt.spatialProgress.hintCount}
                </p>
              )}
            </article>
          ))}
        </div>
        <div className="dashboard-pagination" aria-label="صفحات سجل الأنشطة">
          <span>إجمالي المحاولات المسجلة: {attemptTotal}</span>
          <div>
            <button
              type="button"
              className="button button--small button--outline"
              disabled={attemptPage <= 1 || loadingAttempts}
              onClick={() => setAttemptPage((current) => Math.max(1, current - 1))}
            >
              السابق
            </button>
            <span>صفحة {attemptPage}</span>
            <button
              type="button"
              className="button button--small button--outline"
              disabled={!hasMoreAttempts || loadingAttempts}
              onClick={() => setAttemptPage((current) => current + 1)}
            >
              التالي
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderContent = () => {
    if (section === 'testimonials') return <ParentTestimonials />;
    if (loadingChildren) return <p className="dashboard-loading" role="status">جارٍ تحميل ملفات الأطفال…</p>;

    if (section === 'overview') {
      const activeChildren = children.filter((child) => child.status === 'active').length;
      return (
        <div className="dashboard-overview">
          <section className="dashboard-welcome">
            <div>
              <span className="dashboard-eyebrow">مساحة الأسرة</span>
              <h3>أهلًا بك في لوحة حرف</h3>
              <p>تابع ملفات أطفالك والأنشطة المسجلة من مكان واحد.</p>
            </div>
            <span className="dashboard-welcome__animal" aria-hidden="true">🐼</span>
          </section>
          <div className="dashboard-stat-grid" aria-label="ملخص ملفات الأسرة">
            <article className="dashboard-stat">
              <span>ملفات الأطفال</span>
              <strong>{children.length}</strong>
            </article>
            <article className="dashboard-stat">
              <span>ملفات نشطة</span>
              <strong>{activeChildren}</strong>
            </article>
          </div>
          <div className="dashboard-section-heading">
            <div>
              <h3>ملفات أطفالك</h3>
              <p>اختر ملفًا لعرض تفاصيله أو أضف ملفًا جديدًا.</p>
            </div>
            <button type="button" className="button button--primary" onClick={startCreate}>إضافة طفل</button>
          </div>
          {children.length === 0
            ? <ProgressNotice>لم تضف ملفات أطفال بعد. يمكنك إنشاء ملف باسم مختصر وفئة عمرية اختيارية.</ProgressNotice>
            : <div className="child-list">{children.map(renderChildCard)}</div>}
        </div>
      );
    }

    if (section === 'children') {
      return (
        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <h3>ملفات أطفالي</h3>
              <p>تظل الملفات المؤرشفة محفوظة مع سجلاتها.</p>
            </div>
            <button type="button" className="button button--primary" onClick={startCreate}>إضافة طفل</button>
          </div>
          {children.length === 0
            ? <ProgressNotice>لا توجد ملفات أطفال بعد.</ProgressNotice>
            : <div className="child-list">{children.map(renderChildCard)}</div>}
        </section>
      );
    }

    if (section === 'specialists') {
      const activeChildren = children.filter((child) => child.status === 'active');
      const selectedSpecialist = specialists.find(({ id }) => id === selectedSpecialistId);
      return (
        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <h3>دليل الأخصائيين المعتمدين</h3>
              <p>حجز الأخصائي اختياري تمامًا، ولا يلزم لاستخدام الألعاب التعليمية.</p>
            </div>
          </div>
          {loadingSpecialists && <p className="dashboard-loading" role="status">جارٍ تحميل الأخصائيين والمواعيد…</p>}
          {!loadingSpecialists && specialists.length === 0 && (
            <ProgressNotice>لا توجد ملفات أخصائيين معتمدة ومعلنة حاليًا.</ProgressNotice>
          )}
          {specialists.length > 0 && (
            <>
              <div className="specialist-grid">
                {specialists.map((specialist) => (
                  <article className={`specialist-card${selectedSpecialistId === specialist.id ? ' specialist-card--selected' : ''}`} key={specialist.id}>
                    <span className="specialist-card__portrait-wrap">
                      <span className="specialist-card__icon" aria-hidden="true">✦</span>
                      {specialist.profilePhotoUrl && (
                        <img
                          className="specialist-card__portrait specialist-card__portrait--landscape"
                          src={getApiUrl(specialist.profilePhotoUrl)}
                          alt={`الصورة الشخصية لـ${displayNameOrFallback(specialist.displayName)}`}
                          onError={(event) => { event.currentTarget.hidden = true; }}
                        />
                      )}
                    </span>
                    <h3>{displayNameOrFallback(specialist.displayName)}</h3>
                    <strong>{specialist.specialty}</strong>
                    <p>{specialist.credentials}</p>
                    <p>{specialist.bio}</p>
                    {specialist.appointmentAvailable ? (
                      <>
                        <p>{formatAppointmentPrice(specialist.appointmentPriceMinor, specialist.appointmentCurrency)} · {specialist.appointmentDurationMinutes} دقيقة</p>
                        <button type="button" className="button button--small button--outline"
                          aria-pressed={selectedSpecialistId === specialist.id}
                          onClick={() => setSelectedSpecialistId((current) => current === specialist.id ? '' : specialist.id)}>
                          {selectedSpecialistId === specialist.id ? 'إخفاء المواعيد' : 'اختيار الأخصائي وعرض المواعيد'}
                        </button>
                      </>
                    ) : <p>لا تتوفر مواعيد للحجز حاليًا.</p>}
                  </article>
                ))}
              </div>
              {selectedSpecialist?.appointmentAvailable && (
                <section className="dashboard-section">
                  <h3>المواعيد المتاحة · {displayNameOrFallback(selectedSpecialist.displayName)}</h3>
                  {activeChildren.length > 0 ? (
                    <label className="dashboard-filter">ملف الطفل
                      <select value={selectedChild?.status === 'active' ? selectedChildId : activeChildren[0].id}
                        onChange={(event) => setSelectedChildId(event.target.value)}>
                        {activeChildren.map((child) => <option value={child.id} key={child.id}>{child.displayName}</option>)}
                      </select>
                    </label>
                  ) : <ProgressNotice>أضف ملف طفل نشطًا قبل طلب موعد.</ProgressNotice>}
                  {loadingAvailability ? <p className="dashboard-loading" role="status">جارٍ تحميل المواعيد المتاحة…</p>
                    : specialistAvailability?.slots?.length ? (
                      <div className="appointment-slot-grid">
                        {specialistAvailability.slots.map((slot) => (
                          <article className="appointment-slot" key={slot.startsAt}>
                            <strong>{formatSpecialistSlot(slot)}</strong>
                            <span>{formatAppointmentPrice(slot.amountMinor, slot.currency)} · {slot.durationMinutes} دقيقة</span>
                            <button type="button" className="button button--small button--primary"
                              disabled={bookingAppointment || activeChildren.length === 0}
                              onClick={() => bookAppointment(slot)}>
                              {bookingAppointment ? 'جارٍ الإرسال…' : 'طلب موعد اختياري'}
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : <ProgressNotice>لا توجد مواعيد متاحة خلال الأسبوعين القادمين. جرّب لاحقًا.</ProgressNotice>}
                  <p className="dashboard-privacy-note">السعر والمدة يُحفظان كما كانا وقت طلب الموعد. رسوم الموعد منفصلة عن اشتراك الألعاب، ولا تنفذ المنصة تحصيلها.</p>
                </section>
              )}
            </>
          )}
        </section>
      );
    }

    if (section === 'appointments') {
      return (
        <section className="dashboard-section">
          <h3>طلبات وسجل المواعيد</h3>
          <p>يمكنك طلب المواعيد أو استخدام الألعاب فقط؛ الجلسات ليست شرطًا للوصول للأنشطة التعليمية.</p>
          {loadingAppointments ? <p className="dashboard-loading" role="status">جارٍ تحميل سجل المواعيد…</p>
            : appointments.length === 0 ? <ProgressNotice>لا توجد طلبات أو مواعيد محفوظة.</ProgressNotice>
              : <div className="specialist-appointment-list">
                {appointments.map((appointment) => (
                  <article className="specialist-appointment-card" key={appointment.id}>
                    <div>
                      <div className="parent-appointment-specialist">
                        {appointment.specialistProfilePhotoUrl && (
                          <img src={getApiUrl(appointment.specialistProfilePhotoUrl)} alt="" loading="lazy" />
                        )}
                        <h4>{displayNameOrFallback(appointment.specialistName)} · {appointment.childName || 'ملف طفل'}</h4>
                      </div>
                      <time dateTime={appointment.startsAt}>{new Intl.DateTimeFormat('ar-EG', {
                        timeZone: appointment.timeZone, dateStyle: 'medium', timeStyle: 'short'
                      }).format(new Date(appointment.startsAt))}</time>
                      <p>{appointment.durationMinutes} دقيقة · {formatAppointmentPrice(appointment.amountMinor, appointment.currency)}</p>
                      <span className={`appointment-status appointment-status--${appointment.status}`}>
                        {appointmentStatuses[appointment.status]}
                      </span>
                      {appointment.status === 'pending' && <p>ينتهي طلب الموعد في {formatDate(appointment.expiresAt)} إذا لم يرد الأخصائي.</p>}
                      {appointment.decisionNote && <p>ملاحظة الأخصائي: {appointment.decisionNote}</p>}
                      {appointment.status === 'accepted' && (
                        <p>حالة الجلسة: {{
                          not_started: 'لم تبدأ',
                          in_progress: 'جارية',
                          completed: 'مكتملة'
                        }[appointment.sessionStatus] || 'لم تبدأ'}</p>
                      )}
                      {appointment.parentProgressReport && (
                        <div className="dashboard-privacy-note">
                          <strong>ملخص تعليمي من الأخصائي · {formatDate(appointment.parentProgressReport.createdAt)}</strong>
                          <p>{appointment.parentProgressReport.summary}</p>
                          {appointment.parentProgressReport.suggestedActivities?.length > 0 && (
                            <ul>{appointment.parentProgressReport.suggestedActivities.map((activity) => <li key={activity}>{activity}</li>)}</ul>
                          )}
                          <small>هذا الملخص تعليمي ولا يمثل تشخيصًا طبيًا.</small>
                        </div>
                      )}
                      {appointment.status === 'accepted' && (
                        <>
                          <p className="dashboard-privacy-note">
                            موعد الجلسة: {formatDate(appointment.startsAt)} · الأخصائي: {appointment.specialistName || 'غير متاح'}
                          </p>
                          <p className="dashboard-privacy-note">
                            حالة الجلسة المرئية: {appointment.meetingStatus === 'live' ? 'جارية'
                              : appointment.meetingStatus === 'ended' ? 'منتهية'
                                : appointment.meetingAvailable ? 'مجدولة' : 'غير متاحة'}
                          </p>
                          {appointment.sessionStartedAt && (
                            <p className="dashboard-privacy-note">بدأت الجلسة: {formatDate(appointment.sessionStartedAt)}</p>
                          )}
                          {appointment.sessionEndedAt && (
                            <p className="dashboard-privacy-note">انتهت الجلسة: {formatDate(appointment.sessionEndedAt)}</p>
                          )}
                          {appointment.sessionStatus !== 'completed' && (
                            <>
                              <p className="dashboard-privacy-note">
                                جهّزوا جهازًا متصلًا بالإنترنت، واسمحوا للمتصفح باستخدام الكاميرا والميكروفون عند تشغيلهما داخل الجلسة.
                              </p>
                              <AppointmentJoinButton
                                appointment={appointment}
                                viewerRole="parent"
                                onJoin={() => setMeetingAppointment(appointment)}
                              />
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>}
        </section>
      );
    }

    if (section === 'addChild') {
      return (
        <form className="auth-form child-form dashboard-form" onSubmit={saveChild}>
          <p className="auth-description">
            نطلب اسمًا مختصرًا فقط، ويمكنك اختيار مشاركة الفئة العمرية واستخدام رمز حيوان بدل رفع صورة شخصية.
          </p>
          <label>الاسم الذي تفضل استخدامه
            <input
              name="displayName"
              required
              minLength="1"
              maxLength="50"
              autoComplete="off"
              defaultValue={editingChild?.displayName ?? ''}
            />
          </label>
          <label>الفئة العمرية (اختياري)
            <select name="ageBand" defaultValue={editingChild?.ageBand ?? ''}>
              {ageBands.map((band) => <option value={band.value} key={band.value}>{band.label}</option>)}
            </select>
          </label>
          <label>الصورة الرمزية (اختياري)
            <select name="avatar" defaultValue={editingChild?.avatar ?? ''}>
              {avatars.map((avatar) => (
                <option value={avatar.value} key={avatar.value}>{avatar.emoji} {avatar.label}</option>
              ))}
            </select>
          </label>
          <button className="button button--primary auth-submit" disabled={busy}>
            {editingChild ? 'حفظ التعديلات' : 'إضافة طفل'}
          </button>
          <button type="button" className="auth-text-button" onClick={() => selectSection(editingChild ? 'profile' : 'children')}>
            إلغاء والعودة
          </button>
        </form>
      );
    }

    if (section === 'profile') {
      return selectedChild ? (
        <section className="dashboard-section">
          <article className="dashboard-profile-card">
            <span className="dashboard-avatar dashboard-avatar--large" aria-hidden="true">{avatarFor(selectedChild.avatar)}</span>
            <div>
              <span className="dashboard-eyebrow">ملف الطفل</span>
              <h3>{selectedChild.displayName}</h3>
              <p>{ageBands.find((band) => band.value === selectedChild.ageBand)?.label ?? 'الفئة العمرية غير مشاركة'}</p>
              <span className="child-status">{selectedChild.status === 'active' ? 'ملف نشط' : 'ملف متوقف مؤقتًا'}</span>
            </div>
          </article>
          <div className="dashboard-profile-actions">
            {selectedChild.status === 'active' && (
              <a className="button button--primary" href={`/games?childId=${encodeURIComponent(selectedChild.id)}`}>
                ابدأ نشاطًا تعليميًا
              </a>
            )}
            <button type="button" className="button button--outline" onClick={() => startEdit(selectedChild)}>تعديل الملف</button>
            <button type="button" className="button button--outline" onClick={() => selectSection('progress')}>عرض التقدم</button>
            <button type="button" className="button button--outline" onClick={() => {
              selectSection('progress');
              startLearningSetup();
            }}>إعداد مسارات التعلّم</button>
            <button type="button" className="button button--outline" onClick={() => selectSection('activity')}>سجل الأنشطة</button>
            <button type="button" className="button button--outline" disabled={busy} onClick={() => toggleConsents(selectedChild)}>
              {consentChildId === selectedChild.id ? 'إخفاء الموافقات' : 'إدارة الموافقات'}
            </button>
          </div>
          {consentChildId === selectedChild.id && renderConsentControls(selectedChild)}
          <p className="dashboard-privacy-note">
            لا يحتوي الملف على تاريخ ميلاد دقيق أو بيانات صحية. لا يمكن للوالدين الوصول إلى ملفات أسر أخرى.
          </p>
        </section>
      ) : <ProgressNotice>أضف ملف طفل لعرض تفاصيله هنا.</ProgressNotice>;
    }

    if (section === 'progress') {
      return selectedChild ? (
        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <h3>التقدم التعليمي · {selectedChild.displayName}</h3>
              <p>البيانات أدناه تعرض المحاولات المسجلة فقط، ولا تمثل تشخيصًا طبيًا أو تقييمًا سريريًا.</p>
            </div>
            <div className="dashboard-section-heading__actions">
              <button type="button" className="button button--small button--outline" onClick={() => selectSection('activity')}>كل الأنشطة</button>
              <button type="button" className="button button--small button--primary" disabled={learningSetupBusy || selectedChild.status !== 'active'} onClick={startLearningSetup}>
                {learningSetupBusy ? 'جارٍ التحميل…' : 'إعداد مسارات التعلّم'}
              </button>
            </div>
          </div>
          {learningSetup && (
            <form className="dashboard-learning-setup" onSubmit={previewLearningPaths}>
              <div>
                <h4>استبيان وليّ الأمر</h4>
                <p>تُستخدم اختياراتك لاقتراح أنشطة تعليمية فقط، ويمكنك مراجعة المسارات قبل حفظها.</p>
              </div>
              {learningSetup.questionnaire.questions.map((question) => (
                <fieldset key={question.id}>
                  <legend>{question.text}</legend>
                  {question.helpText && <p>{question.helpText}</p>}
                  {question.options.map((option) => (
                    <label className="dashboard-learning-answer" key={option.id}>
                      <input
                        type={question.type === 'multiple' ? 'checkbox' : 'radio'}
                        name={question.id}
                        value={option.id}
                        checked={question.type === 'multiple'
                          ? (learningSetup.answers[question.id] ?? []).includes(option.id)
                          : learningSetup.answers[question.id] === option.id}
                        onChange={(event) => setLearningAnswer(question, option.id, event.target.checked)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
              <div className="dashboard-learning-setup__actions">
                <button type="submit" className="button button--primary" disabled={learningSetupBusy}>
                  {learningSetupBusy ? 'جارٍ إعداد الاقتراحات…' : 'عرض التوصيات'}
                </button>
                <button type="button" className="button button--outline" disabled={learningSetupBusy} onClick={() => setLearningSetup(null)}>إلغاء</button>
              </div>
              {learningSetup.recommendations && (
                <div className="dashboard-learning-recommendations">
                  <h4>المسارات المقترحة</h4>
                  <p>{learningSetup.recommendations.note}</p>
                  {learningSetup.recommendations.recommendations.map((recommendation) => (
                    <label className="dashboard-learning-recommendation" key={recommendation.key}>
                      <input
                        type="checkbox"
                        checked={learningSetup.selectedPathKeys.includes(recommendation.key)}
                        onChange={(event) => setLearningSetup((current) => ({
                          ...current,
                          selectedPathKeys: event.target.checked
                            ? [...current.selectedPathKeys, recommendation.key]
                            : current.selectedPathKeys.filter((key) => key !== recommendation.key)
                        }))}
                      />
                      <span>
                        <strong>{recommendation.title}</strong>
                        <small>{recommendation.description}</small>
                        <small>سبب الاقتراح: {recommendation.reason}</small>
                      </span>
                    </label>
                  ))}
                  {learningSetup.recommendations.recommendations.length === 0 && (
                    <ProgressNotice>لا توجد مسارات منشورة تطابق هذه الاختيارات حاليًا. يمكنك مراجعة الاستبيان لاحقًا.</ProgressNotice>
                  )}
                  {!currentConsent('learning_data') && (
                    <div className="dashboard-consent-prompt">
                      <p>لم تُفعّل موافقة حفظ أنشطة التعلّم. يمكنك معاينة التوصيات، لكن يلزم تفعيل الموافقة من ملف الطفل لحفظ الإجابات والتعيينات.</p>
                      <button type="button" className="button button--outline" onClick={() => selectSection('profile')}>مراجعة موافقات الملف</button>
                    </div>
                  )}
                  <button type="button" className="button button--primary"
                    disabled={learningSetupBusy || learningSetup.selectedPathKeys.length === 0 || !currentConsent('learning_data')}
                    onClick={confirmLearningPaths}>
                    {learningSetupBusy ? 'جارٍ الحفظ…' : 'حفظ الاختيارات'}
                  </button>
                </div>
              )}
            </form>
          )}
          {attemptTotal > 0 && !loadingAttempts && (
            <article className="dashboard-progress-summary">
              <span>محاولات ألعاب مسجلة</span>
              <strong>{attemptTotal}</strong>
              <p>هذا عدد المحاولات المحفوظة في النظام، وليس مقياسًا لمستوى الطفل.</p>
            </article>
          )}
          {loadingLearningProgress ? (
            <p className="dashboard-loading" role="status">جارٍ تحميل مسار التعلّم…</p>
          ) : learningProgressMessage ? (
            <ProgressNotice>{learningProgressMessage}</ProgressNotice>
          ) : learningProgress ? (
            <>
              <p className="dashboard-privacy-note">{learningProgress.note}</p>
              {learningProgress.paths.length === 0 ? (
                <ProgressNotice>لم تُعيّن مسارات لهذا الطفل بعد. ابدأ بإعداد الاستبيان لرؤية توصيات مناسبة.</ProgressNotice>
              ) : learningProgress.paths.map((path) => (
                <section className="dashboard-learning-path-card" key={path.key}>
                  <article className="dashboard-progress-summary">
                    <span>{path.title} · {path.assignmentType === 'primary'
                      ? 'مسار أساسي'
                      : path.assignmentType === 'complementary' ? 'مسار تكميلي' : 'مسار سابق'}</span>
                    <strong>{path.summary.completedActivities} من {path.summary.totalActivities}</strong>
                    <p>{path.description}</p>
                    {path.assignmentReason && <small>سبب التوصية: {path.assignmentReason}</small>}
                    {path.status === 'paused' && <small>هذا المسار متوقف مؤقتًا.</small>}
                  </article>
                  <div className="dashboard-learning-activities">
                    {path.activities.map((activity) => (
                      <article className="dashboard-attempt" key={activity.gameId}>
                        <div>
                          <h4>{activity.title}</h4>
                          <span>{activity.learningArea} · {activity.status === 'completed'
                            ? 'مكتمل'
                            : activity.status === 'available' ? 'متاح الآن' : 'قادم'}</span>
                        </div>
                        <p>{activity.suggestionReason ?? activity.description}</p>
                        {activity.attemptCount > 0 && (
                          <small>محاولات مسجلة: {activity.attemptCount}
                            {activity.recentAccuracyPercent !== null
                              ? ` · الدقة في أحدث المحاولات: ${activity.recentAccuracyPercent}%`
                              : ''}
                          </small>
                        )}
                        {['active', 'completed'].includes(path.status) && activity.status !== 'upcoming' && (
                          <a className="button button--small button--outline" href={`/games/${encodeURIComponent(activity.gameId)}?childId=${encodeURIComponent(selectedChild.id)}`}>
                            {activity.status === 'completed' ? 'تكرار النشاط' : 'ابدأ النشاط'}
                          </a>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </>
          ) : (
            <ProgressNotice>لا يوجد مسار تعلّم منشور حاليًا.</ProgressNotice>
          )}
          <h4 className="dashboard-subheading">أحدث الأنشطة المسجلة</h4>
          {renderAttemptList()}
        </section>
      ) : <ProgressNotice>اختر ملف طفل لعرض تقدمه.</ProgressNotice>;
    }

    if (section === 'activity') {
      return selectedChild ? (
        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <h3>سجل الأنشطة · {selectedChild.displayName}</h3>
              <p>يعرض السجل محاولات الألعاب المسجلة لهذا الملف فقط.</p>
            </div>
            <label className="dashboard-filter">تصفية حسب اللعبة
              <select
                value={gameFilter}
                onChange={(event) => {
                  setGameFilter(event.target.value);
                  setAttemptPage(1);
                }}
              >
                <option value="">كل الألعاب</option>
                <option value="word-sounds">فقاعات الأصوات</option>
                <option value="word-match">صندوق الكلمات</option>
                <option value="matching-pairs">لعبة توصيل الصور</option>
                <option value="animal-sounds">اسمع صوت الحيوان</option>
              </select>
            </label>
          </div>
          {renderAttemptList()}
        </section>
      ) : <ProgressNotice>اختر ملف طفل لعرض سجل الأنشطة.</ProgressNotice>;
    }

    if (section === 'reports') {
      if (!selectedChild) return <ProgressNotice>اختر ملف طفل لإدارة التقارير.</ProgressNotice>;
      const childReports = appointments.filter((appointment) => (
        appointment.childId === selectedChild.id && appointment.parentProgressReport
      ));
      return (
        <section className="dashboard-section">
          <h3>تقارير التقدم · {selectedChild.displayName}</h3>
          {!currentConsent('progress_reports') && (
            <div className="dashboard-consent-prompt">
              <p>لم تمنح موافقة إعداد تقارير التقدم لهذا الملف. يمكنك مراجعة الموافقات من صفحة الملف الشخصي.</p>
              <button type="button" className="button button--outline" onClick={() => selectSection('profile')}>مراجعة الموافقات</button>
            </div>
          )}
          {!currentConsent('progress_reports')
            ? <ProgressNotice>لا توجد تقارير معروضة. موافقة التقارير منفصلة عن موافقة حفظ أنشطة التعلّم.</ProgressNotice>
            : loadingAppointments
              ? <p className="dashboard-loading" role="status">جارٍ تحميل التقارير…</p>
              : childReports.length === 0
                ? <ProgressNotice>لا يوجد تقرير أخصائي محفوظ لهذا الملف حتى الآن.</ProgressNotice>
                : <div className="specialist-appointment-list">
                  {childReports.map((appointment) => (
                    <article className="specialist-appointment-card" key={appointment.id}>
                      <h4>{displayNameOrFallback(appointment.specialistName)} · {formatDate(appointment.parentProgressReport.createdAt)}</h4>
                      <p>{appointment.parentProgressReport.summary}</p>
                      {appointment.parentProgressReport.suggestedActivities?.length > 0 && (
                        <ul>{appointment.parentProgressReport.suggestedActivities.map((activity) => <li key={activity}>{activity}</li>)}</ul>
                      )}
                      <small>ملخص تعليمي لا يمثل تشخيصًا طبيًا.</small>
                    </article>
                  ))}
                </div>}
        </section>
      );
    }

    if (section === 'payments') {
      const paymentMethodLabels = { vodafone_cash: 'Vodafone Cash', instapay: 'InstaPay' };
      const paymentStatusLabels = {
        pending: 'بانتظار مراجعة المسؤول',
        reviewing: 'قيد المراجعة',
        approved: 'تمت الموافقة',
        rejected: 'مرفوض'
      };
      const subscriptionStatusLabels = {
        active: 'نشط',
        expired: 'منتهي',
        scheduled: 'مجدول',
        none: 'غير مشترك',
        inactive: 'غير مشترك'
      };
      const enabledMethods = Object.entries(subscriptionPlan?.methods ?? {})
        .filter(([, method]) => method.enabled);
      const hasOpenPayment = paymentHistory.some((payment) => ['pending', 'reviewing'].includes(payment.status));
      const subscriptionStatus = subscription?.status ?? 'inactive';
      const formattedPrice = subscriptionPlan?.configured
        ? new Intl.NumberFormat('ar-EG', {
            style: 'currency',
            currency: subscriptionPlan.currency,
            maximumFractionDigits: 2
          }).format(subscriptionPlan.amountMinor / 100)
        : 'لم يتم إعداد السعر بعد';
      const selectedAmountMinor = billingPeriod === 'annual'
        ? subscriptionPlan?.annualAmountMinor
        : subscriptionPlan?.amountMinor;
      const selectedPrice = selectedAmountMinor
        ? new Intl.NumberFormat('ar-EG', {
            style: 'currency',
            currency: subscriptionPlan.currency,
            maximumFractionDigits: 2
          }).format(selectedAmountMinor / 100)
        : '';
      return (
        <section className="dashboard-section dashboard-billing">
          <header className="dashboard-billing__hero">
            <span className="dashboard-billing__hero-icon" aria-hidden="true">ج.م</span>
            <div>
              <span className="dashboard-eyebrow">إدارة عضويتك</span>
              <h3>الاشتراك والمدفوعات</h3>
              <p>تابع حالة اشتراكك وقدّم طلب التجديد بأمان.</p>
            </div>
            {!loadingBilling && (
              <span className={`dashboard-billing__status dashboard-billing__status--${subscriptionStatus}`}>
                <i aria-hidden="true" />
                {subscriptionStatusLabels[subscriptionStatus] ?? 'غير مشترك'}
              </span>
            )}
          </header>

          {loadingBilling ? <p className="dashboard-loading" role="status">جارٍ تحميل بيانات الاشتراك والدفع…</p> : (
            <div className="dashboard-billing__summary">
              <article className="dashboard-billing__plan">
                <div>
                  <span className="dashboard-billing__eyebrow">الخطة {billingPeriod === 'annual' ? 'السنوية' : 'الشهرية'}</span>
                  <strong>{billingPeriod === 'annual' && subscriptionPlan?.annualAmountMinor ? selectedPrice : formattedPrice}</strong>
                  <p>اشتراك لمدة {billingPeriod === 'annual' ? '١٢ شهرًا' : 'شهر واحد'} للوصول إلى الألعاب التعليمية المنشورة.</p>
                </div>
                <span className="dashboard-billing__plan-icon" aria-hidden="true">✦</span>
              </article>
              <article className="dashboard-billing__term">
                <span>{subscription?.status === 'scheduled' ? 'يبدأ الاشتراك في' : 'تاريخ انتهاء الاشتراك'}</span>
                <strong>
                  {subscription?.status === 'scheduled' && subscription.startsAt
                    ? formatDate(subscription.startsAt)
                    : subscription?.expiresAt
                      ? formatDate(subscription.expiresAt)
                      : 'لا يوجد اشتراك نشط'}
                </strong>
                <p>مدة الاشتراك {subscription?.period === 'annual' ? 'سنة كاملة' : 'شهر واحد'}، ويبدأ أي تجديد بعد انتهاء المدة الحالية.</p>
              </article>
            </div>
          )}

          {hasOpenPayment ? (
            <div className="dashboard-billing__pending" role="status">
              <span aria-hidden="true">◷</span>
              <div>
                <strong>طلبك قيد المراجعة</strong>
                <p>لديك طلب دفع مفتوح بالفعل. ستظهر حالة المراجعة هنا؛ لا ترسل طلبًا آخر الآن.</p>
              </div>
            </div>
          ) : subscriptionPlan?.configured && enabledMethods.length > 0 ? (
            <form className="dashboard-payment-form dashboard-billing__form" onSubmit={submitPayment}>
              <div className="dashboard-billing__form-heading">
                <span aria-hidden="true">↗</span>
                <div>
                  <h4>اشترك أو جدّد الآن</h4>
                  <p>حوّل قيمة الاشتراك باستخدام إحدى الطرق المتاحة، ثم أرسل بيانات التحويل للمراجعة.</p>
                </div>
              </div>
              <label>طريقة الدفع
                <select name="method" required defaultValue={enabledMethods[0][0]}>
                  {enabledMethods.map(([methodId, method]) => (
                    <option key={methodId} value={methodId}>{paymentMethodLabels[methodId]} — {method.recipient}</option>
                  ))}
                </select>
              </label>
              <fieldset className="dashboard-billing__period">
                <legend>مدة الاشتراك</legend>
                <label className={billingPeriod === 'monthly' ? 'is-selected' : ''}>
                  <input type="radio" name="period" value="monthly" checked={billingPeriod === 'monthly'}
                    onChange={() => setBillingPeriod('monthly')} />
                  <span><strong>شهري</strong><small>{formattedPrice} · شهر واحد</small></span>
                </label>
                {subscriptionPlan?.annualAmountMinor && (
                  <label className={billingPeriod === 'annual' ? 'is-selected' : ''}>
                    <input type="radio" name="period" value="annual" checked={billingPeriod === 'annual'}
                      onChange={() => setBillingPeriod('annual')} />
                    <span><strong>سنوي</strong><small>{new Intl.NumberFormat('ar-EG', {
                      style: 'currency',
                      currency: subscriptionPlan.currency,
                      maximumFractionDigits: 2
                    }).format(subscriptionPlan.annualAmountMinor / 100)} · ١٢ شهرًا</small></span>
                  </label>
                )}
              </fieldset>
              <div className="dashboard-payment-instructions">
                {enabledMethods.map(([methodId, method]) => (
                  <details key={methodId}>
                    <summary><span>{paymentMethodLabels[methodId]}</span><b dir="ltr">{method.recipient}</b></summary>
                    <p>{method.instructions}</p>
                  </details>
                ))}
              </div>
              <div className="dashboard-billing__form-fields">
                <label>مرجع التحويل
                  <input name="transactionReference" required minLength="3" maxLength="100" autoComplete="off" placeholder="أدخل رقم العملية أو مرجع التحويل" />
                </label>
                <label>إيصال الدفع <span>اختياري · حتى 5 MB</span>
                  <input name="receipt" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" />
                </label>
              </div>
              <p className="dashboard-privacy-note">إرسال الطلب أو الإيصال لا يفعّل الاشتراك تلقائيًا. سيُفعّل فقط بعد مراجعة المسؤول والموافقة عليه.</p>
              <button type="submit" className="button button--primary" disabled={busy}>
                {busy ? 'جارٍ إرسال الطلب…' : `إرسال طلب الاشتراك ${billingPeriod === 'annual' ? 'السنوي' : 'الشهري'} · ${selectedPrice}`}
              </button>
            </form>
          ) : (
            <div className="dashboard-billing__unavailable">
              <span aria-hidden="true">i</span>
              <p>{!subscriptionPlan?.configured
                ? 'لم يضبط المسؤول سعر الاشتراك بعد.'
                : 'لا توجد طريقة دفع متاحة حاليًا. يرجى العودة لاحقًا.'}</p>
            </div>
          )}

          <section className="dashboard-billing__history">
            <div className="dashboard-billing__section-heading">
              <div><span>المعاملات</span><h4>طلبات الدفع</h4></div>
              <span>{paymentHistory.length}</span>
            </div>
            {paymentHistory.length === 0
              ? <ProgressNotice>لا توجد طلبات دفع مسجلة حتى الآن.</ProgressNotice>
              : <div className="dashboard-attempt-list">
                {paymentHistory.map((payment) => (
                  <article className="dashboard-attempt dashboard-billing__record" key={payment.id}>
                    <div>
                      <h4>{paymentMethodLabels[payment.method]} · {payment.period === 'annual' ? 'اشتراك سنوي' : 'اشتراك شهري'} · {payment.transactionReference}</h4>
                      <time dateTime={payment.createdAt}>{formatDate(payment.createdAt)}</time>
                    </div>
                    <div className="dashboard-billing__record-meta">
                      <strong>{new Intl.NumberFormat('ar-EG', { style: 'currency', currency: payment.currency }).format(payment.amountMinor / 100)}</strong>
                      <span className={`dashboard-billing__payment-status dashboard-billing__payment-status--${payment.status}`}>
                        {paymentStatusLabels[payment.status] ?? payment.status}
                      </span>
                    </div>
                    {payment.receiptUrl && <a href={payment.receiptUrl} target="_blank" rel="noreferrer">عرض الإيصال المرفق</a>}
                    {payment.review?.decisionNote && <small>{payment.review.decisionNote}</small>}
                  </article>
                ))}
              </div>}
          </section>

          <section className="dashboard-billing__history">
            <div className="dashboard-billing__section-heading">
              <div><span>المدة والخطة</span><h4>سجل الاشتراكات</h4></div>
              <span>{subscriptionHistory.length}</span>
            </div>
            {subscriptionHistory.length === 0
              ? <ProgressNotice>لا توجد اشتراكات سابقة. تبقى ملفات الأطفال وسجلاتهم محفوظة عند انتهاء الاشتراك.</ProgressNotice>
              : <div className="dashboard-attempt-list">
                {subscriptionHistory.map((item) => (
                  <article className="dashboard-attempt dashboard-billing__record" key={item.id}>
                    <div>
                      <h4>{subscriptionStatusLabels[item.status] ?? 'اشتراك'} · {item.period === 'annual' ? 'سنوي' : 'شهري'} · {item.paymentMethod ? paymentMethodLabels[item.paymentMethod] : 'تفعيل إداري سابق'}</h4>
                      <span>{formatDate(item.startsAt)} — {formatDate(item.expiresAt)}</span>
                    </div>
                    {item.amountMinor && (
                      <p>{new Intl.NumberFormat('ar-EG', { style: 'currency', currency: item.currency }).format(item.amountMinor / 100)}
                        {item.transactionReference ? ` · مرجع ${item.transactionReference}` : ''}
                      </p>
                    )}
                  </article>
                ))}
              </div>}
          </section>
        </section>
      );
    }

    if (section === 'notifications') {
      return <NotificationCenter appointmentHref="/dashboard?section=appointments" />;
    }

    return (
      <section className="dashboard-section">
        <h3>إعدادات الحساب</h3>
        <div className="dashboard-account-setting">
          <span>البريد الإلكتروني</span>
          <strong dir="ltr">{user?.email ?? 'غير متاح'}</strong>
        </div>
        <p className="dashboard-privacy-note">إدارة كلمة المرور وتسجيل الخروج تتم عبر إعدادات الحساب الآمنة.</p>
        <div className="dashboard-profile-actions">
          <button type="button" className="button button--outline" onClick={onPasswordRecovery}>استعادة كلمة المرور</button>
          <button type="button" className="button button--outline" onClick={onBack}>العودة إلى الحساب</button>
          <button type="button" className="button button--outline" disabled={busy} onClick={onSignOut}>تسجيل الخروج</button>
        </div>
      </section>
    );
  };

  return (
    <div className="parent-dashboard">
      <aside className="parent-dashboard__sidebar" aria-label="قائمة لوحة الأسرة">
        <div className="parent-dashboard__sidebar-heading">
          <span className="dashboard-avatar" aria-hidden="true">🐼</span>
          <div>
            <strong>مساحة الأسرة</strong>
            <small>{user?.email}</small>
          </div>
        </div>
        {children.length > 0 && (
          <label className="dashboard-child-switcher">ملف الطفل
            <select
              value={selectedChildId}
              onChange={(event) => {
                setSelectedChildId(event.target.value);
                setAttemptPage(1);
                setGameFilter('');
              }}
            >
              {children.map((child) => (
                <option value={child.id} key={child.id}>
                  {child.displayName}{child.status === 'archived' ? ' (متوقف)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <nav className="dashboard-nav" aria-label="أقسام لوحة الأسرة">
          {sections.map((item) => (
            <button
              type="button"
              className={section === item.id ? 'dashboard-nav__item is-active' : 'dashboard-nav__item'}
              aria-current={section === item.id ? 'page' : undefined}
              key={item.id}
              onClick={() => selectSection(item.id)}
            >
              <span className="parent-dashboard__nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <p className="parent-dashboard__sidebar-note">حجز الأخصائي اختياري، ويمكنك استخدام الألعاب التعليمية دون موعد.</p>
        <button type="button" className="button button--small button--outline parent-dashboard__back" onClick={onBack}>
          {backLabel}
        </button>
      </aside>

      <div className="parent-dashboard__main" id="parent-dashboard-content">
        <header className="parent-dashboard__header">
          <div>
            <span className="dashboard-eyebrow">حرف · مساحة الأسرة</span>
            <h2>{sectionTitles[section]}</h2>
          </div>
          {selectedChild && <span className="parent-dashboard__active-child">الملف الحالي: <strong>{selectedChild.displayName}</strong></span>}
        </header>
        {notice && <p className="auth-message" role="status">{notice}</p>}
        {error && (
          <div className="auth-error" role="alert">
            <p>{error}</p>
            {sessionExpired
              ? <button type="button" className="auth-text-button" onClick={onReauthenticate}>تسجيل الدخول مجددًا</button>
              : <button type="button" className="auth-text-button" onClick={loadChildren}>إعادة المحاولة</button>}
          </div>
        )}
        {renderContent()}
      </div>
      {meetingAppointment && (
        <AppointmentMeeting
          appointment={meetingAppointment}
          viewerRole="parent"
          displayName={displayNameOrFallback(user?.parentProfile?.displayName, user?.email)}
          onClose={() => {
            setMeetingAppointment(null);
            apiRequest('/api/v1/appointments')
              .then(({ appointments: history }) => setAppointments(history))
              .catch(reportError);
          }}
        />
      )}
    </div>
  );
}
