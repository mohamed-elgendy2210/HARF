import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "../components/AuthLayout";
import { MascotPlaceholder } from "../components/MascotPlaceholder";
import {
  activitiesApi,
  ApiRequestError,
  childrenApi,
  type Activity,
  type ActivityItem,
  type ActivitySession,
  type ChildProfile,
  getApiErrorMessage,
} from "../api/client";

const ACTIVITY_ID = "demo-scene-completion";
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

type Phase = "ready" | "playing" | "complete";

function getActivityError(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 401) {
    return "انتهت جلسة الدخول. سجّل الدخول مجددًا.";
  }
  if (error instanceof ApiRequestError && error.status === 404) {
    return "لم نتمكن من العثور على ملف الطفل أو النشاط.";
  }
  if (error instanceof ApiRequestError && error.status === 409) {
    return "تعذّر تحديث المشاركة. حاول مرة أخرى.";
  }
  return getApiErrorMessage(error);
}

function isValidSceneItem(item: ActivityItem): boolean {
  return (
    Boolean(item.sceneAsset) &&
    Array.isArray(item.choices) &&
    item.choices.length >= 2 &&
    item.choices.length <= 3 &&
    typeof item.correctChoiceId === "string" &&
    item.choices.some((choice) => choice.id === item.correctChoiceId) &&
    item.choices.every((choice) => Boolean(choice.imageAsset))
  );
}

function isExpectedSession(
  session: ActivitySession,
  childId: string,
  status: ActivitySession["status"],
): boolean {
  return (
    session.childId === childId &&
    session.activityId === ACTIVITY_ID &&
    session.status === status
  );
}

export function SceneCompletionActivityPage() {
  const { retrySessionCheck } = useAuth();
  const { id } = useParams();
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [session, setSession] = useState<ActivitySession | null>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [failedImages, setFailedImages] = useState<Set<string>>(
    () => new Set(),
  );

  const loadActivity = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      if (!id || !OBJECT_ID_PATTERN.test(id)) {
        if (!isCancelled()) {
          setLoadError("رابط ملف الطفل غير صالح.");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setLoadError("");
      setChild(null);
      setActivity(null);
      try {
        const [{ child: profile }, { activities }] = await Promise.all([
          childrenApi.get(id),
          activitiesApi.list("scene-completion"),
        ]);
        const definition = activities.find(
          (candidate) =>
            candidate.id === ACTIVITY_ID &&
            candidate.activityType === "scene-completion" &&
            candidate.availability === "available",
        );
        if (!definition || definition.items.length === 0) {
          if (!isCancelled()) {
            setLoadError("النشاط غير متاح الآن. حاول مرة أخرى لاحقًا.");
          }
          return;
        }
        if (!isCancelled()) {
          setChild(profile);
          setActivity(definition);
        }
      } catch (error) {
        if (!isCancelled()) {
          setLoadError(getActivityError(error));
          if (error instanceof ApiRequestError && error.status === 401) {
            void retrySessionCheck();
          }
        }
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [id, retrySessionCheck],
  );

  useEffect(() => {
    let cancelled = false;
    void loadActivity(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadActivity, retryKey]);

  const scenes = activity?.items ?? [];
  const currentScene = scenes[sceneIndex];
  const choices = currentScene?.choices ?? [];
  const readyToStart =
    scenes.length > 0 && scenes.every(isValidSceneItem);
  const isCorrect = Boolean(
    currentScene &&
      selectedChoiceId &&
      selectedChoiceId === currentScene.correctChoiceId,
  );
  const childSpacePath = child
    ? `/dashboard/children/${encodeURIComponent(child.id)}/space`
    : "/dashboard/children";

  async function startActivity() {
    if (!id || !activity || !readyToStart) return;
    setPending(true);
    setActionError("");
    try {
      const { session: started } = await activitiesApi.startSession(
        id,
        activity.id,
      );
      if (!isExpectedSession(started, id, "in_progress")) {
        setActionError("لم نتأكد من حفظ مشاركة هذا الطفل. حاول مرة أخرى.");
        return;
      }
      setSession(started);
      setSceneIndex(0);
      setSelectedChoiceId("");
      setPhase("playing");
    } catch (error) {
      setActionError(getActivityError(error));
      if (error instanceof ApiRequestError && error.status === 401) {
        void retrySessionCheck();
      }
    } finally {
      setPending(false);
    }
  }

  async function completeActivity() {
    if (!id || !session) return;
    setPending(true);
    setActionError("");
    try {
      const { session: completed } = await activitiesApi.completeSession(
        id,
        session.id,
      );
      if (!isExpectedSession(completed, id, "completed")) {
        setActionError("لم نتأكد من حفظ إكمال النشاط. حاول مرة أخرى.");
        return;
      }
      setSession(completed);
      setPhase("complete");
    } catch (error) {
      setActionError(getActivityError(error));
      if (error instanceof ApiRequestError && error.status === 401) {
        void retrySessionCheck();
      }
    } finally {
      setPending(false);
    }
  }

  function continueAfterCorrectChoice() {
    if (!isCorrect || pending) return;
    setActionError("");
    setSelectedChoiceId("");
    if (sceneIndex === scenes.length - 1) {
      void completeActivity();
      return;
    }
    setSceneIndex((current) => current + 1);
  }

  async function playAgain() {
    setPhase("ready");
    setSession(null);
    setSceneIndex(0);
    setSelectedChoiceId("");
    setActionError("");
    await startActivity();
  }

  function recordImageFailure(imageKey: string) {
    setFailedImages((current) => new Set(current).add(imageKey));
  }

  return (
    <main className="dashboard-page activity-page" dir="rtl">
      <header className="dashboard-header">
        <Link className="dashboard-brand" to="/dashboard">
          <BrandMark small />
          <span>حَرْف</span>
        </Link>
        <Link className="button button-quiet" to={childSpacePath}>
          العودة لأنشطة الطفل
        </Link>
      </header>

      {loading ? (
        <section className="activity-state-panel" role="status" aria-live="polite">
          جارٍ تحميل النشاط…
        </section>
      ) : loadError ? (
        <section className="activity-state-panel">
          <h1>تعذّر فتح النشاط</h1>
          <p className="form-message error-message" role="alert">
            {loadError}
          </p>
          {loadError.includes("انتهت جلسة الدخول") ? (
            <Link className="button button-primary" to="/login">
              تسجيل الدخول مجددًا
            </Link>
          ) : (
            <div className="activity-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={() => setRetryKey((key) => key + 1)}
              >
                إعادة المحاولة
              </button>
              <Link className="button button-secondary" to={childSpacePath}>
                العودة لأنشطة الطفل
              </Link>
            </div>
          )}
        </section>
      ) : child && activity && phase === "ready" ? (
        <section className="activity-state-panel activity-intro">
          <MascotPlaceholder />
          <p className="eyebrow">نشاط تجريبي · قيد المراجعة</p>
          <h1>{activity.title}</h1>
          <p className="activity-child-name">هذه المساحة لـ {child.name}</p>
          <p>{activity.instructions[0] ?? "اختر الصورة التي تكمل المشهد."}</p>
          <p className="activity-review-note">
            المشاهد والاختيارات محتوى تجريبي يحتاج إلى مراجعة مختص. المشاركة
            ليست تقييمًا أو علاجًا.
          </p>
          {!readyToStart && (
            <p className="form-message error-message" role="alert">
              بيانات المشاهد غير مكتملة، ولا يمكن بدء النشاط الآن.
            </p>
          )}
          {actionError && (
            <p className="form-message error-message" role="alert">
              {actionError}
            </p>
          )}
          <button
            className="button button-primary activity-primary-action"
            type="button"
            onClick={() => void startActivity()}
            disabled={pending || !readyToStart}
          >
            {pending ? "جارٍ بدء النشاط…" : "ابدأ"}
          </button>
        </section>
      ) : child && activity && phase === "playing" && currentScene ? (
        <section className="activity-play-panel" aria-labelledby="scene-title">
          <div className="activity-play-heading">
            <div>
              <p className="eyebrow">مساحة {child.name}</p>
              <h1 id="scene-title">{activity.title}</h1>
            </div>
            <span
              className="activity-card-position"
              aria-label={`المشهد ${sceneIndex + 1} من ${scenes.length}`}
            >
              {sceneIndex + 1} / {scenes.length}
            </span>
          </div>
          <p className="activity-gentle-prompt">
            {currentScene.prompt ?? "اختر الصورة التي تكمل المشهد."}
          </p>
          <div className="scene-illustration">
            {currentScene.sceneAsset &&
            !failedImages.has(`${currentScene.id}-scene`) ? (
              <img
                src={currentScene.sceneAsset}
                alt={`مشهد يحتاج إلى إكمال: ${currentScene.label}`}
                onError={() =>
                  recordImageFailure(`${currentScene.id}-scene`)
                }
              />
            ) : (
              <div className="scene-fallback" role="img" aria-label="رسم المشهد غير متوفر">
                <span>المشهد غير متوفر</span>
                <small>يمكنكم اختيار صورة لإكماله</small>
              </div>
            )}
            {isCorrect && (
              <img
                className={`scene-completed-object scene-object-${currentScene.id}`}
                src={
                  choices.find((choice) => choice.id === selectedChoiceId)
                    ?.imageAsset
                }
                alt={`تمت إضافة ${choices.find((choice) => choice.id === selectedChoiceId)?.label ?? "الصورة"} إلى المشهد`}
              />
            )}
          </div>
          <p className="activity-gentle-prompt">أي صورة تناسب هذا المشهد؟</p>
          <div
            className="sound-choice-grid"
            role="group"
            aria-label="اختر الشيء المناسب لإكمال المشهد"
          >
            {choices.map((choice) => {
              const selected = selectedChoiceId === choice.id;
              const imageKey = `${currentScene.id}-${choice.id}`;
              return (
                <button
                  className={[
                    "sound-choice",
                    selected && isCorrect && "is-correct",
                    selected && !isCorrect && "is-try-again",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="button"
                  key={choice.id}
                  onClick={() => setSelectedChoiceId(choice.id)}
                  disabled={pending || isCorrect}
                  aria-label={`اختيار ${choice.label}`}
                  aria-pressed={selected}
                >
                  {choice.imageAsset && !failedImages.has(imageKey) ? (
                    <img
                      src={choice.imageAsset}
                      alt=""
                      onError={() => recordImageFailure(imageKey)}
                    />
                  ) : (
                    <span className="sound-choice-fallback" aria-hidden="true">
                      {choice.label}
                      <small>الصورة غير متوفرة</small>
                    </span>
                  )}
                  <span className="sound-choice-label">{choice.label}</span>
                </button>
              );
            })}
          </div>
          {selectedChoiceId && (
            <p
              className={`sound-choice-feedback ${isCorrect ? "is-correct" : "is-try-again"}`}
              role="status"
              aria-live="polite"
            >
              {isCorrect
                ? "اختيار جميل! هذا يناسب المشهد."
                : "محاولة جميلة. هل نختار صورة أخرى؟"}
            </p>
          )}
          <MascotPlaceholder mood={isCorrect ? "cheer" : "welcome"} />
          {actionError && (
            <p className="form-message error-message" role="alert">
              {actionError}
            </p>
          )}
          {isCorrect && (
            <button
              className="button button-primary activity-primary-action"
              type="button"
              onClick={continueAfterCorrectChoice}
              disabled={pending}
            >
              {pending
                ? "جارٍ حفظ المشاركة…"
                : sceneIndex === scenes.length - 1
                  ? "إنهاء النشاط"
                  : "التالي"}
            </button>
          )}
        </section>
      ) : child && phase === "complete" ? (
        <section className="activity-state-panel activity-complete" role="status">
          <MascotPlaceholder mood="cheer" />
          <p className="eyebrow">أحسنت</p>
          <h1>أكملت المشاهد يا {child.name}!</h1>
          <p>شكرًا لمشاركتك واختيار الصور.</p>
          <div className="activity-actions">
            <button
              className="button button-primary"
              type="button"
              onClick={() => void playAgain()}
              disabled={pending}
            >
              {pending ? "جارٍ بدء نشاط جديد…" : "العب مرة تانية"}
            </button>
            <Link className="button button-secondary" to={childSpacePath}>
              العودة لأنشطة الطفل
            </Link>
          </div>
          <p className="activity-review-note">
            المشاركة ليست مقياسًا للتطور أو نتيجة علاجية.
          </p>
        </section>
      ) : null}
    </main>
  );
}
