import React, { useState, useEffect } from 'react';
import { useLocation, Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Link, Typography } from '@mui/material';
import { LockOutlined, VpnKeyOutlined, RefreshOutlined } from '@mui/icons-material';
import { authApi } from 'billing-api-client';
import { AuthCardLayout, useAuthNav, OtpInputGroup } from 'billing-react';
import '../../styles/Login.css';

export const VerifyOtp = () => {
  const { handleNav, isExiting } = useAuthNav();
  const location = useLocation();
  const email = location.state?.email || '';

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [resendNotice, setResendNotice] = useState(null);

  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleResend = async () => {
    if (timer > 0) return;
    try {
      setApiError(null);
      setResendNotice(null);
      await authApi.forgotPassword({ email });
      setOtp(['', '', '', '', '', '']);
      setTimer(30);
      setResendNotice('A new 6-digit verification code has been dispatched.');
    } catch (err) {
      setApiError(err?.message || 'Failed to resend code. Please try again.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) return setApiError('Please enter all 6 digits of the OTP.');
    try {
      setIsSubmitting(true);
      setApiError(null);
      await authApi.verifyOtp({ email, otp: code });
      handleNav('/reset-password', { email, otp: code });
    } catch (err) {
      setApiError(err?.message || 'Invalid or expired OTP code. Please check and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCardLayout
      isExiting={isExiting}
      onBack={() => handleNav('/forgot-password')}
      backLabel="Back"
      tagLabel="OTP"
      brandTitle="INVOICE.BILLING"
      brandSubtitle="TWO-STEP VERIFICATION"
      brandIcon={LockOutlined}
      cardDescription={
        <>We sent a 6-digit authentication code to {email ? <strong>{email}</strong> : 'your email address'}. Enter the code below to confirm identity.</>
      }
      alerts={
        <>
          {!email && (
            <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2, py: 0.5 }}>
              No email address found for verification. Please{' '}
              <Link component={RouterLink} to="/forgot-password" onClick={(e) => { e.preventDefault(); handleNav('/forgot-password'); }} sx={{ fontWeight: 700, color: '#9A4F2F' }}>
                request a code here
              </Link>.
            </Alert>
          )}
          {apiError && <Alert severity="error" onClose={() => setApiError(null)} sx={{ mb: 1.5, borderRadius: 2, py: 0.5 }}>{apiError}</Alert>}
          {resendNotice && <Alert severity="info" onClose={() => setResendNotice(null)} sx={{ mb: 1.5, borderRadius: 2, py: 0.5 }}>{resendNotice}</Alert>}
        </>
      }
    >
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <OtpInputGroup
          otp={otp}
          onChange={(newOtp) => {
            setOtp(newOtp);
            setApiError(null);
          }}
          disabled={isSubmitting}
        />

        <Button
          type="submit"
          fullWidth
          variant="contained"
          disabled={isSubmitting || !email}
          className="auth-submit-btn"
          endIcon={!isSubmitting && <VpnKeyOutlined sx={{ fontSize: 17 }} />}
        >
          {isSubmitting ? <CircularProgress size={20} color="inherit" /> : 'Verify Code'}
        </Button>

        <div className="otp-timer-text">
          {timer > 0 ? (
            <span>Didn't receive the code? Resend in <strong>{timer}s</strong></span>
          ) : (
            <span>
              Didn't receive the code?{' '}
              <Button onClick={handleResend} startIcon={<RefreshOutlined sx={{ fontSize: 14 }} />} className="otp-resend-btn">
                Resend code
              </Button>
            </span>
          )}
        </div>
      </Box>

      <Box sx={{ textAlign: 'center', mt: 2 }}>
        <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.8rem' }}>
          Incorrect email?{' '}
          <Link component={RouterLink} to="/forgot-password" onClick={(e) => { e.preventDefault(); handleNav('/forgot-password'); }} sx={{ color: '#9A4F2F', fontWeight: 700, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
            Change email address
          </Link>
        </Typography>
      </Box>
    </AuthCardLayout>
  );
};

export default VerifyOtp;