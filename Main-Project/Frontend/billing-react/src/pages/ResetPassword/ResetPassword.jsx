import React, { useState } from 'react';
import { useLocation, Link as RouterLink } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import {
  Alert, Box, Button, CircularProgress, IconButton, InputAdornment, Link, Stack, TextField, Typography
} from '@mui/material';
import { CheckCircle, LockOutlined, Visibility, VisibilityOff } from '@mui/icons-material';
import { authApi } from 'billing-api-client';
import { AuthCardLayout, useAuthNav } from 'billing-react';
import '../../styles/Login.css';

const resetSchema = yup.object({
  newPassword: yup.string().min(6, 'Password must be at least 6 characters').required('New password is required'),
  confirmPassword: yup.string().oneOf([yup.ref('newPassword')], 'Passwords must match').required('Confirm password is required'),
}).required();

export const ResetPassword = () => {
  const { handleNav, isExiting } = useAuthNav();
  const location = useLocation();
  const email = location.state?.email || '';

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: yupResolver(resetSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
    mode: 'onTouched',
  });

  const onSubmit = async ({ newPassword, confirmPassword }) => {
    try {
      setApiError(null);
      await authApi.resetPassword({ email, newPassword, confirmPassword });
      setIsSuccess(true);
      setTimeout(() => handleNav('/login', { resetSuccess: true, prefillEmail: email }), 1200);
    } catch (err) {
      setApiError(err?.message || 'Failed to reset password. Please try again or request a new OTP.');
    }
  };

  return (
    <AuthCardLayout
      isExiting={isExiting}
      onBack={() => handleNav('/login')}
      backLabel="Back to Sign In"
      tagLabel="CREDENTIALS"
      brandTitle="INVOICE.BILLING"
      brandSubtitle="UPDATE PASSWORD"
      brandIcon={LockOutlined}
      cardDescription={email ? <>Set a new secure password for <strong>{email}</strong>.</> : 'Choose a new secure password for your account.'}
      alerts={
        <>
          {!email && (
            <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2, py: 0.5 }}>
              No email address found for password reset. Please{' '}
              <Link component={RouterLink} to="/forgot-password" onClick={(e) => { e.preventDefault(); handleNav('/forgot-password'); }} sx={{ fontWeight: 700, color: '#9A4F2F' }}>
                request an OTP code first
              </Link>.
            </Alert>
          )}
          {apiError && <Alert severity="error" onClose={() => setApiError(null)} sx={{ mb: 1.5, borderRadius: 2, py: 0.5 }}>{apiError}</Alert>}
          {isSuccess && (
            <Alert icon={<CheckCircle fontSize="inherit" />} severity="success" sx={{ mb: 1.5, borderRadius: 2, py: 0.5 }}>
              Password reset successfully! Redirecting to sign in...
            </Alert>
          )}
        </>
      }
    >
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="caption" className="input-field-label">NEW PASSWORD</Typography>
            <TextField
              fullWidth
              size="small"
              id="newPassword"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••••••"
              autoFocus
              disabled={isSubmitting}
              {...register('newPassword')}
              error={Boolean(errors.newPassword)}
              helperText={errors.newPassword?.message}
              className="dark-glass-input"
              InputProps={{
                startAdornment: <InputAdornment position="start"><LockOutlined fontSize="small" sx={{ color: '#64748b' }} /></InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" size="small" sx={{ color: '#94a3b8' }}>
                      {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          <Box>
            <Typography variant="caption" className="input-field-label">CONFIRM NEW PASSWORD</Typography>
            <TextField
              fullWidth
              size="small"
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="••••••••••••"
              disabled={isSubmitting}
              {...register('confirmPassword')}
              error={Boolean(errors.confirmPassword)}
              helperText={errors.confirmPassword?.message}
              className="dark-glass-input"
              InputProps={{
                startAdornment: <InputAdornment position="start"><LockOutlined fontSize="small" sx={{ color: '#64748b' }} /></InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowConfirmPassword(!showConfirmPassword)} edge="end" size="small" sx={{ color: '#94a3b8' }}>
                      {showConfirmPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={isSubmitting || !email}
            className="auth-submit-btn"
            endIcon={!isSubmitting && <CheckCircle sx={{ fontSize: 17 }} />}
          >
            {isSubmitting ? <CircularProgress size={20} color="inherit" /> : 'Update Password'}
          </Button>
        </Stack>
      </Box>

      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.8rem' }}>
          Back to{' '}
          <Link component={RouterLink} to="/login" onClick={(e) => { e.preventDefault(); handleNav('/login'); }} sx={{ color: '#9A4F2F', fontWeight: 700, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
            Sign in
          </Link>
        </Typography>
      </Box>
    </AuthCardLayout>
  );
};

export default ResetPassword;