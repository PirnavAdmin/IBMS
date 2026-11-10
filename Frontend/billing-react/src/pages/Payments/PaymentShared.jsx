import { useEffect, useState } from 'react';
import { BrandName } from '../../components/BrandName';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import ScienceOutlined from '@mui/icons-material/ScienceOutlined';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { DashboardErrorState } from '../../components/dashboard/DashboardStates';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from 'billing-api-client';
import { paymentService, paymentError, paymentPermissions, formatIndianDateTime } from './paymentService';
import '../../styles/Payments.css';

export function PaymentShell({ title, children, actions, subtitle }) {
  return <main className="payments-page">
    <div className="payment-print-banner" aria-hidden="true">
      <div className="payment-print-brand">
        <BrandName />
        <span>Payment Management Module</span>
      </div>
      <div className="payment-print-meta">
        <span>{title}</span>
        <small>Printed: {formatIndianDateTime(new Date())}</small>
      </div>
    </div>
    <Breadcrumbs aria-label="Breadcrumb"><Link to="/payments">Payments</Link><span>{title}</span></Breadcrumbs>
    <header className="payments-heading"><div><span className="payment-eyebrow">Billing workspace</span><h1>{title}</h1><p>{subtitle || ({ "Payment Management": "Record, track and manage customer payments.", "Record Payment": "Record a customer payment against an eligible invoice.", "Payment Details": "Review payment information, allocations and activity." }[title])}</p></div><div className="payment-actions">{actions}</div></header>{children}
  </main>;
}
export function PaymentValues({ values }) {
  return <dl className="payment-values">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value == null || value === '' ? '\u2014' : value}</dd></div>)}</dl>;
}
export function PaymentState({ loading, error, empty, onRetry }) {
  if (loading && !error) return <div className="payment-loading" role="status"><LinearProgress />Loading payment data...</div>;
  return <>{error && <DashboardErrorState title="Unable to load payment data" message={typeof error === 'string' ? error : paymentError(error)} onRetry={onRetry} />}{empty && !error && <p className="payments-state">{empty}</p>}</>;
}
export function usePaymentUser() {
  const query = useQuery({ queryKey: ['payment-user'], queryFn: ({ signal }) => apiClient.get('/api/Auth/me', { signal }), retry: false, staleTime: 60000 });
  return { ...query, permissions: paymentPermissions(query.data) };
}

export function PaymentStatus({ status }) {
  return <span className="payment-status" data-status={status}>{status}</span>;
}

export function PaymentGatewaySettingsDialog({ open, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const user = usePaymentUser();
  const settingsQuery = useQuery({
    queryKey: ['payments', 'gateway-settings'],
    queryFn: ({ signal }) => paymentService.getGatewaySettings({ signal }),
    enabled: Boolean(open),
    retry: false,
    staleTime: 0,
  });

  const [isSandbox, setIsSandbox] = useState(true);
  const [allowTestTools, setAllowTestTools] = useState(true);
  const [testKeyId, setTestKeyId] = useState('');
  const [testKeySecret, setTestKeySecret] = useState('');
  const [testWebhookSecret, setTestWebhookSecret] = useState('');
  const [liveKeyId, setLiveKeyId] = useState('');
  const [liveKeySecret, setLiveKeySecret] = useState('');
  const [liveWebhookSecret, setLiveWebhookSecret] = useState('');
  const [clearFlags, setClearFlags] = useState({ testSecret: false, testWebhook: false, liveSecret: false, liveWebhook: false });
  const [showSecrets, setShowSecrets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open || !settingsQuery.data) return;
    const d = settingsQuery.data;
    setIsSandbox(d.isSandbox !== false);
    setAllowTestTools(d.allowTestSimulationTools !== false);
    setTestKeyId(d.razorpayTestKeyId || '');
    setLiveKeyId(d.razorpayLiveKeyId || '');
    setTestKeySecret('');
    setTestWebhookSecret('');
    setLiveKeySecret('');
    setLiveWebhookSecret('');
    setClearFlags({ testSecret: false, testWebhook: false, liveSecret: false, liveWebhook: false });
    setErrorMsg('');
  }, [open, settingsQuery.data]);

  const data = settingsQuery.data;
  const canEdit = Boolean(user.permissions.create);

  const handleCopyWebhook = async () => {
    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    const url = data?.webhookEndpointUrl || `${origin}/api/v1/payments/gateway/webhook`;
    try {
      await navigator.clipboard?.writeText(url);
      setNotice('Webhook URL copied.');
    } catch {
      setNotice('Copy the Webhook URL manually from the field.');
    }
  };

  // Mask secrets via CSS instead of type="password" so browsers never autofill login credentials here.
  const maskedInputSx = showSecrets ? undefined : { '& input': { WebkitTextSecurity: 'disc' } };
  const noAutofillProps = (name) => ({
    name,
    autoComplete: 'off',
    'data-lpignore': 'true',
    'data-1p-ignore': 'true',
    'data-form-type': 'other',
  });

  const handleSave = async () => {
    if (!canEdit || saving) return;
    setErrorMsg('');
    const trimmedTestKey = testKeyId.trim();
    const trimmedLiveKey = liveKeyId.trim();

    if (trimmedTestKey && !trimmedTestKey.startsWith('rzp_test_')) {
      setErrorMsg("Razorpay Test Key ID must start with 'rzp_test_' (or leave blank for built-in local test mode).");
      return;
    }
    if (trimmedLiveKey && !trimmedLiveKey.startsWith('rzp_live_')) {
      setErrorMsg("Razorpay Live Key ID must start with 'rzp_live_'.");
      return;
    }

    setSaving(true);
    try {
      const updated = await paymentService.updateGatewaySettings({
        provider: 'Razorpay',
        isSandbox,
        allowTestSimulationTools: allowTestTools,
        razorpayTestKeyId: trimmedTestKey || null,
        razorpayTestKeySecret: testKeySecret.trim() || null,
        clearTestKeySecret: clearFlags.testSecret,
        razorpayTestWebhookSecret: testWebhookSecret.trim() || null,
        clearTestWebhookSecret: clearFlags.testWebhook,
        razorpayLiveKeyId: trimmedLiveKey || null,
        razorpayLiveKeySecret: liveKeySecret.trim() || null,
        clearLiveKeySecret: clearFlags.liveSecret,
        razorpayLiveWebhookSecret: liveWebhookSecret.trim() || null,
        clearLiveWebhookSecret: clearFlags.liveWebhook,
      });
      queryClient.setQueryData(['payments', 'gateway-settings'], updated);
      await queryClient.invalidateQueries({ queryKey: ['payments', 'gateway-settings'] });
      const msg = !updated.isSandbox
        ? 'Saved changes: Live Working Mode enabled.'
        : updated.allowTestSimulationTools
          ? 'Saved changes: Sandbox Test Mode enabled across QR, Card & Internet Banking.'
          : 'Saved changes: Checkout Test Mode disabled across QR, Card & Internet Banking.';
      setNotice(msg);
      onSaved?.(msg);
      onClose?.();
    } catch (err) {
      setErrorMsg(paymentError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog className="payment-dialog" open={Boolean(open)} onClose={saving ? undefined : onClose} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <span>Payment Gateway Mode &amp; Razorpay Keys</span>
          {data && (
            <Chip
              size="small"
              icon={isSandbox ? <ScienceOutlined /> : <VerifiedUserOutlined />}
              label={
                !isSandbox
                  ? 'Live Working Mode'
                  : allowTestTools
                    ? 'Sandbox (Test Mode On)'
                    : 'Sandbox (Test Mode Off)'
              }
              color={!isSandbox ? 'success' : allowTestTools ? 'warning' : 'default'}
            />
          )}
        </DialogTitle>
        <DialogContent dividers>
          <PaymentState loading={settingsQuery.isFetching} error={settingsQuery.error || user.error} onRetry={() => { user.refetch(); settingsQuery.refetch(); }} />

          <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
            <Stack spacing={2.5} sx={{ mt: 0.5 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Select Checkout Operating Mode
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  <Box
                    role="button"
                    tabIndex={0}
                    onClick={() => canEdit && setIsSandbox(true)}
                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && canEdit) setIsSandbox(true); }}
                    sx={{
                      p: 2,
                      borderRadius: '10px',
                      cursor: canEdit ? 'pointer' : 'default',
                      border: isSandbox ? '2px solid #9A4F2F' : '1px solid #DECFBB',
                      bgcolor: isSandbox ? '#FAF4EC' : '#FFFFFF',
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <ScienceOutlined fontSize="small" sx={{ color: '#9A4F2F' }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>Sandbox (Test Mode)</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Safe testing environment. Uses test credentials or Razorpay Test keys (<code>rzp_test_...</code>) without charging real money.
                    </Typography>
                  </Box>

                  <Box
                    role="button"
                    tabIndex={0}
                    onClick={() => canEdit && setIsSandbox(false)}
                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && canEdit) setIsSandbox(false); }}
                    sx={{
                      p: 2,
                      borderRadius: '10px',
                      cursor: canEdit ? 'pointer' : 'default',
                      border: !isSandbox ? '2px solid #15803D' : '1px solid #DECFBB',
                      bgcolor: !isSandbox ? '#F0FDF4' : '#FFFFFF',
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <VerifiedUserOutlined fontSize="small" sx={{ color: '#15803D' }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>Live (Real Working Mode)</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Production payments via Razorpay Live keys (<code>rzp_live_...</code>). Automatically hides all test/simulation controls and enforces cryptographic signature verification.
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {isSandbox && (
                <Box sx={{ p: 1.5, borderRadius: '10px', border: '1px dashed #DECFBB', bgcolor: '#FFFDF9' }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={allowTestTools}
                        disabled={!canEdit}
                        onChange={(e) => setAllowTestTools(e.target.checked)}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          Enable Checkout Test Mode (UPI QR Simulation, Test Card &amp; NetBanking Test Box)
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          When disabled, Test Mode controls and simulation actions are turned off across Payment QR, Card, and Internet Banking checkout tabs.
                        </Typography>
                      </Box>
                    }
                  />
                </Box>
              )}

              {!isSandbox && (
                <Alert severity="info">
                  Live Mode hides all sandbox simulation buttons from customers and requires verified Razorpay Live Key ID (<code>rzp_live_...</code>) and Live Key Secret.
                </Alert>
              )}

              <Divider />

              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Razorpay Test Credentials (Optional — Free Sandbox Testing)
                  </Typography>
                  <Button size="small" startIcon={showSecrets ? <VisibilityOff /> : <Visibility />} onClick={() => setShowSecrets((v) => !v)}>
                    {showSecrets ? 'Hide Secrets' : 'Show Secrets'}
                  </Button>
                </Stack>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  <TextField
                    size="small"
                    type="text"
                    label="Razorpay Test Key ID"
                    placeholder="rzp_test_xxxxxxxxxxxxxx"
                    value={testKeyId}
                    onChange={(e) => setTestKeyId(e.target.value)}
                    disabled={!canEdit}
                    inputProps={noAutofillProps('rzp-test-key-id')}
                    helperText="Leave blank for built-in local IBMS sandbox"
                  />
                  <TextField
                    size="small"
                    type="text"
                    label="Razorpay Test Key Secret"
                    placeholder={data?.hasTestKeySecret && !clearFlags.testSecret ? 'Configured (enter new value to replace)' : 'Enter Key Secret'}
                    value={testKeySecret}
                    onChange={(e) => { setTestKeySecret(e.target.value); setClearFlags((f) => ({ ...f, testSecret: false })); }}
                    disabled={!canEdit}
                    inputProps={noAutofillProps('rzp-test-key-secret')}
                    sx={maskedInputSx}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><LockOutlined fontSize="small" /></InputAdornment>,
                    }}
                    helperText={data?.hasTestKeySecret && !clearFlags.testSecret ? 'Encrypted secret stored in server database' : undefined}
                  />
                  <TextField
                    size="small"
                    type="text"
                    label="Test Webhook Secret"
                    placeholder={data?.hasTestWebhookSecret && !clearFlags.testWebhook ? 'Configured (enter new value to replace)' : 'Same secret entered in Razorpay Webhooks'}
                    value={testWebhookSecret}
                    onChange={(e) => { setTestWebhookSecret(e.target.value); setClearFlags((f) => ({ ...f, testWebhook: false })); }}
                    disabled={!canEdit}
                    inputProps={noAutofillProps('rzp-test-wh-secret')}
                    sx={{ gridColumn: { sm: 'span 2' }, ...maskedInputSx }}
                  />
                </Box>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Razorpay Live Credentials (Required for Real Working Mode)
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  <TextField
                    size="small"
                    type="text"
                    label="Razorpay Live Key ID"
                    placeholder="rzp_live_xxxxxxxxxxxxxx"
                    value={liveKeyId}
                    onChange={(e) => setLiveKeyId(e.target.value)}
                    disabled={!canEdit}
                    required={!isSandbox}
                    inputProps={noAutofillProps('rzp-live-key-id')}
                  />
                  <TextField
                    size="small"
                    type="text"
                    label="Razorpay Live Key Secret"
                    placeholder={data?.hasLiveKeySecret && !clearFlags.liveSecret ? 'Configured (enter new value to replace)' : 'Enter Live Key Secret'}
                    value={liveKeySecret}
                    onChange={(e) => { setLiveKeySecret(e.target.value); setClearFlags((f) => ({ ...f, liveSecret: false })); }}
                    disabled={!canEdit}
                    inputProps={noAutofillProps('rzp-live-key-secret')}
                    sx={maskedInputSx}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><LockOutlined fontSize="small" /></InputAdornment>,
                    }}
                    helperText={data?.hasLiveKeySecret && !clearFlags.liveSecret ? 'Encrypted Live secret saved' : undefined}
                  />
                  <TextField
                    size="small"
                    type="text"
                    label="Live Webhook Secret"
                    placeholder={data?.hasLiveWebhookSecret && !clearFlags.liveWebhook ? 'Configured (enter new value to replace)' : 'Used to verify X-Razorpay-Signature webhooks'}
                    value={liveWebhookSecret}
                    onChange={(e) => { setLiveWebhookSecret(e.target.value); setClearFlags((f) => ({ ...f, liveWebhook: false })); }}
                    disabled={!canEdit}
                    inputProps={noAutofillProps('rzp-live-wh-secret')}
                    sx={{ gridColumn: { sm: 'span 2' }, ...maskedInputSx }}
                  />
                </Box>
              </Box>

              <Box sx={{ p: 1.5, borderRadius: '10px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                  Webhook Endpoint URL (Paste in Razorpay Dashboard → Account &amp; Settings → Webhooks)
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    fullWidth
                    value={data?.webhookEndpointUrl || `${typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''}/api/v1/payments/gateway/webhook`}
                    InputProps={{ readOnly: true }}
                  />
                  <IconButton aria-label="Copy webhook URL" onClick={handleCopyWebhook} size="small">
                    <ContentCopyOutlined fontSize="small" />
                  </IconButton>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Subscribe to events: <code>payment.captured</code> and <code>order.paid</code>.
                </Typography>
              </Box>
            </Stack>
          </form>
        </DialogContent>
        {errorMsg && (
          <Box sx={{ px: 3, py: 1.5, borderTop: '1px solid #FECACA', bgcolor: '#FEF2F2' }}>
            <Alert severity="error" onClose={() => setErrorMsg('')}>{errorMsg}</Alert>
          </Box>
        )}
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>Close</Button>
          <Button variant="contained" onClick={handleSave} disabled={!canEdit || saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
      <FeedbackSnackbar message={notice} onClose={() => setNotice('')} />
    </>
  );
}
