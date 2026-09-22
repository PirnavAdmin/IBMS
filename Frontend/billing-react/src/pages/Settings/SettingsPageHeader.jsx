import { ArrowBackOutlined } from '@mui/icons-material';
import { Button } from '@mui/material';
import { Link } from 'react-router-dom';
import './settings.css';

export function SettingsPageHeader({ title, description, children }) {
  return (
    <header className="settings-page-header settings-module-header">
      <div>
        <p className="settings-eyebrow">Settings / Administration</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="settings-actions">
        <Button className="settings-back-button" component={Link} to="/settings" variant="outlined" startIcon={<ArrowBackOutlined />}>
          Back to Settings
        </Button>
        {children}
      </div>
    </header>
  );
}
