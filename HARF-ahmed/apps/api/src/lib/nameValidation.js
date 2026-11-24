export function isReadableName(value) {
  return typeof value === 'string'
    && /[\p{L}\p{N}]/u.test(value)
    && !/[?\uFFFD]/u.test(value);
}
