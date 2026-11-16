import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import EditOutlined from '@mui/icons-material/EditOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import { authApi } from 'billing-api-client';
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
    </main>
  );
}

export default ProfileSettings;

