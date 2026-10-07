import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, Checkbox, Chip, CircularProgress, FormControlLabel, IconButton, Menu, MenuItem, TextField } from '@mui/material';
import { DashboardErrorState } from '../../components/dashboard/DashboardStates';
import { Add, ArrowBack, ImageOutlined, MoreVert, VisibilityOutlined } from '@mui/icons-material';
import { templateApi } from 'billing-api-client/templateApi.js';
import './invoice-templates.css';

const STYLES = ['Standard', 'Professional', 'Compact'];
const STATUS_LABELS = { 1: 'Draft', 2: 'Active', 3: 'Inactive', 4: 'Archived', Draft: 'Draft', Active: 'Active', Inactive: 'Inactive', Archived: 'Archived' };
const rowsFrom = (value) => Array.isArray(value) ? value : value?.items || value?.Items || value?.data?.items || [];
const asError = (error) => error?.userMessage || error?.message || 'The request failed. Please try again.';
const configFromTemplate = (template = {}) => {
  const version = template.activeVersion || template.ActiveVersion || template.versions?.[0] || template.Versions?.[0] || {};
  const branding = version.branding || version.Branding || {};
  const company = version.companyDetails || version.CompanyDetails || {};
  const layout = version.layout || version.Layout || {};
  const payment = version.paymentInstructions || version.PaymentInstructions || {};
  const terms = version.terms || version.Terms || {};
  return { ...emptyConfig, name: template.name || template.Name || '', description: template.description || template.Description || '', style: typeof (template.style ?? template.Style) === 'number' ? (STYLES[(template.style ?? template.Style) - 1] || 'Standard') : (template.style || template.Style || 'Standard'), company: company.companyName || company.company || '', address: company.addressLine1 || company.address || '', contact: company.phone || company.email || company.contact || '', registration: company.registrationNumber || company.taxId || company.registration || '', primary: branding.primaryColor || branding.primary || emptyConfig.primary, secondary: branding.secondaryColor || branding.secondary || emptyConfig.secondary, logoName: branding.logoName || '', logoUrl: branding.logoUrl || '', logoPosition: branding.logoPosition || 'left', logoWidth: branding.logoWidth || 96, header: terms.headerText || terms.header || '', footer: terms.footerNote || terms.footer || '', payment: payment.paymentNotes || payment.payment || '', bankDetails: payment.bankDetails || '', terms: terms.termsAndConditions || terms.terms || '', sections: { ...DEFAULT_SECTIONS, ...(layout.sections || layout.Sections || {}) } };
};
const requestFromConfig = (config, extra = {}) => ({ name: config.name.trim(), description: config.description || null, style: config.style, branding: { logoUrl: config.logoUrl || null, logoName: config.logoName || null, logoPosition: config.logoPosition, logoWidth: config.logoWidth, primaryColor: config.primary, secondaryColor: config.secondary }, companyDetails: { companyName: config.company, addressLine1: config.address, phone: config.contact, registrationNumber: config.registration }, layout: { sections: config.sections }, paymentInstructions: { paymentNotes: config.payment, bankDetails: config.bankDetails }, terms: { headerText: config.header, footerNote: config.footer, termsAndConditions: config.terms }, sections: config.sections, ...extra });

function TemplateNavigation() {
  return <nav className="template-nav" aria-label="Template management">
    <NavLink to="/templates-branding" end>Template list</NavLink>
    <NavLink to="/templates-branding/new">Create template</NavLink>
    <NavLink to="/templates-branding/branding">Branding settings</NavLink>
    <NavLink to="/templates-branding/preview">Template preview</NavLink>
    <NavLink to="/templates-branding/versions">Version history</NavLink>
    <NavLink to="/templates-branding/audit">Audit & traceability</NavLink>
  </nav>;
}

function TemplatePage({ title, description, children, notice, actions }) {
  return <main className="template-page">
    <header className="template-heading"><div><p className="template-eyebrow">Invoice documents</p><h1>{title}</h1><p>{description}</p></div>{actions}</header>
    <TemplateNavigation />
    {notice && <Alert severity="info" className="template-notice">{notice}</Alert>}
    {children}
  </main>;
}

export function InvoiceTemplates() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [style, setStyle] = useState('');
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');
  const [actionMenu, setActionMenu] = useState(null);
  const load = async () => {
    setLoading(true); setError(''); setLoadError('');
    try {
      const result = await templateApi.list({ Search: search || undefined, Status: status || undefined, Style: style || undefined, PageNumber: page, PageSize: 10 });
      setTemplates(rowsFrom(result));
      setPageCount(Math.max(1, Number(result?.totalPages || result?.TotalPages || 1)));
    } catch (requestError) { setLoadError(asError(requestError)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [search, status, style, page]);
  const visibleTemplates = useMemo(() => templates, [templates]);
  const setTemplateStatus = async (template) => {
    setBusyId(template.id);
    try {
      const response = (template.status === 2 || template.status === 'Active') ? await templateApi.deactivate(template.id) : await templateApi.activate(template.id);
      setNotice(response?.message || 'Template status updated.');
      await load();
    } catch (requestError) { setError(asError(requestError)); }
    finally { setBusyId(null); }
  };
  const duplicateTemplate = async (template) => {
    const newTemplateName = window.prompt('Name for the duplicated template:', `${template.name} Copy`);
    if (!newTemplateName?.trim()) return;
    setBusyId(template.id); setError('');
    try { await templateApi.duplicate(template.id, { newTemplateName: newTemplateName.trim(), newDescription: `Duplicated from ${template.name}` }); setNotice('Template duplicated.'); await load(); }
    catch (requestError) { setError(asError(requestError)); }
    finally { setBusyId(null); }
  };
  const archiveTemplate = async (template) => {
    if (!window.confirm(`Archive template “${template.name}”?`)) return;
    setBusyId(template.id); setError('');
    try { await templateApi.delete(template.id); setNotice('Template archived.'); await load(); }
    catch (requestError) { setError(asError(requestError)); }
    finally { setBusyId(null); }
  };

  return <TemplatePage title="Invoice templates" description="Search and manage the invoice layouts available to your organization." actions={<Button variant="contained" startIcon={<Add />} onClick={() => navigate('/templates-branding/new')}>Create template</Button>}>
    {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}{error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
    <section className="template-list-card" aria-labelledby="template-list-heading">
      <div className="template-section-title"><div><h2 id="template-list-heading">Templates</h2></div></div>
      <div className="template-list-filters">
        <TextField label="Search templates" value={search} onChange={(event) => setSearch(event.target.value)} size="small" />
        <TextField label="Status" select value={status} onChange={(event) => setStatus(event.target.value)} size="small"><MenuItem value="">All statuses</MenuItem><MenuItem value="Active">Active</MenuItem><MenuItem value="Inactive">Inactive</MenuItem></TextField>
        <TextField label="Style" select value={style} onChange={(event) => setStyle(event.target.value)} size="small"><MenuItem value="">All styles</MenuItem>{STYLES.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
      </div>
      {loading ? <div className="template-empty"><CircularProgress size={24} /><span>Loading templates…</span></div> : loadError ? <DashboardErrorState title="Unable to load templates" message={loadError} onRetry={load} /> : <div className="template-table-wrap"><table className="template-table"><caption className="sr-only">Invoice templates with version and status</caption><thead><tr><th scope="col">Template name</th><th scope="col">Style</th><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Last modified date</th><th scope="col">Last modified user</th><th scope="col" className="template-actions-heading">Actions</th></tr></thead><tbody>{visibleTemplates.map((template) => <tr key={template.id}><td>{template.name}</td><td>{typeof template.style === 'number' ? STYLES[template.style - 1] : template.style}</td><td>{template.version || `v${template.currentVersionNumber}`}</td><td>{STATUS_LABELS[template.status] || template.status}</td><td>{template.lastModifiedDate || template.lastModified || template.updatedAtUtc || template.createdAtUtc}</td><td>{template.lastModifiedUser || template.updatedBy || template.createdBy}</td><td className="template-actions-cell"><IconButton aria-label={`Actions for ${template.name}`} aria-haspopup="menu" onClick={(event) => setActionMenu({ anchor: event.currentTarget, template })}><MoreVert /></IconButton></td></tr>)}{visibleTemplates.length === 0 && <tr><td colSpan="7"><div className="template-empty"><strong>{search || status || style ? 'No matching templates' : 'No templates available'}</strong></div></td></tr>}</tbody></table>
        <Menu anchorEl={actionMenu?.anchor} open={Boolean(actionMenu)} onClose={() => setActionMenu(null)}>{actionMenu && <>
          <MenuItem component={Link} to={`/templates-branding/${actionMenu.template.id}/edit`} onClick={() => setActionMenu(null)}>Edit</MenuItem>
          <MenuItem disabled={busyId === actionMenu.template.id} onClick={() => { setActionMenu(null); setTemplateStatus(actionMenu.template); }}>{actionMenu.template.status === 2 || actionMenu.template.status === 'Active' ? 'Deactivate' : 'Activate'}</MenuItem>
          <MenuItem disabled={busyId === actionMenu.template.id} onClick={() => { setActionMenu(null); duplicateTemplate(actionMenu.template); }}>Duplicate</MenuItem>
          <MenuItem disabled={busyId === actionMenu.template.id} onClick={() => { setActionMenu(null); archiveTemplate(actionMenu.template); }}>Archive</MenuItem>
          <MenuItem component={Link} to={`/templates-branding/preview?templateId=${actionMenu.template.id}`} onClick={() => setActionMenu(null)}>PDF preview</MenuItem>
          <MenuItem component={Link} to={`/templates-branding/versions?templateId=${actionMenu.template.id}`} onClick={() => setActionMenu(null)}>Versions</MenuItem>
        </>}</Menu></div>}
      <div className="template-actions"><Button disabled={page <= 1 || loading || Boolean(loadError)} onClick={() => setPage((value) => value - 1)}>Previous</Button><span>Page {page} of {pageCount}</span><Button disabled={page >= pageCount || loading || Boolean(loadError)} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
      {!loadError && <p className="template-list-footnote">{visibleTemplates.length} templates shown</p>}
    </section>
  </TemplatePage>;
}

const DEFAULT_SECTIONS = { invoiceNumber: true, invoiceDate: true, dueDate: true, customer: true, items: true, quantity: true, unitPrice: true, discount: true, tax: true, lineTotals: true, totals: true };
const emptyConfig = { name: '', style: 'Standard', description: '', company: '', address: '', contact: '', registration: '', primary: '#70472f', secondary: '#e9dfd5', header: '', footer: '', payment: '', bankDetails: '', terms: '', logoName: '', logoUrl: '', logoPosition: 'left', logoWidth: 96, sections: DEFAULT_SECTIONS };

function colorContrast(hex) {
  const rgb = String(hex).match(/[\da-f]{2}/gi)?.map((part) => parseInt(part, 16) / 255);
  if (!rgb || rgb.length !== 3) return 21;
  const luminance = rgb.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  return (1.05 / (luminance + 0.05));
}

function BasicTemplateFields({ value, onChange, errors = {} }) {
  const text = (key) => ({ value: value[key], onChange: (event) => onChange(key, event.target.value) });
  return <>
    <div className="template-fields"><TextField label="Template name" required error={Boolean(errors.name)} helperText={errors.name} {...text('name')} fullWidth />
      <TextField label="Template style" select {...text('style')} fullWidth>{STYLES.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>
      <TextField label="Description (optional)" {...text('description')} multiline minRows={2} fullWidth /></div>
    <h3>Invoice sections (preview only)</h3><div className="template-section-toggles">{Object.entries({ invoiceNumber: 'Invoice number', invoiceDate: 'Invoice date', dueDate: 'Due date', customer: 'Customer details', items: 'Line items', quantity: 'Quantity', unitPrice: 'Unit price', discount: 'Discount', tax: 'Tax', totals: 'Overall totals' }).map(([key, label]) => <FormControlLabel key={key} control={<Checkbox checked={value.sections[key]} onChange={(event) => onChange('sections', { ...value.sections, [key]: event.target.checked })} />} label={label} />)}</div>
  </>;
}

function BrandingFields({ value, onChange, onLogoChange, onLogoError }) {
  const text = (key) => ({ value: value[key], onChange: (event) => onChange(key, event.target.value) });
  return <>
    <h3>Company details</h3><div className="template-fields"><TextField label="Company or organization name" {...text('company')} fullWidth /><TextField label="Address" {...text('address')} multiline minRows={2} fullWidth /><TextField label="Contact information" {...text('contact')} fullWidth /><TextField label="Tax or registration information" {...text('registration')} fullWidth /></div>
    <h3>Logo and colors</h3><label className="template-upload"><ImageOutlined /><span>{value.logoName || 'Choose image for sample preview'}</span><input type="file" accept="image/*" onChange={onLogoChange} aria-label="Choose an image for sample preview" /></label>{value.logoUrl && <img className="template-logo-preview" style={{ width: value.logoWidth, objectPosition: value.logoPosition }} src={value.logoUrl} alt="Selected logo sample preview" onError={onLogoError} />}
    <div className="template-fields template-logo-controls"><TextField label="Logo position" select {...text('logoPosition')}><MenuItem value="left">Left</MenuItem><MenuItem value="center">Center</MenuItem><MenuItem value="right">Right</MenuItem></TextField><TextField label="Logo preview width (px)" type="number" inputProps={{ min: 48, max: 240 }} value={value.logoWidth} onChange={(event) => onChange('logoWidth', Math.min(240, Math.max(48, Number(event.target.value) || 48)))} /></div>
    <div className="template-color-fields"><TextField label="Primary color" type="color" {...text('primary')} /><TextField label="Secondary color" type="color" {...text('secondary')} /></div>
    {colorContrast(value.primary) < 4.5 && <Alert severity="warning" role="status">This primary color may have low contrast against white. Review the sample preview for readability.</Alert>}
    <h3>Invoice content</h3><div className="template-fields"><TextField label="Header text" {...text('header')} multiline minRows={2} fullWidth /><TextField label="Payment instructions" {...text('payment')} multiline minRows={2} fullWidth /><TextField label="Bank or payment details" {...text('bankDetails')} multiline minRows={2} fullWidth /><TextField label="Terms and conditions" {...text('terms')} multiline minRows={3} fullWidth /><TextField label="Footer text" {...text('footer')} multiline minRows={2} fullWidth /></div>
  </>;
}

function EditorScreen({ mode }) {
  const [config, setConfig] = useState(emptyConfig);
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();
  const { templateId } = useParams();
  const edit = mode === 'edit';
  const [loading, setLoading] = useState(edit);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saved, setSaved] = useState(false);
  const update = (key, value) => setConfig((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    if (!edit) return;
    setLoading(true); setLoadError('');
    let active = true;
    templateApi.get(templateId).then((template) => { if (active) setConfig(configFromTemplate(template)); }).catch((error) => { if (active) setLoadError(asError(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [edit, templateId, loadAttempt]);
  const validate = () => {
    const next = config.name.trim() ? {} : { name: 'Template name is required.' };
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const continueToBranding = () => {
    if (!validate()) return;
    navigate('/templates-branding/branding', { state: { config, templateId: edit ? Number(templateId) : null } });
  };
  const save = async () => {
    if (!validate()) return;
    setSaving(true); setApiError('');
    try {
      const result = edit ? await templateApi.update(templateId, requestFromConfig(config, { changeDescription: 'Updated from invoice template editor' })) : await templateApi.create(requestFromConfig(config));
      setSaved(true);
      if (!edit) navigate('/templates-branding/branding', { state: { config, templateId: result?.id || result?.Id } });
    } catch (error) { setApiError(asError(error)); }
    finally { setSaving(false); }
  };

  return <TemplatePage title={edit ? 'Edit template' : 'Create template'} description={edit ? `Template ${templateId} configuration` : 'Enter template details and continue to branding settings.'} actions={<Button component={Link} to="/templates-branding" startIcon={<ArrowBack />}>Back to list</Button>}>
    {apiError && <Alert severity="error" onClose={() => setApiError('')}>{apiError}</Alert>}{saved && <Alert severity="success">Template updated successfully.</Alert>}{loading && <div className="template-empty"><CircularProgress size={24} />Loading template…</div>}
    {loadError ? <DashboardErrorState title="Unable to load template" message={loadError} onRetry={() => setLoadAttempt(attempt => attempt + 1)} /> : <form className="template-form-card" onSubmit={(event) => { event.preventDefault(); validate(); }} noValidate>
      <div className="template-section-title"><div><h2>{edit ? 'Edit configuration' : 'New configuration'}</h2></div><Chip label={saved ? 'Saved' : 'Unsaved'} size="small" /></div>
      <BasicTemplateFields value={config} onChange={update} errors={errors} />
      <div className="template-actions"><Button variant="outlined" onClick={continueToBranding}>Continue to Branding Settings</Button><Button variant="contained" disabled={saving || loading} onClick={save}>{saving ? 'Saving…' : edit ? 'Save changes' : 'Save as draft'}</Button></div>
    </form>}
  </TemplatePage>;
}

export function CreateTemplate() { return <EditorScreen mode="create" />; }
export function EditTemplate() { return <EditorScreen mode="edit" />; }

export function BrandingSettings() {
  const location = useLocation();
  const navigate = useNavigate();
  const [config, setConfig] = useState(() => ({ ...emptyConfig, ...location.state?.config, sections: { ...DEFAULT_SECTIONS, ...location.state?.config?.sections } }));
  const [logoError, setLogoError] = useState('');
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const templateId = location.state?.templateId;
  const update = (key, value) => setConfig((current) => ({ ...current, [key]: value }));
  const onLogoChange = async (event) => {
    const file = event.target.files?.[0];
    setLogoError('');
    if (file && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) setLogoError('Choose a PNG, JPEG, or WebP image.');
    else if (file && file.size > 2 * 1024 * 1024) setLogoError('The logo must be no larger than 2 MB.');
    else if (file) {
      setLogoBusy(true);
      try {
        const result = await templateApi.uploadLogo(file);
        setConfig((current) => ({ ...current, logoName: result?.fileName || result?.FileName || file.name, logoUrl: result?.logoUrl || result?.LogoUrl || '' }));
      } catch (error) { setLogoError(asError(error)); }
      finally { setLogoBusy(false); }
    }
    event.target.value = '';
  };
  const onLogoError = () => {
    setLogoError('This image could not be rendered in the preview. Other form values were kept.');
    setConfig((current) => ({ ...current, logoName: '', logoUrl: '' }));
  };
  const review = () => navigate(`/templates-branding/preview?style=${encodeURIComponent(config.style)}`, { state: { config } });
  const save = async () => {
    if (!config.name.trim()) { setApiError('Template name is required. Set it in Create template before saving branding.'); return; }
    setSaving(true); setApiError('');
    try {
      const request = requestFromConfig(config);
      if (templateId) await templateApi.update(templateId, { ...request, changeDescription: 'Updated branding settings' });
      else await templateApi.create(request);
      setNotice('Template branding saved.');
      navigate('/templates-branding');
    } catch (error) { setApiError(asError(error)); }
    finally { setSaving(false); }
  };
  return <TemplatePage title="Branding settings" description="Configure company identity and brand defaults for the sample preview.">
    <div className="template-form-card"><div className="template-section-title"><div><h2>Organization branding</h2></div><Chip label="Unsaved sample" size="small" /></div>
      <BrandingFields value={config} onChange={update} onLogoChange={onLogoChange} onLogoError={onLogoError} />
      {logoBusy && <Alert severity="info">Uploading logo…</Alert>}{apiError && <Alert severity="error" onClose={() => setApiError('')}>{apiError}</Alert>}{notice && <Alert severity="success">{notice}</Alert>}
      {logoError && <Alert severity="error" role="alert">{logoError}</Alert>}
      <div className="template-actions"><Button variant="outlined" startIcon={<VisibilityOutlined />} onClick={review}>Review template sample</Button><Button variant="contained" disabled={saving || logoBusy} onClick={save}>{saving ? 'Saving…' : 'Save branding'}</Button></div>
    </div>
  </TemplatePage>;
}

function SampleInvoicePreview({ style, config = {}, long = false }) {
  const primary = config.primary || '#70472f';
  const secondary = config.secondary || '#e9dfd5';
  const sections = { ...DEFAULT_SECTIONS, ...config.sections };
  const columns = [
    { key: 'description', title: 'Description' },
    ...(sections.quantity ? [{ key: 'quantity', title: 'Qty' }] : []),
    ...(sections.unitPrice ? [{ key: 'unitPrice', title: 'Unit price' }] : []),
    ...(sections.discount ? [{ key: 'discount', title: 'Discount' }] : []),
    ...(sections.tax ? [{ key: 'tax', title: 'Tax' }] : []),
    ...(sections.lineTotals ? [{ key: 'amount', title: 'Amount' }] : []),
  ];
  const sampleRows = Array.from({ length: long ? 14 : 2 }, (_, index) => index);
  return <article className={`invoice-sample style-${style.toLowerCase()}`} style={{ '--template-primary': primary, '--template-secondary': secondary }} aria-label={`${style} sample invoice layout`}>
    <div className="sample-brand"><div className={`sample-identity position-${config.logoPosition || 'left'}`}>{config.logoUrl && <img onError={() => {}} src={config.logoUrl} alt="Selected company logo sample" style={{ width: config.logoWidth || 96 }} />}<div><strong>{config.company || 'Sample Company Ltd.'}</strong>{config.header && <span>{config.header}</span>}<span>{config.address || '42 Example Road, Sample City'}</span><span>{config.contact || 'billing@example.test · +00 000 000 0000'}</span><span>{config.registration || 'Registration details shown as sample'}</span></div></div><div className="sample-title"><span>INVOICE</span>{sections.invoiceNumber && <b>INV-SAMPLE-001</b>}</div></div>
    <div className="sample-meta">{sections.customer && <div><small>BILL TO</small><strong>Sample Customer Ltd.</strong><span>accounts@example.test</span><span>100 Market Street, Sample City</span></div>}<div>{sections.invoiceDate && <span><b>Invoice date</b> 30 Sep 2026</span>}{sections.dueDate && <span><b>Due date</b> 30 Oct 2026</span>}</div></div>
    {sections.items && <table className="sample-lines"><thead><tr>{columns.map((column) => <th key={column.key}>{column.title}</th>)}</tr></thead><tbody>{sampleRows.map((index) => <Fragment key={`sample-fragment-${index}`}>{long && index === 7 && <tr className="sample-page-marker"><td colSpan={columns.length}>Page 1 boundary · Page 2 continues below; the column heading repeats</td></tr>}<tr><td>{index === 0 ? 'Representative service item with a longer description' : `Sample invoice line item ${index + 1} with description wrapping`}</td>{sections.quantity && <td>{index + 1}</td>}{sections.unitPrice && <td>₹500.00</td>}{sections.discount && <td>Sample</td>}{sections.tax && <td>Sample</td>}{sections.lineTotals && <td>₹500.00</td>}</tr></Fragment>)}</tbody></table>}
    <div className="sample-bottom"><div><b>Payment instructions</b><p>{config.payment || 'Sample payment instructions. Replace with organization instructions after integration.'}</p>{config.bankDetails && <><b>Bank or payment details</b><p>{config.bankDetails}</p></>}<b>Terms and conditions</b><p className="sample-copy">{config.terms || 'Sample terms are shown for layout only. Add longer terms in the editor to inspect wrapping.'}</p></div>{sections.totals && <div className="sample-totals"><span>Subtotal <b>₹1,250.00</b></span><span>Tax <b>₹225.00</b></span><span className="sample-total">Total <b>₹1,475.00</b></span></div>}</div><footer>{config.footer || 'Sample footer · Thank you for your business.'}</footer>
  </article>;
}

export function TemplatePreview() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const config = location.state?.config;
  const [style, setStyle] = useState(STYLES.includes(searchParams.get('style')) ? searchParams.get('style') : 'Standard');
  const [length, setLength] = useState('short');
  const [pdf, setPdf] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const templateId = searchParams.get('templateId');
  const renderPdf = async () => {
    setPreviewBusy(true); setPreviewError(''); setPdf(null);
    try {
      const previewConfig = { ...emptyConfig, ...config, style };
      const blob = templateId ? await templateApi.previewById(templateId) : await templateApi.preview(requestFromConfig(previewConfig));
      setPdf(blob);
    } catch (error) { setPreviewError(asError(error)); }
    finally { setPreviewBusy(false); }
  };
  return <TemplatePage title="Template preview" description="Review this configuration or a representative layout sample.">
    <section className="template-preview-card"><div className="template-section-title"><div><h2>Sample invoice layout</h2></div><Chip label="SAMPLE PREVIEW" color="info" /></div>
      <div className="template-preview-controls"><TextField label="Preview style" select value={style} onChange={(event) => setStyle(event.target.value)} size="small">{STYLES.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField><TextField label="Sample length" select value={length} onChange={(event) => setLength(event.target.value)} size="small"><MenuItem value="short">Short invoice</MenuItem><MenuItem value="long">Long invoice sample (2 pages)</MenuItem></TextField><Button variant="contained" disabled={previewBusy} onClick={renderPdf}>{previewBusy ? 'Rendering PDF…' : 'Generate server PDF preview'}</Button></div>
      {previewError && <Alert severity="error">{previewError}</Alert>}{pdf && <div className="template-live-preview"><PdfPreview blob={pdf} /></div>}
      <SampleInvoicePreview style={style} config={config} long={length === 'long'} />
    </section>
  </TemplatePage>;
}

function PdfPreview({ blob }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const next = URL.createObjectURL(blob); setUrl(next); return () => URL.revokeObjectURL(next); }, [blob]);
  return url ? <iframe title="Server generated invoice PDF preview" src={url} style={{ width: '100%', height: 680, border: 0 }} /> : null;
}

export function TemplateVersionHistory() {
  const [searchParams] = useSearchParams();
  const [templateId, setTemplateId] = useState(searchParams.get('templateId') || '');
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    if (!templateId) { setError('Enter a template ID to view its version history.'); return; }
    setLoading(true); setError('');
    try { const result = await templateApi.getVersions(templateId); setVersions(Array.isArray(result) ? result : result?.items || result?.Items || []); }
    catch (requestError) { setError(asError(requestError)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (templateId) load(); }, []);
  return <TemplatePage title="Template version history" description={templateId ? `Version history for template ${templateId}` : 'Review active and historical template versions.'}>
    <section className="template-list-card"><div className="template-section-title"><div><h2>Versions</h2></div></div>
      <div className="template-preview-controls"><TextField size="small" label="Template ID" value={templateId} onChange={(event) => setTemplateId(event.target.value)} /><Button variant="contained" disabled={loading} onClick={load}>{loading ? 'Loading…' : 'Load versions'}</Button></div>
      {error && <DashboardErrorState title="Unable to load template versions" message={error} onRetry={templateId ? load : undefined} />}{loading ? <div className="template-empty"><CircularProgress size={24} /></div> : <div className="template-table-wrap"><table className="template-table"><thead><tr><th>Version</th><th>Status</th><th>Description</th><th>Created</th><th>Created by</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id || version.Id}><td>{version.version || `v${version.versionNumber}`}</td><td>{STATUS_LABELS[version.status] || version.status}</td><td>{version.versionDescription || version.changeDescription || '—'}</td><td>{version.createdAtUtc || version.createdDate}</td><td>{version.createdBy || '—'}</td></tr>)}{!versions.length && !error && <tr><td colSpan="5"><div className="template-empty"><strong>No version history available</strong></div></td></tr>}</tbody></table></div>}
    </section>
  </TemplatePage>;
}

export function TemplateAuditHistory() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    setLoading(true); setError('');
    let active = true;
    templateApi.getAudit().then((result) => { if (active) setLogs(Array.isArray(result) ? result : result?.items || result?.Items || []); }).catch((requestError) => { if (active) setError(asError(requestError)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadAttempt]);
  return <TemplatePage title="Audit & traceability" description="">
    <section className="template-list-card" aria-labelledby="template-audit-heading">
      <div className="template-section-title"><div><h2 id="template-audit-heading">Template and document activity</h2></div></div>
      {error && <DashboardErrorState title="Unable to load template activity" message={error} onRetry={() => setLoadAttempt(attempt => attempt + 1)} />}<div className="template-table-wrap"><table className="template-table"><caption className="sr-only">Template and invoice document audit history</caption><thead><tr><th scope="col">Event</th><th scope="col">Date and time</th><th scope="col">Performed by</th><th scope="col">Changes / result</th><th scope="col">Template version / document</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id || log.Id}><td>{log.event}</td><td>{log.dateAndTime}</td><td>{log.performedBy}</td><td>{log.changesOrResult}</td><td>{log.templateVersionOrDocument}</td></tr>)}{!logs.length && !loading && !error && <tr><td colSpan="5"><div className="template-empty"><strong>No template activity available</strong></div></td></tr>}{loading && <tr><td colSpan="5"><div className="template-empty"><CircularProgress size={24} /></div></td></tr>}</tbody></table></div>
    </section>
  </TemplatePage>;
}
