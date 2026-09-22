import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apiClient } from '../../billing-api-client/apiClient.js';
import { numberingService } from '../src/pages/NumberingSettings/services/numberingService.js';
import { RESET_POLICIES, numberingValidationSchema, generateNumberPreview } from '../src/pages/NumberingSettings/validation/numberingValidation.js';

test('Numbering propagates failed GET/PUT and rejects malformed success data', async () => {
  for (const method of ['get', 'put']) {
    const call = () => method === 'get' ? numberingService.getSettings() : numberingService.updateSettings({ resetPolicy: RESET_POLICIES[0] });
    await mock(method, async () => { throw new Error('Backend unavailable'); }, async () => assert.rejects(call(), /Backend unavailable/));
    await mock(method, async () => ({ success: true, data: null }), async () => assert.rejects(call(), /invalid numbering/));
    await mock(method, async () => ({ success: false, message: 'Rejected' }), async () => assert.rejects(call(), /Rejected/));
  }
});

test('Numbering maps reset policies and day tokens, preserves empty fields and validates counters', async () => {
  const input = { documentType: 'Invoice', prefix: '', suffix: '', tokens: '{DAY}-', sequenceLength: 4, nextNumber: 1 };
  for (const resetPolicy of RESET_POLICIES) {
    await mock('put', async (path, body) => {
      assert.equal(path, '/api/v1/settings/numbering');
      assert.equal(body.resetPolicy, resetPolicy.split(' (')[0]);
      assert.equal(body.tokens, '{DD}-');
      return { success: true, data: body };
    }, async () => {
      const result = await numberingService.updateSettings({ ...input, resetPolicy });
      assert.equal(result.resetPolicy, resetPolicy);
      assert.equal(result.prefix, ''); assert.equal(result.suffix, '');
      assert.equal(result.tokens, '{DAY}-');
    });
  }
  for (const nextNumber of ['', 0, 1.5, 1000000000000]) {
    await assert.rejects(numberingValidationSchema.validate({ ...input, resetPolicy: RESET_POLICIES[0], nextNumber }));
  }
  assert.equal(generateNumberPreview({ ...input, tokens: '' }).fullPreview, '0001');
});
import { chargeFromApi, chargeToApi, discountConfigurationFromApi, discountConfigurationToApi, discountRuleToApi, phase5Api, phase5Error, validateDiscountConfiguration, validateDiscountRule, validateRolePermissions } from '../src/pages/Settings/services/phase5Api.js';

const charge = { id: 42, name: ' Shipping ', code: ' ship ', description: '', type: 'Shipping', calculationType: 'Fixed', value: '12.5', taxable: true, status: 'Active', minInvoiceAmount: 100, maxChargeAmount: 20, taxCategory: 'GST' };
const rule = { id: 3, name: ' Discount ', code: ' disc ', type: 'Percentage', scope: 'LineItem', value: '5', status: 'Inactive', description: '', minInvoiceAmount: '', maxDiscountAmount: '40', startDateUtc: '2026-09-21T00:00:00Z', endDateUtc: null, applicableRole: 'ExistingBackendRole', tenantId: 999, allowManualOverride: true };
const discountConfig = { id: 8, status: 'Active', maximumType: 'Percentage', maximumValue: 50, discountType: 'Percentage', applicationLevel: 'Invoice Level', allowLineLevel: true, allowInvoiceLevel: true, enforceMaximum: true, allowManualOverride: true, requireOverrideReason: true, minimumReasonLength: 10, rowVersion: 'config-token' };
const roles = [{ id: 'manager', role: 'Manager', canApply: true, maximum: 50, canOverride: true, requiresReason: true, status: 'Active' }];
const reply = data => ({ success: true, data });
async function mock(method, handler, run) {
  const original = apiClient[method]; apiClient[method] = handler;
  try { await run(); } finally { apiClient[method] = original; }
}

test('Charges GET maps DTO and preserves optional fields, rowVersion, and unknown status', async () => {
  await mock('get', async path => { assert.equal(path, '/api/v1/settings/charges'); return reply([{ id: 42, name: 'Shipping', code: 'SHIP', chargeType: 'Shipping', calculationType: 'Fixed', amount: 12.5, isTaxable: true, status: 'string', minInvoiceAmount: 100, maxChargeAmount: 20, taxCategory: 'GST', rowVersion: 'base64-token' }]); }, async () => {
    const [actual] = await phase5Api.getCharges(); assert.equal(actual.value, 12.5); assert.equal(actual.status, 'string'); assert.equal(actual.taxCategory, 'GST'); assert.equal(actual.description, ''); assert.equal(actual.rowVersion, 'base64-token');
  });
});
test('Charges POST sends exact create DTO without tenant or UI fields', async () => {
  await mock('post', async (path, body) => {
    assert.equal(path, '/api/v1/settings/charges');
    assert.deepEqual(body, { name: 'Shipping', code: 'SHIP', description: null, chargeType: 'Shipping', calculationType: 'Fixed', amount: 12.5, minInvoiceAmount: 100, maxChargeAmount: 20, isTaxable: true, taxCategory: 'GST', status: 'Active' });
    return reply({ ...body, id: 42 });
  }, async () => assert.equal((await phase5Api.createCharge(charge)).id, 42));
});
test('Charges PUT sends current rowVersion and stores the replacement version', async () => {
  await mock('put', async (path, body) => { assert.equal(path, '/api/v1/settings/charges/42'); assert.deepEqual(body, { ...chargeToApi(charge), status: 'Inactive', rowVersion: 'base64-token' }); return reply({ ...body, id: 42, rowVersion: 'new-base64-token' }); }, async () => { const actual = await phase5Api.updateCharge({ ...charge, status: 'Inactive', rowVersion: 'base64-token' }); assert.equal(actual.status, 'Inactive'); assert.equal(actual.rowVersion, 'new-base64-token'); });
});
test('Charges status normalizes backend case without disguising unknown values', () => {
  for (const [input, expected] of [['active', 'Active'], ['INACTIVE', 'Inactive'], ['string', 'string']]) assert.equal(chargeFromApi({ status: input }).status, expected);
});
test('Charges calculate uses confirmed DTO and strips unrelated fields', async () => {
  await mock('post', async (path, body) => { assert.equal(path, '/api/v1/settings/charges/calculate'); assert.deepEqual(body, { subtotal: 100, selectedChargeIds: [42], selectedChargeCodes: undefined }); return reply({ totalCharges: 12.5 }); }, async () => assert.equal((await phase5Api.calculateCharges({ subtotal: 100, selectedChargeIds: [42], tenantId: 999 })).totalCharges, 12.5));
});
test('Discount GET keeps pagination, empty lists and confirmed rule fields', async () => {
  await mock('get', async (path, options) => { assert.equal(path, '/api/v1/discounts/rules'); assert.deepEqual(options.params, { page: 2, pageSize: 10 }); return reply({ items: [rule], pageNumber: 2, totalPages: 3 }); }, async () => assert.equal((await phase5Api.getDiscountRules(2, 10)).items[0].scope, 'LineItem'));
  await mock('get', async () => reply({ items: [], totalPages: 0 }), async () => assert.deepEqual((await phase5Api.getDiscountRules()).items, []));
});
test('Discount POST allowlists create fields; does not send global settings, tenant or status', async () => {
  await mock('post', async (path, body) => {
    assert.equal(path, '/api/v1/discounts/rules');
    assert.deepEqual(body, { name: 'Discount', description: null, value: 5, minInvoiceAmount: null, maxDiscountAmount: 40, startDateUtc: rule.startDateUtc, endDateUtc: null, applicableRole: 'ExistingBackendRole', code: 'DISC', type: 'Percentage', scope: 'LineItem' });
    return reply({ ...body, id: 3 });
  }, async () => assert.equal((await phase5Api.createDiscountRule(rule)).id, 3));
});
test('Discount PUT omits immutable code/type/scope and keeps optional restrictions', async () => {
  await mock('put', async (path, body) => {
    assert.equal(path, '/api/v1/discounts/rules/3'); assert.equal(body.status, 'Inactive');
    for (const key of ['id', 'code', 'type', 'scope', 'tenantId', 'allowManualOverride']) assert.equal(Object.hasOwn(body, key), false);
    assert.equal(body.maxDiscountAmount, 40); return reply({ ...rule, ...body });
  }, async () => assert.equal((await phase5Api.updateDiscountRule(3, rule)).value, 5));
});
test('Discount GET by ID and DELETE use exact routes', async () => {
  await mock('get', async path => { assert.equal(path, '/api/v1/discounts/rules/3'); return reply(rule); }, async () => assert.equal((await phase5Api.getDiscountRule(3)).id, 3));
  await mock('delete', async path => { assert.equal(path, '/api/v1/discounts/rules/3'); return reply(true); }, async () => assert.equal(await phase5Api.deleteDiscountRule(3), true));
});
test('Discount validation rejects invalid numbers, percentages, dates and missing names', () => {
  assert.deepEqual(validateDiscountRule(rule), {});
  for (const value of ['', 0, -1, 101, 'bad', Infinity]) assert.ok(validateDiscountRule({ ...rule, value }).value);
  assert.deepEqual(validateDiscountRule({ ...rule, type: 'FixedAmount', value: 101 }), {});
  assert.ok(validateDiscountRule({ ...rule, name: ' ' }).name);
  assert.ok(validateDiscountRule({ ...rule, minInvoiceAmount: -1 }).minInvoiceAmount);
  assert.ok(validateDiscountRule({ ...rule, endDateUtc: '2020-01-01T00:00:00Z' }).endDateUtc);
  assert.equal(discountRuleToApi({ ...rule, maxDiscountAmount: '' }).maxDiscountAmount, null);
});
test('Discount settings GET maps its latest rowVersion and PUT sends the exact configuration DTO', async () => {
  await mock('get', async path => { assert.equal(path, '/api/v1/settings/discounts'); return reply(discountConfig); }, async () => assert.equal((await phase5Api.getDiscountConfiguration()).rowVersion, 'config-token'));
  await mock('put', async (path, body) => { assert.equal(path, '/api/v1/settings/discounts'); assert.deepEqual(body, discountConfigurationToApi(discountConfig)); return reply({ ...discountConfig, rowVersion: 'new-config-token' }); }, async () => assert.equal((await phase5Api.updateDiscountConfiguration(discountConfig)).rowVersion, 'new-config-token'));
  assert.equal(discountConfigurationFromApi({ ...discountConfig, status: 'active' }).status, 'Active');
});
test('Discount settings validation requires valid statuses, values and override reason length', () => {
  assert.deepEqual(validateDiscountConfiguration(discountConfig), {});
  assert.ok(validateDiscountConfiguration({ ...discountConfig, maximumValue: 101 }).maximumValue);
  assert.ok(validateDiscountConfiguration({ ...discountConfig, status: 'string' }).status);
  assert.ok(validateDiscountConfiguration({ ...discountConfig, minimumReasonLength: 0 }).minimumReasonLength);
});
test('Discount role permissions use the canonical roles payload and validation', async () => {
  await mock('get', async path => { assert.equal(path, '/api/v1/settings/discounts/roles'); return reply(roles); }, async () => assert.equal((await phase5Api.getDiscountRolePermissions())[0].role, 'Manager'));
  await mock('put', async (path, body) => { assert.equal(path, '/api/v1/settings/discounts/roles'); assert.deepEqual(body, { roles }); return reply(roles); }, async () => assert.equal((await phase5Api.updateDiscountRolePermissions(roles))[0].id, 'manager'));
  assert.ok(validateRolePermissions([{ ...roles[0], status: 'string' }]).manager);
});
test('Validate-max uses the backend request and returns its authoritative message', async () => {
  await mock('post', async (path, body) => { assert.equal(path, '/api/v1/settings/discounts/validate-max'); assert.deepEqual(body, { role: 'Manager', value: 35, isManualOverride: false, overrideReason: null, discountType: 'Percentage' }); return reply({ isValid: false, exceedsMaximum: true, requiresOverride: true, requiresReason: false, roleMaximum: 30, configuredMaximum: 50, message: 'Requested discount exceeds the maximum allowed for the selected role.' }); }, async () => assert.match((await phase5Api.validateMaximumDiscount({ role: 'Manager', value: 35, discountType: 'Percentage' })).message, /exceeds/));
});
test('Concurrency conflicts retain a refresh-and-retry message', async () => {
  await mock('put', async () => { throw { response: { status: 409, data: { errorCode: 'CONCURRENCY_CONFLICT', message: 'stale row version' } } }; }, async () => await assert.rejects(phase5Api.updateCharge({ ...charge, rowVersion: 'stale-token' }), /conflicting update/));
});
for (const status of [400, 401, 403, 404, 409, 500]) {
  test(`Both services surface understandable HTTP ${status} errors`, async () => {
    await mock('get', async () => { throw { response: { status, data: { errors: { field: ['Check the supplied value.'] } } } }; }, async () => {
      for (const operation of [phase5Api.getCharges, phase5Api.getDiscountRules]) await assert.rejects(operation(), error => {
        assert.ok(error.message.length > 10); assert.doesNotMatch(error.message, /\[object Object\]|AxiosError/); return true;
      });
    });
  });
}
test('Network errors, malformed responses and application failures never become mock data', async () => {
  await mock('get', async () => { throw new Error('Network Error'); }, async () => {
    await assert.rejects(phase5Api.getCharges(), /Unable to reach/); await assert.rejects(phase5Api.getDiscountRules(), /Unable to reach/);
  });
  await mock('get', async () => ({ success: false, errors: [{ unsafe: true }], message: 'Validation failed.' }), async () => assert.rejects(phase5Api.getCharges(), /Validation failed/));
  await mock('get', async () => ({}), async () => assert.rejects(phase5Api.getDiscountRules(), /unexpected response/));
  assert.match(phase5Error({ response: { status: 409, data: { message: 'The database operation was expected to affect 1 row(s)' } } }), /changes have been kept/);
});
test('Settings screens and service have no runtime mock dependency', () => {
  for (const file of ['DiscountConfiguration.jsx', 'DiscountRules.jsx', 'ChargesConfiguration.jsx', 'services/phase5Api.js']) {
    const source = readFileSync(new URL(`../src/pages/Settings/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /settingsMockService|discountMock|chargesMock|fakeApi|fakePromise/);
  }
});
