import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFLINE_MESSAGE, SERVER_UNREACHABLE_MESSAGE, SERVER_UNAVAILABLE_MESSAGE, TIMEOUT_MESSAGE, transportErrorMessage } from '../../billing-api-client/transportError.js';
import { apiClient, clearAuthStorage, getUserFriendlyError, saveAuthSession } from '../../billing-api-client/apiClient.js';
import { authApi } from '../../billing-api-client/authApi.js';
import { productRequestError } from '../../billing-api-client/productError.js';
import { errorPresentation } from '../src/utils/errorPresentation.js';

function online(value, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: value } });
  try { return run(); }
  finally { if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator; }
}

test('offline requests explain the network problem across shared, product and display errors', () => online(false, () => {
  const error = { code: 'ERR_NETWORK', request: {}, message: 'Network Error' };
  assert.equal(getUserFriendlyError(error), OFFLINE_MESSAGE);
  assert.equal(productRequestError(error).message, OFFLINE_MESSAGE);
  assert.equal(errorPresentation(error), OFFLINE_MESSAGE);
}));

test('online request failures report an unreachable server without blaming internet connectivity', () => online(true, () => {
  for (const error of [{ code: 'ERR_NETWORK', message: 'Network Error' }, { request: {} }, new TypeError('Failed to fetch')]) {
    assert.equal(getUserFriendlyError(error), SERVER_UNREACHABLE_MESSAGE);
    assert.equal(productRequestError(error).message, SERVER_UNREACHABLE_MESSAGE);
    assert.equal(errorPresentation(error), SERVER_UNREACHABLE_MESSAGE);
  }
  assert.equal(errorPresentation('Backend unavailable. The ngrok tunnel may be offline.'), SERVER_UNREACHABLE_MESSAGE);
}));

test('HTTP 5xx and tunnel failures show server messages and hide raw infrastructure details', () => online(true, () => {
  for (const status of [500, 502, 503, 504]) {
    const error = { response: { status, data: '<html>SqlException: private server information</html>' } };
    assert.equal(getUserFriendlyError(error), SERVER_UNAVAILABLE_MESSAGE);
    assert.equal(productRequestError(error).message, SERVER_UNAVAILABLE_MESSAGE);
    assert.equal(errorPresentation(error), SERVER_UNAVAILABLE_MESSAGE);
  }
  assert.equal(getUserFriendlyError({ response: { status: 404, data: '<html>ERR_NGROK_3200: tunnel offline</html>' } }), SERVER_UNAVAILABLE_MESSAGE);
}));

test('timeouts distinguish slow servers from offline browsers', () => {
  for (const code of ['ECONNABORTED', 'ETIMEDOUT']) {
    online(true, () => assert.equal(getUserFriendlyError({ code }), TIMEOUT_MESSAGE));
    online(false, () => assert.equal(getUserFriendlyError({ code }), OFFLINE_MESSAGE));
  }
});

test('received authorization and validation errors retain their distinct messages', () => online(false, () => {
  assert.equal(transportErrorMessage({ response: { status: 401 } }), null);
  assert.match(getUserFriendlyError({ response: { status: 401 } }), /session has expired/);
  assert.equal(errorPresentation('Currency is required.'), 'Currency is required.');
  assert.equal(getUserFriendlyError({ response: { status: 422, data: { message: 'Currency is required.' } } }), 'Currency is required.');
}));

test('login preserves offline and server messages instead of collapsing them into Network Error', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const post = apiClient.post;
  const browser = { onLine: false };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: browser });
  try {
    apiClient.post = async () => { throw { code: 'ERR_NETWORK', message: 'Network Error' }; };
    const login = () => authApi.login({ email: 'admin@example.com', password: 'test-password' });
    await assert.rejects(login(), error => error.message === OFFLINE_MESSAGE);
    browser.onLine = true;
    await assert.rejects(login(), error => error.message === SERVER_UNREACHABLE_MESSAGE);
    apiClient.post = async () => { throw { response: { status: 503 } }; };
    await assert.rejects(login(), error => error.message === SERVER_UNAVAILABLE_MESSAGE);
  } finally {
    apiClient.post = post;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else delete globalThis.navigator;
  }
});

test('apiClient marks backgroundPoll requests and performs single-flight token refresh on 401', async () => {
  const store = new Map();
  const originalStorage = globalThis.localStorage;
  const originalAdapter = apiClient.defaults.adapter;
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };

  let refreshCalls = 0;
  let invoicesAttempts = 0;
  let backgroundHeaderSeen = null;

  saveAuthSession({ token: 'expired-token', refreshToken: 'refresh-1', user: { userId: 2, tenantId: 1 } });

  apiClient.defaults.adapter = async config => {
    if (config.url === '/api/Auth/refresh-token') {
      refreshCalls++;
      await new Promise(resolve => setTimeout(resolve, 15));
      return {
        data: { success: true, accessToken: 'fresh-token', refreshToken: 'refresh-2', user: { userId: 2, tenantId: 1 } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }
    if (config.url === '/api/v1/notifications/inbox/unread-count') {
      backgroundHeaderSeen = config.headers.get('X-Background-Poll');
      return { data: { success: true, data: { unreadCount: 0 } }, status: 200, statusText: 'OK', headers: {}, config };
    }
    if (config.url === '/api/v1/invoices') {
      invoicesAttempts++;
      if (config.headers.get('Authorization') === 'Bearer expired-token') {
        throw { response: { status: 401, data: { message: 'Session expired' } }, config };
      }
      return { data: { success: true, data: { items: [] } }, status: 200, statusText: 'OK', headers: {}, config };
    }
    throw new Error(`Unexpected URL ${config.url}`);
  };

  try {
    await apiClient.get('/api/v1/notifications/inbox/unread-count', { backgroundPoll: true });
    assert.equal(backgroundHeaderSeen, 'true');

    const [a, b] = await Promise.all([
      apiClient.get('/api/v1/invoices'),
      apiClient.get('/api/v1/invoices'),
    ]);
    assert.equal(refreshCalls, 1);
    assert.equal(invoicesAttempts, 4);
    assert.deepEqual(a.data.items, []);
    assert.deepEqual(b.data.items, []);
    assert.equal(localStorage.getItem('billing_auth_token'), 'fresh-token');
    assert.equal(localStorage.getItem('billing_refresh_token'), 'refresh-2');
  } finally {
    clearAuthStorage();
    apiClient.defaults.adapter = originalAdapter;
    globalThis.localStorage = originalStorage;
  }
});
