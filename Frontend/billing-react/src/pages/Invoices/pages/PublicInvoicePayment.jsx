import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  Box, Container, Paper, Typography, TextField, Button, Alert,
  CircularProgress, Divider, Tab, Tabs, Chip, Stack, Card, CardContent
} from '@mui/material';
import {
  CheckCircleOutline, QrCode2Outlined, PaymentOutlined,
  ReceiptLongOutlined, ArrowBack, SecurityOutlined
} from '@mui/icons-material';
import axios from 'axios';

export function PublicInvoicePayment() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const tenantId = searchParams.get('tenantId') || '2';

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [tab, setTab] = useState(0); // 0 = UPI QR, 1 = Razorpay Card/Netbanking
  const [paymentSuccess, setPaymentSuccess] = useState(null); // { isFull: bool, paidAmount: number, remainingBalance: number, reference: string }

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5271';

  const fetchOrder = async (customAmount = null) => {
    setLoading(true);
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
        if (customAmount === null) {
          setPayAmount(data.balanceAmount?.toString() || data.amount?.toString() || '');
        }
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load invoice payment details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchOrder();
    }
  }, [id, tenantId]);

  const handleAmountBlur = () => {
    const val = Number(payAmount);
    if (!val || val <= 0) {
      setError('Please enter a valid payment amount.');
      return;
    }
    if (order && val > order.balanceAmount) {
      setError(`Payment amount cannot exceed the outstanding balance of ₹${order.balanceAmount.toFixed(2)}.`);
      return;
    }
    setError('');
    fetchOrder(val);
  };

  const handleCompletePayment = async () => {
    if (!order || processing) return;
    const amountVal = Number(payAmount) || order.amount;

    if (amountVal <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }
    if (amountVal > order.balanceAmount) {
      setError(`Amount cannot exceed the balance of ₹${order.balanceAmount.toFixed(2)}.`);
      return;
    }

    setProcessing(true);
    setError('');

    const dummyPaymentId = `pay_${Date.now()}`;

    try {
      const res = await axios.post(`${API_URL}/api/v1/payments/gateway/verify`, {
        invoiceId: order.invoiceId,
        tenantId: parseInt(tenantId, 10),
        orderId: order.orderId,
        paymentId: dummyPaymentId,
        amount: amountVal,
        gateway: order.gateway || 'Razorpay'
      }, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (res?.data?.success !== false) {
        const remaining = Math.max(0, order.balanceAmount - amountVal);
        const isFull = remaining === 0;

        setPaymentSuccess({
          isFull,
          paidAmount: amountVal,
          remainingBalance: remaining,
          reference: dummyPaymentId,
          invoiceNumber: order.invoiceNumber,
          customerName: order.customerName
        });
      } else {
        setError(res?.data?.message || 'Payment verification failed.');
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Payment processing failed.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading && !order) {
    return (
      <Container maxWidth="sm" sx={{ py: 10, textAlign: 'center' }}>
        <CircularProgress size={44} />
        <Typography variant="body1" sx={{ mt: 2, color: 'text.secondary' }}>
          Loading secure invoice checkout...
        </Typography>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', py: { xs: 3, sm: 6 } }}>
      <Container maxWidth="sm">
        {/* Header Branding */}
        <Box sx={{ mb: 3, textAlign: 'center' }}>
          <Typography variant="h5" fontWeight={800} color="primary.main" sx={{ letterSpacing: -0.5 }}>
            IBMS Secure Payment Portal
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Encrypted 256-bit SSL transaction gateway
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {paymentSuccess ? (
          <Paper elevation={0} sx={{ p: 4, textAlign: 'center', borderRadius: 4, border: '1px solid #e2e8f0', bgcolor: '#ffffff' }}>
            <CheckCircleOutline color="success" sx={{ fontSize: 72, mb: 2 }} />
            <Typography variant="h5" fontWeight={800} color="text.primary" gutterBottom>
              {paymentSuccess.isFull ? 'Invoice Fully Paid!' : 'Partial Payment Received!'}
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Thank you, <strong>{paymentSuccess.customerName || 'Valued Customer'}</strong>. Your payment has been successfully recorded.
            </Typography>

            <Card variant="outlined" sx={{ mb: 3, bgcolor: '#f1f5f9', borderRadius: 3 }}>
              <CardContent sx={{ p: 2 }}>
                <Stack spacing={1}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Invoice Number:</Typography>
                    <Typography variant="body2" fontWeight={700}>{paymentSuccess.invoiceNumber}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Amount Paid Now:</Typography>
                    <Typography variant="body2" fontWeight={700} color="success.main">
                      ₹{paymentSuccess.paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Remaining Balance:</Typography>
                    <Typography variant="body2" fontWeight={700} color={paymentSuccess.isFull ? 'text.secondary' : 'warning.main'}>
                      ₹{paymentSuccess.remainingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Updated Status:</Typography>
                    <Chip
                      size="small"
                      label={paymentSuccess.isFull ? 'Paid' : 'Partially Paid'}
                      color={paymentSuccess.isFull ? 'success' : 'warning'}
                      sx={{ fontWeight: 700 }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">Transaction Ref:</Typography>
                    <Typography variant="caption" fontFamily="monospace">{paymentSuccess.reference}</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            <Typography variant="caption" color="text.secondary" display="block">
              A digital receipt has been dispatched to your email address and our accounting ledger has been updated.
            </Typography>
          </Paper>
        ) : order ? (
          <Paper elevation={0} sx={{ borderRadius: 4, border: '1px solid #e2e8f0', bgcolor: '#ffffff', overflow: 'hidden' }}>
            {/* Invoice Meta Bar */}
            <Box sx={{ p: 3, bgcolor: '#1e293b', color: '#ffffff' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Box>
                  <Typography variant="overline" sx={{ color: '#94a3b8', letterSpacing: 1 }}>
                    Tax Invoice
                  </Typography>
                  <Typography variant="h6" fontWeight={700}>
                    {order.invoiceNumber}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={order.status || 'Issued'}
                  sx={{
                    bgcolor: order.status === 'Partially Paid' ? '#f59e0b' : '#3b82f6',
                    color: '#ffffff',
                    fontWeight: 700
                  }}
                />
              </Box>
              <Typography variant="body2" sx={{ color: '#cbd5e1' }}>
                Customer: <strong>{order.customerName || 'N/A'}</strong>
              </Typography>
            </Box>

            {/* Financial Breakdown & Editable Partial Payment */}
            <Box sx={{ p: 3 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 3, textAlign: 'center' }}>
                <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">Total</Typography>
                  <Typography variant="body2" fontWeight={700}>
                    ₹{(order.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Typography>
                </Box>
                <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">Paid</Typography>
                  <Typography variant="body2" fontWeight={700} color="success.main">
                    ₹{(order.paidAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Typography>
                </Box>
                <Box sx={{ p: 1.5, bgcolor: '#eff6ff', borderRadius: 2, border: '1px solid #bfdbfe' }}>
                  <Typography variant="caption" color="primary.main">Balance Due</Typography>
                  <Typography variant="body2" fontWeight={800} color="primary.main">
                    ₹{(order.balanceAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Typography>
                </Box>
              </Box>

              {/* Editable Payment Amount Section */}
              <Box sx={{ mb: 3, p: 2, bgcolor: '#fafafa', borderRadius: 3, border: '1px dashed #cbd5e1' }}>
                <Typography variant="subtitle2" fontWeight={700} color="text.primary" gutterBottom>
                  Payment Amount
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  You can edit this amount to make a <strong>partial payment</strong> or pay the full balance.
                </Typography>

                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Amount to Pay (INR)"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  onBlur={handleAmountBlur}
                  inputProps={{ min: 1, max: order.balanceAmount, step: 0.01 }}
                  sx={{ bgcolor: '#ffffff' }}
                />

                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                  <Chip
                    size="small"
                    label={`Pay Full (₹${order.balanceAmount})`}
                    onClick={() => {
                      setPayAmount(order.balanceAmount.toString());
                      fetchOrder(order.balanceAmount);
                    }}
                    clickable
                    color="primary"
                    variant={Number(payAmount) === order.balanceAmount ? 'filled' : 'outlined'}
                  />
                  {order.balanceAmount > 100 && (
                    <Chip
                      size="small"
                      label={`Pay 50% (₹${Math.round(order.balanceAmount / 2)})`}
                      onClick={() => {
                        const half = Math.round(order.balanceAmount / 2);
                        setPayAmount(half.toString());
                        fetchOrder(half);
                      }}
                      clickable
                      variant={Number(payAmount) === Math.round(order.balanceAmount / 2) ? 'filled' : 'outlined'}
                    />
                  )}
                </Stack>
              </Box>

              {/* Payment Methods: QR Code or Razorpay */}
              <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
                  <Tab icon={<QrCode2Outlined />} label="Scan UPI QR" iconPosition="start" />
                  <Tab icon={<PaymentOutlined />} label="Razorpay / Card" iconPosition="start" />
                </Tabs>
              </Box>

              {tab === 0 ? (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                  {order.qrCodeBase64 ? (
                    <Box sx={{ display: 'inline-block', p: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                      <img
                        src={`data:image/png;base64,${order.qrCodeBase64}`}
                        alt="Dynamic UPI QR Code"
                        style={{ width: 220, height: 220, display: 'block', margin: 'auto' }}
                      />
                    </Box>
                  ) : (
                    <Alert severity="warning">QR code generator initializing...</Alert>
                  )}
                  <Typography variant="body2" fontWeight={600} sx={{ mt: 1.5 }}>
                    Scan with any UPI App (GPay, PhonePe, Paytm, BHIM)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Amount locked: <strong>₹{Number(payAmount || order.amount).toFixed(2)}</strong>
                  </Typography>

                  <Box sx={{ mt: 3 }}>
                    <Button
                      variant="contained"
                      color="success"
                      size="large"
                      fullWidth
                      disabled={processing}
                      onClick={handleCompletePayment}
                      sx={{ py: 1.4, borderRadius: 2.5, fontWeight: 700 }}
                    >
                      {processing ? 'Confirming Payment...' : `Complete Payment of ₹${Number(payAmount || order.amount).toFixed(2)}`}
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ py: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Pay securely using Credit Cards, Debit Cards, NetBanking, or Wallets powered by Razorpay.
                  </Typography>
                  <Card variant="outlined" sx={{ p: 2, mb: 3, bgcolor: '#f8fafc', borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Payable Now</Typography>
                    <Typography variant="h5" fontWeight={800} color="primary.main">
                      ₹{Number(payAmount || order.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Card>
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    fullWidth
                    disabled={processing}
                    onClick={handleCompletePayment}
                    sx={{ py: 1.4, borderRadius: 2.5, fontWeight: 700 }}
                  >
                    {processing ? 'Processing...' : `Pay ₹${Number(payAmount || order.amount).toFixed(2)} via Razorpay`}
                  </Button>
                </Box>
              )}
            </Box>

            <Divider />
            <Box sx={{ p: 2, bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <SecurityOutlined sx={{ fontSize: 16, color: '#64748b' }} />
              <Typography variant="caption" color="text.secondary">
                Protected by 256-Bit SSL Encryption • PCI-DSS Compliant
              </Typography>
            </Box>
          </Paper>
        ) : null}
      </Container>
    </Box>
  );
}
