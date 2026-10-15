// Synthetic test data only. Production renders authenticated backend responses.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { apiClient } from 'billing-api-client';
import { Integrations } from '../src/pages/Integrations/Integrations';
import { integrationService, integrationError, integrationAccess, mapApplication } from '../src/pages/Integrations/integrationService';

const app = { id: 12, tenantId: 3, name: 'Test Application', description: 'Test description', clientId: 'test_client_id', status: 'Active', featureFlags: { SyncInvoices: true, CustomFlag: false }, webhooksCount: 2, createdAtUtc: '2026-10-14T10:00:00Z' };
const envelope = data => ({ success: true, message: 'Success', data });
const page = (items = [app], extra = {}) => ({ items, totalCount: items.length, pageNumber: 1, pageSize: 20, totalPages: items.length ? 1 : 0, ...extra });
async function mocked(object, overrides, action) {
  const original = Object.fromEntries(Object.keys(overrides).map(key => [key, object[key]]));
  Object.assign(object, overrides);
  try { await action(); } finally { Object.assign(object, original); }
}
async function flush(ms = 30) { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); }
const button = label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label);
async function click(el) { assert.ok(el, 'Expected clickable control'); await act(async () => el.click()); await flush(); }
async function input(el, value) {
  assert.ok(el, 'Expected input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await flush();
}
async function mount(role = 'TenantAdmin') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryData(['auth-user'], { userId: 5, tenantId: 3, role });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/integrations']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/integrations" element={<Integrations />} /></Routes></MemoryRouter></QueryClientProvider>));
  await flush();
  return { client, host, close: async () => { await act(async () => root.unmount()); host.remove(); client.clear(); } };
}
async function ui(overrides, action, role) {
  await mocked(integrationService, { list: async () => page(), get: async () => mapApplication(app), ...overrides }, async () => {
    const mounted = await mount(role);
    try { await action(mounted); } finally { await mounted.close(); localStorage.clear(); sessionStorage.clear(); }
  });
}
async function actionMenu(label) {
  await click(document.querySelector('[aria-label="Actions for Test Application"]'));
  const item = [...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === label);
  await click(item); await flush();
}

test('Integration contracts: exact endpoints, pagination, flags, safe mapping and one-time registration response', async () => {
  const calls = [];
  const methods = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map(method => [method, async (url, body) => {
    calls.push({ method, url, body });
    if (method === 'get' && url.endsWith('/integrations')) return envelope(page());
    if (method === 'post') return envelope({ ...app, clientSecret: 'synthetic_secret' });
    if (method === 'delete') return envelope(true);
    return envelope({ ...app, clientSecret: 'must_not_be_cached' });
  }]));
  await mocked(apiClient, methods, async () => {
    const result = await integrationService.list({ status: 'Active', searchTerm: ' Test ', pageNumber: 2, pageSize: 10 });
    assert.equal(result.totalCount, 1); assert.equal(result.items[0].webhooksCount, 2);
    assert.deepEqual(calls[0].body.params, { status: 'Active', searchTerm: 'Test', pageNumber: 2, pageSize: 10 });
    const detail = await integrationService.get(12); assert.equal('clientSecret' in detail, false);
    const dto = { name: 'App', description: '', featureFlags: { AllowAutoReplay: true } };
    assert.deepEqual(await integrationService.register(dto), { clientId: app.clientId, clientSecret: 'synthetic_secret' });
    await integrationService.update(12, { ...dto, status: 'Active' });
    await integrationService.flags(12, { CustomFlag: true }); await integrationService.toggle(12); await integrationService.remove(12);
    assert.deepEqual(calls.map(c => [c.method, c.url]), [
      ['get', '/api/v1/integrations'], ['get', '/api/v1/integrations/12'], ['post', '/api/v1/integrations'],
      ['put', '/api/v1/integrations/12'], ['patch', '/api/v1/integrations/12/feature-flags'],
      ['patch', '/api/v1/integrations/12/toggle-status'], ['delete', '/api/v1/integrations/12'],
    ]);
    assert.deepEqual(calls[4].body, { featureFlags: { CustomFlag: true } });
  });
  await mocked(apiClient, { get: async () => envelope({ items: [], totalCount: 1 }) }, async () => {
    await assert.rejects(() => integrationService.list({ pageNumber: 1, pageSize: 20 }), /pagination/);
  });
});

test('Backend roles and 400/401/403/404/500 errors are respected without success fallbacks', async () => {
  for (const role of ['TenantAdmin', 'SuperAdmin', 'User']) assert.equal(integrationAccess({ data: { role } }), true);
  for (const role of ['Customer', 'Manager', '']) assert.equal(integrationAccess({ role }), false);
  assert.match(integrationError({ response: { status: 400, data: { errors: { Name: ['Name is required.'] } } } }), /Name is required/);
  for (const [status, pattern] of [[401, /sign in/], [403, /permission/], [404, /no longer available/], [500, /try again/]]) {
    const error = { response: { status, data: {} } }; assert.match(integrationError(error), pattern);
    await mocked(apiClient, { get: async () => { throw error; } }, async () => {
      await assert.rejects(() => integrationService.get(12), e => e.response.status === status);
    });
  }
  let requests = 0;
  await ui({ list: async () => { requests++; return page(); } }, async () => {
    assert.equal(requests, 0); assert.match(document.body.textContent, /Integration access requires/);
    assert.equal(button('Register New App').disabled, true);
  }, 'Customer');
});

test('Registration waits for server, blocks duplicate submissions, exposes credentials once and never caches or stores secret', async () => {
  let resolveRegistration, requests = 0, lists = 0, captured;
  const copied = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => copied.push(text) } });
  await ui({ list: async () => { lists++; return page(); }, register: dto => {
    requests++; captured = dto; return new Promise(resolve => { resolveRegistration = resolve; });
  } }, async ({ client }) => {
    await click(button('Register New App'));
    await input(document.querySelector('input[required]'), '  Registered App  ');
    await input(document.querySelector('textarea'), 'Description');
    await click(button('Register Application'));
    assert.equal(button('Saving…').disabled, true); assert.equal(requests, 1);
    assert.doesNotMatch(document.body.textContent, /Save Your Client Secret/);
    assert.equal(captured.name, 'Registered App');
    assert.deepEqual(Object.keys(captured.featureFlags), ['AllowAutoReplay', 'SyncInvoices', 'BetaV2Api']);
    await act(async () => resolveRegistration({ clientId: app.clientId, clientSecret: 'one_time_test_secret' })); await flush();
    assert.match(document.body.textContent, /Please copy and store this secret safely. It will not be shown again./);
    assert.ok(lists >= 2);
    await click(button('Copy Client ID')); await click(button('Copy Client Secret'));
    assert.deepEqual(copied, [app.clientId, 'one_time_test_secret']);
    assert.doesNotMatch(JSON.stringify(client.getQueryCache().getAll().map(q => q.state.data)), /one_time_test_secret/);
    assert.equal(client.getMutationCache().getAll().length, 0);
    assert.doesNotMatch(JSON.stringify({ ...localStorage, ...sessionStorage }), /one_time_test_secret/);
    await click(button('I Have Saved the Secret'));
    assert.equal(document.querySelector('input[value="one_time_test_secret"]'), null);
    await click(button('Register New App')); assert.doesNotMatch(document.body.textContent, /Save Your Client Secret/);
  });
});

test('Registration reports backend validation failures in-place and never presents credentials', async () => {
  await ui({ register: async () => { throw { response: { status: 400, data: { errors: ['Application name already exists.'] } } }; } }, async () => {
    await click(button('Register New App')); await input(document.querySelector('input[required]'), 'Duplicate');
    await click(button('Register Application'));
    assert.match(document.body.textContent, /Application name already exists/);
    assert.ok(button('Register Application')); assert.doesNotMatch(document.body.textContent, /Save Your Client Secret/);
  });
});

test('Feature flags load fresh details, retain custom flags, and remain open on failure until a confirmed save', async () => {
  let gets = 0, requests = 0, payload;
  await ui({ get: async () => { gets++; return mapApplication(app); }, flags: async (_id, flags) => {
    requests++; payload = flags; if (requests === 1) throw { response: { status: 500 } }; return app;
  } }, async () => {
    await actionMenu('Manage Feature Flags'); assert.equal(gets, 1);
    const label = [...document.querySelectorAll('label')].find(el => el.textContent === 'CustomFlag');
    assert.ok(label); await click(label.querySelector('input'));
    await click(button('Save Feature Flags')); assert.ok(button('Save Feature Flags'));
    assert.match(document.body.textContent, /could not complete/);
    await click(button('Save Feature Flags'));
    assert.equal(payload.CustomFlag, true); assert.equal(payload.SyncInvoices, true);
    assert.equal(payload.allowWebhooks, undefined, 'Do not enable backend defaults absent from the current application');
    assert.equal(payload.BetaV2Api, false);
    await flush(250); assert.equal(button('Save Feature Flags'), undefined);
  });
});

test('Details, edit, disable and delete fetch current data and require confirmed server actions', async () => {
  let toggles = 0, deletions = 0, updated;
  await ui({ update: async (_id, dto) => { updated = dto; return app; },
    toggle: async () => { toggles++; return { ...app, status: 'Inactive' }; }, remove: async () => { deletions++; } }, async () => {
    await actionMenu('View Details'); assert.match(document.body.textContent, /Test description/); await click(button('Close')); await flush(250);
    await actionMenu('Edit Application'); await input(document.querySelector('input[required]'), 'Edited');
    await click(button('Save Changes')); assert.equal(updated.name, 'Edited'); assert.equal(updated.status, 'Active'); assert.deepEqual(updated.featureFlags, app.featureFlags); await flush(250);
    await actionMenu('Disable Application'); assert.equal(toggles, 0); await click(button('Cancel')); await flush(250); assert.equal(toggles, 0);
    await actionMenu('Disable Application'); await click(button('Disable Application')); assert.equal(toggles, 1); await flush(250);
    await actionMenu('Delete Application'); assert.equal(deletions, 0); await click(button('Delete Application')); assert.equal(deletions, 1);
  });
});

test('Search, status and pagination are sent to the server; list handles empty and failed responses', async () => {
  const calls = [];
  await ui({ list: async filters => { calls.push(filters); return page([app], { totalCount: 45, totalPages: 3, pageNumber: filters.pageNumber, pageSize: filters.pageSize }); } }, async () => {
    await click(button('Next')); assert.equal(calls.at(-1).pageNumber, 2);
    await input(document.querySelector('input[type="search"]'), 'Salesforce'); await flush(350);
    assert.equal(calls.at(-1).searchTerm, 'Salesforce'); assert.equal(calls.at(-1).pageNumber, 1);
    const select = [...document.querySelectorAll('[role="combobox"]')][0];
    await act(async () => select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))); await flush();
    await click([...document.querySelectorAll('[role="option"]')].find(el => el.textContent === 'Inactive'));
    assert.equal(calls.at(-1).status, 'Inactive');
  });
  await ui({ list: async () => page([]) }, async () => { assert.match(document.body.textContent, /No applications found/); });
  await ui({ list: async () => { throw { response: { status: 403 } }; } }, async () => {
    assert.match(document.body.textContent, /permission/); assert.ok(button('Retry')); assert.doesNotMatch(document.body.textContent, /No applications found/);
  });
});
