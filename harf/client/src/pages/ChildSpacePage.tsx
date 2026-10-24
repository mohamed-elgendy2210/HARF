import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiRequestError,
  activitiesApi,
  childrenApi,
  type Activity,
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
  const [activity, setActivity] = useState<Activity | null>(null);
  const [soundActivity, setSoundActivity] = useState<Activity | null>(null);
  const [sceneActivity, setSceneActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadChildSpace = useCallback(async (
    isCancelled: () => boolean = () => false,
  ) => {
    if (!id) {
      setError("رابط مساحة الطفل غير صالح.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [
        { child: profile },
        { activities: pictureActivities },
        { activities: soundActivities },
        { activities: sceneActivities },
      ] = await Promise.all([
        childrenApi.get(id),
        activitiesApi.list("picture-cards-audio"),
        activitiesApi.list("sound-to-image"),
        activitiesApi.list("scene-completion"),
      ]);
      const pictureCards = pictureActivities.find(
        (item) =>
          item.id === "demo-picture-cards-audio" &&
          item.activityType === "picture-cards-audio",
      );
      const soundToImage = soundActivities.find(
        (item) =>
          item.id === "demo-sound-to-image" &&
          item.activityType === "sound-to-image",
      );
      const sceneCompletion = sceneActivities.find(
        (item) =>
          item.id === "demo-scene-completion" &&
          item.activityType === "scene-completion" &&
          item.availability === "available",
      );
      if (!isCancelled()) {
        setChild(profile);
        setActivity(pictureCards ?? null);
        setSoundActivity(soundToImage ?? null);
        setSceneActivity(sceneCompletion ?? null);
      }
    } catch (requestError) {
      if (!isCancelled()) {
        setError(getChildLoadError(requestError));
        if (
          requestError instanceof ApiRequestError &&
          requestError.status === 401
        ) {
          void retrySessionCheck();
        }
      }
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, [id, retrySessionCheck]);

  useEffect(() => {
    let cancelled = false;
    void loadChildSpace(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadChildSpace]);

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
              <div className="activity-actions">
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => void loadChildSpace()}
                >
                  إعادة المحاولة
                </button>
                <Link
                  className="button button-secondary"
                  to="/dashboard/children"
                >
                  العودة إلى أطفالي
                </Link>
              </div>
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
            <Link
              className="button button-secondary child-space-history-link"
              to={`/dashboard/children/${encodeURIComponent(child.id)}/history`}
            >
              عرض سجل الأنشطة
            </Link>
            {activity ? (
              <div className="child-space-placeholder">
                <span className="placeholder-badge">نشاط تجريبي</span>
                <h2>{activity.title}</h2>
                <p>{activity.description}</p>
                <p className="activity-review-note">
                  محتوى تجريبي قيد مراجعة مختص؛ لا يُعد تقييمًا أو علاجًا.
                </p>
                <Link
                  className="button button-primary"
                  to={`/dashboard/children/${encodeURIComponent(child.id)}/activities/picture-cards`}
                >
                  ابدأ بطاقات الصور
                </Link>
              </div>
            ) : (
              <div className="child-space-placeholder" role="status">
                <p>هذا النشاط غير متاح الآن.</p>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => void loadChildSpace()}
                >
                  إعادة المحاولة
                </button>
              </div>
            )}
            {soundActivity && (
              <div className="child-space-placeholder">
                <span className="placeholder-badge">نشاط تجريبي · الصوت قيد التجهيز</span>
                <h2>{soundActivity.title}</h2>
                <p>{soundActivity.description}</p>
                <p className="activity-review-note">
                  محتوى تجريبي قيد مراجعة مختص؛ لا يُعد تقييمًا أو علاجًا.
                </p>
                <Link
                  className="button button-primary"
                  to={`/dashboard/children/${encodeURIComponent(child.id)}/activities/sound-to-image`}
                >
                  ابدأ نشاط الصوت والصورة
                </Link>
              </div>
            )}
            {sceneActivity && (
              <div className="child-space-placeholder">
                <span className="placeholder-badge">نشاط تجريبي</span>
                <h2>{sceneActivity.title}</h2>
                <p>{sceneActivity.description}</p>
                <p className="activity-review-note">
                  محتوى تجريبي يحتاج إلى مراجعة مختص؛ المشاركة ليست تقييمًا أو علاجًا.
                </p>
                <Link
                  className="button button-primary"
                  to={`/dashboard/children/${encodeURIComponent(child.id)}/activities/scene-completion`}
                >
                  أكمل المشهد
                </Link>
              </div>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
