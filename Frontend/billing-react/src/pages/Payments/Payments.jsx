import { useState } from 'react';
import { Button, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField } from '@mui/material';
import { Add, Refresh } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { PaymentShell, PaymentState, usePaymentRequest } from './PaymentShared';
import { paymentService } from './paymentService';

export const Payments = () => {
  const [filters, setFilters] = useState({ search: '', status: '', method: '', from: '', to: '' });
  const [pageSize, setPageSize] = useState(10);
  const request = usePaymentRequest();
  const change = key => event => setFilters(previous => ({ ...previous, [key]: event.target.value }));
  const dateError = filters.from && filters.to && filters.from > filters.to;
  const refresh = () => request.run(() => paymentService.getPayments({ ...filters, pageSize, page: 1 }));
  return <PaymentShell title="Payment Management" actions={<><Button component={Link} to="/payments/new" variant="contained" startIcon={<Add />}>Record Payment</Button><Button onClick={refresh} disabled={request.loading || Boolean(dateError)} startIcon={<Refresh />}>Refresh</Button></>}>
    <section className="payment-panel payment-filters" aria-label="Payment filters">
      <TextField label="Search payments" placeholder="Payment number, invoice, customer or method" value={filters.search} onChange={change('search')} />
      <TextField select disabled label="Status" value="" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}><MenuItem value="">Awaiting backend options</MenuItem></TextField>
      <TextField select disabled label="Payment Method" value="" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}><MenuItem value="">Awaiting backend options</MenuItem></TextField>
      <TextField type="date" label="From Date" InputLabelProps={{ shrink: true }} value={filters.from} onChange={change('from')} />
      <TextField type="date" label="To Date" InputLabelProps={{ shrink: true }} value={filters.to} onChange={change('to')} error={Boolean(dateError)} helperText={dateError ? 'To Date must be on or after From Date.' : ''} />
    </section>
    <PaymentState {...request} onRetry={refresh} />
    <section className="payment-panel"><TableContainer><Table aria-label="Payments"><TableHead><TableRow>{['Payment Number / ID', 'Date', 'Customer', 'Invoice', 'Method', 'Amount', 'Allocated', 'Status', 'Actions'].map(label => <TableCell key={label} align={['Amount', 'Allocated'].includes(label) ? 'right' : 'left'}>{label}</TableCell>)}</TableRow></TableHead>
      <TableBody><TableRow><TableCell colSpan={9}><div className="payments-state">{request.loading ? 'Loading payments...' : 'No payments available. Payment integration is pending.'}</div></TableCell></TableRow></TableBody></Table></TableContainer>
      <footer className="payment-actions"><TextField select size="small" label="Rows per page" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{[5, 10, 20, 50].map(size => <MenuItem key={size} value={size}>{size}</MenuItem>)}</TextField><Button disabled>Previous</Button><Button disabled>Next</Button></footer>
    </section>
  </PaymentShell>;
};
export default Payments;
