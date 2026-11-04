import { useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { authApi } from 'billing-api-client';
import { userRoleAdministrationService } from '../../pages/UserRoleAdministration/userRoleAdministrationService';
import { getCurrentUserRoles } from '../../utils/permissionUtils';
import { getDisplayName } from '../../utils/userDisplay';
import { publishProfile } from '../../hooks/useCurrentUser';

export function AccountProfileDialog({ user, role, onClose }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || user?.Name || getDisplayName(user));
  const [email, setEmail] = useState(user?.email || user?.Email || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const locked = useRef(false);
  const id = user?.userId ?? user?.UserId ?? user?.id ?? user?.Id;
  const canEdit = Boolean(id) && getCurrentUserRoles(user).some(value => ['admin', 'tenantadmin', 'superadmin'].includes(value.toLowerCase()));
  const valid = name.trim().length > 0 && name.trim().length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const close = () => { if (!locked.current) onClose(); };
  const save = async event => {
    event.preventDefault();
    if (!canEdit || !valid || locked.current) return;
    locked.current = true; setBusy(true); setError(''); setSaved(false);
    try {
      // A profile edit must not change identity, tenant, role, status or app assignment.
      const account = await userRoleAdministrationService.getUser(id);
      const applicationId = account?.applicationId ?? account?.ApplicationId;
      if (typeof applicationId !== 'string' || !applicationId.trim()) throw new Error('Your account application could not be loaded. Please try again.');
      const result = await userRoleAdministrationService.updateUser(id, { name: name.trim(), email: email.trim(), applicationId });
      const current = authApi.getCurrentUser();
      if (String(current?.userId ?? current?.UserId ?? current?.id ?? current?.Id) !== String(id) || String(current?.tenantId ?? current?.TenantId) !== String(user?.tenantId ?? user?.TenantId)) return;
      const updatedName = result.data?.name ?? result.data?.Name;
      const updatedEmail = result.data?.email ?? result.data?.Email;
      if (typeof updatedName !== 'string' || typeof updatedEmail !== 'string') throw new Error('The server did not return the updated profile. Please try again.');
      publishProfile({ ...current, name: updatedName, email: updatedEmail });
      setEditing(false); setSaved(true);
    } catch (failure) {
      const errors = failure.response?.data?.errors;
      const details = errors && typeof errors === 'object' ? Object.values(errors).flat().filter(value => typeof value === 'string' && value.trim()).join(' ') : '';
      setError(details || failure.message || 'Unable to update your profile. Please try again.');
    }
    finally { locked.current = false; setBusy(false); }
  };
  return <Dialog open onClose={close} fullWidth maxWidth="xs" aria-labelledby="account-profile-title">
    <form onSubmit={save}>
      <DialogTitle id="account-profile-title">{editing ? 'Edit Profile' : 'My Profile'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {saved && <Alert severity="success" sx={{ mb: 2 }}>Profile updated successfully.</Alert>}
        {editing ? <div style={{ display: 'grid', gap: 20, paddingTop: 8 }}>
          <TextField autoFocus required fullWidth label="Name" value={name} disabled={busy} inputProps={{ maxLength: 100 }} onChange={event => setName(event.target.value)} />
          <TextField required fullWidth label="Email" type="email" value={email} disabled={busy} inputProps={{ maxLength: 254 }} onChange={event => setEmail(event.target.value)} />
        </div> : <dl className="bd-account-details">
          <div><dt>Name</dt><dd>{getDisplayName(user)}</dd></div>
          <div><dt>Email</dt><dd>{user?.email || user?.Email || 'Not available'}</dd></div>
          <div><dt>Role</dt><dd>{role}</dd></div>
        </dl>}
      </DialogContent>
      <DialogActions>
        {editing ? <><Button key="cancel-edit" type="button" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Cancel</Button><Button key="save-profile" type="submit" variant="contained" disabled={busy || !valid}>{busy ? 'Saving…' : 'Save changes'}</Button></> : <><Button key="close-profile" type="button" onClick={close}>Close</Button>{canEdit && <Button key="edit-profile" type="button" variant="contained" onClick={event => { event.preventDefault(); setName(user?.name || getDisplayName(user)); setEmail(user?.email || user?.Email || ''); setSaved(false); setEditing(true); }}>Edit Profile</Button>}</>}
      </DialogActions>
    </form>
  </Dialog>;
}
