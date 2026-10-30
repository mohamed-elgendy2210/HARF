import { useState } from 'react';
import { apiRequest, getApiUrl } from '../lib/api.js';

const numberFormat = new Intl.NumberFormat('ar-EG');
const currencyFormat = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' });
const roleLabels = { parent: 'ولي أمر', specialist: 'أخصائي' };
const approvalLabels = { approved: 'معتمد', pending: 'بانتظار المراجعة', rejected: 'مرفوض' };
const appointmentLabels = { pending: 'بانتظار القرار', accepted: 'مؤكد', rejected: 'مرفوض', expired: 'منتهي' };
const sessionLabels = { not_started: 'لم تبدأ', in_progress: 'جارية', completed: 'مكتملة' };

function registrationLabel(key) {
  const [role, approval] = key.split(':');
  return `${roleLabels[role] ?? role} · ${approvalLabels[approval] ?? approval}`;
}

function queryForRange(from, to) {
  const query = new URLSearchParams();
  if (from) query.set('from', new Date(`${from}T00:00:00.000Z`).toISOString());
  if (to) query.set('to', new Date(`${to}T23:59:59.999Z`).toISOString());
  return query.toString();
}

function Metric({ label, value }) {
  return <article className="admin-report-metric"><span>{label}</span><strong>{numberFormat.format(value ?? 0)}</strong></article>;
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

  const exportUrl = report ? getApiUrl(`/api/v1/admin/reports/export.csv${queryForRange(from, to) ? `?${queryForRange(from, to)}` : ''}`) : '';
  const paymentCounts = report?.payments.requests ?? [];
  const countFor = (key) => paymentCounts.find((item) => item[key] !== undefined)?.[key] ?? 0;

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
          <p className="admin-reports__generated">تاريخ إنشاء التقرير: {new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.generatedAt))}</p>
          <div className="admin-report-metrics">
            <Metric label="حسابات أولياء الأمور والأخصائيين" value={report.registrations.total} />
            <Metric label="محاولات ألعاب مسجلة" value={report.gameUsage.attemptsCompleted} />
            <Metric label="أنشطة تعليمية مكتملة" value={report.learningProgress.completedActivities} />
            <Metric label="اشتراكات نشطة" value={report.subscriptions.active} />
            <Metric label="اشتراكات منتهية" value={report.subscriptions.expired} />
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
