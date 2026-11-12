import { isPlatformAdmin } from '../../pages/Platform/platformAccess';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import { NotificationBell } from './NotificationBell';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { AccountProfileDialog } from './AccountProfileDialog';
import { getHeaderDisplayName, getInitials } from '../../utils/userDisplay';
import { useId, useRef, useState } from 'react';
import { searchInputError } from '../../utils/search';
import { useExclusiveDropdown } from '../../hooks/useExclusiveDropdown';
import Search from '@mui/icons-material/Search';
import Close from '@mui/icons-material/Close';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import Logout from '@mui/icons-material/Logout';
import Menu from '@mui/icons-material/Menu';
import ProfileMenu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import Divider from '@mui/material/Divider';
import PersonOutline from '@mui/icons-material/PersonOutline';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';
import { Link, useNavigate } from 'react-router-dom';
import { hasPermission } from '../../utils/permissionUtils';
import './DashboardHeader.css';

export const DashboardHeader = ({ searchQuery, onSearch, onSignOut, onMenu, searchPlaceholder = 'Search displayed records...', searchLabel = 'Search dashboard', searchResultsId, navigationItems }) => {
  const navigationResultsId = useId();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationError = navigationItems ? searchInputError(searchQuery) : '';
  const navigationTerms = String(searchQuery || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const navigationMatches = (navigationItems || []).filter(item => navigationTerms.every(term => item.label.toLocaleLowerCase().includes(term)));
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();
  useExclusiveDropdown(profileOpen, setProfileOpen);
  const goTo = path => { setMenuOpen(false); navigate(path); };
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
  const user = useCurrentUser();
  const platformAdmin = isPlatformAdmin(user);
  const displayName = getHeaderDisplayName(user, platformAdmin);
  const role = (platformAdmin ? 'SuperAdmin' : Array.isArray(user?.roles) ? user.roles.join(', ') : user?.role) || 'Signed in';
  const canViewSettings = hasPermission(['settings.view', 'settings.manage'], user);
  return <><header className={`bd-header${onSearch ? '' : ' bd-header-profile-only'}`}>
    {onMenu && <button className="bd-mobile-menu" onClick={onMenu} aria-label="Open navigation"><Menu /></button>}
    {onSearch && <div className="bd-search" role="search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setNavigationOpen(false); }}>
      <Search aria-hidden="true" />
      <input ref={searchRef} value={searchQuery || ''} onFocus={() => setNavigationOpen(true)} onChange={event => { setNavigationOpen(true); onSearch(event.target.value); }} onKeyDown={event => {
        if (event.key === 'Escape' && searchQuery) { event.preventDefault(); setNavigationOpen(false); clearSearch(); }
        if (event.key === 'Enter' && navigationItems && navigationTerms.length && !navigationError && navigationMatches.length === 1) { event.preventDefault(); onSearch(''); setNavigationOpen(false); navigate(navigationMatches[0].route); }
      }} placeholder={searchPlaceholder} aria-label={searchLabel} aria-controls={searchQuery?.trim() ? navigationItems ? navigationResultsId : searchResultsId : undefined} />
      {searchQuery && <button type="button" className="bd-search-clear" onClick={clearSearch} aria-label="Clear search" title="Clear search"><Close /></button>}
      {navigationItems && navigationOpen && navigationTerms.length > 0 && <div id={navigationResultsId} className="bd-module-search-results" role="region" aria-label="Module search results">
        <strong>Modules</strong>
        {navigationError ? <p role="status">{navigationError}</p> : navigationMatches.length ? <ul>{navigationMatches.map(item => <li key={item.route}><Link to={item.route} onClick={() => { onSearch(''); setNavigationOpen(false); }}>{item.label}</Link></li>)}</ul> : <p role="status">No modules match your search.</p>}
      </div>}
    </div>}
    <div className="bd-profile-area">
      <NotificationBell user={user} />
      <div className="bd-avatar">{getInitials(displayName)}</div>
      <div className="bd-user-copy"><strong title={displayName}>{displayName}</strong><span title={role}>{role}</span></div>
      <button type="button" ref={profileRef} className="bd-icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-haspopup="menu" aria-controls={menuOpen ? "navbar-profile-menu" : undefined} aria-expanded={menuOpen} aria-label="Open profile menu"><KeyboardArrowDown /></button>
      <ProfileMenu anchorEl={profileRef.current} open={menuOpen} onClose={() => setMenuOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ className: 'bd-account-menu' }} MenuListProps={{ id: 'navbar-profile-menu', 'aria-label': 'Account options' }}>
        <MenuItem onClick={() => { setMenuOpen(false); setProfileOpen(true); }}><ListItemIcon><PersonOutline fontSize="small" /></ListItemIcon>My Profile</MenuItem>
        {canViewSettings && <MenuItem onClick={() => goTo(isPlatformAdmin(user) ? '/platform/settings' : '/settings')}><ListItemIcon><SettingsOutlined fontSize="small" /></ListItemIcon>{isPlatformAdmin(user) ? 'Platform Settings' : 'Workspace Settings'}</MenuItem>}
        {canViewSettings && !isPlatformAdmin(user) && <MenuItem onClick={() => goTo('/settings/notifications')}><ListItemIcon><NotificationsOutlined fontSize="small" /></ListItemIcon>Notification Settings</MenuItem>}
        <Divider />
        <MenuItem onClick={requestSignOut}><ListItemIcon><Logout fontSize="small" /></ListItemIcon>Sign out</MenuItem>
      </ProfileMenu>
    </div>
  </header>
    {profileOpen && <AccountProfileDialog user={user} role={role} onClose={() => setProfileOpen(false)} />}
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
