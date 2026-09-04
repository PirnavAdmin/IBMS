import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Alert, Box, Button, CircularProgress, InputAdornment, Link, Stack, TextField, Typography } from '@mui/material';
import { EmailOutlined, SendOutlined } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { authApi } from 'billing-api-client';
import { AuthCardLayout, useAuthNav } from 'billing-react';
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
      backLabel="Back to Sign In"
      tagLabel="RECOVERY"
      brandTitle="INVOICE.BILLING"
      brandSubtitle="PASSWORD RECOVERY"
      cardDescription="Enter your registered corporate email address. We will dispatch a secure 6-digit verification code to reset your credentials."
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
            <Typography variant="caption" className="input-field-label">REGISTERED WORK EMAIL</Typography>
            <TextField fullWidth size="small" id="email" type="email" placeholder="name@company.com" autoFocus disabled={isSubmitting} {...register('email')} error={Boolean(errors.email)} helperText={errors.email?.message} className="dark-glass-input" InputProps={{ startAdornment: <InputAdornment position="start"><EmailOutlined fontSize="small" sx={{ color: '#64748b' }} /></InputAdornment> }} />
          </Box>
          <Button type="submit" fullWidth variant="contained" disabled={isSubmitting} className="auth-submit-btn" endIcon={!isSubmitting && <SendOutlined sx={{ fontSize: 17 }} />}>
            {isSubmitting ? <CircularProgress size={20} color="inherit" /> : 'Send Verification OTP'}
          </Button>
        </Stack>
      </Box>

      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.8rem' }}>
          Remember your password?{' '}
          <Link component={RouterLink} to="/login" onClick={(e) => { e.preventDefault(); handleNav('/login'); }} sx={{ color: '#9A4F2F', fontWeight: 700, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
            Back to Sign In
          </Link>
        </Typography>
      </Box>
    </AuthCardLayout>
  );
};

export default ForgotPassword;