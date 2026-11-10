import { customerTaxRegistrationType, customerTaxRegistrationLabel } from '../src/pages/Customers/utils/customerTaxRegistration.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCustomerResponse, createCustomerRequest, createUpdateCustomerRequest } from '../../billing-contracts/customer.contracts.js';
const pan = 'ABCDE1234F';
const gstin = '36ABCDE1234F1Z8';

test('PAN-only unregistered customer round-trips without acquiring a GSTIN', () => {
  const created = createCustomerRequest({name:'QA Tax Customer',taxRegistrationType:'non-gst',pan,currency:'INR'});
  assert.equal(created.taxId,pan);
  const loaded = parseCustomerResponse({id:44,...created});
  assert.equal(loaded.gstin,'');
  assert.equal(loaded.pan,pan);
  assert.equal(createUpdateCustomerRequest({...loaded,name:'QA Renamed Customer'}).taxId,pan);
});
test('real GSTIN still maps correctly with its derived PAN', () => {
  const loaded = parseCustomerResponse({id:44,taxId:gstin});
  assert.equal(loaded.gstin,gstin); assert.equal(loaded.pan,pan);
});
test('explicit unregistered payload never falls back to a stale GSTIN', () => {
  for(const build of [createCustomerRequest,createUpdateCustomerRequest]) {
    assert.equal(build({taxRegistrationType:'non-gst',pan,taxId:gstin,gstin}).taxId,pan);
    assert.equal(build({taxRegistrationType:'unregistered',taxId:gstin,gstin}).taxId,null);
  }
});
test('backend registration status and blank tax fields survive parsing', () => {
  const loaded = parseCustomerResponse({Id:44,TaxId:null,TaxRegistration:'Unregistered'});
  assert.equal(loaded.gstin,'');assert.equal(loaded.pan,'');assert.equal(loaded.taxRegistrationType,'Unregistered');
});

test('overview and editor resolve PAN-only and GSTIN customers to the same registration status', () => {
  for (const values of [{ id: 8, taxId: 'MOCOS6899N' }, { id: 8, pan: 'MOCOS6899N' }, parseCustomerResponse({ id: 8, taxId: 'MOCOS6899N' })]) {
    assert.equal(customerTaxRegistrationType(values), 'non-gst');
    assert.equal(customerTaxRegistrationLabel(values), 'Non-GST / Unregistered');
  }
  assert.equal(customerTaxRegistrationType({ taxId: gstin }), 'gst');
  assert.equal(customerTaxRegistrationLabel({ taxId: gstin }), 'GST Registered');
  assert.equal(customerTaxRegistrationLabel({ taxId: ` ${gstin.toLowerCase()} ` }), 'GST Registered');
});

test('explicit registration takes precedence over conflicting legacy tax identifiers', () => {
  for (const values of [{ taxRegistrationType: 'non-gst', taxId: gstin }, { taxRegistration: 'Unregistered', gstin }, { TaxRegistration: 'Unregistered' }]) {
    assert.equal(customerTaxRegistrationLabel(values), 'Non-GST / Unregistered');
  }
  for (const values of [{ taxRegistrationType: 'gst' }, { taxRegistration: ' Registered ', taxId: pan }, { TaxRegistrationType: 'Registered' }]) {
    assert.equal(customerTaxRegistrationLabel(values), 'GST Registered');
  }
});

test('blank and unknown registration follow existing editor defaults without modifying source data', () => {
  assert.equal(customerTaxRegistrationLabel({ id: 8, taxId: null }), 'Non-GST / Unregistered');
  assert.equal(customerTaxRegistrationType({}), '');
  assert.equal(customerTaxRegistrationType(null), '');
  assert.equal(customerTaxRegistrationLabel(null), '—');
  assert.equal(customerTaxRegistrationLabel({}), '—');
  assert.equal(customerTaxRegistrationLabel({ taxId: 'unknown' }), '—');
  assert.equal(customerTaxRegistrationType({ taxRegistrationType: 'Other', taxId: gstin }), 'other');
  const values = Object.freeze({ id: 8, taxId: pan, paymentTerms: '40' });
  customerTaxRegistrationLabel(values);
  assert.deepEqual(values, { id: 8, taxId: pan, paymentTerms: '40' });
});