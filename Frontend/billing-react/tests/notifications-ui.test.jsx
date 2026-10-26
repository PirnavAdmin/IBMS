import React, { act } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from 'billing-api-client';
import { FormDraftProvider } from '../src/context/FormDraftContext';
import { errorPresentation, connectionErrorMessage } from '../src/utils/errorPresentation';
import { NotificationTemplates } from '../src/pages/Notifications/NotificationTemplates';
import { NotificationTemplateForm } from '../src/pages/Notifications/NotificationTemplateForm';
import { NotificationHistory } from '../src/pages/Notifications/NotificationHistory';
import { parseTemplateToVisualModel, serializeVisualModelToTemplate, loadVisualEditor, serializeVisualEditor } from '../src/pages/Notifications/templateVisualModel';
import { NotificationPreview } from '../src/pages/Notifications/NotificationShared';
import { EVENT_TYPES, HISTORY_STATUSES, historyParams, insertToken, notificationError, notificationService, previewPayload, templatePayload } from '../src/pages/Notifications/notificationService';

// Contract-shaped fixtures live exclusively in tests; application screens always call the API.
const template = { id: 23, tenantId: 9, eventType: 'InvoiceSent', channel: 'Email', name: 'Customer invoice', description: 'Delivery email', subjectTemplate: 'Invoice {{InvoiceNumber}}', bodyTemplate: '<p>Dear {{CustomerName}}</p>', isActive: true };
const variables = [{ name: 'CustomerName', token: '{{CustomerName}}', description: 'Customer display name', exampleValue: 'Test Customer' }];
const rendered = { eventType: 'InvoiceSent', renderedSubject: 'Invoice INV-QA', renderedBody: '<p>Rendered by backend</p><script>parent.bad=true</script>', usedVariables: { InvoiceNumber: 'INV-QA' } };
const historyRow = { id: 71, recipient: 'customer@example.test', eventType: 'InvoiceSent', subject: 'Invoice INV-QA', sentAtUtc: '2026-10-14T04:00:00Z', status: 'Failed', retryCount: 2, failureReason: 'SMTP recipient rejected' };
const page = (items, totalCount = items.length, pageNumber = 1, pageSize = 20) => ({ items, totalCount, pageNumber, pageSize, totalPages: Math.ceil(totalCount / pageSize) });
const envelope = data => ({ success: true, data });
const rootPath = '/settings/notifications';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settle() { await act(async () => { await delay(30); }); }
async function until(check) { for (let i = 0; i < 35; i++) { if (check()) return; await settle(); } assert.ok(check(), 'Expected UI state was not reached'); }
async function click(element) { assert.ok(element, 'Click target exists'); await act(async () => { Simulate.click(element, { button: 0 }); }); }
async function type(element, value) {
  assert.ok(element);
  await act(async () => {
    if (element.getAttribute('role') === 'textbox') { element.textContent = value; Simulate.input(element); }
    else Simulate.change(element, { target: { value } });
  });
}
function caret(element, offset) {
  const range = document.createRange(); range.setStart(element.firstChild, offset); range.collapse(true);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
}
const button = (text, scope = document) => [...scope.querySelectorAll('button')].find(element => element.textContent.replace(/\s+/g, ' ').trim() === text);
async function select(label, text) {
  const input = document.querySelector(`[aria-label="${label}"]`);
  assert.ok(input, label);
  await act(async () => Simulate.mouseDown(input));
  await until(() => [...document.querySelectorAll('.ant-select-item-option')].some(option => option.textContent === text));
  await click([...document.querySelectorAll('.ant-select-item-option')].find(option => option.textContent === text));
  await settle();
}
async function mount(path = rootPath, responder = () => undefined, preview = null) {
  const calls = []; const originals = {};
  for (const method of ['get', 'post', 'put', 'delete']) {
    originals[method] = apiClient[method];
    apiClient[method] = async (url, payload, config) => {
      const call = { method, url, ...(method === 'get' ? { config: payload } : { payload, config }) }; calls.push(call);
      const result = await responder(call);
      if (result !== undefined) return result;
      if (url.includes('/variables/')) return envelope(variables);
      if (url.endsWith('/preview')) return envelope(rendered);
      if (url.endsWith('/history')) return envelope(page([historyRow]));
      if (url.endsWith('/notification-templates') && method === 'get') return envelope([template, { ...template, id: 24, name: 'Inactive receipt', isActive: false }]);
      if (method === 'get') return envelope(template);
      return envelope(true);
    };
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: Infinity, refetchOnWindowFocus: false } } });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<QueryClientProvider client={client}><FormDraftProvider><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {preview ? <NotificationPreview payload={preview} onClose={() => {}} /> : <><Link id="away" to="/away">Other module</Link><Routes>
      <Route path={rootPath} element={<NotificationTemplates />} />
      <Route path={`${rootPath}/new`} element={<NotificationTemplateForm />} />
      <Route path={`${rootPath}/:id/edit`} element={<NotificationTemplateForm />} />
      <Route path={`${rootPath}/history`} element={<NotificationHistory />} />
      <Route path="/away" element={<><Link id="return-new" to={`${rootPath}/new`}>Return new</Link><Link id="return-edit" to={`${rootPath}/23/edit`}>Return edit</Link></>} />
    </Routes></>}
  </MemoryRouter></FormDraftProvider></QueryClientProvider>));
  await settle();
  return { host, calls, client, close: async () => { await act(async () => root.unmount()); host.remove(); client.clear(); for (const method in originals) apiClient[method] = originals[method]; } };
}

test('Module 14 exact events, statuses, payload allowlists and cursor insertion', () => {
  assert.deepEqual(EVENT_TYPES, ['InvoiceIssued','InvoiceSent','PaymentReceived','PaymentFailed','InvoiceOverdue','QuotationSent','CreditNoteIssued']);
  assert.deepEqual(HISTORY_STATUSES, ['Sent','Failed','Queued']);
  const create = templatePayload({ ...template, rowVersion: 'unexpected' });
  assert.deepEqual(Object.keys(create).sort(), ['name','description','subjectTemplate','bodyTemplate','isActive','eventType','channel'].sort());
  assert.equal(create.channel, 'Email');
  assert.deepEqual(Object.keys(templatePayload(template, true)).sort(), ['name','description','subjectTemplate','bodyTemplate','isActive'].sort());
  assert.deepEqual(previewPayload(template), {eventType:template.eventType,subjectTemplate:template.subjectTemplate,bodyTemplate:template.bodyTemplate});
  assert.deepEqual(insertToken('Hello customer!', '{{CustomerName}}', 6, 14), { text: 'Hello {{CustomerName}}!', cursor: 22 });
});

test('API adapters use shared client, confirmed endpoints, signals and false filter', async () => {
  const ui = await mount();
  try {
    const signal = new AbortController().signal;
    await notificationService.getTemplates({eventType:'InvoiceSent',isActive:false,tenantId:123}, {signal});
    await notificationService.getTemplateById(23, {signal});
    await notificationService.createTemplate(template); await notificationService.updateTemplate(23, template);
    await notificationService.deleteTemplate(23); await notificationService.seedDefaults();
    await notificationService.getVariables('InvoiceSent', {signal}); await notificationService.previewTemplate(template, {signal});
    await notificationService.getHistory({eventType:'InvoiceSent',status:'Failed',searchTerm:' inv ',pageNumber:2,pageSize:10});
    await notificationService.getHistory({pageNumber:1,pageSize:50,startDate:'2026-10-01',endDate:'2026-10-14'});
    await notificationService.retryNotification(71);
    const list = ui.calls.find(call => call.config?.params?.isActive === false);
    assert.deepEqual(list.config.params, {eventType:'InvoiceSent',isActive:false}); assert.equal(list.config.signal,signal);
    for (const [method,url] of [['get','/api/v1/notification-templates/23'],['post','/api/v1/notification-templates'],['put','/api/v1/notification-templates/23'],['delete','/api/v1/notification-templates/23'],['post','/api/v1/notification-templates/seed-defaults'],['get','/api/v1/notification-templates/variables/InvoiceSent'],['post','/api/v1/notification-templates/preview'],['post','/api/v1/notifications/71/retry']]) assert.ok(ui.calls.some(call=>call.method===method&&call.url===url),`${method} ${url}`);
    assert.deepEqual(ui.calls.find(call=>call.config?.params?.pageNumber===2).config.params, {pageNumber:2,pageSize:10,eventType:'InvoiceSent',status:'Failed',searchTerm:'inv'});
    assert.equal(ui.calls.find(call=>call.config?.params?.pageSize===50).config.params.endDate,'2026-10-14T18:29:59.9999999Z');
  } finally { await ui.close(); }
});

test('History uses confirmed server date parameters with inclusive IST days', () => {
  assert.deepEqual(historyParams({pageNumber:1,pageSize:20,startDate:'2026-10-01',endDate:'2026-10-14'}), {pageNumber:1,pageSize:20,startDate:'2026-09-30T18:30:00.000Z',endDate:'2026-10-14T18:29:59.9999999Z'});
  assert.throws(()=>historyParams({startDate:'2026-10-15',endDate:'2026-10-14'}), /on or after/);
});

test('Template list renders API values, status filters, preview and edit navigation', async () => {
  const ui = await mount();
  try {
    assert.match(ui.host.textContent,/Customer invoice/); assert.match(ui.host.textContent,/Delivery email/);
    assert.match(ui.host.textContent,/Inactive receipt/); assert.match(ui.host.textContent,/Active/); assert.match(ui.host.textContent,/Inactive/);
    await select('Event Type filter','Invoice Overdue');
    await until(()=>ui.calls.some(call=>call.config?.params?.eventType==='InvoiceOverdue'));
    await select('Template status filter','Inactive');
    await until(()=>ui.calls.some(call=>call.config?.params?.isActive===false));
    await click(ui.host.querySelector('[aria-label="Actions for Customer invoice"]'));
    await until(()=>document.querySelector('[role="menuitem"]'));
    await click([...document.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent==='Preview'));
    await until(()=>document.querySelector('iframe'));
    assert.deepEqual(ui.calls.find(call=>call.url.endsWith('/preview')).payload,previewPayload(template));
    await click(button('Close'));
    await click(ui.host.querySelector('[aria-label="Actions for Customer invoice"]'));
    await click([...document.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent==='Edit'));
    await until(()=>ui.host.textContent.includes('Edit Notification Template'));
    assert.ok(ui.calls.some(call=>call.url.endsWith('/notification-templates/23')));
  } finally { await ui.close(); }
});

test('Delete and safe seeding require confirmation, guard duplicate clicks and refetch', async () => {
  let resolveDelete; const ui = await mount(rootPath, call=>call.method==='delete' ? new Promise(resolve=>{resolveDelete=resolve;}) : undefined);
  try {
    await click(ui.host.querySelector('[aria-label="Actions for Customer invoice"]'));
    await click([...document.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent==='Delete'));
    assert.equal(ui.calls.filter(call=>call.method==='delete').length,0);
    const confirm = button('Delete Template'); await click(confirm); await click(confirm);
    assert.equal(ui.calls.filter(call=>call.method==='delete').length,1);
    await act(async()=>resolveDelete(envelope(true))); await settle();
    assert.ok(ui.calls.filter(call=>call.url.endsWith('/notification-templates')&&call.method==='get').length>=2);
    await click(button('Restore Missing Defaults',ui.host));
    assert.match(document.body.textContent,/Existing customized templates will not be overwritten/);
    assert.equal(ui.calls.filter(call=>call.url.endsWith('/seed-defaults')).length,0);
    await click(button('Restore Missing Defaults',document.querySelector('[role="dialog"]'))); await settle();
    assert.equal(ui.calls.filter(call=>call.url.endsWith('/seed-defaults')).length,1);
  } finally { await ui.close(); }
});

test('Template list loading, empty, network errors and Retry', async () => {
  let resolveList; const ui = await mount(rootPath, call=>call.url.endsWith('/notification-templates') ? new Promise(resolve=>{resolveList=resolve;}) : undefined);
  try { assert.ok(ui.host.querySelector('.ant-spin-spinning')); await act(async()=>resolveList(envelope([]))); await until(()=>ui.host.textContent.includes('No templates found')); }
  finally { await ui.close(); }
  let failed=true;
  const broken=await mount(rootPath,call=>{if(call.url.endsWith('/notification-templates')&&failed)throw new Error('Connection lost');});
  try { assert.match(broken.host.textContent,/Connection lost/); failed=false; await click(button('Retry',broken.host)); await until(()=>broken.host.textContent.includes('Customer invoice')); }
  finally { await broken.close(); }
});

test('Create validates required fields, fetches safe variables and inserts at subject/body cursor', async () => {
  const ui=await mount(`${rootPath}/new`);
  try {
    await act(async()=>Simulate.submit(ui.host.querySelector('form'))); await settle();
    assert.match(ui.host.textContent,/Template name is required/); assert.equal(ui.calls.filter(call=>call.method==='post').length,0);
    await select('Event Type','Invoice Sent');
    await until(()=>ui.host.textContent.includes('+ Customer Name'));
    assert.ok(ui.calls.some(call=>call.url.endsWith('/variables/InvoiceSent')));
    await type(ui.host.querySelector('#name'),'New customer email');
    await type(ui.host.querySelector('#subjectTemplate'),'Hello !');
    const subject=ui.host.querySelector('#subjectTemplate'); caret(subject,6);
    await act(async()=>Simulate.focus(subject,{target:subject}));
    await click(button('+ Customer Name',ui.host));
    assert.equal(serializeVisualEditor(subject,false),'Hello {{CustomerName}}!');
    await act(async()=>{ const editor=ui.host.querySelector('#bodyTemplate'); editor.innerHTML='<p>Welcome </p>'; Simulate.input(editor); });
    const body=ui.host.querySelector('#bodyTemplate'); const range=document.createRange(); range.setStart(body.querySelector('p').firstChild,8); range.collapse(true); window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
    await act(async()=>Simulate.focus(body,{target:body}));
    await click(button('+ Customer Name',ui.host));
    assert.equal(serializeVisualEditor(body,true),'<p>Welcome {{CustomerName}}</p>');
    await select('Event Type','Payment Received');
    await until(()=>ui.calls.some(call=>call.url.endsWith('/variables/PaymentReceived')));
    assert.equal(serializeVisualEditor(subject,false),'Hello {{CustomerName}}!'); assert.equal(serializeVisualEditor(body,true),'<p>Welcome {{CustomerName}}</p>');
    await click(ui.host.querySelector('[role="switch"]'));
    await act(async()=>Simulate.submit(ui.host.querySelector('form'))); await settle();
    const create=ui.calls.find(call=>call.method==='post'&&call.url.endsWith('/notification-templates'));
    assert.deepEqual(create.payload,{name:'New customer email',description:'',subjectTemplate:'Hello {{CustomerName}}!',bodyTemplate:'<p>Welcome {{CustomerName}}</p>',isActive:false,eventType:'PaymentReceived',channel:'Email'});
    await until(()=>ui.host.textContent.includes('Notification Management'));
  } finally { await ui.close(); }
});

test('Edit waits for real data, preserves values and submits immutable update DTO', async () => {
  let resolveTemplate;
  const ui=await mount(`${rootPath}/23/edit`,call=>call.method==='get'&&call.url.endsWith('/23') ? new Promise(resolve=>{resolveTemplate=resolve;}) : undefined);
  try {
    assert.match(ui.host.textContent,/Loading template/); assert.equal(ui.host.querySelector('#name'),null);
    await act(async()=>resolveTemplate(envelope(template))); await until(()=>ui.host.querySelector('#name'));
    assert.equal(ui.host.querySelector('#name').value,template.name);
    assert.ok(ui.host.querySelector('[aria-label="Event Type"]').disabled);
    await type(ui.host.querySelector('#subjectTemplate'),'Exact saved subject');
    await act(async()=>Simulate.submit(ui.host.querySelector('form'))); await settle();
    assert.deepEqual(ui.calls.find(call=>call.method==='put').payload,{name:template.name,description:template.description,subjectTemplate:'Exact saved subject',bodyTemplate:template.bodyTemplate,isActive:true});
  } finally { await ui.close(); }
});

test('Template drafts survive SPA navigation, clear on discard and successful save', async () => {
  const ui=await mount(`${rootPath}/new`);
  try {
    await type(ui.host.querySelector('#name'),'Unsaved email'); await click(ui.host.querySelector('#away')); await click(ui.host.querySelector('#return-new'));
    assert.equal(ui.host.querySelector('#name').value,'Unsaved email');
    await click(button('Cancel',ui.host)); await click(ui.host.querySelector(`a[href="${rootPath}/new"]`));
    assert.equal(ui.host.querySelector('#name').value,'');
    await select('Event Type','Invoice Sent'); await type(ui.host.querySelector('#name'),'Saved'); await type(ui.host.querySelector('#subjectTemplate'),'Subject'); await type(ui.host.querySelector('#bodyTemplate'),'Body');
    await act(async()=>Simulate.submit(ui.host.querySelector('form'))); await settle();
    await click(ui.host.querySelector(`a[href="${rootPath}/new"]`)); assert.equal(ui.host.querySelector('#name').value,'');
  } finally { await ui.close(); }
  const edit=await mount(`${rootPath}/23/edit`);
  try {
    await until(()=>edit.host.querySelector('#name'));
    await type(edit.host.querySelector('#name'),'Unsaved edit'); await click(edit.host.querySelector('#away')); await click(edit.host.querySelector('#return-edit'));
    await settle(); assert.equal(edit.host.querySelector('#name').value,'Unsaved edit');
  } finally { await edit.close(); }
});

test('Backend preview renders subject and isolated HTML; errors can retry', async () => {
  let fail=true;
  const ui=await mount(rootPath,call=>{if(call.url.endsWith('/preview')&&fail)throw new Error('Preview unavailable');},previewPayload(template));
  try {
    assert.match(document.body.textContent,/Preview unavailable/); fail=false; await click(button('Retry')); await until(()=>document.querySelector('iframe'));
    const frame=document.querySelector('iframe'); assert.equal(frame.getAttribute('sandbox'),''); assert.equal(frame.getAttribute('referrerpolicy'),'no-referrer');
    assert.match(frame.getAttribute('srcdoc'),/Rendered by backend/); assert.match(frame.getAttribute('srcdoc'),/default-src 'none'/);
    assert.match(document.body.textContent,/Invoice INV-QA/); assert.equal(document.querySelector('script'),null); assert.equal(window.bad,undefined);
  } finally { await ui.close(); }
});

test('Form preview uses unsaved server-rendered request; duplicate save and backend rejection preserve draft', async () => {
  let rejectSave;
  const ui=await mount(`${rootPath}/23/edit`,call=>call.method==='put'?new Promise((_,reject)=>{rejectSave=reject;}):undefined);
  try {
    await until(()=>ui.host.querySelector('#name')); await type(ui.host.querySelector('#subjectTemplate'),'Unsaved preview');
    await click(button('Preview',ui.host)); await until(()=>document.querySelector('iframe'));
    assert.equal(ui.calls.find(call=>call.url.endsWith('/preview')).payload.subjectTemplate,'Unsaved preview'); await click(button('Close'));
    const form=ui.host.querySelector('form'); await act(async()=>{Simulate.submit(form);Simulate.submit(form);}); await settle();
    assert.equal(ui.calls.filter(call=>call.method==='put').length,1);
    await act(async()=>rejectSave({response:{status:409,data:{message:'Template changed. Reload before saving.'}}})); await settle();
    assert.match(ui.host.textContent,/Template changed/); assert.equal(ui.host.querySelector('#subjectTemplate').textContent,'Unsaved preview');
  } finally { await ui.close(); }
});

test('History renders all statuses, failure/retry info, null date and server pagination/filter/search', async () => {
  const ui=await mount(`${rootPath}/history`,call=>call.url.endsWith('/history')?envelope(page([historyRow,{...historyRow,id:72,status:'Sent',sentAtUtc:null,failureReason:null},{...historyRow,id:73,status:'Queued',failureReason:null}],45,call.config.params.pageNumber,call.config.params.pageSize)):undefined);
  try {
    assert.match(ui.host.textContent,/customer@example.test/); assert.match(ui.host.textContent,/SMTP recipient rejected/);
    for(const status of HISTORY_STATUSES) assert.ok([...ui.host.querySelectorAll('.ant-tag')].some(tag=>tag.textContent===status));
    assert.ok(ui.host.textContent.includes('14/10/2026')); assert.ok(ui.host.querySelector('[aria-label="Retry notification 71"]'));
    assert.equal(ui.host.querySelector('[aria-label="Retry notification 72"]'),null); assert.equal(ui.host.querySelector('[aria-label="Retry notification 73"]'),null);
    assert.equal(ui.host.querySelector('tr[data-row-key="72"]').children[2].textContent,'—');
    assert.equal(ui.host.querySelector('tr[data-row-key="71"]').children[4].textContent,'2');
    await click(ui.host.querySelector('.ant-pagination-item-2')); await until(()=>ui.calls.some(call=>call.config?.params?.pageNumber===2));
    await select('History event filter','Payment Failed'); await select('History status filter','Failed');
    await type(ui.host.querySelector('[aria-label="Search history"]'),' customer ');
    await act(async()=>Simulate.submit(ui.host.querySelector('form'))); await settle();
    const last=ui.calls.filter(call=>call.url.endsWith('/history')).at(-1);
    assert.deepEqual(last.config.params,{pageNumber:1,pageSize:20,eventType:'PaymentFailed',status:'Failed',searchTerm:'customer'});
    assert.match(ui.host.textContent,/Date Range \(IST\)/);
  } finally { await ui.close(); }
});

test('Failed-only retry prevents duplicate requests and displays refetched Queued state', async () => {
  let resolveRetry; let retried=false;
  const ui=await mount(`${rootPath}/history`,call=>{
    if(call.url.endsWith('/71/retry'))return new Promise(resolve=>{resolveRetry=()=>{retried=true;resolve(envelope({...historyRow,status:'Queued'}));};});
    if(call.url.endsWith('/history'))return envelope(page([{...historyRow,status:retried?'Queued':'Failed',retryCount:retried?3:2}]));
  });
  try {
    const target=ui.host.querySelector('[aria-label="Retry notification 71"]'); await click(target); await click(target);
    assert.equal(ui.calls.filter(call=>call.url.endsWith('/71/retry')).length,1); assert.ok(target.disabled);
    assert.match(ui.host.querySelector('.ant-tag').textContent,/Failed/);
    await act(async()=>resolveRetry()); await until(()=>ui.host.querySelector('.ant-tag')?.textContent==='Queued');
    assert.equal(ui.host.querySelector('[aria-label="Retry notification 71"]'),null); assert.equal(ui.host.querySelector('tr[data-row-key="71"]').children[4].textContent,'3');
  } finally { await ui.close(); }
});

test('Delete rejection remains in confirmation dialog; no successful delete toast', async () => {
  const ui=await mount(rootPath,call=>call.method==='delete'?{success:false,message:'This default template is protected.'}:undefined);
  try {
    await click(ui.host.querySelector('[aria-label="Actions for Customer invoice"]'));
    await click([...document.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent==='Delete'));
    await click(button('Delete Template')); await settle();
    assert.match(document.querySelector('[role="dialog"]').textContent,/This default template is protected/);
    assert.equal(ui.host.textContent.includes('Template deleted.'),false);
    assert.equal(button('Delete Template').disabled,false);
  } finally { await ui.close(); }
});

test('Variable and edit-load errors expose Retry and never initialize guessed template values', async () => {
  let failed=true;
  const ui=await mount(`${rootPath}/23/edit`,call=>{
    if(call.url.endsWith('/23')&&failed)throw {response:{status:404,data:{message:'Template no longer exists.'}}};
    if(call.url.includes('/variables/'))throw new Error('Variable service unavailable');
  });
  try {
    assert.match(ui.host.textContent,/Template no longer exists/); assert.equal(ui.host.querySelector('#name'),null);
    failed=false; await click(button('Retry',ui.host)); await until(()=>ui.host.querySelector('#name'));
    await until(()=>ui.host.textContent.includes('Variable service unavailable'));
    assert.equal(ui.host.querySelectorAll('.notification-variable-chips button').length,0);
    assert.equal(serializeVisualEditor(ui.host.querySelector('#subjectTemplate'),false),template.subjectTemplate);
  } finally { await ui.close(); }
});

test('History loading, empty and API errors never fabricate communications', async () => {
  let resolveHistory;
  const ui=await mount(`${rootPath}/history`,call=>call.url.endsWith('/history')?new Promise(resolve=>{resolveHistory=resolve;}):undefined);
  try {
    assert.ok(ui.host.querySelector('.ant-spin-spinning'));
    await act(async()=>resolveHistory(envelope(page([])))); await until(()=>ui.host.textContent.includes('No communications found'));
    assert.equal(ui.host.querySelectorAll('tr[data-row-key]').length,0);
  } finally { await ui.close(); }
  const broken=await mount(`${rootPath}/history`,call=>{if(call.url.endsWith('/history'))throw {response:{status:403,data:{}}};});
  try { assert.match(broken.host.textContent,/permission/); assert.equal(broken.host.querySelectorAll('tr[data-row-key]').length,0); }
  finally { await broken.close(); }
});

test('Failed retry surfaces server error and refetches the updated retry count/reason', async () => {
  let failed=false;
  const ui=await mount(`${rootPath}/history`,call=>{
    if(call.url.endsWith('/71/retry')){failed=true;return {success:false,message:'Retry attempt failed: SMTP unavailable'};}
    if(call.url.endsWith('/history'))return envelope(page([{...historyRow,retryCount:failed?3:2,failureReason:failed?'Retry 3 failed: SMTP unavailable':historyRow.failureReason}]));
  });
  try {
    await click(ui.host.querySelector('[aria-label="Retry notification 71"]'));
    await until(()=>ui.host.querySelector('tr[data-row-key="71"]').children[4].textContent==='3');
    assert.match(document.body.textContent,/Retry attempt failed: SMTP unavailable/);
    assert.match(ui.host.textContent,/Retry 3 failed: SMTP unavailable/);
    assert.equal(ui.host.querySelector('.ant-tag').textContent,'Failed');
    assert.equal(ui.host.querySelector('[aria-label="Retry notification 71"]').disabled,false);
  } finally { await ui.close(); }
});

test('HTTP errors, unsuccessful envelopes and malformed responses never become fake success', async () => {
  for(const [status,text] of [[400,'Invalid body'],[401,'sign in'],[403,'permission'],[404,'not found'],[409,'changed state'],[500,'server']]) assert.match(notificationError({response:{status,data:status===400?{message:'Invalid body'}:{}}}),new RegExp(text,'i'));
  const ui=await mount(rootPath,()=>envelope([]));
  try {
    apiClient.get=async()=>({success:false,message:'Access denied'}); await assert.rejects(notificationService.getTemplates(),/Access denied/);
    apiClient.get=async()=>'<html>Offline</html>'; await assert.rejects(notificationService.getTemplates(),/invalid response/);
    apiClient.get=async()=>envelope({items:[]}); await assert.rejects(notificationService.getHistory({pageNumber:1,pageSize:20}),/invalid history/);
  } finally { await ui.close(); }
});

test('Routes and navigation extend existing protected layout without notification storage or backend URLs', () => {
  const routes=readFileSync('src/routes/AppRoutes.jsx','utf8');
  for(const path of [rootPath,`${rootPath}/new`,`${rootPath}/:id/edit`,`${rootPath}/history`]) assert.ok(routes.includes(`path="${path}"`));
  assert.equal((routes.match(/<ProtectedRoute>/g)||[]).length,1);
  assert.doesNotMatch(readFileSync('src/data/dashboardNavigation.js','utf8'),/id: 'notifications'/);
  assert.match(readFileSync('src/pages/Settings/SettingsLanding.jsx','utf8'),/Notification Management/);
  for(const file of ['notificationService.js','NotificationTemplates.jsx','NotificationTemplateForm.jsx','NotificationHistory.jsx','NotificationShared.jsx']) assert.doesNotMatch(readFileSync(`src/pages/Notifications/${file}`,'utf8'),/localStorage|sessionStorage|axios\.create|https?:\/\/|Module 17|dangerouslySetInnerHTML/);
});


test('Visual model preserves exact metadata tokens, order, unknown fields and literal labels', () => {
  const fields = [...variables, { name: 'InvoiceNumber', token: '{{InvoiceNumber}}' }, { name: 'CustomAmount', token: '[[Amount.v2]]' }];
  const raw = 'Hello {{CustomerName}}, {{InvoiceNumber}} / {{LegacyField}} [[Amount.v2]] Customer Name';
  const model = parseTemplateToVisualModel(raw, fields);
  assert.deepEqual(model.filter(part=>part.type==='token').map(part=>part.label), ['Customer Name','Invoice Number','Unknown field','Custom Amount']);
  assert.equal(serializeVisualModelToTemplate(model),raw);
});

test('Visual HTML loads formatted paragraphs and bold, preserving unknown tokens on editing', () => {
  const root=document.createElement('div');
  loadVisualEditor(root,'<p>Dear {{CustomerName}},</p><p><strong>{{LegacyAmount}}</strong></p>',variables,true);
  assert.equal(root.querySelector('p').textContent,'Dear Customer Name,');
  assert.equal(root.querySelector('strong').textContent,'Unknown field');
  assert.doesNotMatch(root.textContent, /<p>|<strong>|\{\{/);
  assert.equal(serializeVisualEditor(root,true),'<p>Dear {{CustomerName}},</p><p><strong>{{LegacyAmount}}</strong></p>');
  root.querySelector('p').append(document.createTextNode(' Welcome!'));
  assert.equal(serializeVisualEditor(root,true),'<p>Dear {{CustomerName}}, Welcome!</p><p><strong>{{LegacyAmount}}</strong></p>');
  loadVisualEditor(root,'<p onclick="bad()">Text</p><script>bad()</script><img src="/track">',[],true);
  assert.equal(root.querySelector('p').textContent,'Text');
  assert.equal(root.querySelector('p').hasAttribute('onclick'),false);
  assert.equal(root.querySelector('script,img'),null);
  assert.equal(serializeVisualEditor(root,true),'<p onclick="bad()">Text</p><script>bad()</script><img src="/track">');
});

test('Normal editors hide syntax, source mode is explicit, unchanged save preserves exact HTML', async () => {
  const original='<p class="email-copy">Dear <strong>{{CustomerName}}</strong></p>';
  const ui=await mount(`${rootPath}/23/edit`,call=>call.method==='get'&&call.url.endsWith('/23')?envelope({...template,bodyTemplate:original}):undefined);
  try {
    await until(()=>ui.host.querySelector('#bodyTemplate .notification-inline-field')?.textContent === 'Customer Name');
    assert.equal(ui.host.querySelector('#bodyTemplate').textContent,'Dear Customer Name');
    assert.doesNotMatch(ui.host.querySelector('#subjectTemplate').textContent,/\{\{/);
    await click(button('HTML Source',ui.host));
    assert.equal(ui.host.querySelector('[aria-label="Body HTML Source"]').value,original);
    await click(button('Visual Editor',ui.host));
    await click(button('Preview',ui.host)); await until(()=>document.querySelector('iframe'));
    assert.equal(ui.calls.find(call=>call.url.endsWith('/preview')).payload.bodyTemplate,original);
    await click(button('Close'));
    await act(async()=>Simulate.submit(ui.host.querySelector('form'))); await settle();
    assert.equal(ui.calls.find(call=>call.method==='put').payload.bodyTemplate,original);
  } finally { await ui.close(); }
});

test('List subjects use metadata chips without modifying API objects', async () => {
  const before=JSON.stringify(template);
  const ui=await mount(rootPath,call=>call.url.includes('/variables/')?envelope([...variables,{name:'InvoiceNumber',token:'{{InvoiceNumber}}'}]):undefined);
  try {
    await until(()=>ui.host.querySelector('.notification-truncate .notification-inline-field')?.textContent==='Invoice Number');
    assert.match(ui.host.textContent,/Subject Template/);
    assert.doesNotMatch(ui.host.querySelector('.ant-table').textContent,/\{\{/);
    assert.equal(JSON.stringify(template),before);
  } finally { await ui.close(); }
});


test('Rich editing retains email attributes, embedded markup and tokens in attributes', () => {
  const root=document.createElement('div');
  const original='<p class="email" style="color: brown">Dear {{CustomerName}}</p><a href="https://example.test/{{LegacyId}}">View</a><img src="cid:logo">';
  loadVisualEditor(root,original,variables,true);
  root.querySelector('p').append(document.createTextNode('!'));
  assert.equal(serializeVisualEditor(root,true),original.replace('</p>','!</p>'));
});

test('Repeated field insertion preserves subject order and rich body edits in preview payload', async () => {
  const ui=await mount(`${rootPath}/23/edit`);
  try {
    await until(()=>ui.host.querySelector('#bodyTemplate .notification-inline-field'));
    const subject=ui.host.querySelector('#subjectTemplate');
    await type(subject,'Hello '); caret(subject,6);
    await act(async()=>Simulate.focus(subject,{target:subject}));
    await click(button('+ Customer Name',ui.host)); await click(button('+ Customer Name',ui.host));
    assert.equal(subject.querySelectorAll('[contenteditable="false"]').length,2);
    const body=ui.host.querySelector('#bodyTemplate');
    await act(async()=>{ body.querySelector('p').append(document.createTextNode(' welcome')); Simulate.input(body); });
    await click(button('Preview',ui.host)); await until(()=>document.querySelector('iframe'));
    const payload=ui.calls.find(call=>call.url.endsWith('/preview')).payload;
    assert.equal(payload.subjectTemplate,'Hello {{CustomerName}}{{CustomerName}}');
    assert.equal(payload.bodyTemplate,'<p>Dear {{CustomerName}} welcome</p>');
  } finally { await ui.close(); }
});


test('Paste inserts plain formatted text and exact metadata tokens without activating HTML', async () => {
  const ui=await mount(`${rootPath}/23/edit`);
  try {
    await until(()=>ui.host.querySelector('#bodyTemplate .notification-inline-field'));
    const editor=ui.host.querySelector('#bodyTemplate');
    await type(editor,'');
    await act(async()=>Simulate.paste(editor,{clipboardData:{getData:()=>'<script>bad()</script>\n{{CustomerName}} {{LegacyField}}'},preventDefault(){}}));
    assert.equal(editor.querySelector('script'),null);
    assert.equal(editor.querySelectorAll('.notification-inline-field').length,2);
    assert.doesNotMatch(editor.textContent,/\{\{/);
    await click(button('Preview',ui.host)); await until(()=>document.querySelector('iframe'));
    assert.equal(ui.calls.find(call=>call.url.endsWith('/preview')).payload.bodyTemplate,'&lt;script&gt;bad()&lt;/script&gt;<br>{{CustomerName}} {{LegacyField}}');
  } finally { await ui.close(); }
});


test('HTML parser never rewrites unknown tokens containing entity characters', () => {
  const root=document.createElement('div');
  const html='<p>{{Legacy&Value}} {{Legacy<Value>}}</p><a href="https://example.test/{{Legacy&Id}}">Link</a>';
  loadVisualEditor(root,html,[],true);
  assert.equal(root.querySelectorAll('.notification-inline-field').length,2);
  assert.equal(serializeVisualEditor(root,true),html);
  root.querySelector('p').append(document.createTextNode('!'));
  assert.equal(serializeVisualEditor(root,true),html.replace('</p>','!</p>'));
});


test('Audit and notification errors use standard connection wording without infrastructure details', async () => {
  for (const message of ['Backend unavailable. Check the network connection and ngrok tunnel.', 'Backend unavailable. The ngrok tunnel may be offline.', 'Network Error']) {
    assert.equal(errorPresentation(message),connectionErrorMessage);
    assert.equal(notificationError(new Error(message)),connectionErrorMessage);
  }
  assert.equal(errorPresentation('Template no longer exists.'),'Template no longer exists.');
  const ui=await mount(rootPath,()=>{throw new Error('Backend unavailable. Check the network connection and ngrok tunnel.');});
  try {
    assert.ok(ui.host.querySelector('.bd-dashboard-error'));
    assert.match(ui.host.textContent,/Unable to load data/);
    assert.ok(ui.host.textContent.includes(connectionErrorMessage));
    assert.doesNotMatch(ui.host.textContent,/Backend unavailable|ngrok|Unable to load notification data/);
    assert.ok(button('Retry',ui.host));
  } finally { await ui.close(); }
});


test('Create and Edit Back to Notifications retain unsaved drafts without saving or discarding', async () => {
  for (const editing of [false, true]) {
    const ui = await mount(`${rootPath}/${editing ? '23/edit' : 'new'}`);
    try {
      await until(() => ui.host.querySelector('#name'));
      await type(ui.host.querySelector('#name'), 'Retained through Back');
      const back = button('Back to Notifications', ui.host);
      assert.ok(back.classList.contains('workspace-back-button'));
      await click(back); await until(() => ui.host.querySelector('[aria-label="Notification templates"]'));
      if (editing) {
        await until(() => ui.host.querySelector('[aria-label="Actions for Customer invoice"]'));
        await click(ui.host.querySelector('[aria-label="Actions for Customer invoice"]'));
        await click([...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === 'Edit'));
      } else await click(ui.host.querySelector(`a[href="${rootPath}/new"]`));
      await until(() => ui.host.querySelector('#name'));
      assert.equal(ui.host.querySelector('#name').value, 'Retained through Back');
      assert.equal(ui.calls.filter(call => ['post', 'put', 'delete'].includes(call.method)).length, 0);
    } finally { await ui.close(); }
  }
});

test('Template and history tables attach the border class to Ant tables with internal scroll containers', async () => {
  for (const path of [rootPath, `${rootPath}/history`]) {
    const ui = await mount(path);
    try {
      assert.ok(ui.host.querySelector('.notification-data-table.ibms-table-frame .ant-table-container .ant-table-content'));
      assert.ok(ui.host.querySelector('.notification-card'));
    } finally { await ui.close(); }
  }
});
