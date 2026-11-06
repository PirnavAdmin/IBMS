import { useNavbarSearch } from '../../hooks/useNavbarSearch';
import { useState } from 'react';
import { Alert, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { dateRangeError } from '../../utils/dateRangeValidation';
import { platformService as api } from './platformService';
import { PlatformShell, QueryState, PlatformTable, Pager, usePlatformQuery, dateText } from './PlatformShared';
export function platformAuditParams(draft, pageSize) {
  if (draft.startDate || draft.endDate) {
    const error = dateRangeError(draft);
    if (error) throw new Error(error);
  }
  const values = Object.fromEntries(Object.entries(draft).filter(([,value]) => value !== ''));
  // Match tenant audit filters: complete Indian calendar days, sent as UTC instants.
  if (values.startDate) values.startDate = new Date(`${values.startDate}T00:00:00+05:30`).toISOString();
  if (values.endDate) values.endDate = new Date(`${values.endDate}T23:59:59.999+05:30`).toISOString().replace('.999Z', '.9999999Z');
  return {...values, pageNumber:1, pageSize};
}
export function PlatformAudit() {
  const [params]=useSearchParams();const [draft,setDraft]=useState({tenantId:params.get('tenantId') || '',actor:'',action:'',entityName:'',startDate:'',endDate:''});
  const [filters,setFilters]=useState({pageNumber:1,pageSize:20,...(params.get('tenantId')?{tenantId:params.get('tenantId')}: {})});const [detail,setDetail]=useState(null);
  const [validation,setValidation]=useState('');
  useNavbarSearch(draft.actor,value=>{setDraft(d=>({...d,actor:value}));setFilters(f=>({...f,actor:value,pageNumber:1}));},'Search audit actor');
  const query=usePlatformQuery('audit',filters,signal=>api.audit(filters,signal));
  const apply=event=>{event.preventDefault();try {const next=platformAuditParams(draft,filters.pageSize);setValidation('');setFilters(next);} catch(error) {setValidation(error.message);}};
  return <PlatformShell title="Platform Audit Logs"><form className="platform-filters" onSubmit={apply}>{[['tenantId','Tenant ID','number'],['actor','Actor','text'],['action','Action','text'],['entityName','Entity','text']].map(([key,label,type])=><TextField key={key} label={label} type={type} size="small" InputLabelProps={{shrink:true}} inputProps={{min:key==='tenantId'?1:undefined}} value={draft[key]} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/>)}<DateRangeFilter startDate={draft.startDate} endDate={draft.endDate} onApply={range=>{setDraft(current=>({...current,...range}));setValidation('');}}/><Button type="submit" variant="contained">Apply Filters</Button><Button type="button" onClick={()=>{setDraft({tenantId:'',actor:'',action:'',entityName:'',startDate:'',endDate:''});setFilters({pageNumber:1,pageSize:20});setValidation('');}}>Reset</Button></form>{validation && <Alert severity="error" className="platform-query-error">{validation}</Alert>}
  <QueryState query={query} resource="platform audit logs">{query.data && <><PlatformTable label="Platform audit logs" rows={query.data.items} columns={[[ 'timestamp','Timestamp',r=>dateText(r.timestamp)],['actorUserName','Actor'],['action','Action'],['entityType','Entity',r=>r.entityType+' '+r.entityId],['tenantName','Tenant',r=>r.tenantName || r.tenantCode || r.tenantId],['resultStatus','Result'],...(query.data.items.some(row=>row.correlationId)?[['correlationId','Correlation ID']]:[]),['details','Details',r=><Button onClick={()=>setDetail(r)}>View</Button>]]}/><Pager audit itemLabel="audit logs" data={query.data} filters={filters} setFilters={setFilters}/></>}</QueryState>
  {detail && <Dialog open fullWidth maxWidth="md" onClose={()=>setDetail(null)} aria-labelledby="audit-detail-title"><DialogTitle id="audit-detail-title">Audit Details</DialogTitle><DialogContent><dl>{[['timestamp','Timestamp'],['actorUserName','Actor'],['action','Action'],['entityType','Entity Type'],['entityId','Entity ID'],['tenantId','Tenant ID'],['resultStatus','Result'],['correlationId','Correlation ID'],['changes','Changes'],['oldValues','Old Values'],['newValues','New Values']].filter(([key])=>!['correlationId','oldValues','newValues'].includes(key)||detail[key]).map(([key,label])=><div key={key}><dt>{label}</dt><dd className="platform-detail-text">{detail[key] ?? '—'}</dd></div>)}</dl></DialogContent><DialogActions><Button onClick={()=>setDetail(null)}>Close</Button></DialogActions></Dialog>}
  </PlatformShell>;
}
