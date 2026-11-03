import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  Box, Container, Paper, Typography, TextField, Button, Alert,
  CircularProgress, Divider, Tab, Tabs, Chip, Stack, Card, CardContent,
  IconButton, Tooltip, Collapse
} from '@mui/material';
import {
  CheckCircleOutline, QrCode2Outlined, PaymentOutlined,
  AccountBalanceOutlined, ArrowBack, SecurityOutlined,
  ContentCopy, Done, RadioButtonChecked
} from '@mui/icons-material';
import axios from 'axios';

// Dynamically load Razorpay standard checkout script
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export function PublicInvoicePayment() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const tenantId = searchParams.get('tenantId') || '2';

  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [tab, setTab] = useState(0); // 0 = UPI QR, 1 = Razorpay Card, 2 = Bank Transfer
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const [copiedField, setCopiedField] = useState('');
  const [showUtrFallback, setShowUtrFallback] = useState(false);
  const [utrNumber, setUtrNumber] = useState('');

  const initialPaidRef = useRef(null);
  const initialBalanceRef = useRef(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5271';

  // Fetch or update order details
  const fetchOrder = async (customAmount = null, updateInputText = false) => {
    if (customAmount !== null) setQrLoading(true);
    else setLoading(true);
    setError('');

    try {
      const payload = {
        invoiceId: parseInt(id, 10),
        tenantId: parseInt(tenantId, 10),
        amount: customAmount !== null ? Number(customAmount) : undefined,
        currency: 'INR',
        gateway: 'Razorpay'
      };

      const res = await axios.post(`${API_URL}/api/v1/payments/gateway/create-order`, payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      const data = res?.data?.data || res?.data;
      if (data) {
        setOrder(data);
        if (initialPaidRef.current === null) {
          initialPaidRef.current = data.paidAmount ?? 0;
          initialBalanceRef.current = data.balanceAmount ?? 0;
        }
        if (updateInputText || customAmount === null) {
          setPayAmount(data.balanceAmount?.toString() || data.amount?.toString() || '');
        }
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load invoice payment details.');
    } finally {
      setLoading(false);
      setQrLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchOrder(null, true);
    }
  }, [id, tenantId]);

  // Debounced dynamic QR update as the user types amount
  useEffect(() => {
    if (!order || !order.balanceAmount) return;

    const timer = setTimeout(() => {
      const rawVal = parseFloat(payAmount);
      let targetAmount = order.balanceAmount;

      if (!isNaN(rawVal) && rawVal > 0) {
        // Enforce capping: if rawVal exceeds balanceAmount, clamp to balanceAmount!
        targetAmount = Math.min(rawVal, order.balanceAmount);
      }

      // Only regenerate if target amount differs from the currently locked QR amount
      if (Math.abs(targetAmount - order.amount) > 0.01) {
        fetchOrder(targetAmount, false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [payAmount, order?.balanceAmount, order?.amount]);

  // Automatic Polling: Auto-detect when QR payment or bank transfer completes without clicking any button
  useEffect(() => {
    if (!order || paymentSuccess) return;

    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_URL}/api/v1/payments/gateway/invoice-status/${order.invoiceId}?tenantId=${tenantId}`);
        const inv = res?.data?.data;
        if (inv) {
          const initPaid = initialPaidRef.current ?? order.paidAmount ?? 0;
          const initBal = initialBalanceRef.current ?? order.balanceAmount ?? 0;

          if (inv.paidAmount > initPaid || inv.balanceAmount < initBal || inv.isPaid) {
            const newlyPaid = inv.paidAmount - initPaid;
            setPaymentSuccess({
              isFull: inv.isPaid || inv.balanceAmount <= 0,
              paidAmount: newlyPaid > 0 ? newlyPaid : (Number(payAmount) || order.amount),
              remainingBalance: inv.balanceAmount,
              reference: 'UPI_AUTO_VERIFIED',
              invoiceNumber: inv.invoiceNumber,
              customerName: order.customerName
            });
          }
        }
      } catch (err) {
        // Silently retry on next poll interval
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [order, paymentSuccess, tenantId, payAmount]);

  // Handle Real Razorpay Card Checkout Modal
  const handleRazorpayCardCheckout = async () => {
    if (!order || processing) return;
    setProcessing(true);
    setError('');

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setError('Unable to load Razorpay payment SDK. Please check your internet connection or use UPI QR.');
      setProcessing(false);
      return;
    }

    const rawVal = parseFloat(payAmount);
    const effectiveAmount = !isNaN(rawVal) && rawVal > 0
      ? Math.min(rawVal, order.balanceAmount)
      : order.balanceAmount;

    const options = {
      key: order.keyId || 'rzp_test_ibms_sandbox',
      amount: Math.round(effectiveAmount * 100), // amount in paise
      currency: order.currency || 'INR',
      name: 'IBMS Invoicing',
      description: `Payment for Invoice #${order.invoiceNumber}`,
      image: '/branding/ibms-crest.png',
      order_id: order.orderId && order.orderId.startsWith('order_') && order.orderId.length === 20 ? order.orderId : undefined,
      prefill: {
        name: order.customerName || '',
        email: order.customerEmail || '',
        contact: order.customerPhone || ''
      },
      notes: {
        invoiceId: String(order.invoiceId),
        invoiceNumber: order.invoiceNumber,
        tenantId: String(tenantId)
      },
      theme: {
        color: '#6B2E0C'
      },
      handler: async function (response) {
        try {
          const res = await axios.post(`${API_URL}/api/v1/payments/gateway/verify`, {
            invoiceId: order.invoiceId,
            tenantId: parseInt(tenantId, 10),
            orderId: order.orderId,
            paymentId: response.razorpay_payment_id || `pay_${Date.now()}`,
            signature: response.razorpay_signature || 'rzp_sig',
            amount: effectiveAmount,
            gateway: 'Razorpay'
          });

          if (res?.data?.success !== false) {
            const remaining = Math.max(0, order.balanceAmount - effectiveAmount);
            setPaymentSuccess({
              isFull: remaining === 0,
              paidAmount: effectiveAmount,
              remainingBalance: remaining,
              reference: response.razorpay_payment_id,
              invoiceNumber: order.invoiceNumber,
              customerName: order.customerName
            });
          } else {
            setError(res?.data?.message || 'Payment verification failed.');
          }
        } catch (err) {
          setError(err?.response?.data?.message || err?.message || 'Payment verification failed.');
        } finally {
          setProcessing(false);
        }
      },
      modal: {
        ondismiss: function () {
          setProcessing(false);
        }
      }
    };

    try {
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        setError(resp.error?.description || 'Card payment was unsuccessful.');
        setProcessing(false);
      });
      rzp.open();
    } catch (err) {
      setError('Could not open Razorpay checkout: ' + err.message);
      setProcessing(false);
    }
  };

  // UTR manual confirmation or 1-click confirmation
  const handleUtrSubmit = async (customUtr = null) => {
    const finalRef = (customUtr || utrNumber || `UPI_${Date.now()}`).trim();
    setProcessing(true);
    setError('');

    const rawVal = parseFloat(payAmount);
    const effectiveAmount = !isNaN(rawVal) && rawVal > 0
      ? Math.min(rawVal, order.balanceAmount)
      : order.balanceAmount;

    try {
      const res = await axios.post(`${API_URL}/api/v1/payments/gateway/verify`, {
        invoiceId: order.invoiceId,
        tenantId: parseInt(tenantId, 10),
        orderId: order.orderId,
        paymentId: finalRef,
        amount: effectiveAmount,
        gateway: 'UPI_Direct'
      });

      if (res?.data?.success !== false) {
        const remaining = Math.max(0, order.balanceAmount - effectiveAmount);
        setPaymentSuccess({
          isFull: remaining === 0,
          paidAmount: effectiveAmount,
          remainingBalance: remaining,
          reference: finalRef,
          invoiceNumber: order.invoiceNumber,
          customerName: order.customerName
        });
      } else {
        setError(res?.data?.message || 'Payment verification failed.');
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to submit payment reference.');
    } finally {
      setProcessing(false);
    }
  };

  const copyToClipboard = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(''), 2000);
  };

  if (loading && !order) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#F9F5EF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Container maxWidth="sm" sx={{ py: 10, textAlign: 'center' }}>
          <CircularProgress size={44} sx={{ color: '#65442E' }} />
          <Typography variant="body1" sx={{ mt: 2, color: '#7E6B5C', fontWeight: 600 }}>
            Loading secure invoice checkout...
          </Typography>
        </Container>
      </Box>
    );
  }

  const rawInput = parseFloat(payAmount);
  const isCapped = !isNaN(rawInput) && rawInput > (order?.balanceAmount ?? 0);
  const currentPayable = isCapped ? order.balanceAmount : (!isNaN(rawInput) && rawInput > 0 ? rawInput : order?.amount ?? 0);

  return (
    <Box sx={{
      minHeight: '100vh',
      bgcolor: '#F9F5EF',
      background: 'linear-gradient(180deg, #F8F1E7 0%, #F5ECE0 100%)',
      py: { xs: 3, sm: 6 },
      px: { xs: 2, sm: 3 }
    }}>
      <Container maxWidth="sm">
        {/* Header Branding matching INVOICE.BILLING design */}
        <Box sx={{ mb: 3.5, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5, mb: 0.8 }}>
            <Box
              component="img"
              src="/branding/ibms-crest.png"
              alt="IBMS Crest"
              sx={{ width: 44, height: 44, objectFit: 'contain' }}
            />
            <Box sx={{ textAlign: 'left' }}>
              <Typography sx={{ fontSize: '1.45rem', fontWeight: 800, color: '#3E2C24', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                INVOICE<span style={{ color: '#92634C' }}>.</span>BILLING
              </Typography>
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 750, color: '#8A6850', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Secure Payment Portal
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, px: 1.5, py: 0.4, bgcolor: '#EFE4D6', borderRadius: 99, mt: 0.5 }}>
            <SecurityOutlined sx={{ fontSize: 13, color: '#65442E' }} />
            <Typography variant="caption" sx={{ color: '#6A4838', fontWeight: 600, fontSize: '0.72rem' }}>
              256-Bit Bank-Grade Encrypted Gateway
            </Typography>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2.5, bgcolor: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {paymentSuccess ? (
          <Paper
            elevation={0}
            sx={{
              p: 4,
              textAlign: 'center',
              borderRadius: 4,
              border: '1px solid #E4D8C8',
              bgcolor: '#FFFDF9',
              boxShadow: '0 12px 36px rgba(90, 37, 8, 0.07)'
            }}
          >
            <CheckCircleOutline sx={{ fontSize: 72, mb: 2, color: '#16A34A' }} />
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#35271F' }} gutterBottom>
              {paymentSuccess.isFull ? 'Invoice Fully Paid!' : 'Partial Payment Received!'}
            </Typography>

            <Typography variant="body1" sx={{ color: '#756354', mb: 3 }}>
              Thank you, <strong style={{ color: '#35271F' }}>{paymentSuccess.customerName || 'Valued Customer'}</strong>. Your payment has been successfully recorded.
            </Typography>

            <Card variant="outlined" sx={{ mb: 3, bgcolor: '#FAF4EC', borderRadius: 3, border: '1px solid #E8DCCE' }}>
              <CardContent sx={{ p: 2.5 }}>
                <Stack spacing={1.5}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: '#7E6B5C', fontWeight: 600 }}>Invoice Number:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 750, color: '#35271F' }}>{paymentSuccess.invoiceNumber}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: '#7E6B5C', fontWeight: 600 }}>Amount Paid Now:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: '#16A34A' }}>
                      ₹{Number(paymentSuccess.paidAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: '#7E6B5C', fontWeight: 600 }}>Remaining Balance Due:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: paymentSuccess.remainingBalance > 0 ? '#65442E' : '#35271F' }}>
                      ₹{Number(paymentSuccess.remainingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ color: '#7E6B5C', fontWeight: 600 }}>Payment Status:</Typography>
                    <Chip
                      size="small"
                      label={paymentSuccess.isFull ? 'Paid' : 'Partially Paid'}
                      sx={{
                        fontWeight: 750,
                        bgcolor: paymentSuccess.isFull ? '#DCFCE7' : '#FEF3C7',
                        color: paymentSuccess.isFull ? '#166534' : '#92400E',
                        border: paymentSuccess.isFull ? '1px solid #86EFAC' : '1px solid #FCD34D'
                      }}
                    />
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            <Button
              variant="outlined"
              startIcon={<ArrowBack />}
              onClick={() => {
                setPaymentSuccess(null);
                fetchOrder(null, true);
              }}
              sx={{
                borderColor: '#DECFBB',
                color: '#65442E',
                fontWeight: 700,
                borderRadius: 2.5,
                px: 3,
                '&:hover': { borderColor: '#65442E', bgcolor: '#FAF4EC' }
              }}
            >
              Back to Invoice Summary
            </Button>
          </Paper>
        ) : order ? (
          <Paper
            elevation={0}
            sx={{
              borderRadius: 4,
              border: '1px solid #E4D8C8',
              bgcolor: '#FFFDF9',
              boxShadow: '0 12px 36px rgba(90, 37, 8, 0.07), 0 2px 6px rgba(90, 37, 8, 0.03)',
              overflow: 'hidden'
            }}
          >
            {/* Invoice Summary Banner */}
            <Box sx={{
              p: { xs: 2.5, sm: 3 },
              bgcolor: '#FAF4EC',
              borderBottom: '1px solid #E8DCCE',
              background: 'linear-gradient(180deg, #FAF4EC 0%, #F5ECE1 100%)'
            }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Box>
                  <Typography sx={{ fontSize: '0.72rem', color: '#8A6850', fontWeight: 750, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Invoice Outstanding
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#35271F', letterSpacing: '-0.02em' }}>
                    {order.invoiceNumber}
                  </Typography>
                </Box>
                <Chip
                  label={order.status || 'Unpaid'}
                  size="small"
                  sx={{
                    fontWeight: 750,
                    fontSize: '0.75rem',
                    ...(order.status === 'Paid'
                      ? { bgcolor: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC' }
                      : order.status === 'Partially Paid'
                        ? { bgcolor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }
                        : { bgcolor: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' }
                    )
                  }}
                />
              </Box>

              <Typography variant="body2" sx={{ color: '#756354', mb: 2 }}>
                Customer: <strong style={{ color: '#35271F' }}>{order.customerName || 'N/A'}</strong>
              </Typography>

              {/* Financial Snapshot */}
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 1.5,
                bgcolor: '#FFFFFF',
                p: 1.75,
                borderRadius: 2.5,
                border: '1px solid #E4D8C8',
                boxShadow: '0 2px 8px rgba(90, 37, 8, 0.04)'
              }}>
                <Box>
                  <Typography sx={{ fontSize: '0.72rem', color: '#7E6B5C', fontWeight: 600 }}>Total Amount</Typography>
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 750, color: '#35271F' }}>
                    ₹{order.totalAmount?.toLocaleString('en-IN')}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.72rem', color: '#7E6B5C', fontWeight: 600 }}>Already Paid</Typography>
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 750, color: '#16A34A' }}>
                    ₹{order.paidAmount?.toLocaleString('en-IN')}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.72rem', color: '#7E6B5C', fontWeight: 600 }}>Balance Due</Typography>
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: '#65442E' }}>
                    ₹{order.balanceAmount?.toLocaleString('en-IN')}
                  </Typography>
                </Box>
              </Box>
            </Box>

            <Box sx={{ p: { xs: 2.5, sm: 3 } }}>
              {/* Editable Payment Amount Section */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 750, color: '#35271F', mb: 0.5 }}>
                  Enter Amount to Pay (INR)
                </Typography>
                <Typography variant="caption" sx={{ color: '#7E6B5C', display: 'block', mb: 1.5 }}>
                  You can pay the full amount or any partial amount up to ₹{order.balanceAmount?.toLocaleString('en-IN')}.
                </Typography>

                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Amount to Pay (INR)"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  inputProps={{ min: 1, max: order.balanceAmount, step: 0.01 }}
                  sx={{
                    bgcolor: '#FFFFFF',
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      '& fieldset': { borderColor: '#DECFBB' },
                      '&:hover fieldset': { borderColor: '#A2693E' },
                      '&.Mui-focused fieldset': { borderColor: '#65442E', borderWidth: 2 }
                    },
                    '& .MuiInputLabel-root.Mui-focused': { color: '#65442E' }
                  }}
                />

                {isCapped && (
                  <Alert severity="info" sx={{ mt: 1, py: 0.5, borderRadius: 2, bgcolor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>
                    Amount exceeds outstanding balance. QR is locked to full payment of <strong>₹{order.balanceAmount?.toFixed(2)}</strong>.
                  </Alert>
                )}

                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                  <Chip
                    size="small"
                    label={`Pay Full (₹${order.balanceAmount})`}
                    onClick={() => setPayAmount(order.balanceAmount.toString())}
                    clickable
                    sx={{
                      fontWeight: 700,
                      ...(Number(payAmount) === order.balanceAmount
                        ? { bgcolor: '#65442E', color: '#FFF8EF', '&:hover': { bgcolor: '#513420' } }
                        : { bgcolor: '#FAF4EC', color: '#65442E', border: '1px solid #DDCBB5', '&:hover': { bgcolor: '#F3E8DB' } }
                      )
                    }}
                  />
                  {order.balanceAmount > 100 && (
                    <Chip
                      size="small"
                      label={`Pay 50% (₹${Math.round(order.balanceAmount / 2)})`}
                      onClick={() => setPayAmount(Math.round(order.balanceAmount / 2).toString())}
                      clickable
                      sx={{
                        fontWeight: 700,
                        ...(Number(payAmount) === Math.round(order.balanceAmount / 2)
                          ? { bgcolor: '#65442E', color: '#FFF8EF', '&:hover': { bgcolor: '#513420' } }
                          : { bgcolor: '#FAF4EC', color: '#65442E', border: '1px solid #DDCBB5', '&:hover': { bgcolor: '#F3E8DB' } }
                        )
                      }}
                    />
                  )}
                </Stack>
              </Box>

              {/* Payment Methods Tabs */}
              <Box sx={{ borderBottom: 1, borderColor: '#E8DCCE', mb: 2 }}>
                <Tabs
                  value={tab}
                  onChange={(_, v) => setTab(v)}
                  variant="fullWidth"
                  TabIndicatorProps={{
                    style: { backgroundColor: '#65442E', height: 3, borderRadius: '3px 3px 0 0' }
                  }}
                  sx={{
                    '& .MuiTab-root': {
                      textTransform: 'none',
                      fontWeight: 650,
                      fontSize: '0.88rem',
                      color: '#756354',
                      '&.Mui-selected': {
                        color: '#65442E',
                        fontWeight: 750
                      }
                    }
                  }}
                >
                  <Tab icon={<QrCode2Outlined />} label="Scan UPI QR" iconPosition="start" />
                  <Tab icon={<PaymentOutlined />} label="Razorpay / Card" iconPosition="start" />
                  {(order.bankName || order.accountNumber) && (
                    <Tab icon={<AccountBalanceOutlined />} label="Bank Transfer" iconPosition="start" />
                  )}
                </Tabs>
              </Box>

              {/* TAB 0: Scan UPI QR */}
              {tab === 0 && (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                  {qrLoading ? (
                    <Box sx={{ py: 6 }}>
                      <CircularProgress size={36} sx={{ color: '#65442E' }} />
                      <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#7E6B5C' }}>
                        Updating QR code for ₹{currentPayable.toFixed(2)}...
                      </Typography>
                    </Box>
                  ) : order.qrCodeBase64 ? (
                    <Box sx={{
                      display: 'inline-block',
                      p: 2,
                      bgcolor: '#FFFFFF',
                      border: '2px solid #E8DCCE',
                      borderRadius: 3.5,
                      boxShadow: '0 8px 24px rgba(101, 68, 46, 0.08)'
                    }}>
                      <img
                        src={`data:image/png;base64,${order.qrCodeBase64}`}
                        alt="Dynamic UPI QR Code"
                        style={{ width: 220, height: 220, display: 'block', margin: 'auto' }}
                      />
                    </Box>
                  ) : (
                    <Alert severity="warning" sx={{ bgcolor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>
                      QR code generator initializing...
                    </Alert>
                  )}

                  <Typography variant="body2" sx={{ fontWeight: 750, color: '#35271F', mt: 1.5 }}>
                    Scan with any UPI App (GPay, PhonePe, Paytm, BHIM)
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#7E6B5C' }}>
                    Amount locked: <strong style={{ color: '#65442E' }}>₹{Number(currentPayable).toFixed(2)}</strong>
                    {order.upiId && <span> • UPI ID: <strong style={{ color: '#35271F' }}>{order.upiId}</strong></span>}
                  </Typography>

                  {/* Payment Confirmation Card for PhonePe / UPI */}
                  <Box sx={{
                    mt: 3,
                    p: 2.5,
                    bgcolor: '#FAF4EC',
                    border: '1px solid #E8DCCE',
                    borderRadius: 3,
                    textAlign: 'left'
                  }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 750, color: '#35271F', mb: 0.5 }}>
                      Paid through PhonePe / UPI?
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#7E6B5C', display: 'block', mb: 1.5 }}>
                      Enter the 12-digit UTR from your PhonePe receipt (or click the button below) to instantly confirm and update your invoice:
                    </Typography>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="Enter PhonePe UTR (e.g. 430219876543)"
                        value={utrNumber}
                        onChange={(e) => setUtrNumber(e.target.value)}
                        sx={{
                          bgcolor: '#FFFFFF',
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            '& fieldset': { borderColor: '#DECFBB' },
                            '&:hover fieldset': { borderColor: '#A2693E' },
                            '&.Mui-focused fieldset': { borderColor: '#65442E' }
                          }
                        }}
                      />
                      <Button
                        variant="contained"
                        disabled={processing}
                        onClick={() => handleUtrSubmit()}
                        sx={{
                          minWidth: 160,
                          py: 1,
                          bgcolor: '#65442E',
                          color: '#FFF8EF',
                          fontWeight: 750,
                          textTransform: 'none',
                          borderRadius: 2,
                          boxShadow: '0 4px 12px rgba(101, 68, 46, 0.2)',
                          '&:hover': { bgcolor: '#513420' }
                        }}
                      >
                        {processing ? 'Confirming...' : `I Have Paid ₹${Number(currentPayable).toFixed(2)}`}
                      </Button>
                    </Stack>
                  </Box>
                </Box>
              )}

              {/* TAB 1: Razorpay Card Checkout */}
              {tab === 1 && (
                <Box sx={{ py: 2, textAlign: 'center' }}>
                  <Typography variant="body2" sx={{ color: '#7E6B5C', mb: 2 }}>
                    Pay securely using Credit Cards, Debit Cards, NetBanking, or Wallets powered by Razorpay.
                  </Typography>

                  <Card variant="outlined" sx={{
                    p: 2.5,
                    mb: 3,
                    bgcolor: '#FAF4EC',
                    borderRadius: 3,
                    border: '1px solid #E8DCCE',
                    boxShadow: '0 2px 8px rgba(101, 68, 46, 0.04)'
                  }}>
                    <Typography variant="caption" sx={{ color: '#8A6850', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Payable Amount
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 850, color: '#65442E', my: 0.5, letterSpacing: '-0.02em' }}>
                      ₹{Number(currentPayable).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#7E6B5C' }}>
                      Customer card details & OTP are requested securely on the next step.
                    </Typography>
                  </Card>

                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={processing}
                    onClick={handleRazorpayCardCheckout}
                    sx={{
                      py: 1.6,
                      borderRadius: 2.5,
                      fontWeight: 750,
                      fontSize: '0.98rem',
                      textTransform: 'none',
                      bgcolor: '#65442E',
                      color: '#FFF8EF',
                      boxShadow: '0 4px 16px rgba(101, 68, 46, 0.25)',
                      '&:hover': {
                        bgcolor: '#513420',
                        boxShadow: '0 6px 20px rgba(101, 68, 46, 0.35)'
                      }
                    }}
                  >
                    {processing ? 'Opening Razorpay...' : `Pay ₹${Number(currentPayable).toFixed(2)} via Razorpay (Cards / NetBanking)`}
                  </Button>
                </Box>
              )}

              {/* TAB 2: Direct Bank Transfer Details */}
              {tab === 2 && (
                <Box sx={{ py: 1 }}>
                  <Typography variant="body2" sx={{ color: '#7E6B5C', mb: 2 }}>
                    Transfer directly from your banking app (IMPS, NEFT, RTGS) or UPI "To Bank Account" using these details:
                  </Typography>

                  <Paper variant="outlined" sx={{
                    p: 2.5,
                    borderRadius: 3,
                    bgcolor: '#FAF4EC',
                    border: '1px solid #E8DCCE',
                    mb: 3
                  }}>
                    <Stack spacing={1.5}>
                      {order.accountHolderName && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" sx={{ color: '#7E6B5C', fontWeight: 600 }}>Account Holder:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 750, color: '#35271F' }}>{order.accountHolderName}</Typography>
                        </Box>
                      )}
                      {order.bankName && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" sx={{ color: '#7E6B5C', fontWeight: 600 }}>Bank Name:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 750, color: '#35271F' }}>{order.bankName}</Typography>
                        </Box>
                      )}
                      {order.accountNumber && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" sx={{ color: '#7E6B5C', fontWeight: 600 }}>Account Number:</Typography>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Typography variant="body2" sx={{ fontWeight: 750, fontFamily: 'monospace', fontSize: '1.05rem', color: '#35271F' }}>
                              {order.accountNumber}
                            </Typography>
                            <Tooltip title="Copy Account Number">
                              <IconButton size="small" onClick={() => copyToClipboard(order.accountNumber, 'account')} sx={{ color: '#65442E' }}>
                                {copiedField === 'account' ? <Done fontSize="small" color="success" /> : <ContentCopy fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </Box>
                      )}
                      {order.ifscCode && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" sx={{ color: '#7E6B5C', fontWeight: 600 }}>IFSC Code:</Typography>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Typography variant="body2" sx={{ fontWeight: 750, fontFamily: 'monospace', fontSize: '1.05rem', color: '#35271F' }}>
                              {order.ifscCode}
                            </Typography>
                            <Tooltip title="Copy IFSC">
                              <IconButton size="small" onClick={() => copyToClipboard(order.ifscCode, 'ifsc')} sx={{ color: '#65442E' }}>
                                {copiedField === 'ifsc' ? <Done fontSize="small" color="success" /> : <ContentCopy fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </Box>
                      )}
                      {order.branch && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" sx={{ color: '#7E6B5C', fontWeight: 600 }}>Branch:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 750, color: '#35271F' }}>{order.branch}</Typography>
                        </Box>
                      )}
                    </Stack>
                  </Paper>

                  {/* Step-by-Step Instructions & UTR Submission */}
                  <Box sx={{ p: 2.5, bgcolor: '#F3FAF4', border: '1px solid #86EFAC', borderRadius: 3, mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 750, color: '#166534', mb: 0.5 }}>
                      After Transferring, Confirm Your Payment:
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#4B6353', display: 'block', mb: 2 }}>
                      Once you complete the transfer in your bank app, enter the 12-digit UTR / Transaction Reference Number below to instantly confirm your payment.
                    </Typography>

                    <Stack spacing={1.5}>
                      <TextField
                        size="small"
                        fullWidth
                        label="Bank UTR / Transaction Reference Number"
                        placeholder="e.g. 430219876543 or UBIN..."
                        value={utrNumber}
                        onChange={(e) => setUtrNumber(e.target.value)}
                        sx={{
                          bgcolor: '#FFFFFF',
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            '& fieldset': { borderColor: '#DECFBB' },
                            '&:hover fieldset': { borderColor: '#A2693E' },
                            '&.Mui-focused fieldset': { borderColor: '#16A34A' }
                          }
                        }}
                      />
                      <Button
                        variant="contained"
                        size="large"
                        fullWidth
                        disabled={processing || !utrNumber.trim()}
                        onClick={handleUtrSubmit}
                        sx={{
                          py: 1.4,
                          fontWeight: 750,
                          textTransform: 'none',
                          borderRadius: 2.5,
                          bgcolor: '#16A34A',
                          color: '#FFFFFF',
                          '&:hover': { bgcolor: '#15803D' }
                        }}
                      >
                        {processing ? 'Confirming Transfer...' : `Confirm Payment of ₹${Number(currentPayable).toFixed(2)}`}
                      </Button>
                    </Stack>
                  </Box>

                  {/* Or NetBanking Online Option */}
                  <Box sx={{ textAlign: 'center', pt: 1 }}>
                    <Button
                      variant="text"
                      size="small"
                      startIcon={<PaymentOutlined />}
                      onClick={() => setTab(1)}
                      sx={{ textTransform: 'none', color: '#65442E', fontWeight: 700 }}
                    >
                      Want to pay online instantly via NetBanking / Cards instead? Click here
                    </Button>
                  </Box>
                </Box>
              )}
            </Box>

            <Divider sx={{ borderColor: '#E8DCCE' }} />
            <Box sx={{ p: 2, bgcolor: '#FAF4EC', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <SecurityOutlined sx={{ fontSize: 16, color: '#8A6850' }} />
              <Typography variant="caption" sx={{ color: '#7E6B5C', fontWeight: 600 }}>
                Protected by 256-Bit SSL Encryption • PCI-DSS Compliant
              </Typography>
            </Box>
          </Paper>
        ) : null}
      </Container>
    </Box>
  );
}
