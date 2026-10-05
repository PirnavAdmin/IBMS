import { useState } from 'react';
import { Button, IconButton, InputAdornment, Pagination, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TextField } from '@mui/material';
import { Add, Refresh, Search, VisibilityOutlined, UndoOutlined, ReceiptLongOutlined } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSearchCommit } from '../../hooks/useSearchDebounce';
import { PaymentShell, PaymentState, PaymentStatus, usePaymentUser } from './PaymentShared';
import { paymentService, PAYMENT_METHODS, PAYMENT_STATUSES, methodLabel, money, displayDate, paymentError } from './paymentService';
import { PaymentReversal } from './PaymentReversal';

const columns = [['paymentNumber','Payment Number / ID'],['paymentDate','Date'],['','Customer'],['','Invoice'],['method','Method'],['amount','Amount'],['','Allocated'],['status','Status'],['','Actions']];
export const Payments = () => {
  const [filters, setFilters] = useState({ search: '', status: '', method: '', from: '', to: '', pageSize: 10, pageNumber: 1, sortBy: 'paymentDate', sortOrder: 'desc' });
  const [search, setSearch] = useState(''); const [reverse, setReverse] = useState(null);
  const user = usePaymentUser();
  useSearchCommit(search, value => setFilters(previous => ({ ...previous, search: value, pageNumber: 1 })));
  const change = patch => setFilters(previous => ({ ...previous, ...patch, pageNumber: 1 }));
  const dateError = Boolean(filters.from && filters.to && filters.from > filters.to);
  const query = useQuery({ queryKey: ['payments', 'list', filters], queryFn: ({ signal }) => paymentService.getPayments(filters, { signal }), enabled: !dateError, retry: false });
  const items = dateError ? [] : query.data?.items || [];
  return <PaymentShell title="Payment Management" actions={<>{user.permissions.create && <Button component={Link} to="/payments/new" variant="contained" startIcon={<Add />}>Record Payment</Button>}<Button variant="outlined" title="Refresh payments" onClick={() => query.refetch()} disabled={query.isFetching || dateError} startIcon={<Refresh />}>Refresh</Button></>}>
    <section className="payment-panel payment-filters" aria-label="Payment filters">
      <TextField className="payment-search" InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} label="Search payments" placeholder="Payment number, invoice or customer" value={search} onChange={event => setSearch(event.target.value)} />
      <TextField select label="Status" value={filters.status} onChange={event => change({ status: event.target.value })}><MenuItem value="">All statuses</MenuItem>{PAYMENT_STATUSES.map(status => <MenuItem key={status} value={status}>{status}</MenuItem>)}</TextField>
      <TextField select label="Payment Method" value={filters.method} onChange={event => change({ method: event.target.value })}><MenuItem value="">All methods</MenuItem>{PAYMENT_METHODS.map(method => <MenuItem key={method} value={method}>{methodLabel(method)}</MenuItem>)}</TextField>
      <TextField type="date" label="From Date" InputLabelProps={{ shrink: true }} value={filters.from} onChange={event => change({ from: event.target.value })} />
      <TextField type="date" label="To Date" InputLabelProps={{ shrink: true }} value={filters.to} onChange={event => change({ to: event.target.value })} error={dateError} helperText={dateError ? 'To Date must be on or after From Date.' : ''} />
      <Button className="payment-clear" variant="outlined" onClick={() => { setSearch(''); change({ search: '', status: '', method: '', from: '', to: '' }); }}>Clear Filters</Button>
    </section>
    <PaymentState error={user.error && query.error ? `${paymentError(user.error)} ${paymentError(query.error)}` : user.error || query.error} onRetry={() => { user.refetch(); query.refetch(); }} />
    <section className="payment-panel payment-table-card"><header className="payment-card-heading"><div><h2>Payments</h2><p>All recorded customer payments</p></div>{query.data?.totalCount > 0 && <span className="payment-count">{query.data.totalCount} payments</span>}</header>
      {query.isFetching && !dateError && <PaymentState loading />}
      <TableContainer tabIndex={0} role="region" aria-label="Payments table"><Table aria-label="Payments"><TableHead><TableRow>{columns.map(([key,label]) => <TableCell key={label} align={['Amount','Allocated'].includes(label) ? 'right' : ['Status','Actions'].includes(label) ? 'center' : 'left'} sortDirection={filters.sortBy === key ? filters.sortOrder : false}>{key ? <TableSortLabel active={filters.sortBy === key} direction={filters.sortBy === key ? filters.sortOrder : 'asc'} onClick={() => change({ sortBy: key, sortOrder: filters.sortBy === key && filters.sortOrder === 'asc' ? 'desc' : 'asc' })}>{label}</TableSortLabel> : label}</TableCell>)}</TableRow></TableHead>
      <TableBody>{items.map(p => <TableRow key={p.id} hover><TableCell className="payment-number">{p.paymentNumber || p.id}</TableCell><TableCell>{displayDate(p.paymentDate)}</TableCell><TableCell>{p.customerName}</TableCell><TableCell>{p.invoiceDisplay}</TableCell><TableCell>{p.methodDisplay}</TableCell><TableCell className="payment-amount" align="right">{money(p.amount,p.currency)}</TableCell><TableCell align="right">{money(p.allocatedAmount,p.currency)}</TableCell><TableCell align="center"><PaymentStatus status={p.status} /></TableCell><TableCell align="center"><div className="payment-row-actions"><IconButton aria-label="View payment" title="View" component={Link} to={`/payments/${encodeURIComponent(p.id)}`}><VisibilityOutlined fontSize="small" /></IconButton>{p.isReversible && p.status !== 'Reversed' && user.permissions.reverse && <IconButton aria-label="Reverse payment" title="Reverse" onClick={() => setReverse(p)}><UndoOutlined fontSize="small" /></IconButton>}</div></TableCell></TableRow>)}
      {!items.length && <TableRow><TableCell colSpan={9}><div className="payments-state">{dateError ? 'Choose a valid date range.' : query.isFetching ? 'Loading payments...' : query.error ? 'Payments could not be loaded.' : <><ReceiptLongOutlined className="payment-empty-icon" /><strong>No payments found</strong><p>Recorded payments will appear here.</p></>}{query.error && !dateError && <Button onClick={() => query.refetch()}>Retry</Button>}</div></TableCell></TableRow>}</TableBody></Table></TableContainer>
      {query.data && <footer className="payment-pagination"><span>Showing {items.length ? (query.data.pageNumber - 1) * query.data.pageSize + 1 : 0}&ndash;{items.length ? (query.data.pageNumber - 1) * query.data.pageSize + items.length : 0} of {query.data.totalCount} payments</span><div className="payment-pagination-controls">
        <TextField select size="small" label="Rows per page" value={filters.pageSize} onChange={event => change({ pageSize: Number(event.target.value) })}>{[5,10,20,50].map(size => <MenuItem key={size} value={size}>{size}</MenuItem>)}</TextField>
        <Pagination count={Math.max(1, Math.ceil(query.data.totalCount / query.data.pageSize))} page={filters.pageNumber} disabled={query.isFetching || dateError} onChange={(_, pageNumber) => setFilters(previous => ({ ...previous, pageNumber }))} shape="rounded" siblingCount={0} />
      </div></footer>}
    </section><PaymentReversal open={Boolean(reverse)} onClose={() => setReverse(null)} paymentId={reverse?.id} />
  </PaymentShell>;
};
export default Payments;
