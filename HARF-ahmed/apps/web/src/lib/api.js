const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';
let csrfToken = '';

export function getApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = configuredBaseUrl.replace(/\/+$/, '');
  const apiUrl = baseUrl ? new URL(normalizedPath, `${baseUrl}/`) : new URL(normalizedPath, window.location.origin);

  if (window.location.protocol === 'https:' && apiUrl.protocol !== 'https:') {
    throw new Error('The API must use HTTPS when the application is served over HTTPS.');
  }

  return apiUrl.toString();
}

export function setCsrfToken(token) {
  csrfToken = typeof token === 'string' ? token : '';
}

export async function apiRequest(path, options = {}) {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = {
    Accept: 'application/json',
    ...options.headers
  };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch(getApiUrl(path), {
    ...options,
    method,
    credentials: 'include',
    headers
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(payload?.error?.message ?? `API request failed with status ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}
