import { useEffect, useRef, useState } from 'react';
import { SettingsPageHeader } from './SettingsPageHeader';
import { AddOutlined, EditOutlined } from '@mui/icons-material';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Select, Snackbar, Switch, TextField } from '@mui/material';
import { phase5Api } from './services/phase5Api';
import './settings.css';

const blankCharge = { name: '', code: '', type: 'Shipping', calculationType: 'Fixed', value: '', taxable: true, description: '', status: 'Active' };
const chargeTypes = ['Shipping', 'Handling', 'ConvenienceFee', 'LateFee', 'Custom'];
const validStatus = (status) => /^(active|inactive)$/i.test(status || '');
const validate = (charge) => {
  const errors = {};
  if (charge.name.trim().length < 2 || charge.name.trim().length > 128) errors.name = 'Charge name must be 2 to 128 characters.';
  if (charge.code.trim().length < 2 || charge.code.trim().length > 64) errors.code = 'Charge code must be 2 to 64 characters.';
  if (!charge.type) errors.type = 'Charge type is required.';
  if (!charge.calculationType) errors.calculationType = 'Calculation type is required.';
  if (charge.value === '' || !Number.isFinite(Number(charge.value)) || Number(charge.value) < 0 || Number(charge.value) > 99999999.99) errors.value = 'Enter a value from 0 to 99,999,999.99.';
  if (charge.calculationType === 'Percentage' && Number(charge.value) > 100) errors.value = 'Percentage cannot exceed 100.';
  if (!validStatus(charge.status)) errors.status = 'Select Active or Inactive.';
  if (charge.description.length > 500) errors.description = 'Description cannot exceed 500 characters.';
  return errors;
};
const displayValue = (charge) => charge.calculationType === 'Percentage' ? `${charge.value}%` : `₹${Number(charge.value).toLocaleString('en-IN')}`;

export function ChargesConfiguration() {
  const requestLock = useRef(false);
  const [charges, setCharges] = useState([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [apiError, setApiError] = useState(''); const [dialog, setDialog] = useState(null); const [form, setForm] = useState(blankCharge); const [errors, setErrors] = useState({}); const [confirm, setConfirm] = useState(null); const [toast, setToast] = useState('');
  const load = async () => { setLoading(true); setApiError(''); try { setCharges(await phase5Api.getCharges()); } catch (error) { setApiError(error.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const openNew = () => { setForm(blankCharge); setErrors({}); setApiError(''); setDialog('new'); };
  const openEdit = (charge) => { setForm({ ...charge }); setErrors({}); setApiError(''); setDialog('edit'); };
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    const nextErrors = validate(form); setErrors(nextErrors); if (Object.keys(nextErrors).length || requestLock.current) return;
    requestLock.current = true; setBusy(true); setApiError('');
    try { const result = dialog === 'new' ? await phase5Api.createCharge(form) : await phase5Api.updateCharge(form); setDialog(null); setToast(dialog === 'new' ? `${result.name} added.` : `${result.name} updated.`); await load(); }
    catch (error) { setApiError(error.message); }
    finally { requestLock.current = false; setBusy(false); }
  };
  const changeStatus = async () => {
    if (requestLock.current || !confirm) return;
    requestLock.current = true; setBusy(true); setApiError(''); const next = confirm.status === 'Active' ? 'Inactive' : 'Active';
    try { const result = await phase5Api.updateCharge({ ...confirm, status: next }); setConfirm(null); setToast(`${result.name} ${next === 'Active' ? 'activated' : 'deactivated'}.`); await load(); }
    catch (error) { setApiError(error.message); }
    finally { requestLock.current = false; setBusy(false); }
  };
  return <main className="settings-page"><SettingsPageHeader title="Charges Configuration" description="Configure charges for invoices."><Button variant="contained" startIcon={<AddOutlined />} onClick={openNew}>Add Charge</Button></SettingsPageHeader>
    {apiError && charges.length > 0 && !dialog && !confirm && <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>{apiError}</Alert>}
    <section className="settings-panel settings-full"><div className="settings-panel-heading"><div><h2>Configured Charges</h2><p>Shipping, handling, convenience, late fee, and custom charges.</p></div></div>{loading ? <div className="settings-empty">Loading charges...</div> : apiError && !charges.length ? <div className="settings-empty"><Alert severity="error">{apiError}</Alert><Button onClick={load}>Retry</Button></div> : charges.length ? <div className="settings-table-wrap"><table className="settings-table"><thead><tr><th>Charge Name</th><th>Charge Code</th><th>Charge Type</th><th>Calculation</th><th>Value</th><th>Taxable</th><th>Status</th><th>Actions</th></tr></thead><tbody>{charges.map((charge) => <tr key={charge.id}><td><strong>{charge.name}</strong><small className="settings-cell-note">{charge.description}</small></td><td>{charge.code}</td><td>{charge.type}</td><td>{charge.calculationType}</td><td>{displayValue(charge)}</td><td>{charge.taxable ? 'Yes' : 'No'}</td><td><span className={`settings-status ${charge.status === 'Active' ? 'active' : 'inactive'}`}>{validStatus(charge.status) ? charge.status : `Unknown (${charge.status || 'empty'})`}</span></td><td><div className="settings-row-actions"><Button size="small" startIcon={<EditOutlined />} onClick={() => openEdit(charge)}>Edit</Button><Button size="small" disabled={!validStatus(charge.status)} color={charge.status === 'Active' ? 'error' : 'primary'} onClick={() => { setApiError(''); setConfirm(charge); }}>{charge.status === 'Active' ? 'Deactivate' : 'Activate'}</Button></div></td></tr>)}</tbody></table></div> : <div className="settings-empty"><h2>No charges configured yet.</h2><p>Add a charge to begin defining your billing rules.</p><Button variant="contained" startIcon={<AddOutlined />} onClick={openNew}>Add Charge</Button></div>}</section>
    <Dialog open={Boolean(dialog)} onClose={() => { if (!busy) setDialog(null); }} fullWidth maxWidth="sm"><DialogTitle>{dialog === 'new' ? 'Add Charge' : 'Edit Charge'}</DialogTitle><DialogContent dividers><fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}><div className="settings-dialog-form"><TextField autoFocus required label="Charge Name" value={form.name} onChange={(e) => update('name', e.target.value)} error={Boolean(errors.name)} helperText={errors.name} /><TextField required label="Charge Code" value={form.code} onChange={(e) => update('code', e.target.value)} error={Boolean(errors.code)} helperText={errors.code} inputProps={{ maxLength: 64 }} /><div className="settings-select-field"><label htmlFor="charge-type">Charge Type *</label><Select id="charge-type" value={form.type} onChange={(e) => update('type', e.target.value)} error={Boolean(errors.type)}>{chargeTypes.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}</Select></div><div className="settings-select-field"><label htmlFor="calculation-type">Calculation Type *</label><Select id="calculation-type" value={form.calculationType} onChange={(e) => update('calculationType', e.target.value)}>{['Fixed', 'Percentage'].map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}</Select></div><TextField required label={`Value${form.calculationType === 'Percentage' ? ' (%)' : ' (₹)'}`} type="number" value={form.value} onChange={(e) => update('value', e.target.value)} error={Boolean(errors.value)} helperText={errors.value} inputProps={{ min: 0, max: form.calculationType === 'Percentage' ? 100 : undefined, step: 'any' }} /><div className="settings-toggle-field"><FormControlLabel control={<Switch checked={form.taxable} onChange={(e) => update('taxable', e.target.checked)} />} label="Taxable" /><div className="settings-select-field"><label htmlFor="charge-status">Status *</label><Select id="charge-status" value={form.status} onChange={(e) => update('status', e.target.value)} error={Boolean(errors.status)}>{!validStatus(form.status) && <MenuItem disabled value={form.status}>Unknown ({form.status || 'empty'})</MenuItem>}<MenuItem value="Active">Active</MenuItem><MenuItem value="Inactive">Inactive</MenuItem></Select>{errors.status && <span className="settings-field-error">{errors.status}</span>}</div></div>{!validStatus(form.status) && <Alert severity="warning">This record has an unsupported backend status. Select Active or Inactive before saving.</Alert>}<TextField className="settings-form-span" label="Description" multiline minRows={3} value={form.description} onChange={(e) => update('description', e.target.value)} error={Boolean(errors.description)} helperText={errors.description} /></div></fieldset>{apiError && <Alert severity="error" sx={{ mt: 2 }}>{apiError}</Alert>}</DialogContent><DialogActions><Button disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button variant="contained" disabled={busy} onClick={submit}>{busy ? 'Saving...' : dialog === 'new' ? 'Add Charge' : 'Save Changes'}</Button></DialogActions></Dialog>
    <Dialog open={Boolean(confirm)} onClose={() => { if (!busy) setConfirm(null); }} fullWidth maxWidth="xs"><DialogTitle>{confirm?.status === 'Active' ? 'Deactivate Charge?' : 'Activate Charge?'}</DialogTitle><DialogContent><p>{confirm?.status === 'Active' ? `Are you sure you want to deactivate ${confirm?.name}?` : `Activate ${confirm?.name}?`}</p>{apiError && <Alert severity="error">{apiError}</Alert>}</DialogContent><DialogActions><Button disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button><Button variant="contained" disabled={busy} color={confirm?.status === 'Active' ? 'error' : 'primary'} onClick={changeStatus}>{confirm?.status === 'Active' ? 'Deactivate' : 'Activate'}</Button></DialogActions></Dialog><Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast('')} message={toast} /></main>;
}
