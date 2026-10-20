import type { ReactNode } from "react";

export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark${small ? " brand-mark-small" : ""}`} aria-hidden="true">
      ح
    </span>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page" dir="rtl">
      <section className="auth-aside" aria-label="عن حَرْف">
        <a className="brand-lockup" href="/login" aria-label="حَرْف - الصفحة الرئيسية">
          <BrandMark />
          <span>
            <strong>حَرْف</strong>
            <small>خطوة صغيرة، وأثر جميل</small>
          </span>
        </a>
        <div className="aside-copy">
          <p className="eyebrow">مساحة آمنة للتعلّم والنمو</p>
          <h1>نرافق طفلك<br />في كل خطوة.</h1>
          <p>ابدأ رحلتكم في حَرْف، وتابعوا التفاصيل بهدوء واهتمام.</p>
        </div>
        <div className="aside-note">
          <span className="note-dot" aria-hidden="true" />
          <span>لكل طفل طريقته الخاصة في التقدّم.</span>
        </div>
        <span className="aside-decoration decoration-one" aria-hidden="true" />
        <span className="aside-decoration decoration-two" aria-hidden="true" />
      </section>
      <section className="auth-main">
        <div className="auth-mobile-brand">
          <BrandMark small />
          <strong>حَرْف</strong>
        </div>
        <div className="auth-content">{children}</div>
        <footer className="auth-footer">حَرْف · مساحة تنمو فيها الحكايات</footer>
      </section>
    </main>
  );
}
