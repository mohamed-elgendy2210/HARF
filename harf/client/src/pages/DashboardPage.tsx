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
import { ChildCard } from "../components/ChildCard";

function childErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 401) {
    return "انتهت جلسة الدخول. سجّل الدخول مجددًا للمتابعة.";
  }
  return getApiErrorMessage(error);
}

function formatChildrenCount(count: number): string {
  if (count === 0) return "لا يوجد أطفال";
  if (count === 1) return "طفل واحد";
  if (count === 2) return "طفلان";
  return `${new Intl.NumberFormat("ar-EG").format(count)} أطفال`;
}

export function DashboardPage() {
  const { user, logout, retrySessionCheck } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(true);
  const [childrenError, setChildrenError] = useState("");
  const [childrenSessionExpired, setChildrenSessionExpired] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [childrenSuccess, setChildrenSuccess] = useState("");

  const loadChildren = useCallback(async () => {
    setChildrenLoading(true);
    setChildrenError("");
    setChildrenSessionExpired(false);
    try {
      const response = await childrenApi.list();
      setChildren(response.children);
    } catch (requestError) {
      setChildrenError(childErrorMessage(requestError));
      const expired =
        requestError instanceof ApiRequestError && requestError.status === 401;
      setChildrenSessionExpired(expired);
      if (expired) void retrySessionCheck();
    } finally {
      setChildrenLoading(false);
    }
  }, [retrySessionCheck]);

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
    setChildrenSuccess("");
    try {
      await childrenApi.delete(child.id);
      await loadChildren();
      setChildrenSuccess(`تم حذف ملف ${child.name}.`);
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
          <Link className="parent-navigation-link" to="/dashboard/children">
            أطفالي
          </Link>
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
              <span className="children-count">
                {childrenLoading
                  ? "جارٍ التحميل…"
                  : childrenError
                    ? "تعذّر تحميل القائمة"
                    : formatChildrenCount(children.length)}
              </span>
              <Link
                className="button button-secondary add-child-button"
                to="/dashboard/children"
              >
                عرض أطفالي
              </Link>
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
              {childrenSessionExpired ? (
                <Link className="button button-primary" to="/login">
                  تسجيل الدخول مجددًا
                </Link>
              ) : (
                <button className="button button-secondary" onClick={() => void loadChildren()}>
                  إعادة المحاولة
                </button>
              )}
            </div>
          )}

          {childrenSuccess && (
            <p className="form-message success-message" role="status">
              {childrenSuccess}
            </p>
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
                <ChildCard
                  child={child}
                  key={child.id}
                  deleting={deletingId === child.id}
                  onDelete={(selectedChild) => void handleDelete(selectedChild)}
                />
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
