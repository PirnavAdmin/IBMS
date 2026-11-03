import React, { act } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { apiClient } from 'billing-api-client';
import { NotificationBell } from '../src/components/dashboard/NotificationBell';
import { DashboardHeader } from '../src/components/dashboard/DashboardHeader';
import { notificationInboxService as inbox, notificationDestination, parseInboxPage } from '../src/services/notificationInboxService';

const user = { userId: 'user-1', tenantId: 1, permissions: ['invoices.view'] };
const item = { id: 'n1', title: 'Invoice due', message: 'Invoice INV-1 is due.', createdAtUtc: '2026-11-02T10:00:00Z', isRead: false, action: { module: 'invoices', entityId: 7 } };
const page = (items = [item], totalCount = items.length, pageNumber = 1) => ({ items, totalCount, pageNumber, pageSize: 20, snapshotAtUtc: '2026-11-03T10:00:00Z' });
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
const click = element => act(async () => { assert.ok(element, 'Expected clickable element'); Simulate.click(element); });
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
function Location() { return <output data-location>{useLocation().pathname}</output>; }
async function mount(component = <NotificationBell user={user} />, methods = {}) {
  const originals = { ...inbox };
  Object.assign(inbox, { unreadCount: async () => 1, list: async () => page(), markRead: async () => {}, markAllRead: async () => {}, ...methods });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const host = document.createElement('div'); document.body.append(host);
  // JSDOM has no layout; provide geometry solely for MUI anchor placement.
  host.getBoundingClientRect = () => ({ x: 10, y: 10, top: 10, left: 10, right: 50, bottom: 50, width: 40, height: 40 });
  const root = createRoot(host);
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter>{component}<Location /></MemoryRouter></QueryClientProvider>));
  for (const anchor of host.querySelectorAll('button')) anchor.getBoundingClientRect = host.getBoundingClientRect;
  await settle();
  return { host, client, close: async () => { await act(async () => root.unmount()); client.clear(); host.remove(); Object.assign(inbox, originals); } };
}
const open = async () => { await click(document.querySelector('button[title="Notifications"]')); await settle(); };

test('bell shows capped server unread count; loads inbox only on open; closes on Escape', async () => {
  let calls = 0;
  const view = await mount(undefined, { unreadCount: async () => 105, list: async () => { calls++; return page(); } });
  try {
    assert.equal(calls, 0);
    assert.equal(view.host.querySelector('.notification-badge').textContent, '99+');
    assert.match(view.host.querySelector('button').getAttribute('aria-label'), /105 unread/);
    await open(); assert.equal(calls, 1);
    assert.ok(document.querySelector('[role="dialog"]'));
    await act(async () => Simulate.keyDown(document.querySelector('.MuiModal-root'), { key: 'Escape', keyCode: 27 }));
    await settle(); assert.equal(view.host.querySelector('button').getAttribute('aria-expanded'), 'false');
  } finally { await view.close(); }
});

test('All/Unread and pagination send scoped server filters and reset page', async () => {
  const calls = [];
  const view = await mount(undefined, { list: async params => { calls.push(params); return page([item], 25, params.pageNumber); } });
  try {
    await open(); await click(document.querySelector('[aria-label="Next notification page"]')); await settle();
    assert.equal(calls.at(-1).pageNumber, 2);
    await click(button('Unread')); await settle();
    assert.deepEqual(calls.at(-1), { unreadOnly: true, pageNumber: 1 });
    await click(button('All')); await settle(); assert.equal(calls.at(-1).unreadOnly, false);
  } finally { await view.close(); }
});

test('mark read refreshes server badge; failed writes leave the item unread', async () => {
  let read = false; let fail = true;
  const view = await mount(undefined, { unreadCount: async () => read ? 0 : 1, list: async () => page([{ ...item, isRead: read }]),
    markRead: async id => { assert.equal(id, 'n1'); if (fail) throw new Error('offline'); read = true; } });
  try {
    await open(); await click(button('Mark as read: Invoice due')); await settle();
    assert.match(document.querySelector('[role="alert"]').textContent, /Could not update/);
    assert.ok(document.querySelector('.notification-list .is-unread'));
    fail = false; await click(button('Mark as read: Invoice due')); await settle();
    assert.equal(document.querySelector('.notification-list .is-unread'), null);
    assert.equal(view.host.querySelector('.notification-badge'), null);
  } finally { await view.close(); }
});

test('mark all uses the server snapshot cutoff and refreshes authoritative data', async () => {
  let cutoff;
  const view = await mount(undefined, { markAllRead: async value => { cutoff = value; } });
  try { await open(); await click(button('Mark all as read')); await settle(); assert.equal(cutoff, '2026-11-03T10:00:00Z'); }
  finally { await view.close(); }
});

test('empty and missing API states are distinct, with working retry and no invented count', async () => {
  let fail = true;
  const view = await mount(undefined, { unreadCount: async () => { throw new Error('404'); }, list: async () => { if (fail) throw new Error('404'); return page([]); } });
  try {
    assert.equal(view.host.querySelector('.notification-badge'), null);
    await open(); assert.match(document.querySelector('[role="alert"]').textContent, /unavailable/);
    assert.equal(button('Mark all as read'), undefined);
    fail = false; await click(button('Try again')); await settle();
    assert.match(document.querySelector('.notification-state').textContent, /no notifications yet/);
    await click(button('Unread')); await settle();
    assert.match(document.querySelector('.notification-state').textContent, /No unread notifications/);
  } finally { await view.close(); }
});

test('record navigation marks read first and allows only known permitted routes', async () => {
  let marked = false;
  const view = await mount(undefined, { markRead: async () => { marked = true; } });
  try {
    await open(); await click(button('Open record')); await settle();
    assert.equal(marked, true); assert.equal(view.host.querySelector('[data-location]').textContent, '/invoices/7');
    assert.equal(notificationDestination({ module: 'invoices', entityId: '//evil.test' }, user), null);
    assert.equal(notificationDestination({ module: 'payments', entityId: 7 }, user), null);
    assert.equal(notificationDestination({ module: '__proto__', entityId: 7 }, user), null);
  } finally { await view.close(); }
});

test('profile menu and bell popup stay mutually exclusive', async () => {
  localStorage.setItem('billing_auth_user', JSON.stringify(user));
  const view = await mount(<DashboardHeader onSignOut={() => {}} />);
  try {
    await open(); await click(view.host.querySelector('[aria-label="Open profile menu"]')); await settle();
    assert.equal(view.host.querySelector('[title="Notifications"]').getAttribute('aria-expanded'), 'false');
    assert.ok(view.host.querySelector('.bd-profile-menu'));
    await open(); assert.equal(view.host.querySelector('.bd-profile-menu'), null);
  } finally { await view.close(); localStorage.removeItem('billing_auth_user'); }
});

test('query caches isolate tenants and users; signed-out bell makes no API calls', async () => {
  const view = await mount();
  try { assert.ok(view.client.getQueryData(['notification-inbox', 1, 'user-1', 'count']) === 1); assert.equal(view.client.getQueryData(['notification-inbox', 2, 'user-1', 'count']), undefined); }
  finally { await view.close(); }
  let calls = 0;
  const signedOut = await mount(<NotificationBell user={null} />, { unreadCount: async () => { calls++; return 0; }, list: async () => { calls++; return page(); } });
  try { await open(); assert.equal(calls, 0); assert.match(document.querySelector('[role="alert"]').textContent, /unavailable/); }
  finally { await signedOut.close(); }
});

test('API adapter validates response envelopes and uses inbox-only endpoints', async () => {
  const originalGet = apiClient.get; const originalPatch = apiClient.patch; const calls = [];
  apiClient.get = async (url, config) => { calls.push([url, config]); return { success: true, data: url.endsWith('unread-count') ? { unreadCount: 2 } : page([item], 21, config.params.pageNumber) }; };
  apiClient.patch = async (url, body) => { calls.push([url, body]); return { success: true, data: true }; };
  try {
    const signal = new AbortController().signal;
    assert.equal(await inbox.unreadCount(signal), 2);
    await inbox.list({ unreadOnly: true, pageNumber: 2 }, signal);
    assert.deepEqual(calls[1][1].params, { unreadOnly: true, pageNumber: 2, pageSize: 20 });
    assert.equal(calls[1][1].signal, signal);
    await inbox.markRead('n/1'); assert.match(calls[2][0], /inbox\/n%2F1\/read$/);
    await inbox.markAllRead('2026-11-03T10:00:00Z'); assert.deepEqual(calls[3][1], { throughCreatedAtUtc: '2026-11-03T10:00:00Z' });
    assert.throws(() => parseInboxPage({ success: false, data: page() }));
    assert.throws(() => parseInboxPage(page([{ ...item, isRead: undefined }])));
    assert.throws(() => parseInboxPage(page([item, item])));
  } finally { apiClient.get = originalGet; apiClient.patch = originalPatch; }
});

test('navbar logout requires confirmation; cancel, Escape and backdrop preserve the session', async () => {
  let calls = 0;
  localStorage.setItem('billing_auth_token', 'confirmation-test-token');
  const view = await mount(<DashboardHeader onSignOut={() => calls++} />);
  const request = async () => {
    await click(view.host.querySelector('[aria-label="Open profile menu"]'));
    await click(view.host.querySelector('.bd-profile-menu'));
    await settle();
    assert.equal(calls, 0);
    assert.equal(localStorage.getItem('billing_auth_token'), 'confirmation-test-token');
    assert.ok(document.querySelector('[role="dialog"]'));
  };
  try {
    await request(); await click(button('Cancel')); await settle();
    assert.equal(calls, 0);
    await request();
    await act(async () => Simulate.keyDown(document.querySelector('.MuiModal-root'), { key: 'Escape', keyCode: 27 }));
    await settle(); assert.equal(calls, 0);
    await request();
    await click(document.querySelector('.MuiBackdrop-root')); await settle(); assert.equal(calls, 0);
    await request();
    const confirm = document.querySelector('[aria-label="Confirm sign out"]');
    await act(async () => { Simulate.click(confirm); Simulate.click(confirm); });
    assert.equal(calls, 1);
  } finally { await view.close(); localStorage.removeItem('billing_auth_token'); }
});