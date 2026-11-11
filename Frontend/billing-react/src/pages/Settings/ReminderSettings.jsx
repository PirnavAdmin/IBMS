import { useCallback, useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import EventRepeatOutlined from '@mui/icons-material/EventRepeatOutlined';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import { apiClient, getUserFriendlyError } from 'billing-api-client';
import { SettingsPageHeader } from './SettingsPageHeader';
import { DashboardErrorState } from '../../components/dashboard/DashboardStates';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { errorPresentation } from '../../utils/errorPresentation';
import './settings.css';

export const DEFAULT_REMINDER_SETTINGS = {
  partialPaymentReminderEnabled: true,
  partialPaymentIntervalValue: 7,
  partialPaymentIntervalUnit: 'Days',
  overdueReminderEnabled: true,
  overdueReminderIntervalDays: 1,
  upcomingDueReminderEnabled: true,
};

function unwrap(response) {
  if (response?.success !== true) {
    throw new Error(response?.message || 'Unable to process reminder settings request.');
  }
  return response.data;
}

export function normalizeReminderSettings(data = {}) {
  return {
    partialPaymentReminderEnabled: Boolean(data.partialPaymentReminderEnabled ?? true),
    partialPaymentIntervalValue: Number(data.partialPaymentIntervalValue ?? 7),
    partialPaymentIntervalUnit: data.partialPaymentIntervalUnit || 'Days',
    overdueReminderEnabled: Boolean(data.overdueReminderEnabled ?? true),
    overdueReminderIntervalDays: Number(data.overdueReminderIntervalDays ?? 1),
    upcomingDueReminderEnabled: Boolean(data.upcomingDueReminderEnabled ?? true),
    updatedAtUtc: data.updatedAtUtc || null,
    updatedBy: data.updatedBy || null,
  };
}

export function validateReminderSettings(form) {
  const errors = {};
  const unit = form.partialPaymentIntervalUnit || 'Days';
  const maxPartial = unit === 'Minutes' ? 525600 : unit === 'Hours' ? 720 : 365;
  const partialVal = Number(form.partialPaymentIntervalValue);

  if (!Number.isInteger(partialVal) || partialVal < 1 || partialVal > maxPartial) {
    errors.partialPaymentIntervalValue = `Enter a whole number between 1 and ${maxPartial} ${unit.toLowerCase()}.`;
  }

  const overdueDays = Number(form.overdueReminderIntervalDays);
  if (!Number.isInteger(overdueDays) || overdueDays < 1 || overdueDays > 365) {
    errors.overdueReminderIntervalDays = 'Enter a whole number between 1 and 365 days.';
  }

  return errors;
}

export const reminderService = {
  async getSettings({ signal } = {}) {
    const response = await apiClient.get('/api/v1/settings/reminders', { signal });
    return normalizeReminderSettings(unwrap(response));
  },
  async updateSettings(payload) {
    const body = {
      partialPaymentReminderEnabled: Boolean(payload.partialPaymentReminderEnabled),
      partialPaymentIntervalValue: Number(payload.partialPaymentIntervalValue),
      partialPaymentIntervalUnit: payload.partialPaymentIntervalUnit || 'Days',
      overdueReminderEnabled: Boolean(payload.overdueReminderEnabled),
      overdueReminderIntervalDays: Number(payload.overdueReminderIntervalDays),
      upcomingDueReminderEnabled: Boolean(payload.upcomingDueReminderEnabled),
    };
    const response = await apiClient.put('/api/v1/settings/reminders', body);
    return normalizeReminderSettings(unwrap(response));
  },
};

export function ReminderSettings() {
  const [form, setForm] = useState(DEFAULT_REMINDER_SETTINGS);
  const [saved, setSaved] = useState(DEFAULT_REMINDER_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [toast, setToast] = useState('');
  const saveLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setSaveError('');
    try {
      const data = await reminderService.getSettings();
      setForm(data);
      setSaved(data);
      setLoaded(true);
    } catch (err) {
      setLoadError(errorPresentation(err?.userMessage || (err?.response ? getUserFriendlyError(err) : err?.message)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const errors = validateReminderSettings(form);
  const hasValidationErrors = Object.keys(errors).length > 0;
  const dirty =
    form.partialPaymentReminderEnabled !== saved.partialPaymentReminderEnabled ||
    Number(form.partialPaymentIntervalValue) !== Number(saved.partialPaymentIntervalValue) ||
    form.partialPaymentIntervalUnit !== saved.partialPaymentIntervalUnit ||
    form.overdueReminderEnabled !== saved.overdueReminderEnabled ||
    Number(form.overdueReminderIntervalDays) !== Number(saved.overdueReminderIntervalDays) ||
    form.upcomingDueReminderEnabled !== saved.upcomingDueReminderEnabled;

  const updateField = (key, value) => {
    setSaveError('');
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    if (saveLock.current || !loaded || hasValidationErrors) return;
    saveLock.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const updated = await reminderService.updateSettings(form);
      setForm(updated);
      setSaved(updated);
      setToast('Reminder settings saved successfully.');
    } catch (err) {
      setSaveError(errorPresentation(err?.userMessage || (err?.response ? getUserFriendlyError(err) : err?.message)));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const partialSummary = form.partialPaymentReminderEnabled
    ? `Customers on sent partial-payment-accepted invoices will be reminded every ${form.partialPaymentIntervalValue} ${form.partialPaymentIntervalUnit === 'Days' && Number(form.partialPaymentIntervalValue) === 1 ? 'day' : form.partialPaymentIntervalUnit.toLowerCase()} until the full balance is paid.`
    : 'Automated partial payment reminders are currently disabled.';

  const overdueSummary = form.overdueReminderEnabled
    ? Number(form.overdueReminderIntervalDays) === 1
      ? 'Customers with overdue invoices will be reminded every day after the due date until paid.'
      : `Customers with overdue invoices will be reminded every ${form.overdueReminderIntervalDays} days after the due date until paid.`
    : 'Automated after-due-date overdue reminders are currently disabled.';

  return (
    <main className="settings-page">
      <SettingsPageHeader
        title="Payment Reminders"
        description="Configure automated reminder schedules for partial-payment invoices and overdue balances."
      >
        <Button
          variant="contained"
          startIcon={<SaveOutlined />}
          disabled={!loaded || loading || saving || hasValidationErrors || !dirty}
          onClick={handleSave}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </SettingsPageHeader>

      {loadError ? (
        <DashboardErrorState title="Unable to load reminder settings" message={loadError} onRetry={load} />
      ) : loading ? (
        <section className="settings-panel settings-full">
          <div className="settings-empty">Loading reminder settings...</div>
        </section>
      ) : (
        <div className="settings-layout">
          <section className="settings-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="settings-panel-heading">
              <EventRepeatOutlined />
              <div>
                <h2>Partial Payment Reminders</h2>
                <p>Remind customers who accept partial payments until their full invoice balance is received.</p>
              </div>
            </div>

            <div className="settings-switch-list">
              <div className="settings-switch-row">
                <div>
                  <strong>Enable partial payment reminders</strong>
                  <small>Applies to sent invoices with Partial payment accepted until the balance reaches zero.</small>
                </div>
                <Switch
                  checked={Boolean(form.partialPaymentReminderEnabled)}
                  onChange={(e) => updateField('partialPaymentReminderEnabled', e.target.checked)}
                  disabled={saving}
                  inputProps={{ 'aria-label': 'Enable partial payment reminders' }}
                />
              </div>
            </div>

            <div className="settings-form-grid" style={{ marginTop: 18, alignItems: 'start' }}>
              <TextField
                fullWidth
                label="Repeat Every"
                type="number"
                value={form.partialPaymentIntervalValue}
                disabled={!form.partialPaymentReminderEnabled || saving}
                onChange={(e) => updateField('partialPaymentIntervalValue', e.target.value === '' ? '' : Number(e.target.value))}
                error={Boolean(errors.partialPaymentIntervalValue)}
                helperText={errors.partialPaymentIntervalValue || 'Default: 7'}
                inputProps={{ min: 1, max: 525600, step: 1, 'aria-label': 'Partial payment interval value' }}
              />
              <TextField
                fullWidth
                select
                id="partial-interval-unit"
                label="Interval Unit"
                value={form.partialPaymentIntervalUnit}
                disabled={!form.partialPaymentReminderEnabled || saving}
                onChange={(e) => updateField('partialPaymentIntervalUnit', e.target.value)}
                helperText="Default: Days"
                SelectProps={{ inputProps: { 'aria-label': 'Partial payment interval unit' } }}
              >
                <MenuItem value="Days">Days</MenuItem>
                <MenuItem value="Hours">Hours</MenuItem>
                <MenuItem value="Minutes">Minutes</MenuItem>
              </TextField>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 16 }}>
              <Alert severity={form.partialPaymentReminderEnabled ? 'info' : 'warning'} className="settings-inline-alert" style={{ marginTop: 0 }}>
                {partialSummary}
              </Alert>
            </div>
          </section>

          <section className="settings-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="settings-panel-heading">
              <NotificationsActiveOutlined />
              <div>
                <h2>Due Date &amp; Overdue Reminders</h2>
                <p>Control reminder emails before due dates and after invoices become overdue.</p>
              </div>
            </div>

            <div className="settings-switch-list">
              <div className="settings-switch-row">
                <div>
                  <strong>Remind every N days after due date (Overdue)</strong>
                  <small>Set interval to 1 day to send an overdue reminder every day after the due date.</small>
                </div>
                <Switch
                  checked={Boolean(form.overdueReminderEnabled)}
                  onChange={(e) => updateField('overdueReminderEnabled', e.target.checked)}
                  disabled={saving}
                  inputProps={{ 'aria-label': 'Remind after due date' }}
                />
              </div>

              <div className="settings-switch-row">
                <div>
                  <strong>Upcoming &amp; due-date reminders</strong>
                  <small>Send automated reminders 3 days before, 1 day before, and on the invoice due date.</small>
                </div>
                <Switch
                  checked={Boolean(form.upcomingDueReminderEnabled)}
                  onChange={(e) => updateField('upcomingDueReminderEnabled', e.target.checked)}
                  disabled={saving}
                  inputProps={{ 'aria-label': 'Upcoming due-date reminders' }}
                />
              </div>
            </div>

            <div className="settings-form-grid" style={{ marginTop: 18, alignItems: 'start' }}>
              <TextField
                fullWidth
                label="Overdue Repeat Interval (Days)"
                type="number"
                value={form.overdueReminderIntervalDays}
                disabled={!form.overdueReminderEnabled || saving}
                onChange={(e) => updateField('overdueReminderIntervalDays', e.target.value === '' ? '' : Number(e.target.value))}
                error={Boolean(errors.overdueReminderIntervalDays)}
                helperText={errors.overdueReminderIntervalDays || 'Set 1 for daily overdue reminders'}
                inputProps={{ min: 1, max: 365, step: 1, 'aria-label': 'Overdue interval days' }}
                className="settings-form-span"
              />
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 16 }}>
              <Alert severity={form.overdueReminderEnabled ? 'info' : 'warning'} className="settings-inline-alert" style={{ marginTop: 0 }}>
                {overdueSummary}
              </Alert>
            </div>
          </section>

          <section className="settings-panel settings-full">
            <Alert severity="info">
              <strong>Online Payment Link Sync:</strong> Every reminder email automatically respects the{' '}
              <strong>Include Pay Now Online button</strong> choice selected when the invoice was sent — invoices sent with online payment ON keep the button in reminders, and invoices sent with it OFF omit the Pay Now button in reminders too.
            </Alert>
            {saveError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {saveError}
              </Alert>
            )}
          </section>
        </div>
      )}

      <FeedbackSnackbar message={toast} onClose={() => setToast('')} />
    </main>
  );
}
export default ReminderSettings;
