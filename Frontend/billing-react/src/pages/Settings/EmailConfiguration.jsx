import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';

// Icons
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import EditOutlined from '@mui/icons-material/EditOutlined';
import EmailOutlined from '@mui/icons-material/EmailOutlined';
import ErrorOutline from '@mui/icons-material/ErrorOutline';
import SendOutlined from '@mui/icons-material/SendOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';

import { apiClient, getUserFriendlyError } from 'billing-api-client';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { getDisplayName } from '../../utils/userDisplay';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import './emailConfiguration.css';

const PROVIDER_PRESETS = {
  Gmail: {
    host: 'smtp.gmail.com',
    port: 587,
    encryption: 'StartTls',
    note: 'Requires 2-Step Verification and an App Password (not your personal Google account password).'
  },
  Office365: {
    host: 'smtp.office365.com',
    port: 587,
    encryption: 'StartTls',
    note: 'Requires SMTP AUTH enabled in the Microsoft 365 Admin Center for this mailbox.'
  },
  Hostinger: {
    host: 'smtp.hostinger.com',
    port: 465,
    encryption: 'SslTls',
    note: 'Standard secure SMTP connection for Hostinger email mailboxes.'
  },
  Custom: {
    host: '',
    port: 587,
    encryption: 'StartTls',
    note: 'Configure custom business mail server or third-party SMTP relay credentials.'
  }
};

export function EmailConfiguration() {
  const user = useCurrentUser();
  const fallbackUserName = getDisplayName(user) || user?.name || user?.Name || 'Admin';
  const fallbackUserEmail = user?.email || user?.Email || '';

  // Main State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState(null);
  const [statusInfo, setStatusInfo] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [pageError, setPageError] = useState('');

  // Modals State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    provider: 'Custom',
    smtpHost: '',
    smtpPort: 587,
    username: '',
    password: '',
    fromName: '',
    fromEmail: '',
    encryptionMode: 'StartTls',
    isEnabled: true
  });
  const [formErrors, setFormErrors] = useState({});

  // Load Settings from API
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setPageError('');

      const [configRes, statusRes] = await Promise.all([
        apiClient.get('/api/v1/settings/email'),
        apiClient.get('/api/v1/settings/email/status')
      ]);

      if (configRes?.data?.success && configRes.data.data) {
        const data = configRes.data.data;
        setConfig(data);
        setFormData({
          provider: data.provider || 'Custom',
          smtpHost: data.smtpHost || '',
          smtpPort: data.smtpPort || 587,
          username: data.username || '',
          password: '', // Never populate password field
          fromName: data.fromName || fallbackUserName,
          fromEmail: data.fromEmail || fallbackUserEmail,
          encryptionMode: data.encryptionMode || 'StartTls',
          isEnabled: data.isEnabled ?? true
        });
      }

      if (statusRes?.data?.success && statusRes.data.data) {
        setStatusInfo(statusRes.data.data);
      }
    } catch (err) {
      setPageError(getUserFriendlyError(err, 'Failed to retrieve SMTP configuration.'));
    } finally {
      setLoading(false);
    }
  }, [fallbackUserName, fallbackUserEmail]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Provider Preset Change Handler
  const handleProviderChange = (e) => {
    const selected = e.target.value;
    const preset = PROVIDER_PRESETS[selected] || PROVIDER_PRESETS.Custom;

    setFormData((prev) => ({
      ...prev,
      provider: selected,
      smtpHost: preset.host || prev.smtpHost,
      smtpPort: preset.port,
      encryptionMode: preset.encryption
    }));
  };

  // Form Field Validation
  const validateForm = () => {
    const errors = {};
    if (!formData.smtpHost.trim()) errors.smtpHost = 'SMTP Host is required.';
    if (!formData.smtpPort || formData.smtpPort < 1 || formData.smtpPort > 65535) {
      errors.smtpPort = 'Port must be between 1 and 65535.';
    }
    if (!formData.username.trim()) errors.username = 'Username is required.';
    if (!config?.hasPasswordConfigured && !formData.password.trim()) {
      errors.password = 'Password / App Password is required.';
    }
    if (!formData.fromName.trim()) errors.fromName = 'Sender Name is required.';
    if (!formData.fromEmail.trim()) {
      errors.fromEmail = 'Sender Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.fromEmail.trim())) {
      errors.fromEmail = 'Enter a valid sender email address.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save Settings Handler
  const handleSave = async (e) => {
    e?.preventDefault();
    if (!validateForm()) return;

    try {
      setSaving(true);
      const payload = {
        provider: formData.provider,
        smtpHost: formData.smtpHost.trim(),
        smtpPort: Number(formData.smtpPort),
        username: formData.username.trim(),
        password: formData.password ? formData.password.trim() : null,
        fromName: formData.fromName.trim(),
        fromEmail: formData.fromEmail.trim(),
        encryptionMode: formData.encryptionMode,
        isEnabled: formData.isEnabled
      };

      const response = await apiClient.put('/api/v1/settings/email', payload);
      if (response?.data?.success) {
        setToastMessage('SMTP configuration saved successfully.');
        setEditModalOpen(false);
        await fetchSettings();
      } else {
        setFormErrors({ submit: response?.data?.message || 'Failed to save email settings.' });
      }
    } catch (err) {
      setFormErrors({ submit: getUserFriendlyError(err, 'Failed to save email configuration.') });
    } finally {
      setSaving(false);
    }
  };

  // Send Test Mail Handler
  const handleSendTestMail = async () => {
    if (!testRecipient.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testRecipient.trim())) {
      setTestResult({
        success: false,
        message: 'Please enter a valid recipient email address.'
      });
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);

      const response = await apiClient.post('/api/v1/settings/email/test', {
        recipientEmail: testRecipient.trim()
      });

      if (response?.data?.success) {
        setTestResult({
          success: true,
          message: response.data.message || `Test message accepted by SMTP server for delivery to ${testRecipient}.`
        });
        setToastMessage('Test email sent successfully!');
        // Refresh status
        fetchSettings();
      } else {
        setTestResult({
          success: false,
          message: response?.data?.message || 'SMTP test failed.'
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: getUserFriendlyError(err, 'SMTP test connection failed.')
      });
    } finally {
      setTesting(false);
    }
  };

  // Open Test Modal
  const openTestModal = () => {
    setTestRecipient(fallbackUserEmail || config?.fromEmail || '');
    setTestResult(null);
    setTestModalOpen(true);
  };

  const isConfigured = Boolean(config?.id && config.smtpHost);
  const isEnabled = config?.isEnabled ?? false;
  const isVerified = config?.isVerified ?? false;

  const activeSenderName = config?.fromName || fallbackUserName;
  const activeSenderEmail = config?.fromEmail || fallbackUserEmail;
  const activeHost = config?.smtpHost || 'Not Configured';
  const activePort = config?.smtpPort || 587;
  const activeUsername = config?.username || 'Not Configured';
  const secureConn = config?.encryptionMode === 'SslTls'
    ? 'Yes (SSL/TLS)'
    : config?.encryptionMode === 'StartTls'
    ? 'Yes (STARTTLS)'
    : 'No (Plain)';

  return (
    <div className="email-config-container">
      <FeedbackSnackbar message={toastMessage} onClose={() => setToastMessage('')} />

      {pageError && (
        <Alert severity="error" sx={{ borderRadius: '10px' }}>
          {pageError}
        </Alert>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <CircularProgress size={36} />
        </div>
      ) : (
        <>
          {/* Card 1: Workspace Mail Sender (Image 2 style) */}
          <section className="email-card" aria-labelledby="workspace-sender-title">
            <header className="email-card-header">
              <div className="email-card-header-titles">
                <h2 id="workspace-sender-title">Workspace Mail Sender</h2>
              </div>
            </header>

            <div className="active-sender-meta">
              <EmailOutlined />
              <span>Active Sender</span>
            </div>

            <div className="active-sender-content">
              <div className="active-sender-identity">
                <h3>{activeSenderName} (Admin)</h3>
                <p className="sender-email-text">{activeSenderEmail || 'No sender email configured'}</p>
              </div>

              <div className="active-sender-badges">
                {isConfigured ? (
                  <span className={`badge-pill ${isEnabled ? 'badge-configured' : 'badge-disabled'}`}>
                    {isEnabled ? 'SMTP Configured' : 'SMTP Disabled'}
                  </span>
                ) : (
                  <span className="badge-pill badge-not-configured">Not Configured</span>
                )}
                <span className="badge-pill badge-workspace-default">Workspace default</span>
                <span className="badge-pill badge-active-sender">Active sender</span>
              </div>
            </div>

            <p className="sender-subtext-note">
              SMTP Configured means settings are saved. Send Test Mail checks SMTP acceptance, not Inbox delivery.
            </p>

            <div className="active-sender-actions">
              <Button
                variant="outlined"
                startIcon={<EmailOutlined />}
                onClick={openTestModal}
                disabled={!isConfigured}
              >
                Send Test Mail
              </Button>
              <Button
                variant="outlined"
                startIcon={<TuneOutlined />}
                onClick={() => setEditModalOpen(true)}
              >
                Change Sender
              </Button>
            </div>

            {/* Sender Details Strip */}
            <div className="sender-details-section">
              <div className="sender-details-section-title">Sender Details</div>
              <div className="sender-details-strip">
                <div className="sender-detail-capsule">
                  <span className="detail-label">Role</span>
                  <span className="detail-value">Admin</span>
                </div>
                <div className="sender-detail-capsule">
                  <span className="detail-label">Status</span>
                  <span className="detail-value">
                    {isConfigured ? (isEnabled ? 'Using workspace custom SMTP' : 'Disabled') : 'Using workspace default'}
                  </span>
                </div>
                <div className="sender-detail-capsule">
                  <span className="detail-label">Fallback</span>
                  <span className="detail-value">Disabled (Tenant-isolated)</span>
                </div>
              </div>

              <div className="sender-footer-capsule">
                Workspace default sender: <strong>{activeSenderName}</strong> ({activeSenderEmail || 'unconfigured'})
              </div>
            </div>
          </section>

          {/* Card 2: SMTP Configuration Details (Image 1 style) */}
          <section className="email-card" aria-labelledby="smtp-config-title">
            <header className="email-card-header">
              <div className="email-card-header-titles">
                <h2 id="smtp-config-title">SMTP Configuration</h2>
                <p>View and edit SMTP credentials for the currently selected workspace sender.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className={`badge-pill ${isConfigured && isEnabled ? 'badge-configured' : isConfigured ? 'badge-disabled' : 'badge-not-configured'}`}>
                  {isConfigured && isEnabled ? 'SMTP Configured' : isConfigured ? 'SMTP Disabled' : 'Not Configured'}
                </span>
                <Tooltip title="Edit SMTP Configuration">
                  <IconButton onClick={() => setEditModalOpen(true)} size="small" aria-label="Edit SMTP Configuration">
                    <EditOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              </div>
            </header>

            {/* Read-Only Details Rows (matching Image 1) */}
            <div className="smtp-details-grid">
              <div className="smtp-detail-row">
                <span className="row-label">SMTP Host</span>
                <span className="row-value">{activeHost}</span>
              </div>
              <div className="smtp-detail-row">
                <span className="row-label">SMTP Port</span>
                <span className="row-value">{activePort}</span>
              </div>
              <div className="smtp-detail-row">
                <span className="row-label">Email Username</span>
                <span className="row-value">{activeUsername}</span>
              </div>
              <div className="smtp-detail-row">
                <span className="row-label">From Name</span>
                <span className="row-value">{activeSenderName}</span>
              </div>
              <div className="smtp-detail-row">
                <span className="row-label">From Email</span>
                <span className="row-value">{activeSenderEmail || 'Not Configured'}</span>
              </div>
              <div className="smtp-detail-row">
                <span className="row-label">Secure Connection</span>
                <span className="row-value">{secureConn}</span>
              </div>
              <div className="smtp-detail-row">
                <span className="row-label">SMTP Configured</span>
                <span className="row-value">{isConfigured ? 'Yes' : 'No'}</span>
              </div>
            </div>

            {/* Last Verification Alert if tested */}
            {config?.lastTestedAtUtc && (
              <div style={{ marginTop: '20px' }}>
                <Alert
                  severity={config.lastTestStatus === 'Success' ? 'success' : 'warning'}
                  icon={config.lastTestStatus === 'Success' ? <CheckCircleOutline /> : <ErrorOutline />}
                  sx={{ borderRadius: '10px' }}
                >
                  <strong>Last Connection Test ({new Date(config.lastTestedAtUtc).toLocaleString()}):</strong>{' '}
                  {config.lastTestStatus === 'Success'
                    ? 'Connection authenticated and verified.'
                    : config.lastTestError || 'Last connection test failed.'}
                </Alert>
              </div>
            )}
          </section>
        </>
      )}

      {/* Edit SMTP Configuration Dialog */}
      <Dialog
        open={editModalOpen}
        onClose={() => !saving && setEditModalOpen(false)}
        maxWidth="md"
        fullWidth
        className="smtp-edit-dialog"
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.2rem', pb: 1 }}>
          Edit SMTP Credentials
        </DialogTitle>
        <DialogContent dividers>
          {formErrors.submit && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }}>
              {formErrors.submit}
            </Alert>
          )}

          <div className="provider-preset-card">
            <span>Provider Preset: </span>
            <strong>{formData.provider}</strong> — {PROVIDER_PRESETS[formData.provider]?.note}
          </div>

          <form id="smtp-edit-form" onSubmit={handleSave} className="smtp-form-grid">
            <FormControl fullWidth size="small" className="full-width">
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Email Provider
              </label>
              <Select
                value={formData.provider}
                onChange={handleProviderChange}
                disabled={saving}
              >
                <MenuItem value="Gmail">Gmail SMTP</MenuItem>
                <MenuItem value="Office365">Microsoft 365</MenuItem>
                <MenuItem value="Hostinger">Hostinger SMTP</MenuItem>
                <MenuItem value="Custom">Custom Business SMTP</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="SMTP Host"
              value={formData.smtpHost}
              onChange={(e) => setFormData({ ...formData, smtpHost: e.target.value })}
              error={Boolean(formErrors.smtpHost)}
              helperText={formErrors.smtpHost}
              placeholder="e.g. smtp.hostinger.com"
              size="small"
              required
              fullWidth
              disabled={saving}
            />

            <TextField
              label="SMTP Port"
              type="number"
              value={formData.smtpPort}
              onChange={(e) => setFormData({ ...formData, smtpPort: e.target.value })}
              error={Boolean(formErrors.smtpPort)}
              helperText={formErrors.smtpPort || '465 for SSL/TLS, 587 for STARTTLS'}
              size="small"
              required
              fullWidth
              disabled={saving}
            />

            <TextField
              label="Email Username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              error={Boolean(formErrors.username)}
              helperText={formErrors.username || 'Usually your full email address'}
              placeholder="billing@company.com"
              size="small"
              required
              fullWidth
              disabled={saving}
            />

            <TextField
              label="Password / App Password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              error={Boolean(formErrors.password)}
              helperText={
                formErrors.password ||
                (config?.hasPasswordConfigured
                  ? 'Leave blank to retain currently saved password'
                  : 'Enter password or generated App Password')
              }
              placeholder={config?.hasPasswordConfigured ? '••••••••••••' : 'Enter password'}
              size="small"
              fullWidth
              disabled={saving}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <VisibilityOffOutlined fontSize="small" /> : <VisibilityOutlined fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />

            <TextField
              label="Sender Display Name"
              value={formData.fromName}
              onChange={(e) => setFormData({ ...formData, fromName: e.target.value })}
              error={Boolean(formErrors.fromName)}
              helperText={formErrors.fromName}
              placeholder="e.g. Admin or Acme Billing"
              size="small"
              required
              fullWidth
              disabled={saving}
            />

            <TextField
              label="Sender Email Address"
              type="email"
              value={formData.fromEmail}
              onChange={(e) => setFormData({ ...formData, fromEmail: e.target.value })}
              error={Boolean(formErrors.fromEmail)}
              helperText={formErrors.fromEmail || 'Displayed in the From: header of customer emails'}
              placeholder="billing@company.com"
              size="small"
              required
              fullWidth
              disabled={saving}
            />

            <FormControl fullWidth size="small">
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Transport Security Mode
              </label>
              <Select
                value={formData.encryptionMode}
                onChange={(e) => setFormData({ ...formData, encryptionMode: e.target.value })}
                disabled={saving}
              >
                <MenuItem value="StartTls">STARTTLS (Port 587 recommended)</MenuItem>
                <MenuItem value="SslTls">SSL / TLS (Port 465 recommended)</MenuItem>
                <MenuItem value="None">None (Unencrypted)</MenuItem>
              </Select>
            </FormControl>

            <div style={{ display: 'flex', alignItems: 'center', paddingTop: '18px' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.isEnabled}
                    onChange={(e) => setFormData({ ...formData, isEnabled: e.target.checked })}
                    color="primary"
                    disabled={saving}
                  />
                }
                label={
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    Enable Outgoing Email Sending
                  </span>
                }
              />
            </div>
          </form>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setEditModalOpen(false)} disabled={saving} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            form="smtp-edit-form"
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Send Test Mail Dialog */}
      <Dialog
        open={testModalOpen}
        onClose={() => !testing && setTestModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.2rem', pb: 1 }}>
          Send Test Mail
        </DialogTitle>
        <DialogContent dividers>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: 0, marginBottom: 16 }}>
            Verify that your mail server accepts connections and credentials by dispatching a test email.
          </p>

          {testResult && (
            <Alert
              severity={testResult.success ? 'success' : 'error'}
              icon={testResult.success ? <CheckCircleOutline /> : <ErrorOutline />}
              sx={{ mb: 2, borderRadius: '8px' }}
            >
              {testResult.message}
            </Alert>
          )}

          <TextField
            label="Recipient Email Address"
            type="email"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            placeholder="your-email@domain.com"
            size="small"
            fullWidth
            required
            disabled={testing}
            helperText="We will send a diagnostic test message to this mailbox."
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setTestModalOpen(false)} disabled={testing} color="inherit">
            Close
          </Button>
          <Button
            onClick={handleSendTestMail}
            variant="contained"
            disabled={testing || !testRecipient.trim()}
            startIcon={testing ? <CircularProgress size={16} color="inherit" /> : <SendOutlined />}
          >
            {testing ? 'Verifying & Sending...' : 'Send Test Mail'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default EmailConfiguration;
