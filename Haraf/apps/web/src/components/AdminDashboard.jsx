import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { apiRequest, getApiUrl } from '../lib/api.js';
import { displayNameOrFallback } from '../lib/displayName.js';
import AdminReports from './AdminReports.jsx';
import AdminLearningPaths from './AdminLearningPaths.jsx';
import NotificationCenter from './NotificationCenter.jsx';
import AdminTestimonials from './AdminTestimonials.jsx';
import AdminSessions from './AdminSessions.jsx';

const AdminGameLibrary = lazy(() => import('./AdminGameLibrary.jsx'));

const views = [
  { id: 'overview', label: 'نظرة عامة', icon: '⌂' },
  { id: 'accounts', label: 'إدارة الحسابات', icon: '♙' },
  { id: 'administrators', label: 'مديرو المنصة', icon: '♜' },
  { id: 'games', label: 'مكتبة الألعاب', icon: '✦' },
  { id: 'trialGames', label: 'الألعاب التجريبية للزوار', icon: '☆' },
  { id: 'assets', label: 'مكتبة الوسائط', icon: '▧' },
  { id: 'learningPath', label: 'مسار التعلّم', icon: '↗' },
  { id: 'subscriptions', label: 'الاشتراكات والمدفوعات', icon: 'ج.م' },
  { id: 'platform', label: 'هوية المنصة والصفحة الرئيسية', icon: '✧' },
  { id: 'testimonials', label: 'آراء أولياء الأمور', icon: '♡' },
  { id: 'sessions', label: 'إدارة الجلسات والاجتماعات', icon: '▣' },
  { id: 'reports', label: 'التقارير', icon: '▤' },
  { id: 'notifications', label: 'الإشعارات', icon: '♧' }
];

const approvalLabels = {
  pending: 'بانتظار المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض'
};

const statusLabels = {
  active: 'نشط',
  suspended: 'موقوف'
};

const roleLabels = {
  parent: 'ولي أمر',
  specialist: 'أخصائي'
};

const viewTitles = {
  overview: 'لوحة تحكم المسؤول',
  accounts: 'إدارة الحسابات',
  administrators: 'إدارة مديري المنصة',
  games: 'مكتبة الألعاب',
  trialGames: 'الألعاب التجريبية للزوار',
  assets: 'مكتبة الوسائط',
  learningPath: 'إعداد مسار التعلّم',
  subscriptions: 'الاشتراكات والمدفوعات',
  platform: 'هوية المنصة والصفحة الرئيسية',
  testimonials: 'آراء أولياء الأمور',
  sessions: 'إدارة الجلسات والاجتماعات',
  reports: 'تقارير المنصة',
  notifications: 'الإشعارات'
};

function accountDisplayName(account) {
  const name = account.role === 'specialist'
    ? account.professionalProfile?.displayName
    : account.parentProfile?.displayName;
  return name ? displayNameOrFallback(name, '') : '';
}

function priceToMinorUnits(value) {
  let normalized = value
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/٬/g, '')
    .replace(/٫|،/g, '.')
    .trim();
  if (/^\d{1,3}(,\d{3})+(?:\.\d{1,2})?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, '');
  } else if (/^\d+,\d{1,2}$/.test(normalized)) {
    normalized = normalized.replace(',', '.');
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amountMinor) && amountMinor >= 100 && amountMinor <= 100000000
    ? amountMinor
    : null;
}

export default function AdminDashboard({ user, onSignOut, onReauthenticate }) {
  const [accounts, setAccounts] = useState([]);
  const [administrators, setAdministrators] = useState([]);
  const [administratorEmail, setAdministratorEmail] = useState('');
  const [administratorPassword, setAdministratorPassword] = useState('');
  const [view, setView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    return params.get('view') === 'sessions' || hashParams.has('participantToken') ? 'sessions' : 'overview';
  });
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyAccountId, setBusyAccountId] = useState('');
  const [error, setError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [notice, setNotice] = useState('');
  const [billingSettings, setBillingSettings] = useState(null);
  const [monthlyPriceInput, setMonthlyPriceInput] = useState('');
  const [annualPriceInput, setAnnualPriceInput] = useState('');
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [savingBilling, setSavingBilling] = useState(false);
  const [billingReloadKey, setBillingReloadKey] = useState(0);
  const [loadingAdministrators, setLoadingAdministrators] = useState(false);
  const [platformSettings, setPlatformSettings] = useState(null);
  const [platformImages, setPlatformImages] = useState([]);
  const [platformImageCategory, setPlatformImageCategory] = useState('Backgrounds');
  const [loadingPlatform, setLoadingPlatform] = useState(false);
  const [savingPlatform, setSavingPlatform] = useState(false);

  const platformImageCategories = useMemo(
    () => [...new Set(platformImages
      .map((asset) => asset.category?.trim() || 'غير مصنف')
      .filter((category) => category.toLocaleLowerCase() !== 'backgrounds'))].sort(),
    [platformImages]
  );
  const visiblePlatformImages = platformImages.filter((asset) => (
    platformImageCategory === 'all'
    || (asset.category?.trim() || 'غير مصنف').toLocaleLowerCase()
      === platformImageCategory.toLocaleLowerCase()
  ));

  const reportError = (requestError) => {
    setSessionExpired(requestError.status === 401);
    setError(requestError.status === 401
      ? 'انتهت جلسة المسؤول. سجّل الدخول مجددًا للمتابعة.'
      : requestError.message);
  };

  const loadAccounts = async () => {
    setLoading(true);
    setError('');
    setSessionExpired(false);
    try {
      const result = await apiRequest('/api/v1/admin/accounts');
      setAccounts(result.accounts);
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (view !== 'administrators') return undefined;
    let active = true;
    setLoadingAdministrators(true);
    setError('');
    apiRequest('/api/v1/admin/administrators')
      .then(({ administrators: result }) => {
        if (active) setAdministrators(result);
      })
      .catch((requestError) => {
        if (active) reportError(requestError);
      })
      .finally(() => {
        if (active) setLoadingAdministrators(false);
      });
    return () => { active = false; };
  }, [view]);

  useEffect(() => {
    if (view !== 'subscriptions') return;
    let active = true;
    setLoadingBilling(true);
    setError('');
    Promise.all([
      apiRequest('/api/v1/admin/subscription/settings'),
      apiRequest('/api/v1/admin/payments')
    ])
      .then(([{ settings }, { payments }]) => {
        if (!active) return;
        setBillingSettings(settings);
        setMonthlyPriceInput(settings.amountMinor === null ? '' : (settings.amountMinor / 100).toFixed(2));
        setAnnualPriceInput(settings.annualAmountMinor === null ? '' : (settings.annualAmountMinor / 100).toFixed(2));
        setPaymentRequests(payments);
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
  }, [view, billingReloadKey]);

  useEffect(() => {
    if (view !== 'platform') return undefined;
    let active = true;
    setLoadingPlatform(true);
    setError('');
    Promise.all([
      apiRequest('/api/v1/admin/platform-settings'),
      apiRequest('/api/v1/admin/assets')
    ])
      .then(([{ settings }, { assets }]) => {
        if (!active) return;
        setPlatformSettings(settings);
        setPlatformImages(assets.filter((asset) => asset.kind === 'image' && asset.active && asset.available));
      })
      .catch((requestError) => {
        if (active) reportError(requestError);
      })
      .finally(() => {
        if (active) setLoadingPlatform(false);
      });
    return () => { active = false; };
  }, [view]);

  const counts = useMemo(() => ({
    total: accounts.length,
    pending: accounts.filter((account) => account.approvalStatus === 'pending').length,
    parents: accounts.filter((account) => account.role === 'parent').length,
    specialists: accounts.filter((account) => account.role === 'specialist').length,
    suspended: accounts.filter((account) => account.accountStatus === 'suspended').length
  }), [accounts]);

  const visibleAccounts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return accounts.filter((account) => {
      if (filter === 'pending' && account.approvalStatus !== 'pending') return false;
      if (filter === 'parents' && account.role !== 'parent') return false;
      if (filter === 'specialists' && account.role !== 'specialist') return false;
      if (filter === 'suspended' && account.accountStatus !== 'suspended') return false;
      if (!query) return true;
      return [
        account.email,
        accountDisplayName(account),
        roleLabels[account.role]
      ].filter(Boolean).some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [accounts, filter, search]);

  const updateAccount = async (account, action, value) => {
    const actionText = action === 'approval'
      ? value === 'approved' ? 'اعتماد هذا الحساب' : 'رفض هذا الحساب'
      : value === 'suspended' ? 'إيقاف هذا الحساب' : 'إعادة تفعيل هذا الحساب';
    const confirmText = `${actionText}؟`;
    if (!window.confirm(confirmText)) return;

    setBusyAccountId(account.id);
    setError('');
    setNotice('');
    try {
      const route = action === 'approval' ? 'approval' : 'status';
      const field = action === 'approval' ? 'approvalStatus' : 'accountStatus';
      const result = await apiRequest(`/api/v1/admin/accounts/${account.id}/${route}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });
      setAccounts((current) => current.map((item) => item.id === result.user.id ? result.user : item));
      setNotice('تم تحديث حالة الحساب.');
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setBusyAccountId('');
    }
  };

  const removePendingAccount = async (account) => {
    if (!window.confirm(`إزالة طلب تسجيل ${accountDisplayName(account) || account.email} نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.`)) return;

    setBusyAccountId(account.id);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/v1/admin/accounts/${account.id}`, { method: 'DELETE' });
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      setNotice('تمت إزالة طلب التسجيل.');
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setBusyAccountId('');
    }
  };

  const showAccounts = (nextFilter = 'all') => {
    setFilter(nextFilter);
    setView('accounts');
    setNotice('');
  };

  const createAdministrator = async (event) => {
    event.preventDefault();
    setBusyAccountId('new-administrator');
    setError('');
    setNotice('');
    try {
      const { administrator } = await apiRequest('/api/v1/admin/administrators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: administratorEmail, password: administratorPassword })
      });
      setAdministrators((current) => [...current, administrator]);
      setAdministratorEmail('');
      setAdministratorPassword('');
      setNotice('تم إنشاء حساب المسؤول. سلّم بيانات الدخول عبر قناة آمنة، واطلب منه تغيير كلمة المرور بعد الدخول.');
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setBusyAccountId('');
    }
  };

  const deleteAdministrator = async (administrator) => {
    if (!window.confirm(`حذف صلاحيات وحساب المسؤول ${administrator.email}؟ سيتم إنهاء جلساته فورًا.`)) return;
    setBusyAccountId(administrator.id);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/v1/admin/administrators/${administrator.id}`, { method: 'DELETE' });
      setAdministrators((current) => current.filter(({ id }) => id !== administrator.id));
      setNotice('تم حذف حساب المسؤول وإنهاء جلساته.');
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setBusyAccountId('');
    }
  };

  const saveBillingSettings = async (event) => {
    event.preventDefault();
    if (!billingSettings) return;
    const amountMinor = priceToMinorUnits(monthlyPriceInput);
    if (amountMinor === null) {
      setError('أدخل سعرًا صحيحًا بالجنيه المصري، مثل ١٥٠ أو ١٥٠٫٥٠.');
      return;
    }
    const annualAmountMinor = annualPriceInput.trim() ? priceToMinorUnits(annualPriceInput) : null;
    if (annualPriceInput.trim() && annualAmountMinor === null) {
      setError('أدخل سعرًا سنويًا صحيحًا أو اترك الحقل فارغًا لإيقاف الاشتراك السنوي.');
      return;
    }
    setSavingBilling(true);
    setError('');
    setNotice('');
    try {
      const { settings } = await apiRequest('/api/v1/admin/subscription/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountMinor,
          annualAmountMinor,
          currency: billingSettings.currency,
          vodafoneCash: billingSettings.vodafoneCash,
          instaPay: billingSettings.instaPay
        })
      });
      setBillingSettings(settings);
      setMonthlyPriceInput((settings.amountMinor / 100).toFixed(2));
      setAnnualPriceInput(settings.annualAmountMinor === null ? '' : (settings.annualAmountMinor / 100).toFixed(2));
      setNotice('تم حفظ السعر وإعدادات طرق الدفع. الطلبات السابقة تحتفظ بسعرها وتعليماتها وقت الإرسال.');
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setSavingBilling(false);
    }
  };

  const updatePlatformColor = (colorName, value) => {
    setPlatformSettings((current) => ({
      ...current,
      colors: { ...current.colors, [colorName]: value }
    }));
  };

  const updateHomepageText = (field, value) => {
    setPlatformSettings((current) => ({
      ...current,
      homepage: { ...current.homepage, [field]: value }
    }));
  };

  const toggleHeroImage = (assetId) => {
    const selected = platformSettings?.heroImageAssetIds ?? [];
    if (!selected.includes(assetId) && selected.length >= 8) {
      setError('يمكن اختيار ٨ صور كحد أقصى لمعرض الصفحة الرئيسية.');
      return;
    }
    setPlatformSettings((current) => {
      const currentSelection = current.heroImageAssetIds ?? [];
      return {
        ...current,
        heroImageAssetIds: currentSelection.includes(assetId)
          ? currentSelection.filter((id) => id !== assetId)
          : [...currentSelection, assetId]
      };
    });
    setError('');
    setNotice('');
  };

  const savePlatformSettings = async (event) => {
    event.preventDefault();
    if (!platformSettings) return;
    setSavingPlatform(true);
    setError('');
    setNotice('');
    try {
      const { settings } = await apiRequest('/api/v1/admin/platform-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logoAssetId: platformSettings.logoAssetId,
          heroImageAssetIds: platformSettings.heroImageAssetIds ?? [],
          colors: platformSettings.colors,
          homepage: platformSettings.homepage
        })
      });
      setPlatformSettings(settings);
      setNotice('تم حفظ هوية المنصة ومحتوى الصفحة الرئيسية.');
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setSavingPlatform(false);
    }
  };

  const decidePayment = async (payment, decision) => {
    const accepted = decision === 'approved';
    const confirmed = accepted
      ? window.confirm(`تأكيد أنك تحققت يدويًا من التحويل ${payment.transactionReference} والمبلغ ${payment.amountMinor / 100} ${payment.currency}؟ سيبدأ أو يتجدد الاشتراك بعد الموافقة.`)
      : window.confirm(`رفض طلب الدفع ${payment.transactionReference}؟`);
    if (!confirmed) return;
    const decisionNote = accepted
      ? window.prompt('ملاحظة المراجعة (اختياري):', 'تم التحقق يدويًا من التحويل') ?? ''
      : window.prompt('سبب الرفض (اختياري):', '') ?? '';
    setBusyAccountId(payment.id);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/v1/admin/payments/${payment.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, decisionNote })
      });
      setNotice(accepted ? 'تمت الموافقة وتفعيل مدة الاشتراك.' : 'تم رفض طلب الدفع.');
      setBillingReloadKey((key) => key + 1);
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setBusyAccountId('');
    }
  };

  const updatePaymentMethod = (method, property, value) => {
    setBillingSettings((current) => ({
      ...current,
      [method]: { ...current[method], [property]: value }
    }));
  };

  const renderAccountCard = (account) => {
    const accountName = accountDisplayName(account);
    const profile = account.professionalProfile;
    const isBusy = busyAccountId === account.id;
    return (
      <article className="admin-dashboard-account" key={account.id}>
        <div className="admin-dashboard-account__main">
          <span className={`admin-dashboard-account__avatar admin-dashboard-account__avatar--${account.role}`} aria-hidden="true">
            {account.role === 'specialist' ? '✚' : '♙'}
          </span>
          <div className="admin-dashboard-account__identity">
            <h3>{accountName || roleLabels[account.role]}</h3>
            <bdi dir="ltr">{account.email}</bdi>
            <span>{roleLabels[account.role]}</span>
          </div>
          <div className="admin-dashboard-account__states">
            <span className={`admin-status admin-status--${account.approvalStatus}`}>
              {approvalLabels[account.approvalStatus] ?? account.approvalStatus}
            </span>
            <span className={`admin-status admin-status--${account.accountStatus}`}>
              {statusLabels[account.accountStatus] ?? account.accountStatus}
            </span>
            <span className={`admin-status ${account.emailVerified ? 'admin-status--active' : 'admin-status--pending'}`}>
              {account.emailVerified ? 'بريد موثّق' : 'بريد غير موثّق'}
            </span>
          </div>
        </div>

        {account.role === 'specialist' && (
          <div className="admin-dashboard-account__profile">
            <span>الملف المهني: {profile?.complete ? 'مكتمل' : 'غير مكتمل'}</span>
            <span>مستندات التحقق: {profile?.identityDocumentsComplete ? 'مكتملة' : 'غير مكتملة'}</span>
            {profile?.specialty && <span>التخصص: {profile.specialty}</span>}
            {profile?.publicListing && <span>طلب الظهور في الدليل: نعم</span>}
            <span>
              أهلية الدليل: {account.emailVerified
                && account.accountStatus === 'active'
                && account.approvalStatus === 'approved'
                && profile?.complete
                && profile?.identityDocumentsComplete
                && profile?.publicListing
                ? 'مستوفاة'
                : 'غير مستوفاة — راجع البريد والاعتماد والملف والوثائق وخيار النشر'}
            </span>
            {profile?.identityDocumentsComplete && (
              <div className="admin-dashboard-account__documents">
                {['photo', 'front', 'back'].map((documentType) => (
                  <a
                    key={documentType}
                    href={getApiUrl(`/api/v1/admin/accounts/${account.id}/verification/${documentType}`)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {documentType === 'photo' ? 'معاينة الصورة الشخصية' : documentType === 'front' ? 'معاينة وجه الكارنيه الأمامي' : 'معاينة وجه الكارنيه الخلفي'}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="admin-dashboard-account__actions">
          {account.approvalStatus !== 'approved' && (
            <button
              type="button"
              className="button button--small button--primary"
              disabled={Boolean(busyAccountId)}
              onClick={() => updateAccount(account, 'approval', 'approved')}
            >
              اعتماد
            </button>
          )}
          {account.approvalStatus !== 'rejected' && (
            <button
              type="button"
              className="button button--small button--outline"
              disabled={Boolean(busyAccountId)}
              onClick={() => updateAccount(account, 'approval', 'rejected')}
            >
              رفض
            </button>
          )}
          {account.approvalStatus === 'pending' && (
            <button
              type="button"
              className="button button--small button--outline"
              disabled={Boolean(busyAccountId)}
              onClick={() => removePendingAccount(account)}
            >
              إزالة الطلب
            </button>
          )}
          {String(account.id) !== String(user.id) && account.accountStatus !== 'suspended' && (
            <button
              type="button"
              className="button button--small button--outline"
              disabled={Boolean(busyAccountId)}
              onClick={() => updateAccount(account, 'status', 'suspended')}
            >
              إيقاف
            </button>
          )}
          {account.accountStatus === 'suspended' && (
            <button
              type="button"
              className="button button--small button--outline"
              disabled={Boolean(busyAccountId)}
              onClick={() => updateAccount(account, 'status', 'active')}
            >
              إعادة تفعيل
            </button>
          )}
          {isBusy && <span className="admin-dashboard-working" role="status">جارٍ الحفظ…</span>}
        </div>
      </article>
    );
  };

  return (
    <div className="admin-dashboard">
      <aside className="admin-dashboard__sidebar" aria-label="قائمة لوحة الإدارة">
        <span className="admin-dashboard__sidebar-label">الإدارة</span>
        <nav>
          {views.map((item) => (
            <button
              type="button"
              className={view === item.id ? 'admin-dashboard-nav is-active' : 'admin-dashboard-nav'}
              aria-current={view === item.id ? 'page' : undefined}
              key={item.id}
              onClick={() => {
                setView(item.id);
                setNotice('');
              }}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="admin-dashboard__sidebar-note">
          صلاحيات الحسابات تُطبّق على الخادم، ولا يمكن تغييرها من واجهة المستخدم.
        </div>
      </aside>

      <main className="admin-dashboard__main">
        <header className="admin-dashboard__topbar">
          <div>
            <span className="dashboard-eyebrow">حرف · مساحة الإدارة</span>
            <h1>{viewTitles[view]}</h1>
          </div>
          <div className="admin-dashboard__topbar-actions">
            <span className="admin-dashboard__identity">{user.email}</span>
            <a className="button button--small button--outline" href="/">العودة للموقع</a>
            <button type="button" className="button button--small button--primary" onClick={onSignOut}>تسجيل الخروج</button>
          </div>
        </header>

        {notice && <p className="auth-message" role="status">{notice}</p>}
        {error && (
          <div className="auth-error" role="alert">
            <p>{error}</p>
            {sessionExpired
              ? <button type="button" className="auth-text-button" onClick={onReauthenticate}>تسجيل الدخول مجددًا</button>
              : <button type="button" className="auth-text-button" onClick={loadAccounts}>إعادة المحاولة</button>}
          </div>
        )}

        {view === 'games' || view === 'assets' || view === 'trialGames' ? (
          <Suspense fallback={<p className="dashboard-loading" role="status">جارٍ تحميل مكتبة الإدارة…</p>}>
            <AdminGameLibrary
              user={user}
              initialView={view}
              onSignOut={onSignOut}
              onReauthenticate={onReauthenticate}
            />
          </Suspense>
        ) : view === 'sessions' ? (
          <AdminSessions />
        ) : view === 'administrators' ? (
          <section className="admin-dashboard__content admin-dashboard-panel">
            <div className="admin-dashboard-panel__heading">
              <div>
                <h2>مديرو المنصة</h2>
                <p>أضف حساب مسؤول مستقلًا أو أزل حسابًا آخر. لا يمكن حذف حسابك الحالي أو آخر مسؤول.</p>
              </div>
            </div>
            <form className="admin-administrator-form" onSubmit={createAdministrator}>
              <h3>إضافة مسؤول</h3>
              <label>البريد الإلكتروني
                <input type="email" autoComplete="email" required maxLength={254}
                  value={administratorEmail} onChange={(event) => setAdministratorEmail(event.target.value)} />
              </label>
              <label>كلمة مرور مؤقتة (١٢ حرفًا على الأقل)
                <input type="password" autoComplete="new-password" required minLength={12} maxLength={128}
                  value={administratorPassword} onChange={(event) => setAdministratorPassword(event.target.value)} />
              </label>
              <button type="submit" className="button button--primary" disabled={Boolean(busyAccountId)}>
                {busyAccountId === 'new-administrator' ? 'جارٍ الإنشاء…' : 'إنشاء حساب مسؤول'}
              </button>
              <small>سيكون الحساب نشطًا ومفعّلًا فورًا. استخدم كلمة مرور مؤقتة فريدة وشاركها عبر قناة آمنة فقط.</small>
            </form>
            <div className="admin-administrator-list-heading">
              <h3>الحسابات الإدارية</h3>
              <span>{administrators.length} مسؤولين</span>
            </div>
            {loadingAdministrators ? <p className="dashboard-loading" role="status">جارٍ تحميل المسؤولين…</p>
              : administrators.length === 0 ? <p className="dashboard-empty-state">لم يتم تحميل قائمة المسؤولين.</p>
                : <div className="admin-administrator-list">
                  {administrators.map((administrator) => (
                    <article className="admin-administrator-card" key={administrator.id}>
                      <span className="admin-administrator-card__icon" aria-hidden="true">♜</span>
                      <div>
                        <strong><bdi dir="ltr">{administrator.email}</bdi></strong>
                        <small>{String(administrator.id) === String(user.id) ? 'حسابك الحالي' : 'مسؤول'}
                          {administrator.emailVerified ? ' · البريد مفعّل' : ' · البريد غير مفعّل'}</small>
                      </div>
                      {String(administrator.id) === String(user.id) ? <span className="admin-path-status admin-path-status--published">أنت</span>
                        : <button type="button" className="button button--small button--outline"
                          disabled={Boolean(busyAccountId) || administrators.length <= 1}
                          onClick={() => void deleteAdministrator(administrator)}>حذف المسؤول</button>}
                    </article>
                  ))}
                </div>}
          </section>
        ) : view === 'subscriptions' ? (
          <section className="admin-dashboard__content admin-dashboard-panel">
            <div className="admin-dashboard-panel__heading">
              <div>
                <h2>سعر الاشتراك وطلبات الدفع</h2>
                <p>لا يوجد تحقق آلي للتحويلات. افحص المرجع والإيصال يدويًا قبل الموافقة.</p>
              </div>
              <button type="button" className="button button--small button--outline" disabled={loadingBilling}
                onClick={() => setBillingReloadKey((key) => key + 1)}>تحديث</button>
            </div>
            {loadingBilling ? <p className="dashboard-loading" role="status">جارٍ تحميل إعدادات الاشتراك والطلبات…</p>
              : billingSettings && (
                <>
                  <form className="admin-learning-path" onSubmit={saveBillingSettings}>
                    <label>السعر الشهري بالجنيه المصري
                      <input
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        placeholder="مثال: ١٥٠ أو ١٥٠٫٥٠"
                        aria-describedby="monthly-price-help"
                        required
                        value={monthlyPriceInput}
                        onChange={(event) => setMonthlyPriceInput(event.target.value)}
                      />
                    </label>
                    <p id="monthly-price-help" className="dashboard-privacy-note">
                      اكتب المبلغ بالأرقام العربية أو الإنجليزية، ويمكن إدخال قرشين كحد أقصى بعد الفاصلة. الحد من ١ إلى ١٬٠٠٠٬٠٠٠ جنيه.
                      {priceToMinorUnits(monthlyPriceInput) !== null && (
                        <> السعر الحالي: {new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(priceToMinorUnits(monthlyPriceInput) / 100)}</>
                      )}
                    </p>
                    <label>السعر السنوي بالجنيه المصري (اختياري)
                      <input
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        placeholder="اتركه فارغًا لإيقاف الاشتراك السنوي"
                        aria-describedby="annual-price-help"
                        value={annualPriceInput}
                        onChange={(event) => setAnnualPriceInput(event.target.value)}
                      />
                    </label>
                    <p id="annual-price-help" className="dashboard-privacy-note">
                      الاشتراك السنوي يمنح ١٢ شهرًا كاملة، والسعر تحدده الإدارة. لا يتغير سعر أي طلب دفع أُرسل سابقًا.
                    </p>
                    {[
                      ['vodafoneCash', 'Vodafone Cash'],
                      ['instaPay', 'InstaPay']
                    ].map(([method, label]) => (
                      <fieldset className="admin-payment-method" key={method}>
                        <legend>{label}</legend>
                        <label className="admin-payment-method__toggle">
                          <input type="checkbox" checked={billingSettings[method].enabled}
                            onChange={(event) => updatePaymentMethod(method, 'enabled', event.target.checked)} />
                          تفعيل طريقة الدفع
                        </label>
                        <label>رقم المحفظة أو حساب الاستلام
                          <input maxLength="120" value={billingSettings[method].recipient}
                            onChange={(event) => updatePaymentMethod(method, 'recipient', event.target.value)} />
                        </label>
                        <label>تعليمات التحويل
                          <textarea rows={3} maxLength="500" value={billingSettings[method].instructions}
                            onChange={(event) => updatePaymentMethod(method, 'instructions', event.target.value)} />
                        </label>
                      </fieldset>
                    ))}
                    <p className="dashboard-privacy-note">تغيير السعر لا يغيّر أي طلب أو اشتراك محفوظ سابقًا.</p>
                    <button className="button button--primary" disabled={savingBilling}>
                      {savingBilling ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}
                    </button>
                  </form>
                  <section className="admin-learning-path__activities">
                    <h3>سجل طلبات الدفع</h3>
                    {paymentRequests.length === 0 ? <p className="dashboard-empty-state">لا توجد طلبات دفع.</p>
                      : paymentRequests.map((payment) => (
                        <article className="admin-dashboard-panel" key={payment.id}>
                          <div>
                            <strong>{payment.methodLabel} · {payment.period === 'annual' ? 'اشتراك سنوي' : 'اشتراك شهري'} · {payment.transactionReference}</strong>
                            <p>{payment.parentDisplayName || 'ولي أمر'} · <bdi dir="ltr">{payment.parentEmail || payment.parentUserId}</bdi></p>
                            <p>{new Intl.NumberFormat('ar-EG', {
                              style: 'currency', currency: payment.currency
                            }).format(payment.amountMinor / 100)} · {
                              payment.status === 'approved' ? 'مقبول'
                                : payment.status === 'rejected' ? 'مرفوض'
                                  : payment.status === 'reviewing' ? 'قيد المراجعة' : 'بانتظار المراجعة'
                            }</p>
                            <time dateTime={payment.createdAt}>{new Intl.DateTimeFormat('ar-EG', {
                              dateStyle: 'medium', timeStyle: 'short'
                            }).format(new Date(payment.createdAt))}</time>
                          </div>
                          {payment.receiptUrl && (
                            <a className="button button--small button--outline"
                              href={`/api/v1/admin/payments/${payment.id}/receipt`} target="_blank" rel="noreferrer">
                              عرض الإيصال الآمن
                            </a>
                          )}
                          {payment.status === 'pending' || payment.status === 'reviewing' ? (
                            <div className="admin-dashboard-account__actions">
                              <button type="button" className="button button--small button--primary"
                                disabled={Boolean(busyAccountId)}
                                onClick={() => decidePayment(payment, 'approved')}>
                                موافقة وتفعيل {payment.period === 'annual' ? 'سنة' : 'شهر'}
                              </button>
                              <button type="button" className="button button--small button--outline"
                                disabled={Boolean(busyAccountId)}
                                onClick={() => decidePayment(payment, 'rejected')}>رفض</button>
                            </div>
                          ) : (
                            <p>{payment.review?.decisionNote || 'تمت مراجعة الطلب.'}</p>
                          )}
                          {busyAccountId === payment.id && <span className="admin-dashboard-working" role="status">جارٍ حفظ المراجعة…</span>}
                        </article>
                      ))}
                  </section>
                </>
              )}
          </section>
        ) : view === 'platform' ? (
          <section className="admin-dashboard__content admin-dashboard-panel">
            <div className="admin-dashboard-panel__heading">
              <div>
                <h2>هوية المنصة والصفحة الرئيسية</h2>
                <p>خصّص ألوان هوية المنصة، وتُستخدم هذه الألوان للنصوص والعناصر المرئية مع الحفاظ على ألوان رسومات وشخصيات الأطفال.</p>
              </div>
            </div>
            {loadingPlatform ? <p className="dashboard-loading" role="status">جارٍ تحميل إعدادات المنصة…</p>
              : platformSettings && (
                <form className="admin-platform-settings" onSubmit={savePlatformSettings}>
                  <section className="admin-platform-settings__section">
                    <h3>شعار المنصة</h3>
                    <p>ارفع الشعار أولًا من مكتبة الوسائط، ثم اختره هنا. الصور المدعومة تظهر من الأصول النشطة فقط.</p>
                    <label>اختيار الشعار
                      <select value={platformSettings.logoAssetId ?? ''}
                        onChange={(event) => setPlatformSettings((current) => ({
                          ...current,
                          logoAssetId: event.target.value || null
                        }))}>
                        <option value="">استخدام الشعار الافتراضي</option>
                        {platformImages.map((asset) => (
                          <option key={asset.id} value={asset.id}>{asset.displayName}</option>
                        ))}
                      </select>
                    </label>
                    {platformSettings.logoAssetId && !platformImages.some((asset) => asset.id === platformSettings.logoAssetId) && (
                      <p className="admin-platform-settings__warning" role="alert">
                        الشعار المختار لم يعد متاحًا أو تم إيقافه. اختر صورة نشطة أخرى أو استخدم الشعار الافتراضي.
                      </p>
                    )}
                    {platformSettings.logoAssetId && (
                      <div className="admin-platform-settings__logo-preview">
                        <img
                          src={getApiUrl(`/api/v1/admin/assets/${platformSettings.logoAssetId}/preview`)}
                          alt="معاينة شعار المنصة المختار"
                          crossOrigin="use-credentials"
                        />
                        <span>معاينة الشعار</span>
                      </div>
                    )}
                  </section>

                  <section className="admin-platform-settings__section">
                    <h3>صور مقدمة الصفحة الرئيسية</h3>
                    <p>اختر حتى ٨ صور نشطة من مكتبة الوسائط. استخدم التصنيف لتصفية الصور؛ الصور المختارة تظهر بالتتابع بجانب العنوان.</p>
                    <label>تصفية الصور حسب التصنيف
                      <select value={platformImageCategory}
                        onChange={(event) => setPlatformImageCategory(event.target.value)}>
                        <option value="all">كل التصنيفات</option>
                        <option value="Backgrounds">Backgrounds</option>
                        {platformImageCategories.map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>
                    </label>
                    <div className="admin-platform-settings__hero-images">
                      {visiblePlatformImages.map((asset) => {
                        const selected = (platformSettings.heroImageAssetIds ?? []).includes(asset.id);
                        return (
                          <label className={`admin-platform-settings__hero-image${selected ? ' is-selected' : ''}`}
                            key={asset.id}>
                            <input type="checkbox" checked={selected} onChange={() => toggleHeroImage(asset.id)} />
                            <img src={getApiUrl(`/api/v1/admin/assets/${asset.id}/preview`)}
                              alt={asset.altText || asset.displayName} crossOrigin="use-credentials" />
                            <span>{asset.displayName}</span>
                            <small>{asset.category?.trim() || 'غير مصنف'}</small>
                            {selected && <small>ضمن المعرض</small>}
                          </label>
                        );
                      })}
                      {!visiblePlatformImages.length && (
                        <p className="admin-platform-settings__warning">
                          لا توجد صور نشطة متاحة ضمن هذا التصنيف. ارفع الصور وأضف تصنيفًا وفعّلها من مكتبة الوسائط.
                        </p>
                      )}
                    </div>
                    {(platformSettings.heroImageAssetIds ?? []).some((id) => !platformImages.some((asset) => asset.id === id)) && (
                      <p className="admin-platform-settings__warning" role="alert">
                        بعض الصور المختارة لم تعد متاحة؛ أزلها من الاختيار أو أعد تفعيلها من مكتبة الوسائط.
                      </p>
                    )}
                    <p className="admin-platform-settings__image-count">
                      {(platformSettings.heroImageAssetIds ?? []).length} من ٨ صور مختارة
                    </p>
                  </section>

                  <section className="admin-platform-settings__section">
                    <h3>ألوان هوية المنصة</h3>
                    <p>تُستخدم لوحة الألوان نفسها في نصوص الموقع وعناصره. ألوان رسومات الألعاب وشخصيات الأطفال تبقى مستقلة.</p>
                    <div className="admin-platform-settings__colors">
                      {[
                        ['primary', 'اللون الأساسي'],
                        ['teal', 'اللون الثانوي'],
                        ['purple', 'اللون المميز'],
                        ['yellow', 'لون الإبراز'],
                        ['coral', 'لون مساعد'],
                        ['ink', 'لون الهوية الداكن'],
                        ['muted', 'لون الهوية الهادئ']
                      ].map(([colorId, label]) => (
                        <label key={colorId}>
                          <span>{label}</span>
                          <input type="color" value={platformSettings.colors[colorId]}
                            onChange={(event) => updatePlatformColor(colorId, event.target.value)} />
                          <code dir="ltr">{platformSettings.colors[colorId]}</code>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="admin-platform-settings__section">
                    <h3>النص الرئيسي للصفحة الرئيسية</h3>
                    <p>عدّل العنوان والوصف والعبارات التي تظهر في مقدمة الصفحة العامة.</p>
                    <label>العبارة التعريفية
                      <input maxLength="120" value={platformSettings.homepage.eyebrow}
                        onChange={(event) => updateHomepageText('eyebrow', event.target.value)} required />
                    </label>
                    <label>العنوان الرئيسي
                      <textarea rows={2} maxLength="100" value={platformSettings.homepage.title}
                        onChange={(event) => updateHomepageText('title', event.target.value)} required />
                    </label>
                    <label>الوصف
                      <textarea rows={3} maxLength="300" value={platformSettings.homepage.description}
                        onChange={(event) => updateHomepageText('description', event.target.value)} required />
                    </label>
                    <div className="admin-platform-settings__actions">
                      <label>نص الزر الرئيسي
                        <input maxLength="50" value={platformSettings.homepage.primaryAction}
                          onChange={(event) => updateHomepageText('primaryAction', event.target.value)} required />
                      </label>
                      <label>نص الزر الثانوي
                        <input maxLength="50" value={platformSettings.homepage.secondaryAction}
                          onChange={(event) => updateHomepageText('secondaryAction', event.target.value)} required />
                      </label>
                    </div>
                  </section>
                  <button className="button button--primary" disabled={savingPlatform}>
                    {savingPlatform ? 'جارٍ الحفظ…' : 'حفظ هوية المنصة'}
                  </button>
                </form>
              )}
          </section>
        ) : view === 'reports' ? (
          <AdminReports />
        ) : view === 'testimonials' ? (
          <AdminTestimonials />
        ) : view === 'notifications' ? (
          <NotificationCenter />
        ) : view === 'learningPath' ? (
          <AdminLearningPaths />
        ) : view === 'overview' ? (
          <div className="admin-dashboard__content">
            <section className="admin-dashboard-welcome">
              <div>
                <span>أهلًا بك، مسؤول حرف</span>
                <h2>إدارة الحسابات ومراجعة طلبات الانضمام</h2>
                <p>الأرقام هنا محسوبة من الحسابات المحمّلة حاليًا من النظام.</p>
              </div>
              <span className="admin-dashboard-welcome__icon" aria-hidden="true">✦</span>
            </section>

            {loading ? (
              <p className="dashboard-loading" role="status">جارٍ تحميل بيانات الإدارة…</p>
            ) : (
              <>
                <section className="admin-dashboard-stats" aria-label="ملخص الحسابات">
                  <button type="button" onClick={() => showAccounts('all')}>
                    <span>الحسابات المعروضة</span><strong>{counts.total}</strong>
                  </button>
                  <button type="button" onClick={() => showAccounts('pending')}>
                    <span>بانتظار المراجعة</span><strong>{counts.pending}</strong>
                  </button>
                  <button type="button" onClick={() => showAccounts('parents')}>
                    <span>أولياء الأمور</span><strong>{counts.parents}</strong>
                  </button>
                  <button type="button" onClick={() => showAccounts('specialists')}>
                    <span>الأخصائيون</span><strong>{counts.specialists}</strong>
                  </button>
                  <button type="button" onClick={() => showAccounts('suspended')}>
                    <span>حسابات موقوفة</span><strong>{counts.suspended}</strong>
                  </button>
                </section>
                <section className="admin-dashboard-panel">
                  <div className="admin-dashboard-panel__heading">
                    <div>
                      <h2>طلبات تحتاج مراجعة</h2>
                      <p>الحسابات الأحدث التي لم يُحسم اعتمادها بعد.</p>
                    </div>
                    <button type="button" className="button button--small button--outline" onClick={() => showAccounts('pending')}>
                      عرض كل الطلبات
                    </button>
                  </div>
                  {accounts.filter((account) => account.approvalStatus === 'pending').length === 0
                    ? <p className="dashboard-empty-state">لا توجد طلبات اعتماد معلّقة ضمن الحسابات المعروضة.</p>
                    : <div className="admin-dashboard-account-list">
                      {accounts.filter((account) => account.approvalStatus === 'pending').slice(0, 4).map(renderAccountCard)}
                    </div>}
                </section>
              </>
            )}
          </div>
        ) : (
          <section className="admin-dashboard__content admin-dashboard-panel">
            <div className="admin-dashboard-panel__heading">
              <div>
                <h2>مراجعة حسابات أولياء الأمور والأخصائيين</h2>
                <p>اعتماد الحسابات وإيقافها أو إعادة تفعيلها. ملف الأخصائي العام يعرض حالة الاكتمال فقط.</p>
              </div>
              <button type="button" className="button button--small button--outline" disabled={loading} onClick={loadAccounts}>
                تحديث القائمة
              </button>
            </div>
            <div className="admin-dashboard-filters">
              <label>
                <span>تصفية</span>
                <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="all">كل الحسابات</option>
                  <option value="pending">بانتظار المراجعة</option>
                  <option value="parents">أولياء الأمور</option>
                  <option value="specialists">الأخصائيون</option>
                  <option value="suspended">الحسابات الموقوفة</option>
                </select>
              </label>
              <label className="admin-dashboard-search">
                <span>بحث</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="البريد أو الاسم"
                />
              </label>
              <span className="admin-dashboard-result-count">النتائج: {visibleAccounts.length}</span>
            </div>
            {loading
              ? <p className="dashboard-loading" role="status">جارٍ تحميل الحسابات…</p>
              : visibleAccounts.length === 0
                ? <p className="dashboard-empty-state">لا توجد حسابات تطابق البحث أو التصفية.</p>
                : <div className="admin-dashboard-account-list">{visibleAccounts.map(renderAccountCard)}</div>}
            {accounts.length >= 100 && (
              <p className="admin-dashboard-limit-note">
                يعرض النظام حتى ١٠٠ حساب في القائمة الحالية. يلزم تطوير ترقيم الصفحات في واجهة الإدارة لعرض أعداد أكبر.
              </p>
            )}
          </section>
        )}

        <footer className="admin-dashboard__footer">
          <span>مسجل الدخول بصفتك مسؤول</span>
          <span>كل تغييرات الاعتماد والحالة تخضع لصلاحيات الخادم وتُسجل في سجل التدقيق.</span>
        </footer>
      </main>
    </div>
  );
}
