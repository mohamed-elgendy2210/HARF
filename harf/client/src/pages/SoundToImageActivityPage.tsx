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

const ACTIVITY_ID = "demo-sound-to-image";
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

type Phase = "ready" | "playing" | "complete";
type AudioState = "idle" | "playing" | "played" | "error";

function getErrorMessage(error: unknown): string {
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

function isValidItem(item: ActivityItem): boolean {
  return (
    typeof item.spokenWord === "string" &&
    item.spokenWord.trim().length > 0 &&
    typeof item.correctChoiceId === "string" &&
    Boolean(item.audioAsset) &&
    Array.isArray(item.choices) &&
    item.choices.length >= 2 &&
    item.choices.length <= 3 &&
    item.choices.some((choice) => choice.id === item.correctChoiceId) &&
    item.choices.every((choice) => Boolean(choice.imageAsset))
  );
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

export function SoundToImageActivityPage() {
  const { retrySessionCheck } = useAuth();
  const { id } = useParams();
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [missingAudioAssets, setMissingAudioAssets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [phase, setPhase] = useState<Phase>("ready");
  const [session, setSession] = useState<ActivitySession | null>(null);
  const [itemIndex, setItemIndex] = useState(0);
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [selectedChoiceId, setSelectedChoiceId] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [failedImages, setFailedImages] = useState<Set<string>>(
    () => new Set(),
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [retryToken, setRetryToken] = useState(0);

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
      setMissingAudioAssets([]);
      try {
        const [{ child: profile }, { activities }] = await Promise.all([
          childrenApi.get(id),
          activitiesApi.list("sound-to-image"),
        ]);
        const definition = activities.find(
          (candidate) =>
            candidate.id === ACTIVITY_ID &&
            candidate.activityType === "sound-to-image" &&
            candidate.availability === "available",
        );
        if (!definition || definition.items.length === 0) {
          if (!isCancelled()) {
            setLoadError("النشاط غير متاح الآن. حاول مرة أخرى لاحقًا.");
          }
          return;
        }
        const unavailableAssets = await Promise.all(
          definition.items.map(async (item) => {
            if (!isValidItem(item) || !item.audioAsset) return item.audioAsset ?? item.id;
            try {
              const assetUrl = new URL(item.audioAsset, window.location.origin);
              if (assetUrl.origin !== window.location.origin) return item.audioAsset;
              const response = await fetch(assetUrl, {
                method: "HEAD",
                cache: "no-store",
              });
              const contentType =
                response.headers.get("content-type")?.toLowerCase() ?? "";
              return response.ok && contentType.startsWith("audio/")
                ? null
                : item.audioAsset;
            } catch {
              return item.audioAsset;
            }
          }),
        );
        if (!isCancelled()) {
          setChild(profile);
          setActivity(definition);
          setMissingAudioAssets(
            unavailableAssets.filter((asset): asset is string => asset !== null),
          );
        }
      } catch (error) {
        if (!isCancelled()) {
          setLoadError(getErrorMessage(error));
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
      stopAudio(audioRef.current);
    };
  }, [loadActivity, retryToken]);

  const items = activity?.items ?? [];
  const currentItem = items[itemIndex];
  const currentChoices = currentItem?.choices ?? [];
  const allItemsReady = items.length > 0 && items.every(isValidItem);
  const canStart = allItemsReady && missingAudioAssets.length === 0;
  const selectedCorrectly = Boolean(
    currentItem && selectedChoiceId === currentItem.correctChoiceId,
  );
  const canChoose = audioState === "played" && !pending && !selectedCorrectly;
  const childSpacePath = child
    ? `/dashboard/children/${encodeURIComponent(child.id)}/space`
    : "/dashboard/children";

  async function startActivity() {
    if (!id || !activity || !canStart) return;
    setPending(true);
    setActionError("");
    try {
      const { session: started } = await activitiesApi.startSession(
        id,
        activity.id,
      );
      if (!isMatchingSession(started, id, "in_progress")) {
        setActionError("لم نتأكد من حفظ مشاركة هذا الطفل. حاول مرة أخرى.");
        return;
      }
      setSession(started);
      setItemIndex(0);
      setSelectedChoiceId("");
      setAudioState("idle");
      setPhase("playing");
    } catch (error) {
      setActionError(getErrorMessage(error));
      if (error instanceof ApiRequestError && error.status === 401) {
        void retrySessionCheck();
      }
    } finally {
      setPending(false);
    }
  }

  async function replayWord() {
    if (!currentItem?.audioAsset) return;
    stopAudio(audioRef.current);
    setAudioState("idle");
    setSelectedChoiceId("");
    setActionError("");

    const audio = new Audio(currentItem.audioAsset);
    audioRef.current = audio;
    audio.onended = () => setAudioState("played");
    audio.onerror = () => setAudioState("error");

    try {
      await audio.play();
      setAudioState("playing");
    } catch {
      setAudioState("error");
    }
  }

  function selectChoice(choiceId: string) {
    if (!canChoose || selectedChoiceId === choiceId) return;
    setSelectedChoiceId(choiceId);
  }

  async function completeActivity() {
    if (!id || !session) return;
    stopAudio(audioRef.current);
    setAudioState("idle");
    setPending(true);
    setActionError("");
    try {
      const { session: completed } = await activitiesApi.completeSession(
        id,
        session.id,
      );
      if (!isMatchingSession(completed, id, "completed")) {
        setActionError("لم نتأكد من حفظ إكمال النشاط. حاول مرة أخرى.");
        return;
      }
      setSession(completed);
      setPhase("complete");
    } catch (error) {
      setActionError(getErrorMessage(error));
      if (error instanceof ApiRequestError && error.status === 401) {
        void retrySessionCheck();
      }
    } finally {
      setPending(false);
    }
  }

  function moveToNextItem() {
    if (itemIndex === items.length - 1) {
      void completeActivity();
      return;
    }
    stopAudio(audioRef.current);
    setAudioState("idle");
    setSelectedChoiceId("");
    setActionError("");
    setItemIndex((index) => index + 1);
  }

  async function playAgain() {
    setPhase("ready");
    setSession(null);
    setItemIndex(0);
    setSelectedChoiceId("");
    setAudioState("idle");
    await startActivity();
  }

  function recordImageFailure(imageKey: string) {
    setFailedImages((current) => new Set(current).add(imageKey));
  }

  function choiceFeedback(): { message: string; isCorrect: boolean } | null {
    if (!currentItem || !selectedChoiceId) return null;
    const isCorrect = selectedChoiceId === currentItem.correctChoiceId;
    return {
      isCorrect,
      message: isCorrect
        ? "أحسنت الاختيار! لنكمل معًا."
        : "محاولة جميلة. تعالى نسمعها تاني.",
    };
  }

  const feedback = choiceFeedback();

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
                onClick={() => setRetryToken((value) => value + 1)}
              >
                إعادة المحاولة
              </button>
              <Link className="button button-secondary" to={childSpacePath}>
                العودة إلى أنشطة الطفل
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
          <p>{activity.instructions[0] ?? "اسمع الكلمة واختار الصورة."}</p>
          <p className="activity-review-note">
            الكلمات والصور تجريبية وتحتاج إلى مراجعة مختص. المشاركة ليست
            تقييمًا أو علاجًا.
          </p>
          {!canStart && (
            <p className="form-message error-message" role="status">
              {allItemsReady
                ? `التسجيلات الصوتية العربية غير متوفرة بعد (${missingAudioAssets.length} ملفات). لن نبدأ النشاط أو نحفظ مشاركة قبل إضافتها.`
                : "بيانات النشاط أو اختيارات الصور غير مكتملة؛ لن نبدأ النشاط قبل التحقق منها."}
            </p>
          )}
          {actionError && (
            <p className="form-message error-message" role="alert">{actionError}</p>
          )}
          <button
            className="button button-primary activity-primary-action"
            type="button"
            onClick={() => void startActivity()}
            disabled={pending || !canStart}
          >
            {pending
              ? "جارٍ بدء النشاط…"
              : canStart
                ? "ابدأ"
                : "النشاط غير متاح بعد"}
          </button>
        </section>
      ) : child && activity && phase === "playing" && currentItem ? (
        <section className="activity-play-panel" aria-labelledby="sound-activity-title">
          <div className="activity-play-heading">
            <div>
              <p className="eyebrow">مساحة {child.name}</p>
              <h1 id="sound-activity-title">{activity.title}</h1>
            </div>
            <span
              className="activity-card-position"
              aria-label={`السؤال ${itemIndex + 1} من ${items.length}`}
            >
              {itemIndex + 1} / {items.length}
            </span>
          </div>
          <p className="activity-gentle-prompt">اسمع الكلمة واختار الصورة.</p>
          <button
            className="button button-primary activity-audio-button"
            type="button"
            onClick={() => void replayWord()}
            disabled={audioState === "playing" || pending}
          >
            <span aria-hidden="true">▶</span>
            {audioState === "played" || audioState === "error"
              ? "اسمع الكلمة مرة تانية"
              : "اسمع الكلمة"}
          </button>
          <p className="activity-audio-status" role="status" aria-live="polite">
            {audioState === "playing"
              ? "استمع للكلمة، ثم اختر الصورة."
              : audioState === "played"
                ? "يمكنك الاختيار أو الاستماع مرة أخرى."
                : audioState === "error"
                  ? "تعذّر تشغيل التسجيل. تحقق من ملف الصوت وحاول مرة أخرى."
                  : "اضغط للاستماع قبل اختيار الصورة."}
          </p>
          <div
            className="sound-choice-grid"
            role="group"
            aria-label="اختر الصورة المناسبة للكلمة المسموعة"
          >
            {currentChoices.map((choice) => {
              const isSelected = selectedChoiceId === choice.id;
              const isCorrect = choice.id === currentItem.correctChoiceId;
              const imageKey = `${currentItem.id}-${choice.id}`;
              return (
                <button
                  className={[
                    "sound-choice",
                    isSelected && feedback?.isCorrect && "is-correct",
                    isSelected && feedback && !feedback.isCorrect && "is-try-again",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="button"
                  key={choice.id}
                  onClick={() => selectChoice(choice.id)}
                  disabled={!canChoose || selectedChoiceId === choice.id}
                  aria-label={`اختيار صورة ${choice.label}`}
                  aria-pressed={isSelected}
                  data-correct-choice={isCorrect ? "true" : undefined}
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
          {feedback && (
            <p
              className={`sound-choice-feedback ${feedback.isCorrect ? "is-correct" : "is-try-again"}`}
              role="status"
              aria-live="polite"
            >
              {feedback.message}
            </p>
          )}
          <MascotPlaceholder mood={feedback?.isCorrect ? "cheer" : "welcome"} />
          {actionError && (
            <p className="form-message error-message" role="alert">{actionError}</p>
          )}
          {feedback?.isCorrect && (
            <button
              className="button button-primary activity-primary-action"
              type="button"
              onClick={moveToNextItem}
              disabled={pending}
            >
              {itemIndex === items.length - 1 ? "إنهاء النشاط" : "التالي"}
            </button>
          )}
        </section>
      ) : child && phase === "complete" ? (
        <section className="activity-state-panel activity-complete" role="status">
          <MascotPlaceholder mood="cheer" />
          <p className="eyebrow">أحسنت</p>
          <h1>شكرًا لمشاركتك يا {child.name}!</h1>
          <p>انتهى النشاط، شكرًا لأنك استمعت وحاولت.</p>
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
            المشاركة ليست مقياسًا للتطور اللغوي أو نتيجة علاجية.
          </p>
        </section>
      ) : null}
    </main>
  );
}
