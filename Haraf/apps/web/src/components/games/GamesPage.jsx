import { useEffect, useMemo, useRef, useState } from 'react';
import AuthPanel from '../AuthPanel.jsx';
import BrandLogo from '../BrandLogo.jsx';
import { apiRequest, getApiUrl, setCsrfToken } from '../../lib/api.js';
import {
  GameAnswerOptions,
  GameAudio,
  GameCompletion,
  GameBackgroundAudio,
  GameCompanion,
  GameFeedback,
  GameImage,
  GameInstructions,
  GameProgress
} from './GameComponents.jsx';
import { playGameAudio, stopGameAudio } from '../../lib/gameAudio.js';
import SpatialGameActivity from './SpatialGameActivity.jsx';

const gameNames = {
  'first-letter-trial': 'رحلة الحرف الأول',
  'word-sounds': 'فقاعات الأصوات',
  'word-match': 'صندوق الكلمات',
  'spatial-relationships': 'فين المكان؟'
};

function routeGameId() {
  const match = window.location.pathname.match(/^\/games\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function gameHref(gameId, childId) {
  const query = childId ? `?childId=${encodeURIComponent(childId)}` : '';
  return `/games/${encodeURIComponent(gameId)}${query}`;
}

function shuffledIndexes(length) {
  const indexes = Array.from({ length }, (_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }
  if (indexes.length > 1 && indexes.every((value, index) => value === index)) {
    indexes.push(indexes.shift());
  }
  return indexes;
}

function GameHeader({ backHref = '/games', showAuth = true, immersive = false, onBack, logoUrl = null }) {
  return (
    <header className={`game-page__header${immersive ? ' game-page__header--immersive' : ''}`}>
      <a className="button button--small button--outline" href={backHref} onClick={onBack}>العودة</a>
      {immersive ? <strong>عالم حرف للتعلّم واللعب</strong> : <BrandLogo compact homeHref="/" logoUrl={logoUrl} />}
      {showAuth && <AuthPanel />}
    </header>
  );
}

function GameCatalog({ settings }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const childId = new URLSearchParams(window.location.search).get('childId') ?? '';

  useEffect(() => {
    let active = true;
    apiRequest('/api/v1/games')
      .then(({ games: catalog }) => {
        if (active) setGames(catalog);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="game-page game-page--catalog" style={{
      '--blue': settings.colors.primary,
      '--teal': settings.colors.teal,
      '--purple': settings.colors.purple,
      '--yellow': settings.colors.yellow,
      '--coral': settings.colors.coral,
      '--ink': settings.colors.ink ?? '#273DA8',
      '--muted': settings.colors.muted ?? '#7884B5'
    }}>
      <GameHeader backHref="/" logoUrl={settings.logoUrl} />
      <main className="game-page__main">
        <header className="game-page__intro">
          <span className="dashboard-eyebrow">حرف · ألعاب تعليمية</span>
          <h1>اختاروا لعبة وابدأوا معًا</h1>
          <p>أنشطة قصيرة للتدرب على أصوات الحروف والكلمات. النتائج تعليمية وليست تشخيصًا.</p>
        </header>
        {loading && <p className="dashboard-loading" role="status">جارٍ تحميل الألعاب…</p>}
        {error && <p className="game-error" role="alert">{error}</p>}
        {!loading && !error && (
          <div className="game-catalog" aria-label="الألعاب المتاحة">
            {games.map((game) => (
              <article className={`game-card${game.access === 'trial' ? ' game-card--trial' : ''}`} key={game.id}>
                <span className="game-card__animal" aria-hidden="true">{game.companionAnimal}</span>
                <span className="game-card__tag">{game.access === 'trial' ? 'مجانية للزوار' : 'لولي الأمر'}</span>
                <h2>{game.title}</h2>
                <p>{game.description}</p>
                <span className="game-card__meta">{game.questionCount} أسئلة قصيرة · {game.companion}</span>
                <a className="button button--primary" href={gameHref(game.id, childId)}>
                  {game.access === 'trial' ? 'جرّب اللعبة' : 'ابدأ النشاط'}
                </a>
                {game.access !== 'trial' && (
                  <small>يتطلب حساب ولي أمر معتمدًا، وموافقة حفظ بيانات التعلّم لحفظ النتيجة.</small>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function GamePlay({ gameId }) {
  const [game, setGame] = useState(null);
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [hasConsent, setHasConsent] = useState(false);
  const [activityAccess, setActivityAccess] = useState('checking');
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answerResults, setAnswerResults] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [spatialCompanionState, setSpatialCompanionState] = useState('');
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [matchedPairs, setMatchedPairs] = useState([]);
  const [selectedMatchLeft, setSelectedMatchLeft] = useState(null);
  const [selectedMatchRight, setSelectedMatchRight] = useState(null);
  const [matchingMessage, setMatchingMessage] = useState('');
  const [rightPairOrder, setRightPairOrder] = useState([]);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [savingAttempt, setSavingAttempt] = useState(false);
  const [completion, setCompletion] = useState(null);
  const [nextActivity, setNextActivity] = useState(null);
  const [saved, setSaved] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const startedAt = useRef(0);
  const submissionId = useRef('');
  const completionRequestInFlight = useRef(false);
  const attemptAlreadySaved = useRef(false);
  const answerRequestInFlight = useRef(false);
  const nextQuestionRef = useRef(null);
  const requestedChildId = useMemo(
    () => new URLSearchParams(window.location.search).get('childId') ?? '',
    []
  );

  useEffect(() => {
    if (!completion) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [completion]);

  useEffect(() => {
    if (game?.template !== 'picture-matching' || !feedback || completion) return undefined;
    const timer = window.setTimeout(() => {
      setFeedback(null);
      setSelectedMatchLeft(null);
      setSelectedMatchRight(null);
      setMatchingMessage('');
    }, feedback.correct ? 750 : 1100);
    return () => window.clearTimeout(timer);
  }, [game?.template, feedback, completion]);

  useEffect(() => {
    let active = true;
    async function loadGame() {
      setLoading(true);
      setError('');
      try {
        const { game: loadedGame } = await apiRequest(`/api/v1/games/${encodeURIComponent(gameId)}`);
        if (!active) return;
        setGame(loadedGame);

        if (loadedGame.access === 'trial') return;

        const session = await apiRequest('/api/v1/auth/session');
        if (session.csrfToken) setCsrfToken(session.csrfToken);
        const result = await apiRequest('/api/v1/children');
        if (!active) return;
        const activeChildren = result.children.filter((child) => child.status === 'active');
        setChildren(activeChildren);
        setSelectedChildId(activeChildren.some((child) => child.id === requestedChildId)
          ? requestedChildId
          : activeChildren[0]?.id ?? '');
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadGame();
    return () => {
      active = false;
    };
  }, [gameId, requestedChildId]);

  useEffect(() => {
    if (!selectedChildId || game?.access !== 'parent') {
      setHasConsent(false);
      setActivityAccess(game?.access === 'trial' ? 'available' : 'checking');
      return undefined;
    }
    let active = true;
    setActivityAccess('checking');
    setHasConsent(false);
    setError('');
    Promise.all([
      apiRequest(`/api/v1/children/${selectedChildId}/consents`),
      apiRequest(`/api/v1/games/${encodeURIComponent(gameId)}?childId=${encodeURIComponent(selectedChildId)}`)
    ])
      .then(([{ consents }]) => {
        if (!active) return;
        setHasConsent(consents.some((consent) => consent.consentType === 'learning_data' && consent.granted));
        setActivityAccess('available');
      })
      .catch((requestError) => {
        if (!active) return;
        setActivityAccess(requestError.status === 409
          ? 'locked'
          : requestError.status === 403 ? 'consent-required' : 'unavailable');
        if (requestError.status !== 403 && requestError.status !== 409) setError(requestError.message);
      });
    return () => {
      active = false;
    };
  }, [game, gameId, selectedChildId]);

  const isTrial = game?.access === 'trial';
  const currentQuestion = game?.questions[questionIndex];
  const companionState = feedback
    ? feedback.correct ? 'correct' : 'encouragement'
    : submittingAnswer ? 'thinking'
      : game?.template === 'spatial-relationships' && spatialCompanionState
        ? spatialCompanionState
      : game?.template === 'audio-choice' && !audioPlayed ? 'listening'
        : started ? 'reading' : 'idle';

  const startGame = () => {
    stopGameAudio();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setError('');
    setAnswerResults([]);
    setFeedback(null);
    setSpatialCompanionState('listening');
    setAudioPlayed(false);
    setAudioFailed(false);
    setMatchedPairs([]);
    setSelectedMatchLeft(null);
    setSelectedMatchRight(null);
    setMatchingMessage('');
    setRightPairOrder(game?.template === 'picture-matching' ? shuffledIndexes(game.questions.length) : []);
    submissionId.current = crypto.randomUUID();
    completionRequestInFlight.current = false;
    attemptAlreadySaved.current = false;
    setQuestionIndex(0);
    setCompletion(null);
    setNextActivity(null);
    setSaved(false);
    startedAt.current = Date.now();
    setStarted(true);
  };

  const selectAnswer = async (answerIndex, targetQuestionIndex = questionIndex) => {
    if (submittingAnswer || answerRequestInFlight.current || feedback) return;
    if (answerIndex === -1) {
      setAnswerResults((current) => {
        const next = [...current];
        next[targetQuestionIndex] = false;
        return next;
      });
    }
    answerRequestInFlight.current = true;
    setSubmittingAnswer(true);
    setError('');
    try {
      const { answer } = await apiRequest(`/api/v1/games/${encodeURIComponent(gameId)}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionIndex: targetQuestionIndex,
          answerIndex,
          gameVersion: game.version,
          submissionId: submissionId.current,
          ...(!isTrial ? { childId: selectedChildId } : {})
        })
      });
      setAnswerResults((current) => {
        const next = [...current];
        next[targetQuestionIndex] = answer.correct;
        return next;
      });
      setFeedback({ ...answer, answerIndex, skipped: answerIndex === -1 });
      if (!muted) {
        const feedbackAudio = game.assets?.[answer.correct ? 'correct' : 'encouragement']?.audioUrl;
        if (feedbackAudio) playGameAudio(feedbackAudio);
      }
      if (answer.correct && game.template === 'matching-pairs') {
        setMatchedPairs((current) => [...new Set([...current, answerIndex])]);
      }
      if (game.template === 'picture-matching') {
        if (answer.correct) {
          setMatchedPairs((current) => [...new Set([...current, targetQuestionIndex])]);
        }
      }
    } catch (requestError) {
      setError(requestError.message);
      if (game.template === 'picture-matching') setSelectedMatchLeft(null);
    } finally {
      answerRequestInFlight.current = false;
      setSubmittingAnswer(false);
    }
  };

  const completeGame = async () => {
    if (completionRequestInFlight.current || attemptAlreadySaved.current) return;
    const durationSeconds = Math.min(3600, Math.max(0, Math.round((Date.now() - startedAt.current) / 1000)));
    if (isTrial) {
      attemptAlreadySaved.current = true;
      const totalQuestions = game.template === 'spatial-relationships'
        ? game.spatial.steps.length
        : game.questions.length;
      setCompletion({
        correctCount: answerResults.filter(Boolean).length,
        totalQuestions,
        scorePercent: Math.round((answerResults.filter(Boolean).length / totalQuestions) * 100),
        companion: game.companion,
        companionAnimal: game.companionAnimal,
        instructions: game.instructions,
        assets: game.assets
      });
      setNextActivity(null);
      return;
    }

    completionRequestInFlight.current = true;
    setSavingAttempt(true);
    setError('');
    try {
      const { attempt } = await apiRequest(`/api/v1/games/${encodeURIComponent(gameId)}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childId: selectedChildId,
          submissionId: submissionId.current,
          gameVersion: game.version,
          durationSeconds
        })
      });
      attemptAlreadySaved.current = true;
      setSaved(true);
      try {
        const { progress } = await apiRequest(`/api/v1/children/${encodeURIComponent(selectedChildId)}/learning-progress`);
        const activities = progress.paths.flatMap((path) => path.activities);
        setNextActivity(activities.find((activity) => (
          activity.status === 'available' && activity.gameId !== gameId
        )) ?? null);
      } catch (progressError) {
        setError(`تم حفظ المحاولة، لكن تعذر تحميل النشاط التالي: ${progressError.message}`);
      }
      setCompletion({
        correctCount: attempt.correctCount,
        totalQuestions: attempt.totalQuestions,
        scorePercent: Math.round((attempt.correctCount / attempt.totalQuestions) * 100),
        companion: game.companion,
        companionAnimal: game.companionAnimal,
        instructions: game.instructions,
        assets: game.assets
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      completionRequestInFlight.current = false;
      setSavingAttempt(false);
    }
  };

  const nextQuestion = () => {
    stopGameAudio();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (questionIndex + 1 === game.questions.length) {
      void completeGame();
      return;
    }
    setQuestionIndex((current) => current + 1);
    setMatchedPairs([]);
    setSelectedMatchLeft(null);
    setFeedback(null);
    setAudioPlayed(false);
    setAudioFailed(false);
  };

  useEffect(() => {
    nextQuestionRef.current = nextQuestion;
  }, [nextQuestion]);

  useEffect(() => {
    if (!feedback || !game || game.template === 'picture-matching') return undefined;
    const timer = window.setTimeout(
      () => nextQuestionRef.current?.(),
      feedback.correct ? 1400 : 1800
    );
    return () => window.clearTimeout(timer);
  }, [feedback, game, questionIndex]);

  const completePictureMatching = (leftIndex, rightIndex) => {
    if (submittingAnswer || answerRequestInFlight.current || feedback || matchedPairs.includes(leftIndex)) return;
    if (leftIndex === null) {
      setMatchingMessage('اختار صورة من المجموعة الأولى ثم ابحث عن مثيلتها.');
      return;
    }
    if (matchedPairs.includes(rightIndex)) return;
    setSelectedMatchRight(rightIndex);
    void selectAnswer(rightIndex, leftIndex);
  };

  useEffect(() => {
    if (game?.template !== 'picture-matching' || !started
      || matchedPairs.length !== game.questions.length || completion) return;
    void completeGame();
  }, [game, started, matchedPairs, completion]);

  return (
    <div className="game-page game-page--play">
      <GameHeader
        backHref={isTrial ? '/games' : '/dashboard'}
        showAuth={false}
        immersive
        onBack={(event) => {
          if (started && !completion && !window.confirm('لم تُحفظ نتيجة هذا النشاط بعد. هل تريد الخروج الآن؟')) {
            event.preventDefault();
            return;
          }
          stopGameAudio();
          if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        }}
      />
      <main className="game-page__main game-page__main--play game-world">
        <div className="game-world__toolbar">
          <span>{selectedChildId ? `نلعب مع ${children.find((child) => child.id === selectedChildId)?.displayName ?? 'صديقنا'}` : 'مساحة لعب آمنة'}</span>
          <button type="button" className="button button--small button--outline"
            aria-pressed={muted} onClick={() => {
              const nextMuted = !muted;
              setMuted(nextMuted);
              if (nextMuted) {
                stopGameAudio();
                if ('speechSynthesis' in window) window.speechSynthesis.cancel();
              }
            }}>
            {muted ? 'تشغيل الصوت' : 'كتم الصوت'}
          </button>
        </div>
        {loading && <p className="dashboard-loading" role="status">جارٍ تجهيز اللعبة…</p>}
        {!loading && error && !game && (
          <section className="game-message-card" role="alert">
            <h1>تعذر فتح اللعبة</h1>
            <p>{error === 'Sign in to continue.'
              ? 'تحتاج الألعاب المخصصة للأسر إلى تسجيل دخول ولي أمر معتمد.'
              : error}</p>
            <div className="game-message-card__actions">
              <a className="button button--outline" href="/">العودة للموقع وتسجيل الدخول</a>
              <a className="button button--primary" href="/games">الألعاب المتاحة للزوار</a>
            </div>
          </section>
        )}
        {game && (
          <>
            <header className="game-play__heading">
              <span className="dashboard-eyebrow">{isTrial ? 'لعبة تجريبية مجانية' : 'نشاط لملف الطفل'}</span>
              <h1>{game.title}</h1>
              <p>{game.description}</p>
            </header>
            {!isTrial && !started && !completion && (
              <section className="game-child-select">
                {children.length === 0
                  ? <p>لا يوجد ملف طفل نشط للعب. أنشئ ملفًا أو أعد تفعيل ملف من لوحة الأسرة.</p>
                  : (
                    <label>اللعب لملف الطفل
                      <select value={selectedChildId} onChange={(event) => setSelectedChildId(event.target.value)}>
                        {children.map((child) => (
                          <option value={child.id} key={child.id}>{child.displayName}</option>
                        ))}
                      </select>
                    </label>
                  )}
                {children.length > 0 && !hasConsent && (
                  <p className="game-consent-note" role="status">
                    يلزم منح موافقة «حفظ أنشطة التعلّم» من ملف الطفل قبل حفظ نتيجة هذا النشاط.
                    <a href="/dashboard">إدارة الموافقات</a>
                  </p>
                )}
                {activityAccess === 'checking' && <p className="dashboard-loading" role="status">جارٍ التحقق من ترتيب النشاط…</p>}
                {activityAccess === 'locked' && (
                  <p className="game-consent-note" role="status">
                    هذا النشاط قادم في المسار. أكملوا النشاط المتاح أولًا، ويمكنكم تكرار الأنشطة السابقة.
                  </p>
                )}
              </section>
            )}
            {completion ? (
              <GameCompletion
                result={completion}
                isTrial={isTrial}
                onCompanionState={setSpatialCompanionState}
                saved={saved}
                muted={muted}
                nextActivity={nextActivity}
                childId={selectedChildId}
                onReplay={startGame}
                onReturn={isTrial ? '/games' : `/dashboard?childId=${encodeURIComponent(selectedChildId)}`}
              />
            ) : (
              <div className={`game-stage${started ? ' game-stage--active' : ' game-stage--welcome'}`}>
                <GameCompanion
                  animal={game.companionAnimal}
                  name={game.companion}
                  state={started ? companionState : 'welcome'}
                  imageUrl={started
                    ? game.assets?.[feedback?.correct ? 'correct' : feedback ? 'encouragement' : 'listening']?.imageUrl
                    : game.assets?.welcome?.imageUrl}
                  animationUrl={game.assets?.[feedback?.correct ? 'correct' : feedback ? 'encouragement' : 'listening']?.animationUrl}
                />
                <div className="game-stage__content" key={started ? questionIndex : 'welcome'}>
                    <GameBackgroundAudio
                      audioUrl={game.assets?.background?.audioUrl}
                      active={started && !completion && !feedback && !submittingAnswer && !savingAttempt}
                      muted={muted}
                    />
                    {!started ? (
                    <GameInstructions
                      game={game}
                      disabled={!isTrial && (!selectedChildId || !hasConsent || activityAccess !== 'available')}
                      audioEnabled
                      muted={muted}
                      onStart={startGame}
                    />
                  ) : (
                      game.template === 'spatial-relationships' ? (
                      <SpatialGameActivity
                        game={game}
                        gameId={gameId}
                        childId={selectedChildId}
                        submissionId={submissionId.current}
                        muted={muted}
                        isTrial={isTrial}
                        onCompanionState={setSpatialCompanionState}
                        onStepComplete={(stepIndex) => setAnswerResults((current) => {
                          const next = [...current];
                          next[stepIndex] = true;
                          return next;
                        })}
                        onComplete={() => void completeGame()}
                      />
                    ) : <section className="game-activity" aria-labelledby="game-question">
                    <GameProgress
                      current={game.template === 'picture-matching' ? matchedPairs.length : questionIndex + 1}
                      total={game.questions.length}
                      label={game.template === 'picture-matching' ? 'الأزواج المكتملة' : 'السؤال'}
                    />
                    {game.template === 'picture-matching' && (
                      <div className="game-activity__content game-picture-matching" aria-labelledby="game-question">
                        <div className="game-picture-matching__heading">
                          <h2 id="game-question">وصّل كل صورة بمثيلتها</h2>
                          <p>اختار صورة من المجموعة الأولى، ثم اضغط على الصورة المطابقة لها.</p>
                        </div>
                        <div className="game-picture-matching__groups">
                          <section className="game-picture-matching__group" aria-label="المجموعة الأولى">
                            <h3>المجموعة الأولى</h3>
                            <div className="game-picture-matching__cards">
                              {game.questions.map((question, pairIndex) => {
                                const matched = matchedPairs.includes(pairIndex);
                                const selected = selectedMatchLeft === pairIndex;
                                return (
                                  <button
                                    type="button"
                                    className={`game-picture-matching__card${selected ? ' is-selected' : ''}${matched ? ' is-matched' : ''}`}
                                    key={`left-${pairIndex}`}
                                    disabled={matched || submittingAnswer || savingAttempt || Boolean(feedback)}
                                    aria-pressed={selected}
                                    aria-label={`${matched ? 'تمت المطابقة: ' : selected ? 'الصورة المختارة: ' : 'اختر الصورة: '}${question.promptImageAlt || question.prompt}`}
                                    onClick={() => {
                                      setSelectedMatchLeft(pairIndex);
                                      setMatchingMessage('اختار الآن الصورة المطابقة من المجموعة الثانية.');
                                    }}
                                  >
                                    <GameImage src={question.promptImageUrl} alt={question.promptImageAlt || question.prompt}
                                      className="game-picture-matching__image" />
                                    <span>{question.prompt.replace(/^وصل صورة\s*/u, '')}</span>
                                    {matched && <small aria-hidden="true">تمت المطابقة ✓</small>}
                                  </button>
                                );
                              })}
                            </div>
                          </section>
                          <section className="game-picture-matching__group" aria-label="المجموعة الثانية">
                            <h3>المجموعة الثانية</h3>
                            <div className="game-picture-matching__cards">
                              {rightPairOrder.map((pairIndex) => {
                                const question = game.questions[pairIndex];
                                if (!question) return null;
                                const matched = matchedPairs.includes(pairIndex);
                                const selected = selectedMatchRight === pairIndex;
                                return (
                                  <button
                                    type="button"
                                    className={`game-picture-matching__card${selected ? ' is-selected' : ''}${matched ? ' is-matched' : ''}${feedback?.answerIndex === pairIndex && !feedback.correct ? ' is-incorrect' : ''}`}
                                    key={`right-${pairIndex}`}
                                    disabled={matched || submittingAnswer || savingAttempt || Boolean(feedback)}
                                    aria-pressed={selected}
                                    aria-label={`${matched ? 'تمت المطابقة: ' : selected ? 'الصورة المختارة: ' : 'اختر الصورة: '}${question.optionImageAltTexts?.[pairIndex] || question.options[pairIndex]}`}
                                    onClick={() => completePictureMatching(selectedMatchLeft, pairIndex)}
                                  >
                                    <GameImage src={question.optionImageUrls?.[pairIndex]}
                                      alt={question.optionImageAltTexts?.[pairIndex] || question.options[pairIndex]}
                                      className="game-picture-matching__image" />
                                    <span>{question.options[pairIndex]}</span>
                                    {matched && <small aria-hidden="true">تمت المطابقة ✓</small>}
                                  </button>
                                );
                              })}
                            </div>
                          </section>
                        </div>
                        {(matchingMessage || feedback) && (
                          <p className={`game-picture-matching__feedback${feedback?.correct ? ' is-correct' : feedback ? ' is-incorrect' : ''}`}
                            role="status" aria-live="polite">
                            {feedback ? feedback.correct ? 'برافو! ممتاز!' : 'حاول مرة تانية!' : matchingMessage}
                          </p>
                        )}
                        {savingAttempt && <p className="dashboard-loading" role="status">جارٍ حفظ نتيجة اللعبة…</p>}
                      </div>
                    )}
                    {game.template !== 'picture-matching' && currentQuestion && (
                      <div className="game-activity__content">
                          <div className="game-question-row">
                            <h2 id="game-question">{currentQuestion.prompt}</h2>
                            {game.template === 'audio-choice' ? (
                              currentQuestion.promptAudioUrl
                                ? <GameAudio
                                  text=""
                                  label="صوت الحيوان"
                                  audioUrl={currentQuestion.promptAudioUrl}
                                  key={`animal-audio-${questionIndex}`}
                                  allowSpeech={false}
                                  prominent
                                  muted={muted}
                                  onPlaybackStateChange={(state) => {
                                    setAudioPlayed(state === 'ended');
                                    setAudioFailed(state === 'error' || state === 'stopped');
                                  }}
                                />
                                : <p className="game-audio__error" role="alert">لم يُعيّن صوت موثّق لهذا السؤال بعد.</p>
                            ) : (
                              <GameAudio
                                text={currentQuestion.prompt}
                                label="السؤال"
                                audioUrl={currentQuestion.promptAudioUrl ?? game.assets?.listening?.audioUrl}
                                key={`question-audio-${questionIndex}`}
                                muted={muted}
                              />
                            )}
                          </div>
                          {game.template === 'matching-pairs' ? (
                            <div
                              className="game-matching-prompt"
                              aria-label="العنصر المطلوب مطابقته. يمكنك سحب الاختيار إلى هنا أو الضغط عليه."
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                const droppedIndex = Number(event.dataTransfer.getData('text/plain'));
                                if (Number.isInteger(droppedIndex) && droppedIndex >= 0
                                  && droppedIndex < currentQuestion.options.length) {
                                  void selectAnswer(droppedIndex);
                                }
                              }}
                            >
                              {currentQuestion.promptImageUrl
                                ? <GameImage className="game-question-image" src={currentQuestion.promptImageUrl}
                                  alt={currentQuestion.promptImageAlt ?? ''} />
                                : <span className="game-image-placeholder game-question-image" role="img" aria-label="الصورة غير متوفرة">▧</span>}
                              <strong>{currentQuestion.prompt.replace(/^(أين صورة|أين صورة الـ|أين|اختر صورة)\s*/u, '')}</strong>
                            </div>
                          ) : currentQuestion.promptImageUrl ? (
                            <GameImage className="game-question-image" src={currentQuestion.promptImageUrl}
                              alt={currentQuestion.promptImageAlt ?? ''} />
                          ) : null}
                          <GameAnswerOptions
                            options={currentQuestion.options}
                            optionImageUrls={currentQuestion.optionImageUrls}
                            optionImageAltTexts={currentQuestion.optionImageAltTexts}
                            matchingPairs={game.template === 'matching-pairs'}
                            audioChoice={game.template === 'audio-choice'}
                            selected={feedback?.answerIndex}
                            answerCorrect={feedback?.correct}
                            disabled={Boolean(feedback) || submittingAnswer || savingAttempt
                              || (game.template === 'audio-choice' && !audioPlayed && !muted)}
                            disabledOptions={game.template === 'matching-pairs' ? matchedPairs : []}
                            onSelect={selectAnswer}
                          />
                          {game.template === 'audio-choice' && (!currentQuestion.promptAudioUrl || audioFailed) && !feedback && (
                            <button type="button" className="button button--outline game-skip-button"
                              disabled={submittingAnswer || savingAttempt} onClick={() => void selectAnswer(-1)}>
                              تجاوز السؤال بأمان
                            </button>
                          )}
                          {game.template === 'audio-choice' && muted && !feedback && (
                          <p className="game-audio__error" role="status">الصوت مكتوم. يمكنك تفعيل الصوت أو اختيار الصورة للمتابعة.</p>
                          )}
                          {feedback && (
                            <>
                              <GameFeedback
                                correct={feedback.correct}
                                skipped={feedback.skipped}
                                correctFeedback={currentQuestion.correctFeedback}
                                incorrectFeedback={currentQuestion.incorrectFeedback}
                              />
                              <button
                                type="button"
                                className="button button--primary game-next-button"
                                disabled={savingAttempt}
                                onClick={nextQuestion}
                              >
                                {savingAttempt ? 'جارٍ حفظ المحاولة…' : questionIndex + 1 === game.questions.length ? 'إنهاء اللعبة' : 'السؤال التالي'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </section>
                  )}
                </div>
              </div>
            )}
            {error && game && <p className="game-error" role="alert">{error}</p>}
            <p className="game-privacy-note">
              {isTrial
                ? 'اللعبة التجريبية لا تحفظ إجاباتك أو أي بيانات شخصية.'
                : 'لا تُحفظ إجابات كل سؤال؛ يُسجل فقط ملخص النتيجة عند موافقة ولي الأمر.'}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

export default function GamesPage({ settings }) {
  const gameId = routeGameId();
  return gameId ? <GamePlay gameId={gameId} /> : <GameCatalog settings={settings} />;
}
