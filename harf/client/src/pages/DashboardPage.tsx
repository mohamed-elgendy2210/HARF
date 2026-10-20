import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "../components/AuthLayout";

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setError("");
    setBusy(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dashboard-page" dir="rtl">
      <header className="dashboard-header">
        <Link className="dashboard-brand" to="/dashboard">
          <BrandMark small />
          <span>حَرْف</span>
        </Link>
        <div className="dashboard-actions">
          <span className="profile-name">{user?.name}</span>
          <button className="button button-quiet" onClick={() => void handleLogout()} disabled={busy}>
            {busy ? "جارٍ الخروج…" : "تسجيل الخروج"}
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        <section className="welcome-panel">
          <div>
            <p className="eyebrow">مساحتكم في حَرْف</p>
            <h1>أهلًا، {user?.name}</h1>
            <p>هنا تبدأ حكاية عائلتكم، خطوة هادئة في كل مرة.</p>
          </div>
          <span className="welcome-sun" aria-hidden="true">✦</span>
        </section>

        {error && <p className="form-message error-message" role="alert">{error}</p>}

        <section className="children-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">العائلة</p>
              <h2>مساحة الأطفال</h2>
            </div>
            <span className="children-count">٠ أطفال</span>
          </div>

          <div className="empty-state">
            <div className="empty-illustration" aria-hidden="true">
              <span className="empty-circle">ح</span>
              <i />
              <b />
            </div>
            <h3>لم تتم إضافة أطفال بعد</h3>
            <p>عندما تكونون مستعدين، يمكنكم إنشاء مساحة لطفلكم هنا.</p>
            <Link className="button button-primary" to="/dashboard/children/new">
              <span aria-hidden="true">＋</span> إضافة طفل
            </Link>
          </div>
        </section>

        <p className="dashboard-footnote">
          كل عائلة لها إيقاعها الخاص <span aria-hidden="true">♥</span>
        </p>
      </div>
    </main>
  );
}
