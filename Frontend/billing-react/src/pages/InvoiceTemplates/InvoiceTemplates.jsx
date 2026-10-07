import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Menu, MenuItem, TextField } from '@mui/material';
import { Add, ArrowBack, ImageOutlined, MoreVert, VisibilityOutlined } from '@mui/icons-material';
import { templateApi } from 'billing-api-client/templateApi.js';
import { invoiceApi } from 'billing-api-client/invoiceApi.js';
import './invoice-templates.css';

const STYLES = ['Standard', 'Professional', 'Compact'];
const STATUS_LABELS = { 1: 'Draft', 2: 'Active', 3: 'Inactive', 4: 'Archived', Draft: 'Draft', Active: 'Active', Inactive: 'Inactive', Archived: 'Archived' };
const rowsFrom = (value) => Array.isArray(value) ? value : value?.items || value?.Items || value?.data?.items || [];
const asError = (error) => error?.userMessage || error?.message || 'The request failed. Please try again.';
const customerAddress = (customer = {}) => [customer.address, customer.city, customer.state, customer.postalCode, customer.country].filter(Boolean).join(', ');
const currencySymbol = (currency = 'INR') => {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((part) => part.type === 'currency')?.value || currency; }
  catch { return currency; }
};
const invoiceSnapshotFromInvoice = (invoice) => ({
  invoiceId: invoice.id,
  invoiceNumber: invoice.invoiceNumber || 'Draft #' + invoice.id,
  issueDate: invoice.invoiceDate,
  dueDate: invoice.dueDate || invoice.invoiceDate,
  status: invoice.status || 'Draft',
  currency: invoice.currency || 'INR',
  currencySymbol: currencySymbol(invoice.currency || 'INR'),
  customer: { customerId: invoice.customerId || invoice.customer?.id || 0, customerName: invoice.customer?.name || 'Customer', customerCode: invoice.customer?.customerCode || null, email: invoice.customer?.email || null, phone: invoice.customer?.phone || null, taxId: invoice.customer?.taxId || null, billingAddress: customerAddress(invoice.customer) },
  items: (invoice.items || []).map((item) => ({ itemId: item.id || 0, itemName: item.description || 'Invoice item', description: item.description || null, hsnSacCode: item.hsnsac || item.hsnSac || null, quantity: Number(item.quantity) || 0, unit: 'Unit', unitPrice: Number(item.unitPrice) || 0, discountAmount: Number(item.discountAmount) || 0, taxRatePercent: Number(item.taxRate) || 0, taxAmount: Number(item.taxAmount) || 0, lineTotal: Number(item.totalAmount) || 0 })),
  subtotal: Number(invoice.subtotal) || 0,
  totalDiscount: Number(invoice.discountAmount) || 0,
  totalTax: Number(invoice.taxAmount) || 0,
  totalAdditionalCharges: Number(invoice.chargesAmount) || 0,
  grandTotal: Number(invoice.totalAmount) || 0,
  amountPaid: Number(invoice.paidAmount) || 0,
  balanceDue: Number(invoice.balanceAmount) || 0,
});
const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZoneName: 'short',
  }).format(date);
};
const configFromTemplate = (template = {}, preferActiveVersion = false) => {
  const version = preferActiveVersion
    ? template.activeVersion || template.ActiveVersion || template.versions?.[0] || template.Versions?.[0] || {}
    : template.versions?.[0] || template.Versions?.[0] || template.activeVersion || template.ActiveVersion || {};
  const branding = version.branding || version.Branding || {};
  const company = version.companyDetails || version.CompanyDetails || {};
  const layout = version.layout || version.Layout || {};
  const payment = version.paymentInstructions || version.PaymentInstructions || {};
  const terms = version.terms || version.Terms || {};
  const storedDetails = String(payment.bankDetails || '').split('\n');
  const storedMethod = storedDetails.find((line) => line.startsWith('Payment method: '))?.replace('Payment method: ', '');
  const branch = storedDetails.find((line) => line.startsWith('Branch: '))?.replace('Branch: ', '') || '';
  const storedProvider = storedDetails.find((line) => line.startsWith('Payment provider: '))?.replace('Payment provider: ', '') || '';
  const paymentProvider = ['Razorpay', 'Stripe'].includes(storedProvider) ? storedProvider : storedProvider ? 'Other' : '';
  const providerName = paymentProvider === 'Other' ? storedProvider : '';
  const securePaymentLink = storedDetails.find((line) => line.startsWith('Secure payment link: '))?.replace('Secure payment link: ', '') || '';
  const cardPaymentInstructions = storedDetails.find((line) => line.startsWith('Card payment instructions: '))?.replace('Card payment instructions: ', '') || '';
  const paymentMethod = storedMethod || (payment.upiId && !payment.bankName && !payment.accountNumber ? 'UPI' : payment.bankName || payment.accountNumber ? 'Bank Transfer' : '');
  const paymentDetails = storedDetails.filter((line) => !line.startsWith('Payment method: ') && !line.startsWith('Branch: ') && !line.startsWith('Payment provider: ') && !line.startsWith('Secure payment link: ') && !line.startsWith('Card payment instructions: ')).join('\n');
  return { ...emptyConfig, name: template.name || template.Name || '', description: template.description || template.Description || '', style: typeof (template.style ?? template.Style) === 'number' ? (STYLES[(template.style ?? template.Style) - 1] || 'Standard') : (template.style || template.Style || 'Standard'), company: company.companyName || company.company || '', address: company.addressLine1 || company.address || '', email: company.email || company.Email || '', phone: company.phone || company.Phone || company.contact || company.Contact || '', website: company.website || company.Website || '', registration: company.registrationNumber || company.taxId || company.registration || '', primary: branding.primaryColor || branding.primary || emptyConfig.primary, secondary: branding.secondaryColor || branding.secondary || emptyConfig.secondary, logoName: branding.logoName || '', logoUrl: branding.logoUrl || '', logoPosition: branding.logoPosition || 'left', logoWidth: branding.logoWidth || 96, header: terms.headerText || terms.header || '', footer: terms.footerNote || terms.footer || '', paymentMethod, payment: payment.paymentNotes || payment.payment || '', accountHolderName: payment.accountHolderName || '', bankName: payment.bankName || '', accountNumber: payment.accountNumber || '', ifscCode: payment.ifscCode || '', branch, upiId: payment.upiId || '', paymentProvider, providerName, securePaymentLink, cardPaymentInstructions, paymentDetails, terms: terms.termsAndConditions || terms.terms || '', sections: { ...DEFAULT_SECTIONS, ...(layout.sections || layout.Sections || {}) } };
};
const paymentDetailsText = (config) => [config.paymentMethod && `Payment method: ${config.paymentMethod}`, config.branch && `Branch: ${config.branch}`, config.paymentProvider && `Payment provider: ${config.paymentProvider === 'Other' ? config.providerName : config.paymentProvider}`, config.securePaymentLink && `Secure payment link: ${config.securePaymentLink}`, config.cardPaymentInstructions && `Card payment instructions: ${config.cardPaymentInstructions}`, config.paymentDetails].filter(Boolean).join('\n');
const requestFromConfig = (config, extra = {}) => ({ name: config.name.trim(), description: config.description || null, style: config.style, branding: { logoUrl: config.logoUrl || null, logoName: config.logoName || null, logoPosition: config.logoPosition, logoWidth: config.logoWidth, primaryColor: config.primary, secondaryColor: config.secondary }, companyDetails: { companyName: config.company, addressLine1: config.address, email: config.email || null, phone: config.phone || null, website: config.website || null }, layout: { sections: config.sections }, paymentInstructions: { paymentNotes: null, bankDetails: paymentDetailsText(config) || null, accountHolderName: config.paymentMethod === 'Bank Transfer' ? config.accountHolderName || null : null, bankName: config.paymentMethod === 'Bank Transfer' ? config.bankName || null : null, accountNumber: config.paymentMethod === 'Bank Transfer' ? config.accountNumber || null : null, ifscCode: config.paymentMethod === 'Bank Transfer' ? config.ifscCode || null : null, upiId: config.paymentMethod === 'UPI' ? config.upiId || null : null }, terms: { headerText: config.header, footerNote: config.footer, termsAndConditions: config.terms }, sections: config.sections, ...extra });

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
  const location = useLocation();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [notice, setNotice] = useState(() => location.state?.notice || '');
  const [statusMenu, setStatusMenu] = useState(null);
  const [statusBusyId, setStatusBusyId] = useState(null);
  const [defaultBusyId, setDefaultBusyId] = useState(null);
  const [viewTemplate, setViewTemplate] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await templateApi.list({ Search: search || undefined, Status: status || undefined, Style: style || undefined, PageNumber: page, PageSize: 10 });
      setTemplates(rowsFrom(result));
      setPageCount(Math.max(1, Number(result?.totalPages || result?.TotalPages || 1)));
    } catch (requestError) { setError(asError(requestError)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [search, status, style, page]);
  const visibleTemplates = useMemo(() => templates, [templates]);
  const updateTemplateStatus = async (template) => {
    setStatusBusyId(template.id); setError('');
    try {
      const response = template.status === 2 || template.status === 'Active'
        ? await templateApi.deactivate(template.id)
        : await templateApi.activate(template.id);
      setNotice(response?.message || 'Template status updated.');
      await load();
    } catch (requestError) { setError(asError(requestError)); }
    finally { setStatusBusyId(null); setStatusMenu(null); }
  };
  const setDefaultTemplate = async (template) => {
    setDefaultBusyId(template.id); setError('');
    try {
      const response = await templateApi.setDefault(template.id);
      setNotice(response?.message || 'Template set as default for future invoice PDFs.');
      await load();
    } catch (requestError) { setError(asError(requestError)); }
    finally { setDefaultBusyId(null); setStatusMenu(null); }
  };
  const openTemplatePreview = async (template) => {
    setStatusMenu(null);
    setViewLoading(true);
    setViewError('');
    setViewTemplate({ name: template.name || template.Name || 'Template', config: null });
    try {
      const detail = await templateApi.get(template.id || template.Id);
      setViewTemplate({ name: detail.name || detail.Name || template.name || template.Name || 'Template', config: configFromTemplate(detail, true) });
    } catch (requestError) {
      setViewError(asError(requestError));
    } finally {
      setViewLoading(false);
    }
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
      {loading ? <div className="template-empty"><CircularProgress size={24} /><span>Loading templates…</span></div> : <div className="template-table-wrap"><table className="template-table"><caption className="sr-only">Invoice templates with version and status</caption><thead><tr><th scope="col">Template name</th><th scope="col">Style</th><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Last modified date</th><th scope="col">Last modified user</th><th scope="col" className="template-actions-heading">Actions</th></tr></thead><tbody>{visibleTemplates.map((template) => <tr key={template.id}><td><Link className="template-name-link" to={`/templates-branding/${template.id}/edit`}>{template.name}</Link></td><td>{typeof template.style === 'number' ? STYLES[template.style - 1] : template.style}</td><td>{template.version || `v${template.currentVersionNumber}`}</td><td>{STATUS_LABELS[template.status] || template.status}</td><td>{formatDateTime(template.lastModifiedDate || template.lastModified || template.updatedAtUtc || template.createdAtUtc)}</td><td>{template.lastModifiedUser || template.updatedBy || template.createdBy}</td><td className="template-actions-cell"><IconButton aria-label={`More actions for ${template.name}`} aria-haspopup="menu" onClick={(event) => setStatusMenu({ anchor: event.currentTarget, template })}><MoreVert /></IconButton></td></tr>)}{visibleTemplates.length === 0 && <tr><td colSpan="7"><div className="template-empty"><strong>{search || status || style ? 'No matching templates' : 'No templates available'}</strong></div></td></tr>}</tbody></table><Menu anchorEl={statusMenu?.anchor} open={Boolean(statusMenu)} onClose={() => setStatusMenu(null)}>{statusMenu && <><MenuItem onClick={() => openTemplatePreview(statusMenu.template)}>View</MenuItem>{!(statusMenu.template.isDefault || statusMenu.template.IsDefault) && <MenuItem disabled={defaultBusyId === statusMenu.template.id} onClick={() => setDefaultTemplate(statusMenu.template)}>{defaultBusyId === statusMenu.template.id ? 'Setting default…' : 'Make default'}</MenuItem>}<MenuItem disabled>Status: {STATUS_LABELS[statusMenu.template.status] || statusMenu.template.status}</MenuItem><MenuItem disabled={statusBusyId === statusMenu.template.id || defaultBusyId === statusMenu.template.id} onClick={() => updateTemplateStatus(statusMenu.template)}>{statusMenu.template.status === 2 || statusMenu.template.status === 'Active' ? 'Deactivate' : 'Activate'}</MenuItem></>}</Menu></div>}
      <div className="template-actions"><Button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</Button><span>Page {page} of {pageCount}</span><Button disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
      <p className="template-list-footnote">{visibleTemplates.length} templates shown</p>
    </section>
    <Dialog open={Boolean(viewTemplate)} onClose={viewLoading ? undefined : () => setViewTemplate(null)} maxWidth="lg" fullWidth>
      <DialogTitle>{viewTemplate ? `${viewTemplate.name} preview` : 'Template preview'}</DialogTitle>
      <DialogContent dividers>
        {viewLoading && <div className="template-empty"><CircularProgress size={24} /><span>Loading template preview…</span></div>}
        {viewError && <Alert severity="error">{viewError}</Alert>}
        {viewTemplate?.config && <SampleInvoicePreview style={viewTemplate.config.style} config={viewTemplate.config} />}
      </DialogContent>
      <DialogActions><Button onClick={() => setViewTemplate(null)} disabled={viewLoading}>Close</Button></DialogActions>
    </Dialog>
  </TemplatePage>;
}

const DEFAULT_SECTIONS = { invoiceNumber: true, invoiceDate: true, dueDate: true, customer: true, items: true, quantity: true, unitPrice: true, discount: true, tax: true, lineTotals: true, totals: true };
const emptyConfig = { name: '', style: 'Standard', description: '', company: '', address: '', email: '', phone: '', website: '', registration: '', primary: '#70472f', secondary: '#e9dfd5', header: '', footer: '', paymentMethod: '', payment: '', accountHolderName: '', bankName: '', accountNumber: '', ifscCode: '', branch: '', upiId: '', paymentProvider: '', providerName: '', securePaymentLink: '', cardPaymentInstructions: '', paymentDetails: '', terms: '', logoName: '', logoUrl: '', logoPosition: 'left', logoWidth: 96, sections: DEFAULT_SECTIONS };

const validateContactField = (key, value) => {
  const text = value.trim();
  if (key === 'email') {
    if (!text) return 'Email address is required.';
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? '' : 'Enter a valid email address.';
  }
  if (key === 'phone') {
    if (!text) return 'Phone number is required.';
    if (!/^[\d\s()+-]+$/.test(text)) return 'Phone number can contain only digits, spaces, parentheses, hyphens, and +.';
    const normalized = text.replace(/[\s()-]/g, '');
    return /^(?:\+91)?[6-9]\d{9}$/.test(normalized) ? '' : 'Enter a 10-digit Indian mobile number, optionally prefixed with +91.';
  }
  if (key === 'website') {
    if (!text) return '';
    try {
      const url = new URL(text);
      return ['http:', 'https:'].includes(url.protocol) ? '' : 'Website must start with http:// or https://.';
    } catch { return 'Enter a valid website URL, including http:// or https://.'; }
  }
  return '';
};

const validatePaymentField = (key, value) => {
  const text = value.trim();
  if (key === 'accountHolderName' || key === 'bankName' || key === 'branch') return text ? '' : 'This field is required for bank transfer.';
  if (key === 'accountNumber') return /^\d{9,18}$/.test(text) ? '' : 'Enter an account number with 9 to 18 digits.';
  if (key === 'ifscCode') return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(text.toUpperCase()) ? '' : 'Enter a valid IFSC code, for example SBIN0001234.';
  if (key === 'upiId') return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/.test(text) ? '' : 'Enter a valid UPI ID, for example name@bank.';
  if (key === 'paymentProvider') return text ? '' : 'Select a payment gateway.';
  if (key === 'providerName') return text ? '' : 'Enter the payment gateway name.';
  if (key === 'securePaymentLink') {
    try {
      const url = new URL(text);
      return ['http:', 'https:'].includes(url.protocol) ? '' : 'Payment link must start with http:// or https://.';
    } catch { return 'Enter a valid payment link, including http:// or https://.'; }
  }
  if (key === 'cardPaymentInstructions') return text ? '' : 'Enter instructions for the customer.';
  if (key === 'paymentDetails') return text ? '' : 'Enter the payment details for this payment method.';
  return '';
};
const paymentFieldsForMethod = (method, provider = '') => method === 'Bank Transfer'
  ? ['accountHolderName', 'bankName', 'accountNumber', 'ifscCode', 'branch']
  : method === 'UPI' ? ['upiId']
    : method === 'Credit/Debit Card' ? ['paymentProvider', ...(provider === 'Other' ? ['providerName'] : []), 'securePaymentLink', 'cardPaymentInstructions']
      : [];
const validateTemplateSubmission = (config) => {
  const errors = {};
  if (!config.name?.trim()) errors.name = 'Template name is required.';
  ['email', 'phone', 'website'].forEach((key) => {
    const error = validateContactField(key, config[key] || '');
    if (error) errors[key] = error;
  });
  paymentFieldsForMethod(config.paymentMethod, config.paymentProvider).forEach((key) => {
    const error = validatePaymentField(key, config[key] || '');
    if (error) errors[key] = error;
  });
  return errors;
};

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

function BrandingFields({ value, onChange, onBlur, errors = {}, onLogoChange, onLogoError }) {
  const text = (key) => ({ value: value[key], onChange: (event) => onChange(key, event.target.value), onBlur: () => onBlur?.(key, value[key]) });
  return <>
    <h3>Company details</h3><div className="template-fields"><TextField label="Company or organization name" {...text('company')} fullWidth /><TextField label="Address" {...text('address')} multiline minRows={2} fullWidth /><TextField label="Email address" type="email" required error={Boolean(errors.email)} helperText={errors.email} {...text('email')} fullWidth /><TextField label="Phone number" type="tel" required error={Boolean(errors.phone)} helperText={errors.phone} {...text('phone')} fullWidth /><TextField label="Website (optional)" type="url" error={Boolean(errors.website)} helperText={errors.website} {...text('website')} fullWidth /></div>
    <h3>Logo and colors</h3><label className="template-upload"><ImageOutlined /><span>{value.logoName || 'Choose image for sample preview'}</span><input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={onLogoChange} aria-label="Choose an image for sample preview" /></label>{value.logoUrl && <img className="template-logo-preview" style={{ width: value.logoWidth, objectPosition: value.logoPosition }} src={value.logoUrl} alt="Selected logo sample preview" onError={onLogoError} />}
    <div className="template-fields template-logo-controls"><TextField label="Logo position" select {...text('logoPosition')}><MenuItem value="left">Left</MenuItem><MenuItem value="center">Center</MenuItem><MenuItem value="right">Right</MenuItem></TextField><TextField label="Logo preview width (px)" type="number" inputProps={{ min: 48, max: 240 }} value={value.logoWidth} onChange={(event) => onChange('logoWidth', Math.min(240, Math.max(48, Number(event.target.value) || 48)))} /></div>
    <div className="template-color-fields"><TextField label="Primary color" type="color" {...text('primary')} /><TextField label="Secondary color" type="color" {...text('secondary')} /></div>
    {colorContrast(value.primary) < 4.5 && <Alert severity="warning" role="status">This primary color may have low contrast against white. Review the sample preview for readability.</Alert>}
    <h3>Invoice content</h3><div className="template-fields"><TextField label="Header text" {...text('header')} multiline minRows={2} fullWidth /><TextField label="Payment method" select value={value.paymentMethod} onChange={(event) => onChange('paymentMethod', event.target.value)} fullWidth><MenuItem value="">Select payment method</MenuItem>{['Bank Transfer', 'UPI', 'Credit/Debit Card'].map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}</TextField>{value.paymentMethod === 'Bank Transfer' && <><TextField label="Account holder name" required error={Boolean(errors.accountHolderName)} helperText={errors.accountHolderName} {...text('accountHolderName')} fullWidth /><TextField label="Bank name" required error={Boolean(errors.bankName)} helperText={errors.bankName} {...text('bankName')} fullWidth /><TextField label="Account number" required inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 18 }} error={Boolean(errors.accountNumber)} helperText={errors.accountNumber} {...text('accountNumber')} fullWidth /><TextField label="IFSC code" required inputProps={{ maxLength: 11 }} error={Boolean(errors.ifscCode)} helperText={errors.ifscCode} {...text('ifscCode')} fullWidth /><TextField label="Branch" required error={Boolean(errors.branch)} helperText={errors.branch} {...text('branch')} fullWidth /></>}{value.paymentMethod === 'UPI' && <TextField label="UPI ID" required error={Boolean(errors.upiId)} helperText={errors.upiId} {...text('upiId')} fullWidth />}{value.paymentMethod === 'Credit/Debit Card' && <><h3>Card Payment</h3><TextField label="Payment Gateway" select required error={Boolean(errors.paymentProvider)} helperText={errors.paymentProvider} value={value.paymentProvider} onChange={(event) => onChange('paymentProvider', event.target.value)} fullWidth><MenuItem value="">Select payment gateway</MenuItem><MenuItem value="Razorpay">Razorpay</MenuItem><MenuItem value="Stripe">Stripe</MenuItem><MenuItem value="Other">Other</MenuItem></TextField>{value.paymentProvider === 'Other' && <TextField label="Provider name" required error={Boolean(errors.providerName)} helperText={errors.providerName} {...text('providerName')} fullWidth />}<TextField label="Payment Link" type="url" placeholder="https://pay.example.com/..." required error={Boolean(errors.securePaymentLink)} helperText={errors.securePaymentLink} {...text('securePaymentLink')} fullWidth /><TextField label="Instructions for Customer" placeholder="Click the payment link to securely pay using your Credit or Debit Card." required error={Boolean(errors.cardPaymentInstructions)} helperText={errors.cardPaymentInstructions} {...text('cardPaymentInstructions')} multiline minRows={2} fullWidth /><Alert severity="info">Customers will enter their card number, expiry date and CVV securely on the payment provider's checkout page. Card details are not stored in the invoice template.</Alert></>}<TextField label="Terms and conditions" {...text('terms')} multiline minRows={3} fullWidth /><TextField label="Footer text" {...text('footer')} multiline minRows={2} fullWidth /></div>
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
  const [saved, setSaved] = useState(false);
  const update = (key, value) => setConfig((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    if (!edit) return;
    let active = true;
    templateApi.get(templateId).then((template) => { if (active) setConfig(configFromTemplate(template)); }).catch((error) => { if (active) setApiError(asError(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [edit, templateId]);
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
    <form className="template-form-card" onSubmit={(event) => { event.preventDefault(); validate(); }} noValidate>
      <div className="template-section-title"><div><h2>{edit ? 'Edit configuration' : 'New configuration'}</h2></div><Chip label={saved ? 'Saved' : 'Unsaved'} size="small" /></div>
      <BasicTemplateFields value={config} onChange={update} errors={errors} />
      <div className="template-actions"><Button variant="outlined" onClick={continueToBranding}>Continue to Branding Settings</Button><Button variant="contained" disabled={saving || loading} onClick={save}>{saving ? 'Saving…' : edit ? 'Save changes' : 'Save as draft'}</Button></div>
    </form>
  </TemplatePage>;
}

export function CreateTemplate() { return <EditorScreen mode="create" />; }
export function EditTemplate() { return <EditorScreen mode="edit" />; }

export function BrandingSettings() {
  const location = useLocation();
  const navigate = useNavigate();
  const [config, setConfig] = useState(() => ({ ...emptyConfig, ...location.state?.config, sections: { ...DEFAULT_SECTIONS, ...location.state?.config?.sections } }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [logoError, setLogoError] = useState('');
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const templateId = location.state?.templateId;
  const update = (key, value) => {
    if (key === 'accountNumber') value = value.replace(/\D/g, '');
    if (key === 'ifscCode') value = value.toUpperCase();
    setConfig((current) => key === 'paymentMethod' ? {
      ...current,
      paymentMethod: value,
      accountHolderName: '', bankName: '', accountNumber: '', ifscCode: '', branch: '', upiId: '',
      paymentProvider: '', providerName: '', securePaymentLink: '', cardPaymentInstructions: '', paymentDetails: '',
    } : { ...current, [key]: value });
    if (key === 'paymentMethod') setFieldErrors((current) => {
      const next = { ...current };
      ['accountHolderName', 'bankName', 'accountNumber', 'ifscCode', 'branch', 'upiId', 'paymentProvider', 'providerName', 'securePaymentLink', 'cardPaymentInstructions', 'paymentDetails'].forEach((field) => delete next[field]);
      return next;
    });
    if (['email', 'phone', 'website'].includes(key)) setFieldErrors((current) => ({ ...current, [key]: validateContactField(key, value) }));
    if (paymentFieldsForMethod(config.paymentMethod, config.paymentProvider).includes(key)) setFieldErrors((current) => ({ ...current, [key]: validatePaymentField(key, value) }));
  };
  const validateField = (key, value) => {
    if (['email', 'phone', 'website'].includes(key)) setFieldErrors((current) => ({ ...current, [key]: validateContactField(key, value) }));
    if (paymentFieldsForMethod(config.paymentMethod, config.paymentProvider).includes(key)) setFieldErrors((current) => ({ ...current, [key]: validatePaymentField(key, value) }));
  };
  const validateContactDetails = () => {
    const next = ['email', 'phone', 'website'].reduce((errors, key) => {
      const error = validateContactField(key, config[key] || '');
      if (error) errors[key] = error;
      return errors;
    }, {});
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };
  const validatePaymentDetails = () => {
    const next = paymentFieldsForMethod(config.paymentMethod, config.paymentProvider).reduce((errors, key) => {
      const error = validatePaymentField(key, config[key] || '');
      if (error) errors[key] = error;
      return errors;
    }, {});
    setFieldErrors((current) => ({ ...current, ...next }));
    return Object.keys(next).length === 0;
  };
  const onLogoChange = async (event) => {
    const file = event.target.files?.[0];
    // Clear the input so choosing the same file again still fires a change event.
    event.target.value = '';
    setLogoError('');
    if (file && !['image/png', 'image/jpeg'].includes(file.type) && !/\.(png|jpe?g)$/i.test(file.name)) setLogoError('Choose a JPG or PNG image.');
    else if (file && file.size > 2 * 1024 * 1024) setLogoError('The logo must be no larger than 2 MB.');
    else if (file) {
      setLogoBusy(true);
      try {
        // Keep a local data URL for the sample preview immediately; the preview
        // route receives config through router state and must not depend on an upload URL.
        const localUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('The selected image could not be read.'));
          reader.readAsDataURL(file);
        });
        setConfig((current) => ({ ...current, logoName: file.name, logoUrl: localUrl }));
        try {
          const result = await templateApi.uploadLogo(file);
          const uploadedUrl = result?.logoUrl || result?.LogoUrl;
          if (uploadedUrl) setConfig((current) => ({ ...current, logoUrl: uploadedUrl }));
        } catch (error) {
          // Local preview remains usable even if the optional server upload fails.
          setLogoError(asError(error));
        }
      } catch (error) { setLogoError(asError(error)); }
      finally { setLogoBusy(false); }
    }
  };
  const onLogoError = () => {
    setLogoError('This image could not be rendered in the preview. Other form values were kept.');
    setConfig((current) => ({ ...current, logoName: '', logoUrl: '' }));
  };
  const review = () => navigate(`/templates-branding/preview?style=${encodeURIComponent(config.style)}`, { state: { config, templateId } });
  const save = async () => {
    if (!config.name.trim()) { setApiError('Template name is required. Set it in Create template before saving branding.'); return; }
    if (!validateContactDetails() || !validatePaymentDetails()) { setApiError('Correct the highlighted company or payment details before saving branding.'); return; }
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
      <BrandingFields value={config} onChange={update} onBlur={validateField} errors={fieldErrors} onLogoChange={onLogoChange} onLogoError={onLogoError} />
      {logoBusy && <Alert severity="info">Uploading logo…</Alert>}{apiError && <Alert severity="error" onClose={() => setApiError('')}>{apiError}</Alert>}{notice && <Alert severity="success">{notice}</Alert>}
      {logoError && <Alert severity="error" role="alert">{logoError}</Alert>}
      <div className="template-actions"><Button variant="outlined" startIcon={<VisibilityOutlined />} onClick={review}>Review template sample</Button><Button variant="contained" disabled={saving || logoBusy} onClick={save}>{saving ? 'Saving…' : 'Save branding'}</Button></div>
    </div>
  </TemplatePage>;
}

function SampleInvoicePreview({ style, config = {}, invoice = null, long = false }) {
  config = { ...config, contact: [config.email, config.phone, config.website].filter(Boolean).join(' · ') || config.contact, bankDetails: paymentDetailsText(config) || config.bankDetails };
  const primary = config.primary || '#70472f';
  const secondary = config.secondary || '#e9dfd5';
  const sections = { ...DEFAULT_SECTIONS, ...config.sections };
  const isRealInvoice = Boolean(invoice);
  const currency = invoice?.currency || 'INR';
  const items = invoice?.items || [];
  const customer = invoice?.customer || {};
  const columns = [
    { key: 'description', title: 'Description' },
    ...(sections.quantity ? [{ key: 'quantity', title: 'Qty' }] : []),
    ...(sections.unitPrice ? [{ key: 'unitPrice', title: 'Unit price' }] : []),
    ...(sections.discount ? [{ key: 'discount', title: 'Discount' }] : []),
    ...(sections.tax ? [{ key: 'tax', title: 'Tax' }] : []),
    ...(sections.lineTotals ? [{ key: 'amount', title: 'Amount' }] : []),
  ];
  const sampleRows = isRealInvoice ? items : Array.from({ length: long ? 14 : 2 }, (_, index) => index);
  return <article className={'invoice-sample style-' + style.toLowerCase()} style={{ '--template-primary': primary, '--template-secondary': secondary }} aria-label={style + (isRealInvoice ? ' invoice layout' : ' sample invoice layout')}>
    <div className="sample-brand"><div className={'sample-identity position-' + (config.logoPosition || 'left')}>{config.logoUrl && <img onError={() => {}} src={config.logoUrl} alt="Selected company logo sample" style={{ width: config.logoWidth || 96 }} />}<div><strong>{config.company || 'Sample Company Ltd.'}</strong>{config.header && <span>{config.header}</span>}<span>{config.address || '42 Example Road, Sample City'}</span><span>{config.contact || 'billing@example.test · +00 000 000 0000'}</span></div></div><div className="sample-title"><span>INVOICE</span>{sections.invoiceNumber && <b>{invoice?.invoiceNumber || 'INV-SAMPLE-001'}</b>}</div></div>
    <div className="sample-meta">{sections.customer && <div><small>BILL TO</small><strong>{customer.name || 'Sample Customer Ltd.'}</strong><span>{customer.email || 'accounts@example.test'}</span><span>{customerAddress(customer) || '100 Market Street, Sample City'}</span></div>}<div>{sections.invoiceDate && <span><b>Invoice date</b> {isRealInvoice ? formatPreviewDate(invoice.invoiceDate) : '30 Sep 2026'}</span>}{sections.dueDate && <span><b>Due date</b> {isRealInvoice ? formatPreviewDate(invoice.dueDate) : '30 Oct 2026'}</span>}</div></div>
    {sections.items && <table className="sample-lines"><thead><tr>{columns.map((column) => <th key={column.key}>{column.title}</th>)}</tr></thead><tbody>{isRealInvoice && !items.length ? <tr><td colSpan={columns.length} className="sample-empty-row">This invoice has no line items.</td></tr> : sampleRows.map((item, index) => <Fragment key={isRealInvoice ? item.id || index : 'sample-fragment-' + item}>{!isRealInvoice && long && item === 7 && <tr className="sample-page-marker"><td colSpan={columns.length}>Page 1 boundary · Page 2 continues below; the column heading repeats</td></tr>}<tr><td>{isRealInvoice ? item.description || 'Invoice item' : item === 0 ? 'Representative service item with a longer description' : 'Sample invoice line item ' + (item + 1) + ' with description wrapping'}</td>{sections.quantity && <td>{isRealInvoice ? item.quantity : item + 1}</td>}{sections.unitPrice && <td>{isRealInvoice ? previewMoney(item.unitPrice, currency) : '₹500.00'}</td>}{sections.discount && <td>{isRealInvoice ? previewMoney(item.discountAmount, currency) : 'Sample'}</td>}{sections.tax && <td>{isRealInvoice ? previewMoney(item.taxAmount, currency) : 'Sample'}</td>}{sections.lineTotals && <td>{isRealInvoice ? previewMoney(item.totalAmount, currency) : '₹500.00'}</td>}</tr></Fragment>)}</tbody></table>}
    <div className="sample-bottom"><div>{config.bankDetails && <><b>Payment details</b><p>{config.bankDetails}</p></>}<b>Terms and conditions</b><p className="sample-copy">{config.terms || 'Sample terms are shown for layout only. Add longer terms in the editor to inspect wrapping.'}</p></div>{sections.totals && <div className="sample-totals"><span>Subtotal <b>{isRealInvoice ? previewMoney(invoice.subtotal, currency) : '₹1,250.00'}</b></span>{isRealInvoice && Number(invoice.discountAmount) > 0 && <span>Discount <b>{previewMoney(invoice.discountAmount, currency)}</b></span>}<span>Tax <b>{isRealInvoice ? previewMoney(invoice.taxAmount, currency) : '₹225.00'}</b></span><span className="sample-total">Total <b>{isRealInvoice ? previewMoney(invoice.totalAmount, currency) : '₹1,475.00'}</b></span></div>}</div><footer>{config.footer || 'Sample footer · Thank you for your business.'}</footer>
  </article>;
}

export function TemplatePreview() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const config = location.state?.config;
  const brandingTemplateId = location.state?.templateId;
  const navigate = useNavigate();
  const [style, setStyle] = useState(STYLES.includes(searchParams.get('style')) ? searchParams.get('style') : 'Standard');
  const [pdf, setPdf] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [officialPdfBusy, setOfficialPdfBusy] = useState(false);
  const [officialPdfError, setOfficialPdfError] = useState('');
  const [officialPdfNotice, setOfficialPdfNotice] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const templateId = searchParams.get('templateId');
  const [templateOptions, setTemplateOptions] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => String(templateId || brandingTemplateId || ''));
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedTemplateLoading, setSelectedTemplateLoading] = useState(Boolean(templateId || brandingTemplateId));
  const [selectedTemplateError, setSelectedTemplateError] = useState('');
  useEffect(() => {
    let active = true;
    templateApi.list({ PageNumber: 1, PageSize: 100 }).then((result) => {
      if (active) setTemplateOptions(rowsFrom(result));
    }).catch((error) => {
      if (active) setTemplatesError(asError(error));
    }).finally(() => {
      if (active) setTemplatesLoading(false);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!selectedTemplateId) {
      setSelectedTemplate(null);
      setSelectedTemplateError('');
      setPdf(null);
      setSelectedTemplateLoading(false);
      return undefined;
    }
    let active = true;
    setSelectedTemplateLoading(true);
    setSelectedTemplateError('');
    setSelectedTemplate(null);
    setPdf(null);
    templateApi.get(selectedTemplateId).then((template) => {
      if (!active) return;
      setSelectedTemplate(template);
      const templateStyle = configFromTemplate(template, true).style;
      if (STYLES.includes(templateStyle)) setStyle(templateStyle);
    }).catch((error) => {
      if (active) setSelectedTemplateError(asError(error));
    }).finally(() => {
      if (active) setSelectedTemplateLoading(false);
    });
    return () => { active = false; };
  }, [selectedTemplateId]);
  useEffect(() => {
    let active = true;
    invoiceApi.getInvoices({ page: 1, pageSize: 100, sortBy: 'InvoiceDate', sortOrder: 'desc' }).then((result) => {
      if (active) setInvoices(rowsFrom(result));
    }).catch((error) => {
      if (active) setInvoicesError(asError(error));
    }).finally(() => {
      if (active) setInvoicesLoading(false);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!selectedInvoiceId) {
      setSelectedInvoice(null);
      setInvoiceError('');
      setPdf(null);
      return undefined;
    }
    let active = true;
    setInvoiceLoading(true);
    setInvoiceError('');
    setSelectedInvoice(null);
    setPdf(null);
    invoiceApi.getInvoiceById(selectedInvoiceId).then((invoice) => {
      if (active) setSelectedInvoice(invoice);
    }).catch((error) => {
      if (active) setInvoiceError(asError(error));
    }).finally(() => {
      if (active) setInvoiceLoading(false);
    });
    return () => { active = false; };
  }, [selectedInvoiceId]);
  const previewConfig = selectedTemplate ? configFromTemplate(selectedTemplate, true) : emptyConfig;
  const renderPdf = async () => {
    if (!selectedInvoice || !selectedTemplate) {
      setPreviewError('Select an invoice and a saved template before generating the PDF preview.');
      return;
    }
    setPreviewBusy(true);
    setPreviewError('');
    setPdf(null);
    try {
      const requestConfig = { ...emptyConfig, ...previewConfig, style };
      const blob = await templateApi.preview({ ...requestFromConfig(requestConfig), customSampleData: invoiceSnapshotFromInvoice(selectedInvoice) });
      setPdf(blob);
    } catch (error) { setPreviewError(asError(error)); }
    finally { setPreviewBusy(false); }
  };
  const generateOfficialPdf = async () => {
    if (!selectedInvoice || !selectedTemplateId) {
      setOfficialPdfError('Select an invoice and a saved template before generating the official PDF.');
      return;
    }
    setOfficialPdfBusy(true);
    setOfficialPdfError('');
    setOfficialPdfNotice('');
    try {
      await templateApi.generateInvoicePdf(selectedInvoice.id, {
        invoiceId: selectedInvoice.id,
        overrideTemplateId: Number(selectedTemplateId),
        forceRegenerate: false,
      });
      const blob = await templateApi.downloadInvoicePdf(selectedInvoice.id, true);
      if (!blob?.size || !blob.type?.includes('pdf')) throw new Error('The server did not return an invoice PDF.');
      setPdf(blob);
      setOfficialPdfNotice('Official PDF generated using ' + (selectedTemplate.name || selectedTemplate.Name) + '.');
    } catch (error) { setOfficialPdfError(asError(error)); }
    finally { setOfficialPdfBusy(false); }
  };
  const backToBranding = () => navigate('/templates-branding/branding', { state: { config: { ...config, style }, templateId: brandingTemplateId } });
  const submit = async () => {
    if (!config) { setSubmitError('Open the review screen from Branding Settings before submitting a template.'); return; }
    const submitConfig = { ...emptyConfig, ...config, style };
    const errors = validateTemplateSubmission(submitConfig);
    if (Object.keys(errors).length) { setSubmitError(Object.values(errors).join(' ')); return; }
    setSubmitBusy(true); setSubmitError('');
    try {
      const request = requestFromConfig(submitConfig);
      if (brandingTemplateId) await templateApi.update(brandingTemplateId, { ...request, changeDescription: 'Submitted from template review' });
      else await templateApi.create(request);
      navigate('/templates-branding', { state: { notice: 'Template submitted successfully.' } });
    } catch (error) { setSubmitError(asError(error)); }
    finally { setSubmitBusy(false); }
  };
  return <TemplatePage title="Template preview" description="Select an invoice and saved template to generate the server PDF preview.">
    <section className="template-preview-card"><div className="template-section-title"><div><h2>Invoice PDF preview</h2></div></div>
      <div className="template-preview-controls"><TextField label="Select Invoice" select value={selectedInvoiceId} onChange={(event) => setSelectedInvoiceId(event.target.value)} size="small" disabled={invoicesLoading} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}><MenuItem value="">{invoicesLoading ? 'Loading invoices…' : 'Select an invoice'}</MenuItem>{invoices.map((invoice) => <MenuItem key={invoice.id} value={String(invoice.id)}>{(invoice.invoiceNumber || 'Draft #' + invoice.id) + ' - ' + (invoice.customer?.name || 'Customer')}</MenuItem>)}</TextField><TextField label="Select Template" select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} size="small" disabled={templatesLoading} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}><MenuItem value="">{templatesLoading ? 'Loading templates…' : 'Select a template'}</MenuItem>{templateOptions.map((template) => <MenuItem key={template.id || template.Id} value={String(template.id || template.Id)}>{template.name || template.Name}</MenuItem>)}</TextField><Button variant="contained" disabled={!selectedInvoice || !selectedTemplate || previewBusy || invoiceLoading || selectedTemplateLoading} onClick={renderPdf}>{previewBusy ? 'Rendering PDF…' : 'Generate server PDF preview'}</Button>{selectedInvoice?.status !== 'Draft' && <Button variant="outlined" disabled={!selectedTemplate || officialPdfBusy || invoiceLoading || selectedTemplateLoading} onClick={generateOfficialPdf}>{officialPdfBusy ? 'Generating official PDF…' : 'Generate official PDF'}</Button>}{pdf && <Button variant="outlined" onClick={() => setPdf(null)}>Back to Preview Settings</Button>}</div>
      {invoicesError && <Alert severity="error">Unable to load invoices: {invoicesError}</Alert>}{templatesError && <Alert severity="error">Unable to load templates: {templatesError}</Alert>}{selectedTemplateError && <Alert severity="error">Unable to load the selected template: {selectedTemplateError}</Alert>}{!invoicesLoading && !invoicesError && !invoices.length && <div className="template-empty"><strong>No invoices available.</strong><span>Create an invoice to preview it with this template.</span></div>}{!templatesLoading && !templatesError && !templateOptions.length && <div className="template-empty"><strong>No templates available.</strong><span>Create a template before generating a PDF preview.</span></div>}{invoiceError && <Alert severity="error">Unable to load the selected invoice: {invoiceError}</Alert>}{invoiceLoading && <div className="template-inline-loading"><CircularProgress size={20} /><span>Loading selected invoice…</span></div>}{selectedTemplateLoading && <div className="template-inline-loading"><CircularProgress size={20} /><span>Loading selected template…</span></div>}{previewError && <Alert severity="error">{previewError}</Alert>}{officialPdfError && <Alert severity="error">{officialPdfError}</Alert>}{officialPdfNotice && <Alert severity="success">{officialPdfNotice}</Alert>}{submitError && <Alert severity="error" role="alert">{submitError}</Alert>}{pdf && <div className="template-live-preview"><PdfPreview blob={pdf} /></div>}
      {config && <div className="template-actions"><Button variant="outlined" onClick={backToBranding} disabled={submitBusy}>Back to Branding Settings</Button><Button variant="contained" onClick={submit} disabled={submitBusy}>{submitBusy ? 'Submitting…' : 'Submit Template'}</Button></div>}
    </section>
  </TemplatePage>;
}

function PdfPreview({ blob }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url ? <iframe title="Server generated invoice PDF preview" src={url} style={{ width: '100%', height: 680, border: 0 }} /> : null;
}

export function TemplateVersionHistory() {
  const [searchParams] = useSearchParams();
  const [templateId, setTemplateId] = useState(searchParams.get('templateId') || '');
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState('');
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    templateApi.list({ PageNumber: 1, PageSize: 100 }).then((result) => {
      if (active) setTemplates(rowsFrom(result));
    }).catch((requestError) => {
      if (active) setTemplatesError(asError(requestError));
    }).finally(() => { if (active) setTemplatesLoading(false); });
    return () => { active = false; };
  }, []);
  const load = async (selectedTemplateId = templateId) => {
    if (!selectedTemplateId) { setError('Select a template to view its version history.'); return; }
    setLoading(true); setError('');
    try { const result = await templateApi.getVersions(selectedTemplateId); setVersions(Array.isArray(result) ? result : result?.items || result?.Items || []); }
    catch (requestError) { setError(asError(requestError)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (templateId) load(); }, []);
  const selectTemplate = (event) => {
    const selectedTemplateId = event.target.value;
    setTemplateId(selectedTemplateId); setVersions([]); setError('');
    if (selectedTemplateId) load(selectedTemplateId);
  };
  const selectedTemplate = templates.find((template) => String(template.id || template.Id) === String(templateId));
  return <TemplatePage title="Template version history" description={selectedTemplate ? `Version history for ${selectedTemplate.name || selectedTemplate.Name}` : 'Review active and historical template versions.'}>
    <section className="template-list-card"><div className="template-section-title"><div><h2>Versions</h2></div></div>
      <div className="template-preview-controls"><TextField size="small" label="Select Template" select value={templateId} onChange={selectTemplate} disabled={templatesLoading} helperText={templatesLoading ? 'Loading templates…' : undefined} sx={{ minWidth: 360 }}><MenuItem value="">Select a template</MenuItem>{templates.map((template) => <MenuItem key={template.id || template.Id} value={String(template.id || template.Id)}>{template.name || template.Name}</MenuItem>)}</TextField></div>
      {templatesError && <Alert severity="error">Unable to load templates: {templatesError}</Alert>}{error && <Alert severity="error">{error}</Alert>}{!templatesLoading && !templatesError && !templates.length && <Alert severity="info">No templates available.</Alert>}{templatesLoading || loading ? <div className="template-empty"><CircularProgress size={24} /></div> : templateId && <div className="template-table-wrap"><table className="template-table"><thead><tr><th>Version</th><th>Status</th><th>Description</th><th>Created</th><th>Created by</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id || version.Id}><td>{version.version || `v${version.versionNumber}`}</td><td>{STATUS_LABELS[version.status] || version.status}</td><td>{version.versionDescription || version.changeDescription || '—'}</td><td>{version.createdAtUtc || version.createdDate}</td><td>{version.createdBy || '—'}</td></tr>)}{!versions.length && !error && <tr><td colSpan="5"><div className="template-empty"><strong>No version history available for this template.</strong></div></td></tr>}</tbody></table></div>}
    </section>
  </TemplatePage>;
}

export function TemplateAuditHistory() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    templateApi.getAudit().then((result) => { if (active) setLogs(Array.isArray(result) ? result : result?.items || result?.Items || []); }).catch((requestError) => { if (active) setError(asError(requestError)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <TemplatePage title="Audit & traceability" description="">
    <section className="template-list-card" aria-labelledby="template-audit-heading">
      <div className="template-section-title"><div><h2 id="template-audit-heading">Template and document activity</h2></div></div>
      {error && <Alert severity="error">{error}</Alert>}<div className="template-table-wrap"><table className="template-table"><caption className="sr-only">Template and invoice document audit history</caption><thead><tr><th scope="col">Event</th><th scope="col">Date and time</th><th scope="col">Performed by</th><th scope="col">Changes / result</th><th scope="col">Template version / document</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id || log.Id}><td>{log.event}</td><td>{log.dateAndTime}</td><td>{log.performedBy}</td><td>{log.changesOrResult}</td><td>{log.templateVersionOrDocument}</td></tr>)}{!logs.length && !loading && !error && <tr><td colSpan="5"><div className="template-empty"><strong>No template activity available</strong></div></td></tr>}{loading && <tr><td colSpan="5"><div className="template-empty"><CircularProgress size={24} /></div></td></tr>}</tbody></table></div>
    </section>
  </TemplatePage>;
}
