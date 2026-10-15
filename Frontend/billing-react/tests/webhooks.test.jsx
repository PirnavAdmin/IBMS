// Synthetic fixtures are restricted to tests; production uses authenticated backend APIs.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { apiClient } from 'billing-api-client';
import { integrationService } from '../src/pages/Integrations/integrationService';
import { webhookService, webhookError, mapWebhook, validateWebhook, webhookDto } from '../src/pages/Webhooks/webhookService';
import { Webhooks } from '../src/pages/Webhooks/Webhooks';
import { DeliveryHistory } from '../src/pages/Webhooks/DeliveryHistory';
import { deliveryService } from '../src/pages/Webhooks/deliveryService';

const webhook = { id: 7, applicationId: 42, applicationName: 'Existing Application', name: 'Test Webhook', targetUrl: 'https://example.invalid/hook', subscribedEvents: ['invoice.test', 'legacy.subscription'], status: 'Active', consecutiveFailureCount: 2, lastTriggeredAtUtc: null, createdAtUtc: '2026-10-15T10:00:00Z', secretKeyPreview: 'whsec_****' };
const catalog = [{ eventType: 'invoice.test', category: 'Invoices', description: 'Test invoice event' }, { eventType: 'payment.test', category: 'Payments', description: 'Test payment event' }];
const page = (items = [webhook], extra = {}) => ({ items, totalCount: items.length, pageNumber: 1, pageSize: 20, totalPages: items.length ? 1 : 0, ...extra });
const envelope = data => ({ success: true, data });
async function mock(object, overrides, run) { const old = Object.fromEntries(Object.keys(overrides).map(key => [key, object[key]])); Object.assign(object, overrides); try { await run(); } finally { Object.assign(object, old); } }
async function flush(ms = 30) { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); }
const button = label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label);
async function click(el) { assert.ok(el, 'Expected clickable element'); await act(async () => el.click()); await flush(); }
async function input(el, value) { assert.ok(el); await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new window.Event('input', { bubbles: true })); el.dispatchEvent(new window.Event('change', { bubbles: true })); }); await flush(); }
const labeledInput = text => { const label = [...document.querySelectorAll('label')].find(el => el.textContent.startsWith(text)); return label ? document.getElementById(label.htmlFor) : null; };
async function ui(overrides, run, role = 'TenantAdmin') {
  await mock(webhookService, { list: async () => page(), summary: async () => ({ Total: 31, Active: 20, Disabled: 9, Suspended: 2 }), events: async () => catalog, get: async () => mapWebhook(webhook), ...overrides }, async () => {
    await mock(integrationService, { list: async () => ({ items: [{ id: 1, name: 'New Application' }], pageNumber: 1, totalPages: 1 }) }, async () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); client.setQueryData(['auth-user'], { userId: 3, tenantId: 2, role });
      const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
      await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/webhooks']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/webhooks" element={<Webhooks />} /><Route path="/webhooks/deliveries" element={<DeliveryHistory />} /></Routes></MemoryRouter></QueryClientProvider>)); await flush();
      try { await run({ client, host }); } finally { await act(async () => root.unmount()); host.remove(); client.clear(); localStorage.clear(); sessionStorage.clear(); }
    });
  });
}
async function action(label) { await click(document.querySelector('[aria-label="Actions for Test Webhook"]')); await click([...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === label)); await flush(); }

test('Webhook contracts use exact methods, filters and DTOs; never cache raw secret fields', async () => {
  const calls = [];
  const methods = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map(method => [method, async (url, body) => {
    calls.push({ method, url, body });
    if (url.endsWith('/events')) return envelope(catalog);
    if (method === 'get' && url === '/api/v1/webhooks') return envelope(page());
    if (url.endsWith('/ping')) return envelope({ success: false, statusCode: 503, latencyMs: 42, message: 'Receiver unavailable' });
    if (url.endsWith('/rotate-secret')) return envelope({ newSecretKey: 'synthetic_rotated_secret' });
    if (method === 'delete') return envelope(true);
    return envelope({ ...webhook, secretKey: 'must_not_be_cached', newSecretKey: 'must_not_be_cached' });
  }]));
  await mock(apiClient, methods, async () => {
    await webhookService.list({ status: 'Suspended', eventType: 'invoice.test', searchTerm: ' Test ', pageNumber: 3, pageSize: 10 });
    assert.deepEqual(calls[0].body.params, { status: 'Suspended', eventType: 'invoice.test', searchTerm: 'Test', pageNumber: 3, pageSize: 10 });
    assert.deepEqual(await webhookService.events(), catalog);
    const result = await webhookService.get(7); assert.equal('secretKey' in result, false); assert.equal('newSecretKey' in result, false);
    const dto = webhookDto(webhook); await webhookService.create(dto); await webhookService.update(7, dto); await webhookService.toggle(7);
    const ping = await webhookService.ping(7); assert.equal(ping.success, false); assert.equal(ping.statusCode, 503);
    assert.equal(await webhookService.rotate(7), 'synthetic_rotated_secret'); await webhookService.remove(7);
    assert.deepEqual(calls.map(c => [c.method, c.url]), [['get', '/api/v1/webhooks'], ['get', '/api/v1/webhooks/events'], ['get', '/api/v1/webhooks/7'], ['post', '/api/v1/webhooks'], ['put', '/api/v1/webhooks/7'], ['patch', '/api/v1/webhooks/7/toggle-status'], ['post', '/api/v1/webhooks/7/ping'], ['post', '/api/v1/webhooks/7/rotate-secret'], ['delete', '/api/v1/webhooks/7']]);
    assert.deepEqual(calls[4].body, { applicationId: 42, name: webhook.name, targetUrl: webhook.targetUrl, subscribedEvents: webhook.subscribedEvents, status: 'Active' });
  });
});

test('Summary counts use backend totalCount per status, not current page length; errors never become fake totals', async () => {
  const calls = [];
  await mock(apiClient, { get: async (_url, { params }) => { calls.push(params); return envelope(page([], { totalCount: { Active: 12, Disabled: 5, Suspended: 3 }[params.status] ?? 20, pageSize: 1, totalPages: 20 })); } }, async () => {
    assert.deepEqual(await webhookService.summary(), { Total: 20, Active: 12, Disabled: 5, Suspended: 3 });
    assert.equal(calls.length, 4); assert.ok(calls.every(c => c.pageSize === 1));
  });
  await mock(apiClient, { get: async () => { throw { response: { status: 500 } }; } }, async () => { await assert.rejects(() => webhookService.summary()); });
});

test('Webhook validation enforces HTTP/HTTPS, name, events and preserves existing associations/subscriptions', () => {
  assert.deepEqual(validateWebhook(webhook), {});
  for (const targetUrl of ['', 'ftp://example.invalid', 'javascript:alert(1)', 'not-a-url']) assert.ok(validateWebhook({ ...webhook, targetUrl }).targetUrl);
  assert.ok(validateWebhook({ ...webhook, name: ' ', subscribedEvents: [] }).name);
  assert.ok(validateWebhook({ ...webhook, subscribedEvents: [] }).subscribedEvents);
  assert.deepEqual(webhookDto({ ...webhook, status: 'Suspended' }), { applicationId: 42, name: webhook.name, targetUrl: webhook.targetUrl, subscribedEvents: ['invoice.test', 'legacy.subscription'], status: 'Suspended' });
  for (const [status, pattern] of [[400, /details/], [401, /sign in/], [403, /permission/], [404, /not found/], [409, /changed/], [422, /validation/], [500, /try again/]]) assert.match(webhookError({ response: { status, data: {} } }), pattern);
  assert.match(webhookError({ response: { status: 422, data: { errors: { TargetUrl: ['Invalid receiver URL.'] } } } }), /Invalid receiver URL/);
});

test('Create loads categorized event checkboxes, validates input, waits for API and prevents duplicate submissions', async () => {
  let requests = 0, payload, finish;
  await ui({ create: dto => { requests++; payload = dto; return new Promise(resolve => { finish = resolve; }); } }, async () => {
    await click(button('Create Webhook'));
    assert.match(document.querySelector('.webhook-event-fieldset').textContent, /Invoices/); assert.match(document.querySelector('.webhook-event-fieldset').textContent, /Payments/);
    await click([...document.querySelectorAll('button')].find(el => el.type === 'submit')); assert.equal(requests, 0); assert.match(document.body.textContent, /Select at least one event/);
    await input(labeledInput('Webhook Name'), ' Listener '); await input(labeledInput('Destination URL'), 'https://example.invalid/receiver');
    await click(document.querySelector('.webhook-event-group input[type="checkbox"]'));
    await click([...document.querySelectorAll('button')].find(el => el.type === 'submit'));
    assert.equal(requests, 1); assert.equal(button('Saving…').disabled, true); assert.equal(payload.applicationId, null); assert.equal(payload.name, 'Listener'); assert.deepEqual(payload.subscribedEvents, ['invoice.test']);
    await act(async () => finish(webhook)); await flush(); assert.equal(document.querySelector('form'), null);
  });
});

test('Edit preserves unknown event subscriptions and associated app even if absent from the first option page', async () => {
  let saved;
  await ui({ update: async (_id, dto) => { saved = dto; return webhook; } }, async () => {
    await action('Edit Webhook'); assert.equal(labeledInput('Associated Application').value, 'Existing Application');
    const existing = [...document.querySelectorAll('label')].find(el => el.textContent.includes('legacy.subscription'));
    assert.ok(existing.querySelector('input').checked);
    await input(labeledInput('Webhook Name'), 'Renamed'); await click(button('Save Webhook'));
    assert.equal(saved.applicationId, 42); assert.deepEqual(saved.subscribedEvents, webhook.subscribedEvents); assert.equal(saved.name, 'Renamed');
  });
});

test('Suspended remains distinct, cannot be toggled in UI and is preserved in edit requests', async () => {
  let saved, toggles = 0;
  const suspended = { ...webhook, status: 'Suspended' };
  await ui({ list: async () => page([suspended]), get: async () => suspended, toggle: async () => { toggles++; }, update: async (_id, dto) => { saved = dto; return suspended; } }, async () => {
    await click(document.querySelector('[aria-label="Actions for Test Webhook"]'));
    const toggle = [...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === 'Suspended (backend managed)'); assert.equal(toggle.getAttribute('aria-disabled'), 'true');
    await click([...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === 'Edit Webhook'));
    await click(button('Save Webhook')); assert.equal(saved.status, 'Suspended'); assert.equal(toggles, 0);
  });
});

test('Test ping uses nested delivery result and displays failed status, latency and message without claiming success', async () => {
  let resolvePing, requests = 0;
  await ui({ ping: () => { requests++; return new Promise(resolve => { resolvePing = resolve; }); } }, async () => {
    await action('Test Ping'); assert.equal(requests, 0); await click(button('Send Test Ping'));
    assert.doesNotMatch(document.body.textContent, /Ping succeeded/); assert.equal(button('Please wait…').disabled, true);
    await act(async () => resolvePing({ success: false, statusCode: 503, latencyMs: 91, message: 'Receiver unavailable' })); await flush();
    assert.match(document.body.textContent, /Ping failed/); assert.match(document.body.textContent, /503/); assert.match(document.body.textContent, /91 ms/); assert.match(document.body.textContent, /Receiver unavailable/); assert.doesNotMatch(document.body.textContent, /Ping succeeded/);
  });
  await ui({ ping: async () => ({ success: true, statusCode: 204, latencyMs: 5, message: 'Delivered' }) }, async () => { await action('Test Ping'); await click(button('Send Test Ping')); assert.match(document.body.textContent, /Ping succeeded/); });
});

test('Rotate requires confirmation; secret appears once and is never persisted or cached', async () => {
  let requests = 0; const copied = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => copied.push(value) } });
  await ui({ rotate: async () => { requests++; return 'synthetic_one_time_webhook_secret'; } }, async ({ client }) => {
    await action('Rotate Secret'); assert.equal(requests, 0); await click(button('Rotate Secret')); assert.equal(requests, 1);
    assert.match(document.body.textContent, /Please copy and store this secret safely. It will not be shown again./);
    await click(button('Copy Secret')); assert.deepEqual(copied, ['synthetic_one_time_webhook_secret']);
    assert.doesNotMatch(JSON.stringify(client.getQueryCache().getAll().map(q => q.state.data)), /synthetic_one_time_webhook_secret/);
    assert.equal(client.getMutationCache().getAll().length, 0); assert.doesNotMatch(JSON.stringify({ ...localStorage, ...sessionStorage }), /synthetic_one_time_webhook_secret/);
    await click(button('I Have Saved the Secret')); assert.equal(document.querySelector('input[value="synthetic_one_time_webhook_secret"]'), null);
  });
});

test('Toggle/delete require confirmation and show server errors without false success', async () => {
  let toggles = 0, deletions = 0;
  await ui({ toggle: async () => { toggles++; return { ...webhook, status: 'Disabled' }; }, remove: async () => { deletions++; throw { response: { status: 409, data: { message: 'Webhook has changed.' } } }; } }, async () => {
    await action('Disable Webhook'); assert.equal(toggles, 0); await click(button('Cancel')); await flush(250); assert.equal(toggles, 0);
    await action('Disable Webhook'); await click(button('Disable Webhook')); assert.equal(toggles, 1); await flush(250);
    await action('Delete Webhook'); assert.equal(deletions, 0); await click(button('Delete Webhook')); assert.equal(deletions, 1); assert.match(document.body.textContent, /Webhook has changed/); assert.ok(button('Delete Webhook')); assert.doesNotMatch(document.body.textContent, /Webhook deleted\./);
  });
});

test('Server paging/search/status/event filters and Delivery History navigation preserve webhook selection', async () => {
  const calls = [];
  await ui({ list: async filters => { calls.push(filters); return page([webhook], { totalCount: 50, totalPages: 3, pageNumber: filters.pageNumber }); } }, async () => {
    await click(button('Next')); assert.equal(calls.at(-1).pageNumber, 2);
    await input(document.querySelector('input[type="search"]'), 'listener'); await flush(350); assert.equal(calls.at(-1).pageNumber, 1); assert.equal(calls.at(-1).searchTerm, 'listener');
    for (const [index, value, key] of [[0, 'Disabled', 'status'], [1, 'payment.test', 'eventType']]) {
      await act(async () => [...document.querySelectorAll('[role="combobox"]')][index].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))); await flush();
      await click([...document.querySelectorAll('[role="option"]')].find(el => el.textContent === value)); assert.equal(calls.at(-1)[key], value);
    }
    const deliveryCalls = [];
    await mock(deliveryService, { list: async filters => { deliveryCalls.push(filters); return page([]); }, summary: async () => ({ Total: 0, Success: 0, Retrying: 0, Failed: 0, DeadLetter: 0 }) }, async () => {
      await action('View Delivery History'); assert.match(document.body.textContent, /Selected webhook: #7/); assert.match(document.body.textContent, /Webhook Delivery History/);
      assert.equal(deliveryCalls.at(-1).webhookId, '7'); assert.match(document.body.textContent, /No deliveries found/);
    });
  });
});

test('Role, empty, catalog error and list error states do not fabricate records or counts', async () => {
  let calls = 0;
  await ui({ list: async () => { calls++; return page(); } }, async () => { assert.equal(calls, 0); assert.match(document.body.textContent, /Webhook access requires/); }, 'Customer');
  await ui({ list: async () => page([]), summary: async () => { throw new Error('Unavailable'); } }, async () => { assert.match(document.body.textContent, /No webhooks found/); assert.equal(document.querySelector('.webhook-summary'), null); });
  await ui({ list: async () => { throw { response: { status: 403 } }; }, events: async () => { throw { response: { status: 500 } }; } }, async () => { assert.match(document.body.textContent, /permission/); assert.ok(button('Retry')); assert.ok(button('Retry Events')); assert.doesNotMatch(document.body.textContent, /No webhooks found/); });
});
