import axios from 'axios';
import { parseCustomerError } from '../billing-contracts/customer.contracts.js';

export const BACKEND_URL = 'https://pediatric-astrology-outrank.ngrok-free.dev';
export const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || BACKEND_URL;

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
  if (data?.title) return data.title;
  if (data?.errors) {
    const messages = Object.values(data.errors).flat();
    if (messages.length) return messages.join(' ');
  }
  return 'Something went wrong';
};

export const getUserFriendlyError = (error) => {
  // Scope Customer error policy to Customer calls; other modules retain their behavior.
  if (/\/api\/v1\/customers(?:[/?]|$)/i.test(error?.config?.url || '')) return parseCustomerError(error);
  const status = error?.response?.status;
  const responseText = typeof error?.response?.data === 'string' ? error.response.data : '';
  if (!error?.response || status >= 500 || responseText.includes('ERR_NGROK') || responseText.toLowerCase().includes('ngrok') || responseText.toLowerCase().includes('offline')) return 'Network Error';
  return safeValidationMessage(error.response.data);
};

apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error?.response?.status === 401 && error.config?.headers?.Authorization && !error.config?.url?.toLowerCase().includes('/auth/')) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('billing_auth_token');
        localStorage.removeItem('billing_auth_user');
      }
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') window.location.replace('/login?reason=session-expired');
    }
    const message = getUserFriendlyError(error);
    const normalizedError = new Error(message);
    normalizedError.userMessage = message;
    normalizedError.code = error?.code;
    normalizedError.response = error?.response;
    return Promise.reject(normalizedError);
  }
);

export default apiClient;
