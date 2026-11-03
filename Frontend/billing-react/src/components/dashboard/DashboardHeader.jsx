import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import { NotificationBell } from './NotificationBell';
import { authApi } from 'billing-api-client';
import { getDisplayName, getInitials } from '../../utils/userDisplay';
import { useRef, useState } from 'react';
import { useExclusiveDropdown } from '../../hooks/useExclusiveDropdown';
import Search from '@mui/icons-material/Search';
import Close from '@mui/icons-material/Close';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import Logout from '@mui/icons-material/Logout';
import Menu from '@mui/icons-material/Menu';

export const DashboardHeader = ({ searchQuery, onSearch, onSignOut, onMenu, searchPlaceholder = 'Search displayed records...', searchLabel = 'Search dashboard', searchResultsId }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef(null);
  const profileRef = useRef(null);
  const signOutLocked = useRef(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  useExclusiveDropdown(confirmSignOut, setConfirmSignOut);
  const requestSignOut = () => {
    profileRef.current?.focus();
    setMenuOpen(false);
    signOutLocked.current = false;
    setConfirmSignOut(true);
  };
  const confirmLogout = () => {
    if (signOutLocked.current) return;
    signOutLocked.current = true;
    setConfirmSignOut(false);
    onSignOut?.();
  };
  const clearSearch = () => { onSearch?.(''); searchRef.current?.focus(); };
  useExclusiveDropdown(menuOpen, setMenuOpen);
  const displayName = getDisplayName(authApi.getCurrentUser());
  const user = authApi.getCurrentUser();
  const role = (Array.isArray(user?.roles) ? user.roles.join(', ') : user?.role) || 'Signed in';
  return <><header className={`bd-header${onSearch ? '' : ' bd-header-profile-only'}`}>
    {onMenu && <button className="bd-mobile-menu" onClick={onMenu} aria-label="Open navigation"><Menu /></button>}
    {onSearch && <div className="bd-search" role="search"><Search aria-hidden="true" /><input ref={searchRef} value={searchQuery || ''} onChange={(event) => onSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && searchQuery) { event.preventDefault(); clearSearch(); } }} placeholder={searchPlaceholder} aria-label={searchLabel} aria-controls={searchQuery?.trim() ? searchResultsId : undefined} />{searchQuery && <button type="button" className="bd-search-clear" onClick={clearSearch} aria-label="Clear search" title="Clear search"><Close /></button>}</div>}
    <div className="bd-profile-area">
      <NotificationBell user={user} />
      <div className="bd-avatar">{getInitials(displayName)}</div>
      <div className="bd-user-copy"><strong title={displayName}>{displayName}</strong><span>{role}</span></div>
      <button type="button" ref={profileRef} className="bd-icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Open profile menu"><KeyboardArrowDown /></button>
      {menuOpen && <button type="button" className="bd-profile-menu" onClick={requestSignOut}><Logout fontSize="small" /> Sign out</button>}
    </div>
  </header>
    <Dialog open={confirmSignOut} onClose={() => setConfirmSignOut(false)}
      aria-labelledby="sign-out-confirm-title" aria-describedby="sign-out-confirm-description"
      fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle id="sign-out-confirm-title">Sign out?</DialogTitle>
      <DialogContent><DialogContentText id="sign-out-confirm-description">Are you sure you want to sign out?</DialogContentText></DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button autoFocus onClick={() => setConfirmSignOut(false)}>Cancel</Button>
        <Button variant="contained" aria-label="Confirm sign out" onClick={confirmLogout}>Sign out</Button>
      </DialogActions>
    </Dialog>
  </>;
};
