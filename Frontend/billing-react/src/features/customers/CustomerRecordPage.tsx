import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Alert, Avatar, Button, MenuItem, Skeleton, TextField } from '@mui/material';
import { ArrowBack, EditOutlined, ReceiptLongOutlined, PersonOutline, BusinessOutlined, AccountBalanceWalletOutlined, DescriptionOutlined, CheckCircleOutline, MailOutline, PhoneOutlined } from '@mui/icons-material';
import { createCustomer, getCustomerById, getCustomerDetails, updateCustomer } from './customerApi';
import { money, StatusChip } from './CustomerListPage';
import type { Customer } from './types';

const schema = yup.object({
  name: yup.string().trim().required('Customer name is required'),
  customerType: yup.string().default(''),
  companyName: yup.string().trim().default(''), email: yup.string().trim().email('Enter a valid email').required('Email is required'),
  mobile: yup.string().matches(/^\+?[\d\s()-]{10,18}$/, 'Enter a valid phone number').required(),
  gstin: yup.string().uppercase().matches(/^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, 'Enter a valid 15-character GSTIN').default(''),
  taxId: yup.string().trim().default(''), creditLimit: yup.number().transform((value, original) => original === '' ? 0 : value).min(0).typeError('Enter a valid amount').default(0),
  paymentTerms: yup.string().required().default('Net 30'), currency: yup.string().oneOf<string>(['INR']).default('INR'), notes: yup.string().default(''),
});
type FormValues = yup.InferType<typeof schema>;
export function CustomerRecordPage({ mode }: { mode: 'new' | 'edit' | 'view' }) {
  const { customerId = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['customers', mode === 'view' ? 'details' : 'detail', customerId], queryFn: ({ signal }) => mode === 'view' ? getCustomerDetails(customerId, signal) : getCustomerById(customerId, signal), enabled: mode !== 'new', retry: false });
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({ resolver: yupResolver(schema), defaultValues: { name: '', companyName: '', customerType: '', email: '', mobile: '', gstin: '', taxId: '', creditLimit: 0, paymentTerms: 'Net 30', currency: 'INR', notes: '' } });
  useEffect(() => { if (query.data) reset({ ...query.data, creditLimit: query.data.creditLimit ?? 0, currency: query.data.currency || 'INR', paymentTerms: query.data.paymentTerms || 'Net 30' }); }, [query.data, reset]);
  const mutation = useMutation({ mutationFn: (values: FormValues) => mode === 'new' ? createCustomer(values as Partial<Customer>) : updateCustomer(customerId, values as Partial<Customer>, query.data), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['customers'] }); navigate('/customers', { state: { customerNotice: mode === 'new' ? 'Customer created successfully.' : 'Customer updated successfully.' } }); } });
  if (mode !== 'new' && query.isLoading) return <main className="customers-page"><Skeleton height={100} /><Skeleton height={400} /></main>;
  if (mode !== 'new' && query.isError) return <main className="customers-page"><Link to="/customers">Back to customers</Link><Alert severity="error">{query.error.message}</Alert><Button onClick={() => query.refetch()}>Retry</Button></main>;
  const customer = query.data;
  const preview = mode === 'view' && customer ? customer : watch();
  const initials = (preview.name || 'New Customer').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('');
  const field = (key: keyof FormValues, label: string, required = false, placeholder = '') => <TextField fullWidth size="small" disabled={key === 'creditLimit'} label={label} required={required} placeholder={placeholder} {...register(key)} error={!!errors[key]} helperText={errors[key]?.message || (key === 'creditLimit' ? 'Not supported by the current API' : undefined)} type={key === 'creditLimit' ? 'number' : key === 'email' ? 'email' : key === 'mobile' ? 'tel' : 'text'} InputLabelProps={{ shrink: true }} />;
  const details = (values: Record<string, string | undefined>) => <dl className="cr-details">{Object.entries(values).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>;
  const sectionTitle = (icon: ReactNode, title: string, subtitle: string) => <div className="cr-section-title"><span>{icon}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>;
  return <main className="customers-page customer-record-page">
    <nav className="customers-breadcrumb" aria-label="Breadcrumb"><Link to="/dashboard">Billing</Link><span>/</span><Link to="/customers">Customers</Link><span>/</span><strong>{mode === 'new' ? 'Add customer' : mode === 'edit' ? 'Edit customer' : 'Customer details'}</strong></nav>
    <header className="customers-heading"><div><span className="cr-eyebrow">CUSTOMER WORKSPACE</span><h1>{mode === 'new' ? 'Add a new customer' : mode === 'edit' ? 'Edit customer' : 'Customer overview'}</h1><p>{mode === 'view' ? 'Contact details, billing preferences and account information.' : 'A few details now. Smoother billing from here.'}</p></div><Button variant="outlined" startIcon={<ArrowBack />} onClick={() => navigate('/customers')}>Back to customers</Button></header>
    <div className="cr-layout">
      <aside className="cr-sidebar">
        <section className="customer-panel cr-profile">
          <div className="cr-profile-cover" /><Avatar className="cr-profile-avatar">{initials}</Avatar>
          <div className="cr-profile-copy"><span className="cr-eyebrow">{mode === 'new' ? 'NEW CUSTOMER' : customer?.customerCode}</span><h2>{preview.name || 'Your new customer'}</h2><p>{preview.companyName || 'Customer account'}</p><div className="cr-profile-badges"><span className="customer-type">{preview.customerType || 'Not provided'}</span>{customer && <StatusChip status={customer.status} />}</div></div>
          <div className="cr-profile-contact"><div><MailOutline /><span>{preview.email || 'Email address'}</span></div><div><PhoneOutlined /><span>{preview.mobile || 'Mobile number'}</span></div></div>
          {mode === 'view' && customer && <div className="cr-profile-actions"><Button fullWidth variant="contained" startIcon={<ReceiptLongOutlined />} disabled={customer.status !== 'active'} onClick={() => navigate(`/invoices/new?customerId=${customerId}`)}>Create Invoice</Button><Button fullWidth variant="outlined" startIcon={<EditOutlined />} onClick={() => navigate(`/customers/${customerId}/edit`)}>Edit Customer</Button></div>}
        </section>
        <section className="cr-help"><CheckCircleOutline /><div><h3>{mode === 'view' ? 'A complete customer record' : 'Good details. Better billing.'}</h3><p>{mode === 'view' ? 'Keep contact and tax information current for accurate invoices.' : 'Use the billing contact’s email and registered tax details to keep invoices accurate.'}</p>{mode === 'new' && <small>Customer codes are managed by the billing service.</small>}</div></section>
      </aside>
      {mode === 'view' && customer ? <div className="cr-content">
        <section className="cr-account-stats" aria-label="Account summary"><article><span>Outstanding balance</span><strong className={(customer.outstandingBalance ?? 0) > 0 ? 'due' : ''}>{money(customer.outstandingBalance)}</strong><small>{customer.outstandingBalance == null ? 'Not provided by the API' : customer.outstandingBalance > 0 ? 'Pending collection' : 'No balance outstanding'}</small></article><article><span>Credit limit</span><strong>{money(customer.creditLimit)}</strong><small>Approved account limit</small></article><article><span>Payment terms</span><strong>{customer.paymentTerms || 'Not set'}</strong><small>Billed in {customer.currency}</small></article></section>
        <section className="customer-panel cr-section">{sectionTitle(<PersonOutline />, 'Contact information', 'The people and business behind this account.')}{details({ 'Customer name': customer.name, 'Company name': customer.companyName, 'Email address': customer.email, 'Mobile number': customer.mobile })}</section>
        <section className="customer-panel cr-section">{sectionTitle(<BusinessOutlined />, 'Tax & registration', 'Registered details for accurate billing.')}{details({ 'GSTIN': customer.gstin, 'PAN / Registration ID': customer.taxId, 'Customer type': customer.customerType, 'Currency': customer.currency })}</section>
        <section className="customer-panel cr-section">{sectionTitle(<DescriptionOutlined />, 'Account notes', 'Additional context for your billing team.')}<p className="cr-notes">{customer.notes || 'No notes added for this customer yet.'}</p></section>
      </div> : <form className="cr-content" onSubmit={handleSubmit(values => mutation.mutate(values))} noValidate>
        <section className="customer-panel cr-section">{sectionTitle(<PersonOutline />, 'Basic information', 'Start with your customer’s contact details.')}<div className="cr-fields">{field('name', 'Customer name', true, 'e.g. Priya Sharma')}{field('companyName', 'Company name', false, 'e.g. Acme Technologies Pvt Ltd')}<TextField disabled helperText="Not supported by the current API" select size="small" label="Customer type" value={watch('customerType')} {...register('customerType')}><MenuItem value="">Not provided</MenuItem>{['business', 'individual', 'organization'].map(value => <MenuItem key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</MenuItem>)}</TextField>{field('email', 'Email address', true, 'name@company.com')}{field('mobile', 'Mobile number', true, '+91 98765 43210')}</div></section>
        <section className="customer-panel cr-section">{sectionTitle(<BusinessOutlined />, 'Tax & registration', 'Add applicable tax details for customer invoices.')}<div className="cr-fields">{field('gstin', 'GSTIN', false, '15-character GST number')}{field('taxId', 'PAN / Registration ID', false, 'Enter tax or registration ID')}</div></section>
        <section className="customer-panel cr-section">{sectionTitle(<AccountBalanceWalletOutlined />, 'Billing preferences', 'Set the default terms for this customer.')}<div className="cr-fields">{field('creditLimit', 'Credit limit (INR)')}<TextField select size="small" label="Payment terms" value={watch('paymentTerms')} {...register('paymentTerms')}>{['Due on receipt', 'Net 15', 'Net 30', 'Net 60'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField size="small" label="Currency" value="INR — Indian Rupee" InputProps={{ readOnly: true }} /></div></section>
        <section className="customer-panel cr-section">{sectionTitle(<DescriptionOutlined />, 'Additional notes', 'Useful context for your team. Optional.')}<div className="cr-fields"><TextField className="customer-form-notes" fullWidth label="Notes" placeholder="Add billing instructions or other customer details…" multiline rows={3} {...register('notes')} InputLabelProps={{ shrink: true }} /></div></section>
        {mutation.isError && <Alert severity="error">Unable to save customer. {mutation.error.message}</Alert>}
        <div className="cr-save-bar"><span><CheckCircleOutline />{mode === 'new' ? 'Ready to start a new relationship' : 'Keep your customer details up to date'}</span><div><Button disabled={mutation.isPending} onClick={() => navigate('/customers')}>Cancel</Button><Button variant="contained" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : mode === 'new' ? 'Add Customer' : 'Save Changes'}</Button></div></div>
      </form>}
    </div>
  </main>;
}
