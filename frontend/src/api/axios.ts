import axios, {
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore } from '../store/auth.store';

const BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach access token to every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Phase 4 hardening: single-flight refresh.
 *
 * If multiple requests fire while the access token is expired, we only
 * call /auth/refresh ONCE and have everyone else await the same promise.
 * Without this, N concurrent 401s would each trigger a refresh and the
 * server's in-memory refresh-token store could see them as suspicious
 * concurrent uses.
 */
let inflightRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (inflightRefresh) return inflightRefresh;

  inflightRefresh = (async () => {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) return null;
    try {
      const res = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken });
      const next = res.data?.data?.accessToken as string | undefined;
      if (!next) return null;
      useAuthStore.getState().updateToken(next);
      return next;
    } catch {
      return null;
    } finally {
      // Reset on next tick so retries within the same call re-share, but
      // a subsequent independent 401 starts fresh.
      window.setTimeout(() => {
        inflightRefresh = null;
      }, 0);
    }
  })();

  return inflightRefresh;
}

/** URLs we never auto-refresh against — bad creds shouldn't loop. */
const NO_REFRESH = [/\/auth\/login$/, /\/auth\/refresh$/, /\/auth\/logout$/];

function shouldSkipRefresh(url: string | undefined): boolean {
  if (!url) return false;
  return NO_REFRESH.some((re) => re.test(url));
}

// Handle 401 — try refresh, then drop to login
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (AxiosRequestConfig & { _retry?: boolean })
      | undefined;

    if (
      originalRequest &&
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !shouldSkipRefresh(originalRequest.url)
    ) {
      originalRequest._retry = true;

      const next = await refreshAccessToken();
      if (next) {
        if (!originalRequest.headers) originalRequest.headers = {};
        (originalRequest.headers as any).Authorization = `Bearer ${next}`;
        return api(originalRequest);
      }

      // Refresh failed — clear auth and emit a one-shot event the App
      // listens for so it can show the "session expired" modal. Avoid
      // hard navigating here so we don't blow away the modal before the
      // user sees it.
      useAuthStore.getState().logout();
      window.dispatchEvent(new CustomEvent('janseva:session-expired'));
    }

    return Promise.reject(error);
  },
);

export default api;
