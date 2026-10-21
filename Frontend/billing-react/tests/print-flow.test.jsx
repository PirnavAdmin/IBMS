import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { printDocument } from '../src/utils/printDocument';
import { buildCustomerListReport, buildCustomerDetailsReport } from '../src/pages/Customers/utils/customerReports';
import { buildProductListReport } from '../src/pages/Products/utils/productListReport';
import { buildPaymentListReport, printPaymentDocument } from '../src/pages/Payments/paymentReports';

test('all reports print in an iframe without opening a tab or changing the route', () => {
  const original=global.window; const calls=[]; let afterPrint; let frame;
  const location={pathname:'/customers',search:'?status=active'};
  global.window={location,open:()=>assert.fail('New tab must not open'),document:{
    getElementById:()=>null,
    createElement:tag=>{assert.equal(tag,'iframe');return frame={style:{},setAttribute:()=>{},remove:()=>calls.push('removed'),contentWindow:{addEventListener:(event,fn)=>{assert.equal(event,'afterprint');afterPrint=fn;},focus:()=>{},print:()=>calls.push('print')}};},
    body:{appendChild:element=>element.onload()},
  }};
  try {
    for(const print of [printDocument,printPaymentDocument]) {
      print('<h1>Report</h1>');assert.equal(frame.srcdoc,'<h1>Report</h1>');afterPrint();
    }
    assert.deepEqual(calls,['print','removed','print','removed']);
    assert.deepEqual(location,{pathname:'/customers',search:'?status=active'});
  } finally {global.window=original;}
});

test('Customer list matches Product/Payment print colors and preserves escaped data',()=>{
  const html=buildCustomerListReport([{customerCode:'C-1',name:'<script>unsafe</script>',companyName:'Company',customerType:'Organization',taxId:'TAX-1',email:'test@example.test',mobile:'123',outstandingBalance:12.5,currency:'INR',status:'Active'}]);
  for(const report of [html,buildProductListReport([]),buildPaymentListReport([])]) {
    assert.match(report,/Arial,sans-serif/);assert.match(report,/#F0E2D0/);assert.match(report,/#BBA58C/);assert.match(report,/#633D28/);
    assert.doesNotMatch(report,/<script|<svg|window.open/);
  }
  for(const text of ['C-1','Company','TAX-1','test@example.test','12.50','Active','&lt;script&gt;unsafe&lt;/script&gt;']) assert.ok(html.includes(text));
});

test('Customer details retains all existing print sections in a plain themed document',()=>{
  const html=buildCustomerDetailsReport({customer:{name:'Account',customerCode:'C-1',currency:'INR',status:'Active',billingAddress:{line1:'Billing street'},shippingAddress:{line1:'Shipping street'}},financialSummary:{currency:'INR',totalInvoiced:100,totalPaid:20,outstandingBalance:80,creditLimit:200},invoices:[{id:1,invoiceNumber:'INV-1',amount:100,balance:80,currency:'INR'}],payments:[{id:1,paymentNumber:'PAY-1',amount:20,currency:'INR'}]});
  for(const value of ['Contact &amp; Account','Financial Summary','Addresses','Billing street','Shipping street','INV-1','PAY-1','80.00']) assert.ok(html.includes(value),value);
  assert.doesNotMatch(html,/linear-gradient|<button|<svg/);
});

test('print entry points stay on the current page and use Print labels',()=>{
  const product=readFileSync('src/pages/Products/ProductList.jsx','utf8');
  const categories=readFileSync('src/pages/Products/pages/CategoryList.jsx','utf8');
  const catalogPrint=readFileSync('src/pages/Products/utils/printCatalogReport.js','utf8');
  const customer=readFileSync('src/pages/Customers/pages/CustomerDetailsPage.jsx','utf8');
  const payments=readFileSync('src/pages/Payments/Payments.jsx','utf8');
  assert.doesNotMatch(product,/window.open|Print \/ Export PDF|: 'PDF'/);assert.match(product,/: 'Print'/);
  assert.match(categories,/Back to Products/);assert.match(categories,/>Print<\/Button>/);
  assert.doesNotMatch(catalogPrint,/window\.open|_blank/);assert.match(catalogPrint,/printDocument\(report/);
  assert.doesNotMatch(customer,/customerId\)\}\/print/);
  assert.doesNotMatch(payments,/navigate\([^\n]*print=true/);
  assert.match(payments,/getPaymentById\(p.id\)/);
});
