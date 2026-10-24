import { useCallback, useEffect, useRef, useState } from "react";
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

type ActivityPhase = "ready" | "playing" | "complete";
type AudioState = "idle" | "playing" | "played" | "error";

const ACTIVITY_ID = "demo-picture-cards-audio";
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function getLoadError(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 401) {
    return "انتهت جلسة الدخول. سجّل الدخول مجددًا.";
  }
  if (error instanceof ApiRequestError && error.status === 404) {
    return "لم نتمكن من العثور على ملف الطفل أو النشاط.";
  }
  return getApiErrorMessage(error);
}

function getActionError(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 409) {
    return "تعذّر تحديث المشاركة. تحقّق من سجل النشاط وحاول مرة أخرى.";
  }
  return getApiErrorMessage(error);
}

function isMatchingSession(
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

function stopAudio(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

export function PictureCardsActivityPage() {
  const { retrySessionCheck } = useAuth();
  const { id } = useParams();
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<ActivityPhase>("ready");
  const [session, setSession] = useState<ActivitySession | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadActivity = useCallback(async (
    isCancelled: () => boolean = () => false,
  ) => {
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
        activitiesApi.list("picture-cards-audio"),
      ]);
      const foundActivity = activities.find(
        (item) =>
          item.id === ACTIVITY_ID &&
          item.activityType === "picture-cards-audio" &&
          item.availability === "available",
      );
      if (!foundActivity || foundActivity.items.length === 0) {
        if (!isCancelled()) {
          setChild(profile);
          setLoadError("النشاط غير متاح الآن. حاول مرة أخرى لاحقًا.");
        }
        return;
      }
      if (!isCancelled()) {
        setChild(profile);
        setActivity(foundActivity);
      }
    } catch (error) {
      if (!isCancelled()) {
        setLoadError(getLoadError(error));
        if (error instanceof ApiRequestError && error.status === 401) {
          void retrySessionCheck();
        }
      }
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, [id, retrySessionCheck]);

  useEffect(() => {
    let cancelled = false;
    void loadActivity(() => cancelled);
    return () => {
      cancelled = true;
      stopAudio(audioRef.current);
    };
  }, [loadActivity]);

  const cards = activity?.items ?? [];
  const currentCard = cards[cardIndex];
  const childSpacePath = child
    ? `/dashboard/children/${encodeURIComponent(child.id)}/space`
    : "/dashboard/children";

  function showActionError(error: unknown): string {
    if (error instanceof ApiRequestError && error.status === 401) {
      void retrySessionCheck();
      return "انتهت جلسة الدخول. سجّل الدخول مجددًا.";
    }
    if (error instanceof ApiRequestError && error.status === 404) {
      return "تعذّر العثور على ملف الطفل أو النشاط. ارجع إلى صفحة الطفل وحاول مجددًا.";
    }
    return getActionError(error);
  }

  async function startActivity() {
    if (!id || !activity) return;
    setPending(true);
    setActionError("");
    try {
      const { session: newSession } = await activitiesApi.startSession(
        id,
        activity.id,
      );
      if (!isMatchingSession(newSession, id, "in_progress")) {
        setActionError("لم نتأكد من حفظ جلسة هذا الطفل. حاول مرة أخرى.");
        return;
      }
      setSession(newSession);
      setCardIndex(0);
      setPhase("playing");
    } catch (error) {
      setActionError(showActionError(error));
    } finally {
      setPending(false);
    }
  }

  async function completeActivity() {
    if (!id || !session) return;
    stopAudio(audioRef.current);
    setAudioState("idle");
    setPending(true);
    setActionError("");
    try {
      const { session: completedSession } =
        await activitiesApi.completeSession(id, session.id);
      if (!isMatchingSession(completedSession, id, "completed")) {
        setActionError("لم نتأكد من حفظ إكمال النشاط. يمكنك إعادة المحاولة.");
        return;
      }
      setSession(completedSession);
      setPhase("complete");
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        try {
          const { sessions } = await activitiesApi.listSessions(id);
          const savedSession = sessions.find(
            (item) =>
              item.id === session.id &&
              isMatchingSession(item, id, "completed"),
          );
          if (savedSession) {
            setSession(savedSession);
            setPhase("complete");
            return;
          }
        } catch {
          // Keep the unsaved state and show the original completion failure.
        }
      }
      setActionError(showActionError(error));
    } finally {
      setPending(false);
    }
  }

  async function playAudio(item: ActivityItem) {
    if (!item.audioAsset) return;
    stopAudio(audioRef.current);
    setAudioState("idle");
    setActionError("");

    const audio = new Audio(item.audioAsset);
    audioRef.current = audio;
    audio.onended = () => setAudioState("played");
    audio.onerror = () => {
      setAudioState("error");
    };

    try {
      await audio.play();
      setAudioState("playing");
    } catch {
      setAudioState("error");
    }
  }

  function moveToNextCard() {
    stopAudio(audioRef.current);
    setAudioState("idle");
    setActionError("");
    setCardIndex((index) => Math.min(index + 1, cards.length - 1));
  }

  async function repeatActivity() {
    setPhase("ready");
    setSession(null);
    setCardIndex(0);
    setActionError("");
    await startActivity();
  }

  function handleImageError(itemId: string) {
    setFailedImageIds((existing) => new Set(existing).add(itemId));
  }

  return (
    <main className="dashboard-page activity-page" dir="rtl">
      <header className="dashboard-header">
        <Link className="dashboard-brand" to="/dashboard">
          <BrandMark small />
          <span>حَرْف</span>
        </Link>
        <Link className="button button-quiet" to={childSpacePath}>
          العودة إلى مساحة الطفل
        </Link>
      </header>

      {loading ? (
        <section className="activity-state-panel" role="status" aria-live="polite">
          جارٍ تحميل النشاط…
        </section>
      ) : loadError ? (
        <section className="activity-state-panel" aria-labelledby="activity-error-title">
          <h1 id="activity-error-title">تعذّر فتح النشاط</h1>
          <p className="form-message error-message" role="alert">{loadError}</p>
          {loadError.includes("انتهت جلسة الدخول") ? (
            <Link className="button button-primary" to="/login">
              تسجيل الدخول مجددًا
            </Link>
          ) : (
            <div className="activity-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={() => void loadActivity()}
              >
                إعادة المحاولة
              </button>
              <Link className="button button-secondary" to={childSpacePath}>
                العودة إلى مساحة الطفل
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
          <p>{activity.instructions[0] ?? "انظر إلى الصورة واستمع للكلمة."}</p>
          <p className="activity-review-note">
            المحتوى توضيحي فقط، ولم تتم مراجعته سريريًا. التسجيلات الصوتية
            العربية غير متوفرة حاليًا؛ سيظهر زر الاستماع عند إضافة تسجيل معتمد.
          </p>
          {actionError && (
            <p className="form-message error-message" role="alert">{actionError}</p>
          )}
          <button
            className="button button-primary activity-primary-action"
            type="button"
            onClick={() => void startActivity()}
            disabled={pending}
          >
            {pending ? "جارٍ بدء النشاط…" : "ابدأ"}
          </button>
        </section>
      ) : child && activity && phase === "playing" && currentCard ? (
        <section className="activity-play-panel" aria-labelledby="activity-title">
          <div className="activity-play-heading">
            <div>
              <p className="eyebrow">مساحة {child.name}</p>
              <h1 id="activity-title">{activity.title}</h1>
            </div>
            <span className="activity-card-position" aria-label={`البطاقة ${cardIndex + 1} من ${cards.length}`}>
              {cardIndex + 1} / {cards.length}
            </span>
          </div>
          <p className="activity-gentle-prompt">
            أحسنت المحاولة! انظر إلى الصورة براحتك.
          </p>
          <article
            className="picture-card"
            aria-live="polite"
            key={currentCard.id}
          >
            <div className="picture-card-image">
              {currentCard.imageAsset &&
              !failedImageIds.has(currentCard.id) ? (
                <img
                  src={currentCard.imageAsset}
                  alt={`صورة توضيحية: ${currentCard.label}`}
                  onError={() => handleImageError(currentCard.id)}
                />
              ) : (
                <div className="picture-card-image-fallback" role="img" aria-label={`لا تتوفر صورة لـ ${currentCard.label}`}>
                  <span>{currentCard.label}</span>
                  <small>الصورة غير متوفرة</small>
                </div>
              )}
            </div>
            <h2>{currentCard.label}</h2>
            {currentCard.audioAsset ? (
              <button
                className="button button-primary activity-audio-button"
                type="button"
                onClick={() => void playAudio(currentCard)}
              >
                <span aria-hidden="true">▶</span> اسمع الكلمة
              </button>
            ) : (
              <button
                className="button button-secondary activity-audio-button"
                type="button"
                disabled
                aria-label="اسمع الكلمة — التسجيل الصوتي غير متوفر"
              >
                التسجيل الصوتي غير متوفر
              </button>
            )}
            {currentCard.audioAsset && (
              <p className="activity-audio-status" role="status" aria-live="polite">
                {audioState === "playing"
                  ? "يُشغّل التسجيل الآن."
                  : audioState === "played"
                    ? "انتهى التسجيل، يمكنك الاستماع مرة أخرى."
                    : audioState === "error"
                      ? "تعذّر تشغيل التسجيل. تحقق من ملف الصوت وحاول مرة أخرى."
                      : "يمكنك الاستماع أكثر من مرة."}
              </p>
            )}
          </article>
          <MascotPlaceholder mood="cheer" />
          <p className="activity-encouragement">شكرًا لمشاركتك، أنت رائع!</p>
          {actionError && (
            <p className="form-message error-message" role="alert">{actionError}</p>
          )}
          <div className="activity-actions">
            {cardIndex < cards.length - 1 ? (
              <button
                className="button button-primary activity-primary-action"
                type="button"
                onClick={moveToNextCard}
              >
                التالي
              </button>
            ) : (
              <button
                className="button button-primary activity-primary-action"
                type="button"
                onClick={() => void completeActivity()}
                disabled={pending}
              >
                {pending ? "جارٍ حفظ المشاركة…" : "إنهاء النشاط"}
              </button>
            )}
          </div>
        </section>
      ) : child && phase === "complete" ? (
        <section className="activity-state-panel activity-complete" role="status">
          <MascotPlaceholder mood="cheer" />
          <p className="eyebrow">أحسنت</p>
          <h1>شكرًا لمشاركتك يا {child.name}!</h1>
          <p>انتهى النشاط، شكرًا لأنك جرّبت البطاقات.</p>
          <div className="activity-actions">
            <button
              className="button button-primary"
              type="button"
              onClick={() => void repeatActivity()}
              disabled={pending}
            >
              {pending ? "جارٍ بدء نشاط جديد…" : "أعد النشاط"}
            </button>
            <Link className="button button-secondary" to={childSpacePath}>
              العودة إلى أنشطة الطفل
            </Link>
          </div>
          <p className="activity-review-note">
            تم حفظ المشاركة لهذا الملف فقط. المشاركة ليست مقياسًا للتطور اللغوي.
          </p>
        </section>
      ) : null}
    </main>
  );
}
