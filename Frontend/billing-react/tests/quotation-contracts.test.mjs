import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { displayDate } from '../src/utils/localDate.js';
import { transform } from 'esbuild';
import { validateQuotation } from '../src/pages/Quotations/utils/quotationValidation.js';
import { quotationQuery, initialQuotationQuery, compareQuotationCreations, compareQuotationNumbers, compareQuotationUpdates, quotationUpdatedTimestamp } from '../src/pages/Quotations/utils/quotationQuery.js';
import { applyAdditionalDiscounts, applyAdditionalTaxes, currency, lineTotals, quotationTotals } from '../src/pages/Quotations/utils/quotationCalculations.js';
import { quotationPayload, normalizeQuotation } from '../../billing-api-client/quotationApi.js';

const form=()=>({customerId:'1',quotationDate:'2026-09-28',validUntil:'2026-09-29',items:[{productId:'2',description:'Service',quantity:1,unitPrice:100,discountType:'percentage',discountRate:5,taxRate:0}]});
async function load(relative,imports={}){
 const source=await readFile(new URL(relative,import.meta.url),'utf8');
 const {code}=await transform(source,{loader:relative.endsWith('jsx')?'jsx':'js',format:'cjs'});
 const module={exports:{}};
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useMemo:factory=>factory(),useEffect:()=>{},useRef:initial=>({current:initial})};
 vm.runInNewContext(code,{module,exports:module.exports,React:react,require:id=>imports[id]|| (id.endsWith('/localDate')?{displayDate}:id==='react'?react:new Proxy({},{get:(_,key)=>key}))});
 return module.exports;
}
function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);return [node.props?.children].flat(Infinity).map(text).join(' ');}
test('date range, product, quantity and non-negative amounts are validated',()=>{
 assert.deepEqual(validateQuotation(form()),{});
 assert.deepEqual(validateQuotation({...form(),items:[{...form().items[0],description:''}]}),{});
 for(const change of [{customerId:''},{quotationDate:''},{validUntil:'2026-09-27'},{items:[]}])assert.ok(Object.keys(validateQuotation({...form(),...change})).length);
 for(const change of [{productId:''},{quantity:-1},{quantity:1.01},{unitPrice:-1},{discountRate:-1},{taxRate:-1},{taxRate:101}])assert.ok(Object.keys(validateQuotation({...form(),items:[{...form().items[0],...change}]})).length);
 for(const quantity of [0,1,2,1000000])assert.deepEqual(validateQuotation({...form(),items:[{...form().items[0],quantity}]}),{});
});
test('server query omits unsupported validity; save carries rowVersion but no generated number',()=>{
 const query=quotationQuery({...initialQuotationQuery,search:'a',customerId:7,fromDate:'2026-09-01',validity:'Expired'});
 assert.equal(query.search,'a');assert.equal(query.customerId,7);assert.equal(query.pageNumber,1);assert.equal(query.validity,undefined);
 const payload=quotationPayload({...form(),id:1,rowVersion:'new-token',quoteNumber:'DO-NOT-SEND'});
 assert.equal(payload.rowVersion,'new-token');assert.equal(payload.quoteNumber,undefined);assert.equal(payload.items[0].discountType,'Percentage');
});
test('quotation update sorting uses last update, then creation date when update time is unavailable',()=>{
 const older={quoteNumber:'QT-2026-001',createdAtUtc:'2026-09-01T10:00:00Z'};
 const newer={quoteNumber:'QT-2026-002',createdAtUtc:'2026-09-02T10:00:00Z'};
 const recentlyUpdated={quoteNumber:'QT-2026-003',createdAtUtc:'2026-08-01T10:00:00Z',updatedAtUtc:'2026-09-03T10:00:00Z'};
 assert.equal(quotationUpdatedTimestamp(older),Date.parse(older.createdAtUtc));
 assert.deepEqual([recentlyUpdated,newer,older].sort((a,b)=>compareQuotationUpdates(a,b,'desc')).map(item=>item.quoteNumber),['QT-2026-003','QT-2026-002','QT-2026-001']);
 assert.deepEqual([older,newer,recentlyUpdated].sort((a,b)=>compareQuotationUpdates(a,b,'asc')).map(item=>item.quoteNumber),['QT-2026-001','QT-2026-002','QT-2026-003']);
 const noTimestamps=[{id:10,quoteNumber:'QT-010'},{id:12,quoteNumber:'QT-012'},{id:11,quoteNumber:'QT-011'}];
 assert.deepEqual(noTimestamps.sort((a,b)=>compareQuotationUpdates(a,b,'desc')).map(item=>item.id),[12,11,10]);
 assert.deepEqual(noTimestamps.sort((a,b)=>compareQuotationUpdates(a,b,'asc')).map(item=>item.id),[10,11,12]);
 assert.equal(quotationUpdatedTimestamp({updatedAtUtc:'invalid',createdAtUtc:'2026-09-04T10:00:00Z'}),Date.parse('2026-09-04T10:00:00Z'));
 const rowVersionFor=date=>{const bytes=Buffer.alloc(8);bytes.writeBigUInt64LE(BigInt(new Date(date).getTime())*10000n+621355968000000000n);return bytes.toString('base64');};
 const staleCreated={id:1,createdAtUtc:'2026-09-01T10:00:00Z',rowVersion:rowVersionFor('2026-09-03T10:00:00Z')};
 const moreRecentlyCreated={id:2,createdAtUtc:'2026-09-02T10:00:00Z',rowVersion:rowVersionFor('2026-09-02T10:00:00Z')};
 assert.ok(quotationUpdatedTimestamp(staleCreated)>quotationUpdatedTimestamp(moreRecentlyCreated));
 assert.deepEqual([moreRecentlyCreated,staleCreated].sort((a,b)=>compareQuotationUpdates(a,b,'desc')).map(item=>item.id),[1,2]);
});
test('recently created quotations are sorted newest first regardless of later edits to older quotations',()=>{
 const olderEditedRecently={id:1,createdAtUtc:'2026-09-01T10:00:00Z',updatedAtUtc:'2026-10-09T10:00:00Z'};
 const newestCreated={id:2,createdAtUtc:'2026-10-10T10:00:00Z',updatedAtUtc:'2026-10-10T10:00:00Z'};
 assert.deepEqual([olderEditedRecently,newestCreated].sort((a,b)=>compareQuotationCreations(a,b,'desc')).map(item=>item.id),[2,1]);
 assert.deepEqual([olderEditedRecently,newestCreated].sort((a,b)=>compareQuotationCreations(a,b,'asc')).map(item=>item.id),[1,2]);
});
test('quotation filter Apply uses selected newest/oldest creation order for the quotation table',async()=>{
 const source=await readFile(new URL('../src/pages/Quotations/pages/QuotationList.jsx',import.meta.url),'utf8');
 assert.match(source,/sort\.key==='createdAtUtc'\)return compareQuotationCreations\(a,b,applied\.sortBy==='oldest'\?'asc':'desc'\)/);
 assert.match(source,/setSort\(\{key:'createdAtUtc',direction:filters\.sortBy==='oldest'\?'asc':'desc'\}\);setPage\(1\);setQuotationsOpen\(true\);setFiltersOpen\(false\)/);
 assert.match(source,/setApplied\(\{\.\.\.filters\}\);setSort/);
});
test('quotation number sorting is numeric and starts with the earliest sequence',()=>{
 const rows=[
  {id:82,quoteNumber:'QT-2026-10-0082'},
  {id:75,quoteNumber:'QT-2026-10-000075'},
  {id:90,quoteNumber:'QT-2026-10-0090'},
  {id:1,quoteNumber:'QT-2026-10-0001'},
 ];
 assert.deepEqual(rows.sort((a,b)=>compareQuotationNumbers(a,b,'asc')).map(row=>row.id),[1,75,82,90]);
 assert.deepEqual(rows.sort((a,b)=>compareQuotationNumbers(a,b,'desc')).map(row=>row.id),[90,82,75,1]);
});
test('saved totals are preserved and absent tax does not become a default tax',()=>{
 const q=normalizeQuotation({id:1,customerId:1,subtotal:100,discountAmount:5,taxAmount:7,chargesAmount:3,totalAmount:105,items:[{quantity:1,unitPrice:100,taxAmount:7,totalAmount:102}]});
 assert.equal(q.totalAmount,105);assert.equal(q.chargesAmount,3);assert.equal(q.items[0].taxType,'');assert.equal(q.items[0].taxRate,0);
});
test('additional product tax and discount rows are included in quotation summary totals',()=>{
 const item={id:'line-1',productId:'2',quantity:1,unitPrice:50000,discountType:'percentage',discountRate:0,taxRate:18};
 const totals=quotationTotals([item],{type:'percentage',value:0},[],[{itemId:'line-1',taxAmount:'500'}],[{itemId:'line-1',discountType:'percentage',discountValue:'10'}]);
 assert.equal(totals.discountAmount,5000);
 assert.equal(totals.taxableAmount,45000);
 assert.equal(totals.taxAmount,8600);
 assert.equal(totals.totalAmount,53600);
});
test('additional product discount is included in the saved item discount payload',()=>{
 const item={id:'line-1',productId:'2',description:'Product',quantity:1,unitPrice:50000,discountType:'percentage',discountRate:5,taxRate:18};
 const items=applyAdditionalDiscounts([item],[{itemId:'line-1',discountType:'fixed',discountValue:'2500'}]);
 assert.equal(items[0].discountType,'fixed');
 assert.equal(items[0].discountAmount,5000);
 assert.equal(quotationPayload({...form(),items}).items[0].discountType,'Fixed');
 assert.equal(quotationPayload({...form(),items}).items[0].discountRate,5000);
});
test('additional product tax is included in the saved item tax rate and totals',()=>{
 const item={id:'line-1',productId:'2',description:'Product',quantity:1,unitPrice:100,discountType:'percentage',discountRate:10,taxRate:18};
 const discountedItems=applyAdditionalDiscounts([item],[{itemId:'line-1',discountType:'fixed',discountValue:'5'}]);
 const items=applyAdditionalTaxes(discountedItems,[{itemId:'line-1',taxAmount:'5'}]);
 const payload=quotationPayload({...form(),items}).items[0];
 assert.equal(payload.discountRate,15);
 assert.ok(Math.abs(lineTotals(items[0]).tax - 20.3) < 0.000001);
 assert.equal(quotationTotals(items).totalAmount,105.3);
});
test('configured quotation charges populate their configured fixed amount or percentage',async()=>{
 const {quotationChargeSelection}=await load('../src/pages/Quotations/components/QuotationForm.jsx');
 const configs=[
  {id:12,name:'Packaging',code:'PACKAGING',value:25,calculationType:'Fixed'},
  {id:13,name:'Service Fee',code:'SERVICE',value:2.5,calculationType:'Percentage'},
 ];
 const packaging=quotationChargeSelection(configs,'12');
 assert.equal(JSON.stringify(packaging),JSON.stringify({
  namePreset:'Packaging',name:'Packaging',amount:25,type:'fixed',configuredChargeId:12,configuredChargeCode:'PACKAGING',
 }));
 const percentage=quotationChargeSelection(configs,'13');
 assert.equal(percentage.amount,2.5);assert.equal(percentage.type,'percentage');assert.equal(percentage.configuredChargeId,13);
 assert.equal(quotationTotals([{id:'item',quantity:1,unitPrice:100}],undefined,[percentage]).chargesAmount,2.5);
 assert.equal(JSON.stringify(quotationChargeSelection(configs,'custom')),JSON.stringify({namePreset:'custom',name:'',amount:'0',type:'fixed'}));
});
test('selected quotation tax type and rate add to product tax and recalculate summary totals',()=>{
 const item={id:'line-1',productId:'2',quantity:1,unitPrice:1000,discountType:'percentage',discountRate:0,taxType:'GST',taxRate:18};
 for(const [taxType,taxRate,expectedTax] of [['CGST',9,270],['SGST',2.5,205],['IGST',18,360],['VAT',12,300],['Custom Tax',5,230]]){
  const items=applyAdditionalTaxes([item],[{itemId:'line-1',taxType,taxRate:String(taxRate)}]);
  assert.equal(items[0].taxType,`GST + ${taxType}`);
  assert.equal(items[0].taxRate,18+taxRate);
  const summary=quotationTotals(items);
  assert.equal(summary.taxAmount,expectedTax);
  assert.equal(summary.totalAmount,1000+expectedTax);
 }
 const combined=applyAdditionalTaxes([item],[
  {itemId:'line-1',taxType:'CGST',taxRate:'9'},
  {itemId:'line-1',taxType:'SGST',taxRate:'9'},
 ]);
 assert.equal(combined[0].taxType,'GST + CGST + SGST');
 assert.equal(combined[0].taxRate,36);
 assert.equal(quotationTotals(combined).taxAmount,360);
});
test('custom quotation tax rate is added to product tax and included in summary totals',()=>{
 const item={id:'line-1',productId:'2',quantity:1,unitPrice:2000,taxType:'GST',taxRate:18};
 const items=applyAdditionalTaxes([item],[{itemId:'line-1',taxType:'Custom Tax',taxRate:'7.5'}]);
 assert.equal(items[0].taxType,'GST + Custom Tax');
 assert.equal(items[0].taxRate,25.5);
 assert.equal(quotationTotals(items).taxAmount,510);
 assert.equal(quotationTotals(items).totalAmount,2510);
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
  assert.ok(html.includes(yes),`${status}: expected ${yes}`);assert.ok(!html.includes(no),`${status}: unexpected ${no}`);assert.ok(html.includes('View quotation'));
 }
});
test('saved quotation signature hides drawing controls until the signature is cleared',async()=>{
 const source=await readFile(new URL('../src/pages/Quotations/pages/QuotationDetails.jsx',import.meta.url),'utf8');
 assert.match(source,/\{signature \? <div className="invoice-signature-controls">\s*<button[^>]*onClick=\{clearSignature\}>\s*<DeleteOutline \/> Clear/);
 assert.match(source,/: <div className="invoice-signature-editor">/);
 assert.match(source,/disabled=\{!signatureStrokes\.length\}><DeleteOutline \/> Clear/);
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
 assert.match(html,/Unit Price \(₹\) Discount \(₹\) Tax \(%\) Amount \(₹\)/);
 assert.doesNotMatch(html,/Discount \(₹\) GST \(%\)/);
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
test('quotation print uses compact A4 styling to fit a single page',async()=>{
 const source=await readFile(new URL('../src/pages/Quotations/styles/quotations.css',import.meta.url),'utf8');
 assert.match(source,/@page \{ size: A4 portrait; margin: 4mm; \}/);
 assert.match(source,/body:has\(\.quotation-details-page\) \* \{ visibility: hidden !important; \}/);
 assert.match(source,/body:has\(\.quotation-details-page\) \.quotation-print-sheet,\s*body:has\(\.quotation-details-page\) \.quotation-print-sheet \* \{ visibility: visible !important; \}/);
 assert.doesNotMatch(source,/body:has\(\.quotation-details-page\) \.app-layout-content > :not\(\.quotation-details-page\)/);
 assert.match(source,/\.quotation-details-page > :not\(\.quotation-print-sheet\) \{ display: none !important; \}/);
 assert.match(source,/\.quotation-print-sheet \.invoice-brand-header \{\s*min-height: 20mm;/);
 assert.match(source,/\.quotation-print-sheet \.invoice-items-table th,\s*\.quotation-print-sheet \.invoice-items-table td \{ padding: 1mm;/);
 assert.match(source,/\.quotation-print-sheet \.invoice-sign-box \{ min-height: 0 !important;/);
 assert.match(source,/\.quotation-print-sheet \.invoice-footer-strip \{ margin-top: 1\.5mm;/);
 assert.match(source,/\.quotation-print-sheet \.invoice-signature-controls \{ display: none !important; \}/);
});
test('new form has zero tax and preview contains no editing controls',async()=>{
 const {newQuotation}=await load('../src/pages/Quotations/components/QuotationForm.jsx');assert.equal(newQuotation().items[0].taxRate,0);assert.equal(newQuotation().items[0].taxType,'');
 const {QuotationPreview}=await load('../src/pages/Quotations/components/QuotationPreview.jsx',{'../utils/quotationCalculations':{currency:String}});
 const tree=QuotationPreview({quotation:{...form(),customer:{name:'QA'},totalAmount:100}});
 function controls(n){return typeof n==='object'&&n?['input','select','textarea','button'].includes(n.type)||[n.props?.children].flat(Infinity).some(controls):false;}
 assert.equal(controls(tree),false);assert.match(text(tree),/QA/);
});
test('quotation form retains the existing item controls and table layout',async()=>{
 const formImports={
  '../utils/quotationCalculations':{applyAdditionalDiscounts,applyAdditionalTaxes,currency,lineTotals,quotationTotals},
  '../utils/quotationValidation':{validateQuotation},
  './SearchablePicker':{SearchablePicker:()=>null},
  './ThemedSelect':{ThemedSelect:props=>({type:'ThemedSelect',props})},
  './ThemedDatePicker':{ThemedDatePicker:()=>null},
  '../../../context/FormDraftContext':{useFormDraft:()=>({clear:()=>{}}),useDraftState:(_key,_slot,initial)=>[typeof initial==='function'?initial():initial,()=>{}]},
  '@mui/material':{ListItemIcon:'ListItemIcon',Menu:'Menu',MenuItem:'MenuItem'},
 };
 const {QuotationForm}=await load('../src/pages/Quotations/components/QuotationForm.jsx',formImports);
 const products=[
  {id:2,name:'Product',taxCategory:'GST',taxRate:18,discountAllowed:true,discountPercentage:5},
  {id:3,name:'Apple Macbook',code:'PR-1'},
  {id:4,name:'Dell Laptop',code:'PR-2'},
 ];
 const tree=QuotationForm({products});
 const html=text(tree);
 assert.match(html,/Discount \(%\)/);
 const source=await readFile(new URL('../src/pages/Quotations/components/QuotationForm.jsx',import.meta.url),'utf8');
 assert.match(source,/<strong>Actions<\/strong><button type="button" className="quote-items-actions-trigger ibms-row-actions-trigger" aria-label="Items actions"/);
 for(const action of ['Add tax','Add discount','Add item','Add charge'])assert.ok(source.includes(action));
 assert.match(source,/className="quote-items-actions-menu ibms-row-actions-menu" role="menu"/);
 assert.match(source,/<SearchablePicker className="quote-product-picker" ariaLabel="Product or service"/);
 assert.match(source,/placeholder="Select product"/);
 assert.doesNotMatch(source,/placeholder="Search product or code"/);
 assert.match(source,/<td className="quote-item-discount"><input aria-label="Product discount" readOnly value=\{!item\.productId \? '' : item\.discountAllowed && Number\(item\.discountRate\) > 0 \? `\$\{Number\(item\.discountRate\)\}%` : 'N\/A'\} \/><\/td>/);
 assert.match(source,/discountAllowed = product\.discountAllowed === true \|\| product\.DiscountAllowed === true/);
 assert.match(source,/discountRate,\s*discountAmount: 0,\s*discountAllowed: discountAllowed && discountRate > 0/);
 assert.match(source,/if \(!product\) return patchItem\(index, \{ productId, quantity: productId \? 1 : 0 \}\)/);
 assert.match(source,/quantity: 1,\s*unitPrice: product\.price/);
 assert.match(source,/<td><input className="quote-item-tax" aria-label="Product tax" readOnly value=\{itemTaxLabel\(item\)\} \/><\/td>/);
 const inputs=[];
 const selects=[];
 const pickers=[];
 const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='input')inputs.push(node.props);if(node.type?.name==='ThemedSelect')selects.push(node.props);if(node.type?.name==='SearchablePicker')pickers.push(node.props);[node.props?.children].flat(Infinity).forEach(visit);};
 visit(tree);
 for(const label of ['Product description','Unit price','Product discount','Product tax'])assert.equal(inputs.find(input=>input['aria-label']===label)?.value,'');
 const picker=pickers.find(props=>props.ariaLabel==='Product or service');
 assert.equal(picker.placeholder,'Select product');
 assert.equal(picker.showDropdownIcon,true);
 assert.deepEqual(picker.items.map(picker.getLabel).sort(),['Apple Macbook (PR-1)','Dell Laptop (PR-2)','Product']);
 assert.ok(picker.getSearchText(products[0]).includes('Product'));
 const pickerSource=await readFile(new URL('../src/pages/Quotations/components/SearchablePicker.jsx',import.meta.url),'utf8');
 assert.match(pickerSource,/return labelA.localeCompare\(labelB\)/);
});
test('quotation tax type dropdown can add an additional tax row',async()=>{
 const source=await readFile(new URL('../src/pages/Quotations/components/QuotationForm.jsx',import.meta.url),'utf8');
 assert.match(source,/const rowTaxOptions = \[\.\.\.taxTypeOptions, \{ id: addTaxOption, name: '\+ Add tax' \}\]/);
 assert.match(source,/onChange=\{taxType => taxType === addTaxOption \? addTax\(\) : updateTaxRow\(row\.id, \{ taxType \}\)\}/);
 assert.match(source,/row\.taxType === 'CGST' \|\| row\.taxType === 'SGST' \? splitTaxRates : standardTaxRates/);
 assert.match(source,/className="quote-charge-tax-rate-picker" label="Tax rate"/);
 assert.match(source,/label: 'Customize tax'/);
 assert.match(source,/row\.customTax \? <input className="quote-charge-tax-custom-rate" aria-label="Custom tax rate" type="number" min="0" max="100" step="0\.01"/);
 assert.match(source,/taxRate => taxRate === customRateOption \? updateTaxRow\(row\.id, \{ customTax: true, taxRate: '' \}\)/);
 assert.match(source,/if \(data\.taxType !== undefined\) \{\s*next\.taxRate = data\.taxType === row\.taxType \? row\.taxRate : '';\s*next\.customTax = false;/);
 assert.match(source,/const itemTaxLabel = item => \{\s*if \(!item\.productId\) return '';\s*const baseTax = `\$\{item\.taxType \|\| 'GST'\} \$\{Number\(item\.taxRate\) \|\| 0\}%`;\s*const additionalTaxes = taxRows\s*\.filter\(tax => String\(tax\.itemId\) === String\(item\.id\) && tax\.taxType && tax\.taxRate !== ''\)\s*\.map\(tax => `\$\{tax\.taxType\} \$\{Number\(tax\.taxRate\) \|\| 0\}%`\);\s*return \[baseTax, \.\.\.additionalTaxes\]\.join\(' \+ '\);\s*\}/);
 const taxCell=source.match(/<td><input className="quote-item-tax" aria-label="Product tax"[^]*?<\/td>/)?.[0];
 assert.ok(taxCell);
 assert.match(taxCell,/value=\{itemTaxLabel\(item\)\}/);
 assert.doesNotMatch(taxCell,/<ThemedSelect/);
});
test('searchable quotation dropdowns render above clipped containers and stay within the viewport',async()=>{
 const source=await readFile(new URL('../src/pages/Quotations/components/SearchablePicker.jsx',import.meta.url),'utf8');
 assert.match(source,/import \{ createPortal \} from 'react-dom'/);
 assert.match(source,/return dropdownPosition\(anchor\.getBoundingClientRect\(\)/);
 assert.match(source,/className="quote-picker-menu" role="listbox" style=\{\{ position: 'fixed', \.\.\.position \}\}/);
});
test('themed quotation dropdown options use compact text without individual borders',async()=>{
 const source=await readFile(new URL('../src/pages/Quotations/styles/quotations.css',import.meta.url),'utf8');
 assert.match(source,/.quote-items-table input,\.quote-item-select \.quote-themed-select-trigger\{box-sizing:border-box;height:38px;min-height:38px;padding:7px 10px\}/);
 assert.match(source,/.quote-items-table td\.quote-item-discount>input\{box-sizing:border-box;width:min\(100%,130px\);height:38px;min-height:38px;padding:7px 10px\}/);
 assert.match(source,/.quote-items-table td>\.quote-item-tax\{width:min\(100%,120px\)\}/);
 assert.match(source,/.quote-items-table td:nth-child\(6\)\{display:table-cell;min-width:132px\}/);
 assert.match(source,/.quote-item-select \.quote-themed-select-trigger\{font-size:\.74rem\}/);
 assert.match(source,/.quote-item-select \.quote-themed-select-trigger>span:first-child\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/);
 assert.match(source,/.quote-items-table th:nth-child\(6\),\.quote-items-table td:nth-child\(6\)\{width:10%;min-width:100px\}/);
 assert.match(source,/.quote-items-table th:nth-child\(5\),\.quote-items-table td:nth-child\(5\)\{width:10%\}/);
 assert.doesNotMatch(source,/quote-tax-charges-layout/);
 assert.match(source,/.quote-themed-select-menu button\{min-height:28px;margin:0;padding:5px 8px;border:0;[^}]*font-size:\.72rem/);
 assert.match(source,/.quote-themed-select-menu button\.selected\{background:#f8eee8;color:var\(--primary\)\}/);
 const form=await readFile(new URL('../src/pages/Quotations/components/QuotationForm.jsx',import.meta.url),'utf8');
 assert.match(form,/<h2>Additional charges<\/h2>/);
 assert.match(form,/<Add \/> Add charge/);
});

test('Save Draft stays disabled for incomplete quotations and guards direct submission',async()=>{
 let seeded;
 const saved=[];
 const imports={
  '../utils/quotationCalculations':{applyAdditionalDiscounts,applyAdditionalTaxes,currency,lineTotals,quotationTotals},
  '../utils/quotationValidation':{validateQuotation},
  '../../../context/FormDraftContext':{
   useFormDraft:()=>({clear:()=>{}}),
   useDraftState:(_key,slot,initial)=>[slot==='form' ? seeded : typeof initial==='function'?initial():initial,()=>{}],
  },
 };
 const {QuotationForm,newQuotation}=await load('../src/pages/Quotations/components/QuotationForm.jsx',imports);
 const find=(node,predicate)=>{
  if(!node || typeof node!=='object')return undefined;
  if(predicate(node))return node;
  return [node.props?.children].flat(Infinity).map(child=>find(child,predicate)).find(Boolean);
 };
 const render=()=>QuotationForm({initial:seeded,onSave:value=>saved.push(value)});
 for(const value of [newQuotation(),{...newQuotation(),notes:'Entered notes'},
  {...newQuotation(),customerId:'1'}, {...form(),customerId:''}, {...form(),items:[]},
  {...form(),validUntil:'2026-09-27'}, {...form(),items:[{...form().items[0],quantity:-1}]}]){
  seeded=value;
  const save=find(render(),n=>n.type==='button' && text(n).trim()==='Save Draft');
  assert.ok(save);
  assert.equal(save.props.disabled,true);
  save.props.onClick();
  assert.equal(saved.length,0);
 }
 seeded=form();
 let save=find(render(),n=>n.type==='button' && text(n).trim()==='Save Draft');
 assert.equal(save.props.disabled,false);
 save.props.onClick();
 assert.equal(saved.length,1);
 assert.equal(saved[0].customerId,'1');
 seeded={...form(),items:[...form().items,{productId:'',quantity:0,unitPrice:0,taxRate:0}]};
 save=find(render(),n=>n.type==='button' && text(n).trim()==='Save Draft');
 assert.equal(save.props.disabled,true);
 seeded=form();
 const readonly=QuotationForm({initial:seeded,readOnly:true,onSave:value=>saved.push(value)});
 assert.equal(find(readonly,n=>n.type==='button' && text(n).trim()==='Save Draft'),undefined);
});
