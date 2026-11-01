import { useCallback, useEffect, useState } from 'react';
import { apiRequest, getApiUrl } from '../lib/api.js';

const statusLabels = {
  awaiting_payment: 'في انتظار الدفع',
  pending_verification: 'قيد المراجعة',
  approved: 'تم اعتماد الدفع',
  rejected: 'مرفوض',
  expired: 'انتهت المهلة'
};

const methodLabels = {
  vodafone_cash: 'Vodafone Cash',
  instapay: 'InstaPay'
};

function formatDate(value, timeZone) {
  if (!value) return 'غير متاح';
  const options = { dateStyle: 'medium', timeStyle: 'short' };
  if (timeZone) options.timeZone = timeZone;
  return new Intl.DateTimeFormat('ar-EG', options).format(new Date(value));
}

function formatAmount(amountMinor, currency) {
  return new Intl.NumberFormat('ar-EG', { style: 'currency', currency })
    .format(amountMinor / 100);
}

export default function AdminSessionPayments({ onOpenNotifications }) {
  const [settings, setSettings] = useState(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({});
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyPaymentId, setBusyPaymentId] = useState('');
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), limit: '20', status, method, search });
      if (from) query.set('from', new Date(`${from}T00:00:00`).toISOString());
      if (to) query.set('to', new Date(`${to}T23:59:59.999`).toISOString());
      const [settingsResult, paymentResult] = await Promise.all([
        apiRequest('/api/v1/admin/session-payment-settings'),
        apiRequest(`/api/v1/admin/session-payments?${query}`)
      ]);
      setSettings(settingsResult.settings);
      setPayments(paymentResult.payments);
      setStats(paymentResult.stats);
      setTotal(paymentResult.total);
      setPages(Math.max(1, paymentResult.pages));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [from, method, page, search, status, to]);

  useEffect(() => { void loadData(); }, [loadData]);

  const saveSettings = async (event) => {
    event.preventDefault();
    setSettingsBusy(true);
    setError('');
    setNotice('');
    try {
      const { settings: updated } = await apiRequest('/api/v1/admin/session-payment-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: settings.enabled,
          paymentDeadlineHours: settings.paymentDeadlineHours
        })
      });
      setSettings(updated);
      setNotice('تم حفظ إعدادات مدفوعات الجلسات.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSettingsBusy(false);
    }
  };

  const reviewPayment = async (payment, decision) => {
    if (decision === 'approved' && !window.confirm('هل تحققت من الإيصال وقيمة التحويل؟')) return;
    const decisionNote = rejectionReasons[payment.id]?.trim() ?? '';
    if (decision === 'rejected' && decisionNote.length < 3) {
      setError('اكتب سببًا واضحًا لرفض الإيصال قبل المتابعة.');
      return;
    }
    setBusyPaymentId(payment.id);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/v1/admin/session-payments/${payment.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, decisionNote })
      });
      setNotice(decision === 'approved' ? 'تم اعتماد الدفع وتأكيد الجلسة.' : 'تم رفض الإيصال وإتاحة إعادة إرساله لولي الأمر.');
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyPaymentId('');
    }
  };

  const allPaymentsCount = Object.values(stats).reduce((sum, count) => sum + count, 0);
  const activeFilters = [
    ...(search ? [{ key: 'search', label: `بحث: ${search}` }] : []),
    ...(status !== 'all' ? [{ key: 'status', label: `الحالة: ${statusLabels[status]}` }] : []),
    ...(method !== 'all' ? [{ key: 'method', label: `الطريقة: ${methodLabels[method]}` }] : []),
    ...(from ? [{ key: 'from', label: `من: ${from}` }] : []),
    ...(to ? [{ key: 'to', label: `إلى: ${to}` }] : [])
  ];

  const clearFilters = () => {
    setSearch('');
    setStatus('all');
    setMethod('all');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const removeFilter = (key) => {
    if (key === 'search') setSearch('');
    if (key === 'status') setStatus('all');
    if (key === 'method') setMethod('all');
    if (key === 'from') setFrom('');
    if (key === 'to') setTo('');
    setPage(1);
  };

  return (
    <section className="admin-dashboard__content admin-dashboard-panel admin-session-payments">
      <div className="admin-dashboard-panel__heading">
        <div>
          <h2>مدفوعات الجلسات</h2>
          <p>راجع صورة الإيصال يدويًا قبل اعتماد الدفع. إرسال الإيصال وحده لا يثبت استلام التحويل.</p>
        </div>
        <div className="admin-session-payments__heading-actions">
          {onOpenNotifications && (
            <button type="button" className="button button--small button--outline" onClick={onOpenNotifications}>
              الإشعارات
            </button>
          )}
          <button type="button" className="button button--small button--outline" disabled={loading} onClick={() => void loadData()}>
            تحديث القائمة
          </button>
        </div>
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && (
        <div className="admin-session-payments__feedback" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span>
          <p>{notice}</p>
        </div>
      )}

      {settings && (
        <details className="admin-session-payments__settings">
          <summary>إعدادات دفع الجلسات</summary>
          <form onSubmit={saveSettings}>
            <p className="dashboard-privacy-note">
              بيانات الاستلام والتعليمات تُشارك مع إعدادات Vodafone Cash وInstaPay الموجودة في قسم الاشتراكات والمدفوعات.
            </p>
            <label className="admin-payment-method__toggle">
              <input type="checkbox" checked={settings.enabled}
                onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} />
              تفعيل الدفع اليدوي للجلسات الجديدة
            </label>
            <label>مهلة الدفع بالساعات (من ١ إلى ١٦٨)
              <input type="number" min="1" max="168" step="1" required
                value={settings.paymentDeadlineHours}
                onChange={(event) => setSettings((current) => ({
                  ...current,
                  paymentDeadlineHours: Number(event.target.value)
                }))} />
            </label>
            <button className="button button--primary" disabled={settingsBusy}>
              {settingsBusy ? 'جارٍ الحفظ…' : 'حفظ إعدادات الجلسات'}
            </button>
          </form>
        </details>
      )}

      <div className="admin-session-payments__stats" aria-label="ملخص مدفوعات الجلسات">
        {[
          ['all', 'كل المدفوعات', allPaymentsCount],
          ['awaiting_payment', 'في انتظار الدفع', stats.awaiting_payment ?? 0],
          ['pending_verification', 'بانتظار المراجعة', stats.pending_verification ?? 0],
          ['approved', 'معتمدة', stats.approved ?? 0],
          ['rejected', 'مرفوضة', stats.rejected ?? 0],
          ['expired', 'انتهت مهلتها', stats.expired ?? 0]
        ].map(([key, label]) => (
          <button
            type="button"
            className={`admin-session-payments__stat${status === key ? ' is-active' : ''}`}
            aria-pressed={status === key}
            key={key}
            onClick={() => { setStatus(key); setPage(1); }}
          >
            <span>{label}</span><strong>{key === 'all' ? allPaymentsCount : stats[key]}</strong>
          </button>
        ))}
      </div>

      <div className="admin-session-payments__filters">
        <div className="admin-session-payments__filters-heading">
          <div>
            <h3>تصفية المدفوعات</h3>
            <p>ابحث بالاسم أو مرجع الحجز، أو حدّد طريقة الدفع والفترة.</p>
          </div>
          <button type="button" className="button button--small button--outline"
            disabled={activeFilters.length === 0}
            onClick={clearFilters}>
            مسح التصفية
          </button>
        </div>
        <label className="admin-session-payments__search">
          <span>بحث</span>
          <input type="search" value={search} maxLength="80"
            placeholder="الاسم أو البريد أو مرجع الحجز"
            onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        </label>
        <label>
          <span>حالة الدفع</span>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="all">كل الحالات</option>
            {Object.entries(statusLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>طريقة الدفع</span>
          <select value={method} onChange={(event) => { setMethod(event.target.value); setPage(1); }}>
            <option value="all">كل الطرق</option>
            {Object.entries(methodLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>من تاريخ</span>
          <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
        </label>
        <label>
          <span>إلى تاريخ</span>
          <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
        </label>
        {activeFilters.length > 0 && (
          <div className="admin-session-payments__active-filters" aria-label="عوامل التصفية المطبقة">
            <strong>التصفية الحالية</strong>
            {activeFilters.map(({ key, label }) => (
              <button type="button" key={key} onClick={() => removeFilter(key)} aria-label={`إزالة ${label}`}>
                {label}<span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? <p className="dashboard-loading" role="status">جارٍ تحميل مدفوعات الجلسات…</p>
        : payments.length === 0 ? <p className="dashboard-empty-state">لا توجد مدفوعات مطابقة للتصفية.</p>
          : <>
            <p className="admin-session-payments__results" aria-live="polite">
              عرض {payments.length} من أصل {total} سجلًا · الأحدث أولًا
            </p>
            <div className="admin-session-payments__list">
            {payments.map((payment) => (
              <article className="admin-session-payment-card" key={payment.id}>
                <header>
                  <div>
                    <strong>مرجع الجلسة</strong>
                    <bdi dir="ltr">{payment.paymentReference}</bdi>
                    <span className={`appointment-status appointment-status--${payment.status}`}>{statusLabels[payment.status]}</span>
                  </div>
                  <strong className="admin-session-payment-card__amount">{formatAmount(payment.amountMinor, payment.currency)}</strong>
                </header>
                <dl>
                  <div><dt>ولي الأمر</dt><dd>{payment.parentName || payment.parentEmail || 'غير متاح'}</dd></div>
                  <div><dt>الطفل</dt><dd>{payment.childName || 'غير متاح'}</dd></div>
                  <div><dt>الأخصائي</dt><dd>{payment.specialistName || 'غير متاح'}</dd></div>
                  <div><dt>الجلسة</dt><dd>{formatDate(payment.startsAt, payment.timeZone)} - {formatDate(payment.endsAt, payment.timeZone)}</dd></div>
                  <div><dt>طريقة الدفع</dt><dd>{methodLabels[payment.method] || 'لم تُرسل بعد'}</dd></div>
                  <div><dt>تاريخ إرسال الإيصال</dt><dd>{formatDate(payment.submittedAt)}</dd></div>
                  <div><dt>مهلة الدفع</dt><dd>{formatDate(payment.deadline, payment.timeZone)}</dd></div>
                </dl>
                {payment.receiptAvailable && (
                  <a className="admin-session-payment-card__receipt" href={getApiUrl(payment.receiptUrl)} target="_blank" rel="noreferrer">
                    <img src={getApiUrl(payment.receiptUrl)} alt={`إيصال الدفع للجلسة ${payment.paymentReference}`} loading="lazy" />
                    عرض صورة إيصال الدفع
                  </a>
                )}
                {payment.history?.map((decision, index) => (
                  <p className="dashboard-privacy-note" key={`${decision.reviewedAt}-${index}`}>
                    مراجعة سابقة: {statusLabels[decision.status]} · {formatDate(decision.reviewedAt)}
                    {decision.decisionNote ? ` · ${decision.decisionNote}` : ''}
                  </p>
                ))}
                {payment.status === 'pending_verification' && (
                  <>
                    <p className="admin-session-payment-card__review-hint">تحقق من الإيصال ومطابقة المبلغ قبل اعتماد الدفع.</p>
                  <div className="admin-session-payment-card__actions">
                    <label>سبب الرفض (مطلوب عند الرفض)
                      <input maxLength="300" value={rejectionReasons[payment.id] ?? ''}
                        onChange={(event) => setRejectionReasons((current) => ({
                          ...current,
                          [payment.id]: event.target.value
                        }))} />
                    </label>
                    <button type="button" className="button button--primary" disabled={Boolean(busyPaymentId)}
                      onClick={() => void reviewPayment(payment, 'approved')}>
                      {busyPaymentId === payment.id ? 'جارٍ الحفظ…' : 'اعتماد الدفع'}
                    </button>
                    <button type="button" className="button button--outline" disabled={Boolean(busyPaymentId)}
                      onClick={() => void reviewPayment(payment, 'rejected')}>
                      رفض الإيصال
                    </button>
                  </div>
                  </>
                )}
              </article>
            ))}
            </div>
          </>}

      {!loading && total > 0 && (
        <div className="dashboard-pagination">
          <span>إجمالي السجلات: {total} · صفحة {page} من {pages}</span>
          <div>
            <button type="button" className="button button--small button--outline" disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}>السابق</button>
            <button type="button" className="button button--small button--outline" disabled={page >= pages}
              onClick={() => setPage((current) => current + 1)}>التالي</button>
          </div>
        </div>
      )}
    </section>
  );
}
