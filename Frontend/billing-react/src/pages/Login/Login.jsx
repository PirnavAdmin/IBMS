import React, { useState, useEffect } from 'react';
import {
  Link as RouterLink,
  useNavigate,
  useLocation,
} from 'react-router-dom';

import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import {
  MailOutline,
  LockOutlined,
  Visibility,
  VisibilityOff,
  SendOutlined,
  VpnKeyOutlined,
  LockResetOutlined,
} from '@mui/icons-material';

import { authApi } from 'billing-api-client';
import { OtpInputGroup } from '../../components/OtpInputGroup';

import '../../styles/Login.css';
import { InvoiceBillingLogo } from '../../components/InvoiceBillingLogo';

// ============================================================
// INVOICE.BILLING LOGO
// ============================================================



// ============================================================
// LOGIN VALIDATION
// ============================================================

const loginSchema = yup
  .object({
    email: yup
      .string()
      .trim()
      .email('Please enter a valid work email')
      .required('Work email is required'),

    password: yup
      .string()
      .required('Password is required'),
  })
  .required();

// ============================================================
// LOGIN COMPONENT
// ============================================================

export const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // ==========================================================
  // AUTHENTICATION STEP
  // login | forgot | otp | reset
  // ==========================================================

  const [authStep, setAuthStep] = useState('login');

  // ==========================================================
  // LOGIN STATE
  // ==========================================================

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [apiError, setApiError] = useState(() => new URLSearchParams(location.search).get('reason') === 'session-expired' ? 'HTTP 401: Your session has expired. Please login again.' : null);

  // ==========================================================
  // FORGOT PASSWORD STATE
  // ==========================================================

  const [forgotEmail, setForgotEmail] = useState('');
  const [recoveryError, setRecoveryError] = useState(null);
  const [recoverySuccess, setRecoverySuccess] = useState(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // ==========================================================
  // OTP STATE
  // ==========================================================

  const [otp, setOtp] = useState([
    '',
    '',
    '',
    '',
    '',
    '',
  ]);

  const [timer, setTimer] = useState(30);

  // ==========================================================
  // RESET PASSWORD STATE
  // ==========================================================

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  // ==========================================================
  // REACT HOOK FORM
  // ==========================================================

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    clearErrors,
    formState: {
      errors,
      isSubmitting,
    },
  } = useForm({
    resolver: yupResolver(loginSchema),

    defaultValues: {
      email:
        location.state?.prefillEmail ||
        location.state?.registeredEmail ||
        '',

      password: '',
    },

    mode: 'onTouched',
  });

  const openRegister = (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearErrors();
    setApiError(null);
    navigate('/register');
  };

  // ==========================================================
  // PREFILL EMAIL
  // ==========================================================

  useEffect(() => {
    const prefill =
      location.state?.prefillEmail ||
      location.state?.registeredEmail;

    if (prefill) {
      setValue('email', prefill);
    }
  }, [location.state, setValue]);

  // ==========================================================
  // OTP COUNTDOWN TIMER
  // ==========================================================

  useEffect(() => {
    if (authStep !== 'otp' || timer <= 0) {
      return undefined;
    }

    const interval = setInterval(() => {
      setTimer((currentTimer) => currentTimer - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [authStep, timer]);

  // ==========================================================
  // LOGIN SUBMIT
  // ==========================================================

  const onSubmitLogin = async (data) => {
    try {
      setApiError(null);

      // ------------------------------------------------------
      // CALL BACKEND LOGIN API
      // ------------------------------------------------------

      const response = await authApi.login({
        email: data.email.trim(),
        password: data.password,
      });



      // ------------------------------------------------------
      // GET TOKEN FROM BACKEND RESPONSE
      // ------------------------------------------------------

      const token =
        response?.token ||
        response?.accessToken ||
        response?.data?.token ||
        response?.data?.accessToken;

      // ------------------------------------------------------
      // TOKEN IS REQUIRED
      // ------------------------------------------------------

      if (!token) {
        throw new Error(
          'Authentication token was not returned by the server.'
        );
      }

      // ------------------------------------------------------
      // SAVE REAL BACKEND TOKEN
      // ------------------------------------------------------

      localStorage.setItem(
        'billing_auth_token',
        token.replace(/^(?:Bearer\s+)+/i, '').trim()
      );

      // ------------------------------------------------------
      // GET USER FROM BACKEND RESPONSE
      // ------------------------------------------------------

      const user =
        response?.user ||
        response?.data?.user;

      // ------------------------------------------------------
      // SAVE USER
      // ------------------------------------------------------

      if (user) {
        localStorage.setItem(
          'billing_auth_user',
          JSON.stringify({ email: data.email.trim(), ...user })
        );
      }

      // ------------------------------------------------------
      // LOGIN SUCCESS
      // ------------------------------------------------------

      navigate('/dashboard');

    } catch (error) {
      console.error('Login failed:', error);

      if (error?.userMessage === 'Network Error' || error?.message === 'Network Error') {
        setApiError('Network Error');
        return;
      }

      const status = error?.response?.status;

      // ------------------------------------------------------
      // 401 UNAUTHORIZED
      // ------------------------------------------------------

      if (status === 401) {
        setApiError(
          error?.response?.data?.message ||
          'Invalid email or password.'
        );

        return;
      }

      // ------------------------------------------------------
      // 404 NOT FOUND
      // ------------------------------------------------------

      if (status === 404) {
        setApiError(
          'Login API endpoint was not found. Please check the backend API URL.'
        );

        return;
      }

      // ------------------------------------------------------
      // 400 BAD REQUEST
      // ------------------------------------------------------

      if (status === 400) {
        setApiError(
          error?.response?.data?.message ||
          'Invalid login request.'
        );

        return;
      }

      // ------------------------------------------------------
      // 403 FORBIDDEN
      // ------------------------------------------------------

      if (status === 403) {
        setApiError(
          error?.response?.data?.message ||
          'You are not authorized to access this application.'
        );

        return;
      }

      // ------------------------------------------------------
      // 500 SERVER ERROR
      // ------------------------------------------------------

      if (status >= 500) {
        setApiError('Network Error');

        return;
      }

      // ------------------------------------------------------
      // GENERAL ERROR
      // ------------------------------------------------------

      setApiError(
        error?.response?.data?.message ||
        error?.message ||
        'Login failed. Please check your credentials.'
      );

    }
  };

  // ==========================================================
  // OPEN FORGOT PASSWORD
  // ==========================================================

  const handleOpenForgot = (event) => {
    event.preventDefault();
    event.stopPropagation();

    clearErrors();
    setApiError(null);
    setRecoveryError(null);
    setRecoverySuccess(null);

    const currentEmail = getValues('email');

    if (currentEmail) {
      setForgotEmail(currentEmail);
    }

    setAuthStep('forgot');
  };

  // ==========================================================
  // SEND OTP
  // ==========================================================

  const handleForgotSubmit = async (event) => {
    event.preventDefault();

    const cleanEmail = forgotEmail.trim();

    // --------------------------------------------------------
    // VALIDATE EMAIL
    // --------------------------------------------------------

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setRecoveryError(
        'Please enter a valid work email address.'
      );

      return;
    }

    try {
      setRecoveryLoading(true);
      setRecoveryError(null);
      setRecoverySuccess(null);

      // ------------------------------------------------------
      // CALL BACKEND
      // ------------------------------------------------------

      await authApi.forgotPassword({
        email: cleanEmail,
      });

      // ------------------------------------------------------
      // RESET OTP
      // ------------------------------------------------------

      setOtp([
        '',
        '',
        '',
        '',
        '',
        '',
      ]);

      setTimer(30);

      setRecoverySuccess(
        `6-digit authentication code sent to ${cleanEmail}`
      );

      setAuthStep('otp');

    } catch (error) {
      console.error(
        'Forgot password failed:',
        error
      );

      setRecoveryError(
        error?.response?.data?.message ||
        error?.message ||
        'Unable to send recovery code. Please verify your email.'
      );

    } finally {
      setRecoveryLoading(false);
    }
  };

  // ==========================================================
  // RESEND OTP
  // ==========================================================

  const handleResendOtp = async () => {
    if (timer > 0 || recoveryLoading) {
      return;
    }

    try {
      setRecoveryLoading(true);
      setRecoveryError(null);
      setRecoverySuccess(null);

      // ------------------------------------------------------
      // CALL BACKEND
      // ------------------------------------------------------

      await authApi.forgotPassword({
        email: forgotEmail.trim(),
      });

      // ------------------------------------------------------
      // RESET OTP
      // ------------------------------------------------------

      setOtp([
        '',
        '',
        '',
        '',
        '',
        '',
      ]);

      setTimer(30);

      setRecoverySuccess(
        'A fresh 6-digit code has been dispatched to your email.'
      );

    } catch (error) {
      console.error(
        'Resend OTP failed:',
        error
      );

      setRecoveryError(
        error?.response?.data?.message ||
        error?.message ||
        'Unable to resend code. Please try again.'
      );

    } finally {
      setRecoveryLoading(false);
    }
  };

  // ==========================================================
  // VERIFY OTP
  // ==========================================================

  const handleOtpSubmit = async (event) => {
    event.preventDefault();

    const enteredCode = otp.join('').trim();

    // --------------------------------------------------------
    // VALIDATE OTP
    // --------------------------------------------------------

    if (enteredCode.length < 6) {
      setRecoveryError(
        'Please enter all 6 digits of the authentication code.'
      );

      return;
    }

    try {
      setRecoveryLoading(true);
      setRecoveryError(null);
      setRecoverySuccess(null);

      // ------------------------------------------------------
      // CALL BACKEND
      // ------------------------------------------------------

      await authApi.verifyOtp({
        email: forgotEmail.trim(),
        otp: enteredCode,
      });

      // ------------------------------------------------------
      // SUCCESS
      // ------------------------------------------------------

      setRecoverySuccess(
        'Code verified successfully! Now choose your new password.'
      );

      setAuthStep('reset');

    } catch (error) {
      console.error(
        'OTP verification failed:',
        error
      );

      setRecoveryError(
        error?.response?.data?.message ||
        error?.message ||
        'Invalid or expired authentication code.'
      );

    } finally {
      setRecoveryLoading(false);
    }
  };

  // ==========================================================
  // RESET PASSWORD
  // ==========================================================

  const handleResetSubmit = async (event) => {
    event.preventDefault();

    // --------------------------------------------------------
    // PASSWORD VALIDATION
    // --------------------------------------------------------

    if (newPassword.length < 8) {
      setRecoveryError(
        'Password must be at least 8 characters long.'
      );

      return;
    }

    if (newPassword !== confirmPassword) {
      setRecoveryError(
        'Passwords do not match. Please re-enter.'
      );

      return;
    }

    try {
      setRecoveryLoading(true);
      setRecoveryError(null);
      setRecoverySuccess(null);

      // ------------------------------------------------------
      // CALL BACKEND
      // ------------------------------------------------------

      await authApi.resetPassword({
        email: forgotEmail.trim(),
        newPassword,
        confirmPassword,
      });

      // ------------------------------------------------------
      // SUCCESS
      // ------------------------------------------------------

      setRecoverySuccess(
        'Password reset successfully! Redirecting to sign in...'
      );

      // ------------------------------------------------------
      // RETURN TO LOGIN
      // ------------------------------------------------------

      setTimeout(() => {
        setValue('email', forgotEmail);
        setValue('password', '');

        setNewPassword('');
        setConfirmPassword('');

        setAuthStep('login');

        setRecoverySuccess(null);
        setRecoveryError(null);
        setApiError(null);
      }, 1200);

    } catch (error) {
      console.error(
        'Password reset failed:',
        error
      );

      setRecoveryError(
        error?.response?.data?.message ||
        error?.message ||
        'Unable to reset password. Please try again.'
      );

    } finally {
      setRecoveryLoading(false);
    }
  };

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <Box className="billing-auth-login-page">

      {/* ======================================================
          HOME BUTTON
      ====================================================== */}

      <RouterLink
        to="/"
        className="billing-auth-home-btn"
        onClick={() => {
          clearErrors();
          setApiError(null);
        }}
      >
        &larr; Home
      </RouterLink>

      {/* ======================================================
          LEFT HERO PANEL
      ====================================================== */}

      <Box className="billing-auth-hero-side">

        <div className="billing-auth-hero-top">

          <div className="billing-auth-brand-wrap">

            <InvoiceBillingLogo tone="auth" size={28} />

            <span className="billing-auth-brand-text">
              INVOICE.BILLING
            </span>

          </div>

          <span className="billing-auth-secure-tag">
            SECURE INVOICING
          </span>

        </div>

        <div className="billing-auth-hero-content">

          <span className="billing-auth-eyebrow">
            YOUR BUSINESS, IN BALANCE
          </span>

          <h1 className="billing-auth-hero-heading">
            Where every invoice
            <br />
            tells your{' '}
            <span className="billing-auth-story-accent">
              story.
            </span>
          </h1>

          <p className="billing-auth-hero-sub">
            Professional billing made simple. Send invoices,
            collect payments, and know exactly where your
            business stands.
          </p>

          {/* ==================================================
              INVOICE MOCKUP
          ================================================== */}

          <div className="billing-auth-inv-card">

            <div className="billing-auth-card-top">

              <div className="billing-auth-card-brand">

                <InvoiceBillingLogo tone="auth" size={20} />

                <span>
                  INVOICE.BILLING
                </span>

              </div>

              <span className="billing-auth-card-inv-id">
                INVOICE #0248
              </span>

            </div>

            <div className="billing-auth-card-lines">

              <div className="billing-auth-card-line l-long" />

              <div className="billing-auth-card-line l-med" />

              <div className="billing-auth-card-line l-short" />

            </div>

            <div className="billing-auth-card-bottom">

              <div className="billing-auth-card-due-group">

                <span className="billing-auth-card-due-lbl">
                  Total due
                </span>

              </div>

              <div className="billing-auth-card-amt-group">

                <span className="billing-auth-card-amount">
                  &#8377;24,500
                </span>

                <span className="billing-auth-card-status-pill">
                  PAID
                </span>

              </div>

            </div>

          </div>

        </div>

        <div className="billing-auth-hero-footer" />

      </Box>

      {/* ======================================================
          RIGHT FORM PANEL
      ====================================================== */}

      <Box className="billing-auth-form-side">

        <div className="login-form-stack">
          {authStep !== 'login' && (
            <button
              type="button"
              onClick={() => {
                setRecoveryError(null);
                setRecoverySuccess(null);

                if (authStep === 'otp') {
                  setAuthStep('forgot');
                } else if (authStep === 'reset') {
                  setAuthStep('otp');
                } else {
                  setAuthStep('login');
                }
              }}
              className="billing-auth-back-link recovery-back-link"
            >
              &larr;{' '}
              {authStep === 'otp'
                ? 'Change email'
                : 'Back to sign in'}
            </button>
          )}
        <div className="billing-auth-card">

          {/* ==================================================
              CARD ICON
          ================================================== */}

          <div className={`billing-auth-card-badge ${authStep === 'login' ? 'billing-auth-logo-badge' : ''}`}>

            {authStep === 'login' && (
              <InvoiceBillingLogo tone="auth" size={20} />
            )}

            {authStep === 'forgot' && (
              <VpnKeyOutlined
                sx={{
                  fontSize: 20,
                  color: '#9A4F2F',
                }}
              />
            )}

            {authStep === 'otp' && (
              <LockOutlined
                sx={{
                  fontSize: 20,
                  color: '#9A4F2F',
                }}
              />
            )}

            {authStep === 'reset' && (
              <LockResetOutlined
                sx={{
                  fontSize: 20,
                  color: '#9A4F2F',
                }}
              />
            )}

          </div>

          {/* ==================================================
              BACK LINK
          ================================================== */}



          {/* ==================================================
              TITLE
          ================================================== */}

          <Typography
            variant="h4"
            className="billing-auth-form-title"
          >
            {authStep === 'login' &&
              'Welcome back'}

            {authStep === 'forgot' &&
              'Reset password'}

            {authStep === 'otp' &&
              'Enter verification code'}

            {authStep === 'reset' &&
              'Create new password'}
          </Typography>

          <Typography
            variant="body2"
            className="billing-auth-form-subtitle"
          >
            {authStep === 'login' &&
              'Sign in to manage your invoices and payments.'}

            {authStep === 'forgot' &&
              'Enter your work email to receive a recovery code.'}

            {authStep === 'otp' &&
              `Enter the 6-digit code sent to ${
                forgotEmail || 'your email'
              }.`}

            {authStep === 'reset' &&
              'Set a new password for your account.'}
          </Typography>

          {/* ==================================================
              API ERROR
          ================================================== */}

          {apiError && (
            <Alert
              severity="error"
              onClose={() => setApiError(null)}
              sx={{
                mb: 2,
                borderRadius: 2,
                py: 0.3,
              }}
            >
              {apiError}
            </Alert>
          )}

          {/* ==================================================
              RECOVERY ERROR
          ================================================== */}

          {recoveryError && (
            <Alert
              severity="error"
              onClose={() => setRecoveryError(null)}
              sx={{
                mb: 2,
                borderRadius: 2,
                py: 0.3,
              }}
            >
              {recoveryError}
            </Alert>
          )}

          {/* ==================================================
              RECOVERY SUCCESS
          ================================================== */}

          {recoverySuccess && (
            <Alert
              severity="success"
              onClose={() => setRecoverySuccess(null)}
              sx={{
                mb: 2,
                borderRadius: 2,
                py: 0.3,
              }}
            >
              {recoverySuccess}
            </Alert>
          )}

          {/* ==================================================
              STEP 1: LOGIN
          ================================================== */}

          {authStep === 'login' && (
            <>
            <Box
              component="form"
              onSubmit={handleSubmit(onSubmitLogin)}
              noValidate
            >

              <Stack spacing={1.4}>

                {/* EMAIL */}

                <Box>

                  <label
                    className="billing-auth-input-label"
                    htmlFor="email"
                  >
                    Work email
                  </label>

                  <TextField
                    fullWidth
                    size="small"
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    autoComplete="email"
                    disabled={isSubmitting}
                    {...register('email')}
                    error={Boolean(errors.email)}
                    helperText={errors.email?.message}
                    className="billing-auth-input"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <MailOutline
                            fontSize="small"
                            sx={{
                              color: '#7D6E66',
                            }}
                          />
                        </InputAdornment>
                      ),
                    }}
                  />

                </Box>

                {/* PASSWORD */}

                <Box>

                  <label
                    className="billing-auth-input-label"
                    htmlFor="password"
                  >
                    Password
                  </label>

                  <TextField
                    fullWidth
                    size="small"
                    id="password"
                    type={
                      showPassword
                        ? 'text'
                        : 'password'
                    }
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    {...register('password')}
                    error={Boolean(errors.password)}
                    helperText={errors.password?.message}
                    className="billing-auth-input"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlined
                            fontSize="small"
                            sx={{
                              color: '#7D6E66',
                            }}
                          />
                        </InputAdornment>
                      ),

                      endAdornment: (
                        <InputAdornment position="end">

                          <IconButton
                            type="button"
                            onClick={() =>
                              setShowPassword(
                                (current) => !current
                              )
                            }
                            edge="end"
                            size="small"
                            sx={{
                              color: '#7D6E66',
                            }}
                          >
                            {showPassword ? (
                              <VisibilityOff
                                fontSize="small"
                              />
                            ) : (
                              <Visibility
                                fontSize="small"
                              />
                            )}
                          </IconButton>

                        </InputAdornment>
                      ),
                    }}
                  />

                </Box>

                {/* OPTIONS */}

                <div className="billing-auth-options-row">

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={rememberMe}
                        onChange={(event) =>
                          setRememberMe(
                            event.target.checked
                          )
                        }
                        size="small"
                        sx={{
                          color: '#E7D8CB',
                          p: 0.5,

                          '&.Mui-checked': {
                            color: '#9A4F2F',
                          },
                        }}
                      />
                    }
                    label={
                      <span className="billing-auth-remember-label">
                        Remember me for 30 days
                      </span>
                    }
                    sx={{
                      m: 0,
                    }}
                  />

                  <button
                    type="button"
                    onPointerDown={handleOpenForgot}
                    onClick={handleOpenForgot}
                    className="billing-auth-forgot-link"
                  >
                    Forgot password?
                  </button>

                </div>

                {/* LOGIN BUTTON */}

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  disabled={isSubmitting}
                  className="billing-auth-submit-btn"
                >
                  {isSubmitting ? (
                    <CircularProgress
                      size={22}
                      color="inherit"
                    />
                  ) : (
                    'Sign in to your account →'
                  )}
                </Button>

              </Stack>
            </Box>

            {/* Kept outside the login form so this link can never submit it. */}
            <div className="billing-auth-footer-text">
              New to INVOICE.BILLING?{' '}
              <button
                type="button"
                className="billing-auth-create-link billing-auth-route-button"
                onPointerDown={openRegister}
                onClick={openRegister}
              >
                Create an account
              </button>
            </div>
            </>
          )}

          {/* ==================================================
              STEP 2: FORGOT PASSWORD
          ================================================== */}

          {authStep === 'forgot' && (
            <Box
              component="form"
              onSubmit={handleForgotSubmit}
              noValidate
            >

              <Stack spacing={1.4}>

                <Box>

                  <label
                    className="billing-auth-input-label"
                    htmlFor="forgot-email"
                  >
                    Work email
                  </label>

                  <TextField
                    fullWidth
                    size="small"
                    id="forgot-email"
                    type="email"
                    placeholder="name@company.com"
                    autoFocus
                    disabled={recoveryLoading}
                    value={forgotEmail}
                    onChange={(event) =>
                      setForgotEmail(
                        event.target.value
                      )
                    }
                    className="billing-auth-input"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <MailOutline
                            fontSize="small"
                            sx={{
                              color: '#7D6E66',
                            }}
                          />
                        </InputAdornment>
                      ),
                    }}
                  />

                </Box>

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  disabled={
                    recoveryLoading ||
                    !forgotEmail.trim()
                  }
                  className="billing-auth-submit-btn"
                  endIcon={
                    !recoveryLoading && (
                      <SendOutlined
                        sx={{
                          fontSize: 16,
                        }}
                      />
                    )
                  }
                  sx={{
                    mt: 1,
                  }}
                >
                  {recoveryLoading ? (
                    <CircularProgress
                      size={20}
                      color="inherit"
                    />
                  ) : (
                    'Send recovery OTP →'
                  )}
                </Button>

              </Stack>

            </Box>
          )}

          {/* ==================================================
              STEP 3: OTP
          ================================================== */}

          {authStep === 'otp' && (
            <Box
              component="form"
              onSubmit={handleOtpSubmit}
              noValidate
            >

              <OtpInputGroup
                otp={otp}
                onChange={setOtp}
                disabled={recoveryLoading}
                autoFocus
              />

              <div className="otp-timer-row">

                <span>
                  {timer > 0
                    ? `Code expires in: ${timer}s`
                    : "Didn't get the code?"}
                </span>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={
                    timer > 0 ||
                    recoveryLoading
                  }
                  className="otp-resend-btn"
                >
                  Resend OTP
                </button>

              </div>

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={
                  recoveryLoading ||
                  otp.join('').trim().length < 6
                }
                className="billing-auth-submit-btn"
              >
                {recoveryLoading ? (
                  <CircularProgress
                    size={20}
                    color="inherit"
                  />
                ) : (
                  'Verify code →'
                )}
              </Button>

            </Box>
          )}

          {/* ==================================================
              STEP 4: RESET PASSWORD
          ================================================== */}

          {authStep === 'reset' && (
            <Box
              component="form"
              onSubmit={handleResetSubmit}
              noValidate
            >

              <Stack spacing={1.4}>

                {/* NEW PASSWORD */}

                <Box>

                  <label
                    className="billing-auth-input-label"
                    htmlFor="new-password"
                  >
                    New password
                  </label>

                  <TextField
                    fullWidth
                    size="small"
                    id="new-password"
                    type={
                      showNewPassword
                        ? 'text'
                        : 'password'
                    }
                    placeholder="At least 8 characters"
                    autoFocus
                    disabled={recoveryLoading}
                    value={newPassword}
                    onChange={(event) =>
                      setNewPassword(
                        event.target.value
                      )
                    }
                    className="billing-auth-input"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlined
                            fontSize="small"
                            sx={{
                              color: '#7D6E66',
                            }}
                          />
                        </InputAdornment>
                      ),

                      endAdornment: (
                        <InputAdornment position="end">

                          <IconButton
                            type="button"
                            onClick={() =>
                              setShowNewPassword(
                                (current) => !current
                              )
                            }
                            edge="end"
                            size="small"
                            sx={{
                              color: '#7D6E66',
                            }}
                          >
                            {showNewPassword ? (
                              <VisibilityOff
                                fontSize="small"
                              />
                            ) : (
                              <Visibility
                                fontSize="small"
                              />
                            )}
                          </IconButton>

                        </InputAdornment>
                      ),
                    }}
                  />

                </Box>

                {/* CONFIRM PASSWORD */}

                <Box>

                  <label
                    className="billing-auth-input-label"
                    htmlFor="confirm-new-password"
                  >
                    Confirm new password
                  </label>

                  <TextField
                    fullWidth
                    size="small"
                    id="confirm-new-password"
                    type={
                      showConfirmPassword
                        ? 'text'
                        : 'password'
                    }
                    placeholder="Re-enter your new password"
                    disabled={recoveryLoading}
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(
                        event.target.value
                      )
                    }
                    className="billing-auth-input"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlined
                            fontSize="small"
                            sx={{
                              color: '#7D6E66',
                            }}
                          />
                        </InputAdornment>
                      ),

                      endAdornment: (
                        <InputAdornment position="end">

                          <IconButton
                            type="button"
                            onClick={() =>
                              setShowConfirmPassword(
                                (current) => !current
                              )
                            }
                            edge="end"
                            size="small"
                            sx={{
                              color: '#7D6E66',
                            }}
                          >
                            {showConfirmPassword ? (
                              <VisibilityOff
                                fontSize="small"
                              />
                            ) : (
                              <Visibility
                                fontSize="small"
                              />
                            )}
                          </IconButton>

                        </InputAdornment>
                      ),
                    }}
                  />

                </Box>

                {/* RESET BUTTON */}

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  disabled={
                    recoveryLoading ||
                    !newPassword ||
                    !confirmPassword
                  }
                  className="billing-auth-submit-btn"
                  sx={{
                    mt: 0.5,
                  }}
                >
                  {recoveryLoading ? (
                    <CircularProgress
                      size={20}
                      color="inherit"
                    />
                  ) : (
                    'Update password & Sign in →'
                  )}
                </Button>

              </Stack>

            </Box>
          )}

        </div>
        </div>

      </Box>

    </Box>
  );
};

export default Login;
