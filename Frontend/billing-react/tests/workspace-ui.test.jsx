import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormDraftProvider } from '../src/context/FormDraftContext';
import { RecordPayment } from '../src/pages/Payments/RecordPayment';
import { Payments } from '../src/pages/Payments/Payments';
import React, { act, useState } from 'react';
import { readFileSync } from 'node:fs';
import { DateRangeFilter } from '../src/components/DateRangeFilter';
import { InvoiceDateRangeFilter } from '../src/pages/Invoices/components/InvoiceDateRangeFilter';
import { DashboardFilters } from '../src/components/dashboard/DashboardFilters';
import { OutstandingAging } from '../src/components/dashboard/DashboardCharts';
import { DashboardRecords } from '../src/pages/Dashboard/Dashboard';
import { CustomerFilters } from '../src/pages/Customers/components/CustomerTable';
import { defaultDashboardFilters } from '../src/pages/Dashboard/dashboardModel';
import { historyParams } from '../src/pages/Notifications/notificationService';
import { auditQuery } from '../src/pages/AuditActivity/auditModel';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes, Link, useLocation } from 'react-router-dom';
import { apiClient } from 'billing-api-client';
import { CountryConfiguration } from '../src/pages/Settings/CountryConfiguration';
import { SettingsLanding } from '../src/pages/Settings/SettingsLanding';
import { regionalSettingsService, COUNTRIES_LIST } from '../src/services/regionalSettingsService';
import { Login } from '../src/pages/Login/Login';
import { StatCard, summaryDestination } from '../src/components/dashboard/StatCard';
import { displayDate, displayDateTime, localCalendarDate } from '../src/utils/localDate';

const Location = () => <output data-location>{useLocation().pathname}</output>;
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
const click = element => act(async () => { assert.ok(element); Simulate.click(element, { button: 0 }); });
const button = (host, text) => [...host.querySelectorAll('button')].find(node => node.textContent.trim() === text);
async function mount(children, path = '/') {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}<Location /></MemoryRouter>));
  await settle();
  return { host, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const countries = <Routes><Route path="/settings/countries" element={<CountryConfiguration />} /><Route path="/settings" element={<SettingsLanding />} /></Routes>;

test('Country confirmation waits for server success, prevents duplicates and redirects with success feedback', async () => {
  localStorage.clear();
  const original = apiClient.put; const calls = []; let resolve;
  apiClient.put = (url, payload) => { calls.push({ url, payload }); return new Promise(done => { resolve = done; }); };
  const ui = await mount(countries, '/settings/countries');
  try {
    await act(async () => Simulate.change(ui.host.querySelector('[aria-label="Select India"]'), { target: { checked: true } }));
    const save = button(ui.host, 'Save Changes');
    await act(async () => { Simulate.click(save); Simulate.click(save); });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/v1/settings/country');
    assert.deepEqual(calls[0].payload, { countries: [{ country: 'India', countryCode: 'IN', phoneCode: '+91', currency: 'INR' }] });
    assert.equal(regionalSettingsService.getSelectedCountries().length, 0);
    assert.equal(ui.host.querySelector('[data-location]').textContent, '/settings/countries');
    await act(async () => resolve({ success: true, message: 'Country settings saved.' })); await settle();
    assert.equal(ui.host.querySelector('[data-location]').textContent, '/settings');
    assert.match(document.body.textContent, /Country settings saved\./);
    assert.deepEqual(regionalSettingsService.getSelectedCountries().map(country => country.code), ['IN']);
  } finally { await ui.close(); apiClient.put = original; localStorage.clear(); }
});

test('Country save failure keeps selection and prior persisted settings and allows retry', async () => {
  localStorage.clear();
  localStorage.setItem('invoice_billing_selected_countries_default', JSON.stringify(['India']));
  const original = apiClient.put;
  apiClient.put = async () => ({ success: false, message: 'Country settings are unavailable.' });
  const ui = await mount(countries, '/settings/countries');
  try {
    await act(async () => Simulate.change(ui.host.querySelector('[aria-label="Select Canada"]'), { target: { checked: true } }));
    await click(button(ui.host, 'Save Changes')); await settle();
    assert.equal(ui.host.querySelector('[data-location]').textContent, '/settings/countries');
    assert.equal(ui.host.querySelector('[aria-label="Select Canada"]').checked, true);
    assert.deepEqual(regionalSettingsService.getSelectedCountries().map(country => country.code), ['IN']);
    assert.match(document.body.textContent, /Country settings are unavailable/);
    assert.equal(button(ui.host, 'Save Changes').disabled, false);
    apiClient.put = async () => { throw new Error('Connection lost'); };
    await click(button(ui.host, 'Save Changes')); await settle();
    assert.match(document.body.textContent, /Connection lost/);
    assert.equal(ui.host.querySelector('[aria-label="Select Canada"]').checked, true);
  } finally { await ui.close(); apiClient.put = original; localStorage.clear(); }
});

test('Login password visibility has matching icons, accessible actions and an unchanged value', async () => {
  localStorage.clear();
  const ui = await mount(<Login />, '/login');
  try {
    const input = ui.host.querySelector('#password');
    await act(async () => { input.value = 'Retained-password'; Simulate.change(input, { target: { name: 'password', value: input.value } }); });
    assert.equal(input.type, 'password');
    let toggle = ui.host.querySelector('[aria-label="Show password"]');
    assert.ok(toggle.querySelector('[data-testid="VisibilityOffIcon"]'));
    assert.equal(toggle.type, 'button');
    toggle.focus(); assert.equal(document.activeElement, toggle);
    for (let index = 0; index < 4; index++) {
      await click(toggle);
      const visible = index % 2 === 0;
      assert.equal(input.type, visible ? 'text' : 'password');
      assert.equal(input.value, 'Retained-password');
      toggle = ui.host.querySelector(`[aria-label="${visible ? 'Hide' : 'Show'} password"]`);
      assert.equal(toggle.getAttribute('aria-pressed'), String(visible));
      assert.ok(toggle.querySelector(`[data-testid="${visible ? 'Visibility' : 'VisibilityOff'}Icon"]`));
    }
    assert.match(ui.host.textContent, /Forgot password\?/);
    await click(button(ui.host, 'Create an account'));
    assert.equal(ui.host.querySelector('[data-location]').textContent, '/register');
  } finally { await ui.close(); }
});

test('Every available Dashboard summary is a native accessible link to the supported module', async () => {
  const stats = [
    ['invoiced', 'Total Invoiced', 'invoice', '/invoices'], ['paid', 'Total Paid', 'paid', '/payments'],
    ['outstanding', 'Outstanding', 'wallet', '/invoices'], ['overdue', 'Overdue', 'warning', '/invoices'],
    ['drafts', 'Draft Invoices', 'draft', '/invoices'],
  ];
  for (const [id, label, icon, destination] of stats) {
    assert.equal(summaryDestination(id), destination);
    const ui = await mount(<StatCard data={{ id, label, icon, value: 20, currency: 'INR', meta: 'Records' }} />);
    try {
      const link = ui.host.querySelector('a');
      assert.equal(link.getAttribute('href'), destination);
      assert.ok(link.classList.contains('dashboard-clickable-card'));
      assert.ok(link.querySelector('.dashboard-kpi-value'));
      assert.equal(link.tabIndex, 0);
      link.focus(); assert.equal(document.activeElement, link);
      await click(link);
      assert.equal(ui.host.querySelector('[data-location]').textContent, destination);
    } finally { await ui.close(); }
  }
  const unavailable = await mount(<StatCard data={{ id: 'paid', label: 'Total Paid', icon: 'paid', value: null }} />);
  try { assert.equal(unavailable.host.querySelector('a'), null); }
  finally { await unavailable.close(); }
});

test('Forgot Password still opens the existing recovery form without submitting Login', async () => {
  const ui = await mount(<Login />, '/login');
  try {
    await click(button(ui.host, 'Forgot password?'));
    assert.match(ui.host.textContent, /Reset password/);
    assert.equal(ui.host.querySelector('#password'), null);
    assert.ok(ui.host.querySelector('input[type="email"]'));
    assert.equal(ui.host.querySelector('[data-location]').textContent, '/login');
  } finally { await ui.close(); }
});

test('Invoice date format preserves supplied calendar dates and IST timestamps across time zones', () => {
  const old = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Pacific/Honolulu', 'Asia/Kolkata']) {
      process.env.TZ = zone;
      assert.equal(displayDate('2026-01-01'), '01/01/2026');
      assert.equal(displayDate('2026-01-01T23:59:00Z'), '01/01/2026');
      assert.equal(displayDate('01/01/2026'), '01/01/2026');
      assert.match(displayDateTime('2026-01-01T23:59:00Z'), /02\/01\/2026.*05:29:00.*IST/);
      assert.equal(displayDateTime('2026-01-01T23:59:00'), displayDateTime('2026-01-01T23:59:00Z'));
      assert.equal(displayDateTime('2026-01-01T23:59:00Z'), displayDateTime('2026-01-02T05:29:00+05:30'));
      assert.equal(localCalendarDate(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
    }
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
  assert.equal(displayDateTime('invalid'), 'Unavailable');
  assert.equal(COUNTRIES_LIST.length, 195);
});

// Existing table, API, notification and Payment regressions use test-only fixtures.
import './notifications-ui.test';


const changeInput = async (input, value) => act(async () => { input.value = value; Simulate.change(input, { target: { value, name: input.name } }); });
const bodyButton = text => [...document.body.querySelectorAll('button')].find(node => node.textContent.trim() === text);

test('Shared Invoice Date Range stages local dates, rejects reversed dates, applies and clears both endpoints', async () => {
  assert.equal(DateRangeFilter, InvoiceDateRangeFilter);
  const calls = [];
  function Range() { const [range, setRange] = useState({ startDate: '', endDate: '' }); return <DateRangeFilter {...range} onApply={value => { calls.push(value); setRange(value); }} />; }
  const ui = await mount(<Range />);
  try {
    await click(ui.host.querySelector('.date-range-filter')); await settle();
    const from = document.body.querySelector('[aria-label="From Date"]');
    const to = document.body.querySelector('[aria-label="To Date"]');
    await changeInput(from, '2026-10-15'); await changeInput(to, '2026-10-01');
    assert.equal(bodyButton('Apply').disabled, true); assert.equal(calls.length, 0);
    assert.equal(to.min, '2026-10-15');
    await changeInput(to, '2026-10-20'); await act(async () => Simulate.submit(document.body.querySelector('form.date-range-form')));
    assert.deepEqual(calls, [{ startDate: '2026-10-15', endDate: '2026-10-20' }]);
    assert.match(ui.host.textContent, /15\/10\/2026.*20\/10\/2026/);
    await settle(); await click(ui.host.querySelector('.date-range-filter')); await settle();
    await click(bodyButton('Clear'));
    assert.deepEqual(calls.at(-1), { startDate: '', endDate: '' });
    assert.match(ui.host.textContent, /Date Range/);
  } finally { await ui.close(); }
});

test('Dashboard range preserves Period, custom selection, reset, search and refresh callbacks', async () => {
  const changes = []; let searches = []; let refreshed = 0;
  function Filters() { const [value, setValue] = useState(defaultDashboardFilters); return <DashboardFilters values={value} onChange={next => { changes.push(next); setValue(next); }} recordsSearch="invoice" onRecordsSearch={value => searches.push(value)} onRefresh={() => refreshed++} />; }
  const ui = await mount(<Filters />);
  try {
    assert.equal(ui.host.querySelectorAll('.date-range-filter').length, 1);
    assert.equal(ui.host.querySelector('input[type="date"]'), null);
    await click(ui.host.querySelector('.date-range-filter')); await settle();
    await changeInput(document.body.querySelector('[aria-label="From Date"]'), '2026-01-03');
    await changeInput(document.body.querySelector('[aria-label="To Date"]'), '2026-01-07');
    await act(async () => Simulate.submit(document.body.querySelector('form.date-range-form')));
    assert.equal(changes.at(-1).start, '2026-01-03'); assert.equal(changes.at(-1).end, '2026-01-07');
    assert.match(ui.host.querySelector('.premium-select-trigger').textContent, /Custom dates/);
    await click(button(ui.host, 'Refresh')); assert.equal(refreshed, 1);
    await click(button(ui.host, 'Reset')); assert.deepEqual(changes.at(-1), defaultDashboardFilters()); assert.deepEqual(searches, ['']);
  } finally { await ui.close(); }
});

test('Customer statement range retains its existing local start/end filters and clears both', async () => {
  const calls = [];
  const ui = await mount(<CustomerFilters title="Statement" filters={{ start: '2026-10-01', end: '2026-10-15', search: '' }} onChange={value => calls.push(value)} />);
  try {
    await click(ui.host.querySelector('.date-range-filter')); await settle();
    await changeInput(document.body.querySelector('[aria-label="From Date"]'), '2026-10-02');
    await act(async () => Simulate.submit(document.body.querySelector('form.date-range-form')));
    assert.deepEqual(calls.at(-1), { start: '2026-10-02', end: '2026-10-15', search: '' });
    await settle(); await click(ui.host.querySelector('.date-range-filter')); await settle(); await click(bodyButton('Clear'));
    assert.deepEqual(calls.at(-1), { start: '', end: '', search: '' });
  } finally { await ui.close(); }
});

test('Date Range actions do not submit the surrounding filter form and IDs are unique', async () => {
  let submits = 0; const applied = [];
  const ui = await mount(<form onSubmit={event => { event.preventDefault(); submits++; }}><DateRangeFilter onApply={range => applied.push(range)} /><DateRangeFilter onApply={() => {}} /></form>);
  try {
    const triggers = ui.host.querySelectorAll('.date-range-filter'); await click(triggers[0]); await settle();
    const id = triggers[0].getAttribute('aria-controls');
    await act(async () => Simulate.submit(document.getElementById(id)));
    assert.equal(submits, 0); assert.equal(applied.length, 1);
    await settle(); await click(triggers[1]); await settle();
    assert.notEqual(triggers[1].getAttribute('aria-controls'), id);
    await act(async () => Simulate.keyDown(document.body.querySelector('[role="dialog"]'), { key: 'Escape' }));
    assert.equal(triggers[1].getAttribute('aria-expanded'), 'false');
  } finally { await ui.close(); }
});

test('Aging keeps complete real currency values, zero buckets, and a separate No due date row', async () => {
  const data = [{ label: 'Current', value: 132973 }, { label: '1-30 Days', value: 157600 }, { label: '31-60 Days', value: 0 }, { label: '61-90 Days', value: 0 }, { label: '90+ Days', value: 0 }, { label: 'No due date', value: 0.30 }];
  const before = JSON.stringify(data);
  const ui = await mount(<OutstandingAging data={data} currency="INR" />);
  try {
    assert.match(ui.host.querySelector('.premium-ring-value > strong').textContent, /2,90,573.30/);
    const rows = [...ui.host.querySelectorAll('.premium-aging-legend > div')];
    assert.equal(rows.length, 6);
    for (const row of rows) { assert.equal(row.children.length, 3); assert.ok(row.children[0].classList.contains('premium-aging-bucket')); assert.match(row.children[1].textContent, /%$/); }
    assert.match(rows[2].children[2].textContent, /0.00/); assert.match(rows[5].textContent, /No due date.*0.30/);
    assert.equal(JSON.stringify(data), before);
  } finally { await ui.close(); }
});

test('Recent Invoice and Payment tables share a boundary, display dates and retain navigation', async () => {
  for (const type of ['invoices', 'payments']) {
    const rows = [{ id: 17, invoiceNumber: 'INV-17', paymentNumber: 'PAY-17', customerName: 'Customer with a readable name', invoiceDate: '2026-10-01', paymentDate: '2026-10-02', totalAmount: 20000, amount: 6, currency: 'INR', status: 'Paid' }];
    const before = JSON.stringify(rows);
    const ui = await mount(<DashboardRecords title={`Recent ${type}`} query={{}} allowed rows={rows} type={type} />);
    try {
      assert.ok(ui.host.querySelector('.premium-table-scroll.ibms-table-frame > table'));
      assert.equal(ui.host.querySelector('thead th:nth-child(3)').textContent, 'Amount');
      assert.match(ui.host.querySelector('tbody td:nth-child(3)').textContent, type === 'invoices' ? /20,000.00/ : /6.00/);
      assert.equal(ui.host.querySelector('header a').getAttribute('href'), `/${type}`);
      assert.equal(ui.host.querySelector('tbody a').getAttribute('href'), `/${type}/17`);
      assert.equal(JSON.stringify(rows), before);
    } finally { await ui.close(); }
  }
});

test('Shared table and Dashboard styles enforce all boundaries, nowrap values and consistent interactive states', () => {
  const css = readFileSync('src/styles/WorkspaceUI.css', 'utf8');
  assert.match(css, /\.app-layout \.ibms-table-frame\s*\{[^}]*border: 1px solid/);
  assert.match(css, /overflow: auto/); assert.match(css, /border-radius: 14px/);
  assert.doesNotMatch(css, /ibms-table-frame \.ibms-table-frame[^}]*border: 0/);
  assert.match(css, /nth-child\(3\)\s*\{ text-align: left; white-space: nowrap/);
  assert.match(css, /premium-stat > strong[^}]*white-space: nowrap/);
  const dashboard = readFileSync('src/styles/DashboardPremium.css', 'utf8');
  assert.match(dashboard, /premium-aging-legend > div[^}]*grid-template-columns:[^;]+;[^}]*border: 1px solid/s);
  assert.match(dashboard, /premium-stat-link:hover, \.premium-actions a:hover/);
});

test('Login empty and invalid submissions stay blocked and errors survive focus and visibility toggles', async () => {
  const ui = await mount(<Login />, '/login');
  try {
    const form = ui.host.querySelector('form');
    await act(async () => Simulate.submit(form)); await settle();
    assert.match(ui.host.textContent, /Work email is required/); assert.match(ui.host.textContent, /Password is required/);
    const password = ui.host.querySelector('#password');
    await act(async () => { password.focus(); Simulate.focus(password); Simulate.blur(password); }); await settle();
    await click(ui.host.querySelector('[aria-label="Show password"]'));
    assert.match(ui.host.textContent, /Password is required/); assert.equal(password.type, 'text');
    await changeInput(ui.host.querySelector('#email'), 'invalid');
    await act(async () => Simulate.submit(form)); await settle();
    assert.match(ui.host.textContent, /Please enter a valid work email/);
    assert.equal(ui.host.querySelector('[data-location]').textContent, '/login');
  } finally { await ui.close(); }
});

test('Audit and Communication History still serialize their original IST boundary parameters', () => {
  const range = { startDate: '2026-10-01', endDate: '2026-10-15' };
  const audit = auditQuery(range, 1, 20); const history = historyParams({ ...range, pageNumber: 1, pageSize: 20 });
  assert.equal(audit.StartDate, '2026-09-30T18:30:00.000Z'); assert.equal(audit.EndDate, '2026-10-15T18:29:59.9999999Z');
  assert.equal(history.startDate, audit.StartDate); assert.equal(history.endDate, audit.EndDate);
});


test('All major interactive table scroll containers receive the shared border class', () => {
  for (const file of [
    'pages/Products/components/ProductTable.jsx', 'pages/Products/pages/CategoryList.jsx',
    'pages/Payments/Payments.jsx', 'pages/Customers/pages/CustomerListPage.jsx',
    'pages/Customers/components/CustomerTable.jsx', 'pages/CreditNotes/pages/CreditNoteList.jsx',
    'pages/Quotations/pages/QuotationList.jsx', 'pages/AuditActivity/AuditActivity.jsx',
    'pages/Notifications/NotificationHistory.jsx', 'pages/Notifications/NotificationTemplates.jsx',
    'pages/Settings/ChargesConfiguration.jsx', 'pages/Settings/DiscountConfiguration.jsx',
    'pages/Settings/DiscountRules.jsx', 'pages/Taxes/Taxes.jsx',
  ]) assert.match(readFileSync(`src/${file}`, 'utf8'), /ibms-table-frame/, file);
});


test('Record Payment Back navigation retains unsaved Notes and the original local payment date', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  client.setQueryData(['payment-user'], { roles: ['TenantAdmin'] });
  client.setQueryData(['payment-invoices'], []);
  const ui = await mount(<QueryClientProvider client={client}><FormDraftProvider><Routes>
    <Route path="/payments/new" element={<RecordPayment />} />
    <Route path="/payments" element={<Link to="/payments/new">Return to Record Payment</Link>} />
  </Routes></FormDraftProvider></QueryClientProvider>, '/payments/new');
  try {
    const form = ui.host.querySelector('.payment-entry-form'); assert.ok(form);
    const notes = form.querySelector('textarea:not([aria-hidden="true"])');
    await changeInput(notes, 'Unsaved payment note');
    assert.ok(button(ui.host, 'Back to Payments').classList.contains('workspace-back-button'));
    const dateInput = [...form.querySelectorAll('input')].find(node => node.value === displayDate(localCalendarDate()));
    assert.ok(dateInput);
    await click(button(ui.host, 'Back to Payments'));
    assert.equal(ui.host.querySelector('[data-location]').textContent, '/payments');
    await act(async () => ui.host.querySelector('a').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))); await settle();
    assert.equal(ui.host.querySelector('textarea:not([aria-hidden="true"])').value, 'Unsaved payment note');
    assert.ok([...ui.host.querySelectorAll('input')].some(node => node.value === displayDate(localCalendarDate())));
  } finally { await ui.close(); client.clear(); }
});

test('Payments compact filters preserve Date Range, clear, sorting and server pagination state', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  client.setQueryData(['payment-user'], { roles: ['TenantAdmin'] });
  const original = apiClient.get; const calls = [];
  apiClient.get = async (url, config) => {
    assert.equal(url, '/api/v1/payments'); calls.push(config.params);
    return { success: true, data: { items: [], totalCount: 30, pageNumber: config.params.pageNumber, pageSize: config.params.pageSize } };
  };
  const ui = await mount(<QueryClientProvider client={client}><Payments /></QueryClientProvider>, '/payments');
  try {
    const filters = ui.host.querySelector('[aria-label="Payment filters"]');
    assert.ok(filters.querySelector('.payment-filter-actions .date-range-filter'));
    const fields = [...filters.querySelectorAll('.MuiTextField-root')];
    const choose = async (label, option) => {
      const field = fields.find(node => node.querySelector('label')?.textContent === label);
      await act(async () => Simulate.mouseDown(field.querySelector('[role="combobox"]'), { button: 0 }));
      await click([...document.body.querySelectorAll('[role="option"]')].find(node => node.textContent === option)); await settle();
    };
    await choose('Status', 'Completed'); assert.equal(calls.at(-1).status, 'Completed');
    await choose('Payment Method', 'Cash'); assert.equal(calls.at(-1).method, 'Cash');
    await changeInput(filters.querySelector('.payment-search input'), 'receipt');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); }); await settle();
    assert.equal(calls.at(-1).search, 'receipt');

    await click(filters.querySelector('.date-range-filter')); await settle();
    await changeInput(document.body.querySelector('[aria-label="From Date"]'), '2026-10-01');
    await changeInput(document.body.querySelector('[aria-label="To Date"]'), '2026-10-15');
    await act(async () => Simulate.submit(document.body.querySelector('.date-range-form'))); await settle();
    assert.equal(calls.at(-1).fromDate, '2026-10-01'); assert.equal(calls.at(-1).toDate, '2026-10-15');
    await click([...ui.host.querySelectorAll('.MuiTableSortLabel-root')].find(node => node.textContent === 'Amount')); await settle();
    assert.equal(calls.at(-1).sortBy, 'amount');
    await click(ui.host.querySelector('[aria-label="Go to page 2"]')); await settle();
    assert.equal(calls.at(-1).pageNumber, 2);
    await click(button(ui.host, 'Clear Filters')); await settle();
    // Clearing can reuse the already-cached unfiltered query without another API call.
    const cleared = client.getQueryCache().findAll({ queryKey: ['payments', 'list'], type: 'active' })[0].queryKey[2];
    for (const key of ['status', 'method', 'search', 'from', 'to']) assert.equal(cleared[key], '');
    assert.equal(cleared.pageNumber, 1);
    assert.equal(filters.querySelector('.payment-search input').value, '');
    assert.equal(filters.querySelector('.date-range-filter').textContent, 'Date Range');
    assert.ok(ui.host.querySelector('.payment-list-table.ibms-table-frame > table'));
  } finally { await ui.close(); client.clear(); apiClient.get = original; }
});

test('Payment compact styling and Notification page gutters use scoped existing workspace rules', () => {
  const spacing = readFileSync('src/styles/ModuleSpacing.css', 'utf8'); assert.match(spacing, /\.notification-page,/);
  const payments = readFileSync('src/styles/Payments.css', 'utf8');
  assert.match(payments, /payment-filters \.MuiOutlinedInput-root \{ height: 42px/);
  assert.match(payments, /payment-entry-form \.MuiOutlinedInput-root:not\(\.MuiInputBase-multiline\)[^}]*height: 42px/);
  assert.match(payments, /payment-list-table\.ibms-table-frame[^}]*border: 1px solid[^}]*overflow-x: auto/s);
  const notifications = readFileSync('src/pages/Notifications/notifications.css', 'utf8');
  assert.match(notifications, /notification-data-table \.ant-table-container[^}]*border: 1px solid[^}]*overflow: hidden/s);
});
