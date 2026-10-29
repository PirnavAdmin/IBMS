import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import React, { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { registrationSchema } from '../../utils/authValidation';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  PersonOutline,
  MailOutline,
  LockOutlined,
  CheckCircleOutline,
  CheckOutlined,
  RadioButtonUncheckedOutlined,
} from '@mui/icons-material';
import { authApi } from 'billing-api-client';
import '../../styles/Login.css';
import { InvoiceBillingLogo } from '../../components/InvoiceBillingLogo';
import { PasswordVisibilityToggle } from '../../components/PasswordVisibilityToggle';



export const Register = () => {
  const navigate = useNavigate();
  const submitLock = useRef(false);
  const redirectTimer = useRef(null);
  useEffect(() => () => clearTimeout(redirectTimer.current), []);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successDismissed, setSuccessDismissed] = useState(false);
  const [registering, setRegistering] = useState(false);

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
  const passwordValue = watch('password', '');
  useEffect(() => { if (getValues('confirmPassword')) void trigger('confirmPassword'); }, [passwordValue, getValues, trigger]);
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


  const onSubmit = async (formData) => {
    if (submitLock.current) return;
    submitLock.current = true;
    setRegistering(true);
    try {
      setApiError(null);
      const response = await authApi.register({ name: formData.fullName, email: formData.email, password: formData.password, confirmPassword: formData.confirmPassword });
      if (response?.success === false || response?.Success === false) throw new Error(response.message || response.Message || 'Registration failed. Please check your details and try again.');
      setSuccessDismissed(false);
      setIsSuccess(true);
      redirectTimer.current = setTimeout(() => navigate('/login', { state: { registeredEmail: formData.email, registeredSuccess: true } }), 900);
    } catch (err) {
      submitLock.current = false;
      setApiError(err?.message || 'Registration failed. Please check your details and try again.');
    } finally { setRegistering(false); }
  };

  return (
    <Box className="billing-auth-login-page">
      {/* ================= LEFT HERO PANEL ================= */}
      <Box className="billing-auth-hero-side">
        <div className="billing-auth-hero-top">
          <div className="billing-auth-brand-wrap">
            <InvoiceBillingLogo tone="auth" size={28} />
            <span className="billing-auth-brand-text">INVOICE.BILLING</span>
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
            &copy; 2026 INVOICE.BILLING. Built for better business.
          </span>
        </div>
      </Box>

      {/* ================= RIGHT FORM PANEL ================= */}
      <Box className="billing-auth-form-side register-form-side">
        <div className="register-form-stack">
        <div className="billing-auth-card register-card">
          {/* Step Tag */}
          <span className="billing-auth-step-tag"></span>

          <Typography variant="h4" className="billing-auth-form-title">
            Create your account
          </Typography>
          <Typography variant="body2" className="billing-auth-form-subtitle">
            Start managing your invoices in minutes.
          </Typography>

          {apiError && (
            <Alert severity="error" onClose={() => setApiError(null)} sx={{ mb: 2, borderRadius: 2, py: 0.3 }}>
              {apiError}
            </Alert>
          )}

          {isSuccess && (
            <FeedbackSnackbar message={successDismissed ? '' : 'Account registered! Redirecting to sign in...'} onClose={() => setSuccessDismissed(true)} />
          )}

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

              {/* Work Email */}
              <Box>
                <label className="billing-auth-input-label" htmlFor="email">
                  Work email<span className="billing-auth-required" aria-hidden="true"> *</span>
                </label>
                <TextField
                  fullWidth
                  size="small"
                  id="email"
                  required
                  type="email"
                  placeholder="you@company.com"
                  disabled={isSubmitting || registering || isSuccess}
                  {...register('email')}
                  error={Boolean(errors.email)}
                  helperText={errors.email?.message}
                  className="billing-auth-input"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <MailOutline fontSize="small" sx={{ color: '#7D6E66' }} />
                      </InputAdornment>
                    ),
                  }}
                />
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
                  control={<Checkbox id="registration-consent" size="small" checked={field.value === true} inputRef={field.ref} name={field.name} onBlur={field.onBlur} onChange={event => field.onChange(event.target.checked)} inputProps={{ 'aria-required': true, 'aria-invalid': Boolean(errors.terms), 'aria-describedby': errors.terms ? 'registration-consent-error' : undefined }} />}
                  label={<span className="billing-auth-terms-label">I agree to INVOICE.BILLING's Terms and Privacy Policy (required).</span>} sx={{ m: 0 }} />}
                />
                <div className="billing-auth-legal-documents" aria-label="Legal documents">
                  <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a><span>and</span><a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
                </div>
                {errors.terms && <p id="registration-consent-error" role="alert" className="billing-auth-consent-error">{errors.terms.message}</p>}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={!isValid || isSubmitting || registering || isSuccess}
                className="billing-auth-submit-btn"
                sx={{ mt: 1 }}
              >
                {isSubmitting || registering ? <CircularProgress size={22} color="inherit" /> : 'Create Account'}
              </Button>
            </Stack>
          </Box>

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
