import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "../components/AuthLayout";
import {
  activitiesApi,
  ApiRequestError,
  childrenApi,
  type Activity,
  type ActivitySession,
  type ChildProfile,
  getApiErrorMessage,
} from "../api/client";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function getHistoryError(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 401) {
    return "انتهت جلسة الدخول. سجّل الدخول مجددًا لمشاهدة سجل المشاركة.";
  }
  if (error instanceof ApiRequestError && error.status === 404) {
    return "لم نتمكن من العثور على ملف الطفل أو سجل المشاركة.";
  }
  return getApiErrorMessage(error);
}

function formatDateTime(value: string | undefined): string {
  if (!value) return "التاريخ غير متوفر";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "التاريخ غير متوفر";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function sessionStatus(status: string): string {
  switch (status) {
    case "completed":
      return "مكتمل";
    case "in_progress":
      return "بدأ ولم يكتمل";
    case "abandoned":
      return "لم يكتمل";
    default:
      return "حالة غير معروفة";
  }
}

function activityTypeName(activityType: ActivitySession["activityType"]): string {
  switch (activityType) {
    case "picture-cards-audio":
      return "بطاقات الصور والصوت";
    case "sound-to-image":
      return "الصوت والصورة";
    case "scene-completion":
      return "إكمال المشهد";
  }
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("ar-EG").format(value);
}

export function ChildActivityHistoryPage() {
  const { retrySessionCheck } = useAuth();
  const { id } = useParams();
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const loadHistory = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      if (!id || !OBJECT_ID_PATTERN.test(id)) {
        if (!isCancelled()) {
          setError("رابط ملف الطفل غير صالح.");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError("");
      setSessionExpired(false);
      try {
        const [
          { child: profile },
          { sessions: childSessions },
          { activities: catalog },
        ] = await Promise.all([
          childrenApi.get(id),
          activitiesApi.listSessions(id),
          activitiesApi.list(),
        ]);
        if (!isCancelled()) {
          setChild(profile);
          setSessions(childSessions);
          setActivities(catalog);
        }
      } catch (requestError) {
        if (!isCancelled()) {
          setError(getHistoryError(requestError));
          const expired =
            requestError instanceof ApiRequestError &&
            requestError.status === 401;
          setSessionExpired(expired);
          if (expired) void retrySessionCheck();
        }
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [id, retrySessionCheck],
  );

  useEffect(() => {
    let cancelled = false;
    void loadHistory(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadHistory, retryKey]);

  const activityNames = useMemo(
    () => new Map(activities.map((activity) => [activity.id, activity.title])),
    [activities],
  );
  const completedSessions = sessions.filter(
    (session) => session.status === "completed",
  );
  const completedActivityCount = new Set(
    completedSessions.map((session) => session.activityId),
  ).size;
  const orderedSessions = [...sessions].sort((left, right) => {
    const leftTime = Date.parse(left.startedAt);
    const rightTime = Date.parse(right.startedAt);
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
    return rightTime - leftTime;
  });
  const activitySessionTotals = new Map<string, number>();
  for (const session of orderedSessions) {
    activitySessionTotals.set(
      session.activityId,
      (activitySessionTotals.get(session.activityId) ?? 0) + 1,
    );
  }
  const seenActivitySessions = new Map<string, number>();
  const childSpacePath = id
    ? `/dashboard/children/${encodeURIComponent(id)}/space`
    : "/dashboard/children";

  return (
    <main className="dashboard-page" dir="rtl">
      <header className="dashboard-header">
        <Link className="dashboard-brand" to="/dashboard">
          <BrandMark small />
          <span>حَرْف</span>
        </Link>
        <Link className="button button-quiet" to={childSpacePath}>
          العودة لمساحة الطفل
        </Link>
      </header>

      <div className="dashboard-content activity-history-content">
        <section className="children-page-heading">
          <div>
            <p className="eyebrow">مشاركة الطفل</p>
            <h1>سجل الأنشطة</h1>
            {child && <p>الجلسات المسجلة لمساحة {child.name} فقط.</p>}
          </div>
          {!loading && !error && (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setRetryKey((key) => key + 1)}
              aria-label="تحديث سجل الأنشطة"
            >
              تحديث السجل
            </button>
          )}
        </section>

        {loading ? (
          <div className="children-loading" role="status" aria-live="polite">
            جارٍ تحميل سجل الأنشطة…
          </div>
        ) : error ? (
          <section className="history-message-panel">
            <p className="form-message error-message" role="alert">
              {error}
            </p>
            {sessionExpired ? (
              <Link className="button button-primary" to="/login">
                تسجيل الدخول مجددًا
              </Link>
            ) : (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setRetryKey((key) => key + 1)}
              >
                إعادة المحاولة
              </button>
            )}
          </section>
        ) : (
          <>
            <section
              className="history-summary"
              aria-label="ملخص المشاركة المسجلة"
            >
              <article className="history-stat">
                <span className="history-stat-value">
                  {formatCount(completedSessions.length)}
                </span>
                <span>جلسات مكتملة</span>
              </article>
              <article className="history-stat">
                <span className="history-stat-value">
                  {formatCount(completedActivityCount)}
                </span>
                <span>أنشطة مكتملة مختلفة</span>
              </article>
            </section>
            <p className="activity-review-note history-disclaimer">
              الأعداد تلخّص الجلسات المسجلة فقط، ولا تقيس تطور اللغة أو النتائج
              العلاجية.
            </p>

            {orderedSessions.length === 0 ? (
              <section className="history-empty-state">
                <span className="history-empty-mark" aria-hidden="true">
                  ح
                </span>
                <h2>لا توجد جلسات مسجلة بعد</h2>
                <p>عند مشاركة {child?.name ?? "الطفل"} في نشاط، ستظهر الجلسة هنا.</p>
                <Link className="button button-primary" to={childSpacePath}>
                  العودة لأنشطة الطفل
                </Link>
              </section>
            ) : (
              <section
                className="history-list-section"
                aria-labelledby="history-list-title"
              >
                <h2 id="history-list-title">الجلسات المسجلة</h2>
                <ol className="activity-history-list">
                  {orderedSessions.map((session) => {
                    const occurrence =
                      (seenActivitySessions.get(session.activityId) ?? 0) + 1;
                    seenActivitySessions.set(session.activityId, occurrence);
                    const total =
                      activitySessionTotals.get(session.activityId) ?? 1;
                    return (
                      <li className="activity-history-card" key={session.id}>
                        <div className="history-card-heading">
                          <div>
                            <h3>
                              {activityNames.get(session.activityId) ??
                                "نشاط غير متاح حاليًا"}
                            </h3>
                            <p className="history-session-id">
                              {total > 1
                                ? `الجلسة ${formatCount(occurrence)} من ${formatCount(total)} · الأحدث أولًا`
                                : `جلسة مشاركة مستقلة · ${activityTypeName(session.activityType)}`}
                            </p>
                          </div>
                          <span
                            className={`history-status history-status-${session.status}`}
                          >
                            {sessionStatus(session.status)}
                          </span>
                        </div>
                        <p className="history-date">
                          {session.status === "completed"
                            ? `تاريخ الإكمال: ${formatDateTime(session.completedAt)}`
                            : `تاريخ البدء: ${formatDateTime(session.startedAt)}`}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
