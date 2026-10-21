import { authApi } from 'billing-api-client';
import { getDisplayName, getInitials } from '../../utils/userDisplay';
import { useState } from 'react';
import {
  Search,
  KeyboardArrowDown,
  Logout,
  Menu,
} from '@mui/icons-material';

export const DashboardHeader = ({ searchQuery, onSearch, onSignOut, onMenu }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = getDisplayName(authApi.getCurrentUser());
  const user = authApi.getCurrentUser();
  const role = (Array.isArray(user?.roles) ? user.roles.join(', ') : user?.role) || 'Signed in';
  return <header className={`bd-header${onSearch ? '' : ' bd-header-profile-only'}`}>
    {onMenu && <button className="bd-mobile-menu" onClick={onMenu} aria-label="Open navigation"><Menu /></button>}
    {onSearch && <label className="bd-search"><Search /><input value={searchQuery} onChange={(event) => onSearch(event.target.value)} placeholder="Search displayed records..." aria-label="Search dashboard" /></label>}
    <div className="bd-profile-area">
      <div className="bd-avatar">{getInitials(displayName)}</div>
      <div className="bd-user-copy"><strong title={displayName}>{displayName}</strong><span>{role}</span></div>
      <button className="bd-icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Open profile menu"><KeyboardArrowDown /></button>
      {menuOpen && <button className="bd-profile-menu" onClick={onSignOut}><Logout fontSize="small" /> Sign out</button>}
    </div>
  </header>;
};
