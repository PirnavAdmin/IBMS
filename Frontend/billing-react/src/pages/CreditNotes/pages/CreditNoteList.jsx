import { DateRangeFilter } from '../../../components/DateRangeFilter';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Add, ArrowDownward, ArrowUpward, FilterAltOutlined,
  LocalPrintshopOutlined, MoreVert, PictureAsPdfOutlined, ReceiptLongOutlined, Search, SavingsOutlined, ScheduleOutlined,
  Autorenew, VisibilityOutlined, EditOutlined,
} from '@mui/icons-material';
import {
  Breadcrumbs, Button, IconButton, ListItemIcon, Menu, MenuItem, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TextField,
} from '@mui/material';
import { creditNoteService } from '../services/creditNoteService';
import { CreditNoteStatusBadge } from '../components/CreditNoteStatusBadge';
import { DashboardErrorState } from '../../../components/dashboard/DashboardStates';
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

  const openMenu = (event, note) => { setMenuAnchor(event.currentTarget); setMenuNote(note); };
  const closeMenu = () => { setMenuAnchor(null); setMenuNote(null); };
  const clearFilters = () => { setStatus(''); setType(''); setSearchInput(''); setSearch(''); setFromDate(''); setToDate(''); setPage(0); };
  const goToRegister = () => document.getElementById('credit-note-register')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <main className="cn-page cn-list-page">
      <Breadcrumbs className="cn-breadcrumbs" aria-label="Breadcrumb"><span>Billing</span><span>Credit Notes</span></Breadcrumbs>
      <header className="cn-page-heading">
        <div><span className="cn-eyebrow">CREDITS &amp; REFUNDS</span><h1>Credit Notes</h1><p>Manage invoice credits, approvals and customer refunds.</p></div>
        <div className="cn-heading-actions"><Button className="cn-list-print-button" variant="outlined" startIcon={<LocalPrintshopOutlined />} onClick={() => window.print()}>Print</Button><Button variant="contained" startIcon={<Add />} onClick={() => navigate('/credit-notes/new')}>Create Credit Note</Button></div>
      </header>


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
          <TextField select size="small" label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }} className="cn-status-filter"><MenuItem value=""><FilterAltOutlined fontSize="small" /> All statuses</MenuItem>{statuses.slice(1).map((item) => <MenuItem key={item} value={item}>{['Pending Approval', 'Partially Refunded'].includes(item) ? <span className="cn-status-filter-compact">{item}</span> : item}</MenuItem>)}</TextField>
          <TextField select size="small" label="Credit type" value={type} onChange={(event) => { setType(event.target.value); setPage(0); }} className="cn-status-filter"><MenuItem value="">All types</MenuItem><MenuItem value="Full">Full</MenuItem><MenuItem value="Partial">Partial</MenuItem></TextField>
          <DateRangeFilter startDate={fromDate} endDate={toDate} onApply={({ startDate, endDate }) => { setFromDate(startDate); setToDate(endDate); setPage(0); }} />
          {hasFilters && <Button className="cn-clear-filter" onClick={clearFilters}>Clear filters</Button>}
          <span><IconButton aria-label="Refresh from billing API" onClick={() => { query.refetch(); draftQuery.refetch(); pendingQuery.refetch(); }} disabled={query.isFetching}><Autorenew /></IconButton></span>
        </div>
        <TableContainer className="ibms-table-frame cn-table-wrap">
          <Table stickyHeader aria-label="Credit note register">
            <TableHead><TableRow>
              {[['number', 'Credit note'], ['customer', 'Customer / invoice'], ['type', 'Type'], ['total', 'Credit amount'], ['refunded', 'Refunded'], ['remainingRefundable', 'Remaining refundable'], ['status', 'Status'], ['date', 'Created']].map(([key, label]) => <TableCell key={key}><button className="cn-sort-button" disabled={!sortable[key]} onClick={() => changeSort(key)}>{label}{sort.key === key && (sort.direction === 'asc' ? <ArrowUpward /> : <ArrowDownward />)}</button></TableCell>)}
              <TableCell align="right">Actions</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {query.isPending && <TableRow><TableCell colSpan={9}><div className="cn-table-state"><span className="cn-spinner" />Loading credit notes…</div></TableCell></TableRow>}
              {query.isError && <TableRow><TableCell colSpan={9}><DashboardErrorState title="Unable to load credit notes" message={query.error?.message} onRetry={() => query.refetch()} /></TableCell></TableRow>}
              {!query.isPending && !query.isError && items.map((note) => <TableRow hover key={note.id} className="cn-data-row" onClick={() => navigate(`/credit-notes/${note.id}`)}>
                <TableCell><span className="cn-number-cell">{note.number}</span><span className="cn-sub-cell">{formatDate(note.date)}</span></TableCell>
                <TableCell><strong className="cn-customer-cell">{note.customer}</strong><span className="cn-sub-cell">{note.invoiceNumber}</span></TableCell>
                <TableCell><span className={`cn-type-pill ${String(note.type).toLowerCase()}`}>{note.type}</span></TableCell>
                <TableCell><strong className="cn-money-cell">{money(note.total, note.currency)}</strong></TableCell>
                <TableCell><span className="cn-refunded-cell">{money(note.refunded, note.currency)}</span></TableCell>
                <TableCell><span className="cn-refunded-cell">{money(note.remainingRefundable, note.currency)}</span></TableCell>
                <TableCell><CreditNoteStatusBadge status={note.status} /></TableCell>
                <TableCell>{formatDate(note.createdAt || note.date)}</TableCell>
                <TableCell align="right"><IconButton className="ibms-row-actions-trigger" aria-haspopup="menu" aria-expanded={Boolean(menuAnchor) && menuNote?.id === note.id} size="small" onClick={(event) => { event.stopPropagation(); openMenu(event, note); }} aria-label={`Actions for ${note.number}`}><MoreVert /></IconButton></TableCell>
              </TableRow>)}
              {!query.isPending && !query.isError && !items.length && <TableRow><TableCell colSpan={9}><div className="cn-empty-state"><span className="cn-empty-icon"><ReceiptLongOutlined /></span><strong>{totalCount ? 'No records on this page' : 'No Credit Notes in the billing API'}</strong><span>{totalCount ? 'Adjust page or filters to see other records.' : 'Create a note after the billing API returns eligible invoices.'}</span>{!totalCount && <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/credit-notes/new')}>Create Credit Note</Button>}</div></TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" className="cn-pagination" count={totalCount} page={page} onPageChange={(_, value) => setPage(value)} rowsPerPage={pageSize} onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[5, 10, 25, 50]} />
      </section>

      <p className="cn-finance-note">The billing API is authoritative for eligibility, numbering, approvals, invoice balances, and refunds.</p>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu} PaperProps={{ className: 'ibms-row-actions-menu' }} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem component={Link} to={`/credit-notes/${menuNote?.id}`} onClick={closeMenu}><ListItemIcon><VisibilityOutlined fontSize="small" /></ListItemIcon>View details</MenuItem>
        {menuNote?.status === 'Draft' && <MenuItem component={Link} to={`/credit-notes/${menuNote.id}/edit`} onClick={closeMenu}><ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon>Edit draft</MenuItem>}
        <MenuItem onClick={() => { closeMenu(); navigate(`/credit-notes/${menuNote?.id}/preview`); }}><ListItemIcon><LocalPrintshopOutlined fontSize="small" /></ListItemIcon>Preview / print</MenuItem>
        <MenuItem onClick={() => { closeMenu(); navigate(`/credit-notes/${menuNote?.id}/export`); }}><ListItemIcon><PictureAsPdfOutlined fontSize="small" /></ListItemIcon>Export PDF</MenuItem>
      </Menu>
    </main>
  );
}

export default CreditNoteList;
