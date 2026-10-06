import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Add, ArrowDownward, ArrowUpward, DownloadOutlined, FilterAltOutlined,
  LocalPrintshopOutlined, MoreHoriz, ReceiptLongOutlined, Search, SavingsOutlined, ScheduleOutlined,
  Autorenew,
} from '@mui/icons-material';
import {
  Breadcrumbs, Button, IconButton, Menu, MenuItem, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TextField, Tooltip,
} from '@mui/material';
import { creditNoteService } from '../services/creditNoteService';
import { CreditNoteStatusBadge } from '../components/CreditNoteStatusBadge';
import { formatDate, money } from '../utils/creditNoteCalculations';
import '../styles/credit-notes.css';

const statuses = ['', 'Draft', 'Pending Approval', 'Approved', 'Issued', 'Partially Refunded', 'Refunded', 'Rejected', 'Cancelled'];
const sortable = { number: 'CreditNoteNumber', total: 'TotalAmount', status: 'Status', date: 'CreatedAt' };

export function CreditNoteList() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState({ key: 'date', direction: 'desc' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuNote, setMenuNote] = useState(null);
  const [exported, setExported] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const params = { page: page + 1, pageSize, search, status, type, fromDate, toDate, sortBy: sortable[sort.key] || 'CreatedAt', sortDescending: sort.direction === 'desc' };
  const query = useQuery({ queryKey: ['creditNotes', 'list', params], queryFn: () => creditNoteService.list(params), placeholderData: (previousData) => previousData });
  const draftQuery = useQuery({ queryKey: ['creditNotes', 'count', 'Draft'], queryFn: () => creditNoteService.list({ status: 'Draft', page: 1, pageSize: 1 }) });
  const pendingQuery = useQuery({ queryKey: ['creditNotes', 'count', 'PendingApproval'], queryFn: () => creditNoteService.list({ status: 'Pending Approval', page: 1, pageSize: 1 }) });
  const items = query.data?.items || [];
  const totalCount = query.data?.totalCount || 0;
  const pageValue = items.reduce((sum, note) => sum + Number(note.total || 0), 0);
  const pageRefunded = items.reduce((sum, note) => sum + Number(note.refunded || 0), 0);
  const hasFilters = Boolean(searchInput || status || type || fromDate || toDate);

  const changeSort = (key) => {
    if (!sortable[key]) return;
    setSort((old) => ({ key, direction: old.key === key && old.direction === 'desc' ? 'asc' : 'desc' }));
    setPage(0);
  };

  const exportCsv = () => {
    const headers = ['Credit Note', 'Customer', 'Invoice', 'Type', 'Amount', 'Refunded', 'Remaining refundable', 'Status', 'Date'];
    const rows = items.map((note) => [note.number, note.customer, note.invoiceNumber, note.type, note.total, note.refunded, note.remainingRefundable, note.status, note.date]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `credit-notes-page-${page + 1}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    setExported(true);
    setTimeout(() => setExported(false), 2200);
  };

  const openMenu = (event, note) => { setMenuAnchor(event.currentTarget); setMenuNote(note); };
  const closeMenu = () => { setMenuAnchor(null); setMenuNote(null); };
  const clearFilters = () => { setStatus(''); setType(''); setSearchInput(''); setSearch(''); setFromDate(''); setToDate(''); setPage(0); };
  const goToRegister = () => document.getElementById('credit-note-register')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <main className="cn-page cn-list-page">
      <Breadcrumbs className="cn-breadcrumbs" aria-label="Breadcrumb"><span>Billing</span><span>Credit Notes</span></Breadcrumbs>
      <header className="cn-page-heading">
        <div><span className="cn-eyebrow">CREDITS &amp; REFUNDS</span><h1>Credit Notes</h1><p>Manage invoice credits, approvals and customer refunds.</p></div>
        <div className="cn-heading-actions"><Button variant="outlined" startIcon={<DownloadOutlined />} onClick={exportCsv} disabled={!items.length}>{exported ? 'Exported' : 'Export this page'}</Button><Button className="cn-list-print-button" variant="outlined" startIcon={<LocalPrintshopOutlined />} onClick={() => window.print()}>Print</Button><Button variant="contained" startIcon={<Add />} onClick={() => navigate('/credit-notes/new')}>Create Credit Note</Button></div>
      </header>

      <div className="cn-demo-banner cn-api-banner"><span className="cn-demo-dot" /><div><strong>Billing API records</strong><span>Credit notes and balances come from the authenticated billing API. No demo records are loaded.</span></div><span className="cn-demo-tag">LIVE API</span></div>

      <section className="cn-summary-grid" aria-label="Credit note summary">
        <button className="cn-summary-card cn-summary-all" onClick={() => clearFilters()}><span className="cn-summary-icon"><ReceiptLongOutlined /></span><span className="cn-summary-label">Credit notes</span><strong>{query.isPending ? '—' : totalCount}</strong><small>Matches current filters</small></button>
        <button className={`cn-summary-card cn-summary-draft ${status === 'Draft' ? 'selected' : ''}`} onClick={() => { setStatus(status === 'Draft' ? '' : 'Draft'); setPage(0); }}><span className="cn-summary-icon"><ScheduleOutlined /></span><span className="cn-summary-label">Drafts</span><strong>{draftQuery.data?.totalCount ?? '—'}</strong><small>All pages · backend count</small></button>
        <button className={`cn-summary-card cn-summary-pending ${status === 'Pending Approval' ? 'selected' : ''}`} onClick={() => { setStatus(status === 'Pending Approval' ? '' : 'Pending Approval'); setPage(0); }}><span className="cn-summary-icon"><Autorenew /></span><span className="cn-summary-label">Pending approval</span><strong>{pendingQuery.data?.totalCount ?? '—'}</strong><small>All pages · backend count</small></button>
        <button type="button" className="cn-summary-card cn-summary-value" aria-label="Go to the credit note register" onClick={goToRegister}><span className="cn-summary-icon"><SavingsOutlined /></span><span className="cn-summary-label">This page value</span><strong>{money(pageValue)}</strong><small>{money(pageRefunded)} refunded on this page</small></button>
      </section>

      <section className="cn-list-panel" id="credit-note-register" tabIndex={-1}>
        <div className="cn-list-heading"><div><h2>Credit note register</h2><p>Search and review credits linked to issued invoices.</p></div><span className="cn-result-count">{query.isPending ? 'Loading…' : `${totalCount} ${totalCount === 1 ? 'record' : 'records'}`}</span></div>
        <div className="cn-filter-bar">
          <TextField className="cn-search" size="small" placeholder="Search number, customer, invoice or reason" value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(0); }} InputProps={{ startAdornment: <Search className="cn-search-icon" /> }} inputProps={{ 'aria-label': 'Search credit notes' }} />
          <TextField select size="small" label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }} className="cn-status-filter"><MenuItem value=""><FilterAltOutlined fontSize="small" /> All statuses</MenuItem>{statuses.slice(1).map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>
          <TextField select size="small" label="Credit type" value={type} onChange={(event) => { setType(event.target.value); setPage(0); }} className="cn-status-filter"><MenuItem value="">All types</MenuItem><MenuItem value="Full">Full</MenuItem><MenuItem value="Partial">Partial</MenuItem></TextField>
          <TextField className="cn-date-filter" size="small" type="date" label="From date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setPage(0); }} InputLabelProps={{ shrink: true }} inputProps={{ max: toDate || undefined, 'aria-label': 'Filter credit notes from date' }} />
          <TextField className="cn-date-filter" size="small" type="date" label="To date" value={toDate} onChange={(event) => { setToDate(event.target.value); setPage(0); }} InputLabelProps={{ shrink: true }} inputProps={{ min: fromDate || undefined, 'aria-label': 'Filter credit notes to date' }} />
          {hasFilters && <Button className="cn-clear-filter" onClick={clearFilters}>Clear filters</Button>}
          <Tooltip title="Refresh from billing API"><span><IconButton onClick={() => { query.refetch(); draftQuery.refetch(); pendingQuery.refetch(); }} disabled={query.isFetching}><Autorenew /></IconButton></span></Tooltip>
        </div>
        <TableContainer className="cn-table-wrap">
          <Table stickyHeader aria-label="Credit note register">
            <TableHead><TableRow>
              {[['number', 'Credit note'], ['customer', 'Customer / invoice'], ['type', 'Type'], ['total', 'Credit amount'], ['refunded', 'Refunded'], ['remainingRefundable', 'Remaining refundable'], ['status', 'Status'], ['date', 'Created']].map(([key, label]) => <TableCell key={key} align={['total', 'refunded', 'remainingRefundable'].includes(key) ? 'right' : 'left'}><button className="cn-sort-button" disabled={!sortable[key]} onClick={() => changeSort(key)}>{label}{sort.key === key && (sort.direction === 'asc' ? <ArrowUpward /> : <ArrowDownward />)}</button></TableCell>)}
              <TableCell align="right">Actions</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {query.isPending && <TableRow><TableCell colSpan={9}><div className="cn-table-state"><span className="cn-spinner" />Loading credit notes…</div></TableCell></TableRow>}
              {query.isError && <TableRow><TableCell colSpan={9}><div className="cn-table-state cn-state-error"><strong>Billing API records could not be loaded</strong><span>{query.error?.message || 'Try again in a moment.'}</span><Button onClick={() => query.refetch()}>Retry</Button></div></TableCell></TableRow>}
              {!query.isPending && !query.isError && items.map((note) => <TableRow hover key={note.id} className="cn-data-row" onClick={() => navigate(`/credit-notes/${note.id}`)}>
                <TableCell><span className="cn-number-cell">{note.number}</span><span className="cn-sub-cell">{formatDate(note.date)}</span></TableCell>
                <TableCell><strong className="cn-customer-cell">{note.customer}</strong><span className="cn-sub-cell">{note.invoiceNumber}</span></TableCell>
                <TableCell><span className={`cn-type-pill ${String(note.type).toLowerCase()}`}>{note.type}</span></TableCell>
                <TableCell align="right"><strong className="cn-money-cell">{money(note.total, note.currency)}</strong></TableCell>
                <TableCell align="right"><span className="cn-refunded-cell">{money(note.refunded, note.currency)}</span></TableCell>
                <TableCell align="right"><span className="cn-refunded-cell">{money(note.remainingRefundable, note.currency)}</span></TableCell>
                <TableCell><CreditNoteStatusBadge status={note.status} /></TableCell>
                <TableCell>{formatDate(note.createdAt || note.date)}</TableCell>
                <TableCell align="right"><Tooltip title="More actions"><IconButton size="small" onClick={(event) => { event.stopPropagation(); openMenu(event, note); }} aria-label={`Actions for ${note.number}`}><MoreHoriz /></IconButton></Tooltip></TableCell>
              </TableRow>)}
              {!query.isPending && !query.isError && !items.length && <TableRow><TableCell colSpan={9}><div className="cn-empty-state"><span className="cn-empty-icon"><ReceiptLongOutlined /></span><strong>{totalCount ? 'No records on this page' : 'No Credit Notes in the billing API'}</strong><span>{totalCount ? 'Adjust page or filters to see other records.' : 'Create a note after the billing API returns eligible invoices.'}</span>{!totalCount && <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/credit-notes/new')}>Create Credit Note</Button>}</div></TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" className="cn-pagination" count={totalCount} page={page} onPageChange={(_, value) => setPage(value)} rowsPerPage={pageSize} onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[5, 10, 25, 50]} />
      </section>

      <p className="cn-finance-note">The billing API is authoritative for eligibility, numbering, approvals, invoice balances, and refunds.</p>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem component={Link} to={`/credit-notes/${menuNote?.id}`} onClick={closeMenu}>View details</MenuItem>
        {menuNote?.status === 'Draft' && <MenuItem component={Link} to={`/credit-notes/${menuNote.id}/edit`} onClick={closeMenu}>Edit draft</MenuItem>}
        <MenuItem onClick={() => { closeMenu(); navigate(`/credit-notes/${menuNote?.id}/preview`); }}>Preview / print</MenuItem>
      </Menu>
    </main>
  );
}

export default CreditNoteList;
