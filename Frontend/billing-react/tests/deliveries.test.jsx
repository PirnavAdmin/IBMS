// Isolated synthetic records only. No live delivery or replay request is made.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { apiClient } from 'billing-api-client';
import { DeliveryHistory } from '../src/pages/Webhooks/DeliveryHistory';
import { deliveryService, deliveryError, mapDelivery, safeDocument } from '../src/pages/Webhooks/deliveryService';
import { webhookService } from '../src/pages/Webhooks/webhookService';

const raw = { id: 9, webhookId: 7, webhookName: 'Test Receiver', eventId: 'test_event_id', eventType: 'invoice.test', status: 'DeadLetter', attemptNumber: 5, maxAttempts: 5, responseStatusCode: 503, executionDurationMs: 90, failureReason: 'Receiver unavailable', createdAtUtc: '2026-10-15T10:00:00Z', deliveredAtUtc: null, nextRetryUtc: null,
  payloadJson: JSON.stringify({ invoiceId: 5, nested: { clientSecret: 'raw_client_secret', api_key: 'raw_api_key' }, Authorization: 'Bearer raw_token' }),
  requestHeadersJson: JSON.stringify({ Authorization: 'Bearer raw_jwt', Cookie: 'raw_cookie', 'X-IBMS-Signature': 'raw_signature', 'Content-Type': 'application/json' }),
  responseBody: JSON.stringify({ message: 'Unavailable', refreshToken: 'raw_refresh_token' }) };
const page = (items = [mapDelivery(raw)], extra = {}) => ({ items, totalCount: items.length, pageNumber: 1, pageSize: 20, totalPages: items.length ? 1 : 0, ...extra });
const envelope = data => ({ success: true, data });
async function mock(object, overrides, run) { const old = Object.fromEntries(Object.keys(overrides).map(key => [key, object[key]])); Object.assign(object, overrides); try { await run(); } finally { Object.assign(object, old); } }
async function flush(ms = 30) { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); }
const button = label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label);
async function click(el) { assert.ok(el, 'Expected clickable element'); await act(async () => el.click()); await flush(); }
async function input(el, value) { assert.ok(el); await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new window.Event('input', { bubbles: true })); el.dispatchEvent(new window.Event('change', { bubbles: true })); }); await flush(); }
const labeled = text => { const label = [...document.querySelectorAll('label')].find(el => el.textContent === text); return label ? document.getElementById(label.htmlFor) : null; };
function Location() { const value = useLocation(); return <output data-testid="location">{value.pathname + value.search}</output>; }
async function ui(overrides, run, { role = 'TenantAdmin', path = '/webhooks/deliveries?webhookId=7', webhookStatus = 'Active' } = {}) {
  await mock(deliveryService, { list: async () => page(), summary: async () => ({ Total: 31, Success: 20, Retrying: 5, Failed: 2, DeadLetter: 4 }), get: async () => mapDelivery(raw, true), ...overrides }, async () => {
    await mock(webhookService, { get: async () => ({ id: 7, name: 'Test Receiver', status: webhookStatus }), list: async () => ({ items: [{ id: 7, name: 'Test Receiver' }], pageNumber: 1, totalPages: 1 }), events: async () => [{ eventType: 'invoice.test', category: 'Invoices', description: 'Synthetic test event' }] }, async () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); client.setQueryData(['auth-user'], { userId: 3, tenantId: 2, role });
      const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
      await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Location /><Routes><Route path="/webhooks/deliveries" element={<DeliveryHistory />} /><Route path="/webhooks" element={<div>Webhook Configuration</div>} /></Routes></MemoryRouter></QueryClientProvider>)); await flush();
      try { await run({ client, host }); } finally { await act(async () => root.unmount()); host.remove(); client.clear(); localStorage.clear(); sessionStorage.clear(); }
    });
  });
}
async function action(label) { await click(document.querySelector('[aria-label="Actions for delivery 9"]')); await click([...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === label)); await flush(); }
async function select(label, text) { const el = labeled(label); await act(async () => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))); await flush(); await click([...document.querySelectorAll('[role="option"]')].find(el => el.textContent === text)); }

test('Delivery contracts map exact paging/date/status filters and replay result without assuming Success', async () => {
  const calls = [];
  await mock(apiClient, { get: async (url, options) => { calls.push({ url, options }); return envelope(url.endsWith('/9') ? raw : page([raw])); }, post: async url => { calls.push({ url }); return envelope({ success: false, deliveryId: 9, status: 'Retrying', attemptNumber: 2, message: 'Replay attempt completed with status: Retrying' }); } }, async () => {
    const result = await deliveryService.list({ webhookId: '7', eventType: 'invoice.test', status: 'DeadLetter', startDate: '2026-10-01', endDate: '2026-10-15', pageNumber: 2, pageSize: 10 });
    assert.deepEqual(calls[0], { url: '/api/v1/webhooks/deliveries', options: { signal: undefined, params: { webhookId: 7, eventType: 'invoice.test', status: 'DeadLetter', startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-15T23:59:59.999Z', pageNumber: 2, pageSize: 10 } } });
    assert.equal('payloadJson' in result.items[0], false); assert.equal('lastAttemptAt' in result.items[0], false);
    const detail = await deliveryService.get(9); assert.match(detail.payloadJson, /REDACTED/); assert.doesNotMatch(JSON.stringify(detail), /raw_client_secret|raw_signature|raw_jwt/);
    const replay = await deliveryService.replay(9); assert.equal(replay.success, false); assert.equal(replay.status, 'Retrying'); assert.equal(calls.at(-1).url, '/api/v1/webhooks/deliveries/9/replay');
  });
});

test('Test Ping selection sends the exact server filter, preserves URL filters and renders matching deliveries', async () => {
  const calls = [];
  await mock(apiClient, { get: async (url, options) => {
    calls.push({ url, params: options.params });
    return envelope(page(options.params.eventType === 'endpoint.ping' ? [{ ...raw, eventType: 'endpoint.ping', status: 'Success', responseStatusCode: 200 }] : [raw], { pageNumber: options.params.pageNumber }));
  } }, async () => {
    await ui({ list: deliveryService.list }, async () => {
      await select('Event Type', 'Test Ping (endpoint.ping)');
      assert.deepEqual(calls.at(-1), { url: '/api/v1/webhooks/deliveries', params: { webhookId: 7, eventType: 'endpoint.ping', status: 'Success', startDate: '2026-10-10T00:00:00.000Z', endDate: '2026-10-15T23:59:59.999Z', pageNumber: 1, pageSize: 10 } });
      const location = new URL(document.querySelector('[data-testid="location"]').textContent, 'http://localhost');
      assert.equal(location.searchParams.get('eventType'), 'endpoint.ping');
      assert.equal(location.searchParams.has('pageNumber'), false);
      assert.match(document.querySelector('tbody').textContent, /endpoint\.ping/);
      assert.match(document.querySelector('tbody').textContent, /Success/);
      assert.doesNotMatch(document.querySelector('tbody').textContent, /invoice\.test/);
      await select('Event Type', 'invoice.test');
      assert.equal(calls.at(-1).params.eventType, 'invoice.test');
    }, { path: '/webhooks/deliveries?webhookId=7&status=Success&startDate=2026-10-10&endDate=2026-10-15&pageNumber=2&pageSize=10' });
  });
});

test('Global summaries use separately filtered backend totalCount, never current page counts', async () => {
  const calls = [];
  await mock(apiClient, { get: async (_url, { params }) => { calls.push(params); return envelope(page([], { totalCount: { Success: 20, Retrying: 5, Failed: 2, DeadLetter: 4 }[params.status] ?? 31 })); } }, async () => {
    assert.deepEqual(await deliveryService.summary(), { Total: 31, Success: 20, Retrying: 5, Failed: 2, DeadLetter: 4 });
    assert.equal(calls.length, 5); assert.ok(calls.every(p => p.pageSize === 1 && !p.webhookId));
  });
});

test('Security redacts nested keys, header name/value arrays, signatures, JWTs, embedded JSON and non-JSON bodies', () => {
  const input = { headers: [{ name: 'Authorization', value: 'hidden_authorization' }, { key: 'x-api-key', values: ['hidden_api_key'] }, { Name: 'X-IBMS-Signature', Value: 'hidden_signature_entry' }], nested: { 'X-IBMS-Signature': 'hidden_signature', cookies: 'hidden_cookie', hmacSigningSecret: 'hidden_signing_secret' }, embedded: JSON.stringify({ client_secret: 'hidden_client_secret' }), safe: 'Bearer hidden_bearer', cookieLine: 'Cookie: a=hidden_a; b=hidden_b', signing: 'HMAC signing secret: hidden_signing', jwt: 'eyJabc.abc.signature', invoiceId: 55 };
  const result = safeDocument(JSON.stringify(input));
  assert.doesNotMatch(result, /hidden_|eyJabc/); assert.match(result, /55/); assert.match(result, /REDACTED/);
  assert.match(safeDocument('authorization=do_not_show'), /omitted for security/);
  assert.match(safeDocument('<html>secret</html>'), /omitted for security/);
});

test('Network and API errors stay distinct from empty state and error caches exclude raw server payloads', async () => {
  for (const status of [400, 401, 403, 404, 409, 422, 500]) {
    await mock(apiClient, { get: async () => { throw { response: { status, data: { message: 'api_key=hidden_server_key', payload: 'hidden_error_body' } } }; } }, async () => {
      await assert.rejects(() => deliveryService.get(9), error => { assert.equal(error.status, status); assert.doesNotMatch(JSON.stringify(error), /hidden_server_key|hidden_error_body/); return true; });
    });
  }
  assert.match(deliveryError(new Error('fetch failed')), /Backend unavailable/);
  await ui({ list: async () => { throw new Error('Network down'); }, summary: async () => { throw new Error('Network down'); } }, async () => {
    assert.match(document.body.textContent, /Backend unavailable/); assert.ok(button('Retry')); assert.equal(document.querySelector('.delivery-summary'), null); assert.doesNotMatch(document.body.textContent, /No deliveries found/);
  });
});

test('URL webhook selection, date filters, status/event filters, paging and reset are server-side', async () => {
  const calls = [];
  await ui({ list: async filters => { calls.push(filters); return page(undefined, { totalCount: 50, totalPages: 3, pageNumber: filters.pageNumber }); } }, async () => {
    assert.equal(calls[0].webhookId, '7'); assert.equal(labeled('Webhook').value, 'Test Receiver');
    await click(button('Next')); assert.equal(calls.at(-1).pageNumber, 2);
    await select('Status', 'Retrying'); assert.equal(calls.at(-1).status, 'Retrying'); assert.equal(calls.at(-1).pageNumber, 1);
    await select('Event Type', 'invoice.test'); assert.equal(calls.at(-1).eventType, 'invoice.test');
    await click(document.querySelector('.delivery-date-range'));
    await input(labeled('From Date (UTC)'), '2026-10-10'); await input(labeled('To Date (UTC)'), '2026-10-15'); assert.equal(calls.at(-1).startDate, '2026-10-10');
    const before = calls.length; await input(labeled('To Date (UTC)'), '2026-10-09'); assert.equal(calls.length, before); assert.match(document.body.textContent, /To Date must be on or after/);
    await click(button('Done')); await flush(250);
    await click(button('Reset Filters')); assert.equal(calls.at(-1).webhookId, ''); assert.equal(calls.at(-1).startDate, ''); assert.equal(document.querySelector('[data-testid="location"]').textContent, '/webhooks/deliveries');
  });
});

test('Date Range preserves URL dates across reopening and clears only dates in either queue view', async () => {
  const calls = [];
  await ui({ list: async filters => { calls.push(filters); return page(); } }, async () => {
    assert.match(document.querySelector('.delivery-date-range').textContent, /10\/10\/2026.*15\/10\/2026/);
    assert.equal(document.querySelector('input[type="date"]'), null);
    await click(document.querySelector('.delivery-date-range'));
    assert.equal(labeled('From Date (UTC)').value, '2026-10-10'); assert.equal(labeled('To Date (UTC)').value, '2026-10-15');
    await input(labeled('From Date (UTC)'), '2026-10-11');
    assert.equal(calls.at(-1).startDate, '2026-10-11'); assert.equal(calls.at(-1).endDate, '2026-10-15');
    await click(button('Done')); await flush(250);
    await click(document.querySelector('.delivery-date-range')); assert.equal(labeled('From Date (UTC)').value, '2026-10-11');
    await click(button('Clear Dates')); assert.equal(calls.at(-1).startDate, ''); assert.equal(calls.at(-1).endDate, '');
    assert.equal(calls.at(-1).webhookId, '7'); assert.equal(calls.at(-1).status, 'DeadLetter');
    await click(button('Done')); await flush(250); assert.equal(document.querySelector('.delivery-date-range').textContent, 'Date Range');
    await click([...document.querySelectorAll('[role="tab"]')].find(el => el.textContent === 'Delivery History'));
    assert.equal(document.querySelector('.delivery-date-range').textContent, 'Date Range');
  }, { path: '/webhooks/deliveries?webhookId=7&status=DeadLetter&startDate=2026-10-10&endDate=2026-10-15' });
});

test('DLQ uses the same list endpoint with DeadLetter status and includes failure reason and replay action', async () => {
  const calls = [];
  await ui({ list: async filters => { calls.push(filters); return page(); } }, async () => {
    await click([...document.querySelectorAll('[role="tab"]')].find(el => el.textContent === 'Dead-Letter Queue'));
    assert.equal(calls.at(-1).status, 'DeadLetter'); assert.equal(calls.at(-1).webhookId, '7');
    assert.match(document.querySelector('table').textContent, /Failure Reason/); assert.match(document.querySelector('table').textContent, /Receiver unavailable/);
    await action('Replay Delivery'); assert.match(document.body.textContent, /Replaying this delivery will send the webhook request again/);
  });
});

test('Details and Copy Payload expose only sanitized data, accurate available timestamps, and no browser persistence', async () => {
  const copied = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => copied.push(value) } });
  await ui({}, async ({ client }) => {
    await action('View Details'); assert.match(document.body.textContent, /Request Headers/); assert.match(document.body.textContent, /Delivered Timestamp/); assert.match(document.body.textContent, /does not supply a last-attempt timestamp/);
    assert.doesNotMatch(document.body.textContent, /raw_client_secret|raw_api_key|raw_token|raw_jwt|raw_cookie|raw_signature|raw_refresh_token/);
    await click(button('Copy Payload')); assert.match(copied[0], /invoiceId/); assert.doesNotMatch(copied[0], /raw_client_secret|raw_api_key/);
    assert.doesNotMatch(JSON.stringify(client.getQueryCache().getAll().map(q => q.state.data)), /raw_client_secret|raw_signature/);
    assert.equal(localStorage.length, 0); assert.equal(sessionStorage.length, 0);
  });
});

test('Replay is confirmation-only, duplicate-safe, retains backend status and refreshes list and details', async () => {
  let replayCalls = 0, gets = 0, lists = 0, finish;
  await ui({ list: async () => { lists++; return page(); }, get: async () => { gets++; return mapDelivery({ ...raw, status: gets > 1 ? 'Retrying' : 'DeadLetter' }, true); }, replay: () => { replayCalls++; return new Promise(resolve => { finish = resolve; }); } }, async () => {
    await action('Replay Delivery'); assert.equal(replayCalls, 0); await click(button('Cancel')); await flush(250); assert.equal(replayCalls, 0);
    await action('Replay Delivery'); await click(button('Confirm Replay')); assert.equal(replayCalls, 1); assert.equal(button('Replaying…').disabled, true);
    await act(async () => finish({ success: false, message: 'Replay queued for retry.', status: 'Retrying', attemptNumber: 2 })); await flush();
    assert.match(document.body.textContent, /Replay queued for retry/); assert.match(document.querySelector('.delivery-dialog').textContent, /Status: Retrying/); assert.equal(button('Confirm Replay'), undefined); assert.ok(gets >= 3); assert.ok(lists >= 2);
  });
});

test('Failed, DeadLetter and backend-supported Success deliveries replay only after confirmation and refresh on success', async () => {
  for (const status of ['Failed', 'DeadLetter', 'Success']) {
    let replays = 0, lists = 0, gets = 0;
    await ui({
      list: async () => { lists++; return page([mapDelivery({ ...raw, status: replays ? 'Success' : status })]); },
      get: async () => { gets++; return mapDelivery({ ...raw, status: replays ? 'Success' : status }, true); },
      replay: async () => { replays++; return { success: true, status: 'Success', message: 'Delivery replayed and succeeded.', attemptNumber: 1 }; },
    }, async () => {
      await action('Replay Delivery'); assert.equal(replays, 0); assert.equal(button('Confirm Replay').disabled, false);
      await click(button('Confirm Replay'));
      assert.equal(replays, 1); assert.ok(lists >= 2); assert.ok(gets >= 2);
      assert.match(document.querySelector('.MuiSnackbar-root .MuiAlert-filledSuccess').textContent, /Delivery replayed and succeeded/);
      assert.match(document.querySelector('tbody').textContent, /Success/);
      assert.doesNotMatch(document.querySelector('.delivery-dialog').textContent, /must be Active/);
      assert.equal(button('Confirm Replay'), undefined);
    });
  }
});

test('Unsuccessful terminal replay outcomes show error notifications and refresh authoritative history', async () => {
  for (const status of ['Failed', 'DeadLetter']) {
    let lists = 0;
    await ui({ list: async () => { lists++; return page(); }, replay: async () => ({ success: false, status, message: `Replay attempt completed with status: ${status}`, attemptNumber: 1 }) }, async () => {
      await action('Replay Delivery'); await click(button('Confirm Replay'));
      assert.match(document.querySelector('.MuiSnackbar-root .MuiAlert-filledError').textContent, new RegExp(status));
      assert.ok(document.querySelector('.delivery-dialog .MuiAlert-standardError'));
      assert.ok(lists >= 2);
      assert.doesNotMatch(document.querySelector('.delivery-dialog').textContent, /must be Active/);
    });
  }
});

test('Inactive webhook and unauthorized roles block replay; backend rejection remains a failure', async () => {
  let calls = 0;
  await ui({ replay: async () => { calls++; } }, async () => { await action('Replay Delivery'); assert.equal(button('Confirm Replay').disabled, true); assert.match(document.body.textContent, /must be Active/); assert.equal(calls, 0); }, { webhookStatus: 'Suspended' });
  await ui({ list: async () => { calls++; return page(); } }, async () => { assert.match(document.body.textContent, /Delivery access requires/); assert.equal(document.querySelector('table'), null); }, { role: 'Customer' }); assert.equal(calls, 0);
  await ui({ replay: async () => { throw { response: { status: 409, data: { message: 'Delivery changed.' } } }; } }, async () => { await action('Replay Delivery'); await click(button('Confirm Replay')); assert.match(document.body.textContent, /Delivery changed/); assert.ok(button('Confirm Replay')); });
});

test('Invalid URL filters never silently load all deliveries, and successful empty responses show an empty state', async () => {
  let calls = 0;
  await ui({ list: async () => { calls++; return page(); } }, async () => { assert.equal(calls, 0); assert.match(document.body.textContent, /Invalid filter in the URL/); }, { path: '/webhooks/deliveries?webhookId=invalid' });
  await ui({ list: async () => page([]) }, async () => { assert.match(document.body.textContent, /No deliveries found/); });
});
