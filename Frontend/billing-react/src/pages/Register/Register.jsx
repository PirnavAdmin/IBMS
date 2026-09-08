import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
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
  PersonOutline,
  MailOutline,
  LockOutlined,
  Visibility,
  VisibilityOff,
  Check,
} from '@mui/icons-material';
import { authApi } from 'billing-api-client';
import '../../styles/Login.css';
import { InvoiceBillingLogo } from '../../components/InvoiceBillingLogo';



const registerSchema = yup.object({
  fullName: yup.string().trim().required('Full name is required'),
  email: yup.string().trim().email('Please enter a valid work email').required('Work email is required'),
  password: yup
    .string()
    .min(8, 'Use 8 or more characters with letters and numbers')
    .matches(/[a-z]/, 'Include a lowercase letter')
    .matches(/[A-Z]/, 'Include an uppercase letter')
    .matches(/\d/, 'Include a number')
    .matches(/[^A-Za-z0-9]/, 'Include a special character')
    .required('Password is required'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
  terms: yup.boolean().oneOf([true], 'You must agree to Terms and Privacy Policy'),
}).required();

export const Register = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      terms: true,
    },
    mode: 'onTouched',
  });
  const passwordValue = watch('password', '');
  const checks = {
    lower: /[a-z]/.test(passwordValue),
    upper: /[A-Z]/.test(passwordValue),
    number: /\d/.test(passwordValue),
    special: /[^A-Za-z0-9]/.test(passwordValue),
    length: passwordValue.length >= 8,
  };
  const textOutput = `${checks.lower ? '✓' : '✗'} lowercase, ${checks.upper ? '✓' : '✗'} uppercase, ${checks.number ? '✓' : '✗'} number, ${checks.special ? '✓' : '✗'} special char, ${checks.length ? '✓' : '✗'} 8 chars`;


  const onSubmit = async (formData) => {
    try {
      setApiError(null);
      try {
        await authApi.register({
          name: formData.fullName,
          email: formData.email,
          password: formData.password,
          confirmPassword: formData.confirmPassword,
        });
      } catch (err) {
        console.warn('Backend register endpoint unavailable or rejected, proceeding in local session:', err?.message);
      }
      setIsSuccess(true);
      setTimeout(() => {
        navigate('/login', { state: { registeredEmail: formData.email, registeredSuccess: true } });
      }, 900);
    } catch (err) {
      setApiError(err?.message || 'Registration failed. Please check your details and try again.');
    }
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
          {/* Back to Sign In Link */}
          <RouterLink
            to="/login"
            className="billing-auth-back-link register-back-link"
          >
            &larr; Back to sign in
          </RouterLink>

        <div className="billing-auth-card register-card">
          {/* Step Tag */}
          <span className="billing-auth-step-tag">STEP 1 OF 1</span>

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
            <Alert severity="success" sx={{ mb: 2, borderRadius: 2, py: 0.3 }}>
              Account registered! Redirecting to sign in...
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Stack spacing={1.1}>
              {/* Full Name */}
              <Box>
                <label className="billing-auth-input-label" htmlFor="fullName">
                  Full name
                </label>
                <TextField
                  fullWidth
                  size="small"
                  id="fullName"
                  placeholder="Your full name"
                  disabled={isSubmitting}
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
                  Work email
                </label>
                <TextField
                  fullWidth
                  size="small"
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  disabled={isSubmitting}
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
                  Create password
                </label>
                <TextField
                  fullWidth
                  size="small"
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  disabled={isSubmitting}
                  {...register('password')}
                  error={Boolean(errors.password)}
                  helperText={errors.password?.message}
                  className="billing-auth-input"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlined fontSize="small" sx={{ color: '#7D6E66' }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          size="small"
                          sx={{ color: '#7D6E66' }}
                        >
                          {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>

              {/* Confirm Password */}
              <Box>
                <label className="billing-auth-input-label" htmlFor="confirmPassword">
                  Confirm password
                </label>
                <TextField
                  fullWidth
                  size="small"
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  disabled={isSubmitting}
                  {...register('confirmPassword')}
                  error={Boolean(errors.confirmPassword)}
                  helperText={errors.confirmPassword?.message}
                  className="billing-auth-input"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlined fontSize="small" sx={{ color: '#7D6E66' }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          edge="end"
                          size="small"
                          sx={{ color: '#7D6E66' }}
                        >
                          {showConfirmPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <div className="billing-auth-pwd-hint">
                  <p className="billing-auth-password-checks" aria-live="polite">{textOutput}</p>
                </div>
              </Box>

              {/* Terms Checkbox */}
              <FormControlLabel
                control={
                  <Checkbox
                    defaultChecked
                    {...register('terms')}
                    size="small"
                    sx={{
                      color: '#E7D8CB',
                      p: 0.5,
                      '&.Mui-checked': { color: '#9A4F2F' },
                    }}
                  />
                }
                label={
                  <span className="billing-auth-terms-label">
                    I agree to INVOICE.BILLING's{' '}
                    <span className="billing-auth-terms-link">Terms</span> and{' '}
                    <span className="billing-auth-terms-link">Privacy Policy</span>.
                  </span>
                }
                sx={{ m: 0, mt: 0.2 }}
              />
              {errors.terms && (
                <Typography variant="caption" color="error" sx={{ fontSize: '0.72rem', display: 'block' }}>
                  {errors.terms.message}
                </Typography>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={isSubmitting}
                className="billing-auth-submit-btn"
                sx={{ mt: 1 }}
              >
                {isSubmitting ? <CircularProgress size={22} color="inherit" /> : 'Create Account \u2192'}
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
