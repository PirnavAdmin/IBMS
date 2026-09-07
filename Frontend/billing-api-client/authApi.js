import { apiClient } from './apiClient.js';
import { API_ENDPOINTS } from './endpoints.js';
import {
  createRegisterRequest,
  createLoginRequest,
  createForgotPasswordRequest,
  createVerifyOtpRequest,
  createResetPasswordRequest,
  parseLoginResponse,
  parseAuthError,
} from '../billing-contracts/index.js';

export const authApi = {
  register: async (data) => {
    try {
      const payload = createRegisterRequest(data);
      return await apiClient.post(API_ENDPOINTS.AUTH.REGISTER, payload);
    } catch (err) {
      throw new Error(parseAuthError(err, 'Failed to complete registration.'));
    }
  },

  login: async (data) => {
    try {
      const payload = createLoginRequest(data);
      const response = await apiClient.post(API_ENDPOINTS.AUTH.LOGIN, payload);
      const { token, user } = parseLoginResponse(response);
      if (token && typeof localStorage !== 'undefined') {
        localStorage.setItem('billing_auth_token', token);
        // Preserve the existing profile and use the submitted email when no profile is returned.
        localStorage.setItem('billing_auth_user', JSON.stringify({ email: data.email?.trim(), ...user }));
      }
      return response;
    } catch (err) {
      throw new Error(parseAuthError(err, 'Login failed. Please check your credentials and try again.'));
    }
  },

  forgotPassword: async (emailOrData) => {
    try {
      const data = typeof emailOrData === 'string' ? { email: emailOrData } : emailOrData;
      const payload = createForgotPasswordRequest(data);
      return await apiClient.post(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, payload);
    } catch (err) {
      throw new Error(parseAuthError(err, 'Unable to send recovery code. Please check your email.'));
    }
  },

  verifyOtp: async (data) => {
    try {
      const payload = createVerifyOtpRequest(data);
      return await apiClient.post(API_ENDPOINTS.AUTH.VERIFY_OTP, payload);
    } catch (err) {
      throw new Error(parseAuthError(err, 'Invalid or expired OTP code.'));
    }
  },

  resetPassword: async (data) => {
    try {
      const payload = createResetPasswordRequest(data);
      return await apiClient.post(API_ENDPOINTS.AUTH.RESET_PASSWORD, payload);
    } catch (err) {
      throw new Error(parseAuthError(err, 'Failed to reset password. Please try again.'));
    }
  },

  logout: () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('billing_auth_token');
      localStorage.removeItem('billing_auth_user');
    }
  },

  getCurrentUser: () => {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('billing_auth_user');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  isAuthenticated: () => {
    if (typeof localStorage === 'undefined') return false;
    return Boolean(localStorage.getItem('billing_auth_token'));
  },
};

export default authApi;