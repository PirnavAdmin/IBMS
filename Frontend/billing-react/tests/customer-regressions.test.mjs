import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, getUserFriendlyError } from '../../billing-api-client/apiClient.js';
import { customerApi } from '../../billing-api-client/customerApi.js';
import { createCustomerRequest, createUpdateCustomerRequest, parseCustomerResponse, parseCustomerError, shippingFromBilling } from '../../billing-contracts/customer.contracts.js';
import { getCustomerById, updateCustomer, deactivateCustomer } from '../src/pages/Customers/api/customerService.js';

// Isolated adapters only: these tests never issue HTTP requests.
let calls;
beforeEach(() => {
  calls = [];
  apiClient.defaults.adapter = async config => {
    calls.push(config);
    return { config, headers: {}, status: 200, data: { success: true, data: null } };
  };
});
const address = (id, addressType, isDefault) => ({ id, addressType, addressLine1: 'Main Street', addressLine2: 'Suite 2', city: 'City', state: null, postalCode: null, country: 'IN', isDefault });
const record = () => ({ id: 7, name: 'QA', email: 'qa@example.invalid', isActive: true, rowVersion: '2026-09-10T12:00:00.1234567Z', state: 'Flat state', addresses: [address(11, 'Billing', false), address(12, 'Shipping', true), address(13, 'Shipping', false)] });

test('B01: unchanged edit preserves every address, nulls, defaults, flat fields and rowVersion', () => {
  const raw = record();
  const dto = createUpdateCustomerRequest(parseCustomerResponse({ data: raw }));
  assert.deepEqual(dto.addresses, raw.addresses);
  assert.equal(dto.state, raw.state);
  assert.equal(dto.rowVersion, raw.rowVersion);
});

test('B01: explicit address changes update only the chosen field and preserve extra addresses', () => {
  const raw = record();
  const data = parseCustomerResponse(raw);
  data.isShippingSameAsBilling = false;
  data.billingAddress = { ...data.billingAddress, addressLine2: '' };
  const dto = createUpdateCustomerRequest(data);
  assert.deepEqual(dto.addresses, [{ ...raw.addresses[0], addressLine2: null }, ...raw.addresses.slice(1)]);
});

test('B01: Same as Billing copies both lines without copying billing identity/default', () => {
  const raw = record();
  const data = parseCustomerResponse(raw);
  data.billingAddress.city = 'Changed City';
  data.billingAddress.addressLine2 = 'Floor 9';
  const shipping = shippingFromBilling(data.billingAddress, data.shippingAddress);
  assert.equal(shipping.id, 12);
  assert.equal(shipping.isDefault, true);
  assert.equal(shipping.addressLine2, 'Floor 9');
  const dto = createUpdateCustomerRequest({ ...data, shippingAddress: shipping, isShippingSameAsBilling: true });
  assert.equal(dto.addresses[1].id, 12);
  assert.equal(dto.addresses[1].isDefault, true);
  assert.equal(dto.addresses[1].city, 'Changed City');
  assert.deepEqual(dto.addresses[2], raw.addresses[2]);
});

test('B01: unchanged edit does not synthesize a missing shipping address', () => {
  const raw = { ...record(), addresses: [address(11, 'Billing', true)] };
  assert.deepEqual(createUpdateCustomerRequest(parseCustomerResponse(raw)).addresses, raw.addresses);
});

test('B01: omitted GET address collection is not replaced by a name-only edit', () => {
  const raw = { id: 7, name: 'QA', address: 'Main Street', city: 'City', state: 'State', country: 'IN' };
  const dto = createUpdateCustomerRequest({ ...parseCustomerResponse(raw), name: 'Renamed' });
  assert.equal(Object.hasOwn(dto, 'addresses'), false);
  assert.equal(dto.address, 'Main Street');
});

test('B02/B03: write DTO excludes unsupported financial fields and create status', () => {
  const values = { ...parseCustomerResponse(record()), creditLimit: 50, openingBalance: 20, status: 'Inactive', isActive: false };
  const post = createCustomerRequest(values);
  const put = createUpdateCustomerRequest(values);
  for (const dto of [post, put]) for (const key of ['creditLimit', 'openingBalance']) assert.equal(Object.hasOwn(dto, key), false);
  assert.equal(Object.hasOwn(post, 'status'), false);
  assert.equal(Object.hasOwn(post, 'isActive'), false);
  assert.equal(put.isActive, false);
});

test('B07: conflict fallback recommends reload while explicit duplicate validation survives', () => {
  assert.match(parseCustomerError({ response: { status: 409, data: {} } }), /changed|conflict/);
  assert.match(parseCustomerError({ response: { status: 409, data: {} } }), /Reload/);
  assert.match(parseCustomerError({ response: { status: 409, data: { errors: { email: ['Email already exists.'] } } } }), /Email already exists/);
});

test('B08: Customer HTTP errors are not network errors; unrelated modules keep existing behavior', () => {
  for (const status of [500, 502, 503]) {
    const error = { config: { url: '/api/v1/customers' }, response: { status, data: 'ERR_NGROK_3200 <html>internal</html>' } };
    assert.match(getUserFriendlyError(error), /^Server Error/);
    assert.equal(getUserFriendlyError({ ...error, config: { url: '/api/other-module' } }), 'Network Error');
  }
  assert.equal(getUserFriendlyError({ config: { url: '/api/v1/customers' }, code: 'ERR_NETWORK' }), 'Network Error');
});

test('B09: raw and structured diagnostic bodies are suppressed, safe validation retained', () => {
  for (const text of ['<html>private</html>', 'System.Exception: failure at Controller.Save()', 'SELECT password FROM users', 'SQLSTATE 42000', 'Violation of UNIQUE KEY constraint customer_ix', 'Traceback: server failed', '&lt;script&gt;alert(1)&lt;/script&gt;']) {
    for (const data of [text, { message: text }, { errors: { customer: [text] } }]) {
      const result = parseCustomerError({ response: { status: 400, data } });
      assert.equal(result, 'Invalid customer data. Please review the highlighted fields.');
    }
  }
  assert.equal(parseCustomerError({ response: { status: 400, data: 'arbitrary server text' } }), 'Invalid customer data. Please review the highlighted fields.');
  assert.match(parseCustomerError({ response: { status: 400, data: { errors: { email: ['Enter a valid email address.'] }, message: 'Check the form.' } } }), /Enter a valid email address/);
});

test('B10: ordinary inactive edit is one PUT; PUT failure cannot resolve successfully', async () => {
  await customerApi.updateCustomer('7', { name: 'QA', isActive: false });
  assert.deepEqual(calls.map(c => [c.method, c.url]), [['put', '/api/v1/customers/7']]);
  apiClient.defaults.adapter = async config => { throw { config, response: { status: 500, data: {} } }; };
  await assert.rejects(customerApi.updateCustomer('7', {}), /Server Error/);
});

test('B10: explicit deactivate rejects HTTP and failed-envelope responses', async () => {
  apiClient.defaults.adapter = async config => { throw { config, response: { status: 500, data: {} } }; };
  await assert.rejects(customerApi.deactivateCustomer('7'), /Server Error/);
  apiClient.defaults.adapter = async config => ({ config, headers: {}, status: 200, data: { success: false, message: 'Customer could not be deactivated.' } });
  await assert.rejects(customerApi.deactivateCustomer('7'), /could not be deactivated/);
});

test('B11: active Customer clients reject invalid GET/PUT/PATCH IDs before transport', async () => {
  for (const id of ['bad', '', '0', '-1', '1.5', '1e2', ' 7 ', '2147483648', null, undefined, true]) {
    for (const operation of [() => customerApi.getCustomerById(id), () => customerApi.getCustomerDetails(id), () => customerApi.updateCustomer(id, {}), () => customerApi.deactivateCustomer(id), () => getCustomerById(id), () => updateCustomer(id, {}), () => deactivateCustomer(id)]) {
      await assert.rejects(operation(), { code: 'INVALID_ID' });
    }
  }
  assert.equal(calls.length, 0);
});
