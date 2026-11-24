function bounds(position) {
  return {
    left: position.x,
    top: position.y,
    right: position.x + position.width,
    bottom: position.y + position.height,
    centerX: position.x + position.width / 2,
    centerY: position.y + position.height / 2
  };
}

function contains(region, position, tolerance = 0) {
  const item = bounds(position);
  return item.left >= region.x - tolerance
    && item.top >= region.y - tolerance
    && item.right <= region.x + region.width + tolerance
    && item.bottom <= region.y + region.height + tolerance;
}

function overlaps(first, second, tolerance = 0) {
  const a = bounds(first);
  const b = bounds(second);
  return a.left < b.right - tolerance
    && a.right > b.left + tolerance
    && a.top < b.bottom - tolerance
    && a.bottom > b.top + tolerance;
}

function distanceBetween(first, second) {
  const a = bounds(first);
  const b = bounds(second);
  const dx = Math.max(0, b.left - a.right, a.left - b.right);
  const dy = Math.max(0, b.top - a.bottom, a.top - b.bottom);
  return Math.hypot(dx, dy);
}

function distanceToSegment(point, first, second) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - first.x) * dx + (point.y - first.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (first.x + projection * dx), point.y - (first.y + projection * dy));
}

export function validateSpatialPlacement(spatial, stepIndex, position) {
  const step = spatial.steps[stepIndex];
  if (!step || !position) return false;
  const movable = spatial.scene.objects.find(({ id }) => id === step.movableObjectId);
  const target = spatial.scene.objects.find(({ id }) => id === step.targetObjectId);
  const secondTarget = spatial.scene.objects.find(({ id }) => id === step.secondTargetObjectId);
  if (!movable || (step.targetObjectId && !target)
    || (step.secondTargetObjectId && !secondTarget)) return false;
  const moved = { ...position, width: movable.width, height: movable.height };
  const movedBounds = bounds(moved);
  const withinRegion = contains(step.targetRegion, moved, step.tolerance);

  switch (step.relationship) {
    case 'inside':
      return withinRegion;
    case 'outside':
      return !contains(step.targetRegion, moved)
        && (!target || !overlaps(moved, target));
    case 'above':
      return withinRegion && movedBounds.bottom <= target.y + step.tolerance;
    case 'below':
      return withinRegion && movedBounds.top >= target.y + target.height - step.tolerance;
    case 'front':
      return withinRegion && movable.layer > target.layer;
    case 'behind':
      return withinRegion && movable.layer < target.layer;
    case 'next-to':
      return withinRegion && distanceBetween(moved, target) <= step.tolerance;
    case 'between': {
      if (!withinRegion || !secondTarget) return false;
      const first = bounds(target);
      const second = bounds(secondTarget);
      return distanceToSegment(
        { x: movedBounds.centerX, y: movedBounds.centerY },
        { x: first.centerX, y: first.centerY },
        { x: second.centerX, y: second.centerY }
      ) <= step.tolerance;
    }
    default:
      return false;
  }
}

export function hasValidSpatialTarget(spatial, stepIndex) {
  const step = spatial.steps[stepIndex];
  const movable = spatial.scene.objects.find(({ id }) => id === step?.movableObjectId);
  if (!step || !movable) return false;
  const target = spatial.scene.objects.find(({ id }) => id === step.targetObjectId);
  const searchEntireScene = step.relationship === 'outside';
  const horizontalRange = searchEntireScene ? {
    minimum: 0,
    maximum: 1000 - movable.width
  } : {
    minimum: Math.max(0, step.targetRegion.x - step.tolerance),
    maximum: Math.min(1000 - movable.width, step.targetRegion.x + step.targetRegion.width + step.tolerance - movable.width)
  };
  const verticalRange = searchEntireScene ? {
    minimum: 0,
    maximum: 1000 - movable.height
  } : {
    minimum: Math.max(0, step.targetRegion.y - step.tolerance),
    maximum: Math.min(1000 - movable.height, step.targetRegion.y + step.targetRegion.height + step.tolerance - movable.height)
  };
  if (horizontalRange.minimum > horizontalRange.maximum || verticalRange.minimum > verticalRange.maximum) return false;

  const candidates = (range, start, extent, targetStart, targetExtent, objectExtent) => {
    const values = [
      range.minimum,
      range.maximum,
      (range.minimum + range.maximum) / 2,
      start,
      start + extent - objectExtent
    ];
    if (target) values.push(targetStart - objectExtent, targetStart, targetStart + targetExtent - objectExtent, targetStart + targetExtent);
    for (let value = Math.ceil(range.minimum / 10) * 10; value <= range.maximum; value += 10) values.push(value);
    return [...new Set(values.filter((value) => value >= range.minimum && value <= range.maximum))];
  };
  const xCandidates = candidates(
    horizontalRange,
    step.targetRegion.x,
    step.targetRegion.width,
    target?.x ?? 0,
    target?.width ?? 0,
    movable.width
  );
  const yCandidates = candidates(
    verticalRange,
    step.targetRegion.y,
    step.targetRegion.height,
    target?.y ?? 0,
    target?.height ?? 0,
    movable.height
  );
  return xCandidates.some((x) => yCandidates.some((y) => (
    validateSpatialPlacement(spatial, stepIndex, { x, y })
  )));
}
