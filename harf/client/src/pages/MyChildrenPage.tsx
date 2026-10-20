import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ApiRequestError,
  childrenApi,
  type ChildProfile,
  getApiErrorMessage,
} from "../api/client";
import { ChildCard } from "../components/ChildCard";
import { BrandMark } from "../components/AuthLayout";
import { useAuth } from "../auth/AuthProvider";

function childErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 401) {
    return "انتهت جلسة الدخول. سجّل الدخول مجددًا لمشاهدة ملفات أطفالك.";
  }
  return getApiErrorMessage(error);
}

function formatChildrenCount(count: number): string {
  if (count === 0) return "لا يوجد أطفال";
  if (count === 1) return "طفل واحد";
  if (count === 2) return "طفلان";
  return `${new Intl.NumberFormat("ar-EG").format(count)} أطفال`;
}

interface NavigationState {
  childMutationMessage?: string;
}

export function MyChildrenPage() {
  const { retrySessionCheck } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationState = location.state as NavigationState | null;
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [success, setSuccess] = useState(
    navigationState?.childMutationMessage ?? "",
  );
  const [deletingId, setDeletingId] = useState("");

  const loadChildren = useCallback(async () => {
    setLoading(true);
    setError("");
    setSessionExpired(false);
    try {
      const response = await childrenApi.list();
      setChildren(response.children);
    } catch (requestError) {
      setError(childErrorMessage(requestError));
      const expired =
        requestError instanceof ApiRequestError && requestError.status === 401;
      setSessionExpired(expired);
      if (expired) void retrySessionCheck();
    } finally {
      setLoading(false);
    }
  }, [retrySessionCheck]);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  useEffect(() => {
    if (navigationState?.childMutationMessage) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, navigationState?.childMutationMessage]);

  async function handleDelete(child: ChildProfile) {
    const confirmed = window.confirm(
      `هل تريد حذف ملف ${child.name}؟ لا يمكن التراجع عن هذا الإجراء.`,
    );
    if (!confirmed) return;

    setDeletingId(child.id);
    setError("");
    setSuccess("");
    try {
      await childrenApi.delete(child.id);
      await loadChildren();
      setSuccess(`تم حذف ملف ${child.name}.`);
    } catch (requestError) {
      setError(childErrorMessage(requestError));
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
        <nav className="parent-navigation" aria-label="التنقل الرئيسي">
          <Link className="parent-navigation-link" to="/dashboard">
            الرئيسية
          </Link>
          <Link
            className="parent-navigation-link active"
            to="/dashboard/children"
            aria-current="page"
          >
            أطفالي
          </Link>
        </nav>
      </header>

      <div className="dashboard-content">
        <section className="children-page-heading">
          <div>
            <p className="eyebrow">مساحتكم في حَرْف</p>
            <h1>أطفالي</h1>
            <p>ملفات أطفال عائلتكم في مكان واحد.</p>
          </div>
          <span className="children-count">
            {loading
              ? "جارٍ التحميل…"
              : error
                ? "تعذّر تحميل القائمة"
                : formatChildrenCount(children.length)}
          </span>
        </section>

        {success && (
          <p className="form-message success-message" role="status">
            {success}
          </p>
        )}

        <section className="children-page-section" aria-labelledby="children-list-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">العائلة</p>
              <h2 id="children-list-title">ملفات الأطفال</h2>
            </div>
            {children.length > 0 && (
              <Link
                className="button button-primary add-child-button"
                to="/dashboard/children/new"
              >
                <span aria-hidden="true">＋</span> إضافة طفل
              </Link>
            )}
          </div>

          {loading ? (
            <div className="children-loading" role="status" aria-live="polite">
              جارٍ تحميل ملفات الأطفال…
            </div>
          ) : error ? (
            <div className="children-error-panel">
              <p className="form-message error-message" role="alert">{error}</p>
              {!sessionExpired && (
                <button
                  className="button button-secondary"
                  onClick={() => void loadChildren()}
                >
                  إعادة المحاولة
                </button>
              )}
              {sessionExpired && (
                <Link className="button button-primary" to="/login">
                  تسجيل الدخول مجددًا
                </Link>
              )}
            </div>
          ) : children.length === 0 ? (
            <div className="empty-state">
              <div className="empty-illustration" aria-hidden="true">
                <span className="empty-circle">ح</span>
                <i />
                <b />
              </div>
              <h3>أهلًا بكم في مساحة عائلتكم</h3>
              <p>
                لم تتم إضافة أطفال بعد. عندما تكونون مستعدين، أنشئوا ملفًا
                بسيطًا للبدء.
              </p>
              <Link className="button button-primary" to="/dashboard/children/new">
                <span aria-hidden="true">＋</span> إضافة طفل
              </Link>
            </div>
          ) : (
            <>
              <p className="children-page-caption">
                تظهر هنا الملفات التي استرجعها حساب وليّ الأمر الحالي.
              </p>
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
              <div className="children-list-footer">
                <Link
                  className="button button-secondary"
                  to="/dashboard/children/new"
                >
                  إضافة طفل آخر
                </Link>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
