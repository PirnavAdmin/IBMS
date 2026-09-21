// Explicit opt-in QA: creates and deletes only records created by this run.
// Credentials are supplied through environment variables, never saved.
import assert from 'node:assert/strict';
import axios from 'axios';
import { apiClient } from '../../billing-api-client/apiClient.js';
import { authApi } from '../../billing-api-client/authApi.js';
import { phase5Api } from '../src/pages/Settings/services/phase5Api.js';

if (!process.env.IBMS_QA_EMAIL || !process.env.IBMS_QA_PASSWORD) throw new Error('Supply QA credentials through environment variables.');
const session = new Map();
globalThis.localStorage = { getItem: key => session.get(key), setItem: (key, value) => session.set(key, value), removeItem: key => session.delete(key) };
const adapter = axios.getAdapter(apiClient.defaults.adapter);
apiClient.defaults.adapter = async config => {
  try {
    const response = await adapter(config);
    console.log(config.method.toUpperCase(), config.url, response.status);
    return response;
  } catch (error) {
    console.log(config.method.toUpperCase(), config.url, error.response?.status || 'NETWORK_ERROR');
    throw error;
  }
};
let chargeId, ruleId;
try {
  await authApi.login({ email: process.env.IBMS_QA_EMAIL, password: process.env.IBMS_QA_PASSWORD });
  assert.ok(session.get('billing_auth_token'), 'Normal login must populate the auth session');
  const existing = await phase5Api.getCharges();
  console.log('Unknown charge statuses:', JSON.stringify(existing.filter(c => !['Active', 'Inactive'].includes(c.status)).map(c => ({ id: c.id, status: c.status }))));
  await phase5Api.getDiscountRules();
  const suffix = Date.now().toString(36).toUpperCase();
  const created = await phase5Api.createCharge({ name: 'QA Integration Shipping', code: `QA-SHIP-${suffix}`, type: 'Shipping', calculationType: 'Fixed', value: 12, taxable: true, status: 'Active', description: 'Temporary Phase 5 integration QA' });
  chargeId = created.id;
  assert.ok(chargeId);
  assert.equal((await phase5Api.getCharges()).find(c => c.id === chargeId).value, 12);
  try {
  let updated = await phase5Api.updateCharge({ ...created, value: 15, description: 'Temporary QA updated' });
  assert.equal(updated.value, 15);
  assert.equal((await phase5Api.getCharges()).find(c => c.id === chargeId).value, 15);
  for (const status of ['Inactive', 'Active']) {
    updated = await phase5Api.updateCharge({ ...updated, status });
    assert.equal((await phase5Api.getCharges()).find(c => c.id === chargeId).status, status);
  }
  const calculation = await phase5Api.calculateCharges({ subtotal: 100, selectedChargeIds: [chargeId] });
  assert.equal(calculation.totalCharges, 15);
  } catch (error) {
    console.log('Charge update blocked:', error.message);
    for (const status of ['Inactive', 'Active']) {
      try { await phase5Api.updateCharge({ ...created, status }); }
      catch (failure) { console.log(`Charge ${status} blocked:`, failure.message); }
    }
    assert.equal((await phase5Api.getCharges()).find(c => c.id === chargeId).value, 12);
    assert.equal((await phase5Api.calculateCharges({ subtotal: 100, selectedChargeIds: [chargeId] })).totalCharges, 12);
    process.exitCode = 1;
  }
  const rule = await phase5Api.createDiscountRule({ code: `QA-DISC-${suffix}`, name: 'QA Integration Discount', type: 'Percentage', scope: 'Invoice', value: 5, description: 'Temporary Phase 5 integration QA' });
  ruleId = rule.id;
  assert.ok(ruleId);
  assert.equal((await phase5Api.getDiscountRule(ruleId)).value, 5);
  const changed = await phase5Api.updateDiscountRule(ruleId, { ...rule, value: 6, status: 'Inactive' });
  assert.equal(changed.value, 6);
  assert.equal((await phase5Api.getDiscountRule(ruleId)).status, 'Inactive');
  console.log('Live service assertions passed.');
} catch (error) {
  console.error('QA failed:', error.message);
  process.exitCode = 1;
} finally {
  for (const [id, remove, label] of [[ruleId, phase5Api.deleteDiscountRule, 'rule'], [chargeId, phase5Api.deleteCharge, 'charge']]) {
    if (id) {
      try { await remove(id); console.log(`Cleaned up QA ${label} ${id}`); }
      catch (error) { console.error(`Cleanup failed for QA ${label} ${id}: ${error.message}`); process.exitCode = 1; }
    }
  }
  session.clear();
}
