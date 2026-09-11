import { useState } from 'react';
import { Button, Tooltip } from '@mui/material';
import { CustomerTable } from './CustomerTable';
import { FinancialSummary, displayDate, formatCurrency } from './CustomerShared';
import { emptyFilters } from './customerTableUtils';


export function CustomerStatement({ record }) {
  const [filters, setFilters] = useState({ ...emptyFilters });
  const s = record.financialSummary;
  const currency = s.currency || record.customer.currency;
  const rows = [...record.invoices.filter(r => r.date && !Number.isNaN(Date.parse(r.date)) && r.amount != null && Number.isFinite(Number(r.amount))).map(r => ({ id: `invoice-${r.id}`, date: r.date, type: 'Invoice', reference: r.invoiceNumber, debit: r.amount, currency: r.currency })), ...record.payments.filter(r => r.date && !Number.isNaN(Date.parse(r.date)) && r.amount != null && Number.isFinite(Number(r.amount))).map(r => ({ id: `payment-${r.id}`, date: r.date, type: 'Payment', reference: r.paymentNumber, credit: r.amount, currency: r.currency }))];
  const columns = [{ key: 'date', label: 'Date', render: (r) => displayDate(r.date) }, { key: 'type', label: 'Transaction Type' }, { key: 'reference', label: 'Reference' }, ...['debit', 'credit'].map((key) => ({ key, label: key[0].toUpperCase() + key.slice(1), money: true, render: (r) => r[key] == null ? '—' : formatCurrency(r[key], r.currency || currency) }))];
  return <>
    <FinancialSummary currency={currency} items={[[ 'Total Invoiced', s.totalInvoiced ], [ 'Total Paid', s.totalPaid ], [ 'Outstanding Balance', s.outstandingBalance, true ]]} />
    <CustomerTable title="Statement" emptyMessage="No statement transactions with a date and amount are available for this customer." rows={rows} columns={columns} filters={filters} onFiltersChange={setFilters} defaultDirection="asc" selects={[{ key: 'type', label: 'Transaction Type', options: ['Invoice', 'Payment'] }]} extra={<Tooltip title="Statement export is not available yet."><span><Button disabled>Download Statement</Button></span></Tooltip>}>
      <p className="customer-note">Currency: {currency || "-"}. Summary totals are supplied by the backend for the customer. Filters narrow the invoice and payment records only. Opening and running balances are not available.</p>
    </CustomerTable>
  </>;
}
