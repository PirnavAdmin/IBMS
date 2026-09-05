import { useState } from 'react';
import { Search, NotificationsNone, HelpOutline, KeyboardArrowDown, Logout, Menu } from '@mui/icons-material';

export const DashboardHeader = ({ searchQuery, onSearch, onSignOut, onMenu }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="bd-header">
    {onMenu && <button className="bd-mobile-menu" onClick={onMenu} aria-label="Open navigation"><Menu /></button>}
    <label className="bd-search"><Search /><input value={searchQuery} onChange={(event) => onSearch(event.target.value)} placeholder="Search invoices, customers, products..." aria-label="Search dashboard" /></label>
    <div className="bd-profile-area">
      <button className="bd-icon-button bd-notification" aria-label="Notifications"><NotificationsNone /></button>
      <button className="bd-icon-button" aria-label="Help"><HelpOutline /></button>
      <div className="bd-avatar">JD</div>
      <div className="bd-user-copy"><strong>John Doe</strong><span>System Administrator</span></div>
      <button className="bd-icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Open profile menu"><KeyboardArrowDown /></button>
      {menuOpen && <button className="bd-profile-menu" onClick={onSignOut}><Logout fontSize="small" /> Sign out</button>}
    </div>
  </header>;
};
