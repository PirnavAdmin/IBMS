import './settings.css';

export function SettingsPageHeader({ title, description, children }) {
  return (
    <header className="settings-page-header settings-module-header">
      <div>
        <p className="settings-eyebrow">Settings / Administration</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="settings-actions">{children}</div>}
    </header>
  );
}
