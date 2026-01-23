const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

const envBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL || '';

export const apiBase = (() => {
  if (envBase) return trimTrailingSlash(envBase);
  if (import.meta.env.DEV) return 'http://localhost:8080';
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
})();

export const apiUrl = (path = '') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!apiBase) return normalizedPath;
  return `${apiBase}${normalizedPath}`;
};
