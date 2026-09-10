import { FinancialSummary, InformationCard, StatusBadge, displayDate, formatCurrency } from './CustomerShared';


export function CustomerOverview({ record }) {
  const c = record.customer;
  const s = record.financialSummary;
  return <>
    <h2 className="customer-section-heading">Financial Summary</h2>
    <FinancialSummary currency={s.currency || c.currency} items={[[ 'Total Invoiced', s.totalInvoiced ], [ 'Total Paid', s.totalPaid ], [ 'Outstanding Balance', s.outstandingBalance, true ], [ 'Overdue Amount', s.overdueAmount ], [ 'Credit Limit', s.creditLimit ]]} />
    <div className="customer-card-grid">
      <InformationCard title="Customer Information" fields={[[ 'Customer Name', c.name ], [ 'Company Name', c.companyName ], [ 'Customer ID', c.customerCode ], [ 'Customer Type', c.type ], [ 'Status', <StatusBadge value={c.status} /> ], [ 'Created Date', displayDate(c.createdAt) ], [ 'Last Updated Date', displayDate(c.updatedAt) ]]} />
      <InformationCard title="Contact Information" fields={[[ 'Primary Contact Name', c.contactName ], [ 'Email', c.email ], [ 'Phone', c.phone ], [ 'Mobile', c.mobile ], [ 'Website', c.website ]]} />
      <InformationCard title="Tax Information" fields={[[ 'Tax ID', c.taxId ], [ 'PAN', c.pan ], [ 'Tax Treatment', c.taxTreatment ], [ 'Place of Supply', c.placeOfSupply ], [ 'Currency', c.currency ], [ 'Total Invoices', s.totalInvoicesCount ], [ 'Open Invoices', s.openInvoicesCount ], [ 'Overdue Invoices', s.overdueInvoicesCount ]]} />
      <InformationCard title="Billing Information" fields={[[ 'Payment Terms', c.paymentTerms ], [ 'Credit Limit', formatCurrency(s.creditLimit, s.currency || c.currency) ], [ 'Preferred Payment Method', c.preferredPaymentMethod ]]} />
    </div>
  </>;
}
