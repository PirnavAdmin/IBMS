import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  Box, Container, Paper, Typography, TextField, Button, Alert,
  CircularProgress, Divider, Tab, Tabs, Chip, Stack, Card, CardContent,
  IconButton, Tooltip, Collapse, InputAdornment, Autocomplete
} from '@mui/material';
import {
  CheckCircleOutline, QrCode2Outlined, PaymentOutlined,
  AccountBalanceOutlined, ArrowBack, SecurityOutlined,
  ContentCopy, Done, RadioButtonChecked, CreditCardOutlined,
  LockOutlined, FlashOn, PersonOutline, Visibility, VisibilityOff
} from '@mui/icons-material';
import axios from 'axios';
import { InvoiceBillingLogo } from '../../../components/InvoiceBillingLogo';
// Comprehensive list of RBI-scheduled Indian banks (Public Sector, Private Sector,
// Small Finance, Payments, Major Foreign Banks in India, Co-operative & Grameena Banks)
const INDIAN_NETBANKING_BANKS = [
  'Abhyudaya Co-operative Bank',
  'Airtel Payments Bank',
  'Andhra Pragathi Grameena Bank',
  'Andhra Pradesh Grameena Vikas Bank',
  'AP Mahesh Co-operative Urban Bank',
  'AU Small Finance Bank',
  'Axis Bank',
  'Bandhan Bank',
  'Bank of America India',
  'Bank of Baroda',
  'Bank of India',
  'Bank of Maharashtra',
  'Barclays Bank India',
  'Baroda Gujarat Gramin Bank',
  'Baroda Rajasthan Kshetriya Gramin Bank',
  'Baroda UP Bank',
  'BNP Paribas India',
  'Canara Bank',
  'Capital Small Finance Bank',
  'Central Bank of India',
  'Chaitanya Godavari Grameena Bank',
  'Citibank India',
  'City Union Bank',
  'Cosmos Co-operative Bank',
  'CSB Bank',
  'DBS Bank India',
  'DCB Bank',
  'Deutsche Bank India',
  'Dhanlaxmi Bank',
  'Equitas Small Finance Bank',
  'ESAF Small Finance Bank',
  'Federal Bank',
  'Fino Payments Bank',
  'HDFC Bank',
  'HSBC India',
  'ICICI Bank',
  'IDBI Bank',
  'IDFC First Bank',
  'India Post Payments Bank',
  'Indian Bank',
  'Indian Overseas Bank',
  'IndusInd Bank',
  'Jammu & Kashmir Bank',
  'Jana Small Finance Bank',
  'Jio Payments Bank',
  'JPMorgan Chase Bank India',
  'Kalupur Commercial Co-operative Bank',
  'Karnataka Bank',
  'Karnataka Gramin Bank',
  'Karnataka Vikas Grameena Bank',
  'Karur Vysya Bank',
  'Kerala Gramin Bank',
  'Kotak Mahindra Bank',
  'Maharashtra Gramin Bank',
  'Nainital Bank',
  'North East Small Finance Bank',
  'NSDL Payments Bank',
  'Paytm Payments Bank',
  'Punjab & Sind Bank',
  'Punjab National Bank',
  'RBL Bank',
  'Saptagiri Grameena Bank',
  'Saraswat Co-operative Bank',
  'Sarva Haryana Gramin Bank',
  'Shamrao Vithal Co-operative Bank (SVC Bank)',
  'Shivalik Small Finance Bank',
  'South Indian Bank',
  'Standard Chartered Bank',
  'State Bank of India',
  'Suryoday Small Finance Bank',
  'Tamil Nadu Grama Bank',
  'Tamilnad Mercantile Bank',
  'Telangana Grameena Bank',
  'TJSB Sahakari Bank',
  'UCO Bank',
  'Ujjivan Small Finance Bank',
  'Union Bank of India',
  'Unity Small Finance Bank',
  'Utkarsh Small Finance Bank',
  'Yes Bank'
];

const INDIAN_BANK_SEARCH_ALIASES = {
  'State Bank of India': ['sbi'],
  'Punjab National Bank': ['pnb'],
  'Bank of Baroda': ['bob'],
  'Bank of India': ['boi'],
  'Bank of Maharashtra': ['bom'],
  'Central Bank of India': ['cbi'],
  'Indian Overseas Bank': ['iob'],
  'Punjab & Sind Bank': ['psb'],
  'Union Bank of India': ['ubi'],
  'India Post Payments Bank': ['ippb'],
  'Karur Vysya Bank': ['kvb'],
  'Tamilnad Mercantile Bank': ['tmb'],
  'City Union Bank': ['cub'],
  'South Indian Bank': ['sib'],
  'Jammu & Kashmir Bank': ['jk', 'j&k', 'jkb'],
  'Andhra Pragathi Grameena Bank': ['apgb'],
  'Andhra Pradesh Grameena Vikas Bank': ['apgvb'],
  'Chaitanya Godavari Grameena Bank': ['cggb'],
  'Telangana Grameena Bank': ['tgb'],
  'Standard Chartered Bank': ['scb', 'sc']
};

const checkoutInputSx = (readOnlyBg = false) => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: '10px',
    backgroundColor: readOnlyBg ? '#FAF4EC' : '#FFFFFF',
    '& fieldset': { borderColor: '#DECFBB' },
    '&:hover fieldset': { borderColor: '#A2693E' },
    '&.Mui-focused fieldset': { borderColor: '#65442E', borderWidth: 2 }
  },
  '& .MuiInputLabel-root.Mui-focused': { color: '#65442E' },
  '& .MuiFormHelperText-root': { mx: 0.5, mt: 0.6 }
});

const gatewayClient = axios.create({
  timeout: 25000,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true'
  }
});

// Detect Card Brand for display
const getCardBrand = (number = '') => {
  const clean = number.replace(/\s+/g, '');
  if (/^4/.test(clean)) return { name: 'VISA', color: '#1A1F71', bg: '#EEF2FF', border: '#C7D2FE' };
  if (/^(5[1-5]|2[2-7])/.test(clean)) return { name: 'Mastercard', color: '#C2410C', bg: '#FFF7ED', border: '#FFEDD5' };
  if (/^6(0|5)/.test(clean)) return { name: 'RuPay', color: '#047857', bg: '#ECFDF5', border: '#A7F3D0' };
  if (/^3[47]/.test(clean)) return { name: 'Amex', color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD' };
  return { name: 'Card', color: '#65442E', bg: '#FAF4EC', border: '#E8DCCE' };
};

// Formatting helpers
const formatCardNumber = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
};

const formatExpiry = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
  }
  return digits;
};

const formatCvv = (value) => {
  return value.replace(/\D/g, '').slice(0, 4);
};

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
  const allowPartialParam = searchParams.get('allowPartial');
  const payNowOnlyParam = searchParams.get('payNowOnly') === '1';
  const isForcedFullOnly = !payNowOnlyParam && allowPartialParam === '0';

  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [bankAmount, setBankAmount] = useState('');
  const [simulatingUpi, setSimulatingUpi] = useState(false);
  const [tab, setTab] = useState(0); // 0 = UPI QR, 1 = Card Payment, 2 = Bank Transfer
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const [copiedField, setCopiedField] = useState('');
  const [showUtrFallback, setShowUtrFallback] = useState(false);
  const [utrNumber, setUtrNumber] = useState('');
  const detectMobileEnv = () => {
    if (typeof window === 'undefined') {
      return { isMobile: false, isIOS: false, isInAppBrowser: false };
    }
    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(ua);
    const isSmallTouch = window.innerWidth <= 768 && ('ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0));
    const isInAppBrowser = /FBAN|FBAV|Instagram|Line|WhatsApp|Gmail|Outlook|GSA|\bwv\b/i.test(ua);
    return {
      isMobile: Boolean(isMobileUA || isSmallTouch),
      isIOS,
      isInAppBrowser
    };
  };

  const [mobileEnv, setMobileEnv] = useState(detectMobileEnv);
  const { isMobile, isIOS, isInAppBrowser } = mobileEnv;
  const [showQrOnMobile, setShowQrOnMobile] = useState(() => detectMobileEnv().isIOS);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setMobileEnv(detectMobileEnv());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Card Payment States
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardErrors, setCardErrors] = useState({});

  // Internet Banking (NetBanking) Test-Box States
  const [selectedBank, setSelectedBank] = useState('HDFC Bank');
  const [netBankingType, setNetBankingType] = useState('Retail Banking');
  const [netBankingUserId, setNetBankingUserId] = useState('');
  const [netBankingPassword, setNetBankingPassword] = useState('');
  const [showNetBankingPassword, setShowNetBankingPassword] = useState(false);
  const [netBankingOtp, setNetBankingOtp] = useState('');
  const [netBankingStep, setNetBankingStep] = useState('select'); // 'select' | 'authorize'
  const [netBankingErrors, setNetBankingErrors] = useState({});
  const [showSellerBankInfo, setShowSellerBankInfo] = useState(false);

  const initialPaidRef = useRef(null);
  const initialBalanceRef = useRef(null);
  const statusPollInFlightRef = useRef(false);
  const latestOrderRef = useRef(null);
  const latestPayAmountRef = useRef('');
  latestOrderRef.current = order;
  latestPayAmountRef.current = payAmount;

  const isPartialAllowed = isForcedFullOnly ? false : (order?.allowPartialPayments ?? true) !== false;
  const isSandboxMode = order?.isSandbox !== false;
  const showTestTools = isSandboxMode && order?.allowTestSimulationTools !== false;
  const hasRealRazorpay = Boolean((order?.hasRazorpayOrder || order?.isGatewayConfigured) && order?.keyId && !String(order.keyId).includes('ibms_sandbox'));
  const getEffectivePayableAmount = () => {
    if (!order) return 0;
    if (!isPartialAllowed) return order.balanceAmount ?? order.amount ?? 0;
    const rawVal = parseFloat(payAmount);
    return !isNaN(rawVal) && rawVal > 0 ? Math.min(rawVal, order.balanceAmount) : order.balanceAmount;
  };

  const getApiUrl = () => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5271';
  };
  const API_URL = getApiUrl();

  const createGatewayOrderRequest = async (customAmount = null, skipGatewayOrderCreation = true) => {
    const payload = {
      invoiceId: parseInt(id, 10),
      tenantId: parseInt(tenantId, 10),
      amount: (!isForcedFullOnly && customAmount !== null) ? Number(customAmount) : undefined,
      currency: 'INR',
      gateway: 'Razorpay',
      skipGatewayOrderCreation
    };

    const res = await gatewayClient.post(`${API_URL}/api/v1/payments/gateway/create-order`, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    return res?.data?.data || res?.data || null;
  };

  // Fetch or update order details (skip external Razorpay /v1/orders HTTP calls during initial render & amount typing)
  const fetchOrder = async (customAmount = null, updateInputText = false, skipGatewayOrderCreation = true) => {
    if (customAmount !== null) setQrLoading(true);
    else setLoading(true);
    setError('');

    try {
      const data = await createGatewayOrderRequest(customAmount, skipGatewayOrderCreation);
      if (data) {
        setOrder(data);
        if (initialPaidRef.current === null) {
          initialPaidRef.current = data.paidAmount ?? 0;
          initialBalanceRef.current = data.balanceAmount ?? 0;
        }
        if (updateInputText || customAmount === null) {
          const balStr = data.balanceAmount?.toString() || data.amount?.toString() || '';
          setPayAmount(balStr);
          setBankAmount(balStr);
          if (data.customerName) {
            setCardHolder((prev) => prev || data.customerName);
          }
          if (Array.isArray(data.supportedNetBankingBanks) && data.supportedNetBankingBanks.length > 0) {
            setSelectedBank((prev) => data.supportedNetBankingBanks.includes(prev) ? prev : data.supportedNetBankingBanks[0]);
          }
        }
      }
      return data;
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load invoice payment details.');
      return null;
    } finally {
      setLoading(false);
      setQrLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchOrder(null, true, true);
    }
  }, [id, tenantId]);

  // Debounced dynamic QR update as the user types amount (local QR refresh only)
  useEffect(() => {
    if (!order || !order.balanceAmount || !isPartialAllowed) return;

    const timer = setTimeout(() => {
      const rawVal = parseFloat(payAmount);
      let targetAmount = order.balanceAmount;

      if (!isNaN(rawVal) && rawVal > 0) {
        // Enforce capping: if rawVal exceeds balanceAmount, clamp to balanceAmount!
        targetAmount = Math.min(rawVal, order.balanceAmount);
      }

      // Only regenerate if target amount differs from the currently locked QR amount
      if (Math.abs(targetAmount - order.amount) > 0.01) {
        fetchOrder(targetAmount, false, true);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [payAmount, order?.balanceAmount, order?.amount]);

  const pollInvoiceStatus = async () => {
    const activeOrder = latestOrderRef.current;
    if (!activeOrder || statusPollInFlightRef.current) return;
    statusPollInFlightRef.current = true;
    try {
      const res = await gatewayClient.get(`${API_URL}/api/v1/payments/gateway/invoice-status/${activeOrder.invoiceId}?tenantId=${tenantId}`);
      const inv = res?.data?.data;
      if (inv) {
        const initPaid = initialPaidRef.current ?? activeOrder.paidAmount ?? 0;
        const initBal = initialBalanceRef.current ?? activeOrder.balanceAmount ?? 0;

        if (inv.paidAmount > initPaid || inv.balanceAmount < initBal || inv.isPaid) {
          const newlyPaid = inv.paidAmount - initPaid;
          setPaymentSuccess({
            isFull: inv.isPaid || inv.balanceAmount <= 0,
            paidAmount: newlyPaid > 0 ? newlyPaid : (Number(latestPayAmountRef.current) || activeOrder.amount),
            remainingBalance: inv.balanceAmount,
            reference: 'UPI_AUTO_VERIFIED',
            invoiceNumber: inv.invoiceNumber,
            customerName: activeOrder.customerName
          });
        }
      }
    } catch {
      // Silently retry on next scheduled check
    } finally {
      statusPollInFlightRef.current = false;
    }
  };

  // Visibility-aware QR payment polling: polls only on active Scan UPI QR tab while visible (4s -> 15s backoff, max 15m)
  useEffect(() => {
    if (!order?.invoiceId || paymentSuccess || tab !== 0) return;

    let cancelled = false;
    let timerId = null;
    const startedAt = Date.now();

    const scheduleNext = () => {
      if (cancelled || document.hidden) return;
      const elapsed = Date.now() - startedAt;
      if (elapsed > 15 * 60 * 1000) return;
      const delay = elapsed > 3 * 60 * 1000 ? 15000 : 4000;
      timerId = setTimeout(async () => {
        if (cancelled || document.hidden) return;
        await pollInvoiceStatus();
        scheduleNext();
      }, delay);
    };

    const handleVisibilityChange = () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (!document.hidden && !cancelled) {
        void pollInvoiceStatus().then(() => scheduleNext());
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    scheduleNext();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [order?.invoiceId, paymentSuccess, tenantId, tab]);

  // Download freshly updated Tax Invoice PDF (uses axios header so ngrok interstitial is skipped)
  const handleDownloadUpdatedPdf = async () => {
    if (downloadingPdf) return;
    const targetInvoiceId = order?.invoiceId || id;
    const pdfUrl = `${API_URL}/api/v1/invoices/${targetInvoiceId}/pdf?tenantId=${tenantId}&regenerate=true`;
    setDownloadingPdf(true);
    try {
      const response = await gatewayClient.get(pdfUrl, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${paymentSuccess?.invoiceNumber || order?.invoiceNumber || `Invoice-${targetInvoiceId}`}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(objectUrl), 10000);
    } catch {
      window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Handle Real Razorpay Checkout Modal (Card / NetBanking / UPI)
  const handleRazorpayCardCheckout = async (preferredMethod = null) => {
    if (!order || processing) return;
    setProcessing(true);
    setError('');

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setError('Unable to load Razorpay payment SDK. Please check your internet connection or use UPI QR.');
      setProcessing(false);
      return;
    }

    const effectiveAmount = getEffectivePayableAmount();
    let checkoutOrder = order;
    if (hasRealRazorpay && (!checkoutOrder.hasRazorpayOrder || Math.abs(effectiveAmount - Number(checkoutOrder.amount || 0)) > 0.01)) {
      try {
        const freshOrder = await createGatewayOrderRequest(effectiveAmount, false);
        if (!freshOrder || !freshOrder.orderId) {
          setError('Unable to initialize Razorpay payment order.');
          setProcessing(false);
          return;
        }
        checkoutOrder = freshOrder;
        setOrder(freshOrder);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Unable to initialize Razorpay payment order.');
        setProcessing(false);
        return;
      }
    }

    const options = {
      key: checkoutOrder.keyId || 'rzp_test_ibms_sandbox',
      amount: Math.round(effectiveAmount * 100), // amount in paise
      currency: checkoutOrder.currency || 'INR',
      name: 'IBMS Invoicing',
      description: `Payment for Invoice #${checkoutOrder.invoiceNumber}`,
      image: '/branding/ibms-brand.png',
      order_id: checkoutOrder.hasRazorpayOrder ? checkoutOrder.orderId : undefined,
      prefill: {
        name: checkoutOrder.customerName || '',
        email: checkoutOrder.customerEmail || '',
        contact: checkoutOrder.customerPhone || '',
        ...(preferredMethod ? { method: preferredMethod } : {})
      },
      notes: {
        invoiceId: String(checkoutOrder.invoiceId),
        invoiceNumber: checkoutOrder.invoiceNumber,
        tenantId: String(tenantId)
      },
      theme: {
        color: '#6B2E0C'
      },
      handler: async function (response) {
        try {
          const res = await gatewayClient.post(`${API_URL}/api/v1/payments/gateway/verify`, {
            invoiceId: checkoutOrder.invoiceId,
            tenantId: parseInt(tenantId, 10),
            orderId: response.razorpay_order_id || checkoutOrder.orderId,
            paymentId: response.razorpay_payment_id || `pay_${Date.now()}`,
            signature: response.razorpay_signature || 'rzp_sig',
            amount: effectiveAmount,
            gateway: 'Razorpay',
            bankName: preferredMethod === 'netbanking' ? selectedBank : undefined,
            accountType: preferredMethod === 'netbanking' ? netBankingType : undefined
          });

          if (res?.data?.success !== false) {
            const remaining = Math.max(0, checkoutOrder.balanceAmount - effectiveAmount);
            setPaymentSuccess({
              isFull: remaining === 0,
              paidAmount: effectiveAmount,
              remainingBalance: remaining,
              reference: response.razorpay_payment_id,
              invoiceNumber: checkoutOrder.invoiceNumber,
              customerName: checkoutOrder.customerName
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
      setError('Could not open Razorpay checkout: ' + err.message + '. Please use the direct card form below.');
      setProcessing(false);
    }
  };

  // 1-Click Autofill Test Card for seamless customer & testing experience
  const handleAutofillTestCard = () => {
    setCardNumber('4532 8901 2345 6789');
    setCardExpiry('12/28');
    setCardCvv('888');
    setCardHolder(order?.customerName || 'Sandeep Singampalli');
    setCardErrors({});
  };

  // Card details validation
  const validateCard = () => {
    const errs = {};
    const digits = cardNumber.replace(/\D/g, '');
    if (digits.length < 15 || digits.length > 16) {
      errs.cardNumber = 'Please enter a valid 16-digit card number';
    }
    if (!cardHolder.trim()) {
      errs.cardHolder = 'Cardholder name is required';
    }
    const cleanExp = cardExpiry.trim();
    if (!/^\d{2}\/\d{2}$/.test(cleanExp)) {
      errs.cardExpiry = 'Enter MM/YY';
    } else {
      const [mm, yy] = cleanExp.split('/').map(Number);
      if (mm < 1 || mm > 12) {
        errs.cardExpiry = 'Invalid month (01-12)';
      }
    }
    const cleanCvv = cardCvv.trim();
    if (cleanCvv.length < 3 || cleanCvv.length > 4) {
      errs.cardCvv = 'Enter 3-4 digit CVV';
    }
    return errs;
  };

  // Direct Card Payment Submission
  const handleCardPaymentSubmit = async () => {
    if (!order || processing) return;

    const validationErrors = validateCard();
    if (Object.keys(validationErrors).length > 0) {
      setCardErrors(validationErrors);
      return;
    }
    setCardErrors({});
    setProcessing(true);
    setError('');

    const effectiveAmount = getEffectivePayableAmount();

    const digits = cardNumber.replace(/\D/g, '');
    const last4 = digits.slice(-4);
    const brandInfo = getCardBrand(cardNumber);

    try {
      const res = await gatewayClient.post(`${API_URL}/api/v1/payments/gateway/verify`, {
        invoiceId: order.invoiceId,
        tenantId: parseInt(tenantId, 10),
        orderId: order.orderId,
        paymentId: `CARD_${Date.now()}_${last4}`,
        signature: 'CARD_AUTH_SUCCESS',
        amount: effectiveAmount,
        gateway: 'Card'
      });

      if (res?.data?.success !== false) {
        const backendData = res?.data?.data;
        const paid = backendData?.amount ?? effectiveAmount;
        const remaining = backendData?.balanceAmount ?? Math.max(0, order.balanceAmount - paid);
        setPaymentSuccess({
          isFull: remaining <= 0,
          paidAmount: paid,
          remainingBalance: remaining,
          reference: `${brandInfo.name} •••• ${last4}`,
          invoiceNumber: order.invoiceNumber,
          customerName: cardHolder || order.customerName
        });
      } else {
        setError(res?.data?.message || 'Card payment processing failed.');
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to process card payment.');
    } finally {
      setProcessing(false);
    }
  };

  // Internet Banking Test-Box Helpers (Sandbox / Demo Mode)
  const supportedBanks = (Array.isArray(order?.supportedNetBankingBanks) && order.supportedNetBankingBanks.length > 0)
    ? order.supportedNetBankingBanks
    : INDIAN_NETBANKING_BANKS;

  const filterBankOptions = (options, { inputValue }) => {
    const query = (inputValue || '').trim().toLowerCase();
    if (!query || (selectedBank && query === selectedBank.toLowerCase())) {
      return options;
    }
    return options.filter((bank) => {
      if (bank.toLowerCase().includes(query)) return true;
      const aliases = INDIAN_BANK_SEARCH_ALIASES[bank] || [];
      return aliases.some((alias) => alias.includes(query));
    });
  };

  const handleAutofillNetBanking = () => {
    setSelectedBank((prev) =>
      supportedBanks.includes(prev)
        ? prev
        : (supportedBanks.includes('HDFC Bank') ? 'HDFC Bank' : (supportedBanks[0] || 'HDFC Bank'))
    );
    setNetBankingType('Retail Banking');
    setNetBankingUserId('IBMS884210');
    setNetBankingPassword('Demo@1234');
    setNetBankingOtp('123456');
    setNetBankingErrors({});
  };

  const handleNetBankingProceed = () => {
    const errs = {};
    if (!selectedBank?.trim()) errs.selectedBank = 'Please select your bank.';
    if (!netBankingType?.trim()) errs.netBankingType = 'Select Retail or Corporate banking.';
    if (!netBankingUserId.trim() || netBankingUserId.trim().length < 4) {
      errs.netBankingUserId = 'Enter Customer / NetBanking User ID (min 4 characters).';
    }
    if (!netBankingPassword.trim() || netBankingPassword.trim().length < 4) {
      errs.netBankingPassword = 'Enter NetBanking Password / TPIN (min 4 characters).';
    }
    if (!currentPayable || currentPayable <= 0 || currentPayable > (order?.balanceAmount ?? 0)) {
      errs.amount = 'Enter a valid payable amount within invoice balance.';
    }
    if (Object.keys(errs).length > 0) {
      setNetBankingErrors(errs);
      return;
    }
    setNetBankingErrors({});
    setError('');
    setNetBankingStep('authorize');
  };

  const handleNetBankingAuthorize = async () => {
    if (!order || processing) return;
    if (!/^\d{4,6}$/.test(netBankingOtp.trim())) {
      setNetBankingErrors({ netBankingOtp: 'Enter 4-6 digit Bank OTP (Test Box OTP: 123456).' });
      return;
    }
    setNetBankingErrors({});
    setProcessing(true);
    setError('');

    const effectiveAmount = getEffectivePayableAmount();

    const bankCode = selectedBank.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'NETB';
    const netBankingRef = `NB_${bankCode}_${Date.now()}`;

    try {
      const res = await gatewayClient.post(`${API_URL}/api/v1/payments/gateway/verify`, {
        invoiceId: order.invoiceId,
        tenantId: parseInt(tenantId, 10),
        orderId: order.orderId,
        paymentId: netBankingRef,
        signature: 'NETBANKING_AUTH_SUCCESS',
        amount: effectiveAmount,
        gateway: 'InternetBanking',
        bankName: selectedBank,
        accountType: netBankingType
      });

      if (res?.data?.success !== false) {
        const backendData = res?.data?.data;
        const paid = backendData?.amount ?? effectiveAmount;
        const remaining = backendData?.balanceAmount ?? Math.max(0, order.balanceAmount - paid);
        setPaymentSuccess({
          isFull: remaining <= 0,
          paidAmount: paid,
          remainingBalance: remaining,
          reference: `${selectedBank} (${netBankingType}) • ${netBankingRef}`,
          invoiceNumber: order.invoiceNumber,
          customerName: order.customerName
        });
      } else {
        setError(res?.data?.message || 'Internet Banking authorization failed.');
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to complete Internet Banking payment.');
    } finally {
      setProcessing(false);
    }
  };

  // Trigger Installed UPI Apps (GPay, PhonePe, Paytm, CRED) via NPCI UPI Intent
  const handlePayViaUpiApp = () => {
    if (!order) return;
    const payeeName = encodeURIComponent(order.accountHolderName || order.customerName || 'IBMS Invoice');
    const note = encodeURIComponent(`Payment for ${order.invoiceNumber}`);
    const upiUri = `upi://pay?pa=${order.upiId}&pn=${payeeName}&am=${Number(currentPayable).toFixed(2)}&cu=INR&tn=${note}&tr=${order.invoiceNumber}`;
    window.location.href = upiUri;
  };

  // Simulate UPI Payment in Sandbox/Dev mode for instant auto-detection (Option B)
  const handleSimulateUpiPayment = async () => {
    if (!order || simulatingUpi) return;
    setSimulatingUpi(true);
    setError('');

    try {
      const effectiveAmount = getEffectivePayableAmount();

      const res = await gatewayClient.post(`${API_URL}/api/v1/payments/gateway/simulate-qr-payment/${order.invoiceId}?tenantId=${tenantId}`, {
        tenantId: parseInt(tenantId, 10),
        amount: effectiveAmount,
        utrReference: `UPI${Date.now()}`
      });

      if (res?.data?.success === false) {
        setError(res?.data?.message || 'UPI Simulation failed.');
      } else {
        await pollInvoiceStatus();
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to simulate UPI payment.');
    } finally {
      setSimulatingUpi(false);
    }
  };

  // UTR manual confirmation or 1-click confirmation
  const handleUtrSubmit = async (customUtr = null) => {
    const finalRef = (customUtr || utrNumber || `UPI_${Date.now()}`).trim();
    setProcessing(true);
    setError('');

    const effectiveAmount = getEffectivePayableAmount();

    try {
      const res = await gatewayClient.post(`${API_URL}/api/v1/payments/gateway/verify`, {
        invoiceId: order.invoiceId,
        tenantId: parseInt(tenantId, 10),
        orderId: order.orderId,
        paymentId: finalRef,
        amount: effectiveAmount,
        gateway: tab === 2 ? 'InternetBanking' : 'UPI_Direct'
      });

      if (res?.data?.success !== false) {
        const backendData = res?.data?.data;
        const paid = backendData?.amount ?? effectiveAmount;
        const remaining = backendData?.balanceAmount ?? Math.max(0, order.balanceAmount - paid);
        setPaymentSuccess({
          isFull: remaining <= 0,
          paidAmount: paid,
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
  const currentPayable = !isPartialAllowed ? (order?.balanceAmount ?? order?.amount ?? 0) : (isCapped ? order.balanceAmount : (!isNaN(rawInput) && rawInput > 0 ? rawInput : order?.amount ?? 0));

  return (
    <Box sx={{
      minHeight: '100vh',
      bgcolor: '#F9F5EF',
      background: 'linear-gradient(180deg, #F8F1E7 0%, #F5ECE0 100%)',
      py: { xs: 3, sm: 6 },
      px: { xs: 2, sm: 3 }
    }}>
      <Container maxWidth="sm">
        {/* Header Branding using official IBMS logo */}
        <Box sx={{ mb: 3.5, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Box sx={{ width: { xs: 150, sm: 175 }, mx: 'auto', mb: 0.75 }}>
            <InvoiceBillingLogo variant="full" />
          </Box>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 750, color: '#8A6850', letterSpacing: '0.14em', textTransform: 'uppercase', mb: 0.25 }}>
            Secure Payment Portal
          </Typography>
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
                  {paymentSuccess.reference && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" sx={{ color: '#7E6B5C', fontWeight: 600 }}>Reference / UTR:</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace', color: '#35271F' }}>
                        {paymentSuccess.reference}
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </CardContent>
            </Card>

            <Alert
              severity="success"
              sx={{
                mb: 3,
                textAlign: 'left',
                borderRadius: 2.5,
                bgcolor: '#F0FDF4',
                color: '#166534',
                border: '1px solid #BBF7D0'
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                📧 An official Payment Receipt email has been dispatched with your updated Tax Invoice attached (Current Balance Due: ₹{Number(paymentSuccess.remainingBalance).toFixed(2)}).
              </Typography>
            </Alert>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
              <Button
                variant="contained"
                disabled={downloadingPdf}
                onClick={handleDownloadUpdatedPdf}
                startIcon={downloadingPdf ? <CircularProgress size={18} color="inherit" /> : <PaymentOutlined />}
                sx={{
                  bgcolor: '#65442E',
                  color: '#FFF8EF',
                  fontWeight: 750,
                  borderRadius: 2.5,
                  px: 3,
                  py: 1.2,
                  textTransform: 'none',
                  '&:hover': { bgcolor: '#513420' }
                }}
              >
                {downloadingPdf ? 'Preparing Tax Invoice PDF...' : 'Download Updated Tax Invoice (PDF)'}
              </Button>

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
                  py: 1.2,
                  textTransform: 'none',
                  '&:hover': { borderColor: '#65442E', bgcolor: '#FAF4EC' }
                }}
              >
                Back to Invoice Summary
              </Button>
            </Stack>
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
              {(Number(order.paidAmount) > 0 || Number(order.lastPaidAmount) > 0) ? (
                <Box sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
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
                      ₹{Number(order.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 700 }}>Recently Paid</Typography>
                    <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: '#16A34A' }}>
                      ₹{Number(order.lastPaidAmount ?? order.paidAmount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.72rem', color: '#7E6B5C', fontWeight: 600 }}>Total Paid</Typography>
                    <Typography sx={{ fontSize: '0.95rem', fontWeight: 750, color: '#16A34A' }}>
                      ₹{Number(order.paidAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.72rem', color: '#7E6B5C', fontWeight: 600 }}>Balance Due</Typography>
                    <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: '#65442E' }}>
                      ₹{Number(order.balanceAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                </Box>
              ) : (
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
                    <Typography sx={{ fontSize: '0.72rem', color: '#7E6B5C', fontWeight: 600 }}>Total Paid</Typography>
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
              )}
            </Box>

            <Box sx={{ p: { xs: 2.5, sm: 3 } }}>
              {/* Editable Payment Amount Section */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 750, color: '#35271F', mb: 0.5 }}>
                  {isPartialAllowed ? 'Enter Amount to Pay (INR)' : 'Amount to Pay (INR)'}
                </Typography>
                <Typography variant="caption" sx={{ color: '#7E6B5C', display: 'block', mb: 1.5 }}>
                  {isPartialAllowed
                    ? `You can pay the full amount or any partial amount up to ₹${order.balanceAmount?.toLocaleString('en-IN')}.`
                    : `Full payment of ₹${order.balanceAmount?.toLocaleString('en-IN')} is required for this invoice.`}
                </Typography>

                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Amount to Pay (INR)"
                  value={isPartialAllowed ? payAmount : (order.balanceAmount || order.amount)}
                  onChange={(e) => {
                    if (isPartialAllowed) setPayAmount(e.target.value);
                  }}
                  disabled={!isPartialAllowed}
                  InputProps={{
                    readOnly: !isPartialAllowed,
                  }}
                  helperText={!isPartialAllowed ? "Full payment required. Partial payment is disabled for this invoice." : undefined}
                  inputProps={{ min: 1, max: order.balanceAmount, step: 0.01 }}
                  sx={checkoutInputSx(!isPartialAllowed)}
                />

                {isCapped && isPartialAllowed && (
                  <Alert severity="info" sx={{ mt: 1, py: 0.5, borderRadius: 2, bgcolor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>
                    Amount exceeds outstanding balance. QR is locked to full payment of <strong>₹{order.balanceAmount?.toFixed(2)}</strong>.
                  </Alert>
                )}

                {isPartialAllowed && (
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
                )}
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
                  <Tab icon={<CreditCardOutlined />} label="Credit / Debit Card" iconPosition="start" />
                  {order.netBankingEnabled !== false && (
                    <Tab icon={<AccountBalanceOutlined />} label="Internet Banking" iconPosition="start" />
                  )}
                </Tabs>
              </Box>

              {/* TAB 0: UPI Payments & QR */}
              {tab === 0 && (
                <Box sx={{ textAlign: 'center', py: 1.5 }}>
                  {/* MOBILE VIEW ONLY: Verified Razorpay UPI on mobile when configured, or Android intent + iOS-safe QR/Copy fallback */}
                  {isMobile ? (
                    <Box sx={{
                      mb: 2,
                      p: 2.5,
                      bgcolor: '#F0FDF4',
                      borderRadius: 3.5,
                      border: '1.5px solid #86EFAC',
                      boxShadow: '0 4px 18px rgba(22, 101, 52, 0.08)'
                    }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#166534', mb: 0.5, fontSize: '1.05rem' }}>
                        ⚡ Instant Pay via UPI
                      </Typography>

                      {hasRealRazorpay ? (
                        <>
                          <Typography variant="caption" sx={{ color: '#15803D', display: 'block', mb: 2, fontSize: '0.8rem' }}>
                            Pay securely with Google Pay, PhonePe, Paytm, or CRED via verified Razorpay UPI for <strong>₹{Number(currentPayable).toFixed(2)}</strong>.
                          </Typography>
                          <Button
                            variant="contained"
                            fullWidth
                            size="large"
                            disabled={processing}
                            onClick={() => handleRazorpayCardCheckout('upi')}
                            startIcon={processing ? <CircularProgress size={18} color="inherit" /> : <FlashOn sx={{ color: '#FEF08A' }} />}
                            sx={{
                              py: 1.6,
                              borderRadius: 3,
                              bgcolor: '#16A34A',
                              color: '#FFFFFF',
                              fontWeight: 800,
                              fontSize: '1.02rem',
                              letterSpacing: '-0.01em',
                              textTransform: 'none',
                              boxShadow: '0 6px 20px rgba(22, 163, 74, 0.35)',
                              '&:hover': { bgcolor: '#15803D' }
                            }}
                          >
                            {processing ? 'Opening UPI Checkout...' : `Pay ₹${Number(currentPayable).toLocaleString('en-IN', { minimumFractionDigits: 2 })} via UPI App`}
                          </Button>
                        </>
                      ) : !isIOS ? (
                        <>
                          <Typography variant="caption" sx={{ color: '#15803D', display: 'block', mb: 2, fontSize: '0.8rem' }}>
                            Tap to launch Google Pay, PhonePe, Paytm, or CRED with <strong>₹{Number(currentPayable).toFixed(2)}</strong> pre-filled, or pay using the UPI ID / QR below.
                          </Typography>
                          <Button
                            variant="contained"
                            fullWidth
                            size="large"
                            onClick={handlePayViaUpiApp}
                            startIcon={<FlashOn sx={{ color: '#FEF08A' }} />}
                            sx={{
                              py: 1.6,
                              borderRadius: 3,
                              bgcolor: '#16A34A',
                              color: '#FFFFFF',
                              fontWeight: 800,
                              fontSize: '1.02rem',
                              letterSpacing: '-0.01em',
                              textTransform: 'none',
                              boxShadow: '0 6px 20px rgba(22, 163, 74, 0.35)',
                              '&:hover': { bgcolor: '#15803D' }
                            }}
                          >
                            Pay ₹{Number(currentPayable).toLocaleString('en-IN', { minimumFractionDigits: 2 })} via UPI App
                          </Button>
                          {isInAppBrowser && (
                            <Alert severity="info" sx={{ mt: 1.5, textAlign: 'left', fontSize: '0.76rem', borderRadius: 2 }}>
                              Using an in-app browser (Gmail/WhatsApp)? If your UPI app blocks the redirect, open this link in Chrome or copy the UPI ID below to pay.
                            </Alert>
                          )}
                        </>
                      ) : (
                        <Typography variant="caption" sx={{ color: '#15803D', display: 'block', mb: 1.5, fontSize: '0.8rem' }}>
                          On iPhone/iPad, copy the UPI ID below to pay <strong>₹{Number(currentPayable).toFixed(2)}</strong> from your UPI app, scan the QR from another device, or switch to the Card / Internet Banking tabs.
                        </Typography>
                      )}

                      <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2, flexWrap: 'wrap', gap: 0.5 }}>
                        <Chip size="small" label="Google Pay" sx={{ bgcolor: '#FFFFFF', fontWeight: 650, color: '#1E293B', border: '1px solid #CBD5E1' }} />
                        <Chip size="small" label="PhonePe" sx={{ bgcolor: '#FFFFFF', fontWeight: 650, color: '#5B21B6', border: '1px solid #DDD6FE' }} />
                        <Chip size="small" label="Paytm" sx={{ bgcolor: '#FFFFFF', fontWeight: 650, color: '#0369A1', border: '1px solid #BAE6FD' }} />
                        <Chip size="small" label="CRED" sx={{ bgcolor: '#FFFFFF', fontWeight: 650, color: '#1E1B4B', border: '1px solid #C7D2FE' }} />
                        <Chip size="small" label="BHIM" sx={{ bgcolor: '#FFFFFF', fontWeight: 650, color: '#047857', border: '1px solid #A7F3D0' }} />
                      </Stack>

                      {hasRealRazorpay && (
                        <Box sx={{ mt: 2 }}>
                          <Button
                            variant="text"
                            size="small"
                            onClick={() => setShowQrOnMobile(!showQrOnMobile)}
                            sx={{ color: '#65442E', textTransform: 'none', fontWeight: 650, fontSize: '0.8rem' }}
                          >
                            {showQrOnMobile ? '▲ Hide QR Code' : '▼ Need QR to scan from another device? Tap here'}
                          </Button>
                        </Box>
                      )}
                    </Box>
                  ) : null}

                  {/* DESKTOP WEB VIEW (OR MOBILE QR / UPI COPY FALLBACK): Show QR Code Directly */}
                  {(!isMobile || showQrOnMobile || !hasRealRazorpay) && (
                    <Box sx={{ mt: isMobile ? 1 : 0, mb: 1 }}>
                      {!isMobile && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#35271F', fontSize: '1.05rem' }}>
                            Scan QR Code with any UPI App
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#7E6B5C' }}>
                            Open Google Pay, PhonePe, Paytm, or CRED on your phone and scan the QR below to pay <strong>₹{Number(currentPayable).toFixed(2)}</strong>.
                          </Typography>
                        </Box>
                      )}

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
                        Scan with Google Pay, PhonePe, Paytm, or BHIM
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#7E6B5C', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                        <span>Amount: <strong style={{ color: '#65442E' }}>₹{Number(currentPayable).toFixed(2)}</strong></span>
                        {order.upiId && (
                          <span> • UPI ID: <strong style={{ color: '#35271F' }}>{order.upiId}</strong>
                            <Tooltip title={copiedField === 'upiId' ? 'Copied!' : 'Copy UPI ID'}>
                              <IconButton
                                size="small"
                                onClick={() => {
                                  navigator.clipboard?.writeText(order.upiId);
                                  setCopiedField('upiId');
                                  setTimeout(() => setCopiedField(''), 2000);
                                }}
                                sx={{ ml: 0.3, p: 0.2 }}
                              >
                                {copiedField === 'upiId' ? <Done sx={{ fontSize: 14, color: '#16A34A' }} /> : <ContentCopy sx={{ fontSize: 14, color: '#8A6850' }} />}
                              </IconButton>
                            </Tooltip>
                          </span>
                        )}
                      </Typography>
                    </Box>
                  )}

                  {/* Real-time Payment Auto-Detection Notice (Laptop & Phone auto-sync) */}
                  <Box sx={{
                    mt: 3,
                    p: 2,
                    bgcolor: '#F3FAF4',
                    border: '1px solid #86EFAC',
                    borderRadius: 3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1.5
                  }}>
                    <CircularProgress size={18} sx={{ color: '#16A34A' }} />
                    <Typography variant="body2" sx={{ fontWeight: 650, color: '#166534' }}>
                      Waiting for payment confirmation... (QR automatically closes once paid)
                    </Typography>
                  </Box>

                  {!isMobile && hasRealRazorpay && (
                    <Box sx={{ mt: 2 }}>
                      <Button
                        fullWidth
                        variant="contained"
                        disabled={processing}
                        onClick={() => handleRazorpayCardCheckout('upi')}
                        startIcon={processing ? <CircularProgress size={18} color="inherit" /> : <PaymentOutlined />}
                        sx={{
                          py: 1.35,
                          borderRadius: '10px',
                          fontWeight: 750,
                          textTransform: 'none',
                          bgcolor: '#65442E',
                          color: '#FFF8EF',
                          '&:hover': { bgcolor: '#513420' }
                        }}
                      >
                        {processing ? 'Opening Razorpay...' : `Pay ₹${Number(currentPayable).toFixed(2)} via Razorpay UPI / Apps`}
                      </Button>
                    </Box>
                  )}

                  {/* Sandbox / Dev mode Simulation Trigger for Instant QR Close Verification */}
                  {showTestTools && (
                    <Box sx={{ mt: 2.5, p: 2, bgcolor: '#FAF4EC', border: '1px dashed #DECFBB', borderRadius: 2.5 }}>
                      <Typography variant="caption" sx={{ color: '#7E6B5C', display: 'block', mb: 1, fontWeight: 600 }}>
                        Testing in Sandbox / Dev mode:
                      </Typography>
                      <Button
                        variant="contained"
                        size="small"
                        disabled={simulatingUpi}
                        onClick={handleSimulateUpiPayment}
                        sx={{
                          bgcolor: '#16A34A',
                          color: '#FFFFFF',
                          fontWeight: 750,
                          textTransform: 'none',
                          borderRadius: 2,
                          px: 2.5,
                          py: 0.8,
                          '&:hover': { bgcolor: '#15803D' }
                        }}
                      >
                        {simulatingUpi ? 'Triggering UPI Simulation...' : `⚡ Test Auto-Detect: Simulate UPI App Payment (₹${Number(currentPayable).toFixed(2)})`}
                      </Button>
                      <Typography variant="caption" sx={{ color: '#8A6850', display: 'block', mt: 0.8, fontSize: '0.72rem' }}>
                        Simulates phone app payment; within 1.2s both laptop and phone will close the QR and celebrate completion!
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}

              {/* TAB 1: Direct Credit / Debit Card Checkout */}
              {tab === 1 && (
                <Box sx={{ py: 1 }}>
                  {/* Virtual Card Preview */}
                  {(() => {
                    const brand = getCardBrand(cardNumber);
                    const digitsOnly = cardNumber.replace(/\D/g, '');
                    const maskedDisplay = digitsOnly.length > 0
                      ? cardNumber.padEnd(19, '•')
                      : '•••• •••• •••• ••••';
                    return (
                      <Box
                        sx={{
                          mb: 2.5,
                          p: 2.5,
                          borderRadius: 3.5,
                          background: 'linear-gradient(135deg, #382417 0%, #65442E 50%, #85593E 100%)',
                          color: '#FFFFFF',
                          boxShadow: '0 10px 24px rgba(101, 68, 46, 0.22)',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        <Box
                          sx={{
                            position: 'absolute',
                            right: -30,
                            top: -30,
                            width: 140,
                            height: 140,
                            borderRadius: '50%',
                            bgcolor: 'rgba(255, 255, 255, 0.08)'
                          }}
                        />
                        <Box
                          sx={{
                            position: 'absolute',
                            right: 30,
                            bottom: -40,
                            width: 120,
                            height: 120,
                            borderRadius: '50%',
                            bgcolor: 'rgba(255, 255, 255, 0.05)'
                          }}
                        />

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, position: 'relative' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box
                              sx={{
                                width: 38,
                                height: 28,
                                bgcolor: '#D4AF37',
                                borderRadius: 1,
                                background: 'linear-gradient(135deg, #ECC94B 0%, #D4AF37 50%, #B7791F 100%)',
                                border: '1px solid #975A16',
                                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4)'
                              }}
                            />
                            <CreditCardOutlined sx={{ fontSize: 20, color: 'rgba(255,255,255,0.6)' }} />
                          </Box>
                          <Chip
                            size="small"
                            label={brand.name}
                            sx={{
                              fontWeight: 800,
                              fontSize: '0.75rem',
                              bgcolor: 'rgba(255, 255, 255, 0.2)',
                              color: '#FFFFFF',
                              backdropFilter: 'blur(4px)',
                              letterSpacing: '0.05em'
                            }}
                          />
                        </Box>

                        <Typography
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: { xs: '1.15rem', sm: '1.35rem' },
                            fontWeight: 750,
                            letterSpacing: '0.12em',
                            mb: 2,
                            position: 'relative',
                            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
                          }}
                        >
                          {maskedDisplay}
                        </Typography>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative' }}>
                          <Box>
                            <Typography sx={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              Cardholder Name
                            </Typography>
                            <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                              {cardHolder || order.customerName || 'CARDHOLDER NAME'}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography sx={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              Expires
                            </Typography>
                            <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, fontFamily: 'monospace' }}>
                              {cardExpiry || 'MM/YY'}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    );
                  })()}

                  {!showTestTools ? (
                    <Stack spacing={2} sx={{ mb: 2 }}>
                      <Paper variant="outlined" sx={{ p: 2.25, borderRadius: '12px', bgcolor: '#FAF4EC', border: '1px solid #E5D7C6' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 750, color: '#35271F', mb: 0.6 }}>
                          Secure Credit / Debit Card Checkout
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', display: 'block', lineHeight: 1.5 }}>
                          Pay using Visa, Mastercard, RuPay, or American Express through encrypted Razorpay Checkout with 3D Secure OTP verification. Zero card details touch our servers.
                        </Typography>
                        {!hasRealRazorpay && (
                          <Alert severity="info" sx={{ mt: 1.5 }}>
                            Checkout Test Mode is turned off. Add Razorpay API keys in <strong>Payments → Gateway Mode</strong> to accept real Card payments.
                          </Alert>
                        )}
                      </Paper>
                    </Stack>
                  ) : (
                    <>
                      {/* Autofill Helper Banner */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="caption" sx={{ color: '#7E6B5C', fontWeight: 650 }}>
                          Enter your card details to complete payment:
                        </Typography>
                        {showTestTools && (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<FlashOn sx={{ fontSize: 15 }} />}
                            onClick={handleAutofillTestCard}
                            sx={{
                              fontSize: '0.74rem',
                              fontWeight: 750,
                              textTransform: 'none',
                              color: '#166534',
                              borderColor: '#86EFAC',
                              bgcolor: '#F0FDF4',
                              py: 0.3,
                              px: 1.2,
                              borderRadius: 2,
                              '&:hover': { bgcolor: '#DCFCE7', borderColor: '#4ADE80' }
                            }}
                          >
                            Autofill Test Card
                          </Button>
                        )}
                      </Box>

                      {/* Card Form */}
                      <Stack spacing={2} sx={{ mb: 2 }}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Card Number"
                          placeholder="4532 8901 2345 6789"
                          value={cardNumber}
                          onChange={(e) => {
                            setCardNumber(formatCardNumber(e.target.value));
                            if (cardErrors.cardNumber) {
                              setCardErrors((prev) => ({ ...prev, cardNumber: undefined }));
                            }
                          }}
                          error={!!cardErrors.cardNumber}
                          helperText={cardErrors.cardNumber}
                          inputProps={{ maxLength: 19 }}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                <CreditCardOutlined sx={{ color: '#8A6850', fontSize: 20 }} />
                              </InputAdornment>
                            ),
                            endAdornment: cardNumber.replace(/\D/g, '').length >= 4 && (
                              <InputAdornment position="end">
                                <Chip
                                  size="small"
                                  label={getCardBrand(cardNumber).name}
                                  sx={{
                                    height: 22,
                                    fontSize: '0.7rem',
                                    fontWeight: 750,
                                    bgcolor: getCardBrand(cardNumber).bg,
                                    color: getCardBrand(cardNumber).color,
                                    border: `1px solid ${getCardBrand(cardNumber).border}`
                                  }}
                                />
                              </InputAdornment>
                            )
                          }}
                          sx={checkoutInputSx()}
                        />

                        <TextField
                          fullWidth
                          size="small"
                          label="Cardholder Name"
                          placeholder="e.g. Sandeep Singampalli"
                          value={cardHolder}
                          onChange={(e) => {
                            setCardHolder(e.target.value);
                            if (cardErrors.cardHolder) {
                              setCardErrors((prev) => ({ ...prev, cardHolder: undefined }));
                            }
                          }}
                          error={!!cardErrors.cardHolder}
                          helperText={cardErrors.cardHolder}
                          sx={checkoutInputSx()}
                        />

                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                          <TextField
                            size="small"
                            label="Expiry (MM/YY)"
                            placeholder="MM/YY"
                            value={cardExpiry}
                            onChange={(e) => {
                              setCardExpiry(formatExpiry(e.target.value));
                              if (cardErrors.cardExpiry) {
                                setCardErrors((prev) => ({ ...prev, cardExpiry: undefined }));
                              }
                            }}
                            error={!!cardErrors.cardExpiry}
                            helperText={cardErrors.cardExpiry}
                            inputProps={{ maxLength: 5 }}
                            sx={checkoutInputSx()}
                          />

                          <TextField
                            size="small"
                            type="password"
                            label="CVV / CVC"
                            placeholder="•••"
                            value={cardCvv}
                            onChange={(e) => {
                              setCardCvv(formatCvv(e.target.value));
                              if (cardErrors.cardCvv) {
                                setCardErrors((prev) => ({ ...prev, cardCvv: undefined }));
                              }
                            }}
                            error={!!cardErrors.cardCvv}
                            helperText={cardErrors.cardCvv}
                            inputProps={{ maxLength: 4 }}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <LockOutlined sx={{ color: '#8A6850', fontSize: 18 }} />
                                </InputAdornment>
                              )
                            }}
                            sx={checkoutInputSx()}
                          />
                        </Box>
                      </Stack>
                    </>
                  )}

                  {/* Settlement Preview */}
                  {(() => {
                    const rem = Math.max(0, order.balanceAmount - currentPayable);
                    const isFull = rem <= 0.01;
                    return (
                      <Box sx={{ mb: 2, p: 1.5, bgcolor: isFull ? '#DCFCE7' : '#FEF3C7', borderRadius: 2, border: isFull ? '1px solid #86EFAC' : '1px solid #FCD34D' }}>
                        <Typography variant="caption" sx={{ fontWeight: 750, color: isFull ? '#166534' : '#92400E', display: 'block' }}>
                          {isFull
                            ? `✓ Full Settlement: Invoice will be marked as FULLY PAID (Remaining Due: ₹0.00)`
                            : `ℹ Partial Settlement: ₹${Number(currentPayable).toFixed(2)} will be paid (Remaining Due: ₹${rem.toFixed(2)})`}
                        </Typography>
                      </Box>
                    );
                  })()}

                  {/* Pay Button */}
                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={processing || (!showTestTools && !hasRealRazorpay)}
                    onClick={!showTestTools ? () => handleRazorpayCardCheckout('card') : handleCardPaymentSubmit}
                    startIcon={processing ? <CircularProgress size={20} color="inherit" /> : <LockOutlined />}
                    sx={{
                      py: 1.5,
                      borderRadius: '10px',
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
                    {processing
                      ? 'Authorizing Card Payment...'
                      : !showTestTools
                        ? `Pay ₹${Number(currentPayable).toFixed(2)} Securely via Razorpay`
                        : `Pay ₹${Number(currentPayable).toFixed(2)} via Card`}
                  </Button>

                  {showTestTools && hasRealRazorpay && (
                    <Button
                      variant="outlined"
                      size="medium"
                      fullWidth
                      disabled={processing}
                      onClick={() => handleRazorpayCardCheckout('card')}
                      sx={{ mt: 1.2, borderRadius: '10px', fontWeight: 700, textTransform: 'none', borderColor: '#DECFBB', color: '#65442E' }}
                    >
                      Open Razorpay Test Checkout Modal
                    </Button>
                  )}

                  <Box sx={{ mt: 1.5, textAlign: 'center' }}>
                    <Typography variant="caption" sx={{ color: '#8A6850', fontSize: '0.72rem' }}>
                      🔒 256-Bit SSL Encrypted • Zero card credentials stored
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* TAB 2: Internet Banking (Sandbox / Test-Box NetBanking Procedure) */}
              {tab === 2 && (
                <Box sx={{ py: 1 }}>
                  {/* Header with Provider + 1-Click Autofill Test Credentials */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#35271F' }}>
                        {showTestTools ? 'Internet Banking (NetBanking Test Box)' : 'Internet Banking'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#7E6B5C', display: 'block' }}>
                        {order.netBankingInstructions || (showTestTools ? 'Select your bank, log in with sandbox NetBanking credentials, and authorize OTP.' : 'Select your bank and account type to authorize securely via Razorpay NetBanking.')}
                      </Typography>
                    </Box>
                    {showTestTools && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={handleAutofillNetBanking}
                        startIcon={<FlashOn />}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 700,
                          borderRadius: 2,
                          borderColor: '#65442E',
                          color: '#65442E',
                          bgcolor: '#FAF4EC',
                          '&:hover': { bgcolor: '#EFE4D6', borderColor: '#513420' }
                        }}
                      >
                        Autofill Test Login
                      </Button>
                    )}
                  </Box>

                  {/* Guided 3-Step Internet Banking Procedure Bar */}
                  <Box sx={{ display: 'flex', gap: 1, mb: 2.5, p: 1.2, bgcolor: '#FAF4EC', borderRadius: 2.5, border: '1px solid #E8DCCE' }}>
                    {[
                      { id: 'select', label: showTestTools ? '1. Bank & Login' : '1. Select Bank', active: netBankingStep === 'select' },
                      { id: 'authorize', label: showTestTools ? '2. OTP Authorization' : '2. Bank Authorization', active: netBankingStep === 'authorize' },
                      { id: 'done', label: '3. Instant Receipt', active: false }
                    ].map((step) => (
                      <Box
                        key={step.id}
                        sx={{
                          flex: 1,
                          textAlign: 'center',
                          py: 0.6,
                          px: 0.5,
                          borderRadius: 1.8,
                          bgcolor: step.active ? '#65442E' : 'transparent',
                          color: step.active ? '#FFF8EF' : '#7E6B5C',
                          fontWeight: step.active ? 750 : 600,
                          fontSize: '0.72rem'
                        }}
                      >
                        {step.label}
                      </Box>
                    ))}
                  </Box>

                  {netBankingStep === 'select' ? (
                    <Stack spacing={2.2}>
                      {/* Step 1A: All-India Bank Dropdown (Searchable) */}
                      <Box>
                        <Typography
                          component="label"
                          htmlFor="nb-bank-select"
                          variant="caption"
                          sx={{ fontWeight: 750, color: '#35271F', display: 'block', mb: 0.75 }}
                        >
                          Select Your Bank <Box component="span" sx={{ color: '#DC2626' }}>*</Box>
                        </Typography>
                        <Autocomplete
                          id="nb-bank-select"
                          options={supportedBanks}
                          value={selectedBank || null}
                          disableClearable
                          openOnFocus
                          autoHighlight
                          filterOptions={filterBankOptions}
                          onChange={(_, newValue) => {
                            if (newValue) {
                              setSelectedBank(newValue);
                              setNetBankingErrors((p) => ({ ...p, selectedBank: '' }));
                            }
                          }}
                          ListboxProps={{
                            style: { maxHeight: 260, padding: '6px' }
                          }}
                          renderOption={(props, option) => {
                            const { key, ...optionProps } = props;
                            const active = option === selectedBank;
                            return (
                              <Box
                                component="li"
                                key={key}
                                {...optionProps}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1.2,
                                  px: 1.5,
                                  py: 1,
                                  borderRadius: '8px',
                                  fontSize: '0.88rem',
                                  fontWeight: active ? 750 : 500,
                                  color: active ? '#65442E' : '#1F2937',
                                  bgcolor: active ? '#FAF4EC !important' : 'transparent',
                                  '&:hover': { bgcolor: '#FAF4EC' }
                                }}
                              >
                                <AccountBalanceOutlined sx={{ fontSize: 17, color: active ? '#65442E' : '#8A6850', flexShrink: 0 }} />
                                <Box component="span" sx={{ flex: 1 }}>{option}</Box>
                                {active && <Done sx={{ fontSize: 16, color: '#65442E' }} />}
                              </Box>
                            );
                          }}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              size="small"
                              placeholder="Search or choose any bank in India..."
                              error={Boolean(netBankingErrors.selectedBank)}
                              helperText={
                                netBankingErrors.selectedBank ||
                                `${supportedBanks.length} Indian banks available • ${order.netBankingProvider || 'Razorpay NetBanking'}${showTestTools ? ' (Test Mode)' : ''}`
                              }
                              InputProps={{
                                ...params.InputProps,
                                startAdornment: (
                                  <InputAdornment position="start" sx={{ pl: 0.5, mr: 0 }}>
                                    <AccountBalanceOutlined sx={{ color: '#8A6850', fontSize: 18 }} />
                                  </InputAdornment>
                                )
                              }}
                              sx={checkoutInputSx()}
                            />
                          )}
                        />
                      </Box>

                      {/* Step 1B: Banking Type (Retail vs Corporate) */}
                      <Box>
                        <Typography variant="caption" sx={{ fontWeight: 750, color: '#35271F', display: 'block', mb: 0.8 }}>
                          Account Type <Box component="span" sx={{ color: '#DC2626' }}>*</Box>
                        </Typography>
                        <Stack direction="row" spacing={1.2}>
                          {['Retail Banking', 'Corporate Banking'].map((bType) => {
                            const activeType = netBankingType === bType;
                            return (
                              <Button
                                key={bType}
                                fullWidth
                                variant={activeType ? 'contained' : 'outlined'}
                                onClick={() => setNetBankingType(bType)}
                                sx={{
                                  textTransform: 'none',
                                  py: 0.95,
                                  borderRadius: '10px',
                                  fontWeight: 700,
                                  fontSize: '0.84rem',
                                  bgcolor: activeType ? '#65442E' : '#FFFFFF',
                                  color: activeType ? '#FFF8EF' : '#65442E',
                                  borderColor: activeType ? '#65442E' : '#DECFBB',
                                  '&:hover': { bgcolor: activeType ? '#513420' : '#FAF4EC', borderColor: '#65442E' }
                                }}
                              >
                                {bType}
                              </Button>
                            );
                          })}
                        </Stack>
                      </Box>

                      {/* Step 1C: Live Redirect Notice vs Sandbox Login Test Box */}
                      {!showTestTools ? (
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 2.25,
                            borderRadius: '12px',
                            bgcolor: '#FAF4EC',
                            border: '1px solid #E5D7C6'
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 750, color: '#35271F', mb: 0.6 }}>
                            Secure {selectedBank} Authorization ({netBankingType})
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#64748b', display: 'block', lineHeight: 1.5 }}>
                            Clicking below opens encrypted Razorpay NetBanking checkout to authorize payment directly with {selectedBank}.
                          </Typography>
                          {!hasRealRazorpay && (
                            <Alert severity="info" sx={{ mt: 1.5 }}>
                              Checkout Test Mode is turned off. Add Razorpay API keys in <strong>Payments → Gateway Mode</strong> to proceed with Razorpay NetBanking.
                            </Alert>
                          )}
                        </Paper>
                      ) : (
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 2.25,
                            borderRadius: '12px',
                            bgcolor: '#FAF4EC',
                            border: '1px solid #E5D7C6'
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.8 }}>
                            <Typography variant="caption" sx={{ fontWeight: 750, color: '#65442E', fontSize: '0.82rem' }}>
                              {selectedBank} — Sandbox Login Test Box
                            </Typography>
                            <Chip
                              size="small"
                              label="Test Mode"
                              sx={{
                                height: 22,
                                fontSize: '0.68rem',
                                fontWeight: 750,
                                bgcolor: '#EFE2D1',
                                color: '#65442E'
                              }}
                            />
                          </Box>

                          <Stack spacing={2}>
                            <Box>
                              <Typography
                                component="label"
                                htmlFor="nb-user-id"
                                variant="caption"
                                sx={{ fontWeight: 700, color: '#35271F', display: 'block', mb: 0.6 }}
                              >
                                Customer ID / NetBanking User ID <Box component="span" sx={{ color: '#DC2626' }}>*</Box>
                              </Typography>
                              <TextField
                                id="nb-user-id"
                                fullWidth
                                size="small"
                                placeholder="e.g. IBMS884210"
                                value={netBankingUserId}
                                onChange={(e) => {
                                  setNetBankingUserId(e.target.value);
                                  setNetBankingErrors((p) => ({ ...p, netBankingUserId: '' }));
                                }}
                                error={Boolean(netBankingErrors.netBankingUserId)}
                                helperText={netBankingErrors.netBankingUserId}
                                InputProps={{
                                  startAdornment: (
                                    <InputAdornment position="start">
                                      <PersonOutline sx={{ color: '#8A6850', fontSize: 18 }} />
                                    </InputAdornment>
                                  )
                                }}
                                sx={checkoutInputSx()}
                              />
                            </Box>

                            <Box>
                              <Typography
                                component="label"
                                htmlFor="nb-password"
                                variant="caption"
                                sx={{ fontWeight: 700, color: '#35271F', display: 'block', mb: 0.6 }}
                              >
                                NetBanking Password / TPIN (Test Box) <Box component="span" sx={{ color: '#DC2626' }}>*</Box>
                              </Typography>
                              <TextField
                                id="nb-password"
                                fullWidth
                                size="small"
                                type={showNetBankingPassword ? 'text' : 'password'}
                                placeholder="Enter any 4+ chars (not stored)"
                                value={netBankingPassword}
                                onChange={(e) => {
                                  setNetBankingPassword(e.target.value);
                                  setNetBankingErrors((p) => ({ ...p, netBankingPassword: '' }));
                                }}
                                error={Boolean(netBankingErrors.netBankingPassword)}
                                helperText={
                                  netBankingErrors.netBankingPassword ||
                                  'Sandbox verification only — credentials stay in browser.'
                                }
                                InputProps={{
                                  startAdornment: (
                                    <InputAdornment position="start">
                                      <LockOutlined sx={{ color: '#8A6850', fontSize: 18 }} />
                                    </InputAdornment>
                                  ),
                                  endAdornment: (
                                    <InputAdornment position="end">
                                      <IconButton
                                        size="small"
                                        edge="end"
                                        onClick={() => setShowNetBankingPassword((prev) => !prev)}
                                        aria-label={showNetBankingPassword ? 'Hide NetBanking password' : 'Show NetBanking password'}
                                      >
                                        {showNetBankingPassword
                                          ? <VisibilityOff sx={{ fontSize: 18, color: '#7E6B5C' }} />
                                          : <Visibility sx={{ fontSize: 18, color: '#7E6B5C' }} />}
                                      </IconButton>
                                    </InputAdornment>
                                  )
                                }}
                                sx={checkoutInputSx()}
                              />
                            </Box>
                          </Stack>
                        </Paper>
                      )}

                      {/* Settlement Preview */}
                      {(() => {
                        const rem = Math.max(0, order.balanceAmount - currentPayable);
                        const isFull = rem <= 0.01;
                        return (
                          <Box sx={{ p: 1.5, bgcolor: isFull ? '#DCFCE7' : '#FEF3C7', borderRadius: '10px', border: isFull ? '1px solid #86EFAC' : '1px solid #FCD34D' }}>
                            <Typography variant="caption" sx={{ fontWeight: 750, color: isFull ? '#166534' : '#92400E', display: 'block' }}>
                              {isFull
                                ? `✓ Full Settlement via ${selectedBank}: Invoice will be marked as FULLY PAID (Remaining Due: ₹0.00)`
                                : `ℹ Partial Settlement via ${selectedBank}: ₹${Number(currentPayable).toFixed(2)} will be paid (Remaining Due: ₹${rem.toFixed(2)})`}
                            </Typography>
                          </Box>
                        );
                      })()}

                      <Button
                        variant="contained"
                        size="large"
                        fullWidth
                        disabled={processing || (!showTestTools && !hasRealRazorpay)}
                        onClick={!showTestTools ? () => handleRazorpayCardCheckout('netbanking') : handleNetBankingProceed}
                        sx={{
                          py: 1.5,
                          borderRadius: '10px',
                          fontWeight: 750,
                          textTransform: 'none',
                          bgcolor: '#65442E',
                          color: '#FFF8EF',
                          boxShadow: '0 4px 16px rgba(101, 68, 46, 0.25)',
                          '&:hover': { bgcolor: '#513420' }
                        }}
                      >
                        Proceed to {selectedBank} NetBanking →
                      </Button>

                      {showTestTools && hasRealRazorpay && (
                        <Button
                          variant="outlined"
                          size="medium"
                          fullWidth
                          disabled={processing}
                          onClick={() => handleRazorpayCardCheckout('netbanking')}
                          sx={{ borderRadius: '10px', fontWeight: 700, textTransform: 'none', borderColor: '#DECFBB', color: '#65442E' }}
                        >
                          Open Razorpay Test NetBanking Modal
                        </Button>
                      )}
                    </Stack>
                  ) : (
                    /* Step 2: Simulated Bank OTP Authorization Test Box */
                    <Stack spacing={2}>
                      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: '12px', bgcolor: '#F3FAF4', border: '1px solid #86EFAC' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                          <Chip size="small" label={`${selectedBank} • ${netBankingType}`} sx={{ bgcolor: '#166534', color: '#FFFFFF', fontWeight: 750 }} />
                          <Typography variant="caption" sx={{ color: '#166534', fontWeight: 700 }}>
                            Sandbox Session Active
                          </Typography>
                        </Box>

                        <Stack spacing={1} sx={{ mb: 2, p: 1.5, bgcolor: '#FFFFFF', borderRadius: '10px', border: '1px solid #DCFCE7' }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Merchant / Payee:</Typography>
                            <Typography variant="caption" sx={{ fontWeight: 750, color: '#0f172a' }}>IBMS Invoicing</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>NetBanking User ID:</Typography>
                            <Typography variant="caption" sx={{ fontWeight: 750, fontFamily: 'monospace', color: '#0f172a' }}>{netBankingUserId}</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Payable Amount:</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: '#166534' }}>₹{Number(currentPayable).toFixed(2)}</Typography>
                          </Box>
                        </Stack>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.8 }}>
                          <Typography component="label" htmlFor="nb-otp" variant="caption" sx={{ fontWeight: 750, color: '#166534' }}>
                            Enter Sandbox Bank OTP <Box component="span" sx={{ color: '#DC2626' }}>*</Box>
                          </Typography>
                          {showTestTools && (
                            <Button
                              size="small"
                              onClick={() => {
                                setNetBankingOtp('123456');
                                setNetBankingErrors({});
                              }}
                              sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 700, color: '#15803D', p: 0 }}
                            >
                              Fill Demo OTP (123456)
                            </Button>
                          )}
                        </Box>

                        <TextField
                          id="nb-otp"
                          fullWidth
                          size="small"
                          required
                          placeholder="Enter 6-digit OTP (e.g. 123456)"
                          value={netBankingOtp}
                          onChange={(e) => {
                            setNetBankingOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                            setNetBankingErrors({});
                          }}
                          error={Boolean(netBankingErrors.netBankingOtp)}
                          helperText={netBankingErrors.netBankingOtp}
                          sx={{ mb: 2, ...checkoutInputSx() }}
                        />

                        <Stack direction="row" spacing={1.5}>
                          <Button
                            variant="outlined"
                            disabled={processing}
                            onClick={() => setNetBankingStep('select')}
                            sx={{ textTransform: 'none', borderRadius: '10px', fontWeight: 700, borderColor: '#DECFBB', color: '#65442E' }}
                          >
                            ← Change Bank
                          </Button>
                          <Button
                            fullWidth
                            variant="contained"
                            size="large"
                            disabled={processing}
                            onClick={handleNetBankingAuthorize}
                            startIcon={processing ? <CircularProgress size={18} color="inherit" /> : <LockOutlined />}
                            sx={{
                              py: 1.4,
                              fontWeight: 750,
                              textTransform: 'none',
                              borderRadius: '10px',
                              bgcolor: '#16A34A',
                              color: '#FFFFFF',
                              '&:hover': { bgcolor: '#15803D' }
                            }}
                          >
                            {processing ? 'Verifying with Bank...' : `Authorize & Pay ₹${Number(currentPayable).toFixed(2)}`}
                          </Button>
                        </Stack>
                      </Paper>
                    </Stack>
                  )}

                  {/* Optional Company Receiving Bank Info Reference */}
                  {(order.bankName || order.accountNumber) && (
                    <Box sx={{ mt: 2, textAlign: 'center' }}>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setShowSellerBankInfo((v) => !v)}
                        sx={{ textTransform: 'none', color: '#7E6B5C', fontWeight: 650, fontSize: '0.76rem' }}
                      >
                        {showSellerBankInfo ? '▲ Hide Beneficiary Bank Details' : '▼ View Beneficiary Settlement Bank Details'}
                      </Button>
                      <Collapse in={showSellerBankInfo}>
                        <Paper variant="outlined" sx={{ mt: 1, p: 2, borderRadius: 2.5, bgcolor: '#FAF4EC', border: '1px solid #E8DCCE', textAlign: 'left' }}>
                          <Stack spacing={0.8}>
                            {order.accountHolderName && <Typography variant="caption"><strong>Account Holder:</strong> {order.accountHolderName}</Typography>}
                            {order.bankName && <Typography variant="caption"><strong>Bank:</strong> {order.bankName}</Typography>}
                            {order.accountNumber && <Typography variant="caption"><strong>Account #:</strong> {order.accountNumber}</Typography>}
                            {order.ifscCode && <Typography variant="caption"><strong>IFSC:</strong> {order.ifscCode}</Typography>}
                            {order.branch && <Typography variant="caption"><strong>Branch:</strong> {order.branch}</Typography>}
                          </Stack>
                        </Paper>
                      </Collapse>
                    </Box>
                  )}
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
