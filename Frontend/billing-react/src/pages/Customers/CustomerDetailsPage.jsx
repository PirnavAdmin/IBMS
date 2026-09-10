import { Breadcrumbs, Button, Link, Tab, Tabs } from '@mui/material';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import { useCustomer } from '../../hooks/useCustomer';
import { CustomerState, StatusBadge } from '../../components/customers/CustomerShared';
import { CustomerOverview } from '../../components/customers/CustomerOverview';
import { CustomerAddresses } from '../../components/customers/CustomerAddresses';
import { CustomerInvoices, CustomerPayments } from '../../components/customers/CustomerTransactions';
import { CustomerStatement } from '../../components/customers/CustomerStatement';
import { CustomerAudit } from '../../components/customers/CustomerAudit';
import { DeactivateCustomerDialog } from '../../components/customers/DeactivateCustomerDialog';
import '../../styles/Customers.css';

const tabs = ['Overview', 'Addresses', 'Invoices', 'Payments', 'Statement', 'Audit'];
export function CustomerDetailsPage() {
  const { customerId } = useParams();
  const query = useCustomer(customerId);
  const [params, setParams] = useSearchParams();
  const tab = tabs.find((item) => item.toLowerCase() === params.get('tab')) || 'Overview';
  const c = query.data?.customer;
  return <main className="customer-page">
    <Breadcrumbs aria-label="Breadcrumb"><Link component={RouterLink} to="/customers" underline="hover">Back to Customers</Link><span>Customer Details</span></Breadcrumbs>
    <CustomerState query={query} />
    {query.isSuccess && <>
      <header className="customer-heading"><div><h1>{c.name || '—'}</h1><div className="customer-meta"><span>Customer Code: {c.customerCode || '—'}</span><span>{c.customerType || '—'}</span><StatusBadge value={c.status} /></div></div><div className="customer-actions"><Button variant="outlined" component={RouterLink} to={`/customers/${encodeURIComponent(customerId)}/edit`}>Edit Customer</Button><DeactivateCustomerDialog key={c.id} customer={c} /></div></header>
      <Tabs className="customer-tabs" value={tab} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Customer details tabs" onChange={(_, value) => setParams(previous => { const next = new URLSearchParams(previous); next.set("tab", value.toLowerCase()); return next; })}>{tabs.map((name) => <Tab key={name} label={name} value={name} id={`customer-tab-${name}`} aria-controls={`customer-panel-${name}`} />)}</Tabs>
      <div role="tabpanel" id={`customer-panel-${tab}`} aria-labelledby={`customer-tab-${tab}`} key={`${customerId}-${tab}`}>
        {tab === 'Overview' && <CustomerOverview record={query.data} />}
        {tab === 'Addresses' && <CustomerAddresses customer={c} />}
        {tab === 'Invoices' && <CustomerInvoices rows={query.data.invoices} />}
        {tab === 'Payments' && <CustomerPayments rows={query.data.payments} />}
        {tab === 'Statement' && <CustomerStatement record={query.data} />}
        {tab === 'Audit' && <CustomerAudit customerId={customerId} />}
      </div>
    </>}
  </main>;
}
