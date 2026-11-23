import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import EditOutlined from '@mui/icons-material/EditOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import BusinessOutlined from '@mui/icons-material/BusinessOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import { Link } from 'react-router-dom';
import { authApi, templateApi } from 'billing-api-client';
import { queryClient } from '../../queryClient';
import { userRoleAdministrationService } from '../UserRoleAdministration/userRoleAdministrationService';
import { getCurrentUserRoles } from '../../utils/permissionUtils';
import { getCompanyDisplayName, getDisplayName, getInitials } from '../../utils/userDisplay';
import { useCurrentUser, publishProfile } from '../../hooks/useCurrentUser';
import { SettingsPageHeader } from './SettingsPageHeader';
import './settings.css';

export function ProfileSettings() {
  const user = useCurrentUser();
  const id = user?.userId ?? user?.UserId ?? user?.id ?? user?.Id;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || user?.Name || getDisplayName(user) || '');
  const [email, setEmail] = useState(user?.email || user?.Email || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const locked = useRef(false);

  useEffect(() => {
    if (!editing) {
      setName(user?.name || user?.Name || getDisplayName(user) || '');
      setEmail(user?.email || user?.Email || '');
    }
  }, [user, editing]);

  const canEdit = Boolean(id) && getCurrentUserRoles(user).some(value => ['admin', 'tenantadmin', 'superadmin'].includes(value.toLowerCase()));
  const valid = name.trim().length > 0 && name.trim().length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const role = (Array.isArray(user?.roles) ? user.roles.join(', ') : user?.role) || 'User';
  const company = getCompanyDisplayName(user);
  const displayName = getDisplayName(user);
  const initials = getInitials(displayName || name);

  const startEdit = () => {
    setName(user?.name || user?.Name || getDisplayName(user) || '');
    setEmail(user?.email || user?.Email || '');
    setError('');
    setSaved(false);
    setEditing(true);
  };

  const cancelEdit = () => {
    setName(user?.name || user?.Name || getDisplayName(user) || '');
    setEmail(user?.email || user?.Email || '');
    setError('');
    setEditing(false);
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!canEdit || !valid || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setSaved(false);

    try {
      const account = await userRoleAdministrationService.getUser(id);
      const applicationId = account?.applicationId ?? account?.ApplicationId;
      if (typeof applicationId !== 'string' || !applicationId.trim()) {
        throw new Error('Your account application could not be loaded. Please try again.');
      }
      const result = await userRoleAdministrationService.updateUser(id, {
        name: name.trim(),
        email: email.trim(),
        applicationId,
      });
      const current = authApi.getCurrentUser();
      const updatedName = result.data?.name ?? result.data?.Name ?? name.trim();
      const updatedEmail = result.data?.email ?? result.data?.Email ?? email.trim();
      publishProfile({ ...current, name: updatedName, email: updatedEmail });
      setEditing(false);
      setSaved(true);
    } catch (failure) {
      const errors = failure.response?.data?.errors;
      const details = errors && typeof errors === 'object'
        ? Object.values(errors).flat().filter(v => typeof v === 'string' && v.trim()).join(' ')
        : '';
      setError(details || failure.message || 'Unable to update your profile. Please try again.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  const [logoBusy, setLogoBusy] = useState(false);
  const [logoNotice, setLogoNotice] = useState('');
  const [logoError, setLogoError] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoName, setLogoName] = useState('');
  const [logoPosition, setLogoPosition] = useState('left');
  const [logoWidth, setLogoWidth] = useState(120);

  const tenantKey = user?.tenantId ?? user?.tenant_id ?? user?.TenantId ?? 'current';

  useEffect(() => {
    let active = true;
    const cached = queryClient.getQueryData(['company-branding', tenantKey]);
    if (cached?.branding) {
      setLogoUrl(cached.branding.logoUrl || '');
      setLogoName(cached.branding.logoName || '');
      setLogoPosition(cached.branding.logoPosition || 'left');
      setLogoWidth(cached.branding.logoWidth || 120);
    }

    templateApi.getCompanyBranding()
      .then(data => {
        if (!active) return;
        queryClient.setQueryData(['company-branding', tenantKey], data);
        if (data?.branding) {
          setLogoUrl(data.branding.logoUrl || '');
          setLogoName(data.branding.logoName || '');
          setLogoPosition(data.branding.logoPosition || 'left');
          setLogoWidth(data.branding.logoWidth || 120);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [tenantKey]);

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLogoError('');
    setLogoNotice('');

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      setLogoError('Supported formats: PNG, JPG, JPEG, and WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('Image size exceeds the 2 MB limit.');
      return;
    }

    setLogoBusy(true);
    try {
      const uploadRes = await templateApi.uploadLogo(file);
      const newLogoUrl = uploadRes?.logoUrl || uploadRes?.LogoUrl;
      const newFileName = uploadRes?.fileName || uploadRes?.FileName || file.name;
      setLogoUrl(newLogoUrl);
      setLogoName(newFileName);

      await templateApi.updateCompanyBranding({
        branding: {
          logoUrl: newLogoUrl,
          logoName: newFileName,
          logoPosition,
          logoWidth
        }
      });
      queryClient.invalidateQueries({ queryKey: ['company-branding'] });
      setLogoNotice('Company logo uploaded and saved successfully.');
    } catch (err) {
      setLogoError(err.message || 'Failed to upload company logo.');
    } finally {
      setLogoBusy(false);
    }
  };

  const handleRemoveLogo = async () => {
    setLogoBusy(true);
    setLogoError('');
    setLogoNotice('');
    try {
      setLogoUrl('');
      setLogoName('');
      await templateApi.updateCompanyBranding({
        branding: {
          logoUrl: '',
          logoName: '',
          logoPosition,
          logoWidth
        }
      });
      queryClient.invalidateQueries({ queryKey: ['company-branding'] });
      setLogoNotice('Company logo removed successfully.');
    } catch (err) {
      setLogoError(err.message || 'Failed to remove company logo.');
    } finally {
      setLogoBusy(false);
    }
  };

  const handleSaveLogoSettings = async () => {
    setLogoBusy(true);
    setLogoError('');
    setLogoNotice('');
    try {
      await templateApi.updateCompanyBranding({
        branding: {
          logoUrl,
          logoName,
          logoPosition,
          logoWidth
        }
      });
      queryClient.invalidateQueries({ queryKey: ['company-branding'] });
      setLogoNotice('Company logo display settings saved successfully.');
    } catch (err) {
      setLogoError(err.message || 'Failed to save logo display settings.');
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <main className="settings-page profile-settings-page">
      <SettingsPageHeader
        title="Profile Settings"
        description="Manage your personal profile, email, and workspace account preferences."
      >
        {!editing && canEdit && (
          <Button
            variant="contained"
            startIcon={<EditOutlined />}
            onClick={startEdit}
            className="profile-edit-btn"
          >
            Edit Profile
          </Button>
        )}
      </SettingsPageHeader>

      {saved && (
        <Alert severity="success" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setSaved(false)}>
          Profile updated successfully.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <div className="profile-settings-card">
        <div className="profile-card-header">
          <div className="profile-avatar-large" aria-hidden="true">
            {initials}
          </div>
          <div className="profile-identity">
            <h2 className="profile-identity-name">{displayName}</h2>
            <div className="profile-identity-tags">
              <span className="profile-role-badge">{role}</span>
              {company && <span className="profile-company-tag">{company}</span>}
              <span className="profile-status-badge">
                <CheckCircleOutline fontSize="small" /> Active
              </span>
            </div>
          </div>
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="profile-edit-form">
            <div className="profile-form-grid">
              <div className="profile-form-field">
                <TextField
                  autoFocus
                  required
                  fullWidth
                  label="Full Name"
                  value={name}
                  disabled={busy}
                  inputProps={{ maxLength: 100 }}
                  onChange={event => setName(event.target.value)}
                  helperText="Enter your official name as shown on invoices and audit records."
                />
              </div>
              <div className="profile-form-field">
                <TextField
                  required
                  fullWidth
                  label="Email Address"
                  type="email"
                  value={email}
                  disabled={busy}
                  inputProps={{ maxLength: 254 }}
                  onChange={event => setEmail(event.target.value)}
                  helperText="Primary email used for billing notifications and sign in."
                />
              </div>
              {company && (
                <div className="profile-form-field">
                  <TextField
                    fullWidth
                    disabled
                    label="Company / Organization"
                    value={company}
                    helperText="Company assignment managed by organization administrator."
                  />
                </div>
              )}
              <div className="profile-form-field">
                <TextField
                  fullWidth
                  disabled
                  label="Role"
                  value={role}
                  helperText="Role permissions are managed under Users & Roles."
                />
              </div>
            </div>

            <div className="profile-form-actions">
              <Button
                type="submit"
                variant="contained"
                disabled={busy || !valid}
                startIcon={<SaveOutlined />}
                className="profile-save-btn"
              >
                {busy ? 'Saving…' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                variant="outlined"
                disabled={busy}
                startIcon={<CloseOutlined />}
                onClick={cancelEdit}
                className="profile-cancel-btn"
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="profile-details-grid">
            <div className="profile-detail-item">
              <span className="profile-detail-label">Full Name</span>
              <strong className="profile-detail-value">{displayName}</strong>
            </div>
            <div className="profile-detail-item">
              <span className="profile-detail-label">Email Address</span>
              <strong className="profile-detail-value">{user?.email || user?.Email || 'Not available'}</strong>
            </div>
            {company && (
              <div className="profile-detail-item">
                <span className="profile-detail-label">Company / Organization</span>
                <strong className="profile-detail-value">{company}</strong>
              </div>
            )}
            <div className="profile-detail-item">
              <span className="profile-detail-label">Assigned Role</span>
              <strong className="profile-detail-value">{role}</strong>
            </div>
            <div className="profile-detail-item">
              <span className="profile-detail-label">User ID</span>
              <code className="profile-detail-code">{id || '—'}</code>
            </div>
            <div className="profile-detail-item">
              <span className="profile-detail-label">Account Status</span>
              <span className="profile-status-pill active">Active</span>
            </div>
          </div>
        )}
      </div>

      {/* Company Logo & Branding Configuration */}
      <div className="profile-settings-card" style={{ marginTop: 24 }}>
        <div className="profile-card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="profile-avatar-large" style={{ background: '#35271f' }} aria-hidden="true">
              <BusinessOutlined />
            </div>
            <div>
              <h2 className="profile-identity-name" style={{ marginBottom: 4 }}>Company Logo &amp; Identity</h2>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                Configure official company branding for customer invoices, quotations, and emails.
              </p>
            </div>
          </div>
          <Button
            variant="outlined"
            component={Link}
            to="/templates-branding/branding"
            endIcon={<OpenInNewOutlined />}
            size="small"
          >
            All Branding Settings
          </Button>
        </div>

        {logoNotice && (
          <Alert severity="success" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setLogoNotice('')}>
            {logoNotice}
          </Alert>
        )}
        {logoError && (
          <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setLogoError('')}>
            {logoError}
          </Alert>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 280px) 1fr', gap: 24, alignItems: 'start' }}>
          <div style={{
            border: '1px dashed #d1c5b8',
            borderRadius: 12,
            padding: 20,
            textAlign: 'center',
            backgroundColor: '#faf8f5',
            minHeight: 160,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Company Logo"
                style={{
                  maxWidth: '100%',
                  maxHeight: 120,
                  objectFit: 'contain',
                  borderRadius: 6,
                  marginBottom: 8
                }}
              />
            ) : (
              <div style={{ color: '#8c7664', fontSize: '0.9rem', padding: '16px 8px' }}>
                <CloudUploadOutlined style={{ fontSize: 36, opacity: 0.7, marginBottom: 6 }} />
                <div>No Company Logo Uploaded</div>
              </div>
            )}
            {logoName && (
              <span style={{ fontSize: '0.75rem', color: '#736252', wordBreak: 'break-all' }}>
                {logoName}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <strong style={{ fontSize: '0.95rem', color: '#35271f' }}>Upload Official Company Logo</strong>
              <p style={{ margin: '4px 0 12px', fontSize: '0.825rem', color: '#64748b' }}>
                PNG, JPG, JPEG, and WebP image formats up to 2 MB. This logo automatically appears on invoices, payment links, and receipts.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  variant="contained"
                  component="label"
                  disabled={logoBusy || !canEdit}
                  startIcon={<CloudUploadOutlined />}
                  style={{ background: '#795137' }}
                >
                  {logoBusy ? 'Uploading…' : logoUrl ? 'Change Logo' : 'Upload Logo'}
                  <input
                    type="file"
                    hidden
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    onChange={handleLogoUpload}
                  />
                </Button>
                {logoUrl && (
                  <Button
                    variant="outlined"
                    color="error"
                    disabled={logoBusy || !canEdit}
                    startIcon={<DeleteOutline />}
                    onClick={handleRemoveLogo}
                  >
                    Remove Logo
                  </Button>
                )}
              </div>
            </div>

            {logoUrl && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                <TextField
                  select
                  size="small"
                  label="Logo Alignment"
                  value={logoPosition}
                  onChange={e => setLogoPosition(e.target.value)}
                  style={{ minWidth: 140 }}
                  disabled={logoBusy || !canEdit}
                >
                  <MenuItem value="left">Left Aligned</MenuItem>
                  <MenuItem value="center">Centered</MenuItem>
                  <MenuItem value="right">Right Aligned</MenuItem>
                </TextField>
                <TextField
                  type="number"
                  size="small"
                  label="Display Width (px)"
                  inputProps={{ min: 48, max: 240 }}
                  value={logoWidth}
                  onChange={e => setLogoWidth(Math.min(240, Math.max(48, Number(e.target.value) || 48)))}
                  style={{ width: 140 }}
                  disabled={logoBusy || !canEdit}
                />
                <Button
                  variant="outlined"
                  size="small"
                  disabled={logoBusy || !canEdit}
                  onClick={handleSaveLogoSettings}
                  style={{ height: 40 }}
                >
                  Save Display Settings
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default ProfileSettings;

