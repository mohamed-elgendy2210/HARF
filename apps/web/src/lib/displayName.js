export function displayNameOrFallback(value, fallback = 'أخصائي') {
  return typeof value === 'string'
    && /[\p{L}\p{N}]/u.test(value)
    && !/[?\uFFFD]/u.test(value)
    ? value
    : fallback;
}
