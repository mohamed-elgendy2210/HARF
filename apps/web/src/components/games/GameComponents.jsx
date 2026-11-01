import { useEffect, useRef, useState } from 'react';
import { getApiUrl } from '../../lib/api.js';
import { playGameAudio } from '../../lib/gameAudio.js';
import happyImage from '../../../../../Branding/Character/happy.png';
import ideaImage from '../../../../../Branding/Character/have-Idea.png';
import listeningImage from '../../../../../Branding/Character/listening.png';
import readingImage from '../../../../../Branding/Character/reading.png';
import sadImage from '../../../../../Branding/Character/sad.png';
import talkingImage from '../../../../../Branding/Character/talking.png';
import thinkingImage from '../../../../../Branding/Character/thinking.png';
import winningVideo from '../../../../../Branding/Character/Videos/Winnig.mp4';
import losingVideo from '../../../../../Branding/Character/Videos/Loose.mp4';

const mascotExpressions = {
  happy: happyImage,
  'have-Idea': ideaImage,
  listening: listeningImage,
  reading: readingImage,
  sad: sadImage,
  talking: talkingImage,
  thinking: thinkingImage
};

const mascotExpressionLabels = {
  happy: 'سعيد',
  'have-Idea': 'لديه فكرة',
  listening: 'يستمع',
  reading: 'يقرأ',
  sad: 'متعاطف',
  talking: 'يتحدث',
  thinking: 'يفكر'
};

const stateLabels = {
  welcome: 'أهلًا بك!',
  idle: 'أنا جاهز عندما تكون مستعدًا',
  listening: 'أستمع معك',
  thinking: 'دعني أفكر',
  encouragement: 'أحسنت المحاولة، لنكمل',
  correct: 'إجابة صحيحة! أحسنت',
  completion: 'أنهيت اللعبة، رائع!'
};

export function GameImage({ src, alt, className }) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => setFailed(!src), [src]);
  if (failed) {
    return <span className={`${className} game-image-placeholder`} role="img" aria-label="الصورة غير متوفرة">▧</span>;
  }
  return <img className={className} src={getApiUrl(src)} alt={alt ?? ''} onError={() => setFailed(true)} />;
}

export function HarfMascot({ expression = 'talking', className = '' }) {
  const safeExpression = mascotExpressions[expression] ? expression : 'talking';
  return (
    <img
      key={safeExpression}
      className={`harf-mascot${className ? ` ${className}` : ''}`}
      src={mascotExpressions[safeExpression]}
      alt={`تميمة حرف ${mascotExpressionLabels[safeExpression]}`}
      decoding="async"
    />
  );
}

export function GameCompanion({ animal, name, state = 'idle', imageUrl, animationUrl }) {
  const expression = state === 'welcome' ? 'talking'
    : state === 'correct' || state === 'completion' ? 'happy'
      : state === 'encouragement' ? 'have-Idea'
        : state === 'thinking' ? 'thinking'
          : state === 'listening' ? 'listening'
            : 'reading';
  return (
    <div className={`game-companion game-companion--${state}`} role="status" aria-live="polite">
      <div className="game-companion__figure">
        {imageUrl
          ? <img className="game-companion__asset" src={getApiUrl(imageUrl)} alt="" />
          : <HarfMascot expression={expression} className="game-companion__mascot" />}
        <span className="game-companion__animal-emoji" aria-hidden="true">{animal}</span>
      </div>
      <span className="game-companion__copy">
        <strong>{name}</strong>
        <span>{stateLabels[state] ?? stateLabels.idle}</span>
      </span>
    </div>
  );
}

export function GameAudio({
  text,
  label,
  audioUrl,
  allowSpeech = true,
  disabled = false,
  prominent = false,
  muted = false,
  volume = 1,
  onPlaybackStateChange
}) {
  const [speaking, setSpeaking] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [audioState, setAudioState] = useState('');
  const audioRef = useRef(null);
  const playbackStateCallback = useRef(onPlaybackStateChange);
  playbackStateCallback.current = onPlaybackStateChange;

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    audioRef.current?.(false);
  }, []);

  useEffect(() => {
    if (!muted) return;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    audioRef.current?.();
    audioRef.current = null;
    setSpeaking(false);
    playbackStateCallback.current?.('stopped');
  }, [muted]);

  const canSpeakText = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  if (!audioUrl && !allowSpeech) return null;
  if (!audioUrl && !canSpeakText) {
    return <span className="game-audio__error" role="status">الصوت غير متاح في هذا المتصفح.</span>;
  }

  const speak = () => {
    if (disabled || muted) return;
    setAudioError(false);
    setAudioState('loading');
    playbackStateCallback.current?.('loading');
    if (audioUrl) {
      audioRef.current?.();
      try {
        audioRef.current = playGameAudio(audioUrl, (state) => {
          setAudioState(state);
          onPlaybackStateChange?.(state);
          setSpeaking(state === 'loading' || state === 'playing');
          setAudioError(state === 'error');
        }, { muted, volume });
      } catch {
        setAudioState('error');
        setAudioError(true);
        onPlaybackStateChange?.('error');
        return;
      }
      setSpeaking(true);
      return;
    }
    audioRef.current?.();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-EG';
    utterance.rate = 0.85;
    utterance.volume = volume;
    utterance.onend = () => {
      setSpeaking(false);
      setAudioState('ended');
      onPlaybackStateChange?.('ended');
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setAudioError(true);
      setAudioState('error');
      onPlaybackStateChange?.('error');
    };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const stop = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    audioRef.current?.();
    audioRef.current = null;
    setSpeaking(false);
    setAudioState('stopped');
    playbackStateCallback.current?.('stopped');
  };

  return (
    <div className={`game-audio${prominent ? ' game-audio--prominent' : ''}`}>
      <button type="button" className="button button--small button--outline" disabled={disabled || muted} onClick={speaking ? stop : speak}>
        {prominent && <span aria-hidden="true">🔊</span>}
        {speaking ? 'إيقاف الصوت' : audioState === 'error' ? `إعادة المحاولة: ${label}` : `استمع: ${label}`}
      </button>
      {audioState === 'loading' && <span role="status">جارٍ تحميل الصوت…</span>}
      {audioState === 'playing' && <span role="status">الصوت يعمل…</span>}
      {audioState === 'ended' && <span role="status">انتهى الصوت. يمكنك إعادة الاستماع.</span>}
      {audioError && <span className="game-audio__error" role="status">تعذر تشغيل الملف الصوتي.</span>}
    </div>
  );
}

export function GameBackgroundAudio({ audioUrl, active, muted }) {
  const audioRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!audioUrl || !active || muted) {
      audioRef.current?.pause();
      return undefined;
    }

    let activeEffect = true;
    const audio = new Audio(getApiUrl(audioUrl));
    audio.crossOrigin = 'use-credentials';
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.12;
    audioRef.current = audio;
    audio.play().then(() => {
      if (activeEffect) setFailed(false);
    }).catch(() => {
      if (activeEffect) setFailed(true);
    });

    return () => {
      activeEffect = false;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [audioUrl, active, muted, retryKey]);

  if (!audioUrl || !failed) return null;
  return (
    <div className="game-background-audio-warning" role="status">
      <span>تعذر تشغيل الخلفية الصوتية. يمكنك مواصلة اللعب دونها.</span>
      <button type="button" className="button button--small button--outline"
        onClick={() => setRetryKey((current) => current + 1)}>
        إعادة تشغيل الخلفية
      </button>
    </div>
  );
}

export function GameInstructions({ game, onStart, disabled, audioEnabled, muted }) {
  return (
    <section className="game-instructions" aria-labelledby="game-instructions-title">
      <h2 id="game-instructions-title">كيف نلعب؟</h2>
      <p>{game.instructions}</p>
      {audioEnabled && <GameAudio text={game.instructions} label="التعليمات" audioUrl={game.assets?.welcome?.audioUrl} muted={muted} />}
      <button type="button" className="button button--primary" disabled={disabled} onClick={onStart}>
        يلا نلعب!
      </button>
    </section>
  );
}

export function GameProgress({ current, total, label = 'السؤال' }) {
  const percent = total ? Math.round((current / total) * 100) : 0;
  return (
    <div className="game-progress">
      <div className="game-progress__labels">
        <span>{label} {current} من {total}</span>
        <span>{percent}٪</span>
      </div>
      <div
        className="game-progress__track"
        role="progressbar"
        aria-label="تقدم اللعبة"
        aria-valuemin="0"
        aria-valuemax={total}
        aria-valuenow={current}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function GameAnswerOptions({
  options,
  optionImageUrls = [],
  optionImageAltTexts = [],
  matchingPairs = false,
  audioChoice = false,
  selected,
  answerCorrect,
  disabled,
  disabledOptions = [],
  onSelect
}) {
  const disabledAnswers = new Set(disabledOptions);
  return (
    <div className="game-answer-grid" role="group" aria-label="اختيارات الإجابة">
      {options.map((option, index) => (
        <button
          type="button"
          className={`game-answer${selected === index ? ' is-selected' : ''}${selected === index && answerCorrect === true ? ' is-correct' : ''}${selected === index && answerCorrect === false ? ' is-incorrect' : ''}`}
          key={`${index}-${option}`}
          disabled={disabled || disabledAnswers.has(index)}
          aria-pressed={selected === index}
          draggable={matchingPairs && !disabled && !disabledAnswers.has(index)}
          onDragStart={matchingPairs ? (event) => {
            event.dataTransfer.setData('text/plain', String(index));
            event.dataTransfer.effectAllowed = 'move';
          } : undefined}
          onClick={() => onSelect(index)}
        >
          {(matchingPairs || audioChoice) && (
            <GameImage
              className="game-answer__image"
              src={optionImageUrls[index]}
              alt={optionImageAltTexts[index] || option}
            />
          )}
          {option}
        </button>
      ))}
    </div>
  );
}

export function GameFeedback({
  correct,
  skipped = false,
  correctFeedback = 'إجابة صحيحة! أحسنت.',
  incorrectFeedback
}) {
  return (
    <p className={`game-feedback ${correct ? 'game-feedback--correct' : 'game-feedback--encouragement'}`} role="status" aria-live="assertive">
      {skipped
        ? 'لا بأس، تجاوزنا هذا السؤال ويمكنك المتابعة.'
        : correct
        ? correctFeedback
        : incorrectFeedback || 'محاولة جميلة. لنكمل معًا.'}
    </p>
  );
}

export function GameCompletion({ result, isTrial, saved, onReplay, onReturn, muted, nextActivity, childId }) {
  const successful = result.scorePercent >= 80;
  const videoRef = useRef(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoError, setVideoError] = useState('');
  const [videoSoundEnabled, setVideoSoundEnabled] = useState(!muted);
  const expressionImage = successful ? happyImage : sadImage;
  const videoSource = successful
    ? result.assets?.['result-success']?.videoUrl ?? winningVideo
    : result.assets?.['result-practice']?.videoUrl ?? losingVideo;

  useEffect(() => {
    let active = true;
    const video = videoRef.current;
    if (!video) return undefined;
    setVideoFailed(false);
    setVideoPlaying(false);
    setVideoError('');
    setVideoSoundEnabled(!muted);
    video.muted = muted;
    const frame = window.requestAnimationFrame(async () => {
      try {
        await video.play();
        if (!active) return;
        setVideoPlaying(true);
        setVideoSoundEnabled(!muted);
      } catch {
        if (!active) return;
        if (muted) {
          setVideoSoundEnabled(false);
          setVideoFailed(true);
          return;
        }
        video.muted = true;
        try {
          await video.play();
          if (!active) return;
          setVideoPlaying(true);
          setVideoSoundEnabled(false);
          setVideoError('بدأ الفيديو دون صوت بسبب إعدادات التشغيل التلقائي في المتصفح. اضغط «تشغيل صوت الرسالة» لسماعها.');
        } catch {
          if (active) setVideoFailed(true);
        }
      }
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      video.pause();
    };
  }, [videoSource, muted]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted || !videoSoundEnabled;
  }, [muted, videoSoundEnabled]);

  const toggleVideoSound = async () => {
    const video = videoRef.current;
    if (!video || muted) return;
    setVideoError('');
    if (videoSoundEnabled) {
      setVideoSoundEnabled(false);
      return;
    }
    if (video.ended) video.currentTime = 0;
    video.muted = false;
    try {
      await video.play();
      setVideoSoundEnabled(true);
    } catch {
      video.muted = true;
      setVideoError('تعذر تشغيل صوت الرسالة. يستمر عرض حركة حرف دون صوت.');
    }
  };

  const replayVideo = async () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    video.muted = muted || !videoSoundEnabled;
    setVideoError('');
    try {
      await video.play();
      setVideoPlaying(true);
    } catch {
      setVideoError('تعذر إعادة تشغيل الرسالة الآن.');
    }
  };

  return (
    <section className={`game-completion${successful ? ' game-completion--success' : ' game-completion--practice'}`} aria-labelledby="game-completion-title">
      <div className="game-completion__character" aria-hidden="true">
        {videoFailed ? (
          <HarfMascot expression={successful ? 'happy' : 'sad'} className="game-completion__mascot" />
        ) : (
          <video
            ref={videoRef}
            className="game-completion__video"
            src={getApiUrl(videoSource)}
            poster={expressionImage}
            controls={false}
            playsInline
            preload="auto"
            muted
            onPlay={() => setVideoPlaying(true)}
            onEnded={() => setVideoPlaying(false)}
            onError={() => setVideoFailed(true)}
          />
        )}
      </div>
      <div className="game-completion__content">
        <span className="game-completion__badge" aria-hidden="true">{successful ? '✦' : '♡'}</span>
        <h2 id="game-completion-title">{successful ? 'برافو! أنت عملت شغل رائع!' : 'ولا يهمك، كل مرة بنتعلم حاجة جديدة.'}</h2>
        <p className="game-completion__score">
          {result.correctCount} من {result.totalQuestions} إجابات صحيحة · {result.scorePercent}٪
        </p>
        {!successful && <p>تعال نجرب تاني! التدريب خطوة خطوة يساعدنا نتعلم.</p>}
        <p className="game-completion__note">
          هذه نتيجة نشاط تعليمي واحد، وليست تشخيصًا أو تقييمًا طبيًا.
        </p>
        <p className="game-completion__saved" role="status">
          {isTrial
            ? 'انتهت التجربة المجانية دون حفظ بيانات أو نتائج شخصية.'
            : saved
              ? 'حُفظت المحاولة في سجل هذا الطفل.'
              : 'لم تُحفظ المحاولة.'}
        </p>
        {videoError && <p className="game-completion__media-status" role="status">{videoError}</p>}
        {!videoFailed && (
          <div className="game-completion__media-actions">
            <button type="button" className="game-completion__media-button"
              disabled={muted} aria-pressed={videoSoundEnabled}
              onClick={() => void toggleVideoSound()}>
              {muted ? 'الصوت مكتوم' : videoSoundEnabled ? 'كتم صوت الرسالة' : 'تشغيل صوت الرسالة'}
            </button>
            {!videoPlaying && (
              <button type="button" className="game-completion__media-button"
                onClick={() => void replayVideo()}>
                شاهد الرسالة مرة أخرى
              </button>
            )}
          </div>
        )}
        {result.instructions && (
          <GameAudio
            text="رائع! أنهيت اللعبة بنجاح."
            label="التشجيع"
            audioUrl={result.assets?.completion?.audioUrl}
            muted={muted}
            onPlaybackStateChange={(state) => {
              if (state === 'loading' || state === 'playing') {
                videoRef.current?.pause();
                setVideoPlaying(false);
              }
            }}
          />
        )}
        <div className="game-completion__actions">
          <button type="button" className="button button--primary" onClick={onReplay}>العب مرة أخرى</button>
          {nextActivity && childId && (
            <a className="button button--outline"
              href={`/games/${encodeURIComponent(nextActivity.gameId)}?childId=${encodeURIComponent(childId)}`}>
              النشاط التالي: {nextActivity.title}
            </a>
          )}
          <a className="button button--outline" href={onReturn}>{isTrial ? 'كل الألعاب' : 'لوحة الأسرة'}</a>
        </div>
      </div>
    </section>
  );
}
