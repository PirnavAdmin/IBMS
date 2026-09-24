import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryObserver, keepPreviousData } from '@tanstack/react-query';
import { scheduleSearch, searchParams, prioritizePrefix } from '../src/utils/search.js';
import { filterCustomerRows } from '../src/pages/Customers/components/customerTableUtils.js';

test('first non-space character commits after 300ms; rapid typing cancels pending searches', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  let cancel = scheduleSearch(' R ', value => calls.push(value));
  t.mock.timers.tick(299);
  assert.deepEqual(calls, []);
  t.mock.timers.tick(1);
  assert.deepEqual(calls, ['R']);
  cancel();
  cancel = scheduleSearch('Ra', value => calls.push(value));
  t.mock.timers.tick(100);
  cancel();
  scheduleSearch('Rav', value => calls.push(value));
  t.mock.timers.tick(300);
  assert.deepEqual(calls, ['R', 'Rav']);
});

test('search and clearing reset pagination while preserving filters, sorting and page size', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const pageKey of ['page', 'pageNumber']) {
    const initial = { search: '', [pageKey]: 4, status: 'Inactive', category: '7', customerType: 'Business', taxId: 'GST1', sortBy: 'name', sortOrder: 'desc', pageSize: 25 };
    let params = initial;
    scheduleSearch(' P ', value => { params = searchParams(params, value, pageKey); });
    t.mock.timers.tick(300);
    assert.deepEqual(params, { ...initial, search: 'P', [pageKey]: 1 });
    assert.equal(searchParams(params, ' P ', pageKey), params, 'same normalized search does not refetch');
    scheduleSearch('  ', value => { params = searchParams(params, value, pageKey); });
    t.mock.timers.tick(300);
    assert.deepEqual(params, { ...initial, [pageKey]: 1 });
  }
});

test('local search is case insensitive, preserves status/date filters and ranks prefixes stably', () => {
  const rows = [{ name: 'Arun', status: 'Active', date: '2026-09-01' }, { name: 'Ravi', status: 'Active', date: '2026-09-01' }, { name: 'Raj', status: 'Inactive', date: '2026-09-01' }, { name: 'Ramesh', status: 'Active', date: '2026-09-02' }];
  for (const search of ['r', 'R', ' R ']) {
    const filtered = filterCustomerRows(rows, { search, status: 'Active', start: '2026-09-01', end: '2026-09-02' }, 'date', ['name']);
    assert.deepEqual(prioritizePrefix(filtered, search, row => [row.name]).map(row => row.name), ['Ravi', 'Ramesh', 'Arun']);
  }
});

for (const module of ['customers', 'products']) {
  test(`${module}: query keys isolate late responses, abort old requests and retain rows while fetching`, async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const pending = new Map();
    const options = search => ({ queryKey: [module, 'list', { search, page: 1 }], placeholderData: keepPreviousData,
      queryFn: ({ signal }) => new Promise(resolve => pending.set(search, { resolve, signal })) });
    const observer = new QueryObserver(client, options('R'));
    const unsubscribe = observer.subscribe(() => {});
    try {
      observer.setOptions(options('Ra'));
      observer.setOptions(options('Rav'));
      assert.equal(pending.get('R').signal.aborted, true);
      assert.equal(pending.get('Ra').signal.aborted, true);
      pending.get('Rav').resolve(['Ravi']);
      await new Promise(resolve => setImmediate(resolve));
      pending.get('R').resolve(['Wrong old result']);
      pending.get('Ra').resolve(['Another old result']);
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(observer.getCurrentResult().data, ['Ravi']);
      observer.setOptions(options(''));
      assert.deepEqual(observer.getCurrentResult().data, ['Ravi']);
      pending.get('').resolve(['Full list']);
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(observer.getCurrentResult().data, ['Full list']);
    } finally { unsubscribe(); client.clear(); }
  });
}
