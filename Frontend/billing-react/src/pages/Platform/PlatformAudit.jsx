import { useNavbarSearch } from '../../hooks/useNavbarSearch';
import { useState } from 'react';
import { Alert, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, InputAdornment } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { dateRangeError } from '../../utils/dateRangeValidation';
import { platformService as api } from './platformService';
import { PlatformShell, QueryState, PlatformTable, Pager, usePlatformQuery, dateText, readableLabel } from './PlatformShared';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import PersonOutline from '@mui/icons-material/PersonOutline';
import BadgeOutlined from '@mui/icons-material/BadgeOutlined';
import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined';
import BusinessOutlined from '@mui/icons-material/BusinessOutlined';
import TouchAppOutlined from '@mui/icons-material/TouchAppOutlined';
import CategoryOutlined from '@mui/icons-material/CategoryOutlined';
import TagOutlined from '@mui/icons-material/TagOutlined';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import FingerprintOutlined from '@mui/icons-material/FingerprintOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import UndoOutlined from '@mui/icons-material/UndoOutlined';
import RedoOutlined from '@mui/icons-material/RedoOutlined';
import Close from '@mui/icons-material/Close';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import Check from '@mui/icons-material/Check';
// A legacy default Success value is not evidence of a traced operation.
export function platformAuditResult(row) {
  const present = value => value !== null && value !== undefined && String(value).trim() !== '';
  return ['actorUserId', 'actorRole', 'correlationId', 'resultStatus'].every(key => present(row[key]))
    ? row.resultStatus : 'Unknown';
}
export function parseAuditPayload(value) {
  if (value === null || value === undefined || value === '') return { text: '', json: null };
  if (typeof value === 'object') return { text: '', json: JSON.stringify(value, null, 2) };
  const trimmed = String(value).trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      return { text: '', json: JSON.stringify(parsed, null, 2) };
    } catch {}
  }
  const jsonStart = trimmed.search(/[\{\[]/);
  if (jsonStart !== -1) {
    const prefix = trimmed.slice(0, jsonStart).replace(/\s*(Data|Payload|Details)?\s*:\s*$/i, '').trim();
    const potentialJson = trimmed.slice(jsonStart).trim();
    try {
      const parsed = JSON.parse(potentialJson);
      return { text: prefix, json: JSON.stringify(parsed, null, 2) };
    } catch {}
  }
  return { text: trimmed, json: null };
}

function AuditPayloadViewer({ raw }) {
  const [copied, setCopied] = useState(false);
  const payload = parseAuditPayload(raw);

  const handleCopy = () => {
    const textToCopy = payload.json || payload.text;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!payload.json && !payload.text) {
    return <span className="platform-audit-empty-payload">No modifications recorded</span>;
  }

  if (!payload.json) {
    return <div className="platform-audit-plain-changes">{payload.text}</div>;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(payload.json);
  } catch {}

  const summaryPills = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Object.entries(parsed)
        .filter(([k, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object' && !['Id', 'TenantId', 'RowVersion'].includes(k))
        .slice(0, 6)
    : [];

  return (
    <div className="platform-audit-payload-box">
      {payload.text && (
        <div className="platform-audit-payload-desc">
          <span className="platform-audit-desc-bullet" />
          <span>{payload.text}</span>
        </div>
      )}

      {summaryPills.length > 0 && (
        <div className="platform-audit-pills-row">
          {summaryPills.map(([k, v]) => (
            <span key={k} className="platform-audit-pill">
              <span className="platform-audit-pill-key">{readableLabel(k)}:</span>
              <strong className="platform-audit-pill-val">{String(v)}</strong>
            </span>
          ))}
          {Array.isArray(parsed?.Items) && parsed.Items.length > 0 && (
            <span className="platform-audit-pill">
              <span className="platform-audit-pill-key">Items:</span>
              <strong className="platform-audit-pill-val">{parsed.Items.length} item{parsed.Items.length > 1 ? 's' : ''}</strong>
            </span>
          )}
        </div>
      )}

      <div className="platform-audit-code-header">
        <span className="platform-audit-code-tag">Formatted JSON</span>
        <button
          type="button"
          className="platform-audit-copy-btn"
          onClick={handleCopy}
          aria-label="Copy payload"
        >
          {copied ? <Check fontSize="inherit" /> : <ContentCopyOutlined fontSize="inherit" />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>

      <pre className="platform-audit-json-pre">
        <code>{payload.json}</code>
      </pre>
    </div>
  );
}
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
  return <PlatformShell title="Platform Audit Logs"><form className="platform-filters platform-audit-filters" onSubmit={apply}><div className="platform-audit-filter-fields">{[['tenantId','Tenant ID','number',<TagOutlined fontSize="small"/>],['actor','Actor','text',<PersonOutline fontSize="small"/>],['action','Action','text',<TouchAppOutlined fontSize="small"/>],['entityName','Entity','text',<CategoryOutlined fontSize="small"/>]].map(([key,label,type,icon])=><TextField key={key} placeholder={label} type={type} size="small" InputProps={{startAdornment:<InputAdornment position="start" className="platform-audit-adornment">{icon}</InputAdornment>}} inputProps={{'aria-label':label,min:key==='tenantId'?1:undefined}} value={draft[key]} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/>)}<DateRangeFilter iconOnly className="platform-audit-date-range" startDate={draft.startDate} endDate={draft.endDate} onApply={range=>{setDraft(current=>({...current,...range}));setValidation('');}}/></div><div className="platform-audit-filter-actions"><Button type="submit" variant="contained">Apply Filters</Button><Button type="button" variant="outlined" className="platform-reset-btn" onClick={()=>{setDraft({tenantId:'',actor:'',action:'',entityName:'',startDate:'',endDate:''});setFilters({pageNumber:1,pageSize:20});setValidation('');}}>Reset</Button></div></form>{validation && <Alert severity="error" className="platform-query-error">{validation}</Alert>}
  <QueryState query={query} resource="platform audit logs">{query.data && <><PlatformTable label="Platform audit logs" rows={query.data.items} columns={[[ 'timestamp','Timestamp',r=>dateText(r.timestamp)],['actorUserName','Actor'],['action','Action'],['entityType','Entity',r=>r.entityType+' '+r.entityId],['tenantName','Tenant',r=>r.tenantName || r.tenantCode || r.tenantId],['outcome','Result',r=>platformAuditResult(r)],...(query.data.items.some(row=>row.correlationId)?[['correlationId','Correlation ID',r=>(r.correlationId && String(r.correlationId).trim()) ? r.correlationId : 'NA']]:[]),['details','Details',r=><Button onClick={()=>setDetail(r)}>View</Button>]]}/><Pager audit itemLabel="audit logs" data={query.data} filters={filters} setFilters={setFilters}/></>}</QueryState>
  {detail && <Dialog open fullWidth maxWidth="md" onClose={()=>setDetail(null)} aria-labelledby="audit-detail-title" PaperProps={{className:'platform-audit-dialog'}}>
    <DialogTitle id="audit-detail-title" className="platform-audit-dialog-title">
      <div className="platform-audit-dialog-header">
        <div className="platform-audit-title-group">
          <AssignmentOutlined className="platform-audit-header-icon"/>
          <div className="platform-audit-title-text">
            <h3>Audit Details</h3>
            <span className="platform-audit-subtitle">Comprehensive trace and execution provenance for this administrative action</span>
          </div>
        </div>
        <IconButton aria-label="Close" onClick={()=>setDetail(null)} size="small"><Close fontSize="small"/></IconButton>
      </div>
    </DialogTitle>
    <DialogContent className="platform-audit-dialog-content">
      {platformAuditResult(detail)==='Unknown' && <Alert severity="info" className="platform-audit-alert">Operation outcome is unknown because audit provenance or the reported result is missing. A reported Success value alone does not confirm a committed operation.</Alert>}
      <div className="platform-audit-summary-bar">
        <div className="platform-audit-summary-item"><span className="platform-audit-summary-label">Action</span><span className="platform-audit-action-chip">{detail.action || 'Unknown'}</span></div>
        <div className="platform-audit-summary-item"><span className="platform-audit-summary-label">Target Entity</span><strong>{detail.entityType || 'Entity'}{detail.entityId ? ` #${detail.entityId}` : ''}</strong></div>
        <div className="platform-audit-summary-item"><span className="platform-audit-summary-label">Outcome</span><span className={`platform-status platform-status-${platformAuditResult(detail) === 'Success' ? 'active' : platformAuditResult(detail) === 'Failed' ? 'danger' : 'muted'}`}><i aria-hidden="true" />{platformAuditResult(detail)}</span></div>
        <div className="platform-audit-summary-item"><span className="platform-audit-summary-label">Recorded At</span><span>{dateText(detail.timestamp)}</span></div>
      </div>
      {[
        {
          title: 'Actor & Identity',
          icon: <PersonOutline fontSize="small"/>,
          fields: [
            { key: 'actorUserName', label: 'Actor', icon: <PersonOutline fontSize="small"/>, value: detail.actorUserName ?? 'Unknown' },
            { key: 'actorUserId', label: 'Actor User ID', icon: <BadgeOutlined fontSize="small"/>, value: detail.actorUserId ?? 'Unknown' },
            { key: 'actorRole', label: 'Actor Role', icon: <AdminPanelSettingsOutlined fontSize="small"/>, value: detail.actorRole ?? 'Unknown' },
            { key: 'tenantId', label: 'Tenant ID', icon: <BusinessOutlined fontSize="small"/>, value: detail.tenantId ?? 'Unknown' }
          ]
        },
        {
          title: 'Action & Target Resource',
          icon: <CategoryOutlined fontSize="small"/>,
          fields: [
            { key: 'action', label: 'Action', icon: <TouchAppOutlined fontSize="small"/>, value: detail.action ?? 'Unknown' },
            { key: 'entityType', label: 'Entity Type', icon: <CategoryOutlined fontSize="small"/>, value: detail.entityType ?? 'Unknown' },
            { key: 'entityId', label: 'Entity ID', icon: <TagOutlined fontSize="small"/>, value: detail.entityId ?? 'Unknown' },
            { key: 'timestamp', label: 'Timestamp', icon: <AccessTimeOutlined fontSize="small"/>, value: dateText(detail.timestamp) }
          ]
        },
        {
          title: 'Execution & Traceability',
          icon: <FactCheckOutlined fontSize="small"/>,
          fields: [
            { key: 'outcome', label: 'Result', icon: <CheckCircleOutline fontSize="small"/>, value: platformAuditResult(detail), isStatus: true },
            { key: 'resultStatus', label: 'Reported Result', icon: <FactCheckOutlined fontSize="small"/>, value: detail.resultStatus ?? 'Unknown', isStatus: true },
            { key: 'correlationId', label: 'Correlation ID', icon: <FingerprintOutlined fontSize="small"/>, value: (detail.correlationId && String(detail.correlationId).trim()) ? detail.correlationId : 'NA', isCode: true, fullWidth: true }
          ]
        },
        ...((detail.changes !== undefined && detail.changes !== null) || detail.oldValues || detail.newValues ? [{
          title: 'Modifications & Payload',
          icon: <HistoryOutlined fontSize="small"/>,
          fields: [
            ...(detail.changes !== undefined && detail.changes !== null ? [{ key: 'changes', label: 'Changes', icon: <HistoryOutlined fontSize="small"/>, value: detail.changes, isPayload: true, fullWidth: true }] : []),
            ...(detail.oldValues ? [{ key: 'oldValues', label: 'Old Values', icon: <UndoOutlined fontSize="small"/>, value: detail.oldValues, isPayload: true, fullWidth: true }] : []),
            ...(detail.newValues ? [{ key: 'newValues', label: 'New Values', icon: <RedoOutlined fontSize="small"/>, value: detail.newValues, isPayload: true, fullWidth: true }] : [])
          ]
        }] : [])
      ].map(section => (
        <section key={section.title} className="platform-audit-section">
          <div className="platform-audit-section-header">{section.icon}<span>{section.title}</span></div>
          <dl className="platform-audit-grid">
            {section.fields.map(field => (
              <div key={field.key} className={`platform-audit-field ${field.fullWidth ? 'platform-audit-field-full' : ''}`}><dt className="platform-audit-dt">{field.icon}<span>{field.label}</span></dt><dd className="platform-audit-dd">{field.isPayload ? <AuditPayloadViewer raw={field.value} /> : field.isStatus ? <span className={`platform-status platform-status-${field.value === 'Success' ? 'active' : field.value === 'Failed' ? 'danger' : 'muted'}`}><i aria-hidden="true" />{field.value}</span> : field.isCode ? <code className="platform-audit-code">{field.value}</code> : field.value}</dd></div>
            ))}
          </dl>
        </section>
      ))}
    </DialogContent>
    <DialogActions className="platform-audit-dialog-actions"><Button variant="contained" className="platform-audit-close-btn" onClick={()=>setDetail(null)}>Close</Button></DialogActions>
  </Dialog>}
  </PlatformShell>;
}
