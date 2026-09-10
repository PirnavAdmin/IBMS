import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button, Card, LinearProgress, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TableSortLabel, TextField } from '@mui/material';
import { emptyFilters, filterCustomerRows, sortCustomerRows, rankCustomerNameMatches } from './customerTableUtils';

export function CustomerFilters({ title, filters, onChange, selects = [], dates = true, extra }) {
  const update = (key, value) => {
    const next = { ...filters, [key]: value };
    if (next.start && next.end && next.start > next.end) next[key === 'start' ? 'end' : 'start'] = value;
    onChange(next);
  };
  return <div className="customer-toolbar">
    <TextField size="small" label={`Search ${title.toLowerCase()}`} value={filters.search || ''} onChange={(e) => update('search', e.target.value)} />
    {selects.map(({ key, label, options }) => <TextField select size="small" label={label} key={key} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} value={filters[key] || ''} onChange={(e) => update(key, e.target.value)}><MenuItem value="">All</MenuItem>{options.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}</TextField>)}
    {dates && <><TextField size="small" type="date" label="From date" InputLabelProps={{ shrink: true }} value={filters.start || ''} onChange={(e) => update('start', e.target.value)} /><TextField size="small" type="date" label="To date" InputLabelProps={{ shrink: true }} value={filters.end || ''} onChange={(e) => update('end', e.target.value)} /></>}
    <Button onClick={() => onChange({ ...emptyFilters })}>Clear Filters</Button>{extra}
  </div>;
}

export function CustomerTable({ title, rows, columns, selects, dates = true, defaultSort = 'date', defaultDirection = 'desc', filters: controlled, onFiltersChange, children, extra, searchKeys, prioritizeCustomerNames = false, server }) {
  const [local, setLocal] = useState({ ...emptyFilters });
  const [localPage, setLocalPage] = useState(0);
  const page = server ? server.page : localPage;
  const setPage = value => server ? server.onPage(value) : setLocalPage(value);
  const [localSize, setLocalSize] = useState(5);
  const size = server ? server.size : localSize;
  const setSize = value => server ? server.onSize(value) : setLocalSize(value);
  const [localSort, setLocalSort] = useState({ key: defaultSort, direction: defaultDirection });
  const sort = server ? server.sort : localSort;
  const setSort = value => server ? server.onSort(value) : setLocalSort(value);
  const headerSearch = useOutletContext();
  const filters = { ...(controlled || local), ...(headerSearch?.onSearch ? { search: headerSearch.searchQuery } : {}) };
  useEffect(() => { setPage(0); }, [filters.search]);
  const updateFilters = (next) => { headerSearch?.onSearch?.(next.search || ''); (onFiltersChange || setLocal)(next); setPage(0); };
  const filtered = server ? rows : filterCustomerRows(rows, filters, 'date', searchKeys);
  const ordered = server ? rows : sortCustomerRows(filtered, sort.key, sort.direction);
  const sorted = prioritizeCustomerNames ? rankCustomerNameMatches(ordered, filters.search) : ordered;
  const safePage = server ? Math.min(page, Math.max(0, Math.ceil(server.totalCount / size) - 1)) : Math.min(page, Math.max(0, Math.ceil(sorted.length / size) - 1));
  return <Card className="customer-card"><h2>{title}</h2><CustomerFilters title={title} filters={filters} onChange={updateFilters} selects={selects} dates={dates} extra={extra} />{children}
    {server?.loading && <LinearProgress aria-label="Updating customer list" />}<TableContainer aria-busy={Boolean(server?.loading)} className="customer-table" tabIndex={0} role="region" aria-label={`${title} table`}><Table size="small" aria-label={title}><TableHead><TableRow>{columns.map((column) => <TableCell key={column.key} align={column.money ? 'right' : 'left'} sortDirection={sort.key === column.key ? sort.direction : false}>{column.sortable === false ? column.label : <TableSortLabel component="button" type="button" aria-label={`Sort by ${column.label} ${sort.key === column.key && sort.direction === 'asc' ? 'descending' : 'ascending'}`} active={sort.key === column.key} direction={sort.key === column.key ? sort.direction : 'asc'} onClick={() => { setSort({ key: column.key, direction: sort.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc' }); setPage(0); }}>{column.label}</TableSortLabel>}</TableCell>)}</TableRow></TableHead><TableBody>{(server ? rows : sorted.slice(safePage * size, (safePage + 1) * size)).map((row) => <TableRow key={row.id} hover>{columns.map((column) => <TableCell key={column.key} align={column.money ? 'right' : 'left'}>{column.render ? column.render(row) : row[column.key] || 'â€”'}</TableCell>)}</TableRow>)}{!sorted.length && !server?.unavailable && <TableRow><TableCell colSpan={columns.length}><div className="customer-empty">{rows.length ? 'No matching records. Try changing or clearing your filters.' : `No ${title.toLowerCase()} available for this customer.`}</div></TableCell></TableRow>}</TableBody></Table></TableContainer>
    <TablePagination component="div" count={server ? server.totalCount : sorted.length} page={safePage} rowsPerPage={size} rowsPerPageOptions={[5, 10, 25]} onPageChange={(_, value) => setPage(value)} onRowsPerPageChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} />
  </Card>;
}
