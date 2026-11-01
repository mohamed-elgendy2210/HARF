import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiRequest, setCsrfToken } from '../lib/api.js';
import BrandLogo from './BrandLogo.jsx';

const ParentDashboard = lazy(() => import('./ParentDashboard.jsx'));
const AdminDashboard = lazy(() => import('./AdminDashboard.jsx'));
const SpecialistDashboard = lazy(() => import('./SpecialistDashboard.jsx'));

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
  const queryProcessed = useRef(false);

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

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
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

  const handleSession = (result) => {
    if (result.user !== undefined) setUser(result.user);
    if (result.csrfToken) {
      setCsrfToken(result.csrfToken);
    }
  };

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

  const renderForm = () => {
    if (view === 'register') {
      return (
        <>
          <label>الاسم
            <input name="displayName" required minLength="2" maxLength="100" autoComplete="name" />
          </label>
          <label>نوع الحساب
            <select name="role" value={registerRole} onChange={(event) => setRegisterRole(event.target.value)}>
              <option value="parent">ولي أمر</option>
              <option value="specialist">أخصائي تخاطب</option>
            </select>
          </label>
          <label>البريد الإلكتروني
            <input name="email" type="email" required maxLength="254" autoComplete="email" dir="ltr" />
          </label>
          <label>كلمة المرور
            <input name="password" type="password" required minLength="12" maxLength="128" autoComplete="new-password" dir="ltr" />
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
        </>
      );
    }

    if (view === 'login') {
      return (
        <>
          <label>البريد الإلكتروني
            <input name="email" type="email" required maxLength="254" autoComplete="email" dir="ltr" />
          </label>
          <label>كلمة المرور
            <input name="password" type="password" required maxLength="128" autoComplete="current-password" dir="ltr" />
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

  const platformBrand = document.querySelector('#root .platform-brand');
  const platformStyles = platformBrand ? getComputedStyle(platformBrand) : null;
  const modalThemeStyle = platformStyles
    ? Object.fromEntries([
      '--blue',
      '--teal',
      '--purple',
      '--yellow',
      '--coral',
      '--ink',
      '--muted'
    ].map((property) => [property, platformStyles.getPropertyValue(property).trim()]).filter(([, value]) => value))
    : undefined;

  return (
    <>
      <button
        className="button button--small button--outline auth-trigger"
        type="button"
        onClick={() => startView(user ? 'account' : 'login')}
      >
        {user ? roleLabel(user.role) : 'دخول / حساب'}
      </button>
      {open && (
        createPortal(
          <div className="auth-backdrop" style={modalThemeStyle} onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}>
            <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
              <button className="auth-close" type="button" aria-label="إغلاق" onClick={() => setOpen(false)}>×</button>
              <h2 id="auth-title">
                {view === 'register' ? 'إنشاء حساب' : view === 'login' ? 'أهلًا بك في حرف' : view === 'profile' ? 'الملف المهني' : view === 'account' ? 'حسابك في حرف' : view === 'forgot' ? 'استعادة كلمة المرور' : 'كلمة مرور جديدة'}
              </h2>
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
