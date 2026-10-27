import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from 'billing-api-client';
import { ProtectedRoute } from '../src/routes/ProtectedRoute';
import { queryClient } from '../src/queryClient';

async function mount(validate, token, path = '/dashboard') {
  localStorage.clear();
  if (token !== undefined) {
    localStorage.setItem('billing_auth_token', token);
    localStorage.setItem('billing_auth_user', JSON.stringify({ userId: 99 }));
  }
  const original = apiClient.get;
  const calls = []; let mounts = 0;
  apiClient.get = (...args) => { calls.push(args); return validate(...args); };
  function PrivatePage() {
    useEffect(() => { mounts++; }, []);
    return <><span>Private billing data</span><Link to="/customers">Customers</Link></>;
  }
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/login" element={<span>Login page</span>} />
      <Route element={<ProtectedRoute><PrivatePage /></ProtectedRoute>}>
        <Route path="/dashboard" element={<span />} /><Route path="/customers/*" element={<span />} /><Route path="/settings/*" element={<span />} />
      </Route>
    </Routes>
  </MemoryRouter>));
  return { host, calls, get mounts() { return mounts; }, close: async () => { await act(async () => root.unmount()); host.remove(); apiClient.get = original; queryClient.clear(); localStorage.clear(); } };
}

for (const path of ['/dashboard', '/customers/create', '/settings/taxes']) {
  test(`direct ${path} without a token redirects before private content mounts`, async () => {
    const view = await mount(() => { throw new Error('Must not request'); }, undefined, path);
    try { assert.match(view.host.textContent, /Login page/); assert.equal(view.calls.length, 0); assert.equal(view.mounts, 0); } finally { await view.close(); }
  });
}

test('private content waits for backend validation; normal navigation preserves its mount', async () => {
  let resolve;
  const view = await mount(() => new Promise(done => { resolve = done; }), 'valid-token');
  try {
    assert.match(view.host.textContent, /Loading\.\.\./);
    assert.equal(view.mounts, 0);
    assert.equal(view.calls[0][0], '/api/Auth/me');
    assert.equal(view.calls[0][1].skipAuthRedirect, true);
    await act(async () => resolve({ userId: 1, role: 'TenantAdmin' }));
    assert.match(view.host.textContent, /Private billing data/);
    assert.equal(JSON.parse(localStorage.getItem('billing_auth_user')).userId, 1);
    await act(async () => Simulate.click(view.host.querySelector('a'), { button: 0 }));
    assert.equal(view.mounts, 1); assert.equal(view.calls.length, 1);
  } finally { await view.close(); }
});

for (const status of [401, 403, 404]) {
  test(`backend ${status} clears credentials and redirects to login`, async () => {
    const view = await mount(() => Promise.reject({ response: { status } }), 'invalid-token');
    try {
      assert.match(view.host.textContent, /Login page/);
      assert.equal(view.mounts, 0);
      assert.equal(localStorage.getItem('billing_auth_token'), null);
      assert.equal(localStorage.getItem('billing_auth_user'), null);
    } finally { await view.close(); }
  });
}

test('network failure blocks content without losing the token and supports retry', async () => {
  let failed = true;
  const view = await mount(() => failed ? Promise.reject(new Error('Network error')) : Promise.resolve({ userId: 1 }), 'valid-token');
  try {
    assert.match(view.host.textContent, /Unable to load/); assert.equal(view.mounts, 0);
    assert.match(view.host.textContent, /Unable to reach the server/);
    assert.ok(view.host.querySelector('[data-connection-state=server] svg'));
    assert.equal(localStorage.getItem('billing_auth_token'), 'valid-token');
    failed = false;
    await act(async () => Simulate.click(view.host.querySelector('button')));
    assert.match(view.host.textContent, /Private billing data/); assert.equal(view.calls.length, 2);
    assert.equal(view.host.querySelector('.connection-state-icon'), null);
  } finally { await view.close(); }
});

test('an offline browser gets a network message while retaining its session for retry', async () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  let view;
  try {
    view = await mount(() => Promise.reject({ code: 'ERR_NETWORK', message: 'Network Error' }), 'valid-token');
    assert.match(view.host.textContent, /No internet connection/);
    assert.ok(view.host.querySelector('[data-connection-state=offline] svg'));
    assert.equal(localStorage.getItem('billing_auth_token'), 'valid-token');
    assert.equal(view.mounts, 0);
  } finally {
    if (view) await view.close();
    if (original) Object.defineProperty(navigator, 'onLine', original); else delete navigator.onLine;
  }
});

for (const status of [500, 502, 503, 504]) test(`server ${status} shows server unavailable without logging out`, async () => {
  const view = await mount(() => Promise.reject({ response: { status } }), 'valid-token');
  try {
    assert.match(view.host.textContent, /Server is currently unavailable/);
    assert.ok(view.host.querySelector('[data-connection-state=server] svg'));
    assert.doesNotMatch(view.host.textContent, /check your connection/i);
    assert.equal(localStorage.getItem('billing_auth_token'), 'valid-token');
    assert.equal(view.mounts, 0);
  } finally { await view.close(); }
});

test('session verification timeout shows a slow-server message', async () => {
  const view = await mount(() => Promise.reject({ code: 'ECONNABORTED' }), 'valid-token');
  try { assert.match(view.host.textContent, /server is taking too long/); }
  finally { await view.close(); }
});

test('offline tunnel HTML is a server failure even when the gateway returns 404', async () => {
  const view = await mount(() => Promise.reject({ response: { status: 404, data: '<html>ERR_NGROK_3200: tunnel offline</html>' } }), 'valid-token');
  try {
    assert.match(view.host.textContent, /Server is currently unavailable/);
    assert.ok(view.host.querySelector('[data-connection-state=server] svg'));
    assert.equal(localStorage.getItem('billing_auth_token'), 'valid-token');
    assert.equal(view.mounts, 0);
  } finally { await view.close(); }
});

test('malformed successful responses never unlock protected content', async () => {
  const view = await mount(() => Promise.resolve('<html>Offline tunnel</html>'), 'unverified-token');
  try { assert.match(view.host.textContent, /Unable to load/); assert.equal(view.mounts, 0); } finally { await view.close(); }
});

test('logout in another tab immediately removes access', async () => {
  const view = await mount(() => Promise.resolve({ userId: 1 }), 'valid-token');
  try {
    assert.match(view.host.textContent, /Private billing data/);
    await act(async () => {
      localStorage.removeItem('billing_auth_token');
      window.dispatchEvent(new window.StorageEvent('storage', { key: 'billing_auth_token' }));
    });
    assert.match(view.host.textContent, /Login page/);
  } finally { await view.close(); }
});

test('a stale rejection cannot clear a replacement token', async () => {
  let rejectOld;
  const view = await mount(() => new Promise((resolve, reject) => { rejectOld = reject; }), 'old-token');
  try {
    apiClient.get = () => Promise.resolve({ userId: 2 });
    await act(async () => {
      localStorage.setItem('billing_auth_token', 'new-token');
      window.dispatchEvent(new window.StorageEvent('storage', { key: 'billing_auth_token' }));
    });
    await act(async () => rejectOld({ response: { status: 401 } }));
    assert.equal(localStorage.getItem('billing_auth_token'), 'new-token');
    assert.match(view.host.textContent, /Private billing data/);
  } finally { await view.close(); }
});
