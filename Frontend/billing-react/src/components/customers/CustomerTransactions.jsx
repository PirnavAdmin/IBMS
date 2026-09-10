import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { CustomerTable } from './CustomerTable';
import { displayDate, formatCurrency, InformationCard, StatusBadge } from './CustomerShared';

export const invoiceStatuses = ['Draft', 'Issued', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled', 'Void'];
export const paymentStatuses = ['Completed', 'Pending', 'Failed', 'Reversed', 'Refunded'];
const money = (key, label) => ({ key, label, money: true, render: (row) => formatCurrency(row[key], row.currency) });
const date = (key, label) => ({ key, label, render: (row) => displayDate(row[key]) });
const statusColumn = { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> };

// No routable invoice/payment details exist in this checkout. Use a read-only
// record dialog, matching the existing invoice list, without creating detail routes.
function TransactionTable({ kind, rows }) {
  const [selected, setSelected] = useState(null);
  const invoice = kind === 'Invoice';
  const columns = invoice ? [{ key: 'invoiceNumber', label: 'Invoice Number' }, date('date', 'Invoice Date'), date('dueDate', 'Due Date'), money('amount', 'Amount'), money('paid', 'Paid Amount'), money('balance', 'Balance'), statusColumn] : [{ key: 'paymentNumber', label: 'Payment ID' }, date('date', 'Payment Date'), { key: 'method', label: 'Payment Method' }, { key: 'reference', label: 'Reference Number' }, { key: 'invoiceNumber', label: 'Invoice Number' }, money('amount', 'Amount'), statusColumn];
  return <><CustomerTable title={`${kind}s`} rows={rows} columns={[...columns, { key: 'action', label: 'Action', sortable: false, render: (row) => <Button size="small" onClick={() => setSelected(row)} aria-label={`View ${kind} ${row.id}`}>View {kind}</Button> }]} selects={[{ key: 'status', label: 'Status', options: invoice ? invoiceStatuses : paymentStatuses }]} />
    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm" aria-labelledby="customer-transaction-title"><DialogTitle id="customer-transaction-title">{kind} Details</DialogTitle><DialogContent className="customer-page customer-dialog-content">{selected && <InformationCard title={String(selected.invoiceNumber || selected.paymentNumber || selected.id)} fields={columns.map((column) => [column.label, column.render ? column.render(selected) : selected[column.key]])} />}</DialogContent><DialogActions><Button onClick={() => setSelected(null)}>Close</Button></DialogActions></Dialog>
  </>;
}
export const CustomerInvoices = ({ rows }) => <TransactionTable kind="Invoice" rows={rows} />;
export const CustomerPayments = ({ rows }) => <TransactionTable kind="Payment" rows={rows} />;
