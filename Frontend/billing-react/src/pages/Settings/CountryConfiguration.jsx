import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Alert,
  Button,
  Checkbox,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  PublicOutlined,
  SaveOutlined,
  SearchOutlined,
  Close,
  DoneAllOutlined,
  RemoveDoneOutlined,
  ArrowBackOutlined,
  CheckCircle,
  FlagOutlined,
  PhoneOutlined,
  MonetizationOnOutlined,
} from '@mui/icons-material';
import { SettingsPageHeader } from './SettingsPageHeader';
import { errorPresentation } from '../../utils/errorPresentation';
import { CountryFlag } from '../../components/CountryFlag';
import { DashboardErrorState } from '../../components/dashboard/DashboardStates';
import {
  useRegionalSettings,
  countrySelectionError,
  getRegionalSessionScope,
  BILLING_COUNTRIES_LIST as COUNTRIES_LIST,
} from '../../services/regionalSettingsService';
import './settings.css';

export function CountryConfiguration() {
  const navigate = useNavigate();
  const {
    selectedCountries: persistedCountries,
    saveCountries,
    sessionScope, loading, loaded, error, reloadCountries,
  } = useRegionalSettings();

  const [draft, setDraft] = useState({ scope: sessionScope, countries: persistedCountries });
  const selectedCountries = draft.scope === sessionScope ? draft.countries : [];
  const setSelectedCountries = update => setDraft(current => ({
    scope: sessionScope,
    countries: typeof update === 'function' ? update(current.scope === sessionScope ? current.countries : []) : update,
  }));
  const ready = loaded && draft.scope === sessionScope;
  const validationError = countrySelectionError(selectedCountries);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const saveLock = useRef(false);

  // Sync with persisted settings on mount / change
  useEffect(() => {
    setDraft({ scope: sessionScope, countries: persistedCountries });
    setSaveError('');
  }, [persistedCountries, sessionScope]);

  const selectedCodes = useMemo(
    () => new Set(selectedCountries.map((c) => c.code)),
    [selectedCountries]
  );

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES_LIST;
    return COUNTRIES_LIST.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.phoneCode.toLowerCase().includes(q) ||
        c.currency.toLowerCase().includes(q)
    );
  }, [search]);

  const handleToggleCountry = (country) => {
    if (!ready || saving) return;
    setSelectedCountries((current) => {
      const exists = current.some((c) => c.code === country.code);
      if (exists) {
        return current.filter((c) => c.code !== country.code);
      }
      return [...current, country];
    });
  };

  const handleRemoveCountry = (countryCode) => {
    setSelectedCountries((current) => current.filter((c) => c.code !== countryCode));
  };

  const handleSelectAll = () => {
    setSelectedCountries([...COUNTRIES_LIST]);
  };

  const handleClearAll = () => {
    setSelectedCountries([]);
  };

  const handleSave = async () => {
    if (saveLock.current || !ready || sessionScope !== getRegionalSessionScope()) return;
    if (validationError) { setSaveError(validationError); return; }
    saveLock.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const result = await saveCountries(selectedCountries);
      if (sessionScope !== getRegionalSessionScope()) return;
      navigate('/settings', { state: { countrySaved: result.message || 'Country configuration saved successfully.' } });
    } catch (err) {
      if (sessionScope === getRegionalSessionScope()) setSaveError(errorPresentation(err.userMessage || err.message));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const defaultCountry = selectedCountries.length > 0 ? selectedCountries[0] : null;

  return (
    <main className="settings-page country-config-page">
      <SettingsPageHeader
        title="Country Configuration"
        description="Select the countries available for your application. Default phone calling codes and currencies are automatically derived."
      >
        <Button
          variant="contained"
          startIcon={<SaveOutlined />}
          disabled={saving || !ready || Boolean(validationError)}
          onClick={handleSave}
          className="country-save-header-btn"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </SettingsPageHeader>

      {loading && <Alert severity="info" role="status" sx={{ mb: 2 }}>Loading saved country settings...</Alert>}
      {error && <DashboardErrorState title="Unable to load country settings" message={error.userMessage || error.message} onRetry={reloadCountries} />}
      {saveError && <DashboardErrorState title="Unable to save country settings" message={saveError} onRetry={handleSave} />}
      {ready && validationError && <Alert severity="warning" sx={{ mb: 2 }}>{validationError}</Alert>}
      {ready && <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>

      {/* UPSIDE: Selected Countries Section */}
      <section className="country-selected-shelf" aria-label="Currently selected countries">
        <div className="country-shelf-header">
          <div className="country-shelf-title-wrap">
            <span className="country-shelf-icon" aria-hidden="true">
              <PublicOutlined />
            </span>
            <div>
              <h2>Selected Countries</h2>
              <span className="country-shelf-count-badge">
                {selectedCountries.length} {selectedCountries.length === 1 ? 'country' : 'countries'} selected
              </span>
            </div>
          </div>
          {selectedCountries.length > 0 && (
            <Button
              size="small"
              variant="text"
              color="inherit"
              startIcon={<RemoveDoneOutlined />}
              onClick={handleClearAll}
              className="country-clear-btn"
            >
              Clear All
            </Button>
          )}
        </div>

        {selectedCountries.length > 0 ? (
          <div className="country-chips-grid">
            {selectedCountries.map((c, index) => (
              <div key={c.code} className="country-selected-chip">
                <span className="country-chip-flag" aria-hidden="true">
                  <CountryFlag code={c.code} name={c.name} width={22} height={16} />
                </span>
                <div className="country-chip-info">
                  <span className="country-chip-name">{c.name}</span>
                  <div className="country-chip-meta">
                    <span className="country-chip-phone">{c.phoneCode}</span>
                    <span className="country-chip-dot">•</span>
                    <span className="country-chip-currency">{c.currency} ({c.currencySymbol})</span>
                  </div>
                </div>
                {index === 0 && (
                  <span className="country-primary-badge" >
                    Default
                  </span>
                )}
                <button
                  type="button"
                  className="country-chip-remove"
                  onClick={() => handleRemoveCountry(c.code)}
                  aria-label={`Remove ${c.name}`}
                >
                  <Close style={{ fontSize: '15px' }} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="country-shelf-empty">
            <PublicOutlined className="country-empty-icon" />
            <div>
              <p className="country-empty-title">No countries selected</p>
              <p className="country-empty-text">
                Check the boxes next to countries below to activate them for customer addresses, calling codes, and billing defaults.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* MAIN LAYOUT: List with Checkboxes on the Left, Quick Card beside on the Right */}
      <div className="country-config-layout">
        {/* LEFT COLUMN: Complete Countries List with Checkboxes */}
        <section className="country-list-section" aria-label="Available countries">
          <div className="country-list-card">
            <div className="country-list-toolbar">
              <TextField
                size="small"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country by name, code, or calling code..."
                className="country-search-field"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlined style={{ color: '#8c7a6e', fontSize: '20px' }} />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8c7a6e' }}
                        aria-label="Clear search"
                      >
                        <Close style={{ fontSize: '18px' }} />
                      </button>
                    </InputAdornment>
                  ) : null,
                }}
              />

              <div className="country-list-actions">
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<DoneAllOutlined />}
                  onClick={handleSelectAll}
                  className="country-tool-btn"
                >
                  Select All
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RemoveDoneOutlined />}
                  onClick={handleClearAll}
                  disabled={selectedCountries.length === 0}
                  className="country-tool-btn"
                >
                  Deselect All
                </Button>
              </div>
            </div>

            <div className="country-list-scroll" role="region" aria-label="Scrollable country details" tabIndex={0}>
            <div className="country-items-header">
              <span>Select</span>
              <span>Country</span>
              <span>Calling Code</span>
              <span>Currency</span>
              <span>Status</span>
            </div>

            <div className="country-items-list" role="list">
              {filteredCountries.map((c) => {
                const isSelected = selectedCodes.has(c.code);
                return (
                  <div
                    key={c.code}
                    role="listitem"
                    className={`country-item-row ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => handleToggleCountry(c)}
                  >
                    {/* Checkbox beside country */}
                    <div className="country-col-check" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleToggleCountry(c)}
                        inputProps={{ 'aria-label': `Select ${c.name}` }}
                        sx={{
                          color: '#b58b66',
                          '&.Mui-checked': {
                            color: '#582407',
                          },
                        }}
                      />
                    </div>

                    {/* Flag and Name */}
                    <div className="country-col-name">
                      <span className="country-flag-icon" aria-hidden="true">
                        <CountryFlag code={c.code} name={c.name} width={26} height={19} />
                      </span>
                      <div className="country-name-wrap">
                        <span className="country-full-name">{c.name}</span>
                        <span className="country-iso-code">{c.code}</span>
                      </div>
                    </div>

                    {/* Calling Code */}
                    <div className="country-col-phone">
                      <span className="country-phone-tag">{c.phoneCode}</span>
                    </div>

                    {/* Currency */}
                    <div className="country-col-currency">
                      <span className="country-currency-tag">
                        {c.currency} ({c.currencySymbol})
                      </span>
                    </div>

                    {/* Status */}
                    <div className="country-col-status">
                      {isSelected ? (
                        <span className="country-status-pill pill-active">
                          <CheckCircle style={{ fontSize: '14px' }} /> Active
                        </span>
                      ) : (
                        <span className="country-status-pill pill-inactive">
                          Disabled
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredCountries.length === 0 && (
                <div className="country-list-no-match">
                  <p>No countries found matching "{search}"</p>
                  <Button size="small" onClick={() => setSearch('')}>
                    Clear Filter
                  </Button>
                </div>
              )}
            </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Quick Card beside the list */}
        <aside className="country-quick-card" aria-label="Country Settings Quick Card">
          <div className="quick-card-inner">
            <div className="quick-card-header">
              <span className="quick-card-badge-icon" aria-hidden="true">
                <PublicOutlined />
              </span>
              <div>
                <h3>Country Quick Card</h3>
                <p>Live active configuration</p>
              </div>
            </div>

            <div className="quick-card-stat-box">
              <div className="quick-stat-item">
                <span className="quick-stat-label">Total Countries</span>
                <span className="quick-stat-val">{COUNTRIES_LIST.length}</span>
              </div>
              <div className="quick-stat-divider" />
              <div className="quick-stat-item">
                <span className="quick-stat-label">Active / Selected</span>
                <span className="quick-stat-val val-highlight">{selectedCountries.length}</span>
              </div>
            </div>

            <div className="quick-card-section">
              <label className="quick-section-label">
                <FlagOutlined style={{ fontSize: '16px' }} /> Primary Default Country
              </label>
              {defaultCountry ? (
                <div className="quick-default-country-box">
                  <CountryFlag
                    code={defaultCountry.code}
                    name={defaultCountry.name}
                    width={24}
                    height={17}
                  />
                  <div className="quick-default-info">
                    <strong>{defaultCountry.name}</strong>
                    <small>Default calling code: {defaultCountry.phoneCode} • Currency: {defaultCountry.currency} ({defaultCountry.currencySymbol})</small>
                  </div>
                </div>
              ) : (
                <p className="quick-none-hint">No default country active.</p>
              )}
            </div>

            <div className="quick-card-section">
              <label className="quick-section-label">
                <PhoneOutlined style={{ fontSize: '16px' }} /> Active Calling Codes
              </label>
              <div className="quick-pills-wrap">
                {selectedCountries.length > 0 ? (
                  Array.from(new Set(selectedCountries.map((c) => c.phoneCode))).map((code) => (
                    <span key={code} className="quick-mini-pill">
                      {code}
                    </span>
                  ))
                ) : (
                  <span className="quick-none-hint">None</span>
                )}
              </div>
            </div>

            <div className="quick-card-section">
              <label className="quick-section-label">
                <MonetizationOnOutlined style={{ fontSize: '16px' }} /> Active Currencies
              </label>
              <div className="quick-pills-wrap">
                {selectedCountries.length > 0 ? (
                  Array.from(new Set(selectedCountries.map((c) => c.currency))).map((curr) => (
                    <span key={curr} className="quick-mini-pill">
                      {curr}
                    </span>
                  ))
                ) : (
                  <span className="quick-none-hint">None</span>
                )}
              </div>
            </div>

            <div className="quick-card-actions">
              <Button
                variant="contained"
                fullWidth
                startIcon={<SaveOutlined />}
                disabled={saving || !ready || Boolean(validationError)}
                onClick={handleSave}
                className="quick-save-btn"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
              <Button
                variant="outlined"
                fullWidth
                component={Link}
                to="/settings"
                startIcon={<ArrowBackOutlined />}
                className="quick-back-btn"
              >
                Back to Settings
              </Button>
            </div>
          </div>
        </aside>
      </div>

      </fieldset>}

    </main>
  );
}

export default CountryConfiguration;
