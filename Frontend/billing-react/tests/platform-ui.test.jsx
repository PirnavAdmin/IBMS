import { PlatformUsers } from '../src/pages/Platform/PlatformUsers';
import { PlatformAudit } from '../src/pages/Platform/PlatformAudit';
import { PlatformSettings } from '../src/pages/Platform/PlatformSettings';
import React, { act } from 'react';
import test from 'node:test';import assert from 'node:assert/strict';
import { createRoot } from 'react-dom/client';import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from 'billing-api-client';
import { isPlatformAdmin, loginDestination, platformNavigation } from '../src/pages/Platform/platformAccess';
import { platformService as api, platformPage, platformError } from '../src/pages/Platform/platformService';
import { PlatformRoute } from '../src/pages/Platform/PlatformRoute';
import { DashboardSidebar } from '../src/components/dashboard/DashboardSidebar';
import { PlatformTenants, TenantEditor } from '../src/pages/Platform/PlatformTenants';
import { PlatformDashboard } from '../src/pages/Platform/PlatformDashboard';
import { platformScope } from '../src/pages/Platform/PlatformShared';
const admin={userId:90,tenantId:1,roles:['SuperAdmin']};
async function mount(component,user=admin){localStorage.setItem('billing_auth_user',JSON.stringify(user));const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});await act(async()=>root.render(<QueryClientProvider client={client}><MemoryRouter>{component}</MemoryRouter></QueryClientProvider>));await act(async()=>new Promise(r=>setTimeout(r,30)));return {host,client,close:async()=>{await act(async()=>root.unmount());host.remove();client.clear();localStorage.clear();}};}
const click=el=>act(async()=>{assert.ok(el);Simulate.click(el);});
test('login destination and platform authorization require exact backend SuperAdmin role',()=>{assert.equal(loginDestination(admin),'/platform/dashboard');for(const role of ['TenantAdmin','BillingManager','Accountant','Viewer']){assert.equal(loginDestination({roles:[role]}),'/dashboard');assert.equal(isPlatformAdmin({roles:[role],permissions:['*']}),false);}assert.equal(isPlatformAdmin({Roles:['SuperAdmin']}),true);});
test('SuperAdmin sidebar exposes exactly the five platform modules',async()=>{const v=await mount(<DashboardSidebar onNavigate={()=>{}} onSelect={()=>{}} onToggle={()=>{}} onClose={()=>{}}/>);try{const labels=[...v.host.querySelectorAll('.bd-nav-item')].map(n=>n.textContent);assert.deepEqual(labels,platformNavigation[0].items.map(i=>i.label));assert.equal(v.host.querySelector('[aria-label="Invoices"]'),null);}finally{await v.close();}});
test('tenant sidebar retains business navigation and no platform entries',async()=>{for(const roles of [['TenantAdmin'],['BillingManager'],['Accountant'],['Viewer']]){const v=await mount(<DashboardSidebar onNavigate={()=>{}} onSelect={()=>{}} onToggle={()=>{}} onClose={()=>{}}/>,{roles,permissions:['invoices.view','customers.view']});try{assert.ok(v.host.querySelector('[aria-label="Invoices"]'));assert.equal(v.host.querySelector('[aria-label="Tenant Management"]'),null);}finally{await v.close();}}});
test('platform route denies tenant users without mounting protected content',async()=>{const v=await mount(<PlatformRoute><div data-secret>Platform Data</div></PlatformRoute>,{roles:['TenantAdmin']});try{assert.match(v.host.textContent,/Access denied/);assert.equal(v.host.querySelector('[data-secret]'),null);}finally{await v.close();}});
test('platform page envelope rejects malformed responses',()=>{for(const r of [{},{success:false},{success:true,data:{}},{success:true,data:{items:[],totalCount:'1'}}])assert.throws(()=>platformPage(r));assert.deepEqual(platformPage({success:true,data:{items:[],totalCount:0,pageNumber:1,pageSize:20}}).items,[]);});
test('GET adapters use verified platform endpoints and exact server filters',async()=>{const original=apiClient.get;const calls=[];apiClient.get=async(url,config)=>{calls.push({url,...config});return{success:true,data:['/tenants','/users','/audit'].some(s=>url.endsWith(s))?{items:[],totalCount:0,pageNumber:1,pageSize:20}:{}};};try{await api.dashboard();await api.tenants({search:'Acme',status:'Active',page:2,pageSize:20});await api.tenant(4);await api.users({role:'SuperAdmin',page:1,pageSize:20});await api.audit({actor:'Admin',tenantId:4,pageNumber:1,pageSize:20});await api.settings();assert.deepEqual(calls.map(c=>c.url),['/api/v1/platform/dashboard','/api/v1/platform/tenants','/api/v1/platform/tenants/4','/api/v1/platform/users','/api/v1/platform/audit','/api/v1/platform/settings']);assert.equal(calls[1].params.page,2);assert.equal(calls[3].params.role,'SuperAdmin');assert.equal(calls[4].params.tenantId,4);}finally{apiClient.get=original;}});
test('mutation adapters preserve tenant concurrency and use supported status/assignment contracts',async()=>{const originals={};const calls=[];for(const method of ['post','put','patch']){originals[method]=apiClient[method];apiClient[method]=async(url,payload)=>{calls.push({method,url,payload});return{success:true,data:{id:4}};};}try{await api.createTenant({name:'Example',tenantCode:'EX'});await api.updateTenant(4,{name:'Example',expectedUpdatedAtUtc:'2026-11-04T00:00:00Z'});await api.tenantStatus(4,{status:'Suspended',reason:'Maintenance'});await api.userStatus(3,'Inactive');await api.assignRoles(3,['TenantAdmin']);await api.assignTenant(3,{userId:3,tenantId:4,applicationId:'IBMS'});await api.updateSettings({platformName:'IBMS'});assert.equal(calls[1].payload.expectedUpdatedAtUtc,'2026-11-04T00:00:00Z');assert.equal(calls[2].url,'/api/v1/platform/tenants/4/status');assert.deepEqual(calls[4].payload,{roles:['TenantAdmin']});assert.equal(calls[5].url,'/api/v1/platform/users/3/assignment');}finally{Object.assign(apiClient,originals);}});
test('platform errors preserve authoritative 401/403/404/409 states',()=>{for(const [status,match] of [[401,/expired/],[403,/access/],[404,/not found/],[409,/Conflict/]])assert.match(platformError({response:{status,data:{message:'Concurrent update'}}}),match);});
test('platform caches separate users tenants and successive sessions without putting tokens in keys',()=>{localStorage.setItem('billing_auth_token','session-a');const a=platformScope(admin);const b=platformScope({...admin,userId:91});const c=platformScope({...admin,tenantId:2});localStorage.setItem('billing_auth_token','session-b');const d=platformScope(admin);assert.notDeepEqual(a,b);assert.notDeepEqual(a,c);assert.notDeepEqual(a,d);assert.doesNotMatch(JSON.stringify(a),/session-a/);localStorage.clear();});
test('tenant directory shows real mapped fields and empty/error states',async()=>{const original=api.tenants;api.tenants=async()=>({items:[{id:4,tenantCode:'AC',name:'Acme',companyEmail:'acme@example.test',status:'Active'}],totalCount:1,pageNumber:1,pageSize:20});let v=await mount(<PlatformTenants/>);try{assert.match(v.host.textContent,/Acme/);assert.match(v.host.textContent,/acme@example.test/);}finally{await v.close();}api.tenants=async()=>({items:[],totalCount:0,pageNumber:1,pageSize:20});v=await mount(<PlatformTenants/>);try{assert.match(v.host.textContent,/No records found/);}finally{await v.close();}api.tenants=async()=>{throw Object.assign(new Error('Denied'),{response:{status:403}});};v=await mount(<PlatformTenants/>);try{assert.match(v.host.textContent,/platform administration access/);}finally{await v.close();api.tenants=original;}});
test('tenant editor keeps input after 409 and prevents duplicate submission',async()=>{const original=api.updateTenant;let calls=0, reject;api.updateTenant=()=>{calls++;return new Promise((_,r)=>reject=r);};const v=await mount(<TenantEditor tenant={{id:4,name:'Acme',companyEmail:'acme@example.test',updatedAtUtc:'stamp'}} onClose={()=>{}}/>);try{const form=document.querySelector('[role="dialog"] form');await act(async()=>{Simulate.submit(form);Simulate.submit(form);});assert.equal(calls,1);await act(async()=>reject({response:{status:409,data:{message:'Stale tenant'}}}));assert.match(document.querySelector('[role="alert"]').textContent,/Conflict: Stale tenant/);assert.equal(document.querySelector('input').value,'Acme');}finally{await v.close();api.updateTenant=original;}});
test('dashboard omits unsupported metrics rather than inventing zeroes',async()=>{const original=api.dashboard;api.dashboard=async()=>({totalTenants:3,recentTenants:[],recentAdminEvents:[]});const v=await mount(<PlatformDashboard/>);try{assert.match(v.host.textContent,/Total Tenants/);assert.doesNotMatch(v.host.textContent,/Total Platform Users/);assert.equal(v.host.querySelector('.platform-metrics strong').textContent,'3');}finally{await v.close();api.dashboard=original;}});

test('Platform Users defaults to server-side SuperAdmin scope and maps roles/tenant context',async()=>{const originals={users:api.users,roles:api.roles};let params;api.users=async p=>{params=p;return{items:[{id:3,name:'Platform Admin',email:'admin@example.test',roles:['SuperAdmin'],status:'Active',tenantId:null}],totalCount:1,pageNumber:1,pageSize:20};};api.roles=async()=>[{name:'SuperAdmin'},{name:'TenantAdmin'}];const v=await mount(<PlatformUsers/>);try{assert.equal(params.role,'SuperAdmin');assert.match(v.host.textContent,/admin@example.test/);assert.match(v.host.textContent,/Platform Admin/);}finally{await v.close();Object.assign(api,originals);}});
test('Audit maps sanitized detail data and is read-only',async()=>{const original=api.audit;api.audit=async()=>({items:[{id:1,timestamp:'2026-11-04T08:00:00Z',actorUserName:'Admin',action:'TenantCreated',entityType:'Tenant',entityId:'4',tenantId:4,resultStatus:'Success',correlationId:'corr-1',changes:'Created tenant'}],totalCount:1,pageNumber:1,pageSize:20});const v=await mount(<PlatformAudit/>);try{assert.match(v.host.textContent,/Tenant Created/);await click([...v.host.querySelectorAll('button')].find(b=>b.textContent==='View'));assert.match(document.querySelector('[role="dialog"]').textContent,/corr-1/);assert.match(document.querySelector('[role="dialog"]').textContent,/Created tenant/);assert.equal(document.querySelector('[role="dialog"] form'),null);}finally{await v.close();api.audit=original;}});
test('Platform Settings maps only genuine platform fields and sends the update DTO',async()=>{const originals={settings:api.settings,updateSettings:api.updateSettings};const d={platformName:'IBMS',accountRecoveryContact:'help@example.test',sessionTimeoutMinutes:60,inactivityTimeoutMinutes:30,passwordMinLength:12,maintenanceMode:false,allowSelfRegistration:true,requireDigit:true,requireSpecialChar:true,supportedCurrencies:['INR','USD']};let payload;api.settings=async()=>d;api.updateSettings=async p=>{payload=p;return d;};const v=await mount(<PlatformSettings/>);try{assert.doesNotMatch(v.host.textContent,/Taxes|Invoice Numbering|Charges/);await click([...v.host.querySelectorAll('button')].find(b=>b.textContent==='Edit Platform Settings'));await act(async()=>Simulate.submit(document.querySelector('[role="dialog"] form')));assert.deepEqual(payload,d);}finally{await v.close();Object.assign(api,originals);}});
test('platform pending queries show loading and do not fabricate records',async()=>{const original=api.dashboard;api.dashboard=()=>new Promise(()=>{});const v=await mount(<PlatformDashboard/>);try{assert.match(v.host.querySelector('[role="status"]').textContent,/Loading/);assert.equal(v.host.querySelector('.platform-metrics'),null);}finally{await v.close();api.dashboard=original;}});

test('tenant creation normalizes optional fields and preserves one idempotency key',async()=>{
  const original=api.createTenant;let payload;api.createTenant=async value=>{payload=value;return{id:8};};
  const v=await mount(<TenantEditor onClose={()=>{}}/>);
  try {
    const inputs=[...document.querySelectorAll('[role="dialog"] input')];
    await act(async()=>{for(const input of inputs){if(input.required){const value=input.getAttribute('pattern')?'ACME':'Acme';Simulate.change(input,{target:{value}});}}});
    await act(async()=>Simulate.submit(document.querySelector('[role="dialog"] form')));
    assert.equal(payload.name,'Acme');assert.equal(payload.tenantCode,'ACME');assert.equal(payload.companyEmail,null);assert.equal(payload.phone,null);assert.ok(payload.idempotencyKey);assert.equal(payload.adminPassword,undefined);
  } finally {await v.close();api.createTenant=original;}
});

test('readable platform labels preserve backend values while formatting the display', async()=>{
  const { readableLabel, dateText }=await import('../src/pages/Platform/PlatformShared');
  assert.equal(readableLabel('TenantCreated'),'Tenant Created');
  assert.equal(readableLabel('SuperAdmin'),'Super Admin');
  assert.equal(readableLabel('MODIFIED'),'Modified');
  assert.equal(dateText('invalid-date'),'—');
});

test('user row actions open a backend-role multiselect without writing on open or cancel',async()=>{
  const originals={users:api.users,roles:api.roles,assignRoles:api.assignRoles};let writes=0;
  api.users=async()=>({items:[{id:3,name:'Platform Admin',email:'admin@example.test',roles:['SuperAdmin'],status:'Active'}],totalCount:1,pageNumber:1,pageSize:20});
  api.roles=async()=>[{name:'SuperAdmin'},{name:'TenantAdmin'}];api.assignRoles=async()=>{writes++;};
  const v=await mount(<PlatformUsers/>);
  try{
    await click(v.host.querySelector('[aria-label="Actions for Platform Admin"]'));
    const action=[...document.querySelectorAll('[role="menuitem"]')].find(el=>el.textContent==='Manage Roles');assert.ok(action);await click(action);
    const dialog=document.querySelector('[role="dialog"]');assert.ok(dialog.querySelector('[role="combobox"]'));
    assert.equal(dialog.querySelector('input').value,'SuperAdmin');assert.equal(writes,0);
    await click([...dialog.querySelectorAll('button')].find(el=>el.textContent==='Cancel'));assert.equal(writes,0);
  }finally{await v.close();Object.assign(api,originals);}
});

test('platform table horizontal scrolling is keyboard accessible',async()=>{
 const {PlatformTable}=await import('../src/pages/Platform/PlatformShared');
 const v=await mount(<PlatformTable label="Audit" rows={[]} columns={[["action","Action"]]}/>);
 try {const region=v.host.querySelector('[role="region"]');assert.equal(region.getAttribute('tabindex'),'0');assert.equal(region.getAttribute('aria-label'),'Audit table scroll area');assert.equal(region.querySelector('table').getAttribute('aria-label'),'Audit');} finally{await v.close();}
});

test('open tenant editor cannot submit after an authenticated session changes',async()=>{
 const original=api.updateTenant;let calls=0;api.updateTenant=async()=>{calls++;return{id:4};};
 localStorage.setItem('billing_auth_token','original-session');const v=await mount(<TenantEditor tenant={{id:4,name:'Acme'}} onClose={()=>{}}/>);
 try{localStorage.setItem('billing_auth_token','different-session');await act(async()=>Simulate.submit(document.querySelector('[role="dialog"] form')));assert.equal(calls,0);}finally{await v.close();api.updateTenant=original;}
});
test('successful tenant writes invalidate platform queries and preserve unrelated caches',async()=>{
 const original=api.updateTenant;api.updateTenant=async()=>({id:4});const v=await mount(<TenantEditor tenant={{id:4,name:'Acme'}} onClose={()=>{}}/>);let scope;
 try{v.client.setQueryDefaults(['tenant-business-cache'],{gcTime:Infinity});v.client.setQueryData(['tenant-business-cache'],{kept:true});v.client.invalidateQueries=async args=>{scope=args.queryKey;};await act(async()=>Simulate.submit(document.querySelector('[role="dialog"] form')));assert.deepEqual(scope,['platform']);assert.deepEqual(v.client.getQueryData(['tenant-business-cache']),{kept:true});}finally{await v.close();api.updateTenant=original;}
});
