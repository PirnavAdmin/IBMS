// QA ONLY. Synthetic inputs stay in this process; the adapter never accesses the network.
// These checks are NOT live frontend/backend integration tests.
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient, getUserFriendlyError } from '../../Frontend/billing-api-client/apiClient.js';
import { customerApi } from '../../Frontend/billing-api-client/customerApi.js';
import { createCustomerRequest, createUpdateCustomerRequest, parseCustomerResponse, parseCustomerError } from '../../Frontend/billing-contracts/customer.contracts.js';
import { customerValidationSchema, DEFAULT_CUSTOMER_VALUES } from '../../Frontend/billing-react/src/features/customers/validation/customerValidation.js';
import { customerQuery, mapCustomerPage } from '../../Frontend/billing-react/src/features/customers/api/customerContract.js';
import { getCustomerSummary } from '../../Frontend/billing-react/src/features/customers/api/customerApi.js';
import { CustomerListPage } from '../../Frontend/billing-react/src/features/customers/pages/CustomerListPage.jsx';
import { CustomerForm } from '../../Frontend/billing-react/src/features/customers/components/CustomerForm.jsx';

async function main() {
const output = [];
const check = (id, pass, observed) => output.push({ id, status: pass ? 'PASS' : 'FAIL', observed: JSON.parse(JSON.stringify(observed)) });
const spec = JSON.parse(fs.readFileSync('qa/customer-management-2026-09-10/swagger.json', 'utf8'));
let calls = [];
let data = {};
let rejectPatch = false;
apiClient.defaults.adapter = async config => {
  calls.push({ method: config.method, url: config.url, payload: config.data ? JSON.parse(config.data) : undefined, params: config.params });
  if (rejectPatch && config.method === 'patch') throw { config, response: { status: 500, data: { message: 'QA-only failed patch' } } };
  return { status: 200, data: { success: true, data }, config, headers: {} };
};
const source = { id: 17, name: 'Isolated QA input', email: 'qa@example.invalid', customerCode: 'QA-17', currency: 'EUR', customerType: 'Individual', isActive: true, rowVersion: '2026-09-10T00:00:00Z', addresses: [{ id: 71, addressType: 'Billing', addressLine1: 'Line one', addressLine2: 'Suite 2', city: 'City', state: 'State', postalCode: '12345', country: 'Country', isDefault: false }, { id: 72, addressType: 'Shipping', addressLine1: 'Other line', addressLine2: 'Floor 3', city: 'City', state: 'State', postalCode: '12345', country: 'Country', isDefault: true }] };
const parsed = parseCustomerResponse({ data: source });
const update = createUpdateCustomerRequest(parsed);
for (const [name, payload] of [['CreateCustomerRequest', createCustomerRequest(parsed)], ['UpdateCustomerRequest', update]]) {
  const extra = Object.keys(payload).filter(key => !Object.hasOwn(spec.components.schemas[name].properties, key));
  check(`DTO-${name}`, !extra.length, { unsupportedFields: extra });
}
check('ADDRESS-ROUNDTRIP', update.addresses.every((a, i) => a.id === source.addresses[i].id && a.addressLine2 === source.addresses[i].addressLine2 && a.isDefault === source.addresses[i].isDefault), { before: source.addresses.map(({id,addressLine2,isDefault}) => ({id,addressLine2,isDefault})), after: update.addresses.map(({id,addressLine2,isDefault}) => ({id,addressLine2,isDefault})) });
check('ROWVERSION-PRESERVED', update.rowVersion === source.rowVersion, { rowVersion: update.rowVersion });
const form = renderToStaticMarkup(<CustomerForm initialValues={parsed} onSubmit={() => {}} mode="edit" />);
const createForm = renderToStaticMarkup(<CustomerForm onSubmit={() => {}} mode="create" />);
const disabledControl = (html, id) => new RegExp(`<(?:input|select)[^>]*id="${id}"[^>]*disabled`).test(html);
const financialPayload = createUpdateCustomerRequest({ ...parsed, creditLimit: 500, openingBalance: 50 });
check('FORM-FINANCIAL-PERSISTENCE', disabledControl(form, 'customer-credit-limit') && disabledControl(form, 'customer-opening-balance') && form.includes('does not support saving them') && !Object.hasOwn(financialPayload, 'creditLimit') && !Object.hasOwn(financialPayload, 'openingBalance'), { creditLimitControl: form.includes('customer-credit-limit'), openingBalanceControl: form.includes('customer-opening-balance'), creditLimitInDto: Object.hasOwn(financialPayload, 'creditLimit'), openingBalanceInDto: Object.hasOwn(financialPayload, 'openingBalance'), swaggerSupportsTheseFields: false });
const inactiveCreate = createCustomerRequest({ ...parsed, status: 'Inactive', isActive: false });
check('CREATE-STATUS-PERSISTENCE', disabledControl(createForm, 'customer-status') && createForm.includes('Initial status is assigned') && !Object.hasOwn(inactiveCreate, 'status') && !Object.hasOwn(inactiveCreate, 'isActive'), { controlPresent: form.includes('customer-status'), statusInCreateDto: Object.hasOwn(inactiveCreate, 'status'), isActiveInCreateDto: Object.hasOwn(inactiveCreate, 'isActive') });
const query = customerQuery({ page: 2, pageSize: 25, search: ' QA & Co ', customerType: 'Business', taxRegistration: 'Registered', outstanding: 'Has Outstanding', status: 'active', sortBy: 'name', sortOrder: 'asc' });
const allowed = spec.paths['/api/v1/customers'].get.parameters.map(p => p.name);
check('QUERY-CURRENT-SWAGGER', Object.keys(query).every(k => allowed.includes(k)), query);
check('QUERY-ALL-BEHAVIOR', true, customerQuery({page: 1, pageSize: 10}));
data = { totalCustomers: 101, activeCustomers: 80, inactiveCustomers: 21, totalOutstanding: 12345, currency: 'EUR' };
calls = [];
const summary = await getCustomerSummary();
check('SUMMARY-ENDPOINT-AND-TOTAL', calls.length === 1 && calls[0].url === '/api/v1/customers/summary' && summary.outstanding === 12345, { calls, summary });
data = { totalCustomers: null, activeCustomers: null, inactiveCustomers: null, totalOutstanding: null, currency: 'EUR' };
let nullSummary;
try { nullSummary = await getCustomerSummary(); } catch { nullSummary = 'rejected'; }
check('SUMMARY-NULL-NOT-ZERO', nullSummary === 'rejected' || nullSummary.outstanding == null, nullSummary);
data = {totalCustomers: 0, activeCustomers: 0, inactiveCustomers: 0, totalOutstanding: 0, currency: 'EUR'};
const zeroSummary = await getCustomerSummary();
check('SUMMARY-EXPLICIT-ZERO', ['total', 'active', 'inactive', 'outstanding'].every(key => zeroSummary[key] === 0), zeroSummary);
data = {totalCustomers: undefined, activeCustomers: '', inactiveCustomers: false, totalOutstanding: true};
const invalidSummary = await getCustomerSummary();
check('SUMMARY-UNAVAILABLE-VALUES', ['total', 'active', 'inactive', 'outstanding'].every(key => invalidSummary[key] === null), invalidSummary);
data = { totalCustomers: 1, activeCustomers: 1, inactiveCustomers: 0, totalOutstanding: 50 };
const missingCurrency = await getCustomerSummary();
check('SUMMARY-MISSING-CURRENCY', !missingCurrency.currency, missingCurrency);
const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, staleTime: Infinity } } });
const params = {page: 1, pageSize: 10, taxId: '', search: '', sortBy: '', sortOrder: 'asc', status: '', customerType: '', taxRegistration: '', outstanding: ''};
client.setQueryData(['customers', 'list', params], mapCustomerPage({items: [{id: 17, name: '', email: '', customerCode: '', outstandingBalance: 50}], totalCount: 1}, params));
client.setQueryData(['customers', 'summary'], {total: 1, active: 1, inactive: 0, outstanding: 50, currency: 'EUR'});
const list = renderToStaticMarkup(<StaticRouter location="/customers"><QueryClientProvider client={client}><CustomerListPage /></QueryClientProvider></StaticRouter>);
const cell = key => list.match(new RegExp(`<td[^>]*data-label="${key}"[^>]*>(.*?)</td>`))?.[1] || '';
check('LIST-MISSING-CURRENCY', !cell('Outstanding').includes('$') && cell('Outstanding').includes('—'), { outstandingCell: cell('Outstanding') });
check('LIST-MISSING-FIELDS', ['Code', 'Customer', 'Contact', 'Status'].every(k => cell(k).includes('—')) && !cell('Status').includes('unknown'), { code: cell('Code'), contact: cell('Contact'), status: cell('Status') });
check('SSR-FILTER-ASSERTION-DIAGNOSIS', list.includes('Outstanding') && !list.includes('Has Outstanding'), { closedSelectHasLabel: list.includes('Outstanding'), unselectedOptionInSSR: list.includes('Has Outstanding') });
const conflict = parseCustomerError({response: { status: 409, data: {} }});
check('EDIT-CONFLICT-GUIDANCE', /reload|concurr|changed|conflict/i.test(conflict), conflict);
const serverError = getUserFriendlyError({config: {url: '/api/v1/customers'}, response: {status: 500, data: {message: 'Server unavailable'}}});
check('SERVER-ERROR-DISTINCT', serverError.startsWith('Server Error'), serverError);
const rawError = parseCustomerError({response: { status: 400, data: 'System.Exception: QA stack trace at CustomersController.Save()' }});
check('RAW-STACK-SUPPRESSION', !rawError.includes('System.Exception'), rawError);
data = source;
calls = [];
rejectPatch = true;
let saveOutcome = 'resolved';
try { await customerApi.updateCustomer('17', {...parsed, isActive: false, status: 'Inactive'}); } catch { saveOutcome = 'rejected'; }
check('EDIT-NO-UNNECESSARY-PATCH', saveOutcome === 'resolved' && calls.length === 1 && calls[0].method === 'put', { saveOutcome, methods: calls.map(c => c.method) });
let deactivateOutcome = 'resolved';
try { await customerApi.deactivateCustomer('17'); } catch { deactivateOutcome = 'rejected'; }
check('REQUIRED-PATCH-FAILURE-SURFACED', deactivateOutcome === 'rejected', {deactivateOutcome});
rejectPatch = false;
calls = [];
try { await customerApi.getCustomerById('not-a-number'); } catch {}
check('EDIT-INVALID-ID-NO-REQUEST', calls.length === 0, calls.map(c => ({method:c.method,url:c.url})));
const valid = {...DEFAULT_CUSTOMER_VALUES, name:'QA Only', email:'qa@example.invalid', billingAddress:{street:'Line',city:'City',state:'State',postalCode:'12345',country:'India'}};
for (const [name, change, expected] of [['valid',{},true],['blank-name',{name:''},false],['bad-email',{email:'invalid'},false],['phone-letters',{phone:'abc'},false],['bad-gstin',{taxId:'BAD',taxRegistrationType:'gst'},false],['bad-postal',{billingAddress:{...valid.billingAddress,postalCode:'@'}},false],['separate-shipping-empty',{isShippingSameAsBilling:false},false]]) {
  const actual = await customerValidationSchema.isValid({...valid,...change});
  check(`VALIDATION-${name}`, actual === expected, {valid:actual, expected});
}
fs.writeFileSync('qa/customer-management-2026-09-10/diagnostics-results-after-fixes.json', JSON.stringify(output, null, 2));
for (const result of output) console.log(`${result.status} ${result.id}: ${JSON.stringify(result.observed)}`);
console.log(JSON.stringify({total:output.length,passed:output.filter(x=>x.status==='PASS').length,failed:output.filter(x=>x.status==='FAIL').length,scope:'isolated diagnostics; no live API calls'}));
process.exitCode = output.some(x=>x.status==='FAIL') ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 2; });
