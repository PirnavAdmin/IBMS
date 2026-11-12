import { apiClient, clearAuthStorage, saveAuthSession } from './apiClient.js';
import { transportErrorMessage } from './transportError.js';
import { API_ENDPOINTS } from './endpoints.js';
import {
  createRegisterRequest,
  createSendRegistrationOtpRequest,
  createLoginRequest,
  createForgotPasswordRequest,
  createVerifyOtpRequest,
  createResetPasswordRequest,
  parseLoginResponse,
  parseAuthError,
} from '../billing-contracts/index.js';

export const authApi = {
  sendRegistrationOtp: async (emailOrData) => {
    try {
      const data = typeof emailOrData === 'string' ? { email: emailOrData } : emailOrData;
      const payload = createSendRegistrationOtpRequest(data);
      return await apiClient.post(API_ENDPOINTS.AUTH.SEND_REGISTRATION_OTP, payload);
    } catch (err) {
      throw new Error(transportErrorMessage(err) || parseAuthError(err, 'Unable to send verification OTP. Please check your email.'));
    }
  },

  verifyRegistrationOtp: async (data) => {
    try {
      const payload = createVerifyOtpRequest(data);
      return await apiClient.post(API_ENDPOINTS.AUTH.VERIFY_REGISTRATION_OTP, payload);
    } catch (err) {
      throw new Error(transportErrorMessage(err) || parseAuthError(err, 'Invalid or expired OTP code.'));
    }
  },

  register: async (data) => {
    try {
      const payload = createRegisterRequest(data);
      return await apiClient.post(API_ENDPOINTS.AUTH.REGISTER, payload);
    } catch (err) {
      throw new Error(transportErrorMessage(err) || parseAuthError(err, 'Failed to complete registration.'));
    }
  },

  login: async (data) => {
    try {
      const payload = createLoginRequest(data);
      const response = await apiClient.post(API_ENDPOINTS.AUTH.LOGIN, payload);
      const { token, user, refreshToken } = parseLoginResponse(response);
      if (token && typeof localStorage !== 'undefined') {
        saveAuthSession({
          token,
          // Preserve the existing profile and use the submitted email when no profile is returned.
          user: { email: data.email?.trim(), ...user },
          refreshToken,
        });
      }
      return response;
    } catch (err) {
      throw new Error(transportErrorMessage(err) || parseAuthError(err, 'Login failed. Please check your credentials and try again.'));
    }
  },

  forgotPassword: async (emailOrData) => {
    try {
      const data = typeof emailOrData === 'string' ? { email: emailOrData } : emailOrData;
      const payload = createForgotPasswordRequest(data);
      return await apiClient.post(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, payload);
    } catch (err) {
      throw new Error(transportErrorMessage(err) || parseAuthError(err, 'Unable to send recovery code. Please check your email.'));
    }
  },

  verifyOtp: async (data) => {
    try {
      const payload = createVerifyOtpRequest(data);
      return await apiClient.post(API_ENDPOINTS.AUTH.VERIFY_OTP, payload);
    } catch (err) {
      throw new Error(transportErrorMessage(err) || parseAuthError(err, 'Invalid or expired OTP code.'));
    }
  },

  resetPassword: async (data) => {
    try {
      const payload = createResetPasswordRequest(data);
      return await apiClient.post(API_ENDPOINTS.AUTH.RESET_PASSWORD, payload);
    } catch (err) {
      throw new Error(transportErrorMessage(err) || parseAuthError(err, 'Failed to reset password. Please try again.'));
    }
  },

  logout: () => {
    if (typeof localStorage !== 'undefined') {
      const token = localStorage.getItem('billing_auth_token');
      const refreshToken = localStorage.getItem('billing_refresh_token');
      if (token) {
        try {
          Promise.resolve(
            apiClient.post(
              API_ENDPOINTS.AUTH.LOGOUT,
              refreshToken ? { refreshToken } : {},
              {
                skipAuthRedirect: true,
                _skipRefresh: true,
                headers: { Authorization: `Bearer ${token.replace(/^(?:Bearer\s+)+/i, '').trim()}` },
              }
            )
          ).catch(() => {});
        } catch {}
      }
      clearAuthStorage();
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
