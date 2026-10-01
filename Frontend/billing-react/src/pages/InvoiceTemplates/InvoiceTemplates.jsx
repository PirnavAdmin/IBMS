import { Fragment, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, Checkbox, Chip, FormControlLabel, MenuItem, TextField } from '@mui/material';
import { Add, ArrowBack, ImageOutlined, VisibilityOutlined } from '@mui/icons-material';
import './invoice-templates.css';

const STYLES = ['Standard', 'Professional', 'Compact'];

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
  const visibleTemplates = useMemo(() => [].filter((template) =>
    (!search || template.name.toLowerCase().includes(search.toLowerCase()))
    && (!status || template.status === status)
    && (!style || template.style === style)), [search, status, style]);

  return <TemplatePage title="Invoice templates" description="Search and manage the invoice layouts available to your organization." actions={<Button variant="contained" startIcon={<Add />} onClick={() => navigate('/templates-branding/new')}>Create template</Button>}>
    <section className="template-list-card" aria-labelledby="template-list-heading">
      <div className="template-section-title"><div><h2 id="template-list-heading">Templates</h2></div></div>
      <div className="template-list-filters">
        <TextField label="Search templates" value={search} onChange={(event) => setSearch(event.target.value)} size="small" />
        <TextField label="Status" select value={status} onChange={(event) => setStatus(event.target.value)} size="small"><MenuItem value="">All statuses</MenuItem><MenuItem value="Active">Active</MenuItem><MenuItem value="Inactive">Inactive</MenuItem></TextField>
        <TextField label="Style" select value={style} onChange={(event) => setStyle(event.target.value)} size="small"><MenuItem value="">All styles</MenuItem>{STYLES.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
      </div>
      <div className="template-table-wrap"><table className="template-table"><caption className="sr-only">Invoice templates with version and status</caption><thead><tr><th scope="col">Template name</th><th scope="col">Style</th><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Last modified date</th><th scope="col">Last modified user</th></tr></thead><tbody>{visibleTemplates.map((template) => <tr key={template.id}><td>{template.name}</td><td>{template.style}</td><td>{template.version}</td><td>{template.status}</td><td>{template.lastModifiedDate}</td><td>{template.lastModifiedUser}</td></tr>)}{visibleTemplates.length === 0 && <tr><td colSpan="6"><div className="template-empty"><strong>{search || status || style ? 'No matching templates' : 'No templates available'}</strong></div></td></tr>}</tbody></table></div>
      <p className="template-list-footnote">{visibleTemplates.length} templates shown</p>
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
  const update = (key, value) => setConfig((current) => ({ ...current, [key]: value }));
  const validate = () => {
    const next = config.name.trim() ? {} : { name: 'Template name is required.' };
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const continueToBranding = () => {
    if (!validate()) return;
    navigate('/templates-branding/branding', { state: { config } });
  };

  return <TemplatePage title={edit ? 'Edit template' : 'Create template'} description={edit ? `Template ${templateId} configuration` : 'Enter template details and continue to branding settings.'} actions={<Button component={Link} to="/templates-branding" startIcon={<ArrowBack />}>Back to list</Button>}>
    {edit && <Alert severity="warning" className="template-notice">Template details are unavailable. This is a blank editor and does not represent the selected template.</Alert>}
    <form className="template-form-card" onSubmit={(event) => { event.preventDefault(); validate(); }} noValidate>
      <div className="template-section-title"><div><h2>{edit ? 'Edit configuration' : 'New configuration'}</h2></div><Chip label="Not saved" size="small" /></div>
      <BasicTemplateFields value={config} onChange={update} errors={errors} />
      <div className="template-actions"><Button variant="outlined" onClick={continueToBranding}>Continue to Branding Settings</Button><Button variant="contained" disabled>{edit ? 'Save changes' : 'Save as draft'}</Button></div>
    </form>
  </TemplatePage>;
}

export function CreateTemplate() { return <EditorScreen mode="create" />; }
export function EditTemplate() { return <EditorScreen mode="edit" />; }

export function BrandingSettings() {
  const location = useLocation();
  const navigate = useNavigate();
  const [config, setConfig] = useState(() => ({ ...emptyConfig, ...location.state?.config, sections: { ...DEFAULT_SECTIONS, ...location.state?.config?.sections } }));
  const [logoError, setLogoError] = useState('');
  const update = (key, value) => setConfig((current) => ({ ...current, [key]: value }));
  const onLogoChange = (event) => {
    const file = event.target.files?.[0];
    setLogoError('');
    if (file && !file.type.startsWith('image/')) setLogoError('Choose an image file to preview.');
    else if (file) {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' && setConfig((current) => ({ ...current, logoName: file.name, logoUrl: reader.result }));
      reader.onerror = () => setLogoError('This image could not be read for preview. Other form values were kept.');
      reader.readAsDataURL(file);
    }
    event.target.value = '';
  };
  const onLogoError = () => {
    setLogoError('This image could not be rendered in the preview. Other form values were kept.');
    setConfig((current) => ({ ...current, logoName: '', logoUrl: '' }));
  };
  const review = () => navigate(`/templates-branding/preview?style=${encodeURIComponent(config.style)}`, { state: { config } });
  return <TemplatePage title="Branding settings" description="Configure company identity and brand defaults for the sample preview.">
    <div className="template-form-card"><div className="template-section-title"><div><h2>Organization branding</h2></div><Chip label="Unsaved sample" size="small" /></div>
      <BrandingFields value={config} onChange={update} onLogoChange={onLogoChange} onLogoError={onLogoError} />
      {logoError && <Alert severity="error" role="alert">{logoError}</Alert>}
      <div className="template-actions"><Button variant="outlined" startIcon={<VisibilityOutlined />} onClick={review}>Review template sample</Button><Button variant="contained" disabled>Save branding</Button></div>
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
    <div className="sample-brand"><div className={`sample-identity position-${config.logoPosition || 'left'}`}>{config.logoUrl && <img onError={() => {}} src={config.logoUrl} alt="Selected company logo sample" style={{ width: config.logoWidth || 96 }} />}<div><strong>{config.company || 'Sample Company Ltd.'}</strong>{config.header && <span>{config.header}</span>}<span>{config.address || '42 Example Road, Sample City'}</span><span>{config.contact || 'billing@example.test Â· +00 000 000 0000'}</span><span>{config.registration || 'Registration details shown as sample'}</span></div></div><div className="sample-title"><span>INVOICE</span>{sections.invoiceNumber && <b>INV-SAMPLE-001</b>}</div></div>
    <div className="sample-meta">{sections.customer && <div><small>BILL TO</small><strong>Sample Customer Ltd.</strong><span>accounts@example.test</span><span>100 Market Street, Sample City</span></div>}<div>{sections.invoiceDate && <span><b>Invoice date</b> 30 Sep 2026</span>}{sections.dueDate && <span><b>Due date</b> 30 Oct 2026</span>}</div></div>
    {sections.items && <table className="sample-lines"><thead><tr>{columns.map((column) => <th key={column.key}>{column.title}</th>)}</tr></thead><tbody>{sampleRows.map((index) => <Fragment key={`sample-fragment-${index}`}>{long && index === 7 && <tr className="sample-page-marker"><td colSpan={columns.length}>Page 1 boundary Â· Page 2 continues below; the column heading repeats</td></tr>}<tr><td>{index === 0 ? 'Representative service item with a longer description' : `Sample invoice line item ${index + 1} with description wrapping`}</td>{sections.quantity && <td>{index + 1}</td>}{sections.unitPrice && <td>â‚¹500.00</td>}{sections.discount && <td>Sample</td>}{sections.tax && <td>Sample</td>}{sections.lineTotals && <td>â‚¹500.00</td>}</tr></Fragment>)}</tbody></table>}
    <div className="sample-bottom"><div><b>Payment instructions</b><p>{config.payment || 'Sample payment instructions. Replace with organization instructions after integration.'}</p>{config.bankDetails && <><b>Bank or payment details</b><p>{config.bankDetails}</p></>}<b>Terms and conditions</b><p className="sample-copy">{config.terms || 'Sample terms are shown for layout only. Add longer terms in the editor to inspect wrapping.'}</p></div>{sections.totals && <div className="sample-totals"><span>Subtotal <b>â‚¹1,250.00</b></span><span>Tax <b>â‚¹225.00</b></span><span className="sample-total">Total <b>â‚¹1,475.00</b></span></div>}</div><footer>{config.footer || 'Sample footer Â· Thank you for your business.'}</footer>
  </article>;
}

export function TemplatePreview() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const config = location.state?.config;
  const [style, setStyle] = useState(STYLES.includes(searchParams.get('style')) ? searchParams.get('style') : 'Standard');
  const [length, setLength] = useState('short');
  return <TemplatePage title="Template preview" description="Review this configuration or a representative layout sample.">
    <section className="template-preview-card"><div className="template-section-title"><div><h2>Sample invoice layout</h2><p>Switch styles to compare spacing and visual hierarchy.</p></div><Chip label="SAMPLE PREVIEW" color="info" /></div>
      <div className="template-preview-controls"><TextField label="Preview style" select value={style} onChange={(event) => setStyle(event.target.value)} size="small">{STYLES.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField><TextField label="Sample length" select value={length} onChange={(event) => setLength(event.target.value)} size="small"><MenuItem value="short">Short invoice</MenuItem><MenuItem value="long">Long invoice sample (2 pages)</MenuItem></TextField></div>
      <SampleInvoicePreview style={style} config={config} long={length === 'long'} />
      <p className="sample-disclaimer">Representative preview only; sample line values are illustrative and are not calculated from an invoice. Page boundary is a client-side layout guide. Server preview/PDF output remains authoritative.</p>
    </section>
  </TemplatePage>;
}

export function TemplateVersionHistory() {
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get('templateId');
  return <TemplatePage title="Template version history" description={templateId ? `Version history for template ${templateId}` : 'Review active and historical template versions.'}>
    <section className="template-list-card"><div className="template-section-title"><div><h2>Versions</h2></div></div>
      <div className="template-empty"><strong>No version history available</strong></div>
    </section>
  </TemplatePage>;
}

export function TemplateAuditHistory() {
  return <TemplatePage title="Audit & traceability" description="Track who changed invoice templates and which versions and documents used them.">
    <section className="template-list-card" aria-labelledby="template-audit-heading">
      <div className="template-section-title"><div><h2 id="template-audit-heading">Template and document activity</h2><p>Section 21 of the Module 13 specification requires an auditable lifecycle from template setup through historical PDF reproduction.</p></div></div>
      <div className="template-audit-requirements"><h3>Events required by the specification</h3><ul>
        <li>Template creation, edits, duplication, activation, deactivation, and version creation.</li>
        <li>Actor and timestamp for significant configuration changes, including which version changed.</li>
        <li>Template version associated with each issued invoice.</li>
        <li>PDF generation and document processing events, including storage success or failure where audited.</li>
        <li>Enough retained history to identify the configuration used for a historical invoice.</li>
      </ul></div>
      <div className="template-table-wrap"><table className="template-table"><caption className="sr-only">Template and invoice document audit history</caption><thead><tr><th scope="col">Event</th><th scope="col">Date and time</th><th scope="col">Performed by</th><th scope="col">Changes / result</th><th scope="col">Template version / document</th></tr></thead><tbody><tr><td colSpan="5"><div className="template-empty"><strong>No template activity available</strong></div></td></tr></tbody></table></div>
      <p className="template-list-footnote">The existing audit log model has Id, TenantId, EntityName, EntityId, Action, UserName, Timestamp, and Changes. Template version and PDF storage outcome fields are not part of that model.</p>
    </section>
  </TemplatePage>;
}

export function InvoicePdfView() {
  const { invoiceId } = useParams();
  return <TemplatePage title="Invoice document" description={`Invoice ${invoiceId}`} actions={<Button component={Link} to="/invoices" startIcon={<ArrowBack />}>Back to invoices</Button>} notice={null}>
    <section className="template-document-state"><div className="template-section-title"><div><h2>PDF unavailable</h2></div><Chip label="Not generated" size="small" /></div>
      <div className="template-document-actions"><Button disabled>Open PDF</Button><Button disabled>Download PDF</Button><Button disabled>Print invoice</Button></div>
      
    </section>
  </TemplatePage>;
}
