import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Alert, Box, Button, CircularProgress, InputAdornment, Link, Stack, TextField, Typography } from '@mui/material';
import { EmailOutlined, VpnKeyOutlined, SendOutlined } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { authApi } from 'billing-api-client';
import { AuthCardLayout } from '../../components/AuthCardLayout';
import { useAuthNav } from '../../hooks/useAuthNav';
import '../../styles/Login.css';

const forgotSchema = yup.object({
  email: yup.string().trim().email('Please enter a valid email address').required('Registered email is required'),
}).required();

export const ForgotPassword = () => {
  const { handleNav, isExiting } = useAuthNav();
  const [apiError, setApiError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: yupResolver(forgotSchema),
    defaultValues: { email: '' },
    mode: 'onTouched',
  });

  const onSubmit = async ({ email }) => {
    try {
      setApiError(null);
      await authApi.forgotPassword({ email });
      setIsSuccess(true);
      setTimeout(() => handleNav('/verify-otp', { email }), 700);
    } catch (err) {
      setApiError(err?.message || 'Unable to send recovery code. Please verify your email and try again.');
    }
  };

  return (
    <AuthCardLayout
      isExiting={isExiting}
      onBack={() => handleNav('/login')}
      hideBack
      className="billing-forgot-page"
      header={<div className="billing-recovery-heading"><div className="billing-auth-card-badge"><VpnKeyOutlined aria-hidden="true" /></div><h1 className="billing-auth-form-title">Reset password</h1></div>}
      tagLabel="RECOVERY"
      brandTitle="INVOICE.BILLING"
      brandSubtitle="PASSWORD RECOVERY"
      cardDescription="Enter your work email to receive a recovery code."
      alerts={
        <>
          {apiError && <Alert severity="error" onClose={() => setApiError(null)} sx={{ mb: 1.5, borderRadius: 2, py: 0.5 }}>{apiError}</Alert>}
          {isSuccess && <Alert severity="success" sx={{ mb: 1.5, borderRadius: 2, py: 0.5 }}>Verification code dispatched! Opening OTP screen...</Alert>}
        </>
      }
    >
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack spacing={2}>
          <Box>
            <label htmlFor="email" className="billing-auth-input-label">Work email<span className="billing-auth-required" aria-hidden="true"> *</span></label>
            <TextField fullWidth size="small" id="email" required type="email" placeholder="name@company.com" autoFocus disabled={isSubmitting} {...register('email')} error={Boolean(errors.email)} helperText={errors.email?.message} className="billing-auth-input dark-glass-input auth-neutral-input" InputProps={{ startAdornment: <InputAdornment position="start"><EmailOutlined fontSize="small" sx={{ color: '#64748b' }} /></InputAdornment> }} />
          </Box>
          <div className="billing-auth-recovery-nav"><RouterLink to="/login" onClick={event => { event.preventDefault(); handleNav('/login'); }}>Back to Login</RouterLink></div>
          <Button type="submit" fullWidth variant="contained" disabled={isSubmitting} className="auth-submit-btn" endIcon={!isSubmitting && <SendOutlined fontSize="small" />}>
            {isSubmitting ? <CircularProgress size={20} color="inherit" /> : 'Send OTP'}
          </Button>
        </Stack>
      </Box>

    </AuthCardLayout>
  );
};

export default ForgotPassword;
