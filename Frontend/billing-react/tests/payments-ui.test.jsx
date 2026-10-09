import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from 'billing-api-client';
import { Payments } from '../src/pages/Payments/Payments';
import { RecordPayment } from '../src/pages/Payments/RecordPayment';
import { PaymentDetails } from '../src/pages/Payments/PaymentDetails';
import { PaymentReversalContent } from '../src/pages/Payments/PaymentReversal';
import { PaymentState } from '../src/pages/Payments/PaymentShared';
import { paymentService, paymentQuery, mapPayment, mapBalance, createPaymentDto, createAttemptManager, createSubmissionGuard, invalidatePaymentData, paymentError, paymentPermissions, money } from '../src/pages/Payments/paymentService';
import { paymentSchema, reversalSchema } from '../src/pages/Payments/paymentValidation';
import { buildPaymentListReport, buildPaymentReceiptReport, getPaymentReportRows, printPaymentDocument } from '../src/pages/Payments/paymentReports';

// Test fixtures only; never imported by application runtime.
const invoice = { invoiceId: 7, customerId: 3, invoiceNumber: 'QA-7', customerName: 'QA Customer', currency: 'INR', invoiceTotal: 100, previouslyPaid: 20, currentOutstanding: 80, isEligibleForPayment: true };
const payment = { id: 9, paymentNumber: 'QA-PAY-9', invoiceNumber: 'QA-7', invoiceNumbers: ['QA-7'], customerName: 'QA Customer', amount: 20, allocatedAmount: 20, currency: 'INR', method: 'Cash', status: 'Completed', isReversible: true, allocations: [{ id: 1, invoiceId: 7, invoiceNumber: 'QA-7', allocatedAmount: 20, invoicePaidAmount: 20, invoiceBalanceAmount: 80 }], auditHistory: [{id:1,action:'PaymentCreated',userName:'QA',timestamp:'2026-09-30'}] };
const form = { invoice:'7', date:'2026-09-30', amount:'20', method:'Cash', notes:'' };
const envelope = data => ({success:true,data});
const params = { search:'',status:'',method:'',from:'',to:'',pageSize:10,pageNumber:1,sortBy:'createdAtUtc',sortOrder:'desc' };
const cache = () => { const c=new QueryClient({defaultOptions:{queries:{retry:false,retryOnMount:false,staleTime:Infinity,gcTime:Infinity}}});c.setQueryData(['payment-user'],{roles:['TenantAdmin']});return c; };
const render = (path,c=cache()) => renderToStaticMarkup(<StaticRouter location={path}><QueryClientProvider client={c}><Routes><Route path="/payments" element={<Payments />} /><Route path="/payments/new" element={<RecordPayment />} /><Route path="/payments/:id" element={<PaymentDetails />} /></Routes></QueryClientProvider></StaticRouter>);

test('Payments list: real mapped row, controls, actions and server page totals',()=>{
 const c=cache();c.setQueryData(['payments','list',params],{items:[mapPayment(payment)],totalCount:21,pageNumber:1,pageSize:10});
 const html=render('/payments',c);
 for(const value of ['Payment Management','Search payments','From Date','To Date','Rows per page','QA-PAY-9','QA Customer','Actions for payment QA-PAY-9','21 payments']) assert.ok(html.includes(value),value);
 assert.match(html,/href="\/payments\/new"/);
 assert.doesNotMatch(html,/MuiTableCell-alignRight|MuiTableCell-alignCenter/);
 const headings = [...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(match => match[1].replace(/<style\b[\s\S]*?<\/style>|<svg\b[\s\S]*?<\/svg>|<[^>]*>/g, '').trim());
 assert.deepEqual(headings, ['Payment Number / ID','Date','Customer','Invoice','Method','Amount','Allocated','Status','Actions']);
});
test('Payments list and details: empty, loading and API failure states',()=>{
 const c=cache();c.setQueryData(['payments','list',params],{items:[],totalCount:0,pageNumber:1,pageSize:10});assert.match(render('/payments',c),/No payments found/);
 assert.match(render('/payments/9'),/Loading payment data/);
 c.getQueryCache().build(c,{queryKey:['payments','detail','9']}).setState({status:'error',fetchStatus:'idle',error:{response:{status:404}}});
 assert.match(render('/payments/9',c),/Payment resource not found/);
});
test('Record screen renders fields and read-only authoritative values',()=>{
 const c=cache();c.setQueryData(['payment-invoices'],[invoice]);const html=render('/payments/new',c);
 for(const label of ['Invoice Search / Select','Invoice Total','Previously Paid','Current Outstanding','Payment Date','Payment Amount','Payment Method','Notes','Review Payment'])assert.ok(html.includes(label),label);
 const fields=(html.match(/<input\b[^>]*>/g)||[]).filter(x=>x.includes('placeholder="Select an eligible invoice"'));assert.equal(fields.length,4);assert.ok(fields.every(x=>/readonly=""/i.test(x)));
});
test('Payment details maps actual allocations, balance, audit and reversal state',()=>{
 const c=cache();c.setQueryData(['payments','detail','9'],mapPayment(payment));const html=render('/payments/9',c);
 for(const value of ['Payment Summary','Invoice Allocation','Audit Timeline','PaymentCreated','QA-7','Outstanding','Reverse Payment'])assert.ok(html.includes(value),value);
 c.setQueryData(['payments','detail','9'],mapPayment({...payment,status:'Reversed',isReversible:false,reversalReason:'QA reversal'}));const reversed=render('/payments/9',c);assert.match(reversed,/QA reversal/);assert.doesNotMatch(reversed,/>Reverse Payment</);
});
test('Payment query preserves filters, server pagination and sorting',()=>{
 assert.equal(paymentQuery(params).sortBy, 'createdAtUtc');
 assert.equal(paymentQuery(params).sortOrder, 'desc');
 assert.deepEqual(paymentQuery({...params,search:' Q ',status:'Completed',method:'Cash',from:'2026-09-01',to:'2026-09-30',pageNumber:3,sortBy:'amount',sortOrder:'asc'}),{search:'Q',status:'Completed',method:'Cash',fromDate:'2026-09-01',toDate:'2026-09-30',pageNumber:3,pageSize:10,sortBy:'amount',sortOrder:'asc'});
});

test('Newest-first list respects server creation order even for backdated payments', () => {
 const c = cache();
 const latest = mapPayment({ ...payment, id: 10, paymentNumber: 'NEW-BACKDATED', paymentDate: '2026-08-01', createdAtUtc: '2026-10-09T09:00:00Z' });
 const earlier = mapPayment({ ...payment, paymentNumber: 'EARLIER-RECORD', paymentDate: '2026-10-08', createdAtUtc: '2026-10-08T09:00:00Z' });
 c.setQueryData(['payments','list',params], {items:[latest,earlier], totalCount:2, pageNumber:1, pageSize:10});
 const html = render('/payments', c);
 assert.ok(html.indexOf('NEW-BACKDATED') < html.indexOf('EARLIER-RECORD'));
});

test('Payment money preserves backend fractional amounts and zero', () => {
 assert.match(money(2253.75, 'INR'), /2,253\.75/);
 assert.match(money(0, 'INR'), /0\.00/);
 assert.equal(money(null, 'INR'), '\u2014');
});

test('Payment list print contains plain escaped rows without application controls or circles', () => {
 const rows = Array.from({length:205}, (_, id) => mapPayment({...payment, id, customerName:'<script>unsafe</script>', amount:2253.75}));
 const html = buildPaymentListReport(rows);
 assert.match(html, /<h1>Payments<\/h1>/);
 assert.match(html, /12px Arial,sans-serif/);
 assert.match(html, /INR 2,253\.75/);
 assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
 assert.equal((html.match(/<tr>/g) || []).length, 206);
 assert.doesNotMatch(html, /<button|<svg|<script|border-radius|payment-status|Actions|INVOICE.BILLING/);
 assert.match(html, /text-align:left/);
 assert.match(html, /display:table-header-group/);
});

test('Receipt prints authoritative allocation amounts, notes and reversal without badges', () => {
 const html = buildPaymentReceiptReport(mapPayment({...payment, amount:20.75, notes:'<b>Customer note</b>', status:'Reversed', reversalReason:'Duplicate receipt'}));
 for (const value of ['Payment Receipt','Payment Summary','Invoice Allocation','QA-7','INR 20.75','INR 80.00','Duplicate receipt','&lt;b&gt;Customer note&lt;/b&gt;']) assert.ok(html.includes(value), value);
 assert.doesNotMatch(html, /<button|<svg|border-radius|payment-status|Audit Timeline/);
});

test('Print export requests all filtered pages with the same server sort', async () => {
 const original = paymentService.getPayments; const calls = [];
 paymentService.getPayments = async filters => {
  calls.push(filters);
  return {items:filters.pageNumber === 1 ? [{id:1},{id:2}] : [{id:3}], totalCount:3, pageNumber:filters.pageNumber, pageSize:2};
 };
 try {
  const rows = await getPaymentReportRows({...params, search:'customer', status:'Completed', pageNumber:4});
  assert.deepEqual(rows.map(row=>row.id), [1,2,3]);
  assert.deepEqual(calls.map(p=>p.pageNumber), [1,2]);
  assert.ok(calls.every(p=>p.search==='customer' && p.status==='Completed' && p.sortBy==='createdAtUtc' && p.sortOrder==='desc'));
 } finally { paymentService.getPayments = original; }
});

test('Print refuses incomplete or duplicate results instead of silently dropping payments', async () => {
 const original = paymentService.getPayments;
 try {
  paymentService.getPayments = async () => ({items:[{id:1}],totalCount:2,pageNumber:1,pageSize:100});
  await assert.rejects(getPaymentReportRows(params), /complete filtered payments/);
  paymentService.getPayments = async () => ({items:[{id:1},{id:1}],totalCount:2,pageNumber:1,pageSize:100});
  await assert.rejects(getPaymentReportRows(params), /complete filtered payments/);
 } finally { paymentService.getPayments = original; }
});

test('Print opens only the isolated document and cleans up after printing', () => {
 const original = global.window;
 const calls = []; let cleanup; let frame;
 global.window = {document:{
  getElementById:()=>null,
  createElement:()=> (frame = {style:{},setAttribute:()=>{},remove:()=>calls.push('removed'),contentWindow:{
   addEventListener:(event,callback)=>{assert.equal(event,'afterprint');cleanup=callback;},
   focus:()=>calls.push('focus'),print:()=>calls.push('print'),
  }}),
  body:{appendChild:element=>{assert.equal(element.srcdoc,'<h1>Report</h1>');element.onload();}},
 }};
 try { printPaymentDocument('<h1>Report</h1>'); assert.deepEqual(calls,['focus','print']); cleanup(); assert.deepEqual(calls,['focus','print','removed']); }
 finally { if (original === undefined) delete global.window; else global.window=original; }
});
test('Payment GET adapters use confirmed paths, signals and DTO mapping',async()=>{
 const original=apiClient.get;const calls=[];const signal=new AbortController().signal;
 apiClient.get=async(url,config)=>{calls.push([url,config]);return envelope(url.endsWith('eligible-invoices')?[invoice,{...invoice,invoiceId:8,isEligibleForPayment:false}]:url.endsWith('/balance')?invoice:url.endsWith('/9')?payment:{items:[payment],totalCount:21,pageNumber:2,pageSize:10});};
 try{
  const page=await paymentService.getPayments({...params,pageNumber:2},{signal});assert.equal(page.pageNumber,2);assert.equal(page.items[0].invoiceDisplay,'QA-7');assert.equal(calls[0][1].params.pageNumber,2);assert.equal(calls[0][1].signal,signal);
  assert.equal((await paymentService.getEligibleInvoices()).length,1);assert.deepEqual(await paymentService.getInvoiceBalance(7),invoice);assert.equal((await paymentService.getPaymentById(9)).auditHistory[0].action,'PaymentCreated');
  assert.deepEqual(calls.map(x=>x[0]),['/api/v1/payments','/api/v1/payments/eligible-invoices','/api/v1/payments/invoices/7/balance','/api/v1/payments/9']);
 }finally{apiClient.get=original;}
});
test('Balance mapping preserves authoritative amounts and rejects invalid DTOs',()=>{
 assert.deepEqual(mapBalance(invoice),invoice);assert.throws(()=>mapBalance({...invoice,currentOutstanding:undefined}));assert.throws(()=>mapPayment({id:9}));
});
test('Create DTO includes only selected method fields, no client tenant or numbering',()=>{
 const dto=createPaymentDto({...form,method:'BankTransfer',reference:' REF ',bankName:' Bank ',chequeNumber:'stale'},invoice,'key');
 assert.equal(dto.reference,'REF');assert.equal(dto.invoiceId,7);assert.equal(dto.customerId,3);assert.equal(dto.amount,20);assert.equal(dto.paymentDate,'2026-09-30T00:00:00Z');assert.equal(dto.idempotencyKey,'key');
 for(const key of ['chequeNumber','tenantId','branchId','paymentNumber','invoiceTotal'])assert.equal(Object.hasOwn(dto,key),false);
});
test('Create and reversal POST requests preserve key, reason and conflict errors',async()=>{
 const original=apiClient.post;const calls=[];apiClient.post=async(url,body)=>{calls.push([url,body]);return envelope(payment);};
 try{const dto=createPaymentDto(form,invoice,'key');await paymentService.createPayment(dto);await paymentService.reversePayment(9,'  QA reason  ','reverse-key');assert.deepEqual(calls,[['/api/v1/payments',dto],['/api/v1/payments/9/reverse',{reason:'QA reason',idempotencyKey:'reverse-key'}]]);
 const conflict={response:{status:409,data:{message:'Already reversed'}}};apiClient.post=async()=>{throw conflict;};await assert.rejects(paymentService.reversePayment(9,'QA reason','reverse-key'),e=>e===conflict);
 }finally{apiClient.post=original;}
});
test('Idempotency survives ambiguous retry; new payload receives new key',async()=>{
 let index=0;const attempts=createAttemptManager(()=>`key-${++index}`);const dto=createPaymentDto(form,invoice);const key=attempts.keyFor(dto);
 const original=apiClient.post;const sent=[];apiClient.post=async(_,body)=>{sent.push({...body});if(sent.length===1)throw {code:'ECONNABORTED'};return envelope(payment);};
 try{await assert.rejects(paymentService.createPayment({...dto,idempotencyKey:key}));await paymentService.createPayment({...dto,idempotencyKey:attempts.keyFor(dto)});assert.deepEqual(sent[0],sent[1]);assert.notEqual(attempts.keyFor({...dto,amount:21}),key);}finally{apiClient.post=original;}
});
test('Submission guard excludes overlapping operations and releases after failure',async()=>{
 const guard=createSubmissionGuard();let calls=0;let finish;const pending=new Promise(resolve=>{finish=resolve;});
 const submit=async()=>{if(!guard.acquire())return;try{calls++;await pending;}finally{guard.release();}};
 const first=submit();await submit();assert.equal(calls,1);finish();await first;assert.equal(guard.acquire(),true);assert.equal(guard.acquire(),false);guard.release();assert.equal(guard.acquire(),true);guard.release();
});
test('Validation covers amount, method details, dates and reversal limits',()=>{
 for(const amount of ['',0,-1,'bad',Infinity,1.001,1000000001])assert.throws(()=>paymentSchema.validateSyncAt('amount',{amount}));
 assert.equal(paymentSchema.validateSyncAt('amount',{amount:'12.50'}),12.5);
 for(const method of ['BankTransfer','UPI','Card','Cheque','Gateway','Custom','Unsupported'])assert.throws(()=>paymentSchema.validateSync({...form,method}));
 for(const [method,patch] of [['BankTransfer',{reference:'R'}],['UPI',{providerTransactionId:'R'}],['Card',{reference:'R'}],['Cheque',{chequeNumber:'C',chequeDate:'2026-09-30'}],['Gateway',{providerName:'P',reference:'R'}],['Custom',{customMethodName:'Other'}]])assert.doesNotThrow(()=>paymentSchema.validateSync({...form,method,...patch}));
 for(const reason of ['', '  ', 'ab','x'.repeat(501)])assert.throws(()=>reversalSchema.validateSync({reason}));assert.equal(reversalSchema.validateSync({reason:'  QA reason  '}).reason,'QA reason');
});
test('Distinct payment failures preserve safe backend messages',()=>{
 for(const [status,match] of [[400,/validation/],[401,/sign in/],[403,/permission/],[404,/not found/],[409,/conflict/],[500,/server/]])assert.match(paymentError({response:{status}}),match);
 assert.equal(paymentError({response:{status:409,data:{message:'Outstanding changed'}}}),'Outstanding changed');assert.match(paymentError({code:'ECONNABORTED'}),/timed out/);
});
test('Reversal authorization and financial cache invalidation',async()=>{
 assert.equal(paymentPermissions(null).reverse,false);assert.equal(paymentPermissions({roles:['Customer']}).reverse,false);assert.equal(paymentPermissions({roles:['TenantAdmin']}).reverse,true);assert.equal(paymentPermissions({permissions:['payments.reverse']}).reverse,true);
 const keys=[];await invalidatePaymentData({invalidateQueries:async({queryKey})=>keys.push(queryKey[0])});for(const key of ['payments','payment-invoices','payment-balance','invoices','dashboard','finance'])assert.ok(keys.includes(key));
});
test('Reversal content uses actual payment amounts and warning',()=>{
 const html=renderToStaticMarkup(<PaymentReversalContent payment={mapPayment(payment)} reason="" onChange={()=>{}} error="Reason required"/>);assert.match(html,/QA-PAY-9/);assert.match(html,/Reversing this payment will update/);assert.match(html,/Reason required/);
});
test('Fresh balance, exact retry and duplicate guard are wired before mutations',()=>{
 const dir=join(__dirname,'../src/pages/Payments');const record=readFileSync(join(dir,'RecordPayment.jsx'),'utf8');
 const compact=record.replace(/\s+/g,'');
 const refreshIndex=compact.indexOf('constfresh=awaitbalance.refetch()');
 assert.ok(refreshIndex>=0 && refreshIndex<compact.indexOf('setConfirmation({values:'));
 assert.match(compact,/Number\(form.amount\)>Math.trunc\(fresh.data.currentOutstanding\)/);
 assert.match(record,/confirmation.retryDto \|\| createPaymentDto/);assert.match(record,/if\(!dto.idempotencyKey\)/);assert.match(record,/Retry Same Payment/);assert.match(record,/lock.current.acquire\(\)/);
 const reverse=readFileSync(join(dir,'PaymentReversal.jsx'),'utf8');assert.match(reverse,/query.data\?\.isReversible/);assert.match(reverse,/user.permissions.reverse/);assert.match(reverse,/lock.current.acquire\(\)/);assert.match(reverse,/invalidatePaymentData\(client\)/);
});
test('Zero runtime mocks, business storage or integration stubs; routes preserved',()=>{
 const dir=join(__dirname,'../src/pages/Payments');for(const name of readdirSync(dir).filter(name=>/\.(js|jsx)$/.test(name))){const source=readFileSync(join(dir,name),'utf8');assert.doesNotMatch(source,/localStorage|setTimeout|jsonplaceholder|mockPayments|dummyPayments|samplePayments|Payment backend contract unavailable|PAYMENT_API_AVAILABLE/,name);}
 const routes=readFileSync(join(__dirname,'../src/routes/AppRoutes.jsx'),'utf8');for(const path of ['/payments','/payments/new','/payments/:id'])assert.ok(routes.includes(`path="${path}"`));
});
