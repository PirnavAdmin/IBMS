import axios from 'axios';
import { connectionFailureMessage, transportErrorMessage } from './transportError.js';
import { parseCustomerError } from '../billing-contracts/customer.contracts.js';

export const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

export const clearAuthStorage = () => {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem('billing_auth_token');
  localStorage.removeItem('billing_auth_user');
  localStorage.removeItem('billing_refresh_token');
  localStorage.removeItem('billing_last_activity_at');
};

export const recordUserActivity = (timestamp = Date.now()) => {
  if (typeof localStorage === 'undefined') return;
  if (!localStorage.getItem('billing_auth_token')) return;
  localStorage.setItem('billing_last_activity_at', String(timestamp));
};

export const getLastUserActivity = () => {
  if (typeof localStorage === 'undefined') return 0;
  const raw = Number(localStorage.getItem('billing_last_activity_at'));
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
};

export const saveAuthSession = ({ token, user, refreshToken, activityAt = Date.now() } = {}) => {
  if (typeof localStorage === 'undefined') return;
  if (token) {
    localStorage.setItem('billing_auth_token', String(token).replace(/^(?:Bearer\s+)+/i, '').trim());
    localStorage.setItem('billing_last_activity_at', String(activityAt));
  }
  if (user) {
    localStorage.setItem('billing_auth_user', JSON.stringify(user));
  }
  if (refreshToken) {
    localStorage.setItem('billing_refresh_token', String(refreshToken).trim());
  }
};

export const getAccessTokenExpirationMs = (token) => {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.replace(/^(?:Bearer\s+)+/i, '').trim().split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function'
      ? atob(base64)
      : typeof Buffer !== 'undefined'
        ? Buffer.from(base64, 'base64').toString('utf-8')
        : null;
    if (!json) return null;
    const payload = JSON.parse(json);
    return Number.isFinite(payload?.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

const resolveBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  const configured = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL;
  return configured || 'http://127.0.0.1:5271';
};

export const BACKEND_URL = String(resolveBaseUrl()).replace(/\/+$/, '');
// dynamically resolved base url
export const API_BASE_URL = BACKEND_URL;

const isAuthLifecycleEndpoint = (url = '') => {
  const lower = String(url).toLowerCase();
  return (
    lower.includes('/auth/login') ||
    lower.includes('/auth/register') ||
    lower.includes('/auth/refresh-token') ||
    lower.includes('/auth/logout') ||
    lower.includes('/auth/forgot-password') ||
    lower.includes('/auth/verify-otp') ||
    lower.includes('/auth/reset-password')
  );
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
  timeout: 15000,
});

apiClient.interceptors.request.use(
  (config) => {
    if (typeof localStorage !== 'undefined') {
      const token = localStorage.getItem('billing_auth_token')?.replace(/^(?:Bearer\s+)+/i, '').trim();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      try {
        const rawUser = localStorage.getItem('billing_auth_user');
        if (rawUser) {
          const user = JSON.parse(rawUser);
          const tid = user?.tenantId ?? user?.tenant_id;
          if (tid != null && tid !== '') {
            config.headers['X-Tenant-Id'] = String(tid);
          }
        }
      } catch {}
    }
    if (config.backgroundPoll) {
      config.headers = config.headers || {};
      config.headers['X-Background-Poll'] = 'true';
    } else if (config.headers?.Authorization && !isAuthLifecycleEndpoint(config.url)) {
      recordUserActivity();
    }
    config.params = {
      ...config.params,
      'ngrok-skip-browser-warning': 'true',
    };
    return config;
  },
  (error) => Promise.reject(error)
);

const safeValidationMessage = (data) => {
  if (typeof data === 'string') return data.length <= 180 && !data.includes('<html') ? data : 'Something went wrong';
  if (data?.message) return data.message;
  if (data?.detail) return data.detail;
  if (data?.title) return data.title;
  if (data?.errors) {
    const messages = Object.values(data.errors).flat();
    if (messages.length) return messages.join(' ');
  }
  return 'Something went wrong';
};

const backendProblemMessage = (data) => data?.message || data?.detail || data?.title ||
  (Array.isArray(data?.errors) ? data.errors.filter(Boolean).join(' ') : null) ||
  (data?.errors && typeof data.errors === 'object' ? Object.values(data.errors).flat().filter(Boolean).join(' ') : null);

export const getUserFriendlyError = (error) => {
  const transportMessage = transportErrorMessage(error);
  if (transportMessage) return transportMessage;
  // Scope Customer error policy to Customer calls; other modules retain their behavior.
  if (/\/api\/v1\/customers(?:[/?]|$)/i.test(error?.config?.url || '')) return parseCustomerError(error);
  const status = error?.response?.status;
  if (!error?.response) return connectionFailureMessage();
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return backendProblemMessage(error.response.data) || 'The requested record or endpoint was not found.';
  if (status === 409) return backendProblemMessage(error.response.data) || 'The record changed state. Refresh it and try again.';
  if (status === 422) return safeValidationMessage(error.response.data) || 'The request did not pass validation.';
  return safeValidationMessage(error.response.data);
};

let refreshPromise = null;

export const refreshAuthSession = async ({ backgroundPoll = false } = {}) => {
  if (typeof localStorage === 'undefined') return null;
  const refreshToken = localStorage.getItem('billing_refresh_token')?.trim();
  if (!refreshToken) return null;

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await apiClient.post(
        '/api/Auth/refresh-token',
        { refreshToken },
        { skipAuthRedirect: true, _skipRefresh: true, backgroundPoll }
      );
      const payload = response?.data || response;
      const nextToken = String(payload?.accessToken || payload?.token || '')
        .replace(/^(?:Bearer\s+)+/i, '')
        .trim();
      if (!nextToken) return null;

      saveAuthSession({
        token: nextToken,
        user: payload?.user,
        refreshToken: payload?.refreshToken,
        activityAt: backgroundPoll ? (getLastUserActivity() || Date.now()) : Date.now(),
      });
      return nextToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const transportMessage = transportErrorMessage(error);
    const config = error?.config;
    if (
      !transportMessage &&
      error?.response?.status === 401 &&
      config?.headers?.Authorization &&
      !config?._skipRefresh &&
      !config?._retriedAfterRefresh &&
      !isAuthLifecycleEndpoint(config?.url)
    ) {
      const sentToken = String(config.headers.Authorization).replace(/^(?:Bearer\s+)+/i, '').trim();
      const storedToken = typeof localStorage !== 'undefined'
        ? localStorage.getItem('billing_auth_token')?.replace(/^(?:Bearer\s+)+/i, '').trim()
        : '';

      // Reuse a replacement token if another concurrent request or tab already refreshed it.
      let nextToken = storedToken && storedToken !== sentToken ? storedToken : null;
      if (!nextToken) {
        nextToken = await refreshAuthSession({ backgroundPoll: Boolean(config.backgroundPoll) });
      }
      if (nextToken) {
        config._retriedAfterRefresh = true;
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${nextToken}`;
        return apiClient.request(config);
      }

      clearAuthStorage();
      if (!config?.skipAuthRedirect && typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.replace('/login?reason=session-expired');
      }
    }
    const message = transportMessage || getUserFriendlyError(error);
    const normalizedError = new Error(message);
    normalizedError.userMessage = message;
    normalizedError.code = error?.code;
    normalizedError.response = error?.response;
    return Promise.reject(normalizedError);
  }
);

export default apiClient;
