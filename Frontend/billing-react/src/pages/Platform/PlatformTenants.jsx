import { useNavbarSearch } from '../../hooks/useNavbarSearch';
import { useRef, useState } from 'react';
import { Button, TextField } from '@mui/material';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import SyncAltOutlined from '@mui/icons-material/SyncAltOutlined';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSearchDebounce } from '../../hooks/useSearchDebounce';
import { platformService as api } from './platformService';
import { RowActions, PlatformStatus, PlatformShell, PlatformRefresh, QueryState, PlatformTable, Pager, SelectFilter, MutationDialog, usePlatformQuery, dateText } from './PlatformShared';
import { TenantOrganizationOverview } from './TenantOrganizationOverview';

const fields = [
  {name:'name',label:'Company Name',required:true,minLength:2,maxLength:256},
  {name:'companyEmail',label:'Contact Email',type:'email',maxLength:256},
  {name:'phone',label:'Phone',maxLength:64},
  {name:'taxId',label:'Tax ID',maxLength:64},
  {name:'address',label:'Address',multiline:true}
];

export function TenantEditor({ tenant, onClose, onDone }) {
  const creating = !tenant;
  const idempotencyKey = useRef(crypto.randomUUID());
  const initial = Object.fromEntries(fields.map(f=>[f.name,tenant?.[f.name] || '']));
  const formFields = creating
    ? [...fields, {name:'tenantCode',label:'Tenant Code',required:true,pattern:'[a-zA-Z0-9_-]{2,64}',maxLength:64,minLength:2}]
    : [...fields, {name:'status',label:'Status',options:['Active','Suspended','Inactive']}];
  return <MutationDialog
    title={creating ? 'Create Tenant' : 'Edit Tenant'}
    onClose={onClose}
    onDone={onDone}
    initial={creating ? {...initial,tenantCode:''} : {...initial,status:tenant?.status || 'Active'}}
    fields={formFields}
    submit={v => {
      const payload = { name: v.name.trim() };
      for (const key of ['companyEmail','phone','taxId','address']) payload[key] = v[key]?.trim() || null;
      if (!creating && v.status) payload.status = v.status;
      return creating
        ? api.createTenant({ ...payload, tenantCode: v.tenantCode.trim(), idempotencyKey: idempotencyKey.current })
        : api.updateTenant(tenant.id, { ...payload, expectedUpdatedAtUtc: tenant.updatedAtUtc });
    }}
  />;
}

export function PlatformTenants() {
  const [filters,setFilters]=useState({page:1,pageSize:20,search:'',status:''});
  const [params,setParams]=useSearchParams(); const navigate=useNavigate(); const [creating,setCreating]=useState(params.get('create')==='1');
  const [statusEditor,setStatusEditor]=useState(null);
  const search=useSearchDebounce(filters.search); const query=usePlatformQuery('tenants',{...filters,search},signal=>api.tenants({...filters,search},signal));
  const change=(key,value)=>setFilters(f=>({...f,[key]:value,page:1}));
  useNavbarSearch(filters.search,value=>change('search',value),'Search tenants');
  return <PlatformShell title="Tenant Management" actions={<><PlatformRefresh query={query}/><Button variant="contained" disabled={query.isPending || query.isError} onClick={()=>setCreating(true)}>Create Tenant</Button></>}>
    <div className="platform-filters"><TextField size="small" label="Search tenants" value={filters.search} onChange={e=>change('search',e.target.value)} /><SelectFilter label="Status" value={filters.status} options={['Active','Suspended','Inactive']} onChange={v=>change('status',v)} /></div>
    <QueryState query={query} resource="tenants">{query.data && <><PlatformTable label="Tenant directory" rows={query.data.items} columns={[[ 'id','ID'],['tenantCode','Tenant Code'],['name','Company'],['companyEmail','Contact Email'],['status','Status',r=><PlatformStatus value={r.status}/>],['createdAtUtc','Created',r=>dateText(r.createdAtUtc)],['actions','Actions',r=><RowActions label={r.name || r.tenantCode || 'tenant'} items={[{label:'View details',icon:<VisibilityOutlined fontSize="small"/>,onClick:()=>navigate('/platform/tenants/'+r.id)},{label:'Change Status',icon:<SyncAltOutlined fontSize="small"/>,onClick:()=>setStatusEditor(r)}]}/>]]} /><Pager itemLabel="tenants" data={query.data} filters={filters} setFilters={setFilters}/></>}</QueryState>
    {creating && <TenantEditor onClose={()=>{setCreating(false);params.delete('create');setParams(params,{replace:true});}} onDone={r=>navigate('/platform/tenants/'+r.id)} />}
    {statusEditor && <MutationDialog title={`Change Status: ${statusEditor.name}`} description="Suspending or deactivating a tenant terminates its active sessions and prevents users from logging in. Confirm the target status and provide an audit reason." initial={{status:statusEditor.status || 'Active',reason:''}} fields={[{name:'status',label:'Status',required:true,options:['Active','Suspended','Inactive']},{name:'reason',label:'Reason',required:true,minLength:5,multiline:true}]} submit={v=>api.tenantStatus(statusEditor.id,v)} onClose={()=>setStatusEditor(null)} onDone={()=>{setStatusEditor(null);query.refetch();}} />}
  </PlatformShell>;
}

export function PlatformTenantDetails() {
  const {id}=useParams();
  const query=usePlatformQuery('tenant',id,signal=>api.tenant(id,signal));
  const usersQuery=usePlatformQuery('tenant-users',id,signal=>api.tenantUsers(Number(id),signal));
  const rolesQuery=usePlatformQuery('tenant-roles',id,signal=>api.tenantRoles(Number(id),signal));
  const [editor,setEditor]=useState(null);
  const t=query.data;
  const combinedRefresh={isFetching:query.isFetching||usersQuery.isFetching||rolesQuery.isFetching,refetch:()=>{query.refetch();usersQuery.refetch();rolesQuery.refetch();}};
  return <PlatformShell title={t ? t.name : 'Tenant Details'} actions={<><PlatformRefresh query={combinedRefresh}/><Button component={Link} to="/platform/tenants" variant="outlined" className="workspace-back-button">Back to Tenants</Button></>}><QueryState query={query} resource="tenant details">{t && <>
    <section className="platform-panel"><dl>{[['tenantCode','Code'],['companyEmail','Email'],['phone','Phone'],['taxId','Tax ID'],['address','Address'],['status','Status'],['userCount','Users'],['createdAtUtc','Created']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{key==='createdAtUtc'?dateText(t[key]):key==='status'?<PlatformStatus value={t[key]}/>:t[key]??'—'}</dd></div>)}</dl><div className="platform-actions"><Button onClick={()=>setEditor('edit')}>Edit Tenant</Button><Button onClick={()=>setEditor('status')}>Change Status</Button><Button component={Link} to={'/platform/audit?tenantId='+t.id}>Administration Activity</Button></div></section>
    <TenantOrganizationOverview tenantUserCount={t.userCount} usersQuery={usersQuery} rolesQuery={rolesQuery} />
    <section className="platform-panel"><h2>Assigned Administrators</h2><PlatformTable rows={t.assignedAdmins || []} columns={[[ 'name','Name'],['email','Email'],['status','Status'],['roles','Roles',r=>r.roles?.join(', ')]]}/></section>
    {editor==='edit' && <TenantEditor tenant={t} onClose={()=>setEditor(null)} onDone={()=>{setEditor(null);query.refetch();}}/>}
    {editor==='status' && <MutationDialog title="Change Tenant Status" description="Suspending or deactivating a tenant terminates its active sessions and prevents users from logging in. Confirm the target status and provide an audit reason." initial={{status:t.status,reason:''}} fields={[{name:'status',label:'Status',required:true,options:['Active','Suspended','Inactive']},{name:'reason',label:'Reason',required:true,minLength:5,multiline:true}]} submit={v=>api.tenantStatus(t.id,v)} onClose={()=>setEditor(null)} onDone={()=>{setEditor(null);query.refetch();}}/>}
  </>}</QueryState></PlatformShell>;
}
