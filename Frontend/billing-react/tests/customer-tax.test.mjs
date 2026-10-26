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
