import { authApi } from 'billing-api-client';
import { getDisplayName, getInitials } from '../../utils/userDisplay';
import { useRef, useState } from 'react';
import { useExclusiveDropdown } from '../../hooks/useExclusiveDropdown';
import {
  Search,
  Close,
  KeyboardArrowDown,
  Logout,
  Menu,
} from '@mui/icons-material';

export const DashboardHeader = ({ searchQuery, onSearch, onSignOut, onMenu, searchPlaceholder = 'Search displayed records...', searchLabel = 'Search dashboard', searchResultsId }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef(null);
  const clearSearch = () => { onSearch?.(''); searchRef.current?.focus(); };
  useExclusiveDropdown(menuOpen, setMenuOpen);
  const displayName = getDisplayName(authApi.getCurrentUser());
  const user = authApi.getCurrentUser();
  const role = (Array.isArray(user?.roles) ? user.roles.join(', ') : user?.role) || 'Signed in';
  return <header className={`bd-header${onSearch ? '' : ' bd-header-profile-only'}`}>
    {onMenu && <button className="bd-mobile-menu" onClick={onMenu} aria-label="Open navigation"><Menu /></button>}
    {onSearch && <div className="bd-search" role="search"><Search aria-hidden="true" /><input ref={searchRef} value={searchQuery || ''} onChange={(event) => onSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && searchQuery) { event.preventDefault(); clearSearch(); } }} placeholder={searchPlaceholder} aria-label={searchLabel} aria-controls={searchQuery?.trim() ? searchResultsId : undefined} />{searchQuery && <button type="button" className="bd-search-clear" onClick={clearSearch} aria-label="Clear search" title="Clear search"><Close /></button>}</div>}
    <div className="bd-profile-area">
      <div className="bd-avatar">{getInitials(displayName)}</div>
      <div className="bd-user-copy"><strong title={displayName}>{displayName}</strong><span>{role}</span></div>
      <button className="bd-icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Open profile menu"><KeyboardArrowDown /></button>
      {menuOpen && <button className="bd-profile-menu" onClick={onSignOut}><Logout fontSize="small" /> Sign out</button>}
    </div>
  </header>;
};
