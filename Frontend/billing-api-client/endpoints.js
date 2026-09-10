export const API_ENDPOINTS = {
  AUTH: {
    REGISTER: '/api/Auth/register',
    LOGIN: '/api/Auth/login',
    FORGOT_PASSWORD: '/api/Auth/forgot-password',
    VERIFY_OTP: '/api/Auth/verify-otp',
    RESET_PASSWORD: '/api/Auth/reset-password',
  },
  CUSTOMERS: {
    BASE: '/api/v1/customers',
    BY_ID: (id) => `/api/v1/customers/${id}`,
    DEACTIVATE: (id) => `/api/v1/customers/${id}/deactivate`,
    DETAILS: (id) => `/api/v1/customers/${id}/details`,
  },
};

export default API_ENDPOINTS;