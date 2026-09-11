import { FinancialSummary, InformationCard, StatusBadge, displayDate, formatCurrency } from './CustomerShared';


export function CustomerOverview({ record }) {
  const c = record.customer || {};
  const s = record.financialSummary || {};
  const currency = s.currency || c.currency || record.currency || 'INR';
  const effectiveCreditLimit = s.creditLimit ?? c.creditLimit ?? record.creditLimit ?? c.CreditLimit ?? null;
  const effectiveOutstanding = s.outstandingBalance ?? c.outstandingBalance ?? c.openingBalance ?? record.openingBalance ?? c.OutstandingBalance ?? null;
  const effectivePaymentTerms = c.paymentTerms || record.paymentTerms || s.paymentTerms || '—';
  return <>
    <h2 className="customer-section-heading">Financial Summary</h2>
    <FinancialSummary currency={currency} items={[[ 'Total Invoiced', s.totalInvoiced ], [ 'Total Paid', s.totalPaid ], [ 'Outstanding Balance', effectiveOutstanding, true ], [ 'Credit Limit', effectiveCreditLimit ], [ 'Total Invoices', s.totalInvoicesCount, false, true ], [ 'Open Invoices', s.openInvoicesCount, false, true ], [ 'Overdue Invoices', s.overdueInvoicesCount, false, true ]]} />
    <div className="customer-card-grid">
      <InformationCard title="Customer Information" fields={[[ 'Customer Name', c.name ], [ 'Company Name', c.companyName ], [ 'Customer Code', c.customerCode ], [ 'Customer Type', c.customerType || c.CustomerType ], [ 'Status', <StatusBadge value={c.status} /> ], [ 'Created Date', displayDate(c.createdAt) ], [ 'Last Updated Date', displayDate(c.updatedAt) ]]} />
      <InformationCard title="Contact Information" fields={[[ 'Email', c.email ], [ 'Phone', c.phone ], [ 'Website', c.website ]]} />
      <InformationCard title="Tax Information" fields={[[ 'Tax ID', c.taxId ], [ 'Currency', c.currency || currency ]]} />
      <InformationCard title="Billing Information" fields={[[ 'Payment Terms', effectivePaymentTerms ], [ 'Credit Limit', formatCurrency(effectiveCreditLimit, currency) ]]} />
    </div>
  </>;
}
