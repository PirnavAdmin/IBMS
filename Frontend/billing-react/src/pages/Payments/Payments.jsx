import { SearchField } from '../../components/SearchField';
import { FilterSelectField } from '../../components/FilterSelectField';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { useEffect, useState } from 'react';
import { Button, IconButton, InputAdornment, MenuItem, Menu, ListItemIcon, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TextField } from '@mui/material';
import { Add, Refresh, Search, VisibilityOutlined, UndoOutlined, ReceiptLongOutlined, LocalPrintshopOutlined, MoreVert } from '@mui/icons-material';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSearchCommit } from '../../hooks/useSearchDebounce';
import { PaymentShell, PaymentState, PaymentStatus, usePaymentUser } from './PaymentShared';
import { paymentService, PAYMENT_METHODS, PAYMENT_STATUSES, methodLabel, money, displayDate, paymentError } from './paymentService';
import { PaymentReversal } from './PaymentReversal';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { WorkspacePagination } from '../../components/WorkspacePagination';
import { buildPaymentListReport, buildPaymentReceiptReport, getPaymentReportRows, printPaymentDocument } from './paymentReports';

const columns = [['paymentNumber','Payment Number / ID'],['paymentDate','Date'],['','Customer'],['','Invoice'],['method','Method'],['amount','Amount'],['status','Status'],['','Actions']];

const PaymentRowActions = ({ payment: p, user, onReverse }) => {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');
  const printReceipt = async () => {
    if (printing) return;
    handleClose(); setPrinting(true); setPrintError('');
    try { printPaymentDocument(buildPaymentReceiptReport(await paymentService.getPaymentById(p.id))); }
    catch (error) { setPrintError(paymentError(error)); }
    finally { setPrinting(false); }
  };
  const open = Boolean(anchor);
  const handleOpen = event => setAnchor(event.currentTarget);
  const handleClose = () => setAnchor(null);

  return (
    <div className="payment-row-actions"><FeedbackSnackbar message={printError} onClose={() => setPrintError('')} severity="error" />
      <IconButton
        className="ibms-row-actions-trigger" aria-haspopup="menu" aria-expanded={open}
        aria-label={`Actions for payment ${p.paymentNumber || p.id}`}

        size="small"
        onClick={handleOpen} disabled={printing}
      >
        <MoreVert fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ className: 'payment-actions-menu ibms-row-actions-menu' }}
      >
        <MenuItem onClick={() => { handleClose(); navigate(`/payments/${encodeURIComponent(p.id)}`); }}>
          <ListItemIcon><VisibilityOutlined fontSize="small" /></ListItemIcon>
          View Details
        </MenuItem>
        <MenuItem onClick={printReceipt} disabled={printing}>
          <ListItemIcon><LocalPrintshopOutlined fontSize="small" /></ListItemIcon>
          Print Receipt
        </MenuItem>
        {p.isReversible && p.status !== 'Reversed' && user.permissions.reverse && (
          <MenuItem className="is-destructive" onClick={() => { handleClose(); onReverse(p); }}>
            <ListItemIcon><UndoOutlined fontSize="small" /></ListItemIcon>
            Reverse Payment
          </MenuItem>
        )}
      </Menu>
    </div>
  );
};

export const Payments = () => {
  const location = useLocation();
  const navigationFilters = () => { const params = new URLSearchParams(location.search); return { status: params.get('status') || '', from: params.get('startDate') || '', to: params.get('endDate') || '', ...(params.get('currency') ? { currency: params.get('currency') } : {}) }; };
  const [filters, setFilters] = useState({ search: '', status: '', method: '', from: '', to: '', pageSize: 10, pageNumber: 1, sortBy: 'createdAtUtc', sortOrder: 'desc', ...navigationFilters() });
  useEffect(() => { setFilters(previous => { const { currency, ...rest } = previous; return { ...rest, ...navigationFilters(), pageNumber: 1 }; }); }, [location.search]);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');
  const [search, setSearch] = useState(''); const [reverse, setReverse] = useState(null);
  const user = usePaymentUser();
  useSearchCommit(search, value => setFilters(previous => ({ ...previous, search: value, pageNumber: 1 })));
  const change = patch => setFilters(previous => ({ ...previous, ...patch, pageNumber: 1 }));
  const dateError = Boolean(filters.from && filters.to && filters.from > filters.to);
  const query = useQuery({ queryKey: ['payments', 'list', filters], queryFn: ({ signal }) => paymentService.getPayments(filters, { signal }), enabled: !dateError, retry: false });
  const loadError = query.error || user.error;
  const items = dateError ? [] : query.data?.items || [];
  const printList = async () => {
    if (printing) return;
    setPrinting(true); setPrintError('');
    try { printPaymentDocument(buildPaymentListReport(await getPaymentReportRows(filters))); }
    catch (error) { setPrintError(error.message || 'Unable to prepare the payments report.'); }
    finally { setPrinting(false); }
  };
  return <PaymentShell title="Payment Management" actions={<>{user.permissions.create && <Button component={Link} to="/payments/new" variant="contained" startIcon={<Add />}>Record Payment</Button>}<Button aria-label="Refresh payments" variant="outlined"  onClick={() => query.refetch()} disabled={query.isFetching || dateError} startIcon={<Refresh />}>Refresh</Button><Button aria-label="Print all filtered payments" variant="outlined"  onClick={printList} disabled={printing || query.isFetching || Boolean(query.error) || !items.length || search.trim() !== filters.search} startIcon={<LocalPrintshopOutlined />}>{printing ? 'Preparing Print...' : 'Print'}</Button></>}>
    <FeedbackSnackbar message={printError} onClose={() => setPrintError('')} severity="error" />
    <section className="payment-panel payment-table-card" aria-label="Payment list">
      <header className="payment-card-heading"><div><h2>Payments</h2><p>All recorded customer payments</p></div>{query.data?.totalCount > 0 && <span className="payment-count">{query.data.totalCount} payments{filters.currency ? ` ? ${filters.currency}` : ''}</span>}</header>
    <div className="payment-filters" role="search" aria-label="Payment filters">
      <SearchField size="small" className="payment-search" InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} label="Search payments" placeholder="Number or customer" searchHint="Search by payment number, invoice number or customer." value={search} onChange={event => setSearch(event.target.value)} />
      <FilterSelectField size="small" select label="Status" value={filters.status} onChange={event => change({ status: event.target.value })}><MenuItem value="">All statuses</MenuItem>{PAYMENT_STATUSES.map(status => <MenuItem key={status} value={status}>{status}</MenuItem>)}</FilterSelectField>
      <FilterSelectField size="small" select label="Payment Method" value={filters.method} onChange={event => change({ method: event.target.value })}><MenuItem value="">All methods</MenuItem>{PAYMENT_METHODS.map(method => <MenuItem key={method} value={method}>{methodLabel(method)}</MenuItem>)}</FilterSelectField>
      <div className="payment-filter-actions"><DateRangeFilter startDate={filters.from} endDate={filters.to} onApply={({ startDate, endDate }) => change({ from: startDate, to: endDate })} />
      <Button className="payment-clear" variant="outlined" onClick={() => { setSearch(''); change({ search: '', currency: '', status: '', method: '', from: '', to: '', sortBy: 'createdAtUtc', sortOrder: 'desc' }); }}>Clear Filters</Button></div>
    </div>
      {query.isFetching && !dateError && <PaymentState loading />}
      <TableContainer className="ibms-table-frame payment-list-table" tabIndex={0} role="region" aria-label="Payments table"><Table aria-label="Payments"><TableHead><TableRow>{columns.map(([key,label]) => <TableCell key={label} align="left" sortDirection={filters.sortBy === key ? filters.sortOrder : false}>{key ? <TableSortLabel active={filters.sortBy === key} direction={filters.sortBy === key ? filters.sortOrder : 'asc'} onClick={() => change({ sortBy: key, sortOrder: filters.sortBy === key && filters.sortOrder === 'asc' ? 'desc' : 'asc' })}>{label}</TableSortLabel> : label}</TableCell>)}</TableRow></TableHead>
      <TableBody>
      {loadError && !dateError && <TableRow><TableCell colSpan={columns.length}><PaymentState error={loadError} onRetry={() => { user.refetch(); query.refetch(); }} /></TableCell></TableRow>}
      {items.map(p => <TableRow key={p.id} hover><TableCell className="payment-number">{p.paymentNumber || p.id}</TableCell><TableCell>{displayDate(p.paymentDate)}</TableCell><TableCell>{p.customerName}</TableCell><TableCell>{p.invoiceDisplay}</TableCell><TableCell>{p.methodDisplay}</TableCell><TableCell className="payment-amount" align="left">{money(p.amount,p.currency)}</TableCell><TableCell align="left"><PaymentStatus status={p.status} /></TableCell><TableCell align="left"><PaymentRowActions payment={p} user={user} onReverse={setReverse} /></TableCell></TableRow>)}
      {!items.length && (dateError || !loadError) && <TableRow><TableCell colSpan={columns.length}><div className="payments-state">{dateError ? 'Choose a valid date range.' : query.isFetching ? 'Loading payments...' : <><ReceiptLongOutlined className="payment-empty-icon" /><strong>No payments found</strong><p>Recorded payments will appear here.</p></>}</div></TableCell></TableRow>}</TableBody></Table></TableContainer>
      {query.data && <WorkspacePagination page={query.data.pageNumber} pageSize={query.data.pageSize} totalCount={query.data.totalCount} itemLabel="payments" disabled={query.isFetching || Boolean(dateError)} onPageChange={pageNumber => setFilters(previous => ({ ...previous, pageNumber }))} onPageSizeChange={pageSize => change({ pageSize })} />}
    </section><PaymentReversal open={Boolean(reverse)} onClose={() => setReverse(null)} paymentId={reverse?.id} />
  </PaymentShell>;
};
export default Payments;
