import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { validateQuotation } from '../src/pages/Quotations/utils/quotationValidation.js';
import { quotationQuery, initialQuotationQuery } from '../src/pages/Quotations/utils/quotationQuery.js';
import { currency, lineTotals, quotationTotals } from '../src/pages/Quotations/utils/quotationCalculations.js';
import { quotationPayload, normalizeQuotation } from '../../billing-api-client/quotationApi.js';

const form=()=>({customerId:'1',quotationDate:'2026-09-28',validUntil:'2026-09-29',items:[{productId:'2',description:'Service',quantity:1,unitPrice:100,discountType:'percentage',discountRate:5,taxRate:0}]});
async function load(relative,imports={}){
 const source=await readFile(new URL(relative,import.meta.url),'utf8');
 const {code}=await transform(source,{loader:relative.endsWith('jsx')?'jsx':'js',format:'cjs'});
 const module={exports:{}};
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>[initial,()=>{}],useEffect:()=>{},useRef:initial=>({current:initial})};
 vm.runInNewContext(code,{module,exports:module.exports,React:react,require:id=>imports[id]|| (id==='react'?react:new Proxy({},{get:(_,key)=>key}))});
 return module.exports;
}
function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);return [node.props?.children].flat(Infinity).map(text).join(' ');}
test('date range, product, quantity and non-negative amounts are validated',()=>{
 assert.deepEqual(validateQuotation(form()),{});
 for(const change of [{customerId:''},{quotationDate:''},{validUntil:'2026-09-27'},{items:[]}])assert.ok(Object.keys(validateQuotation({...form(),...change})).length);
 for(const change of [{productId:''},{quantity:0},{unitPrice:-1},{discountRate:-1},{taxRate:-1},{taxRate:101}])assert.ok(Object.keys(validateQuotation({...form(),items:[{...form().items[0],...change}]})).length);
});
test('server query omits unsupported validity; save carries rowVersion but no generated number',()=>{
 const query=quotationQuery({...initialQuotationQuery,search:'a',customerId:7,fromDate:'2026-09-01',validity:'Expired'});
 assert.equal(query.search,'a');assert.equal(query.customerId,7);assert.equal(query.pageNumber,1);assert.equal(query.validity,undefined);
 const payload=quotationPayload({...form(),id:1,rowVersion:'new-token',quoteNumber:'DO-NOT-SEND'});
 assert.equal(payload.rowVersion,'new-token');assert.equal(payload.quoteNumber,undefined);assert.equal(payload.items[0].discountType,'Percentage');
});
test('saved totals are preserved and absent tax does not become a default tax',()=>{
 const q=normalizeQuotation({id:1,customerId:1,subtotal:100,discountAmount:5,taxAmount:7,chargesAmount:3,totalAmount:105,items:[{quantity:1,unitPrice:100,taxAmount:7,totalAmount:102}]});
 assert.equal(q.totalAmount,105);assert.equal(q.chargesAmount,3);assert.equal(q.items[0].taxType,'');assert.equal(q.items[0].taxRate,0);
});
test('product picker excludes inactive and unknown-status products',async()=>{
 const {isSelectableProduct}=await load('../src/pages/Quotations/components/QuotationLookup.jsx');
 assert.equal(isSelectableProduct({status:'Active'}),true);assert.equal(isSelectableProduct({status:'Inactive'}),false);assert.equal(isSelectableProduct({status:'Unknown'}),false);assert.equal(isSelectableProduct({status:'Active',isActive:false}),false);
});
test('discount fixed/percentage requests use the Phase 5 contract and rejection is propagated',async()=>{
 const requests=[];
 const {discountValidationRequest,validateQuotationDiscounts}=await load('../src/pages/Quotations/utils/quotationDiscount.js',{'../../Settings/services/phase5Api':{phase5Api:{getDiscountConfiguration:async()=>({status:'Active',allowLineLevel:true}),validateMaximumDiscount:async req=>{requests.push(req);return {isValid:false,message:'Role limit exceeded'};}}}});
 assert.equal(discountValidationRequest({quantity:2,unitPrice:50,discountType:'fixed',discountAmount:4}).discountType,'Fixed');
 await assert.rejects(validateQuotationDiscounts(form().items),/Role limit exceeded/);
 assert.equal(requests[0].invoiceAmount,100);assert.equal(requests[0].role,undefined);assert.equal(requests[0].isManualOverride,false);
});
test('lifecycle actions and read-only converted quotation reference',async()=>{
 const {QuotationDetails}=await load('../src/pages/Quotations/pages/QuotationDetails.jsx',{'../utils/quotationCalculations':{currency,lineTotals,quotationTotals}});
 for(const [status,yes,no] of [['Draft','Send','Convert to Invoice'],['Sent','Approve','Edit'],['Approved','Convert to Invoice','Edit'],['Converted','Invoice reference','Cancel'],['Cancelled','Quotation details','Send']]){
  const html=text(QuotationDetails({quotation:{id:1,status,customer:{name:'Customer'},items:[],convertedInvoiceId:status==='Converted'?17:null}}));
  assert.ok(html.includes(yes),`${status}: expected ${yes}`);assert.ok(!html.includes(no),`${status}: unexpected ${no}`);assert.ok(html.includes('View'));
 }
});
test('quotation print matches invoice sample styling and uses quotation customer, item and total data',async()=>{
 const {QuotationDetails}=await load('../src/pages/Quotations/pages/QuotationDetails.jsx',{'../utils/quotationCalculations':{currency,lineTotals,quotationTotals}});
 const html=text(QuotationDetails({quotation:{
  quoteNumber:'QT-TEST-001',status:'Approved',quotationDate:'2026-09-28',validUntil:'2026-10-28',
  customer:{name:'Northwind Traders',code:'CUST-007',email:'billing@northwind.test',mobile:'9876501234',taxId:'29ABCDE1234F1Z5',billingAddress:'7 Main Road, Bengaluru',shippingAddress:'9 Warehouse Road'},
  items:[{id:'item-1',productName:'Widget',description:'Blue widget',hsnSac:'8471',quantity:2,unitPrice:1000,discountType:'percentage',discountRate:10,discountAmount:200,taxType:'GST',taxRate:18,taxAmount:324,totalAmount:2124}],
  subtotal:2000,discountAmount:200,taxableAmount:1800,taxAmount:324,chargesAmount:0,totalAmount:2124,
  notes:'Thank you for your business.',termsAndConditions:'Payment due within 30 days.\nGoods once sold are subject to store policy.',
 }},()=>{},()=>{},()=>{}));
 assert.match(html,/Northwind Traders/);
 assert.match(html,/7 Main Road, Bengaluru/);
 assert.match(html,/Widget/);
 assert.match(html,/18%/);
 assert.match(html,/CGST \(9%\)/);
 assert.match(html,/SGST \(9%\)/);
 assert.match(html,/Rupees Two Thousand One Hundred Twenty Four Only/);
 assert.match(html,/ACME ADMIN STORE/);
 assert.match(html,/Payment due within 30 days\./);
 assert.match(html,/Goods once sold are subject to store policy\./);
 assert.match(html,/Notes/);
 assert.match(html,/Thank you for your business\./);
 assert.match(html,/Authorized Signatory/);
 assert.doesNotMatch(html,/Latest sent invoice|No sent invoices found/);
 assert.doesNotMatch(html,/ACMEINV2026\/000245/);
});
test('new form has zero tax and preview contains no editing controls',async()=>{
 const {newQuotation}=await load('../src/pages/Quotations/components/QuotationForm.jsx');assert.equal(newQuotation().items[0].taxRate,0);assert.equal(newQuotation().items[0].taxType,'');
 const {QuotationPreview}=await load('../src/pages/Quotations/components/QuotationPreview.jsx',{'../utils/quotationCalculations':{currency:String}});
 const tree=QuotationPreview({quotation:{...form(),customer:{name:'QA'},totalAmount:100}});
 function controls(n){return typeof n==='object'&&n?['input','select','textarea','button'].includes(n.type)||[n.props?.children].flat(Infinity).some(controls):false;}
 assert.equal(controls(tree),false);assert.match(text(tree),/QA/);
});
