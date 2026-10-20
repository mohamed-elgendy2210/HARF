import { Link } from "react-router-dom";
import { BrandMark } from "../components/AuthLayout";

export function ChildPlaceholderPage() {
  return (
    <main className="dashboard-page" dir="rtl">
      <header className="dashboard-header">
        <Link className="dashboard-brand" to="/dashboard">
          <BrandMark small />
          <span>حَرْف</span>
        </Link>
        <Link className="button button-quiet" to="/dashboard">العودة إلى المساحة</Link>
      </header>
      <section className="placeholder-panel">
        <span className="placeholder-badge">خطوة قادمة</span>
        <h1>إضافة طفل</h1>
        <p>هذه الخطوة مؤقتة. ستتوفر إضافة ملفات الأطفال في milestone لاحق.</p>
        <Link className="button button-primary" to="/dashboard">العودة إلى لوحة وليّ الأمر</Link>
      </section>
    </main>
  );
}
