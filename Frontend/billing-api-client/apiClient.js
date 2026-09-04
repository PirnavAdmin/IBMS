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

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    if (error.response) {
      const data = error.response.data;
      let message = 'An unexpected server error occurred.';
      if (typeof data === 'string') {
        if (data.includes('ERR_NGROK_3200') || data.includes('offline')) {
          message = 'The backend ngrok tunnel (pediatric-astrology-outrank.ngrok-free.dev) is offline (ERR_NGROK_3200). Please ensure your backend is running on http://localhost:44334 and ngrok is active.';
        } else {
          message = data;
        }
      } else if (data?.message) {
        message = data.message;
      } else if (data?.title) {
        message = data.title;
      } else if (data?.errors) {
        const errorList = Object.values(data.errors).flat();
        if (errorList.length > 0) message = errorList.join(' ');
      }
      return Promise.reject(new Error(message));
    } else if (error.request) {
      if (typeof window !== 'undefined' && error.config && !error.config._retryProxy && error.config.baseURL !== '') {
        try {
          const retryConfig = {
            ...error.config,
            baseURL: '',
            _retryProxy: true,
          };
          const res = await axios(retryConfig);
          return res.data;
        } catch (retryError) {
          if (retryError.response) {
            const rData = retryError.response.data;
            let rMsg = 'Server returned error ' + retryError.response.status;
            if (typeof rData === 'string' && (rData.includes('ERR_NGROK_3200') || rData.includes('offline'))) {
              rMsg = 'The backend ngrok tunnel (pediatric-astrology-outrank.ngrok-free.dev) is offline (ERR_NGROK_3200). Please ensure your backend is running on http://localhost:44334 and ngrok is active.';
            } else if (rData?.message) {
              rMsg = rData.message;
            } else if (rData?.errors) {
              const errs = Object.values(rData.errors).flat();
              if (errs.length) rMsg = errs.join(' ');
            }
            return Promise.reject(new Error(rMsg));
          }
        }
      }

      return Promise.reject(
        new Error(
          'Unable to connect to https://pediatric-astrology-outrank.ngrok-free.dev. The ngrok tunnel is currently offline (ERR_NGROK_3200) or unreachable.'
        )
      );
    }
    return Promise.reject(error);
  }
);

export default apiClient;