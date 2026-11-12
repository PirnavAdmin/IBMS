import { BrandName } from '../../components/BrandName';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import React, { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { registrationSchema, workEmailSchema } from '../../utils/authValidation';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import PersonOutline from '@mui/icons-material/PersonOutline';
import MailOutline from '@mui/icons-material/MailOutline';
import LockOutlined from '@mui/icons-material/LockOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import RadioButtonUncheckedOutlined from '@mui/icons-material/RadioButtonUncheckedOutlined';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import { authApi } from 'billing-api-client';
import '../../styles/Login.css';
import { InvoiceBillingLogo } from '../../components/InvoiceBillingLogo';
import { PasswordVisibilityToggle } from '../../components/PasswordVisibilityToggle';
import { OtpInputGroup } from '../../components/OtpInputGroup';

export const Register = () => {
  const submitLock = useRef(false);
  const otpLock = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [successDismissed, setSuccessDismissed] = useState(false);
  const [registering, setRegistering] = useState(false);

  // Email OTP verification state
  const [otpTargetEmail, setOtpTargetEmail] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [verifiedOtpCode, setVerifiedOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState(null);
  const [otpInfo, setOtpInfo] = useState(null);
  const [resendTimer, setResendTimer] = useState(0);

  const {
    register,
    handleSubmit,
    watch,
    control,
    trigger,
    getValues,
    formState: { errors, isSubmitting, isValid },
  } = useForm({
    resolver: yupResolver(registrationSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      terms: false,
    },
    mode: 'onChange',
  });

  const emailValue = watch('email', '');
  const normalizedEmail = emailValue.trim().toLowerCase();
  const emailFormatValid = Boolean(emailValue.trim()) && workEmailSchema().isValidSync(emailValue.trim());
  const isEmailVerified = Boolean(verifiedEmail) && verifiedEmail === normalizedEmail;

  const passwordValue = watch('password', '');
  useEffect(() => { if (getValues('confirmPassword')) void trigger('confirmPassword'); }, [passwordValue, getValues, trigger]);

  useEffect(() => {
    if (otpTargetEmail && normalizedEmail !== otpTargetEmail) {
      setOtpSent(false);
      setOtp(['', '', '', '', '', '']);
      setOtpError(null);
      setOtpInfo(null);
      setResendTimer(0);
    }
    if (verifiedEmail && normalizedEmail !== verifiedEmail) {
      setVerifiedEmail('');
      setVerifiedOtpCode('');
    }
  }, [normalizedEmail, otpTargetEmail, verifiedEmail]);

  useEffect(() => {
    if (!otpSent || resendTimer <= 0) return undefined;
    const interval = setInterval(() => {
      setResendTimer(current => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [otpSent, resendTimer]);

  const checks = {
    lower: /[a-z]/.test(passwordValue),
    upper: /[A-Z]/.test(passwordValue),
    number: /\d/.test(passwordValue),
    special: /[^A-Za-z0-9]/.test(passwordValue),
    length: passwordValue.length >= 8,
  };
  const confirmValue = watch('confirmPassword', '');
  const passwordValid = registrationSchema.fields.password.isValidSync(passwordValue);
  const passwordsMatch = passwordValid && Boolean(confirmValue) && confirmValue === passwordValue;
  const passwordRules = [['lower', 'Lowercase letter', 'a-z'], ['upper', 'Uppercase letter', 'A-Z'], ['number', 'Number', '0-9'], ['special', 'Special character', '@#$'], ['length', 'At least 8 characters', '8+']];

  const handleSendOtp = async () => {
    if (otpLock.current || !emailFormatValid) {
      if (!emailFormatValid) void trigger('email');
      return;
    }
    otpLock.current = true;
    setSendingOtp(true);
    setOtpError(null);
    setOtpInfo(null);
    setApiError(null);
    try {
      await authApi.sendRegistrationOtp({ email: emailValue.trim() });
      setOtpTargetEmail(normalizedEmail);
      setOtpSent(true);
      setOtp(['', '', '', '', '', '']);
      setResendTimer(30);
      setOtpInfo(`6-digit OTP sent to ${emailValue.trim()}.`);
    } catch (err) {
      setOtpError(err?.message || 'Unable to send OTP to this email address.');
    } finally {
      otpLock.current = false;
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpLock.current) return;
    const code = otp.join('').trim();
    if (!/^\d{6}$/.test(code)) {
      setOtpError('Please enter all 6 digits of the verification OTP.');
      return;
    }
    otpLock.current = true;
    setVerifyingOtp(true);
    setOtpError(null);
    setOtpInfo(null);
    try {
      await authApi.verifyRegistrationOtp({ email: emailValue.trim(), otp: code });
      setVerifiedEmail(normalizedEmail);
      setVerifiedOtpCode(code);
      setOtpSent(false);
      setResendTimer(0);
      setOtpInfo('Email verified via OTP.');
    } catch (err) {
      setOtpError(err?.message || 'Invalid or expired OTP code.');
    } finally {
      otpLock.current = false;
      setVerifyingOtp(false);
    }
  };

  const onSubmit = async (formData) => {
    if (submitLock.current) return;
    if (!isEmailVerified) {
      setOtpError('Please verify your email address with OTP before creating your account.');
      return;
    }
    submitLock.current = true;
    setRegistering(true);
    try {
      setApiError(null);
      const response = await authApi.register({
        name: formData.fullName,
        email: formData.email,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        otp: verifiedOtpCode,
      });
      if (response?.success === false || response?.Success === false) {
        throw new Error(response.message || response.Message || 'Registration failed. Please check your details and try again.');
      }
      setSubmittedEmail(formData.email.trim());
      setSuccessMessage(
        response?.message ||
        response?.Message ||
        'Account created successfully. Your email is verified, and SuperAdmin permission is required before you can sign in.'
      );
      setSuccessDismissed(false);
      setIsSuccess(true);
    } catch (err) {
      submitLock.current = false;
      setApiError(err?.message || 'Registration failed. Please check your details and try again.');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <Box className="billing-auth-login-page">
      {/* ================= LEFT HERO PANEL ================= */}
      <Box className="billing-auth-hero-side">
        <div className="billing-auth-hero-top">
          <div className="billing-auth-brand-wrap">
            <InvoiceBillingLogo tone="auth" size={28} />
            <BrandName />
          </div>
        </div>

        <div className="billing-auth-hero-content">
          <span className="billing-auth-eyebrow">START YOUR FREE WORKSPACE</span>
          <h1 className="billing-auth-hero-heading">
            Send your first<br />
            invoice <span className="billing-auth-story-accent">today.</span>
          </h1>
          <p className="billing-auth-hero-sub">
            One simple workspace for all the financial work that keeps your business moving.
          </p>

          {/* Key Value Points */}
          <div className="billing-auth-feature-list">
            <div className="billing-auth-feature-item">
              <span className="billing-auth-feature-check">&#10003;</span>
              <span>Create professional invoices</span>
            </div>
            <div className="billing-auth-feature-item">
              <span className="billing-auth-feature-check">&#10003;</span>
              <span>Track payments in real time</span>
            </div>
            <div className="billing-auth-feature-item">
              <span className="billing-auth-feature-check">&#10003;</span>
              <span>No credit card required</span>
            </div>
          </div>
        </div>

        <div className="billing-auth-hero-footer">
          <span className="billing-auth-hero-copyright">
            &copy; 2026 IBMS. Built for better business.
          </span>
        </div>
      </Box>

      {/* ================= RIGHT FORM PANEL ================= */}
      <Box className="billing-auth-form-side register-form-side">
        <div className="register-form-stack">
        <div className="billing-auth-card register-card">
          <span className="billing-auth-step-tag"></span>

          <Typography variant="h4" className="billing-auth-form-title">
            Create your account
          </Typography>
          <Typography variant="body2" className="billing-auth-form-subtitle">
            Verify your work email and submit your account for SuperAdmin approval.
          </Typography>

          {apiError && (
            <Alert severity="error" onClose={() => setApiError(null)} sx={{ mb: 2, borderRadius: 2, py: 0.3 }}>
              {apiError}
            </Alert>
          )}

          {isSuccess && (
            <FeedbackSnackbar
              message={successDismissed ? '' : 'Account created! SuperAdmin permission is required before signing in.'}
              onClose={() => setSuccessDismissed(true)}
            />
          )}

          {isSuccess ? (
            <Stack spacing={1.6} role="status" className="billing-auth-pending-approval-box">
              <Alert severity="success" icon={<VerifiedUserOutlined fontSize="small" />} sx={{ borderRadius: 2 }}>
                <AlertTitle>Account Created Successfully</AlertTitle>
                {successMessage}
              </Alert>
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                <AlertTitle>SuperAdmin Permission Required</AlertTitle>
                Your email <strong>{submittedEmail}</strong> is verified. You will be able to log in once a SuperAdmin approves your account request and grants permission.
              </Alert>
              <Button
                component={RouterLink}
                to="/login"
                state={{ registeredEmail: submittedEmail, pendingApproval: true }}
                fullWidth
                variant="contained"
                className="billing-auth-submit-btn"
              >
                Go to Sign in
              </Button>
            </Stack>
          ) : (
            <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
              <Stack spacing={1.1}>
                {/* Full Name */}
                <Box>
                  <label className="billing-auth-input-label" htmlFor="fullName">
                    Full name<span className="billing-auth-required" aria-hidden="true"> *</span>
                  </label>
                  <TextField
                    fullWidth
                    size="small"
                    id="fullName"
                    autoComplete="name"
                    required
                    placeholder="Your full name"
                    disabled={isSubmitting || registering || isSuccess}
                    {...register('fullName')}
                    error={Boolean(errors.fullName)}
                    helperText={errors.fullName?.message}
                    className="billing-auth-input"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonOutline fontSize="small" sx={{ color: '#7D6E66' }} />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Box>

                {/* Work Email + OTP Verification */}
                <Box>
                  <label className="billing-auth-input-label" htmlFor="email">
                    Work email<span className="billing-auth-required" aria-hidden="true"> *</span>
                  </label>
                  <div className="billing-auth-email-verify-row">
                    <TextField
                      fullWidth
                      size="small"
                      id="email"
                      autoComplete="email"
                      required
                      type="email"
                      placeholder="you@company.com"
                      disabled={isSubmitting || registering || isSuccess}
                      {...register('email')}
                      error={Boolean(errors.email)}
                      helperText={errors.email?.message}
                      className={`billing-auth-input ${isEmailVerified ? 'is-valid' : ''}`}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <MailOutline fontSize="small" sx={{ color: '#7D6E66' }} />
                          </InputAdornment>
                        ),
                        endAdornment: isEmailVerified ? (
                          <InputAdornment position="end">
                            <CheckCircleOutline className="billing-auth-valid-icon" role="img" aria-label="Email verified" fontSize="small" />
                          </InputAdornment>
                        ) : undefined,
                      }}
                    />
                    <Button
                      type="button"
                      variant="outlined"
                      size="small"
                      className={`billing-auth-otp-trigger${isEmailVerified ? ' is-verified' : ''}`}
                      disabled={!emailFormatValid || sendingOtp || verifyingOtp || isEmailVerified || registering || isSuccess || (otpSent && resendTimer > 0)}
                      onClick={handleSendOtp}
                    >
                      {sendingOtp ? 'Sending...' : isEmailVerified ? 'Verified' : otpSent ? (resendTimer > 0 ? `${resendTimer}s` : 'Resend OTP') : 'Send OTP'}
                    </Button>
                  </div>

                  {otpError && (
                    <p role="alert" className="billing-auth-otp-error">
                      {otpError}
                    </p>
                  )}

                  {isEmailVerified && (
                    <p role="status" className="billing-auth-otp-verified">
                      <CheckCircleOutline fontSize="inherit" aria-hidden="true" />
                      <span>Email verified via OTP</span>
                    </p>
                  )}

                  {otpSent && !isEmailVerified && (
                    <div className="billing-auth-otp-box">
                      <div className="billing-auth-otp-box-header">
                        <span>{otpInfo || `Enter the 6-digit OTP sent to ${emailValue.trim()}`}</span>
                        {resendTimer > 0 ? (
                          <span className="billing-auth-otp-timer">Resend in {resendTimer}s</span>
                        ) : (
                          <button type="button" className="otp-resend-btn" disabled={sendingOtp} onClick={handleSendOtp}>
                            Resend OTP
                          </button>
                        )}
                      </div>
                      <div className="billing-auth-otp-box-controls">
                        <OtpInputGroup otp={otp} onChange={setOtp} disabled={verifyingOtp || isSuccess} autoFocus />
                        <Button
                          type="button"
                          variant="contained"
                          size="small"
                          className="billing-auth-otp-verify-btn"
                          disabled={verifyingOtp || otp.join('').length < 6}
                          onClick={handleVerifyOtp}
                        >
                          {verifyingOtp ? <CircularProgress size={16} color="inherit" /> : 'Verify OTP'}
                        </Button>
                      </div>
                    </div>
                  )}
                </Box>

                {/* Create Password */}
                <Box>
                  <label className="billing-auth-input-label" htmlFor="password">
                    Create password<span className="billing-auth-required" aria-hidden="true"> *</span>
                  </label>
                  <TextField
                    fullWidth
                    size="small"
                    id="password"
                    autoComplete="new-password"
                    required
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    disabled={isSubmitting || registering || isSuccess}
                    {...register('password', { onBlur: () => setPasswordFocused(false) })}
                    onFocus={() => setPasswordFocused(true)}
                    error={Boolean(errors.password)}
                    helperText={errors.password?.message}
                    className={`billing-auth-input ${passwordValid ? 'is-valid' : ''}`}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlined fontSize="small" sx={{ color: '#7D6E66' }} />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          {passwordValid && <CheckCircleOutline className="billing-auth-valid-icon" role="img" aria-label="Password meets requirements" fontSize="small" />}
                          <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword(current => !current)} inputId="password" label="password" disabled={isSubmitting || registering || isSuccess} />
                        </InputAdornment>
                      ),
                    }}
                  />
                  {passwordFocused && passwordValue.length > 0 && (
                    <ul className="billing-auth-password-checks" aria-label="Password requirements" aria-live="polite">
                      {passwordRules.map(([key, label, symbol]) => <li key={key} className={checks[key] ? 'is-met' : ''} aria-label={`${label}: ${checks[key] ? 'met' : 'not met'}`}>{checks[key] ? <CheckOutlined aria-hidden="true" /> : <RadioButtonUncheckedOutlined aria-hidden="true" />}<span aria-hidden="true">{symbol}</span></li>)}
                    </ul>
                  )}
                </Box>

                {/* Confirm Password */}
                <Box>
                  <label className="billing-auth-input-label" htmlFor="confirmPassword">
                    Confirm password<span className="billing-auth-required" aria-hidden="true"> *</span>
                  </label>
                  <TextField
                    fullWidth
                    size="small"
                    id="confirmPassword"
                    autoComplete="new-password"
                    required
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Re-enter your password"
                    disabled={isSubmitting || registering || isSuccess}
                    {...register('confirmPassword')}
                    error={Boolean(errors.confirmPassword)}
                    helperText={errors.confirmPassword?.message}
                    className={`billing-auth-input ${passwordsMatch ? 'is-valid' : ''}`}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlined fontSize="small" sx={{ color: '#7D6E66' }} />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          {passwordsMatch && <CheckCircleOutline className="billing-auth-valid-icon" role="img" aria-label="Passwords match" fontSize="small" />}
                          <PasswordVisibilityToggle visible={showConfirmPassword} onToggle={() => setShowConfirmPassword(current => !current)} inputId="confirmPassword" label="confirm password" disabled={isSubmitting || registering || isSuccess} />
                        </InputAdornment>
                      ),
                    }}
                  />
                  {passwordsMatch && (
                    <p className="billing-auth-password-match is-match" aria-live="polite">
                      Passwords match
                    </p>
                  )}
                </Box>

                <div className="billing-auth-consent">
                  <Controller name="terms" control={control} render={({ field }) => <FormControlLabel
                    control={<Checkbox id="registration-consent" disabled={isSubmitting || registering || isSuccess} size="small" checked={field.value === true} inputRef={field.ref} name={field.name} onBlur={field.onBlur} onChange={event => field.onChange(event.target.checked)} inputProps={{ 'aria-required': true, 'aria-invalid': Boolean(errors.terms), 'aria-describedby': errors.terms ? 'registration-consent-error' : undefined }} />}
                    label={<span className="billing-auth-terms-label">I agree to IBMS's <a className="billing-auth-terms-link" href="/terms" target="_blank" rel="noopener noreferrer">Terms</a> and <a className="billing-auth-terms-link" href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> (required).</span>} sx={{ m: 0 }} />}
                  />
                  {errors.terms && <p id="registration-consent-error" role="alert" className="billing-auth-consent-error">{errors.terms.message}</p>}
                </div>

                {!isEmailVerified && isValid && (
                  <p className="billing-auth-otp-hint">
                    Please verify your work email using OTP before creating your account.
                  </p>
                )}

                {/* Submit Button */}
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  disabled={!isValid || !isEmailVerified || isSubmitting || registering || isSuccess}
                  className="billing-auth-submit-btn"
                  sx={{ mt: 1 }}
                >
                  {isSubmitting || registering ? <CircularProgress size={22} color="inherit" /> : 'Create Account'}
                </Button>
              </Stack>
            </Box>
          )}

          {/* Kept outside the registration form so this link can never submit it. */}
          <div className="billing-auth-footer-text" style={{ marginTop: 14 }}>
            Already have an account?{' '}
            <RouterLink to="/login" className="billing-auth-create-link billing-auth-route-button">
              Sign in
            </RouterLink>
          </div>
        </div>
        </div>
      </Box>
    </Box>
  );
};

export default Register;
