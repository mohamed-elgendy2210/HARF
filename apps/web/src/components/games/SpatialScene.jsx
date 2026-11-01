import { getApiUrl } from '../../lib/api.js';

export function initialSpatialPositions(spatial) {
  return Object.fromEntries(spatial.scene.objects.map((item) => [item.id, { x: item.x, y: item.y }]));
}

export default function SpatialScene({
  spatial,
  positions,
  activeObjectId = null,
  selectedObjectId = null,
  targetRegion = null,
  showTarget = false,
  demonstration = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onObjectClick,
  onSceneClick
}) {
  const activeStep = spatial.steps[activeObjectId?.stepIndex ?? 0];
  const movable = spatial.scene.objects.find(({ id }) => id === activeStep?.movableObjectId);
  const ghostX = movable && activeStep
    ? Math.max(0, Math.min(1000 - movable.width,
      activeStep.targetRegion.x + (activeStep.targetRegion.width - movable.width) / 2))
    : 0;
  const ghostY = movable && activeStep
    ? Math.max(0, Math.min(1000 - movable.height,
      activeStep.targetRegion.y + (activeStep.targetRegion.height - movable.height) / 2))
    : 0;

  return (
    <div
      className="spatial-scene"
      style={{
        aspectRatio: String(spatial.scene.aspectRatio)
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onSceneClick}
      role="group"
      aria-label="مشهد تفاعلي للعلاقات المكانية"
    >
      {spatial.scene.backgroundUrl && (
        <img className="spatial-scene__background" src={getApiUrl(spatial.scene.backgroundUrl)}
          alt="" aria-hidden="true" crossOrigin="use-credentials" draggable="false" />
      )}
      {showTarget && targetRegion && (
        <div
          className="spatial-scene__target"
          aria-hidden="true"
          style={{
            left: `${targetRegion.x / 10}%`,
            top: `${targetRegion.y / 10}%`,
            width: `${targetRegion.width / 10}%`,
            height: `${targetRegion.height / 10}%`
          }}
        />
      )}
      {spatial.scene.objects.map((item) => {
        const position = positions?.[item.id] ?? item;
        const current = item.id === activeObjectId?.objectId;
        const selected = item.id === selectedObjectId;
        return (
          <button
            type="button"
            className={`spatial-scene__object${item.movable ? ' is-movable' : ''}${current ? ' is-active' : ''}${selected ? ' is-selected' : ''}`}
            key={item.id}
            style={{
              left: `${position.x / 10}%`,
              top: `${position.y / 10}%`,
              width: `${item.width / 10}%`,
              height: `${item.height / 10}%`,
              zIndex: selected ? 100 : item.layer
            }}
            aria-label={`${item.movable ? 'عنصر قابل للتحريك' : 'عنصر ثابت'}: ${item.label}`}
            aria-pressed={selected}
            onPointerDown={(event) => onPointerDown?.(event, item)}
            onClick={(event) => onObjectClick?.(event, item)}
          >
            {item.imageUrl
              ? <img src={getApiUrl(item.imageUrl)} alt={item.altText || item.label}
                crossOrigin="use-credentials" draggable="false" />
              : <span className="spatial-scene__placeholder" aria-hidden="true">▧</span>}
            <span className="spatial-scene__object-label">{item.label}</span>
          </button>
        );
      })}
      {demonstration && movable && (
        <img
          className="spatial-scene__demonstration"
          src={getApiUrl(movable.imageUrl)}
          alt=""
          aria-hidden="true"
          style={{
            left: `${ghostX / 10}%`,
            top: `${ghostY / 10}%`,
            width: `${movable.width / 10}%`,
            height: `${movable.height / 10}%`,
            zIndex: movable.layer + 1
          }}
        />
      )}
    </div>
  );
}
