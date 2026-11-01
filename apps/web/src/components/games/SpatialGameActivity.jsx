import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api.js';
import { playGameAudio, stopGameAudio } from '../../lib/gameAudio.js';
import { GameProgress } from './GameComponents.jsx';
import SpatialScene, { initialSpatialPositions } from './SpatialScene.jsx';

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export default function SpatialGameActivity({
  game,
  gameId,
  childId,
  submissionId,
  muted,
  isTrial,
  onCompanionState,
  onStepComplete,
  onComplete
}) {
  const spatial = game.spatial;
  const [positions, setPositions] = useState(() => initialSpatialPositions(spatial));
  const positionsRef = useRef(positions);
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedObjectId, setSelectedObjectId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [incorrectByStep, setIncorrectByStep] = useState({});
  const [showHint, setShowHint] = useState(false);
  const [showDemonstration, setShowDemonstration] = useState(false);
  const [hintRecorded, setHintRecorded] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const sceneRef = useRef(null);
  const dragRef = useRef(null);
  const draggedRef = useRef(false);
  const currentStep = spatial.steps[stepIndex];
  const stepIncorrectCount = incorrectByStep[stepIndex] ?? 0;
  const activeObject = spatial.scene.objects.find(({ id }) => id === currentStep.movableObjectId);

  const speakInstruction = () => {
    if (muted) return;
    onCompanionState('listening');
    stopGameAudio();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (currentStep.instructionAudioUrl) {
      playGameAudio(currentStep.instructionAudioUrl, undefined, { volume });
      return;
    }
    if (!('speechSynthesis' in window)) {
      setError('الصوت غير متاح في هذا المتصفح. يمكن متابعة التعليمة المكتوبة.');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(currentStep.instruction);
    utterance.lang = 'ar-EG';
    utterance.rate = 0.85;
    utterance.volume = volume;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (!isTrial) void postEvent('session_started').catch((requestError) => setError(requestError.message));
    speakInstruction();
    return () => {
      stopGameAudio();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [stepIndex]);

  useEffect(() => {
    if (!spatial.assistance.enabled || stepIncorrectCount < spatial.assistance.visualHintAfter || hintRecorded) return;
    setShowHint(true);
    setHintRecorded(true);
    void postEvent('hint').catch((requestError) => setError(requestError.message));
  }, [stepIncorrectCount, spatial.assistance, hintRecorded]);

  const postEvent = async (action, position) => {
    const body = {
      action,
      questionIndex: stepIndex,
      gameVersion: game.version,
      ...(isTrial ? {} : { childId, submissionId }),
      ...(position ? { position } : {})
    };
    return apiRequest(`/api/v1/games/${encodeURIComponent(gameId)}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  };

  const pointInScene = (event) => {
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width * 1000, 0, 1000),
      y: clamp((event.clientY - rect.top) / rect.height * 1000, 0, 1000)
    };
  };

  const placeAt = async (x, y) => {
    if (busy || feedback.startsWith('ممتاز')) return;
    setBusy(true);
    onCompanionState('thinking');
    setError('');
    setFeedback('');
    try {
      const { answer } = await postEvent('placement', {
        x: clamp(x, 0, 1000 - activeObject.width),
        y: clamp(y, 0, 1000 - activeObject.height)
      });
      if (!answer.correct) {
        setIncorrectByStep((current) => ({ ...current, [stepIndex]: (current[stepIndex] ?? 0) + 1 }));
        setFeedback(stepIncorrectCount === 0 ? 'حاول مرة تانية، أنت قريب!' : 'اسمع التعليمة مرة أخرى وحاول من جديد.');
        onCompanionState('encouragement');
        if (stepIncorrectCount === 1) speakInstruction();
        return;
      }

      setSelectedObjectId('');
      setFeedback('ممتاز! حطيتها في المكان الصحيح!');
      onCompanionState('correct');
      onStepComplete(stepIndex);
      if (stepIndex + 1 === spatial.steps.length) {
        window.setTimeout(onComplete, 500);
      } else {
        window.setTimeout(() => {
          setStepIndex((current) => current + 1);
          setFeedback('');
          onCompanionState('listening');
          setShowHint(false);
          setShowDemonstration(false);
          setHintRecorded(false);
        }, 700);
      }
    } catch (requestError) {
      setError(requestError.message);
      onCompanionState('listening');
    } finally {
      setBusy(false);
    }
  };

  const handlePointerDown = (event, item) => {
    if (!item.movable || item.id !== currentStep.movableObjectId || busy
      || feedback.startsWith('ممتاز') || event.button > 0) return;
    event.preventDefault();
    const point = pointInScene(event);
    if (!point) return;
    const position = positionsRef.current[item.id] ?? item;
    dragRef.current = {
      id: item.id,
      pointerId: event.pointerId,
      offsetX: point.x - position.x,
      offsetY: point.y - position.y,
      startX: point.x,
      startY: point.y
    };
    draggedRef.current = false;
    setSelectedObjectId(item.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointInScene(event);
    if (!point) return;
    if (Math.hypot(point.x - drag.startX, point.y - drag.startY) > 2) draggedRef.current = true;
    const next = {
      ...positionsRef.current,
      [drag.id]: {
        x: clamp(point.x - drag.offsetX, 0, 1000 - activeObject.width),
        y: clamp(point.y - drag.offsetY, 0, 1000 - activeObject.height)
      }
    };
    positionsRef.current = next;
    setPositions(next);
  };

  const handlePointerUp = async (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (draggedRef.current) await placeAt(
      positionsRef.current[drag.id].x,
      positionsRef.current[drag.id].y
    );
  };

  const handleObjectClick = (event, item) => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    if (selectedObjectId && !item.movable) {
      const point = pointInScene(event);
      if (point) void placeAt(point.x - activeObject.width / 2, point.y - activeObject.height / 2);
      return;
    }
    if (item.movable && item.id === currentStep.movableObjectId) {
      setSelectedObjectId(item.id === selectedObjectId ? '' : item.id);
    }
  };

  const handleSceneClick = async (event) => {
    if (!selectedObjectId || !sceneRef.current?.contains(event.target)
      || event.target.closest('.spatial-scene__object')) return;
    const point = pointInScene(event);
    if (point) await placeAt(point.x - activeObject.width / 2, point.y - activeObject.height / 2);
  };

  const replay = async () => {
    try {
      await postEvent('instruction_replay');
      speakInstruction();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const demonstrate = async () => {
    if (!showHint) return;
    try {
      await postEvent('demonstration');
      setShowDemonstration(true);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <section className="game-activity spatial-activity" aria-labelledby="spatial-instruction">
      <GameProgress current={stepIndex} total={spatial.steps.length} label="التعليمات المكتملة" />
      <header className="spatial-activity__instruction">
        <span>المستوى {spatial.level} · الخطوة {stepIndex + 1} من {spatial.steps.length}</span>
        <h2 id="spatial-instruction">{currentStep.instruction}</h2>
        <button type="button" className="button button--small button--outline"
          disabled={muted || busy} onClick={() => void replay()}>أعد سماع التعليمة</button>
      </header>
      <label className="spatial-activity__volume">مستوى الصوت
        <input type="range" min="0" max="1" step="0.1" value={volume} disabled={muted}
          aria-label="مستوى صوت التعليمة"
          onChange={(event) => setVolume(Number(event.target.value))} />
      </label>
      <p className="spatial-activity__hint" aria-live="polite">
        {selectedObjectId ? 'المس المكان الذي تريد نقل العنصر إليه، أو اسحبه بإصبعك أو الفأرة.' : 'اسحب العنصر إلى المكان المطلوب، أو المس العنصر ثم المكان.'}
      </p>
      <div className="spatial-activity__scene-wrap">
        <div ref={sceneRef} className="spatial-activity__scene" tabIndex="0"
          onKeyDown={(event) => {
            if (!selectedObjectId) return;
            const deltas = {
              ArrowLeft: [-10, 0],
              ArrowRight: [10, 0],
              ArrowUp: [0, -10],
              ArrowDown: [0, 10]
            };
            const delta = deltas[event.key];
            if (delta) {
              event.preventDefault();
              const current = positionsRef.current[selectedObjectId];
              const next = {
                ...positionsRef.current,
                [selectedObjectId]: {
                  x: clamp(current.x + delta[0], 0, 1000 - activeObject.width),
                  y: clamp(current.y + delta[1], 0, 1000 - activeObject.height)
                }
              };
              positionsRef.current = next;
              setPositions(next);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              void placeAt(positionsRef.current[selectedObjectId].x, positionsRef.current[selectedObjectId].y);
            }
          }}>
          <SpatialScene
            spatial={spatial}
            positions={positions}
            activeObjectId={{ objectId: currentStep.movableObjectId, stepIndex }}
            selectedObjectId={selectedObjectId}
            targetRegion={currentStep.targetRegion}
            showTarget
            demonstration={showDemonstration}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { dragRef.current = null; }}
            onObjectClick={handleObjectClick}
            onSceneClick={(event) => void handleSceneClick(event)}
          />
        </div>
      </div>
      {spatial.assistance.enabled && stepIncorrectCount >= spatial.assistance.demonstrationAfter && showHint && (
        <button type="button" className="button button--small button--outline"
          disabled={busy || showDemonstration} onClick={() => void demonstrate()}>
          {showDemonstration ? 'ظهر مثال للمكان الصحيح' : 'شاهد مثالًا للمكان الصحيح'}
        </button>
      )}
      {feedback && <p className={`spatial-activity__feedback${feedback.startsWith('ممتاز') ? ' is-correct' : ''}`} role="status">{feedback}</p>}
      {error && <p className="game-error" role="alert">{error}</p>}
      <div className="spatial-activity__accessible">
        <span>عناصر المشهد:</span>
        {spatial.scene.objects.filter(({ id, movable }) => movable && id === currentStep.movableObjectId).map((item) => (
          <button type="button" className="button button--small button--outline" key={item.id}
            disabled={busy} aria-pressed={selectedObjectId === item.id}
            onClick={() => setSelectedObjectId(item.id)}>
            اختر {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}
