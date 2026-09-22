import { useEffect, useRef, useState } from 'react';
import { SettingsPageHeader } from './SettingsPageHeader';
import { Alert, Button, MenuItem, Paper, Select, Snackbar, Switch, TextField } from '@mui/material';
import { LocalOfferOutlined, SaveOutlined, RestartAlt } from '@mui/icons-material';
import { DiscountRules } from './DiscountRules';
import { phase5Api, validateDiscountConfiguration, validateRolePermissions } from './services/phase5Api';
import './settings.css';

const blank = { status: 'Active', maximumType: 'Percentage', maximumValue: '', discountType: 'Percentage', applicationLevel: 'Invoice Level', allowLineLevel: false, allowInvoiceLevel: false, enforceMaximum: false, allowManualOverride: false, requireOverrideReason: false, minimumReasonLength: 1, rowVersion: null };
const SwitchRow = ({ label, help, checked, onChange, disabled = false }) => <div className="settings-switch-row"><div><strong>{label}</strong><small>{help}</small></div><Switch checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} disabled={disabled} inputProps={{ 'aria-label': label }} /></div>;
const validStatus = (status) => /^(active|inactive)$/i.test(status || '');

export function DiscountConfiguration() {
  const [loaded, setLoaded] = useState(false);
  const [config, setConfig] = useState(blank); const [saved, setSaved] = useState(blank);
  const [roles, setRoles] = useState([]); const [savedRoles, setSavedRoles] = useState([]);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [savingRoles, setSavingRoles] = useState(false);
  const [error, setError] = useState(''); const [toast, setToast] = useState('');
  const [previewReason, setPreviewReason] = useState(''); const [discountPreview, setDiscountPreview] = useState(''); const [preview, setPreview] = useState(null);
  const requestLock = useRef(false);
  const configErrors = validateDiscountConfiguration(config); const roleErrors = validateRolePermissions(roles);
  const dirty = JSON.stringify(config) !== JSON.stringify(saved); const rolesDirty = JSON.stringify(roles) !== JSON.stringify(savedRoles);
  const disabled = !loaded || loading || saving || savingRoles;
  const load = async () => {
    setLoading(true); setError('');
    try {
      const [nextConfig, nextRoles] = await Promise.all([phase5Api.getDiscountConfiguration(), phase5Api.getDiscountRolePermissions()]);
      setConfig(nextConfig); setSaved(nextConfig); setRoles(nextRoles); setSavedRoles(nextRoles); setLoaded(true);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!config.enforceMaximum || discountPreview === '' || !Number.isFinite(Number(discountPreview)) || Number(discountPreview) < 0) { setPreview(null); return undefined; }
    let active = true;
    const timer = setTimeout(() => {
      const role = roles.find((item) => item.canApply)?.role;
      phase5Api.validateMaximumDiscount({ role, value: discountPreview, discountType: config.discountType }).then((result) => { if (active) setPreview(result); }).catch((failure) => { if (active) setPreview({ isValid: false, message: failure.message }); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [config.discountType, config.enforceMaximum, discountPreview, roles]);
  const update = (key, value) => setConfig((current) => ({ ...current, [key]: value }));
  const updateRole = (id, key, value) => setRoles((current) => current.map((role) => role.id === id ? { ...role, [key]: value } : role));
  const save = async () => {
    if (Object.keys(configErrors).length || requestLock.current) return;
    requestLock.current = true; setSaving(true); setError('');
    try { const next = await phase5Api.updateDiscountConfiguration(config); setConfig(next); setSaved(next); setToast('Discount configuration saved.'); }
    catch (failure) { setError(failure.message); }
    finally { requestLock.current = false; setSaving(false); }
  };
  const saveRoles = async () => {
    if (Object.keys(roleErrors).length || requestLock.current) return;
    requestLock.current = true; setSavingRoles(true); setError('');
    try { const next = await phase5Api.updateDiscountRolePermissions(roles); setRoles(next); setSavedRoles(next); setToast('Role permissions saved.'); }
    catch (failure) { setError(failure.message); }
    finally { requestLock.current = false; setSavingRoles(false); }
  };
  const previewInvalid = Boolean(preview && !preview.isValid);
  return <main className="settings-page"><SettingsPageHeader title="Discount Configuration" description="Control discount limits and who can apply or override them."><Button variant="outlined" startIcon={<RestartAlt />} disabled={disabled || !dirty} onClick={() => setConfig(saved)}>Reset</Button><Button variant="contained" startIcon={<SaveOutlined />} disabled={disabled || !dirty || Object.keys(configErrors).length > 0} onClick={save}>{saving ? 'Saving...' : 'Save Changes'}</Button></SettingsPageHeader>
    {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button disabled={loading || saving || savingRoles} onClick={load}>Retry</Button>}>{error}</Alert>}
    {loading ? <div className="settings-empty">Loading discount configuration...</div> : <><section className="settings-layout"><Paper className="settings-panel" elevation={0}><div className="settings-panel-heading"><LocalOfferOutlined /><div><h2>Maximum Discount Rules</h2><p>The organization-wide cap for discounts entered by billing users.</p></div></div><div className="settings-form-grid"><TextField disabled={disabled} select label="Maximum Discount Type" value={config.maximumType} onChange={(e) => update('maximumType', e.target.value)}><MenuItem value="Percentage">Percentage</MenuItem><MenuItem value="Fixed Amount">Fixed Amount</MenuItem></TextField><TextField disabled={disabled} label={`Maximum Discount Value${config.maximumType === 'Percentage' ? ' (%)' : ' (₹)'}`} type="number" value={config.maximumValue} onChange={(e) => update('maximumValue', e.target.value)} error={Boolean(configErrors.maximumValue)} helperText={configErrors.maximumValue || `Configured maximum: ${config.maximumType === 'Percentage' ? `${config.maximumValue}%` : `₹${config.maximumValue}`}`} inputProps={{ min: 0, max: config.maximumType === 'Percentage' ? 100 : undefined, step: 'any' }} /><div className="settings-select-field"><label htmlFor="discount-status">Configuration status</label><Select disabled={disabled} id="discount-status" value={config.status} onChange={(e) => update('status', e.target.value)}>{!validStatus(config.status) && <MenuItem disabled value={config.status}>Unknown ({config.status || 'empty'})</MenuItem>}<MenuItem value="Active">Active</MenuItem><MenuItem value="Inactive">Inactive</MenuItem></Select>{configErrors.status && <span className="settings-field-error">{configErrors.status}</span>}</div></div></Paper>
    <Paper className="settings-panel" elevation={0}><div className="settings-panel-heading"><div><h2>Discount Rule Controls</h2><p>Choose which discount methods are available while creating an invoice.</p></div></div><div className="settings-form-grid"><div className="settings-select-field"><label htmlFor="discount-type">Discount type</label><Select disabled={disabled} id="discount-type" value={config.discountType} onChange={(e) => update('discountType', e.target.value)}><MenuItem value="Fixed">Fixed</MenuItem><MenuItem value="Percentage">Percentage</MenuItem></Select></div><div className="settings-select-field"><label htmlFor="application-level">Default application level</label><Select disabled={disabled} id="application-level" value={config.applicationLevel} onChange={(e) => update('applicationLevel', e.target.value)}><MenuItem value="Line Level">Line Level</MenuItem><MenuItem value="Invoice Level">Invoice Level</MenuItem></Select></div></div><div className="settings-switch-list"><SwitchRow disabled={disabled} label="Allow line-level discount" help="Lets users discount an individual invoice item." checked={config.allowLineLevel} onChange={(value) => update('allowLineLevel', value)} /><SwitchRow disabled={disabled} label="Allow invoice-level discount" help="Lets users discount the total invoice." checked={config.allowInvoiceLevel} onChange={(value) => update('allowInvoiceLevel', value)} /><SwitchRow disabled={disabled} label="Enforce maximum discount" help="Blocks values that exceed the configured organization maximum." checked={config.enforceMaximum} onChange={(value) => update('enforceMaximum', value)} /></div>{config.enforceMaximum && <TextField disabled={disabled} className="settings-preview-input" label={`Discount validation preview (${config.maximumType === 'Percentage' ? '%' : '₹'})`} type="number" value={discountPreview} onChange={(e) => setDiscountPreview(e.target.value)} error={previewInvalid} helperText={preview?.message || 'Enter a value to validate against the backend maximum.'} inputProps={{ min: 0, step: 'any' }} />}</Paper>
    <Paper className="settings-panel settings-full" elevation={0}><div className="settings-panel-heading"><div><h2>Role Permissions</h2><p>Configure which backend roles may apply or override discounts.</p></div><Button variant="contained" disabled={disabled || !rolesDirty || Object.keys(roleErrors).length > 0} onClick={saveRoles}>{savingRoles ? 'Saving...' : 'Save Role Permissions'}</Button></div><div className="settings-table-wrap"><table className="settings-table"><thead><tr><th>Role</th><th>Can Apply Discount</th><th>Maximum Allowed</th><th>Can Override Maximum</th><th>Requires Override Reason</th><th>Status</th></tr></thead><tbody>{roles.map((role) => <tr key={role.id}><td><strong>{role.role}</strong></td><td><Switch disabled={disabled} checked={role.canApply} onChange={(e) => updateRole(role.id, 'canApply', e.target.checked)} /></td><td><TextField disabled={disabled || !role.canApply} size="small" type="number" value={role.maximum} error={Boolean(roleErrors[role.id])} helperText={roleErrors[role.id]} onChange={(e) => updateRole(role.id, 'maximum', e.target.value)} inputProps={{ min: 0, step: 'any' }} /></td><td><Switch disabled={disabled || !role.canApply} checked={role.canOverride} onChange={(e) => updateRole(role.id, 'canOverride', e.target.checked)} /></td><td><Switch disabled={disabled || !role.canApply || !role.canOverride} checked={role.requiresReason} onChange={(e) => updateRole(role.id, 'requiresReason', e.target.checked)} /></td><td><span className={`settings-status ${role.status === 'Active' ? 'active' : 'inactive'}`}>{role.status}</span></td></tr>)}</tbody></table></div></Paper>
    <Paper className="settings-panel settings-full" elevation={0}><div className="settings-panel-heading"><div><h2>Manual Discount Rules / Overrides</h2><p>Define the safeguards used when an authorized user exceeds the usual limit.</p></div></div><div className="settings-switch-list"><SwitchRow disabled={disabled} label="Allow manual override" help="Lets permitted roles exceed the configured maximum." checked={config.allowManualOverride} onChange={(value) => update('allowManualOverride', value)} /><SwitchRow disabled={disabled || !config.allowManualOverride} label="Require override reason" help="Records a reason whenever an override is used." checked={config.requireOverrideReason} onChange={(value) => update('requireOverrideReason', value)} /></div>{config.allowManualOverride && <div className="settings-form-grid settings-preview"><TextField disabled={disabled || !config.requireOverrideReason} label="Minimum reason length" type="number" value={config.minimumReasonLength} onChange={(e) => update('minimumReasonLength', e.target.value)} error={Boolean(configErrors.minimumReasonLength)} helperText={configErrors.minimumReasonLength} inputProps={{ min: 1, step: 1 }} /><TextField disabled={disabled || !config.requireOverrideReason} label="Override Reason (preview)" placeholder="Enter reason for exceeding configured discount limit" value={previewReason} onChange={(e) => setPreviewReason(e.target.value)} error={config.requireOverrideReason && previewReason.length > 0 && previewReason.length < Number(config.minimumReasonLength)} helperText={config.requireOverrideReason ? `At least ${config.minimumReasonLength} characters required.` : ''} /></div>}</Paper></section><DiscountRules /></>}<Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast('')} message={toast} /></main>;
}
