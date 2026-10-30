import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';

const statusLabels = {
  pending: 'بانتظار مراجعة الإدارة',
  approved: 'تم اعتماد الرأي',
  rejected: 'لم يُعتمد للنشر'
};

function formatDate(value) {
  return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(value));
}

export default function ParentTestimonials() {
  const [testimonials, setTestimonials] = useState([]);
  const [quote, setQuote] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showName, setShowName] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadTestimonials = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/api/v1/testimonials/mine');
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

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { testimonial } = await apiRequest('/api/v1/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote,
          displayName: showName ? displayName : ''
        })
      });
      setTestimonials((current) => [testimonial, ...current]);
      setQuote('');
      setDisplayName('');
      setShowName(false);
      setNotice('شكرًا لمشاركة رأيك. سيظهر بعد مراجعة واعتماد الإدارة.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const hasPending = testimonials.some(({ status }) => status === 'pending');

  return (
    <section className="dashboard-section parent-testimonials">
      <header className="parent-testimonials__intro">
        <span aria-hidden="true">♡</span>
        <div>
          <h3>شاركنا تجربتك مع حرف</h3>
          <p>رأيك يساعد الأسر الأخرى. لن يظهر أي رأي على الموقع إلا بعد مراجعته واعتماده من الإدارة.</p>
        </div>
      </header>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-message" role="status">{notice}</p>}
      {!loading && !hasPending && (
        <form className="parent-testimonials__form" onSubmit={submit}>
          <label htmlFor="parent-testimonial-quote">رأيك أو تجربتك</label>
          <textarea id="parent-testimonial-quote" value={quote} minLength={10} maxLength={600}
            rows={5} required placeholder="اكتب رأيك بصدق وبالقدر الذي ترغب بمشاركته…"
            onChange={(event) => setQuote(event.target.value)} />
          <small>{quote.length} / ٦٠٠ حرف</small>
          <label className="parent-testimonials__consent">
            <input type="checkbox" checked={showName} onChange={(event) => setShowName(event.target.checked)} />
            <span>أوافق على إظهار اسم أختاره بجانب رأيي إذا تم اعتماده</span>
          </label>
          {showName && (
            <label htmlFor="parent-testimonial-name">الاسم الذي سيظهر للزوار
              <input id="parent-testimonial-name" value={displayName} maxLength={60} required={showName}
                placeholder="مثال: أم يوسف" onChange={(event) => setDisplayName(event.target.value)} />
            </label>
          )}
          <button type="submit" className="button button--primary" disabled={busy || quote.trim().length < 10}>
            {busy ? 'جارٍ إرسال رأيك…' : 'إرسال للمراجعة'}
          </button>
        </form>
      )}
      {hasPending && <div className="dashboard-empty-state">وصل رأيك إلى الإدارة وهو قيد المراجعة. يمكنك إضافة رأي جديد بعد انتهاء المراجعة.</div>}
      <div className="parent-testimonials__history">
        <h4>آرائي المرسلة</h4>
        {loading ? <p className="dashboard-loading" role="status">جارٍ تحميل آرائك…</p>
          : testimonials.length ? testimonials.map((testimonial) => (
            <article className="parent-testimonials__item" key={testimonial.id}>
              <div>
                <p>«{testimonial.quote}»</p>
                <time dateTime={testimonial.createdAt}>{formatDate(testimonial.createdAt)}</time>
              </div>
              <span className={`parent-testimonials__status parent-testimonials__status--${testimonial.status}`}>
                {statusLabels[testimonial.status]}
              </span>
            </article>
          )) : <div className="dashboard-empty-state">لم ترسل رأيًا بعد. ستكون مشاركتك موضع تقدير.</div>}
      </div>
    </section>
  );
}
