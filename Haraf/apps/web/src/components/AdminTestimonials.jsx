import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';

const statusLabels = {
  pending: 'بانتظار المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض'
};

function formatDate(value) {
  return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function AdminTestimonials() {
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadTestimonials = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/api/v1/admin/testimonials');
      setTestimonials(result.testimonials);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTestimonials();
  }, [loadTestimonials]);

  const review = async (testimonial, decision) => {
    setBusyId(testimonial.id);
    setError('');
    setNotice('');
    try {
      const { testimonial: updated } = await apiRequest(`/api/v1/admin/testimonials/${testimonial.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision })
      });
      setTestimonials((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(decision === 'approved' ? 'تم اعتماد الرأي وسيظهر على الصفحة الرئيسية.' : 'تم رفض الرأي وإبلاغ ولي الأمر.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  const orderedTestimonials = [...testimonials].sort((left, right) => (
    Number(right.status === 'pending') - Number(left.status === 'pending')
    || new Date(right.createdAt) - new Date(left.createdAt)
  ));
  const pendingCount = testimonials.filter(({ status }) => status === 'pending').length;

  return (
    <section className="dashboard-section admin-testimonials">
      <header className="admin-testimonials__heading">
        <div>
          <h3>مراجعة آراء أولياء الأمور</h3>
          <p>لا يُنشر أي رأي قبل موافقة الإدارة. راجع المحتوى ثم اعتمده أو ارفضه.</p>
        </div>
        <span>{pendingCount} بانتظار المراجعة</span>
      </header>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-message" role="status">{notice}</p>}
      <button type="button" className="button button--small button--outline" onClick={loadTestimonials} disabled={loading || Boolean(busyId)}>
        تحديث القائمة
      </button>
      {loading ? <p className="dashboard-loading" role="status">جارٍ تحميل الآراء…</p>
        : orderedTestimonials.length ? (
          <div className="admin-testimonials__list">
            {orderedTestimonials.map((testimonial) => (
              <article className={`admin-testimonial-card admin-testimonial-card--${testimonial.status}`} key={testimonial.id}>
                <div className="admin-testimonial-card__topline">
                  <strong>{testimonial.displayName}</strong>
                  <span>{statusLabels[testimonial.status]}</span>
                </div>
                <blockquote>«{testimonial.quote}»</blockquote>
                <time dateTime={testimonial.createdAt}>أُرسل في {formatDate(testimonial.createdAt)}</time>
                {testimonial.status === 'pending' && (
                  <div className="admin-testimonial-card__actions">
                    <button type="button" className="button button--small button--primary"
                      disabled={Boolean(busyId)} onClick={() => review(testimonial, 'approved')}>
                      {busyId === testimonial.id ? 'جارٍ الحفظ…' : 'اعتماد ونشر'}
                    </button>
                    <button type="button" className="button button--small button--outline"
                      disabled={Boolean(busyId)} onClick={() => review(testimonial, 'rejected')}>
                      رفض
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : <div className="dashboard-empty-state">لا توجد آراء حتى الآن.</div>}
    </section>
  );
}
