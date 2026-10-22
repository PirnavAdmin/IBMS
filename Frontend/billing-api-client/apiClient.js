import axios from 'axios';
import { connectionFailureMessage, transportErrorMessage } from './transportError.js';
    import { parseCustomerError } from '../billing-contracts/customer.contracts.js';

export const BACKEND_URL = 'https://pediatric-astrology-outrank.ngrok-free.dev';
const configuredBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || BACKEND_URL;
export const API_BASE_URL = String(configuredBaseUrl).replace(/\/+$/, '');

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

apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const transportMessage = transportErrorMessage(error);
    if (
      !transportMessage &&
      error?.response?.status === 401 &&
      error.config?.headers?.Authorization &&
      !error.config?.url?.toLowerCase().includes('/auth/') &&
      !error.config?.skipAuthRedirect
    ) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('billing_auth_token');
        localStorage.removeItem('billing_auth_user');
      }
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
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
