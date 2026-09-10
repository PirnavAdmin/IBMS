import { FinancialSummary, InformationCard, StatusBadge, displayDate, formatCurrency } from './CustomerShared';


export function CustomerOverview({ record }) {
  const c = record.customer;
  const s = record.financialSummary;
  return <>
    <h2 className="customer-section-heading">Financial Summary</h2>
    <FinancialSummary currency={s.currency || c.currency} items={[[ 'Total Invoiced', s.totalInvoiced ], [ 'Total Paid', s.totalPaid ], [ 'Outstanding Balance', s.outstandingBalance, true ], [ 'Credit Limit', s.creditLimit ], [ 'Total Invoices', s.totalInvoicesCount, false, true ], [ 'Open Invoices', s.openInvoicesCount, false, true ], [ 'Overdue Invoices', s.overdueInvoicesCount, false, true ]]} />
    <div className="customer-card-grid">
      <InformationCard title="Customer Information" fields={[[ 'Customer Name', c.name ], [ 'Company Name', c.companyName ], [ 'Customer Code', c.customerCode ], [ 'Customer Type', c.customerType ], [ 'Status', <StatusBadge value={c.status} /> ], [ 'Created Date', displayDate(c.createdAt) ], [ 'Last Updated Date', displayDate(c.updatedAt) ]]} />
      <InformationCard title="Contact Information" fields={[[ 'Email', c.email ], [ 'Phone', c.phone ], [ 'Website', c.website ]]} />
      <InformationCard title="Tax Information" fields={[[ 'Tax ID', c.taxId ], [ 'Currency', c.currency ]]} />
      <InformationCard title="Billing Information" fields={[[ 'Payment Terms', c.paymentTerms ], [ 'Credit Limit', formatCurrency(s.creditLimit, s.currency || c.currency) ]]} />
    </div>
  </>;
}
