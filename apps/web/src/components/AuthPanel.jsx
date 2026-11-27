import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiRequest, setCsrfToken } from '../lib/api.js';
import BrandLogo from './BrandLogo.jsx';

const ParentDashboard = lazy(() => import('./ParentDashboard.jsx'));
const AdminDashboard = lazy(() => import('./AdminDashboard.jsx'));
const SpecialistDashboard = lazy(() => import('./SpecialistDashboard.jsx'));
let googleScriptPromise;

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      let script = document.querySelector('script[data-google-identity]');
      const handleLoad = () => resolve();
      const handleError = () => {
        googleScriptPromise = null;
        reject(new Error('تعذر تحميل تسجيل Google. تحقق من اتصالك بالإنترنت ثم حاول مرة أخرى.'));
      };
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.dataset.googleIdentity = 'true';
      }
      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });
      if (!script.isConnected) document.head.append(script);
    });
  }
  return googleScriptPromise;
}

function GoogleSignInButton({
  clientId,
  configurationLoaded,
  configurationError,
  onRetry,
  context,
  disabled,
  onCredential,
  onError
}) {
  const buttonRef = useRef(null);
  const [ready, setReady] = useState(false);
  const enabled = Boolean(clientId);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    loadGoogleIdentityScript()
      .then(() => {
        if (!active || !buttonRef.current) return;
        buttonRef.current.replaceChildren();
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) void onCredential(response.credential);
          },
          ux_mode: 'popup',
          auto_select: false,
          context
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          locale: 'en',
          width: Math.min(400, Math.max(220, buttonRef.current.clientWidth))
        });
        setReady(true);
      })
      .catch((error) => {
        if (active) {
          setReady(false);
          onError(error.message);
        }
      });
    return () => { active = false; };
  }, [clientId, context, enabled, onCredential, onError]);

  return enabled
    ? <div className={`auth-google-button${disabled ? ' is-disabled' : ''}`} aria-busy={!ready}>
        <div ref={buttonRef} />
        {disabled && <span className="auth-google-button__overlay" aria-hidden="true" />}
      </div>
    : (
      <div className="auth-google-unavailable">
        <button type="button" className="auth-google-unavailable__button" disabled>
          <span className="auth-google-mark" aria-hidden="true">G</span>
          Continue with Google
        </button>
        <small role={configurationError ? 'alert' : 'status'}>
          {configurationError
            ? `تعذر تحميل إعداد تسجيل Google: ${configurationError}`
            : configurationLoaded
              ? 'تسجيل Google غير مفعّل على الخادم.'
              : 'جارٍ تحميل إعداد تسجيل Google…'}
        </small>
        {configurationError && <button type="button" className="auth-text-button" onClick={onRetry}>إعادة المحاولة</button>}
      </div>
    );
}

const roleLabels = {
  parent: 'ولي أمر',
  specialist: 'أخصائي',
  admin: 'مسؤول'
};

const approvalLabels = {
  pending: 'بانتظار مراجعة الإدارة',
  approved: 'تم اعتماد الحساب',
  rejected: 'لم تتم الموافقة على الحساب'
};

function roleLabel(role) {
  return roleLabels[role] ?? 'زائر';
}

export default function AuthPanel({ standaloneDashboard = false, standaloneAdmin = false, standaloneSpecialist = false, logoUrl = null }) {
  const [user, setUser] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [view, setView] = useState('login');
  const [registerRole, setRegisterRole] = useState('parent');
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [documentUploadBusy, setDocumentUploadBusy] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleConfigLoaded, setGoogleConfigLoaded] = useState(false);
  const [googleConfigError, setGoogleConfigError] = useState('');
  const queryProcessed = useRef(false);
  const authDialogRef = useRef(null);

  useEffect(() => {
    if (queryProcessed.current) return;
    queryProcessed.current = true;
    apiRequest('/api/v1/auth/session')
      .then((result) => {
        setUser(result.user);
        setCsrfToken(result.csrfToken);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setSessionChecked(true));

    const url = new URL(window.location.href);
    const verificationToken = url.searchParams.get('verify-email');
    const passwordToken = url.searchParams.get('reset-password');
    if (verificationToken) {
      setOpen(true);
      setView('login');
      setBusy(true);
      apiRequest('/api/v1/auth/email/verify', {
        method: 'POST',
        body: JSON.stringify({ token: verificationToken }),
        headers: { 'Content-Type': 'application/json' }
      }).then((result) => {
        setNotice(result.message);
      }).catch((requestError) => {
        setError(requestError.message);
      }).finally(() => setBusy(false));
      url.searchParams.delete('verify-email');
      window.history.replaceState({}, '', url);
    } else if (passwordToken) {
      setResetToken(passwordToken);
      setView('reset');
      setOpen(true);
      url.searchParams.delete('reset-password');
      window.history.replaceState({}, '', url);
    }
  }, []);

  const loadGoogleConfig = useCallback(async () => {
    setGoogleConfigError('');
    try {
      const { clientId } = await apiRequest('/api/v1/auth/google/config');
      setGoogleClientId(clientId ?? '');
    } catch (requestError) {
      setGoogleClientId('');
      setGoogleConfigError(requestError.message);
    } finally {
      setGoogleConfigLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadGoogleConfig();
  }, [loadGoogleConfig]);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      authDialogRef.current?.querySelector('input, button, select, textarea, a[href]')?.focus();
    });
    const handleDialogKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(authDialogRef.current?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], iframe, [tabindex]:not([tabindex="-1"])'
      ) ?? [])].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
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
    window.addEventListener('keydown', handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleDialogKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);

  const startView = (nextView) => {
    setNotice('');
    setError('');
    setView(nextView);
    setOpen(true);
  };

  const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleSession = useCallback((result) => {
    if (result.user !== undefined) setUser(result.user);
    if (result.csrfToken) {
      setCsrfToken(result.csrfToken);
    }
  }, []);

  const handleGoogleCredential = useCallback(async (credential) => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await apiRequest('/api/v1/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential })
      });
      handleSession(result);
      setView('account');
      setNotice(result.user.approvalStatus === 'approved'
        ? 'تم تسجيل الدخول باستخدام Google.'
        : 'تم إنشاء الحساب وتأكيد البريد عبر Google. سيظهر لك الحساب بعد اعتماد الإدارة.');
    } catch (requestError) {
      const message = requestError.code === 'GOOGLE_PARENT_ONLY'
        ? 'تسجيل Google متاح لحسابات أولياء الأمور فقط. استخدم طريقة الدخول الحالية لهذا الحساب.'
        : requestError.code === 'GOOGLE_IDENTITY_CONFLICT'
          ? 'هذا البريد مرتبط بحساب آخر. سجّل الدخول بالبريد وكلمة المرور أولًا.'
          : requestError.message;
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [handleSession]);

  const handleGoogleError = useCallback((message) => setError(message), []);

  const submitSpecialistDocuments = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setError('');
    setNotice('');
    setDocumentUploadBusy(true);
    try {
      const { user: updatedUser } = await apiRequest('/api/v1/auth/specialist/documents', {
        method: 'POST',
        body: new FormData(form)
      });
      setUser(updatedUser);
      setNotice('تم رفع الوثائق بنجاح. أصبحت متاحة للمسؤول لمراجعتها واعتماد الحساب.');
      form.reset();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDocumentUploadBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const fields = Object.fromEntries(form.entries());

    try {
      if (view === 'register') {
        const specialistRegistration = fields.role === 'specialist';
        const result = await apiRequest('/api/v1/auth/register', specialistRegistration ? {
          method: 'POST',
          body: form
        } : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: fields.email,
            password: fields.password,
            role: fields.role,
            displayName: fields.displayName
          })
        });
        if (result.user) {
          handleSession(result);
          setView('account');
          setNotice('تم إنشاء الحساب. راجع بريدك الإلكتروني لتأكيده، وبعدها تنتظر مراجعة الإدارة.');
        } else {
          setNotice('إذا كان إنشاء الحساب ممكنًا، ستصلك رسالة بالبريد الإلكتروني. إذا كان لديك حساب، سجّل الدخول أو استعد كلمة المرور.');
          setView('login');
        }
      } else if (view === 'login') {
        const result = await apiRequest('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: fields.email, password: fields.password })
        });
        handleSession(result);
        setView('account');
        setNotice('تم تسجيل الدخول.');
      } else if (view === 'forgot') {
        const result = await apiRequest('/api/v1/auth/password/forgot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: fields.email })
        });
        setNotice(result.message);
        setView('login');
      } else if (view === 'reset') {
        const result = await apiRequest('/api/v1/auth/password/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken, password: fields.password })
        });
        setNotice(result.message);
        setView('login');
      } else if (view === 'profile') {
        const result = await apiRequest('/api/v1/auth/specialist/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: fields.displayName,
            specialty: fields.specialty,
            credentials: fields.credentials,
            bio: fields.bio,
            publicListing: form.get('publicListing') === 'on'
          })
        });
        handleSession(result);
        setNotice('تم حفظ الملف المهني.');
        setView('account');
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    if (!user) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await apiRequest('/api/v1/auth/email/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email })
      });
      setNotice(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setError('');
    setBusy(true);
    try {
      await apiRequest('/api/v1/auth/logout', { method: 'POST' });
      setUser(null);
      setCsrfToken('');
      setView('login');
      setNotice('تم تسجيل الخروج.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const googleAvailableHere = !standaloneAdmin && !standaloneSpecialist;
  const renderGoogleOption = (context) => (
    <div className="auth-provider">
      <GoogleSignInButton
        clientId={googleClientId}
        configurationLoaded={googleConfigLoaded}
        configurationError={googleConfigError}
        onRetry={loadGoogleConfig}
        context={context}
        disabled={busy}
        onCredential={handleGoogleCredential}
        onError={handleGoogleError}
      />
      <div className="auth-divider"><span>أو باستخدام البريد الإلكتروني</span></div>
    </div>
  );

  const renderForm = () => {
    if (view === 'register') {
      return (
        <>
          {googleAvailableHere && registerRole === 'parent' && renderGoogleOption('signup')}
          <label>الاسم
            <input name="displayName" required minLength="2" maxLength="100" autoComplete="name" />
          </label>
          <label>نوع الحساب
            <select name="role" value={registerRole} onChange={(event) => setRegisterRole(event.target.value)}>
              <option value="parent">ولي أمر</option>
              <option value="specialist">أخصائي تخاطب</option>
            </select>
          </label>
            {registerRole === 'specialist' && <p className="auth-description">تسجيل Google مخصص لحسابات أولياء الأمور؛ يلزم تسجيل الأخصائي بالبريد ورفع وثائق التحقق.</p>}
          <label>البريد الإلكتروني
              <input name="email" type="email" required maxLength="254" autoComplete="email" placeholder="name@example.com" dir="ltr" />
          </label>
          <label>كلمة المرور
              <input name="password" type="password" required minLength="12" maxLength="128" autoComplete="new-password" placeholder="١٢ حرفًا على الأقل" dir="ltr" />
          </label>
          {registerRole === 'specialist' && (
            <div className="specialist-document-fields">
              <p className="auth-description">يلزم رفع صورة شخصية وصورتي كارنيه مزاولة المهنة للتحقق من الحساب. مستندات الكارنيه خاصة ولا يطلع عليها إلا مسؤولو المنصة.</p>
              <label>الصورة الشخصية
                <input name="profilePhoto" type="file" accept="image/png,image/jpeg,image/webp" required />
              </label>
              <label>كارنيه مزاولة المهنة — الوجه الأمامي
                <input name="medicalCardFront" type="file" accept="image/png,image/jpeg,image/webp" required />
              </label>
              <label>كارنيه مزاولة المهنة — الوجه الخلفي
                <input name="medicalCardBack" type="file" accept="image/png,image/jpeg,image/webp" required />
              </label>
              <small>صور PNG أو JPEG أو WebP، بحد أقصى 5 ميجابايت لكل صورة.</small>
            </div>
          )}
          <button className="button button--primary auth-submit" disabled={busy}>إنشاء الحساب</button>
          <p className="auth-form__switch">لديك حساب؟ <button type="button" className="auth-text-button" onClick={() => startView('login')}>تسجيل الدخول</button></p>
        </>
      );
    }

    if (view === 'login') {
      return (
        <>
          {googleAvailableHere && renderGoogleOption('signin')}
          <label>البريد الإلكتروني
            <input name="email" type="email" required maxLength="254" autoComplete="email" placeholder="name@example.com" dir="ltr" />
          </label>
          <label>كلمة المرور
            <input name="password" type="password" required maxLength="128" autoComplete="current-password" placeholder="أدخل كلمة المرور" dir="ltr" />
          </label>
          <button className="button button--primary auth-submit" disabled={busy}>دخول</button>
          <button type="button" className="auth-text-button" onClick={() => startView('forgot')}>نسيت كلمة المرور؟</button>
          <button type="button" className="auth-text-button" onClick={() => startView('register')}>إنشاء حساب جديد</button>
        </>
      );
    }

    if (view === 'forgot') {
      return (
        <>
          <p className="auth-description">أدخل بريدك الإلكتروني إذا أردت استعادة كلمة المرور.</p>
          <label>البريد الإلكتروني
            <input name="email" type="email" required maxLength="254" autoComplete="email" dir="ltr" />
          </label>
          <button className="button button--primary auth-submit" disabled={busy}>إرسال التعليمات</button>
          <button type="button" className="auth-text-button" onClick={() => startView('login')}>العودة لتسجيل الدخول</button>
        </>
      );
    }

    if (view === 'reset') {
      return (
        <>
          <p className="auth-description">اختر كلمة مرور جديدة لا تقل عن ١٢ حرفًا.</p>
          <label>كلمة المرور الجديدة
            <input name="password" type="password" required minLength="12" maxLength="128" autoComplete="new-password" dir="ltr" />
          </label>
          <button className="button button--primary auth-submit" disabled={busy}>تحديث كلمة المرور</button>
        </>
      );
    }

    if (view === 'profile') {
      const profile = user?.professionalProfile ?? {};
      return (
        <>
          <p className="auth-description">يظهر ملفك في الدليل العام بعد اعتماد الحساب واكتمال المعلومات واختيار النشر.</p>
          <label>الاسم المهني
            <input name="displayName" defaultValue={profile.displayName} maxLength="100" />
          </label>
          <label>التخصص
            <input name="specialty" defaultValue={profile.specialty} maxLength="100" />
          </label>
          <label>المؤهلات المهنية
            <input name="credentials" defaultValue={profile.credentials} maxLength="160" />
          </label>
          <label>نبذة مهنية
            <textarea name="bio" rows="4" maxLength="1200" defaultValue={profile.bio} />
          </label>
          <label className="auth-checkbox">
            <input name="publicListing" type="checkbox" defaultChecked={profile.publicListing} />
            أرغب في إظهار ملفي العام بعد الاعتماد واكتمال المعلومات
          </label>
          <button className="button button--primary auth-submit" disabled={busy}>حفظ الملف المهني</button>
        </>
      );
    }
    return null;
  };

  if (standaloneDashboard || standaloneAdmin || standaloneSpecialist) {
    const correctRole = standaloneAdmin ? user?.role === 'admin'
      : standaloneSpecialist ? user?.role === 'specialist'
        : user?.role === 'parent';
    const accountApproved = standaloneAdmin || user?.approvalStatus === 'approved';
    const canUseDashboard = correctRole
      && user?.emailVerified
      && accountApproved
      && user?.accountStatus === 'active';
    const returnHome = () => navigateTo('/');
    const portalTitle = standaloneAdmin ? 'لوحة تحكم المسؤول'
      : standaloneSpecialist ? 'لوحة الأخصائي'
        : 'لوحة الأسرة';

    return (
      <div className="family-page" dir="rtl">
        <header className="family-page__header">
          <BrandLogo homeHref="/" logoUrl={logoUrl} />
          <div className="family-page__header-actions">
            <a className="button button--small button--outline" href="/">العودة للموقع</a>
            {canUseDashboard && (
              <button className="button button--small button--primary" type="button" disabled={busy} onClick={signOut}>
                تسجيل الخروج
              </button>
            )}
          </div>
        </header>
        <a className="skip-link" href="#family-main">انتقل إلى محتوى لوحة التحكم</a>
        <main className="family-page__main" id="family-main">
          {!sessionChecked ? (
            <p className="dashboard-loading" role="status">جارٍ التحقق من جلسة الدخول…</p>
          ) : canUseDashboard ? (
            standaloneAdmin ? (
              <Suspense fallback={<p className="dashboard-loading" role="status">جارٍ تحميل لوحة الإدارة…</p>}>
                <AdminDashboard
                  user={user}
                  onSignOut={signOut}
                  onProfileUpdated={setUser}
                  onReauthenticate={() => {
                    setUser(null);
                    startView('login');
                  }}
                />
              </Suspense>
            ) : standaloneSpecialist ? (
              <Suspense fallback={<p className="dashboard-loading" role="status">جارٍ تحميل لوحة الأخصائي…</p>}>
                <SpecialistDashboard
                  user={user}
                  onSignOut={signOut}
                  onReauthenticate={() => {
                    setUser(null);
                    startView('login');
                  }}
                  onProfileUpdated={setUser}
                />
              </Suspense>
            ) : <>
              <div className="family-page__title">
                <span className="dashboard-eyebrow">مساحة الأسرة</span>
                <h1>لوحة الأسرة</h1>
                <p>إدارة ملفات أطفالك ومتابعة الأنشطة المسجلة في صفحة مستقلة.</p>
              </div>
              <Suspense fallback={<p className="dashboard-loading" role="status">جارٍ تحميل لوحة الأسرة…</p>}>
                <ParentDashboard
                  user={user}
                  onBack={returnHome}
                  backLabel="العودة للموقع"
                  onPasswordRecovery={() => startView('forgot')}
                  onSignOut={signOut}
                  onProfileUpdated={setUser}
                  onReauthenticate={() => {
                    setUser(null);
                    startView('login');
                  }}
                />
              </Suspense>
            </>
          ) : user ? (
            <section className="family-page__auth">
              <h1>{portalTitle} غير متاحة لهذا الحساب</h1>
              <p role="status">
                {!correctRole
                  ? standaloneAdmin
                    ? 'لوحة الإدارة مخصصة لحساب المسؤول.'
                    : standaloneSpecialist
                      ? 'لوحة الأخصائي مخصصة لحساب الأخصائي.'
                      : 'لوحة الأسرة مخصصة لحساب ولي الأمر.'
                  : user.accountStatus !== 'active'
                    ? 'الحساب موقوف حاليًا. تواصل مع الإدارة للمساعدة.'
                    : !user.emailVerified
                      ? 'أكد بريدك الإلكتروني أولًا.'
                      : standaloneAdmin ? 'تعذر التحقق من صلاحية المسؤول.' : 'حسابك بانتظار اعتماد الإدارة.'}
              </p>
              <button type="button" className="button button--outline" onClick={returnHome}>العودة إلى الصفحة الرئيسية</button>
              <button type="button" className="auth-text-button" disabled={busy} onClick={signOut}>تسجيل الخروج</button>
            </section>
          ) : (
            <section className="family-page__auth">
              <h1>{view === 'forgot' ? 'استعادة كلمة المرور' : view === 'register' ? 'إنشاء حساب' : standaloneAdmin ? 'دخول المسؤول' : 'دخول ولي الأمر'}</h1>
              <p>{standaloneAdmin
                ? 'سجّل الدخول بحساب المسؤول للوصول إلى لوحة الإدارة.'
                : standaloneSpecialist
                  ? 'سجّل الدخول بحساب أخصائي معتمد لإدارة ملفك ومواعيدك.'
                  : 'سجّل الدخول بحساب ولي أمر معتمد للوصول إلى لوحة الأسرة.'}</p>
              {notice && <p className="auth-message" role="status">{notice}</p>}
              {error && <p className="auth-error" role="alert">{error}</p>}
              <form className="auth-form" onSubmit={submit}>{renderForm()}</form>
              <a className="auth-text-button family-page__home-link" href="/">العودة إلى الصفحة الرئيسية</a>
            </section>
          )}
        </main>
      </div>
    );
  }

  const themeRoot = document.querySelector('#root .platform-brand, #root .game-page');
  const themeStyles = themeRoot ? getComputedStyle(themeRoot) : null;
  const modalThemeStyle = themeStyles
    ? Object.fromEntries([
      '--blue',
      '--teal',
      '--purple',
      '--yellow',
      '--coral',
      '--ink',
      '--muted'
    ].map((property) => [property, themeStyles.getPropertyValue(property).trim()]).filter(([, value]) => value))
    : undefined;

  return (
    <>
      <button
        className="button button--small button--outline auth-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => startView(user ? 'account' : 'login')}
      >
        {user ? roleLabel(user.role) : 'دخول / حساب'}
      </button>
      {open && (
        createPortal(
          <div className="auth-backdrop" style={modalThemeStyle} onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}>
            <section ref={authDialogRef} className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" aria-describedby="auth-dialog-description">
              <button className="auth-close" type="button" aria-label="إغلاق" onClick={() => setOpen(false)}>×</button>
              <div className="auth-dialog__brand" aria-hidden="true">
                <span>ح</span>
                <small>مساحة آمنة للعائلة</small>
              </div>
              <h2 id="auth-title">
                {view === 'register' ? 'إنشاء حساب' : view === 'login' ? 'أهلًا بك في حرف' : view === 'profile' ? 'الملف المهني' : view === 'account' ? 'حسابك في حرف' : view === 'forgot' ? 'استعادة كلمة المرور' : 'كلمة مرور جديدة'}
              </h2>
              <p className="auth-dialog__description" id="auth-dialog-description">
                {view === 'register'
                  ? 'أنشئ حسابك وابدأ متابعة رحلة طفلك التعليمية.'
                  : view === 'login'
                    ? 'سجّل دخولك بأمان لمتابعة حسابك ورحلة طفلك.'
                    : view === 'forgot'
                      ? 'سنساعدك على استعادة الوصول إلى حسابك.'
                      : 'بياناتك محفوظة بأمان في منصة حرف.'}
              </p>
              {notice && <p className="auth-message" role="status">{notice}</p>}
              {error && <p className="auth-error" role="alert">{error}</p>}

              {view === 'account' && user && (
                <div className="account-summary">
                  <p><strong>{user.email}</strong></p>
                  <p>نوع الحساب: {roleLabel(user.role)}</p>
                  <p>حالة البريد: {user.emailVerified ? 'تم التأكيد' : 'بانتظار تأكيد البريد'}</p>
                  {user.role !== 'admin' && <p>حالة الاعتماد: {approvalLabels[user.approvalStatus] ?? user.approvalStatus}</p>}
                  {user.accountStatus === 'suspended' && <p className="auth-error">الحساب موقوف. تواصل مع الإدارة.</p>}
                  {!user.emailVerified && <button className="button button--outline auth-submit" disabled={busy} onClick={resendVerification}>إعادة إرسال رسالة التأكيد</button>}
                  {user.role === 'specialist' && !user.professionalProfile?.identityDocumentsComplete && user.accountStatus === 'active' && (
                    <form className="auth-form specialist-document-fields" onSubmit={submitSpecialistDocuments}>
                      <h3>استكمال وثائق اعتماد الأخصائي</h3>
                      <p className="auth-description">ارفع صورة شخصية وصورتي كارنيه مزاولة المهنة حتى يتمكن المسؤول من مراجعة طلبك. هذه الوثائق خاصة ولا تظهر في دليل الأخصائيين.</p>
                      <label>الصورة الشخصية
                        <input name="profilePhoto" type="file" accept="image/png,image/jpeg,image/webp" required />
                      </label>
                      <label>الوجه الأمامي للكارنيه
                        <input name="medicalCardFront" type="file" accept="image/png,image/jpeg,image/webp" required />
                      </label>
                      <label>الوجه الخلفي للكارنيه
                        <input name="medicalCardBack" type="file" accept="image/png,image/jpeg,image/webp" required />
                      </label>
                      <small>صور PNG أو JPEG أو WebP، بحد أقصى 5 ميجابايت لكل صورة.</small>
                      <button className="button button--primary auth-submit" disabled={documentUploadBusy}>
                        {documentUploadBusy ? 'جارٍ رفع الوثائق…' : 'رفع الوثائق للمراجعة'}
                      </button>
                    </form>
                  )}
                  {user.role === 'specialist' && <button className="button button--outline auth-submit" onClick={() => startView('profile')}>إكمال الملف المهني</button>}
                  {user.role === 'parent'
                    && user.emailVerified
                    && user.approvalStatus === 'approved'
                    && user.accountStatus === 'active'
                    && <button className="button button--outline auth-submit" onClick={() => navigateTo('/dashboard')}>لوحة الأسرة</button>}
                  {user.role === 'specialist'
                    && user.emailVerified
                    && user.approvalStatus === 'approved'
                    && user.accountStatus === 'active'
                    && <button className="button button--outline auth-submit" onClick={() => navigateTo('/specialist')}>لوحة الأخصائي</button>}
                  {user.role === 'admin' && <button className="button button--outline auth-submit" onClick={() => navigateTo('/admin')}>لوحة تحكم المسؤول</button>}
                  <button className="button button--primary auth-submit" disabled={busy} onClick={signOut}>تسجيل الخروج</button>
                </div>
              )}

              {view !== 'account' && (
                <form className="auth-form" onSubmit={submit}>
                  {renderForm()}
                </form>
              )}
            </section>
          </div>,
          document.body
        )
      )}
    </>
  );
}
