import { Settings, LocalOfferOutlined, AddCardOutlined, ReceiptLongOutlined } from '@mui/icons-material';
import { Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import './settings.css';

const cards = [
  { title: 'Taxes & GST', description: 'Configure tax rules, GST rates, calculation methods, and active billing taxes.', icon: ReceiptLongOutlined, route: '/settings/taxes' },
  { title: 'Discount Configuration', description: 'Set maximum discounts, application controls, overrides, and role access.', icon: LocalOfferOutlined, route: '/settings/discounts' },
  { title: 'Charges Configuration', description: 'Manage shipping, handling, late fees, and custom invoice charges.', icon: AddCardOutlined, route: '/settings/charges' },
];
export function SettingsLanding() {
  const navigate = useNavigate();
  return <main className="settings-page"><div className="settings-hero"><div className="settings-title-icon"><Settings /></div><div><p className="settings-eyebrow">Configuration & administration</p><h1>Settings</h1><p>Manage the billing rules that shape how your team creates invoices.</p></div></div><section className="settings-card-grid" aria-label="Settings options">{cards.map(({ title, description, icon: Icon, route }) => <article className="settings-nav-card" key={route}><span className="settings-nav-icon"><Icon /></span><h2>{title}</h2><p>{description}</p><Button variant="contained" onClick={() => navigate(route)}>Configure</Button></article>)}</section></main>;
}
