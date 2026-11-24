import { GameImage, HarfMascot } from './GameComponents.jsx';

const levelStatusLabels = {
  completed: 'مكتمل',
  'in-progress': 'قيد التقدم',
  available: 'متاح',
  locked: 'مقفل'
};

const stationStatusLabels = {
  completed: 'أنجزتها',
  available: 'متاحة الآن',
  locked: 'مقفلة'
};

function StationIllustration({ template, variant }) {
  const palettes = [
    { base: '#e8f8f2', main: '#36a995', secondary: '#f5bc50', dark: '#327e72' },
    { base: '#eef3ff', main: '#6585d2', secondary: '#f2a66c', dark: '#425caa' },
    { base: '#f6efff', main: '#9578c9', secondary: '#f1bf56', dark: '#674d9a' }
  ];
  const colors = palettes[variant % palettes.length];
  const matching = ['matching-pairs', 'picture-matching', 'associative-matching'].includes(template);

  return (
    <svg className="learning-adventure-station__illustration" viewBox="0 0 180 150" aria-hidden="true">
      <circle cx="90" cy="76" r="67" fill={colors.base} />
      {template === 'audio-choice' ? (
        <>
          <circle cx="75" cy="76" r="25" fill={colors.main} />
          <circle cx="75" cy="68" r="8" fill="#fff" opacity=".9" />
          <path d="M66 91 Q75 82 84 91 M109 57 Q128 76 109 95 M121 47 Q150 76 121 105"
            fill="none" stroke={colors.dark} strokeWidth="7" strokeLinecap="round" />
        </>
      ) : template === 'sequence-ordering' ? (
        <>
          <rect x="34" y="52" width="38" height="48" rx="10" fill="#fff" stroke={colors.main} strokeWidth="5" />
          <rect x="75" y="39" width="38" height="48" rx="10" fill="#fff" stroke={colors.secondary} strokeWidth="5" />
          <rect x="116" y="52" width="30" height="48" rx="10" fill="#fff" stroke={colors.dark} strokeWidth="5" />
          <path d="M45 113 H133" stroke={colors.dark} strokeWidth="6" strokeLinecap="round" />
          <path d="m125 105 10 8-10 8" fill="none" stroke={colors.dark} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : template === 'spatial-relationships' ? (
        <>
          <rect x="53" y="57" width="78" height="58" rx="8" fill="#fff" stroke={colors.dark} strokeWidth="6" />
          <path d="M53 73 H131 M74 57 V115 M110 57 V115" stroke={colors.main} strokeWidth="4" />
          <circle cx="91" cy="45" r="15" fill={colors.secondary} stroke="#fff" strokeWidth="5" />
          <path d="M91 24 V16 M43 91 H35 M148 91 H140" stroke={colors.main} strokeWidth="5" strokeLinecap="round" />
        </>
      ) : matching ? (
        <>
          <rect x="36" y="49" width="42" height="48" rx="20" fill={colors.main} />
          <rect x="102" y="49" width="42" height="48" rx="20" fill={colors.secondary} />
          <path d="M78 72 C87 58 94 86 102 72" fill="none" stroke={colors.dark} strokeWidth="6" strokeLinecap="round" />
          <circle cx="57" cy="70" r="7" fill="#fff" opacity=".9" />
          <circle cx="123" cy="70" r="7" fill="#fff" opacity=".9" />
        </>
      ) : (
        <>
          <rect x="51" y="45" width="78" height="66" rx="16" fill="#fff" stroke={colors.main} strokeWidth="6" />
          <path d="M69 68 H111 M69 84 H100" stroke={colors.dark} strokeWidth="6" strokeLinecap="round" />
          <path d="m90 19 8 16 18 2-13 12 4 18-17-9-16 9 3-18-13-12 18-2z"
            fill={colors.secondary} stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
        </>
      )}
      <circle cx="37" cy="31" r="5" fill={colors.secondary} />
      <circle cx="143" cy="116" r="6" fill={colors.main} opacity=".7" />
    </svg>
  );
}

function getStationStatus(game, level, gameId) {
  if (level?.status === 'locked' || game.activityStatus === 'upcoming') return 'locked';
  if (game.activityStatus === 'completed' || level?.completedGameIds?.includes(gameId)) return 'completed';
  if (game.activityStatus === 'available') return 'available';
  return 'locked';
}

function buildTrailPath(stationCount) {
  const points = Array.from({ length: stationCount }, (_, index) => ({
    x: 500,
    y: 110 + index * 210
  }));
  if (points.length < 2) return `M ${points[0]?.x ?? 500} ${points[0]?.y ?? 110}`;
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const bend = index % 2 === 0 ? 190 : -190;
    return `${path} C ${500 + bend} ${previous.y + 52}, ${500 - bend} ${point.y - 52}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

export default function LearningAdventureMap({
  games,
  levels,
  assignedPaths,
  totalStars,
  starsByGame,
  gameHref
}) {
  const levelPositions = new Map();
  levels.forEach((level, levelIndex) => {
    (level.gameIds ?? []).forEach((gameId, gameIndex) => {
      if (!levelPositions.has(gameId)) levelPositions.set(gameId, { level, levelIndex, gameIndex });
    });
  });

  const stations = games.map((game, originalIndex) => {
    const id = game.id ?? game.gameId;
    const position = levelPositions.get(id);
    return {
      ...game,
      id,
      level: position?.level ?? null,
      levelIndex: position?.levelIndex ?? Number.MAX_SAFE_INTEGER,
      gameIndex: position?.gameIndex ?? originalIndex,
      originalIndex,
      status: getStationStatus(game, position?.level, id)
    };
  }).sort((first, second) => first.levelIndex - second.levelIndex
    || first.gameIndex - second.gameIndex
    || first.originalIndex - second.originalIndex);

  const completedCount = stations.filter(({ status }) => status === 'completed').length;
  const progressPercent = stations.length ? Math.round((completedCount / stations.length) * 100) : 0;
  const nextStation = stations.find(({ status }) => status === 'available');
  const allComplete = stations.length > 0 && completedCount === stations.length;
  const currentLevel = nextStation?.level
    ?? levels.find(({ status }) => status === 'in-progress')
    ?? levels.find(({ status }) => status === 'available');
  const trailHeight = Math.max(210, stations.length * 210);
  const pathTitle = assignedPaths.map(({ title }) => title).filter(Boolean).join(' · ');
  const mascotExpression = allComplete ? 'happy' : nextStation ? 'talking' : 'thinking';

  return (
    <section className="learning-adventure" aria-labelledby="learning-adventure-title">
      <header className="learning-adventure__hero">
        <HarfMascot expression={mascotExpression} className="learning-adventure__mascot" />
        <div className="learning-adventure__welcome">
          <span>مغامرة التعلّم</span>
          <h2 id="learning-adventure-title">{pathTitle || 'رحلتك التعليمية'}</h2>
          <p>{allComplete
            ? 'أحسنت يا بطل! أنجزت كل الأنشطة المسجلة في هذه الرحلة.'
            : nextStation
              ? 'أهلًا يا بطل! اتبع المحطات واكتشف تحديك التالي.'
              : 'فكّر مع حرف: أكمل التحديات السابقة لفتح محطات جديدة.'}</p>
        </div>
        <div className="learning-adventure__summary">
          <div className="learning-adventure__star-balance">
            <span aria-hidden="true">✦</span>
            <strong>{totalStars}</strong>
            <small>نجمة مكتسبة</small>
          </div>
          <div className="learning-adventure__progress">
            <div><strong>تقدم الرحلة</strong><span>{completedCount} من {stations.length}</span></div>
            <div className="learning-adventure__progress-track" role="progressbar"
              aria-label="تقدم الأنشطة المسجل" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressPercent}>
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <small>{progressPercent}% من الأنشطة مكتملة</small>
          </div>
        </div>
      </header>

      {levels.length > 0 && (
        <section className="learning-adventure__levels" aria-label="مستويات المغامرة">
          <div className="learning-adventure__section-heading">
            <span>مسار رحلتك</span>
            <strong>{levels.filter(({ status }) => status === 'completed').length} من {levels.length} مستويات مكتملة</strong>
          </div>
          <ol>
            {levels.map((level, index) => {
              const isCurrent = currentLevel?.id === level.id;
              const earnedRewards = level.earnedRewards ?? [];
              const earnedText = earnedRewards.map((reward) => reward.type === 'stars'
                ? `${reward.quantity} نجمة`
                : reward.name).filter(Boolean).join(' · ');
              const configuredRewards = [
                level.completionReward?.stars > 0 ? `${level.completionReward.stars} نجمة` : '',
                level.completionReward?.badgeRewardId ? 'شارة' : '',
                level.completionReward?.giftRewardId ? 'هدية' : ''
              ].filter(Boolean).join(' · ');
              return (
                <li className={`learning-adventure__level learning-adventure__level--${level.status}${isCurrent ? ' is-current' : ''}`}
                  key={level.id}>
                  <span className="learning-adventure__level-number">{level.status === 'completed' ? '✓' : index + 1}</span>
                  <div>
                    <strong>{level.title}</strong>
                    <small>{levelStatusLabels[level.status] ?? 'قيد الترتيب'} · {level.completionPercent}%</small>
                    {(earnedText || (level.rewardsActive && configuredRewards)) && (
                      <small className="learning-adventure__level-reward">
                        {earnedText ? `مكتسبة: ${earnedText}` : `مكافأة الإكمال: ${configuredRewards}`}
                      </small>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="learning-adventure__world" aria-label="خريطة محطات الأنشطة">
        <svg className="learning-adventure__scenery" viewBox={`0 0 1000 ${trailHeight}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={`M0 0 H1000 V${trailHeight} H0 Z`} fill="#eef8e9" />
          <path d={`M0 90 C190 18 270 146 475 82 S790 18 1000 100 V${trailHeight} H0 Z`} fill="#e2f2df" />
          <path d={`M0 ${trailHeight - 130} C240 ${trailHeight - 200} 340 ${trailHeight - 70} 570 ${trailHeight - 130} S820 ${trailHeight - 190} 1000 ${trailHeight - 95} V${trailHeight} H0 Z`} fill="#e9f5df" />
          {stations.map((_, index) => index % 2 === 0 ? (
            <g className="learning-adventure__tree" key={index}
              transform={`translate(${index % 4 === 0 ? 90 : 900} ${165 + index * 210})`}>
              <path d="M-5 24 V74 M-5 42 C-52 40-48 12-5 20 M-5 55 C40 54 38 28-5 34"
                fill="none" stroke="#91b881" strokeWidth="8" strokeLinecap="round" />
              <circle cx="-24" cy="14" r="16" fill="#a9cf91" />
              <circle cx="13" cy="28" r="19" fill="#bbdba4" />
            </g>
          ) : null)}
        </svg>
        <svg className="learning-adventure__trail" viewBox={`0 0 1000 ${trailHeight}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={buildTrailPath(stations.length)} fill="none" stroke="#c4a366" strokeWidth="34" strokeLinecap="round" />
          <path d={buildTrailPath(stations.length)} fill="none" stroke="#fff0c8" strokeWidth="22" strokeLinecap="round" />
          <path d={buildTrailPath(stations.length)} fill="none" stroke="#d4b776" strokeWidth="3" strokeDasharray="4 19" strokeLinecap="round" />
        </svg>
        <ol className="learning-adventure__stations">
          {stations.map((station, index) => {
            const starsEarned = Math.max(0, Number(starsByGame?.[station.id]) || 0);
            const guideAtStation = station.id === nextStation?.id;
            const levelLocked = station.level?.status === 'locked';
            const lockedMessage = levelLocked
              ? 'أكمل المستوى السابق لفتح هذه المحطة.'
              : 'أكمل التحدي السابق لفتح هذه اللعبة.';
            return (
              <li className={`learning-adventure__stop learning-adventure__stop--${station.status}`}
                key={station.id} aria-label={`${index + 1}. ${station.title}: ${stationStatusLabels[station.status]}`}>
                <span className="learning-adventure__path-node" aria-hidden="true">{index + 1}</span>
                <article className="learning-adventure__station">
                  <div className={`learning-adventure__art learning-adventure__art--${station.status}`}>
                    {station.companionAnimalImageUrl
                      ? <GameImage src={station.companionAnimalImageUrl} alt=""
                        className="learning-adventure__art-image"
                        fallback={<StationIllustration template={station.template} variant={index} />} />
                      : <StationIllustration template={station.template} variant={index} />}
                    {station.status === 'locked' && (
                      <span className="learning-adventure__lock" aria-label="مقفلة">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="5" y="10" width="14" height="11" rx="2" />
                          <path d="M8 10 V7a4 4 0 0 1 8 0v3" />
                        </svg>
                      </span>
                    )}
                    {station.status === 'completed' && <span className="learning-adventure__done" aria-label="مكتملة">✓</span>}
                  </div>
                  <div className="learning-adventure__station-copy">
                    <div className="learning-adventure__station-meta">
                      <span>{station.level?.title ?? station.learningArea ?? 'تحدي تعليمي'}</span>
                      <b className={`learning-adventure__status learning-adventure__status--${station.status}`}>
                        {stationStatusLabels[station.status]}
                      </b>
                    </div>
                    <h3>{station.title}</h3>
                    <p>{station.description}</p>
                    {starsEarned > 0 && (
                      <span className="learning-adventure__earned-stars">✦ {starsEarned} نجمة مكتسبة من هذا النشاط</span>
                    )}
                    {station.status === 'locked' ? (
                      <>
                        <small className="learning-adventure__locked-copy">{lockedMessage}</small>
                        <button className="learning-adventure__action learning-adventure__action--locked"
                          type="button" disabled>
                          <span aria-hidden="true">−</span> المحطة مقفلة
                        </button>
                      </>
                    ) : (
                      <a className={`learning-adventure__action${station.status === 'completed' ? ' learning-adventure__action--replay' : ''}`}
                        href={gameHref(station.id)}>
                        {station.status === 'completed' ? 'أعد اللعب' : 'العب الآن'}
                        <span aria-hidden="true">←</span>
                      </a>
                    )}
                  </div>
                  {guideAtStation && (
                    <HarfMascot expression="listening" className="learning-adventure__station-mascot" />
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      </section>
    </section>
  );
}
