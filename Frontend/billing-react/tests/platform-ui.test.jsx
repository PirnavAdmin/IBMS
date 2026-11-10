import { PlatformUsers } from '../src/pages/Platform/PlatformUsers';
import { PlatformAudit, platformAuditResult } from '../src/pages/Platform/PlatformAudit';
import { PlatformSettings } from '../src/pages/Platform/PlatformSettings';
import React, { act } from 'react';
import test from 'node:test';import assert from 'node:assert/strict';
import { createRoot } from 'react-dom/client';import { Simulate } from 'react-dom/test-utils';
import { AppLayout } from '../src/layouts/AppLayout';
import { MemoryRouter, Routes, Route } from 'react-router-dom';import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from 'billing-api-client';
import { isPlatformAdmin, loginDestination, platformNavigation } from '../src/pages/Platform/platformAccess';
import { platformService as api, platformPage, platformError } from '../src/pages/Platform/platformService';
import { PlatformRoute } from '../src/pages/Platform/PlatformRoute';
import { DashboardSidebar } from '../src/components/dashboard/DashboardSidebar';
import { PlatformTenants, TenantEditor } from '../src/pages/Platform/PlatformTenants';
import { PlatformDashboard } from '../src/pages/Platform/PlatformDashboard';
import { platformScope } from '../src/pages/Platform/PlatformShared';
const admin={userId:90,tenantId:1,roles:['SuperAdmin']};
async function mount(component,user=admin,path){localStorage.setItem('billing_auth_user',JSON.stringify(user));const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});await act(async()=>root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={path?[path]:undefined}>{path?<Routes><Route element={<AppLayout/>}><Route path="*" element={component}/></Route></Routes>:component}</MemoryRouter></QueryClientProvider>));await act(async()=>new Promise(r=>setTimeout(r,30)));return {host,client,close:async()=>{await act(async()=>root.unmount());host.remove();client.clear();localStorage.clear();}};}
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
test('Audit maps sanitized detail data and is read-only',async()=>{const original=api.audit;api.audit=async()=>({items:[{id:1,timestamp:'2026-11-04T08:00:00Z',actorUserName:'Admin',action:'TenantCreated',entityType:'Tenant',entityId:'4',tenantId:4,resultStatus:'Success',correlationId:'corr-1',changes:'Created tenant'}],totalCount:1,pageNumber:1,pageSize:20});const v=await mount(<PlatformAudit/>);try{assert.match(v.host.textContent,/Tenant Created/);await click([...v.host.querySelectorAll('button')].find(b=>b.textContent==='View'));assert.match(document.querySelector('[role="dialog"]').textContent,/corr-1/);assert.match(document.querySelector('[role="dialog"]').textContent,/Created tenant/);assert.match(document.querySelector('[role="dialog"]').textContent,/Actor User IDUnknown/);assert.match(document.querySelector('[role="dialog"]').textContent,/Reported ResultSuccess/);assert.match(document.querySelector('[role="dialog"]').textContent,/ResultUnknown/);assert.equal(document.querySelector('[role="dialog"] form'),null);}finally{await v.close();api.audit=original;}});
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
 try{localStorage.setItem('billing_auth_token','different-session');await act(async()=>Simulate.submit(document.querySelector('[role="dialog"] form')));assert.equal(calls,0);assert.match(document.querySelector('[role="alert"]').textContent,/Your session changed/);}finally{await v.close();api.updateTenant=original;}
});
test('successful tenant writes invalidate platform queries and preserve unrelated caches',async()=>{
 const original=api.updateTenant;api.updateTenant=async()=>({id:4});const v=await mount(<TenantEditor tenant={{id:4,name:'Acme'}} onClose={()=>{}}/>);let scope;
 try{v.client.setQueryDefaults(['tenant-business-cache'],{gcTime:Infinity});v.client.setQueryData(['tenant-business-cache'],{kept:true});v.client.invalidateQueries=async args=>{scope=args.queryKey;};await act(async()=>Simulate.submit(document.querySelector('[role="dialog"] form')));assert.deepEqual(scope,['platform']);assert.deepEqual(v.client.getQueryData(['tenant-business-cache']),{kept:true});}finally{await v.close();api.updateTenant=original;}
});

test('platform failures retain validation details and hide raw server/HTML errors',async()=>{
  const {platformFieldErrors,unwrapPlatform}=await import('../src/pages/Platform/platformService');
  assert.equal(platformError({response:{status:500,data:{message:'Internal database exception'}}}),'Server is currently unavailable. Please try again later.');
  assert.match(platformError({code:'ERR_NETWORK',message:'Network Error'}),/Unable to reach the server/);
  assert.match(platformError({code:'ECONNABORTED'}),/taking too long/);
  assert.match(platformError({response:{status:429}}),/Too many requests/);
  assert.match(platformError({response:{status:400,data:{title:'Validation failed',errors:{'request.Name':['Company name is required.'],'$.companyEmail':['Enter a valid email.']}}}}),/Company name is required.*Enter a valid email/);
  assert.equal(platformError({response:{status:422,data:{detail:'Choose at least one supported currency.'}}}),'Choose at least one supported currency.');
  assert.doesNotMatch(platformError({response:{status:400,data:{message:'<html>Proxy failure</html>'}}}),/<html>/);
  assert.deepEqual(platformFieldErrors({response:{data:{errors:{'request.Name':['Name is required.'],'$.companyEmail':['Email already exists.'],'Other':['Other issue']}}}},[{name:'name'},{name:'companyEmail'}]),{name:'Name is required.',companyEmail:'Email already exists.'});
  let failure;try{unwrapPlatform({success:false,errors:{Name:['Duplicate tenant name.']}});}catch(error){failure=error;}
  assert.match(platformError(failure),/Duplicate tenant name/);
});

test('every primary platform module shows its own failed GET message and retry action',async()=>{
  const originals=Object.fromEntries(['dashboard','tenants','users','roles','audit','settings'].map(key=>[key,api[key]]));
  api.roles=async()=>[{name:'SuperAdmin'}];
  try{
    for(const [method,Component,label]of [['dashboard',PlatformDashboard,'platform dashboard'],['tenants',PlatformTenants,'tenants'],['users',PlatformUsers,'platform users'],['audit',PlatformAudit,'platform audit logs'],['settings',PlatformSettings,'platform settings']]){
      api[method]=async()=>{throw Object.assign(new Error('Network Error'),{code:'ERR_NETWORK'});};
      const v=await mount(<Component/>);
      try{
        const alert=v.host.querySelector('[role="alert"]');assert.ok(alert,method+' error is visible');
        assert.match(alert.textContent,new RegExp('Unable to load '+label));assert.match(alert.textContent,/temporarily unavailable/);assert.ok(alert.classList.contains('bd-dashboard-error'));assert.ok(alert.querySelector('.bd-error-illustration'));
        assert.ok([...alert.querySelectorAll('button')].some(button=>button.textContent==='Retry'&&!button.disabled));
      }finally{await v.close();api[method]=originals[method];}
    }
  }finally{Object.assign(api,originals);}
});

test('retrying a failed platform request recovers without submitting live mutations',async()=>{
  const original=api.settings;let calls=0;api.settings=async()=>{calls++;if(calls===1)throw new Error('Read failed');return{platformName:'IBMS',supportedCurrencies:['INR']};};
  const v=await mount(<PlatformSettings/>);
  try{
    assert.match(v.host.textContent,/Unable to load platform settings/);
    await click([...v.host.querySelectorAll('button')].find(button=>button.textContent==='Retry'));
    await act(async()=>new Promise(resolve=>setTimeout(resolve,30)));
    assert.equal(calls,2);assert.doesNotMatch(v.host.textContent,/Unable to load/);assert.match(v.host.textContent,/Edit Platform Settings/);
  }finally{await v.close();api.settings=original;}
});

test('paused queries and in-flight retries have visible accessible error states',async()=>{
  const {QueryState}=await import('../src/pages/Platform/PlatformShared');let retries=0;
  let v=await mount(<QueryState resource="tenants" query={{isPending:true,fetchStatus:'paused',refetch:()=>retries++}}><div>Hidden records</div></QueryState>);
  try{assert.match(v.host.querySelector('[role="alert"]').textContent,/No internet connection/);assert.equal(v.host.querySelector('button').disabled,true);assert.doesNotMatch(v.host.textContent,/Hidden records/);}finally{await v.close();}
  v=await mount(<QueryState resource="tenants" query={{isError:true,isFetching:true,error:new Error('Read failed'),refetch:()=>retries++}}/>);
  try{assert.match(v.host.textContent,/Retrying/);assert.equal(v.host.querySelector('button').disabled,true);assert.equal(retries,0);}finally{await v.close();}
});

test('failed role lookup is explained without hiding successfully loaded users',async()=>{
  const originals={users:api.users,roles:api.roles};api.users=async()=>({items:[{id:3,name:'Platform Admin',roles:['SuperAdmin']}],totalCount:1,pageNumber:1,pageSize:20});api.roles=async()=>{throw new Error('Role lookup failed');};
  const v=await mount(<PlatformUsers/>);
  try{assert.match(v.host.textContent,/Unable to load available roles/);assert.match(v.host.textContent,/Platform Admin/);assert.equal([...v.host.querySelectorAll('button')].find(button=>button.textContent==='Create Administrator').disabled,true);}finally{await v.close();Object.assign(api,originals);}
});

test('server field errors appear beside tenant inputs and preserve the draft',async()=>{
  const original=api.updateTenant;api.updateTenant=async()=>{throw {response:{status:400,data:{errors:{CompanyEmail:['This contact email is already in use.']}}}};};
  const v=await mount(<TenantEditor tenant={{id:4,name:'Acme',companyEmail:'acme@example.test'}} onClose={()=>{}}/>);
  try{
    await act(async()=>Simulate.submit(document.querySelector('[role="dialog"] form')));
    const dialog=document.querySelector('[role="dialog"]');assert.match(dialog.querySelector('[role="alert"]').textContent,/Unable to save changes/);
    const email=dialog.querySelector('input[type="email"]');assert.equal(email.value,'acme@example.test');assert.equal(email.getAttribute('aria-invalid'),'true');
    assert.match(document.getElementById(email.getAttribute('aria-describedby')).textContent,/contact email is already in use/);
    await act(async()=>Simulate.change(email,{target:{value:'updated@example.test'}}));assert.equal(email.getAttribute('aria-invalid'),'false');
  }finally{await v.close();api.updateTenant=original;}
});

test('platform audit calendar ranges include complete Indian days and validate before querying',async()=>{
  const {platformAuditParams}=await import('../src/pages/Platform/PlatformAudit');
  const params=platformAuditParams({tenantId:'4',actor:'Admin',action:'',entityName:'',startDate:'2026-10-10',endDate:'2026-10-10'},50);
  assert.equal(params.startDate,'2026-10-09T18:30:00.000Z');
  assert.equal(params.endDate,'2026-10-10T18:29:59.9999999Z');
  assert.equal(params.actor,'Admin');assert.equal(params.tenantId,'4');assert.equal(params.pageNumber,1);assert.equal(params.pageSize,50);assert.equal('action' in params,false);
  for(const dates of [{startDate:'2026-10-11',endDate:'2026-10-10'},{startDate:'2026-02-30',endDate:'2026-03-01'},{startDate:'2026-10-10',endDate:''},{startDate:'9999-01-01',endDate:'9999-01-02'}])assert.throws(()=>platformAuditParams(dates,20));
  assert.deepEqual(platformAuditParams({startDate:'',endDate:'',actor:'Admin'},20),{actor:'Admin',pageNumber:1,pageSize:20});
});

test('platform audit reuses manual/calendar range selection, applies filters, clears and resets',async()=>{
  const original=api.audit;const requests=[];api.audit=async values=>{requests.push({...values});return{items:[],totalCount:0,pageNumber:1,pageSize:20};};
  const v=await mount(<PlatformAudit/>);
  const settle=()=>act(async()=>new Promise(resolve=>setTimeout(resolve,80)));
  const nativeClick=element=>act(async()=>{assert.ok(element);element.click();});
  const enter=async(element,value)=>{assert.ok(element);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new window.Event('input',{bubbles:true}));element.dispatchEvent(new window.Event('change',{bubbles:true}));});};
  try{
    assert.equal(v.host.querySelector('input[type="datetime-local"]'),null);
    await act(async()=>Simulate.change(v.host.querySelectorAll('.platform-filters input')[1],{target:{value:'Admin'}}));
    await nativeClick(v.host.querySelector('.date-range-filter'));await settle();
    const from=document.querySelector('input[aria-label="From Date"]'),to=document.querySelector('input[aria-label="To Date"]');
    assert.equal(from.readOnly,false);assert.equal(to.readOnly,false);assert.ok(document.querySelector('.date-range-date-picker'));
    await enter(from,'2026-10-10');await enter(to,'2026-10-09');
    let apply=[...document.querySelectorAll('.date-range-actions button')].find(button=>button.textContent==='Apply');assert.equal(apply.disabled,true);
    const initialRequests=requests.length;await enter(to,'2026-10-14');
    apply=[...document.querySelectorAll('.date-range-actions button')].find(button=>button.textContent==='Apply');await nativeClick(apply);await settle();
    assert.equal(requests.length,initialRequests,'Choosing dates updates the filter draft only');
    assert.match(v.host.querySelector('.date-range-filter').textContent,/10\/10\/2026.*14\/10\/2026/);
    await act(async()=>Simulate.submit(v.host.querySelector('form.platform-filters')));await settle();
    assert.equal(requests.at(-1).startDate,'2026-10-09T18:30:00.000Z');assert.equal(requests.at(-1).endDate,'2026-10-14T18:29:59.9999999Z');assert.equal(requests.at(-1).actor,'Admin');
    await nativeClick(v.host.querySelector('.date-range-filter'));await settle();
    await nativeClick([...document.querySelectorAll('.date-range-actions button')].find(button=>button.textContent==='Clear'));await settle();
    await act(async()=>Simulate.submit(v.host.querySelector('form.platform-filters')));await settle();assert.equal(requests.at(-1).startDate,undefined);assert.equal(requests.at(-1).endDate,undefined);assert.equal(requests.at(-1).actor,'Admin');
    await click([...v.host.querySelectorAll('button')].find(button=>button.textContent==='Reset'));await settle();assert.equal(requests.at(-1).actor,undefined);assert.equal(v.host.querySelector('.date-range-filter').textContent,'Date Range');
  }finally{await v.close();api.audit=original;}
});

test('SuperAdmin navbar is visible and drives tenant/user server search with clear support',async()=>{
  const originals={tenants:api.tenants,users:api.users,roles:api.roles};const originalGet=apiClient.get;apiClient.get=async()=>({data:{unreadCount:0}});api.roles=async()=>[{name:'SuperAdmin'}];
  try{
    for(const [method,Component,label,path]of [['tenants',PlatformTenants,'Search tenants','/platform/tenants'],['users',PlatformUsers,'Search platform users','/platform/users']]){
      const calls=[];api[method]=async params=>{calls.push({...params});return{items:[],totalCount:0,pageNumber:params.page,pageSize:params.pageSize};};
      const v=await mount(<Component/>,admin,path);
      try{const navbar=v.host.querySelector('.bd-header input');assert.ok(navbar);assert.equal(navbar.getAttribute('aria-label'),label);await act(async()=>Simulate.change(navbar,{target:{value:'Acme'}}));await act(async()=>new Promise(resolve=>setTimeout(resolve,400)));assert.equal(calls.at(-1).search,'Acme');assert.equal(calls.at(-1).page,1);assert.equal(v.host.querySelector('.platform-filters input').value,'Acme');await click(v.host.querySelector('[aria-label="Clear search"]'));await act(async()=>new Promise(resolve=>setTimeout(resolve,400)));assert.equal(calls.at(-1).search,'');}finally{await v.close();api[method]=originals[method];}
    }
  }finally{Object.assign(api,originals);apiClient.get=originalGet;}
});

test('SuperAdmin audit navbar filters the actor without losing the applied context',async()=>{
  const original=api.audit,originalGet=apiClient.get;const calls=[];apiClient.get=async()=>({data:{unreadCount:0}});api.audit=async params=>{calls.push({...params});return{items:[],totalCount:0,pageNumber:1,pageSize:20};};
  const v=await mount(<PlatformAudit/>,admin,'/platform/audit');
  try{const navbar=v.host.querySelector('.bd-header input');assert.equal(navbar.getAttribute('aria-label'),'Search audit actor');await act(async()=>Simulate.change(navbar,{target:{value:'System'}}));await act(async()=>new Promise(resolve=>setTimeout(resolve,30)));assert.equal(calls.at(-1).actor,'System');assert.equal(calls.at(-1).pageNumber,1);assert.equal(v.host.querySelectorAll('.platform-filters input')[1].value,'System');}finally{await v.close();api.audit=original;apiClient.get=originalGet;}
});

test('SuperAdmin dashboard navbar filters recent rows while preserving authoritative totals',async()=>{
  const original=api.dashboard,originalGet=apiClient.get;apiClient.get=async()=>({data:{unreadCount:0}});api.dashboard=async()=>({totalTenants:5,recentTenants:[{id:1,name:'Acme',tenantCode:'acme'},{id:2,name:'Nexify',tenantCode:'nexify'}],recentAdminEvents:[]});
  const v=await mount(<PlatformDashboard/>,admin,'/platform/dashboard');
  try{const navbar=v.host.querySelector('.bd-header input');assert.equal(navbar.getAttribute('aria-label'),'Search recent tenants and activities');await act(async()=>Simulate.change(navbar,{target:{value:'Acme'}}));const table=v.host.querySelector('table[aria-label="Recently created tenants"]');assert.match(table.textContent,/Acme/);assert.doesNotMatch(table.textContent,/Nexify/);assert.equal(v.host.querySelector('.platform-metric strong').textContent,'5');}finally{await v.close();api.dashboard=original;apiClient.get=originalGet;}
});

test('SuperAdmin settings navbar filters fields and exposes a clear empty state',async()=>{
  const original=api.settings,originalGet=apiClient.get;apiClient.get=async()=>({data:{unreadCount:0}});api.settings=async()=>({platformName:'IBMS',supportedCurrencies:['INR'],sessionTimeoutMinutes:60});
  const v=await mount(<PlatformSettings/>,admin,'/platform/settings');
  try{const navbar=v.host.querySelector('.bd-header input');assert.equal(navbar.getAttribute('aria-label'),'Search platform settings');await act(async()=>Simulate.change(navbar,{target:{value:'INR'}}));assert.match(v.host.querySelector('.platform-settings-grid').textContent,/Supported Currencies/);assert.doesNotMatch(v.host.querySelector('.platform-settings-grid').textContent,/Password/);await act(async()=>Simulate.change(navbar,{target:{value:'unmatched xyz'}}));assert.match(v.host.textContent,/No platform settings match/);await click(v.host.querySelector('[aria-label="Clear search"]'));assert.match(v.host.querySelector('.platform-settings-grid').textContent,/Password/);}finally{await v.close();api.settings=original;apiClient.get=originalGet;}
});

test('tenant creation retry reuses its idempotency key and preserves the original draft',async()=>{
  const original=api.createTenant;const requests=[];api.createTenant=async payload=>{requests.push({...payload});if(requests.length===1)throw new Error('The server is taking too long to respond. Please try again.');return{id:8};};
  const v=await mount(<TenantEditor onClose={()=>{}}/>);
  try{
    await act(async()=>{for(const input of document.querySelectorAll('[role="dialog"] input'))if(input.required)Simulate.change(input,{target:{value:input.getAttribute('pattern')?'QA_RETRY':'QA Retry'}});});
    await act(async()=>Simulate.submit(document.querySelector('[role="dialog"] form')));
    assert.match(document.querySelector('[role="alert"]').textContent,/taking too long/);
    assert.equal(document.querySelector('[role="dialog"] input').value,'QA Retry');
    await act(async()=>Simulate.submit(document.querySelector('[role="dialog"] form')));
    assert.equal(requests.length,2);assert.ok(requests[0].idempotencyKey);assert.deepEqual(requests[1],requests[0]);
  }finally{await v.close();api.createTenant=original;}
});

test('audit outcomes remain unknown without complete provenance and retain reported failures',()=>{
  const traced={actorUserId:90,actorRole:'SuperAdmin',correlationId:'request-1',resultStatus:'Failed'};
  assert.equal(platformAuditResult(traced),'Failed');
  assert.equal(platformAuditResult({...traced,resultStatus:'Success'}),'Success');
  for(const key of ['actorUserId','actorRole','correlationId','resultStatus'])
    assert.equal(platformAuditResult({...traced,[key]:null}),'Unknown');
  assert.equal(platformAuditResult({resultStatus:'Success'}),'Unknown');
});

test('tenant edit forwards the original full precision token and invalidates platform queries',async()=>{
  const original=api.updateTenant;let payload;
  api.updateTenant=async(id,value)=>{payload=value;return{id};};
  const stamp='2026-11-06T10:57:35.4874747Z';let closed=false;
  const v=await mount(<TenantEditor tenant={{id:4,name:'Acme',updatedAtUtc:stamp}} onClose={()=>{closed=true;}}/>);
  const invalidations=[];v.client.invalidateQueries=async options=>{invalidations.push(options.queryKey);};
  try{await act(async()=>Simulate.submit(document.querySelector('[role="dialog"] form')));
    assert.equal(payload.expectedUpdatedAtUtc,stamp);assert.deepEqual(invalidations,[['platform']]);assert.equal(closed,true);
  }finally{await v.close();api.updateTenant=original;}
});
