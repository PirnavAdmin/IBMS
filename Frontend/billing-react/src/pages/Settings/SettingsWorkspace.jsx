import { SettingsOutlined } from '@mui/icons-material';
import { Tab, Tabs } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import './settings.css';

const sections = [
  ['/settings/taxes', 'Taxes & GST'],
  ['/settings/discounts', 'Discounts'],
  ['/settings/charges', 'Charges'],
  ['/settings/numbering', 'Invoice Numbering'],
  ['/settings/notifications', 'Notifications'],
  ['/settings/countries', 'Country'],
];

export function SettingsWorkspace({ children }) {
  const { pathname } = useLocation();
  const selected = sections.find(([route]) => pathname === route || pathname.startsWith(route + '/'))?.[0] || sections[0][0];
  return <section className="settings-workspace">
    <header className="settings-workspace-header">
      <span className="settings-workspace-icon" aria-hidden="true"><SettingsOutlined /></span>
      <div><h1>Settings &amp; Administration</h1><p>Manage your billing preferences and business configuration.</p></div>
    </header>
    <Tabs className="settings-workspace-tabs" value={selected} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Settings sections">
      {sections.map(([route, label]) => <Tab key={route} value={route} label={label} component={Link} to={route} id={'settings-tab-' + route.split('/').pop()} aria-controls="settings-section-content" />)}
    </Tabs>
    <div id="settings-section-content" className="settings-workspace-content" role="tabpanel" aria-labelledby={'settings-tab-' + selected.split('/').pop()}>{children}</div>
  </section>;
}
