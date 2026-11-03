import { customerTaxRegistrationLabel } from '../utils/customerTaxRegistration';
import { FinancialSummary, InformationCard, StatusBadge, displayDate, formatCurrency } from './CustomerShared';


export function CustomerOverview({ record }) {
  const c = record.customer || {};
  const s = record.financialSummary || {};
  const currency = s.currency || c.currency || record.currency;
  const effectiveCreditLimit = s.creditLimit ?? c.creditLimit ?? record.creditLimit ?? c.CreditLimit ?? null;
  const effectiveOutstanding = s.outstandingBalance ?? c.outstandingBalance ?? null;
  const effectivePaymentTerms = c.paymentTerms || record.paymentTerms || s.paymentTerms || '—';
  return <>
    <h2 className="customer-section-heading">Financial Summary</h2>
    <FinancialSummary currency={currency} items={[[ 'Total Invoiced', s.totalInvoiced ], [ 'Total Paid', s.totalPaid ], [ 'Outstanding Balance', effectiveOutstanding, true ], ...(effectiveCreditLimit != null ? [[ 'Credit Limit', effectiveCreditLimit ]] : []) ]} />
    <div className="customer-card-grid">
      <InformationCard title="Customer Information" fields={[[ 'Customer Code', c.customerCode ], [ 'Name', c.name ], [ 'Company', c.companyName ], [ 'Email', c.email ], [ 'Phone', c.phone ], [ 'Website', c.website ]]} />
      <InformationCard title="Tax & Billing" fields={[[ 'Tax ID', c.taxId ], [ 'Customer Type', c.customerType ], [ 'Tax Registration', customerTaxRegistrationLabel(c) ], [ 'Currency', currency ], [ 'Payment Terms', effectivePaymentTerms ], ...(effectiveCreditLimit != null ? [[ 'Credit Limit', formatCurrency(effectiveCreditLimit, currency) ]] : [])]} />
      <InformationCard title="Account Information" fields={[[ 'Status', <StatusBadge value={c.status} /> ], [ 'Created Date', displayDate(c.createdAt) ], [ 'Updated Date', displayDate(c.updatedAt) ]]} />
    </div>
  </>;
}
