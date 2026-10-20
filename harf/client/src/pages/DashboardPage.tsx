import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiRequestError,
  childrenApi,
  type ChildProfile,
  getApiErrorMessage,
} from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "../components/AuthLayout";

function childErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 401) {
    return "انتهت جلسة الدخول. سجّل الدخول مجددًا للمتابعة.";
  }
  return getApiErrorMessage(error);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatChildrenCount(count: number): string {
  if (count === 0) return "لا يوجد أطفال";
  if (count === 1) return "طفل واحد";
  if (count === 2) return "طفلان";
  return `${new Intl.NumberFormat("ar-EG").format(count)} أطفال`;
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(true);
  const [childrenError, setChildrenError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const loadChildren = useCallback(async () => {
    setChildrenLoading(true);
    setChildrenError("");
    try {
      const response = await childrenApi.list();
      setChildren(response.children);
    } catch (requestError) {
      setChildrenError(childErrorMessage(requestError));
    } finally {
      setChildrenLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

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

  async function handleDelete(child: ChildProfile) {
    const confirmed = window.confirm(
      `هل تريد حذف ملف ${child.name}؟ لا يمكن التراجع عن هذا الإجراء.`,
    );
    if (!confirmed) return;

    setDeletingId(child.id);
    setChildrenError("");
    try {
      await childrenApi.delete(child.id);
      setChildren((current) => current.filter((item) => item.id !== child.id));
    } catch (requestError) {
      setChildrenError(childErrorMessage(requestError));
    } finally {
      setDeletingId("");
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
            <div className="children-heading-actions">
              <span className="children-count">{formatChildrenCount(children.length)}</span>
              {children.length > 0 && (
                <Link className="button button-primary add-child-button" to="/dashboard/children/new">
                  <span aria-hidden="true">＋</span> إضافة طفل
                </Link>
              )}
            </div>
          </div>

          {childrenError && (
            <div className="children-error-panel">
              <p className="form-message error-message" role="alert">{childrenError}</p>
              <button className="button button-secondary" onClick={() => void loadChildren()}>
                إعادة المحاولة
              </button>
            </div>
          )}

          {childrenLoading ? (
            <div className="children-loading" role="status">جارٍ تحميل ملفات الأطفال…</div>
          ) : childrenError ? null : children.length === 0 ? (
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
          ) : (
            <ul className="children-list">
              {children.map((child) => (
                <li className="child-card" key={child.id}>
                  <span className="child-avatar" aria-hidden="true">ح</span>
                  <div className="child-card-details">
                    <h3>{child.name}</h3>
                    <p>تاريخ الميلاد: {formatDate(child.dateOfBirth)}</p>
                  </div>
                  <div className="child-card-actions">
                    <Link
                      className="button button-secondary child-action-button"
                      to={`/dashboard/children/${encodeURIComponent(child.id)}/edit`}
                      aria-label={`تعديل ملف ${child.name}`}
                    >
                      تعديل
                    </Link>
                    <button
                      className="button button-danger child-action-button"
                      onClick={() => void handleDelete(child)}
                      disabled={deletingId === child.id}
                      aria-label={`حذف ملف ${child.name}`}
                    >
                      {deletingId === child.id ? "جارٍ الحذف…" : "حذف"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="dashboard-footnote">
          كل عائلة لها إيقاعها الخاص <span aria-hidden="true">♥</span>
        </p>
      </div>
    </main>
  );
}
