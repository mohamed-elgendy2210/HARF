import { useState } from 'react';
import { apiRequest, getApiUrl } from '../lib/api.js';

const numberFormat = new Intl.NumberFormat('ar-EG');
const currencyFormat = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' });
const roleLabels = { parent: 'ولي أمر', specialist: 'أخصائي' };
const approvalLabels = { approved: 'معتمد', pending: 'بانتظار المراجعة', rejected: 'مرفوض' };
const appointmentLabels = {
  pending: 'بانتظار القرار',
  awaiting_payment: 'بانتظار الدفع',
  payment_under_review: 'الدفع قيد المراجعة',
  accepted: 'مؤكد',
  rejected: 'مرفوض',
  expired: 'منتهي'
};
const sessionLabels = {
  not_started: 'لم تبدأ',
  in_progress: 'جارية',
  completed: 'مكتملة',
  no_show: 'لم يحضر الطفل',
  specialist_no_show: 'أبلغ ولي الأمر عن عدم حضور الأخصائي'
};

function registrationLabel(key) {
  const [role, approval] = key.split(':');
  return `${roleLabels[role] ?? role} · ${approvalLabels[approval] ?? approval}`;
}

function localDateBoundary(value, endOfDay = false) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  ).toISOString();
}

function queryForRange(from, to) {
  const query = new URLSearchParams();
  const start = localDateBoundary(from);
  const end = localDateBoundary(to, true);
  if (start) query.set('from', start);
  if (end) query.set('to', end);
  return query.toString();
}

function queryForReportFilters(filters) {
  const query = new URLSearchParams();
  if (filters?.from) query.set('from', filters.from);
  if (filters?.to) query.set('to', filters.to);
  return query.toString();
}

function Metric({ label, value }) {
  return <article className="admin-report-metric"><span>{label}</span><strong>{numberFormat.format(value ?? 0)}</strong></article>;
}

function ReportBarChart({ title, data, formatValue = (value) => numberFormat.format(value), emptyText = 'لا توجد بيانات لعرضها.' }) {
  const values = data.map((item) => Math.max(0, Number(item.value) || 0));
  const maximum = Math.max(...values, 0);

  return (
    <section className="admin-report-chart" aria-label={title}>
      <h3>{title}</h3>
      {data.length ? (
        <ul className="admin-report-chart__list">
          {data.map((item, index) => {
            const value = values[index];
            const width = maximum ? (value / maximum) * 100 : 0;
            return (
              <li className="admin-report-chart__row" key={item.label}>
                <span className="admin-report-chart__label">{item.label}</span>
                <span className="admin-report-chart__track" aria-hidden="true">
                  <span
                    className={`admin-report-chart__bar admin-report-chart__bar--${index % 4}`}
                    style={{ width: `${width}%` }}
                  />
                </span>
                <strong className="admin-report-chart__value">{formatValue(value)}</strong>
              </li>
            );
          })}
        </ul>
      ) : <p className="dashboard-empty-state">{emptyText}</p>}
    </section>
  );
}

function topChartItems(items, labelFor, valueFor, remainderLabel) {
  const topItems = items.slice(0, 6).map((item) => ({
    label: labelFor(item),
    value: valueFor(item)
  }));
  const remainder = items.slice(6).reduce((total, item) => total + valueFor(item), 0);
  if (remainder > 0) topItems.push({ label: remainderLabel, value: remainder });
  return topItems;
}

function ReportTable({ title, headers, rows, emptyText = 'لا توجد بيانات ضمن الفترة المحددة.' }) {
  return (
    <section className="admin-report-section">
      <h3>{title}</h3>
      {rows.length ? (
        <div className="admin-report-table-wrap">
          <table className="admin-report-table">
            <thead><tr>{headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead>
            <tbody>{rows.map((row, index) => <tr key={`${title}-${index}`}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : <p className="dashboard-empty-state">{emptyText}</p>}
    </section>
  );
}

export default function AdminReports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadReport = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const query = queryForRange(from, to);
      setReport(await apiRequest(`/api/v1/admin/reports${query ? `?${query}` : ''}`));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const exportQuery = report ? queryForReportFilters(report.filters) : '';
  const exportUrl = report
    ? getApiUrl(`/api/v1/admin/reports/export.csv${exportQuery ? `?${exportQuery}` : ''}`)
    : '';
  const paymentCounts = report?.payments.requests ?? [];
  const countFor = (key) => paymentCounts.find((item) => item[key] !== undefined)?.[key] ?? 0;
  const registrationChart = report
    ? Object.entries(report.registrations.byRoleAndApproval).map(([key, value]) => ({
      label: registrationLabel(key),
      value
    }))
    : [];
  const specialistChart = report
    ? topChartItems(report.specialists.byCategory, (item) => item.category, (item) => item.count, 'بقية التخصصات')
    : [];
  const gameChart = report
    ? topChartItems(report.gameUsage.byGame, (item) => item.gameId, (item) => item.attemptCount, 'بقية الألعاب')
    : [];
  const appointmentChart = report
    ? Object.entries(report.appointments.reduce((totals, item) => ({
      ...totals,
      [item.status]: (totals[item.status] ?? 0) + item.count
    }), {})).map(([status, value]) => ({
      label: appointmentLabels[status] ?? status,
      value
    }))
    : [];
  const sessionChart = report
    ? Object.entries(report.appointments.reduce((totals, item) => ({
      ...totals,
      [item.sessionStatus]: (totals[item.sessionStatus] ?? 0) + item.sessionCount
    }), {})).map(([status, value]) => ({
      label: sessionLabels[status] ?? status,
      value
    }))
    : [];
  const paymentChart = report
    ? [
      { label: 'مقدمة / قيد المراجعة', value: countFor('submittedCount') },
      { label: 'مؤكدة', value: countFor('confirmedCount') },
      { label: 'مرفوضة', value: countFor('rejectedCount') }
    ]
    : [];

  return (
    <section className="admin-dashboard__content admin-dashboard-panel admin-reports">
      <div className="admin-dashboard-panel__heading">
        <div>
          <h2>تقارير المنصة</h2>
          <p>تقارير مجمّعة لا تعرض أسماء الأطفال أو معرّفاتهم. المبالغ المؤكدة تعكس طلبات وافق عليها المسؤول فقط.</p>
        </div>
        {report && <a className="button button--small button--outline" href={exportUrl} download>تصدير CSV</a>}
      </div>
      <form className="admin-reports__filters" onSubmit={loadReport}>
        <label>من تاريخ
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>إلى تاريخ
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button type="submit" className="button button--primary" disabled={loading}>
          {loading ? 'جارٍ إعداد التقرير…' : 'عرض التقرير'}
        </button>
      </form>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {loading && <p className="dashboard-loading" role="status">جارٍ تحميل بيانات التقرير…</p>}
      {report && !loading && (
        <>
          <p className="admin-reports__generated">
            تاريخ إنشاء التقرير: {new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.generatedAt))}
            {report.filters.from || report.filters.to
              ? ` · الفترة: ${report.filters.from
                ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(report.filters.from))
                : 'البداية'} – ${report.filters.to
                  ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(report.filters.to))
                  : 'حتى الآن'}`
              : ' · جميع الفترات'}
          </p>
          <div className="admin-report-metrics">
            <Metric label="حسابات أولياء الأمور والأخصائيين" value={report.registrations.total} />
            <Metric label="محاولات ألعاب مسجلة" value={report.gameUsage.attemptsCompleted} />
            <Metric label="أنشطة تعليمية مكتملة" value={report.learningProgress.completedActivities} />
            <Metric label="اشتراكات نشطة" value={report.subscriptions.active} />
            <Metric label="اشتراكات منتهية" value={report.subscriptions.expired} />
          </div>
          <div className="admin-report-charts">
            <ReportBarChart title="التسجيلات حسب الدور والحالة" data={registrationChart} />
            <ReportBarChart title="الأخصائيون حسب التخصص" data={specialistChart} />
            <ReportBarChart title="محاولات الألعاب" data={gameChart} />
            <ReportBarChart title="طلبات الدفع حسب الحالة" data={paymentChart} />
            <ReportBarChart title="المواعيد حسب الحالة" data={appointmentChart} />
            <ReportBarChart title="الجلسات حسب حالة التنفيذ" data={sessionChart} />
          </div>
          <ReportTable title="حالات التسجيل والاعتماد" headers={['الدور والحالة', 'العدد']}
            rows={Object.entries(report.registrations.byRoleAndApproval).map(([key, count]) => [registrationLabel(key), numberFormat.format(count)])} />
          <ReportTable title="الأخصائيون حسب التخصص" headers={['التخصص', 'الحسابات']}
            rows={report.specialists.byCategory.map(({ category, count }) => [category, numberFormat.format(count)])} />
          <ReportTable title="استخدام الألعاب" headers={['معرّف اللعبة', 'المحاولات', 'إجابات صحيحة', 'إجمالي الإجابات']}
            rows={report.gameUsage.byGame.map((item) => [item.gameId, numberFormat.format(item.attemptCount), numberFormat.format(item.correctAnswers), numberFormat.format(item.answeredQuestions)])} />
          <ReportTable title="المسارات التعليمية" headers={['المقياس', 'القيمة']}
            rows={[
              ['أطفال لديهم تقدم مسجل (مجمّع)', numberFormat.format(report.learningProgress.childrenWithProgress)],
              ['أنشطة مكتملة', numberFormat.format(report.learningProgress.completedActivities)]
            ]} />
          <ReportTable title="طلبات الدفع والمبالغ" headers={['المرحلة', 'الطلبات', 'المبلغ', 'التفسير']}
            rows={[
              [ 'كل الطلبات', numberFormat.format(countFor('requestedCount')), currencyFormat.format(report.payments.requestedAmountMinor / 100), 'مبلغ مطلوب، لا يمثل إيرادًا مؤكدًا' ],
              [ 'مقدمة / قيد المراجعة', numberFormat.format(countFor('submittedCount')), currencyFormat.format(report.payments.submittedAmountMinor / 100), 'إيصال أو طلب غير معتمد لا يعد إيرادًا' ],
              [ 'مؤكدة بعد مراجعة المسؤول', numberFormat.format(countFor('confirmedCount')), currencyFormat.format(report.payments.confirmedAmountMinor / 100), 'طلبات دفع وافق عليها المسؤول' ],
              [ 'مرفوضة', numberFormat.format(countFor('rejectedCount')), currencyFormat.format(report.payments.rejectedAmountMinor / 100), 'طلبات رفضت بعد المراجعة' ]
            ]} />
          <ReportTable title="المواعيد والجلسات" headers={['حالة الموعد', 'حالة تنفيذ الجلسة', 'العدد']}
            rows={report.appointments.map((item) => [
              appointmentLabels[item.status] ?? item.status,
              sessionLabels[item.sessionStatus] ?? item.sessionStatus,
              numberFormat.format(item.count)
            ])} />
          <ReportTable title="الأحداث التشغيلية وسجل التدقيق" headers={['الحدث', 'العدد']}
            rows={report.auditEvents.map((item) => [item.action, numberFormat.format(item.count)])} />
        </>
      )}
      {!report && !loading && !error && <p className="dashboard-empty-state">اختر فترة زمنية ثم اعرض التقرير. عند ترك التاريخين فارغين، تُعرض جميع السجلات المتاحة.</p>}
    </section>
  );
}
