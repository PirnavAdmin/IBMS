import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerRequest, createUpdateCustomerRequest, parseCustomerResponse } from '../../billing-contracts/customer.contracts.js';

test('createCustomerRequest preserves Organization customerType', () => {
  const reqLower = createCustomerRequest({ name: 'Dakshiii', customerType: 'organization' });
  assert.equal(reqLower.customerType, 'Organization');

  const reqTitle = createCustomerRequest({ name: 'Dakshiii', customerType: 'Organization' });
  assert.equal(reqTitle.customerType, 'Organization');

  const reqInd = createCustomerRequest({ name: 'Dakshiii', customerType: 'individual' });
  assert.equal(reqInd.customerType, 'Individual');

  const reqBiz = createCustomerRequest({ name: 'Dakshiii', customerType: 'business' });
  assert.equal(reqBiz.customerType, 'Business');
});

test('createUpdateCustomerRequest preserves Organization customerType', () => {
  const updateReq = createUpdateCustomerRequest({ name: 'Dakshiii', customerType: 'organization' });
  assert.equal(updateReq.customerType, 'Organization');
});

test('parseCustomerResponse outputs TitleCase customerType for list and details', () => {
  const parsed = parseCustomerResponse({ id: 18, name: 'Dakshiii', customerType: 'Organization' });
  assert.equal(parsed.customerType, 'Organization');
  assert.equal(parsed.CustomerType, 'Organization');

  const parsedLower = parseCustomerResponse({ id: 19, name: 'Dakshiii', customerType: 'organization' });
  assert.equal(parsedLower.customerType, 'Organization');
  assert.equal(parsedLower.CustomerType, 'Organization');
});
