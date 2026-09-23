import test from 'node:test';
import assert from 'node:assert/strict';
import { taxApi, taxService, taxError } from '../src/services/taxService.js';

async function mock(method, reply, run) {
  const original = taxApi[method];
  taxApi[method] = reply;
  try { await run(); } finally { taxApi[method] = original; }
}

test('Tax GET distinguishes a real empty list from malformed and failed responses', async () => {
  await mock('getSettings', async () => ({ success: true, data: { taxRates: [] } }), async () => assert.deepEqual(await taxService.list(), []));
  for (const response of [null, {}, { success: true, data: null }, { data: { taxRates: {} } }, { data: { taxRates: [null] } }, { success: false, message: 'Tax settings unavailable.' }]) {
    await mock('getSettings', async () => response, async () => assert.rejects(taxService.list()));
  }
});

test('Tax POST and PUT preserve decimal rates and cannot report malformed responses as a save', async () => {
  const values = { name: ' Reduced GST ', code: ' GST ', type: 'GST', rate: '2.75', calculation: 'Inclusive', priority: 1, effectiveFrom: '2026-09-23', effectiveTo: '', status: 'Active' };
  for (const method of ['createRate', 'updateRate']) {
    const save = () => taxService.save(values, method === 'updateRate' ? 7 : undefined);
    await mock(method, async (...args) => {
      const payload = args.at(-1);
      assert.equal(payload.rate, 2.75);
      assert.equal(payload.isInclusive, true);
      assert.equal(payload.effectiveTo, null);
      return { success: true, data: { ...payload, id: 7 } };
    }, async () => assert.equal((await save()).rate, 2.75));
    for (const response of [{}, { success: true, data: null }, { success: false, message: 'Duplicate tax code.' }]) {
      await mock(method, async () => response, async () => assert.rejects(save()));
    }
  }
});

test('Tax errors retain field validation and handle permissions, conflicts, server and network failures', () => {
  assert.equal(taxError({ response: { status: 400, data: { errors: { rate: ['Rate cannot exceed 100.'] } } } }), 'Rate cannot exceed 100.');
  for (const status of [401, 403, 404, 409, 500]) {
    const message = taxError({ response: { status, data: { message: 'SqlException at System.Database' } } });
    assert.ok(message.length > 15);
    assert.doesNotMatch(message, /SqlException|System.Database/);
  }
  assert.match(taxError(new Error('Network Error')), /connection/);
  assert.doesNotMatch(taxError({ response: { status: 400, data: { message: { stack: 'unsafe' }, errors: ['SqlException at System.Database'] } } }), /object Object|SqlException/);
});
