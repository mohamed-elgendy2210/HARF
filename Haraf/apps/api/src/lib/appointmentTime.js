const QUARTER_HOUR_MS = 15 * 60 * 1000;

function datePartsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, Number(value)]));
}

function utcValue({ year, month, day, hour, minute }) {
  return Date.UTC(year, month - 1, day, hour, minute);
}

export function assertTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(new Date());
  } catch {
    return false;
  }
  return true;
}

export function localDateKey(date, timeZone) {
  const { year, month, day } = datePartsInZone(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addLocalDays(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function localDateTimeToUtc(dateKey, clockTime, timeZone) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = clockTime.split(':').map(Number);
  const target = { year, month, day, hour, minute };
  const targetValue = utcValue(target);
  let candidate = targetValue;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = datePartsInZone(new Date(candidate), timeZone);
    const adjustment = targetValue - utcValue(observed);
    if (adjustment === 0) return new Date(candidate);
    candidate += adjustment;
  }
  return null;
}

export function reservationKeys(startsAt, durationMinutes) {
  const start = new Date(startsAt).getTime();
  if (!Number.isFinite(start) || start % QUARTER_HOUR_MS !== 0
    || durationMinutes % 15 !== 0) return null;
  return Array.from({ length: durationMinutes / 15 }, (_, index) => (
    new Date(start + index * QUARTER_HOUR_MS)
  ));
}

export function localDayOfWeek(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function appointmentLocalLabel(date, timeZone, locale = 'ar-EG') {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(date));
}

export { QUARTER_HOUR_MS };
