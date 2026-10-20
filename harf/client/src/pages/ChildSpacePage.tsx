import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiRequestError,
  childrenApi,
  type ChildProfile,
  getApiErrorMessage,
} from "../api/client";
import { BrandMark } from "../components/AuthLayout";
import { useAuth } from "../auth/AuthProvider";

function getChildLoadError(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 401) {
    return "انتهت جلسة الدخول. سجّل الدخول مجددًا.";
  }
  if (error instanceof ApiRequestError && error.status === 404) {
    return "لم نتمكن من العثور على مساحة هذا الطفل.";
  }
  return getApiErrorMessage(error);
}

export function ChildSpacePage() {
  const { retrySessionCheck } = useAuth();
  const { id } = useParams();
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      setError("رابط مساحة الطفل غير صالح.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    void childrenApi
      .get(id)
      .then(({ child: profile }) => {
        if (!cancelled) setChild(profile);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(getChildLoadError(requestError));
          if (
            requestError instanceof ApiRequestError &&
            requestError.status === 401
          ) {
            void retrySessionCheck();
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, retrySessionCheck]);

  return (
    <main className="dashboard-page" dir="rtl">
      <header className="dashboard-header">
        <Link className="dashboard-brand" to="/dashboard">
          <BrandMark small />
          <span>حَرْف</span>
        </Link>
        <Link className="button button-quiet" to="/dashboard/children">
          العودة إلى أطفالي
        </Link>
      </header>

      <section className="child-space-panel">
        {loading ? (
          <p className="children-loading" role="status">جارٍ تحميل مساحة الطفل…</p>
        ) : error ? (
          <div className="child-form-status">
            <p className="form-message error-message" role="alert">{error}</p>
            {error.includes("انتهت جلسة الدخول") ? (
              <Link className="button button-primary" to="/login">
                تسجيل الدخول مجددًا
              </Link>
            ) : (
              <Link className="button button-secondary" to="/dashboard/children">
                العودة إلى أطفالي
              </Link>
            )}
          </div>
        ) : child ? (
          <>
            <span className="child-avatar child-space-avatar" aria-hidden="true">ح</span>
            <p className="eyebrow">مساحة الطفل</p>
            <h1>{child.name}</h1>
            <p className="child-space-description">
              هذه المساحة مرتبطة بملف الطفل الذي تحقّق منه الخادم.
            </p>
            <div className="child-space-placeholder">
              <span className="placeholder-badge">خطوة قادمة</span>
              <h2>الأنشطة ستتوفر لاحقًا</h2>
              <p>
                لم تتم إضافة أنشطة بعد. سنعود إلى هذه المساحة عند تجهيز أنشطة
                مناسبة في مرحلة لاحقة.
              </p>
              <button className="button button-primary" type="button" disabled>
                ابدأ الأنشطة
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
