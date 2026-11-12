import { useState } from 'react';
import { useNavbarSearch } from '../../hooks/useNavbarSearch';
import { Button } from '@mui/material';
import { Link } from 'react-router-dom';
import BusinessOutlined from '@mui/icons-material/BusinessOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import PauseCircleOutline from '@mui/icons-material/PauseCircleOutline';
import RemoveCircleOutline from '@mui/icons-material/RemoveCircleOutline';
import PeopleOutline from '@mui/icons-material/PeopleOutline';
import AddBusinessOutlined from '@mui/icons-material/AddBusinessOutlined';
import ArrowForward from '@mui/icons-material/ArrowForward';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import { platformService as api } from './platformService';
import { PlatformShell, QueryState, PlatformTable, PlatformStatus, PlatformRefresh, usePlatformQuery, dateText, platformMatches } from './PlatformShared';
const metrics=[['totalTenants','Total Tenants',BusinessOutlined,'espresso'],['activeTenants','Active Tenants',CheckCircleOutline,'green'],['suspendedTenants','Suspended Tenants',PauseCircleOutline,'amber'],['inactiveTenants','Inactive Tenants',RemoveCircleOutline,'muted'],['totalPlatformUsers','Total Platform Users',PeopleOutline,'cocoa']];
export function PlatformDashboard() {
  const [search,setSearch]=useState('');useNavbarSearch(search,setSearch,'Search recent tenants and activities');
  const query=usePlatformQuery('dashboard',null,api.dashboard);const d=query.data;
  return <PlatformShell title="Platform Dashboard" actions={<PlatformRefresh query={query}/>}><QueryState query={query} resource="platform dashboard">{d && <>
    {search.trim() && <p className="platform-description">Search filters the recent tenants and activities below.</p>}<div className="platform-metrics">{metrics.filter(([key])=>Number.isFinite(d[key])).map(([key,label,Icon,tone])=><section className={'platform-panel platform-metric platform-metric-'+tone} key={key}><div className="platform-metric-top"><span>{label}</span><Icon aria-hidden="true"/></div><strong>{d[key].toLocaleString('en-IN')}</strong></section>)}</div>
    {Number.isFinite(d.pendingUserApprovals) && d.pendingUserApprovals > 0 && <section className="platform-panel platform-approval-banner" role="status"><div><strong>{d.pendingUserApprovals} self-registered tenant{d.pendingUserApprovals === 1 ? '' : 's'} awaiting SuperAdmin approval</strong><p>Review OTP-verified tenant registrations before granting sign-in access.</p></div><Button component={Link} to="/platform/tenants?tab=approvals" variant="contained">Review Approvals</Button></section>}
    <nav className="platform-quick-actions" aria-label="Platform quick actions">{[['/platform/tenants?create=1','Create Tenant',AddBusinessOutlined],['/platform/tenants','View Tenants',BusinessOutlined],['/platform/users','Manage Platform Users',PeopleOutline],['/platform/audit','View Audit Logs',HistoryOutlined]].map(([to,label,Icon])=><Button key={to} component={Link} to={to} startIcon={<Icon/>}>{label}</Button>)}</nav>
    <section className="platform-panel"><div className="platform-section-heading"><div><h2>Recently Created Tenants</h2><p>Your most recently registered organizations.</p></div><Button component={Link} to="/platform/tenants" endIcon={<ArrowForward/>}>View all tenants</Button></div><PlatformTable label="Recently created tenants" rows={(d.recentTenants || []).filter(row=>platformMatches(row,search))} columns={[[ 'tenantCode','Code'],['name','Company'],['status','Status'],['createdAtUtc','Created',r=>dateText(r.createdAtUtc)],['view','Details',r=><Link className="platform-text-link" to={'/platform/tenants/'+r.id}>View tenant</Link>]]}/></section>
    <div className="platform-overview-grid"><section className="platform-panel"><div className="platform-section-heading"><div><h2>Recent Platform Activities</h2><p>Latest administration events.</p></div><Button component={Link} to="/platform/audit" endIcon={<ArrowForward/>}>View audit logs</Button></div><PlatformTable label="Recent platform activities" rows={(d.recentAdminEvents || []).slice(0,5).filter(row=>platformMatches(row,search))} columns={[[ 'timestamp','Timestamp',r=>dateText(r.timestamp)],['actor','Actor'],['action','Action'],['entityName','Entity'],['tenantCode','Tenant'],['status','Result']]}/></section>
    <section className="platform-panel platform-status-overview"><div className="platform-section-heading"><div><h2>Tenant Status Overview</h2><p>Workspace availability at a glance.</p></div></div>{[['Active','activeTenants'],['Suspended','suspendedTenants'],['Inactive','inactiveTenants']].filter(([,key])=>Number.isFinite(d[key])).map(([status,key])=><div className="platform-status-summary" data-status={status} key={key} title={d.tenantStatusDefinitions?.[status]}><div><PlatformStatus value={status}/><strong>{d[key]}</strong></div><div className="platform-status-track" role="img" aria-label={status+': '+d[key]+' of '+d.totalTenants+' tenants'}><span style={{width:(d.totalTenants>0?Math.min(100,d[key]/d.totalTenants*100):0)+'%'}}/></div>{Number.isFinite(d.totalTenants) && <p>{d[key]} of {d.totalTenants} tenants</p>}</div>)}</section></div>
  </>}</QueryState></PlatformShell>;
}
