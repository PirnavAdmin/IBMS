import axios from 'axios';

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
      const token = localStorage.getItem('billing_auth_token');
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
  const status = error?.response?.status;
  const responseText = typeof error?.response?.data === 'string' ? error.response.data : '';
  if (!error?.response || status >= 500 || responseText.includes('ERR_NGROK') || responseText.toLowerCase().includes('ngrok') || responseText.toLowerCase().includes('offline')) return 'Network Error';
  return safeValidationMessage(error.response.data);
};

apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = getUserFriendlyError(error);
    const normalizedError = new Error(message);
    normalizedError.userMessage = message;
    normalizedError.code = error?.code;
    if (message !== 'Network Error') normalizedError.response = error?.response;
    return Promise.reject(normalizedError);
  }
);

export default apiClient;
