import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Snackbar, TextField } from '@mui/material';
import { discountScopes, discountTypes, phase5Api, validateDiscountRule } from './services/phase5Api.js';

const blank = { name: '', code: '', description: '', type: 'Percentage', scope: 'Invoice', value: '', minInvoiceAmount: '', maxDiscountAmount: '', startDateUtc: '', endDateUtc: '', applicableRole: '', status: 'Active' };

export function DiscountRules() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    phase5Api.getDiscountRules(page, 10).then((data) => {
      if (!active) return;
      if (!Array.isArray(data?.items)) throw new Error('The backend returned an unexpected rule list.');
      if (page > 1 && !data.items.length) { setPage(page - 1); return; }
      setResult(data);
    }).catch((failure) => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, revision]);
  const open = (rule = blank) => { const next = { ...blank, ...rule }; setForm(next); setBaseline(next); setFormError(''); };
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const errors = form ? validateDiscountRule(form) : {};
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const mutate = async (operation, message) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setFormError('');
    try {
      await operation();
      setForm(null); setConfirm(null); setToast(message); setRevision((value) => value + 1);
    } catch (failure) { setFormError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Paper className="settings-panel settings-full" elevation={0} sx={{ mb: 2 }}>
    <div className="settings-panel-heading"><div><h2>Discount Rules</h2><p>Manage individual discount codes and their limits. These rules do not configure organization-wide permissions.</p></div><Button variant="contained" disabled={busy} onClick={() => open()}>Add Rule</Button></div>
    {error && <Alert severity="error" action={<Button onClick={() => setRevision((value) => value + 1)}>Retry</Button>}>{error}</Alert>}
    {loading ? <div className="settings-empty">Loading discount rules...</div> : !error && (result.items.length ? <>
      <div className="settings-table-wrap"><table className="settings-table"><thead><tr><th>Name / Code</th><th>Type</th><th>Application Level</th><th>Value</th><th>Maximum Amount</th><th>Applicable Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {result.items.map((rule) => <tr key={rule.id}><td><strong>{rule.name}</strong><small className="settings-cell-note">{rule.code}</small></td><td>{discountTypes[rule.type] || rule.type}</td><td>{discountScopes[rule.scope] || rule.scope}</td><td>{rule.value}{rule.type === 'Percentage' ? '%' : ''}</td><td>{rule.maxDiscountAmount ?? 'Not set'}</td><td>{rule.applicableRole || 'Not restricted'}</td><td>{rule.status}</td><td><Button disabled={busy} onClick={() => open(rule)}>Edit</Button><Button color="error" disabled={busy} onClick={() => { setConfirm(rule); setFormError(''); }}>Delete</Button></td></tr>)}
      </tbody></table></div><div className="settings-actions"><Button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {result.totalPages}</span><Button disabled={page >= result.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div>
    </> : <div className="settings-empty">No discount rules configured yet.</div>)}
    <Dialog open={Boolean(form)} onClose={() => { if (!busy) setForm(null); }} fullWidth maxWidth="sm"><DialogTitle>{form?.id ? 'Edit Discount Rule' : 'Add Discount Rule'}</DialogTitle><DialogContent dividers>
      {form && <div className="settings-dialog-form">
        {['name', 'code'].map((key) => <TextField key={key} required label={key === 'name' ? 'Rule Name' : 'Rule Code'} value={form[key]} disabled={busy || (key === 'code' && Boolean(form.id))} onChange={(e) => update(key, e.target.value)} error={Boolean(errors[key])} helperText={errors[key]} />)}
        {[['type', 'Discount Type', discountTypes], ['scope', 'Application Level', discountScopes]].map(([key, label, choices]) => <TextField key={key} select label={label} value={form[key]} disabled={busy || Boolean(form.id)} onChange={(e) => update(key, e.target.value)}>{Object.entries(choices).map(([value, text]) => <MenuItem key={value} value={value}>{text}</MenuItem>)}</TextField>)}
        {[['value', 'Value'], ['minInvoiceAmount', 'Minimum Invoice Amount'], ['maxDiscountAmount', 'Maximum Discount Amount']].map(([key, label]) => <TextField key={key} type="number" required={key === 'value'} label={label} value={form[key] ?? ''} disabled={busy} onChange={(e) => update(key, e.target.value)} error={Boolean(errors[key])} helperText={errors[key]} inputProps={{ min: 0, step: 'any' }} />)}
        {['startDateUtc', 'endDateUtc'].map((key) => <TextField key={key} label={key === 'startDateUtc' ? 'Start Date (UTC)' : 'End Date (UTC)'} placeholder="2026-09-21T00:00:00Z" value={form[key] ?? ''} disabled={busy} onChange={(e) => update(key, e.target.value)} error={Boolean(errors[key])} helperText={errors[key] || 'Optional ISO date and time in UTC.'} />)}
        <TextField label="Applicable Role" value={form.applicableRole ?? ''} disabled={busy} onChange={(e) => update('applicableRole', e.target.value)} error={Boolean(errors.applicableRole)} helperText={errors.applicableRole || 'Optional backend role name; this does not grant permissions.'} />
        {form.id && <TextField select label="Status" value={form.status} disabled={busy} onChange={(e) => update('status', e.target.value)}>{[...new Set(['Active', 'Inactive', form.status])].map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}</TextField>}
        <TextField label="Description" multiline value={form.description ?? ''} disabled={busy} onChange={(e) => update('description', e.target.value)} error={Boolean(errors.description)} helperText={errors.description} />
      </div>}{formError && <Alert severity="error" sx={{ mt: 2 }}>{formError}</Alert>}
    </DialogContent><DialogActions><Button disabled={busy || !dirty} onClick={() => setForm({ ...baseline })}>Reset</Button><Button disabled={busy} onClick={() => setForm(null)}>Cancel</Button><Button variant="contained" disabled={busy || !dirty || Object.keys(errors).length > 0} onClick={() => mutate(() => form.id ? phase5Api.updateDiscountRule(form.id, form) : phase5Api.createDiscountRule(form), 'Discount rule saved.')}>{busy ? 'Saving...' : 'Save Changes'}</Button></DialogActions></Dialog>
    <Dialog open={Boolean(confirm)} onClose={() => { if (!busy) setConfirm(null); }}><DialogTitle>Delete Discount Rule?</DialogTitle><DialogContent>Delete {confirm?.name} ({confirm?.code})?{formError && <Alert severity="error">{formError}</Alert>}</DialogContent><DialogActions><Button disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button><Button disabled={busy} color="error" onClick={() => mutate(() => phase5Api.deleteDiscountRule(confirm.id), 'Discount rule deleted.')}>{busy ? 'Deleting...' : 'Delete'}</Button></DialogActions></Dialog>
    <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast('')} message={toast} />
  </Paper>;
}
