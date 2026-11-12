import { DashboardErrorState } from '../../components/dashboard/DashboardStates';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MoreVert from '@mui/icons-material/MoreVert';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import { IconButton, Menu, CircularProgress, Chip, Alert, AlertTitle, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, ListItemIcon, Autocomplete } from '@mui/material';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { WorkspacePagination } from '../../components/WorkspacePagination';
import { platformError, platformFieldErrors } from './platformService';
import './platform.css';
let lastToken, epoch = 0;
export function platformScope(user) {
  const token = localStorage.getItem('billing_auth_token');
  if (token !== lastToken) { lastToken = token; epoch++; }
  return ['platform', user?.userId ?? user?.UserId ?? user?.id, user?.tenantId ?? user?.TenantId, epoch];
}
export function usePlatformQuery(name, params, fetcher) {
  const user = useCurrentUser();
  return useQuery({ queryKey: [...platformScope(user), name, params], queryFn: ({ signal }) => fetcher(signal), retry: false, gcTime: 0 });
}
const descriptions = { 'Platform Dashboard': 'An overview of your organizations, administrators and recent activity.', 'Tenant Management': 'Manage organizations, workspace access, and pending tenant approvals.', 'Platform Users': 'Manage platform administrator accounts and status.', 'Platform Audit Logs': 'Review administration activity across authorized workspaces.', 'Platform Settings': 'Manage platform preferences, access and security policies.' };
export function PlatformShell({ title, actions, children }) {
  return <main className="platform-page"><header className="platform-heading"><div><p>PLATFORM ADMINISTRATION</p><h1>{title}</h1>{descriptions[title] && <span className="platform-description">{descriptions[title]}</span>}</div>{actions && <div className="platform-actions">{actions}</div>}</header>{children}</main>;
}
export function QueryState({ query, children, resource = 'platform data' }) {
  const paused = query.fetchStatus === 'paused';
  if (query.isError || paused) return <div className="platform-query-error" aria-busy={Boolean(query.isFetching)}><DashboardErrorState
    title={`Unable to load ${resource}`}
    message={platformError(query.error)}
    description={paused ? 'No internet connection. Check your network; loading will resume when you reconnect.' : undefined}
    onRetry={() => query.refetch()}
    retryDisabled={query.isFetching || paused}
    retryLabel={query.isFetching ? 'Retrying\u2026' : 'Retry'}
  /></div>;
  if (query.isPending) return <div role="status" className="platform-loading"><CircularProgress size={28}/><span>Loading…</span></div>;
  return children;
}
export const dateText = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
export const readableLabel = value => typeof value === 'string' ? value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^[A-Z ]+$/, text => text.toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase())) : value;
export function platformMatches(record, search) {
  const term = search.trim().toLocaleLowerCase();
  if (!term) return true;
  const values = Array.isArray(record) ? record : Object.values(record);
  return values.flat().some(value => ['string','number','boolean'].includes(typeof value) && (String(value).toLocaleLowerCase().includes(term) || readableLabel(String(value)).toLocaleLowerCase().includes(term)));
}
export function PlatformStatus({ value }) {
  const tone = { Active:'active', Success:'active', PendingApproval:'warning', Suspended:'warning', Inactive:'muted', Rejected:'danger', Failed:'danger' }[value] || 'muted';
  return <span className={'platform-status platform-status-' + tone}><i aria-hidden="true" />{readableLabel(value) || '—'}</span>;
}
export function PlatformRefresh({ query }) { return <Button variant="outlined" startIcon={<RefreshOutlined/>} disabled={query.isFetching} onClick={()=>query.refetch()}>Refresh</Button>; }
export function RowActions({ label, items }) {
  const [anchor,setAnchor]=useState(null);
  return <><IconButton size="small" className="ibms-row-actions-trigger" aria-label={'Actions for '+label} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={event=>setAnchor(event.currentTarget)}><MoreVert fontSize="small"/></IconButton><Menu anchorEl={anchor} open={Boolean(anchor)} onClose={()=>setAnchor(null)} anchorOrigin={{vertical:'bottom',horizontal:'right'}} transformOrigin={{vertical:'top',horizontal:'right'}} PaperProps={{className:'ibms-row-actions-menu'}}>{items.map(item=><MenuItem key={item.label} disabled={item.disabled} onClick={()=>{setAnchor(null);item.onClick?.();}}>{item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}{item.label}</MenuItem>)}</Menu></>;
}
export function PlatformTable({ rows, columns, label = "Records" }) {
  return <div className="platform-table-wrap ibms-table-frame" role="region" aria-label={label + ' table scroll area'} tabIndex={0}><table aria-label={label}><thead><tr>{columns.map(c => <th key={c[0]}>{c[1]}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={row.id ?? index}>{columns.map(c => <td key={c[0]}>{['status','resultStatus'].includes(c[0]) ? <PlatformStatus value={row[c[0]]}/> : c[0]==='roles' && Array.isArray(row.roles) ? <div className="platform-role-tags">{row.roles.map(role=><Chip key={role} size="small" label={readableLabel(role)}/>)}</div> : c[2] ? c[2](row) : ['action','entityType','entityName'].includes(c[0]) ? readableLabel(row[c[0]]) || '—' : row[c[0]] ?? '—'}</td>)}</tr>) : <tr><td colSpan={columns.length}><div className="platform-empty"><strong>No records found.</strong><span>Try adjusting your search or filters.</span></div></td></tr>}</tbody></table></div>;
}
export function Pager({ data, filters, setFilters, audit = false, itemLabel = 'records' }) {
  const key = audit ? 'pageNumber' : 'page';
  return <WorkspacePagination itemLabel={itemLabel} page={filters[key]} pageSize={filters.pageSize} totalCount={data.totalCount} onPageChange={page => setFilters(f => ({ ...f, [key]: page }))} onPageSizeChange={pageSize => setFilters(f => ({ ...f, pageSize, [key]: 1 }))} />;
}
export function SelectFilter({ label, value, options, onChange }) {
  return <TextField select size="small" InputLabelProps={{shrink:true}} SelectProps={{displayEmpty:true}} label={label} value={value || ''} onChange={e => onChange(e.target.value)}><MenuItem value="">All {label.toLowerCase() === 'status' ? 'statuses' : `${label.toLowerCase()}s`}</MenuItem>{options.map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField>;
}
export function MutationDialog({ title, initial, fields, submit, onDone, onClose, description }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState(''); const [fieldErrors, setFieldErrors] = useState({}); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const client = useQueryClient();
  const session = useRef(localStorage.getItem('billing_auth_token')).current;
  const save = async event => {
    event.preventDefault(); if (lock.current) return; if (session !== localStorage.getItem('billing_auth_token')) { setError('Your session changed. Close this form and reopen it before saving.'); return; }
    lock.current = true; setBusy(true); setError(''); setFieldErrors({});
    try { const result = await submit(values); if (session !== localStorage.getItem('billing_auth_token')) return; await client.invalidateQueries({ queryKey: ['platform'] }); onDone?.(result); onClose(); }
    catch (e) { if (session === localStorage.getItem('billing_auth_token')) { setError(platformError(e)); setFieldErrors(platformFieldErrors(e, fields)); } } finally { lock.current = false; setBusy(false); }
  };
  return <Dialog open fullWidth maxWidth="sm" onClose={() => !lock.current && onClose()} aria-labelledby="platform-editor-title"><form onSubmit={save}><DialogTitle id="platform-editor-title">{title}</DialogTitle><DialogContent>{description && <p className="platform-dialog-description">{description}</p>}{error && <Alert severity="error"><AlertTitle>Unable to save changes</AlertTitle>{error}</Alert>}<div className="platform-form">{fields.map(field => {
    if (field.type === 'autocomplete' || field.autocomplete) {
      const rawVal = values[field.name];
      const val = Array.isArray(rawVal) ? rawVal : (rawVal ? String(rawVal).split(',').map(s => s.trim()).filter(Boolean) : []);
      return (
        <div key={field.name} style={field.colSpan === 2 || field.fullWidth ? { gridColumn: '1 / -1' } : undefined}>
          <Autocomplete
            fullWidth
            multiple={Boolean(field.multiple)}
            size="small"
            id={`platform-field-${field.name}`}
            options={field.options || []}
            value={field.multiple ? val : (val[0] ?? '')}
            disabled={busy || field.disabled}
            getOptionLabel={option => {
              if (!option) return '';
              if (typeof option === 'object') return option.label || option.value || '';
              const match = field.options?.find(o => typeof o === 'object' ? o.value === option : o === option);
              return match ? (typeof match === 'object' ? match.label : match) : String(option);
            }}
            isOptionEqualToValue={(option, selectedVal) => {
              const optVal = typeof option === 'object' ? option.value : option;
              const selVal = typeof selectedVal === 'object' ? selectedVal.value : selectedVal;
              return optVal === selVal;
            }}
            filterOptions={(options, params) => {
              const query = (params.inputValue || '').trim().toLowerCase();
              if (!query) return options;
              return options.filter(option => {
                if (field.filterOption) return field.filterOption(query, option);
                if (typeof option === 'object') {
                  const searchStr = `${option.value || ''} ${option.label || ''} ${option.searchText || ''}`.toLowerCase();
                  return searchStr.includes(query);
                }
                return String(option).toLowerCase().includes(query);
              });
            }}
            onChange={(_, nextVal) => {
              const normalized = field.multiple
                ? (nextVal || []).map(item => (typeof item === 'object' ? item.value : item))
                : (typeof nextVal === 'object' ? nextVal?.value : nextVal) || '';
              setValues(v => ({ ...v, [field.name]: normalized }));
              setFieldErrors(errors => ({ ...errors, [field.name]: undefined }));
            }}
            renderTags={(tagValue, getTagProps) =>
              tagValue.map((option, index) => {
                const code = typeof option === 'object' ? option.value : option;
                return (
                  <Chip
                    {...getTagProps({ index })}
                    key={code}
                    label={code}
                    size="small"
                    className="platform-currency-tag"
                  />
                );
              })
            }
            renderInput={params => (
              <TextField
                {...params}
                label={field.label}
                required={field.required && (!val || val.length === 0)}
                error={Boolean(fieldErrors[field.name])}
                helperText={fieldErrors[field.name] || field.helperText}
                placeholder={val.length ? '' : (field.placeholder || 'Search and select...')}
              />
            )}
          />
        </div>
      );
    }
    return <TextField key={field.name} label={field.label} error={Boolean(fieldErrors[field.name])} helperText={fieldErrors[field.name] || field.helperText} value={values[field.name] ?? ''} required={field.required} disabled={busy || field.disabled} type={field.type || 'text'} select={Boolean(field.options)} SelectProps={field.multiple ? { multiple:true } : undefined} multiline={field.multiline} inputProps={{ min: field.min, max: field.max, minLength: field.minLength, maxLength: field.maxLength, pattern: field.pattern, step: field.type === 'number' ? 1 : undefined }} onChange={e => { setValues(v => ({ ...v, [field.name]: e.target.value })); setFieldErrors(errors => ({ ...errors, [field.name]: undefined })); }}>{field.options?.map(option => { const optVal = typeof option === 'object' ? option.value : option; const optLabel = typeof option === 'object' ? option.label : option; return <MenuItem key={String(optVal)} value={optVal}>{String(optLabel)}</MenuItem>; })}</TextField>;
  })}</div></DialogContent><DialogActions><Button type="button" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="contained" disabled={busy}>{busy ? 'Saving…' : 'Confirm and save'}</Button></DialogActions></form></Dialog>;
}
