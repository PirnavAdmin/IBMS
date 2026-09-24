import { useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, CircularProgress, Skeleton, Snackbar } from '@mui/material';
import { AccountTreeOutlined, CheckCircleOutline, ReceiptLongOutlined, RemoveCircleOutline } from '@mui/icons-material';
import { DashboardHeader } from '../../components/dashboard/DashboardHeader';
import { taxService, taxError } from '../../services/taxService';
import { TAX_TYPES, emptyTax, validateTax, calculatePreview } from './taxModel';
import './TaxSettings.css';
import { SettingsPageHeader } from '../Settings/SettingsPageHeader';
const activeTaxService = taxService;
const taxQueryKey = ['tax-settings'];

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
const useTaxes = () => useQuery({ queryKey: taxQueryKey, queryFn: activeTaxService.list, retry: false });

function Field({ name, label, value, onChange, options, error, required = false, type = 'text', ...props }) {
  return <div className="tax-form-group"><label htmlFor={`tax-${name}`}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    {options ? <select id={`tax-${name}`} value={value} onChange={onChange} required={required} aria-invalid={!!error} aria-describedby={error ? `tax-${name}-error` : undefined} {...props}>{options.map(option => <option key={option} value={option}>{option || 'Select an option'}</option>)}</select>
      : <input id={`tax-${name}`} type={type} value={value} onChange={onChange} required={required} aria-invalid={!!error} aria-describedby={error ? `tax-${name}-error` : undefined} {...props} />}
    {error && <span className="tax-error" id={`tax-${name}-error`}>{error}</span>}
  </div>;
}

function Preview() {
  const [values, setValues] = useState({ amount: '1000', type: 'GST', rate: '18', calculation: 'Exclusive', transaction: 'Intra-State' });
  const change = key => event => setValues(previous => ({ ...previous, [key]: event.target.value }));
  const result = calculatePreview(values.amount, values.rate, values.calculation, values.type, values.transaction);
  return <section className="tax-preview-card" aria-labelledby="tax-preview-title"><div className="tax-section-heading"><span className="tax-eyebrow">CALCULATION WORKSPACE</span><h2 id="tax-preview-title">Tax Calculation Preview</h2><p>Explore how tax affects an amount before configuring your rules.</p></div>
    <div className="tax-preview-layout"><div className="tax-preview-controls">
      <Field name="preview-amount" label="Amount (INR)" type="number" min="0" max="1000000000000" step="0.01" value={values.amount} onChange={change('amount')} />
      <Field name="preview-type" label="Tax Type" options={TAX_TYPES} value={values.type} onChange={change('type')} />
      <Field name="preview-rate" label="Tax Rate (%)" type="number" min="0" max="100" step="any" value={values.rate} onChange={change('rate')} />
      <Field name="preview-calculation" label="Calculation Method" options={['Exclusive', 'Inclusive']} value={values.calculation} onChange={change('calculation')} />
      {values.type === 'GST' && <Field name="preview-transaction" label="GST Transaction Type" options={['Intra-State', 'Inter-State']} value={values.transaction} onChange={change('transaction')} />}
    </div><div className="tax-breakdown" aria-live="polite" aria-atomic="true">{result ? <><div className="tax-breakdown-row"><span>Taxable Amount</span><strong>{money(result.taxable)}</strong></div>{result.lines.map(line => <div className="tax-breakdown-row" key={line.label}><span>{line.label}</span><span>{money(line.amount)}</span></div>)}<div className="tax-breakdown-row tax-total-tax"><span>{values.calculation === 'Inclusive' ? 'Included Tax' : 'Total Tax'}</span><strong>{money(result.tax)}</strong></div><div className="tax-breakdown-row tax-grand-total"><span>Grand Total</span><strong>{money(result.total)}</strong></div></> : <p className="tax-error">Enter an amount from 0 to 1 trillion and a rate from 0 to 100%.</p>}</div></div>
    <p className="tax-preview-note">Preview only. Final invoice and billing amounts are calculated by the backend.</p>
  </section>;
}

function Loading() {
  return <div className="tax-card" role="status" aria-label="Loading tax settings" aria-busy="true"><Skeleton width="35%" height={40} />{[0, 1, 2, 3].map(i => <Skeleton key={i} height={55} />)}</div>;
}
function LoadError({ query }) {
  return <div className="tax-card" role="alert"><h2>Unable to load tax settings</h2><p>{taxError(query.error)}</p><button className="tax-secondary-btn" onClick={() => query.refetch()} disabled={query.isFetching}>{query.isFetching ? 'Retrying…' : 'Retry'}</button></div>;
}
function TaxList() {
  const query = useTaxes();
  const { state } = useLocation();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('All');
  const [status, setStatus] = useState('All');
  const [notice, setNotice] = useState(() => state?.taxNotice || '');
  const taxes = query.data || [];
  const filtered = taxes.filter(tax => `${tax.name} ${tax.code}`.toLowerCase().includes(search.toLowerCase()) && (type === 'All' || tax.type === type) && (status === 'All' || tax.status === status));
  return <><SettingsPageHeader title="Taxes & GST" description="Configure taxes used for invoice and billing calculations."><Link className="tax-primary-btn" to="/settings/taxes/new">+ Add Tax</Link></SettingsPageHeader>
    {query.isPending ? <Loading /> : query.isError ? <LoadError query={query} /> : <>
      <section className="tax-summary-grid" aria-label="Tax summary">{[
        { label: 'Total Tax Rules', value: taxes.length, text: 'Configured for billing', icon: <ReceiptLongOutlined />, tone: 'total' },
        { label: 'Active Taxes', value: taxes.filter(t => t.status === 'Active').length, text: 'Ready to apply', icon: <CheckCircleOutline />, tone: 'active' },
        { label: 'Inactive Taxes', value: taxes.filter(t => t.status === 'Inactive').length, text: 'Kept for history', icon: <RemoveCircleOutline />, tone: 'inactive' },
        { label: 'Tax Types', value: new Set(taxes.map(t => t.type)).size, text: 'Across all tax rules', icon: <AccountTreeOutlined />, tone: 'types' },
      ].map(stat => <article className={`tax-summary-card tax-summary-${stat.tone}`} key={stat.label}><div className="tax-summary-top"><span>{stat.label}</span><span className="tax-summary-icon" aria-hidden="true">{stat.icon}</span></div><strong>{stat.value}</strong><small>{stat.text}</small></article>)}</section>
      <section className="tax-card"><div className="tax-toolbar"><Field name="search" label="Search Tax" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or code" type="search" /><Field name="filter-type" label="Tax Type" options={['All', ...TAX_TYPES]} value={type} onChange={e => setType(e.target.value)} /><Field name="filter-status" label="Status" options={['All', 'Active', 'Inactive']} value={status} onChange={e => setStatus(e.target.value)} /></div>
        {!taxes.length ? <div className="tax-empty-state"><h2>No tax configurations found.</h2><p>Create your first tax rule to start configuring invoice taxes.</p><Link className="tax-primary-btn" to="/settings/taxes/new">+ Add Tax</Link></div> : !filtered.length ? <div className="tax-empty-state"><h2>No matching tax rules.</h2><button className="tax-secondary-btn" onClick={() => { setSearch(''); setType('All'); setStatus('All'); }}>Clear filters</button></div> : <div className="tax-table-container" tabIndex={0} role="region" aria-label="Tax configurations"><table className="tax-table"><thead><tr>{['Tax Name', 'Tax Code', 'Tax Type', 'Rate', 'Calculation', 'Priority', 'Effective From', 'Effective To', 'Status', 'Actions'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map(tax => <tr key={tax.id}><th scope="row">{tax.name}</th><td>{tax.code}</td><td>{tax.type}</td><td>{tax.rate}%</td><td>{tax.calculation}</td><td>{tax.priority}</td><td>{tax.effectiveFrom}</td><td>{tax.effectiveTo || 'No end date'}</td><td><span className={`tax-status tax-status-${tax.status.toLowerCase()}`}>{tax.status}</span></td><td><Link className="tax-edit" aria-label={`Edit ${tax.name}`} to={`/settings/taxes/${encodeURIComponent(tax.id)}/edit`}>Edit</Link></td></tr>)}</tbody></table></div>}
      </section></>}
    <Preview />
    <Snackbar open={Boolean(notice)} autoHideDuration={3500} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} onClose={() => setNotice('')}>
      <Alert className="tax-success-toast" severity="success" variant="filled" onClose={() => setNotice('')}>{notice}</Alert>
    </Snackbar>
  </>;
}

function TaxForm({ initial, editing = false }) {
  const [values, setValues] = useState(() => initial || emptyTax());
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const submit = async event => {
    event.preventDefault();
    if (pending.current) return;
    const validation = validateTax(values);
    setErrors(validation);
    if (Object.keys(validation).length) {
      document.getElementById(`tax-${Object.keys(validation)[0]}`)?.focus();
      return;
    }
    pending.current = true; setSaving(true); setSubmitError('');
    try {
      await activeTaxService.save(values, initial?.id);
      await queryClient.invalidateQueries({ queryKey: taxQueryKey });
      navigate('/settings/taxes', { state: { taxNotice: editing ? 'Tax updated successfully.' : 'Tax created successfully.' } });
    } catch (error) { setSubmitError(taxError(error)); }
    finally { pending.current = false; setSaving(false); }
  };
  const fields = [
    ['name', 'Tax Name'], ['code', 'Tax Code'], ['type', 'Tax Type', TAX_TYPES], ['rate', 'Rate (%)', null, 'number'],
    ['calculation', 'Calculation Method', ['Inclusive', 'Exclusive']], ['priority', 'Priority', null, 'number'],
    ['effectiveFrom', 'Effective From', null, 'date'], ['effectiveTo', 'Effective To', null, 'date'], ['status', 'Status', ['Active', 'Inactive']],
  ];
  return <><header className="tax-settings-header"><div><Link className="tax-edit" to="/settings/taxes">← Tax Settings</Link><h1>{editing ? 'Edit Tax' : 'Add Tax'}</h1><p>Define a tax rule for invoice and billing calculations.</p></div></header><form className="tax-card tax-form" onSubmit={submit} noValidate><p className="tax-form-hint">Fields marked * are required.</p><fieldset disabled={saving}><div className="tax-form-grid">{fields.map(([name, label, options, type]) => <Field key={name} name={name} label={label} options={options ? ['', ...options] : undefined} type={type} value={values[name]} required={name !== 'effectiveTo'} error={errors[name]} onChange={event => { setValues(previous => ({ ...previous, [name]: event.target.value })); setErrors(previous => ({ ...previous, [name]: undefined })); }} {...(type === 'number' ? { min: 0, step: name === 'rate' ? 'any' : 1, ...(name === 'rate' ? { max: 100 } : {}) } : {})} />)}</div></fieldset>{submitError && <Alert severity="error">{submitError}</Alert>}<div className="tax-form-actions"><button className="tax-secondary-btn" type="button" disabled={saving} onClick={() => navigate('/settings/taxes')}>Cancel</button><button className="tax-primary-btn" type="submit" disabled={saving}>{saving && <CircularProgress size={16} color="inherit" />}{saving ? 'Saving…' : editing ? 'Update Tax' : 'Save Tax'}</button></div></form></>;
}
function EditTax() {
  const { id } = useParams();
  const query = useTaxes();
  if (query.isPending) return <Loading />;
  if (query.isError) return <><Link className="tax-edit" to="/settings/taxes">← Tax Settings</Link><LoadError query={query} /></>;
  const tax = query.data.find(item => String(item.id) === id);
  return tax ? <TaxForm key={id} initial={tax} editing /> : <div className="tax-card"><h1>Tax rule not found</h1><Link to="/settings/taxes">Back to Tax Settings</Link></div>;
}
export function Taxes() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const signOut = () => { localStorage.removeItem('billing_auth_token'); localStorage.removeItem('billing_auth_user'); navigate('/login'); };
  return <div className="tax-module"><DashboardHeader searchQuery={search} onSearch={setSearch} onSignOut={signOut} /><main className="tax-settings-page"><Routes><Route index element={<TaxList />} /><Route path="new" element={<TaxForm />} /><Route path=":id/edit" element={<EditTax />} /><Route path="*" element={<Navigate to="/settings/taxes" replace />} /></Routes></main></div>;
}
