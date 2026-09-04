/**
 * Authentication Contracts (Invoice & Billing Platform)
 * Confirmed via backend Swagger schemas
 */

export const createRegisterRequest = ({ name, email, password, confirmPassword }) => ({
  name: name?.trim() || '',
  email: email?.trim() || '',
  password: password || '',
  confirmPassword: confirmPassword || '',
});

export const createLoginRequest = ({ email, password }) => ({
  email: email?.trim() || '',
  password: password || '',
});

export const createForgotPasswordRequest = ({ email }) => ({
  email: email?.trim() || '',
});

export const createVerifyOtpRequest = ({ email, otp }) => ({
  email: email?.trim() || '',
  otp: String(otp || '').trim(),
});

export const createResetPasswordRequest = ({ email, newPassword, confirmPassword }) => ({
  email: email?.trim() || '',
  newPassword: newPassword || '',
  confirmPassword: confirmPassword || '',
});

/**
 * Normalizes backend login response into standard token & user objects
 */
export const parseLoginResponse = (response) => {
  if (!response) return { token: null, user: null };
  const raw = response.data || response;
  const token = raw.token || raw.accessToken || raw.jwt || raw.bearerToken || null;
  const user = raw.user || raw.userInfo || (raw.email ? { email: raw.email, name: raw.name || raw.userName } : null);
  const refreshToken = raw.refreshToken || null;
  const expiration = raw.expiration || raw.expiresAt || null;

  return {
    token,
    user,
    refreshToken,
    expiration,
    raw,
  };
};

/**
 * Normalizes backend error responses into user-friendly strings
 */
export const parseAuthError = (error, fallbackMessage = 'An unexpected authentication error occurred.') => {
  if (!error) return fallbackMessage;

  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;

    if (typeof data === 'string') {
      if (data.includes('ERR_NGROK_3200') || data.includes('offline')) {
        return 'The backend ngrok tunnel (pediatric-astrology-outrank.ngrok-free.dev) is offline (ERR_NGROK_3200). Please ensure your backend is running on http://localhost:44334 and ngrok is active.';
      }
      return data.trim() || `Server error (${status})`;
    }

    if (data?.errors && typeof data.errors === 'object') {
      const messages = Object.entries(data.errors).flatMap(([field, errList]) => {
        if (Array.isArray(errList)) return errList.map((m) => `${m}`);
        return [String(errList)];
      });
      if (messages.length > 0) {
        return messages.join(' ');
      }
    }

    if (Array.isArray(data)) {
      const descriptions = data.map((item) => item.description || item.message || String(item)).filter(Boolean);
      if (descriptions.length > 0) {
        return descriptions.join(' ');
      }
    }

    if (data?.message) return data.message;
    if (data?.title) return data.title;
    if (data?.error) return typeof data.error === 'string' ? data.error : data.error?.message || fallbackMessage;

    if (status === 400) return 'Invalid request data. Please verify all fields.';
    if (status === 401) return 'Invalid email or password. Please verify your credentials and try again.';
    if (status === 403) return 'You do not have permission to access this resource.';
    if (status === 404) return 'The requested account or resource was not found.';
    if (status === 409) return 'An account with this email address already exists.';
    if (status >= 500) return 'The server encountered an error. Please try again later.';
  }

  if (error.request || error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
    return 'Unable to reach the authentication server. The backend ngrok tunnel is offline (ERR_NGROK_3200) or unreachable.';
  }

  return error.message || fallbackMessage;
};