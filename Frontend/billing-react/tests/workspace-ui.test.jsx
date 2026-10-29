import { Register } from '../src/pages/Register/Register';
import { ForgotPassword } from '../src/pages/ForgotPassword/ForgotPassword';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormDraftProvider } from '../src/context/FormDraftContext';
import { RecordPayment } from '../src/pages/Payments/RecordPayment';
import { Payments } from '../src/pages/Payments/Payments';
import React, { act, useState } from 'react';
import { readFileSync } from 'node:fs';
import { DateRangeFilter } from '../src/components/DateRangeFilter';
import { InvoiceDateRangeFilter } from '../src/pages/Invoices/components/InvoiceDateRangeFilter';
import { DashboardFilters } from '../src/components/dashboard/DashboardFilters';
import { OutstandingAging, RevenueChart } from '../src/components/dashboard/DashboardCharts';
import { outstandingInvoiceDetails } from '../src/pages/Dashboard/dashboardRadial';
import { DashboardRecords } from '../src/pages/Dashboard/Dashboard';
import { CustomerFilters } from '../src/pages/Customers/components/CustomerTable';
import { CustomerForm } from '../src/pages/Customers/components/CustomerForm';
import { CustomerEmailLink } from '../src/pages/Customers/components/CustomerEmailLink';
import { defaultDashboardFilters } from '../src/pages/Dashboard/dashboardModel';
import { historyParams } from '../src/pages/Notifications/notificationService';
import { auditQuery } from '../src/pages/AuditActivity/auditModel';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes, Link, useLocation } from 'react-router-dom';
import { apiClient, authApi, customerApi } from 'billing-api-client';
import { CountryConfiguration } from '../src/pages/Settings/CountryConfiguration';
import { SettingsLanding } from '../src/pages/Settings/SettingsLanding';
import { COUNTRIES_LIST } from '../src/services/regionalSettingsService';
import { Login } from '../src/pages/Login/Login';
import { UserRoleAdministration } from '../src/pages/UserRoleAdministration/UserRoleAdministration';
import { userRoleAdministrationService as administrationService } from '../src/pages/UserRoleAdministration/userRoleAdministrationService';
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

test('Enhanced user form preserves validation, role defaults, permission toggles and create payload', async () => {
  localStorage.clear();
  localStorage.setItem('billing_auth_user', JSON.stringify({ tenantId: 1, applicationId: 'billing' }));
  const originals = { listRoles: administrationService.listRoles, listPermissions: administrationService.listPermissions, createUser: administrationService.createUser, getUser: administrationService.getUser };
  const calls = [];
  administrationService.listRoles = async () => [{ name: 'Operator', permissions: ['invoices.view'] }];
  administrationService.listPermissions = async () => [{ code: 'invoices.view', name: 'View invoices', module: 'Invoices' }, { code: 'customers.view', name: 'View customers', module: 'Customers' }];
  administrationService.createUser = async payload => { calls.push(payload); return { message: 'User created', data: { id: 27 } }; };
  administrationService.getUser = async () => ({ id: 27, name: 'Alex Kumar', roles: ['Operator'], permissions: ['invoices.view', 'customers.view'], status: 'Active' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = await mount(<QueryClientProvider client={client}><UserRoleAdministration /></QueryClientProvider>, '/user-role-administration/users/new');
  const input = name => document.getElementById([...ui.host.querySelectorAll('label')].find(label => label.textContent.startsWith(name))?.htmlFor);
  try {
    await click(button(ui.host, 'Create user'));
    assert.equal(calls.length, 0);
    assert.match(ui.host.textContent, /Enter a valid email address/);
    for (const [name, value] of [['Full Name', 'Alex Kumar'], ['Email', 'alex@example.com'], ['Username', 'alex.kumar'], ['Temporary password', 'Temporary123!']]) await act(async () => Simulate.change(input(name), { target: { value } }));
    await act(async () => Simulate.mouseDown(ui.host.querySelector('[aria-labelledby~="ura-user-roles-label"]'), { button: 0 }));
    await click([...document.querySelectorAll('[role="option"]')].find(option => option.textContent === 'Operator'));
    assert.match(ui.host.querySelector('.ura-permission-selection-count').textContent, /1 permission selected/);
    await click(button(ui.host, 'Expand all'));
    assert.ok([...ui.host.querySelectorAll('.ura-user-permission-assignment details')].every(details => details.open));
    const checkbox = [...ui.host.querySelectorAll('.ura-user-permission-assignment label')].find(label => label.textContent.includes('View customers')).querySelector('input');
    await act(async () => Simulate.change(checkbox, { target: { checked: true } }));
    assert.match(ui.host.querySelector('.ura-permission-selection-count').textContent, /2 permissions selected/);
    await click(button(ui.host, 'Collapse all'));
    assert.ok([...ui.host.querySelectorAll('.ura-user-permission-assignment details')].every(details => !details.open));
    await click(button(ui.host, 'Create user')); await settle();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { Name: 'Alex Kumar', Username: 'alex.kumar', Email: 'alex@example.com', Password: 'Temporary123!', TenantId: 1, ApplicationId: 'billing', Roles: ['Operator'], Permissions: ['invoices.view', 'customers.view'], Status: 'Active', IdentityType: 'Platform' });
    assert.equal(ui.host.querySelector('[data-location]').textContent, '/user-role-administration/users/27');
  } finally { await ui.close(); client.clear(); Object.assign(administrationService, originals); localStorage.clear(); }
});

test('Country confirmation waits for server success, prevents duplicates and redirects with success feedback', async () => {
  localStorage.clear();
  localStorage.setItem('billing_auth_token', 'country-test-session');
  localStorage.setItem('billing_auth_user', JSON.stringify({ tenantId: 1, id: 'country-test' }));
  const original = apiClient.put; const originalGet = apiClient.get;
  apiClient.get = async () => ({success:true,data:{countries:[]}}); const calls = []; let resolve;
  apiClient.put = (url, payload) => { calls.push({ url, payload }); return new Promise(done => { resolve = done; }); };
  const ui = await mount(countries, '/settings/countries');
  try {
    await act(async () => Simulate.change(ui.host.querySelector('[aria-label="Select India"]'), { target: { checked: true } }));
    const save = button(ui.host, 'Save Changes');
    await act(async () => { Simulate.click(save); Simulate.click(save); });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/v1/settings/country');
    assert.deepEqual(calls[0].payload, { countries: [{ country: 'India', countryCode: 'IN', phoneCode: '+91', currency: 'INR' }] });
    assert.equal(ui.host.querySelector('[data-location]').textContent, '/settings/countries');
    await act(async () => resolve({ success: true, message: 'Country settings saved.', data:{countries:[{countryCode:'IN',country:'India',phoneCode:'+91',currency:'INR'}]} })); await settle();
    assert.equal(ui.host.querySelector('[data-location]').textContent, '/settings');
    assert.match(document.body.textContent, /Country settings saved\./);
  } finally { await ui.close(); apiClient.put = original; apiClient.get = originalGet; localStorage.clear(); }
});

test('Country save failure keeps the draft, ignores legacy settings and allows retry', async () => {
  localStorage.clear();
  localStorage.setItem('invoice_billing_selected_countries_default', JSON.stringify(['India']));
  const original = apiClient.put; const originalGet = apiClient.get;
  localStorage.setItem('billing_auth_token', 'country-error-session');
  apiClient.get = async () => ({success:true,data:{countries:[]}});
  apiClient.put = async () => ({ success: false, message: 'Country settings are unavailable.' });
  const ui = await mount(countries, '/settings/countries');
  try {
    await act(async () => Simulate.change(ui.host.querySelector('[aria-label="Select Canada"]'), { target: { checked: true } }));
    await click(button(ui.host, 'Save Changes')); await settle();
    assert.equal(ui.host.querySelector('[data-location]').textContent, '/settings/countries');
    assert.equal(ui.host.querySelector('[aria-label="Select Canada"]').checked, true);
    assert.doesNotMatch(ui.host.textContent, /Country settings API is unavailable/);
    assert.match(document.body.textContent, /Country settings are unavailable/);
    assert.equal(button(ui.host, 'Save Changes').disabled, false);
    apiClient.put = async () => { throw new Error('Connection lost'); };
    await click(button(ui.host, 'Save Changes')); await settle();
    assert.match(document.body.textContent, /Connection lost/);
    assert.equal(ui.host.querySelector('[aria-label="Select Canada"]').checked, true);
  } finally { await ui.close(); apiClient.put = original; apiClient.get = originalGet; localStorage.clear(); }
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
    ['invoiced', 'Total Invoiced', 'invoice', '/invoices?paymentState=Invoiced'], ['paid', 'Total Paid', 'paid', '/payments?status=Completed'],
    ['outstanding', 'Outstanding', 'wallet', '/invoices?paymentState=Outstanding'], ['overdue', 'Overdue', 'warning', '/invoices?paymentState=Overdue'],
    ['drafts', 'Draft Invoices', 'draft', '/invoices?status=Draft'],
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
      assert.equal(ui.host.querySelector('[data-location]').textContent, destination.split('?')[0]);
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


const changeInput = async (input, value) => {
  await act(async () => { input.value = value; Simulate.change(input, { target: { value, name: input.name } }); });
  if (input.closest('.ant-picker')) await act(async () => Simulate.keyDown(input, { key: 'Enter' }));
};
const bodyButton = text => [...document.body.querySelectorAll('button')].find(node => node.textContent.trim() === text);

test('Shared Invoice Date Range stages local dates, rejects reversed dates, applies and clears both endpoints', async () => {
  assert.equal(DateRangeFilter, InvoiceDateRangeFilter);
  const calls = [];
  function Range() { const [range, setRange] = useState({ startDate: '', endDate: '' }); return <DateRangeFilter {...range} onApply={value => { calls.push(value); setRange(value); }} />; }
  const ui = await mount(<Range />);
  try {
    await click(ui.host.querySelector('.date-range-filter')); await settle();
    assert.equal(bodyButton('Apply').disabled, true);
    const from = document.body.querySelector('[aria-label="From Date"]');
    const to = document.body.querySelector('[aria-label="To Date"]');
    await changeInput(from, '2026-10-15'); await changeInput(to, '2026-10-01');
    assert.equal(bodyButton('Apply').disabled, true); assert.equal(calls.length, 0);
    assert.notEqual(to.type, 'date', 'Use the themed calendar instead of the browser calendar');
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
    await click(button(ui.host, 'Reset')); assert.deepEqual(changes.at(-1), defaultDashboardFilters());
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
    assert.equal(submits, 0); assert.equal(applied.length, 0);
    await click(bodyButton('Clear'));
    await settle(); await click(triggers[1]); await settle();
    assert.notEqual(triggers[1].getAttribute('aria-controls'), id);
    await click(document.body.querySelector('.date-range-modal button[aria-label="Close"]'));
    assert.equal(triggers[1].getAttribute('aria-expanded'), 'false');
  } finally { await ui.close(); }
});

test('Aging keeps complete real currency values, zero buckets, and a separate No due date row', async () => {
  const data = [{ label: 'Current', value: 132973 }, { label: '1-30 Days', value: 157600 }, { label: '31-60 Days', value: 0 }, { label: '61-90 Days', value: 0 }, { label: '90+ Days', value: 0 }, { label: 'No due date', value: 0.30 }];
  const before = JSON.stringify(data);
  const ui = await mount(<OutstandingAging data={data} currency="INR" />);
  try {
    assert.match(ui.host.querySelector('.premium-ring-value > strong').textContent, /2,90,573.30/);
    const rows = [...ui.host.querySelectorAll('.premium-aging-legend > button')];
    assert.equal(rows.length, 6);
    for (const row of rows) { assert.ok(row.children[0].classList.contains('premium-aging-bucket')); assert.match(row.children[1].textContent, /%$/); }
    assert.match(rows[2].children[2].textContent, /0.00/); assert.match(rows[5].textContent, /No due date.*0.30/);
    assert.equal(JSON.stringify(data), before);
  } finally { await ui.close(); }
});

test('Dashboard currency replaces recent search and drilldowns retain range and currency', async () => {
  const chosen = [];
  const ui = await mount(<DashboardFilters values={{ start: '2026-10-01', end: '2026-10-23' }} onChange={() => {}} onRefresh={() => {}} currencies={['INR', 'USD']} currency="INR" onCurrencyChange={value => chosen.push(value)} />);
  try {
    assert.equal(ui.host.querySelector('input[type="search"]'), null);
    await act(async () => Simulate.change(ui.host.querySelector('select'), { target: { value: 'USD' } }));
    assert.deepEqual(chosen, ['USD']);
    const destination = new URL(summaryDestination('outstanding', { start: '2026-10-01', end: '2026-10-23' }, 'USD'), 'http://localhost');
    assert.equal(destination.pathname, '/invoices');
    assert.deepEqual(Object.fromEntries(destination.searchParams), { paymentState: 'Outstanding', startDate: '2026-10-01', endDate: '2026-10-23', currency: 'USD' });
  } finally { await ui.close(); }
});

test('Aging details exclude drafts and other currencies and classify every due date boundary', () => {
  const dates = ['2026-10-23', '2026-10-22', '2026-10-21', '2026-09-22', '2026-09-21', '2026-08-23', '2026-08-22', '2026-07-24', '2026-07-23', null];
  const invoices = dates.map((dueDate, id) => ({ id, dueDate, currency: 'INR', status: 'Issued', balanceAmount: 100 }));
  const excluded = ['Draft', 'Cancelled', 'Voided'].map((status, id) => ({ ...invoices[0], id: id + 20, status }));
  const rows = outstandingInvoiceDetails([...invoices, ...excluded, { ...invoices[0], currency: 'USD' }, { ...invoices[0], balanceAmount: 0 }], 'INR', new Date('2026-10-22T10:00:00Z'));
  assert.deepEqual(rows.map(row => row.agingBucket), ['Current', 'Current', '1–30 Days', '1–30 Days', '31–60 Days', '31–60 Days', '61–90 Days', '61–90 Days', '90+ Days', 'No due date']);
});

test('Aging hover previews balances and selecting a bucket filters invoice details', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const overdueDate = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const invoices = [{ id: 1, invoiceNumber: 'INV-CURRENT', customerName: 'Current Customer', currency: 'INR', status: 'Issued', balanceAmount: 400, dueDate: today }, { id: 2, invoiceNumber: 'INV-OVERDUE', customerName: 'Overdue Customer', currency: 'INR', status: 'Overdue', balanceAmount: 600, dueDate: overdueDate }];
  const ui = await mount(<OutstandingAging data={[{ label: 'Current', value: 400 }, { label: '1?30 Days', value: 600 }]} invoices={invoices} currency="INR" />);
  try {
    const rows = ui.host.querySelectorAll('.premium-aging-legend > button');
    await act(async () => Simulate.mouseEnter(rows[1]));
    assert.match(ui.host.querySelector('.premium-ring-value > strong').textContent, /600.00/);
    await act(async () => Simulate.mouseLeave(rows[1]));
    assert.match(ui.host.querySelector('.premium-ring-value > strong').textContent, /1,000.00/);
    await click(rows[1]);
    assert.equal(rows[1].getAttribute('aria-pressed'), 'true');
    assert.match(ui.host.querySelector('.premium-outstanding-details').textContent, /INV-OVERDUE.*Overdue Customer/);
    assert.doesNotMatch(ui.host.querySelector('.premium-outstanding-details').textContent, /INV-CURRENT/);
    assert.equal(ui.host.querySelector('.premium-outstanding-details a').getAttribute('href'), '/invoices/2');
    await click(button(ui.host, 'Show all'));
    assert.equal(ui.host.querySelectorAll('.premium-outstanding-details tbody tr').length, 2);
    await click(ui.host.querySelector('.premium-details-toggle'));
    assert.equal(ui.host.querySelector('.premium-details-toggle').getAttribute('aria-expanded'), 'false');
  } finally { await ui.close(); }
});

test('Revenue hover content distinguishes invoice collections from monthly payment dates', async () => {
  const ui = await mount(<RevenueChart currency="INR" data={[{ label: '2026-10', invoiced: 1000, collected: 300 }]} summary={[]} invoices={[{ currency: 'INR', status: 'Issued', totalAmount: 1000, paidAmount: 200 }]} />);
  try {
    assert.match(ui.host.querySelector('.premium-ring-collected').getAttribute('aria-label'), /20.0% collected against these same issued invoices/);
    assert.match(ui.host.querySelector('.premium-month-column').getAttribute('aria-label'), /collected by payment date.*300.00/);
    assert.match(ui.host.querySelector('.premium-month-column').textContent, /2026-10/);
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
  assert.match(dashboard, /premium-aging-legend > button[^}]*grid-template-columns:[^;]+;[^}]*border: 1px solid/s);
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


test('Login reports invalid email while typing, exposes an error indicator, and clears it only after correction', async () => {
  const original = authApi.login; let requests = 0;
  authApi.login = async () => { requests++; throw new Error('Invalid input must not submit'); };
  const ui = await mount(<Login />, '/login');
  try {
    const email = ui.host.querySelector('#email');
    await changeInput(email, 'not-an-email'); await settle();
    assert.match(ui.host.textContent, /Please enter a valid work email/);
    assert.equal(email.getAttribute('aria-invalid'), 'true');
    assert.ok(ui.host.querySelector('.billing-auth-field-warning'));
    assert.match(document.getElementById(email.getAttribute('aria-describedby')).textContent, /Please enter a valid work email/);
    assert.equal(document.getElementById(email.getAttribute('aria-describedby')).getAttribute('role'), 'alert');
    await act(async () => { Simulate.focus(email); Simulate.blur(email); }); await settle();
    assert.match(ui.host.textContent, /Please enter a valid work email/);
    await act(async () => Simulate.submit(ui.host.querySelector('form'))); await settle();
    assert.equal(requests, 0);
    await changeInput(email, 'dksjnfkjs@gmail.comkjfdjkvjkdfv'); await settle();
    assert.equal(email.getAttribute('aria-invalid'), 'true');
    assert.match(ui.host.textContent, /Please enter a valid work email/);
    await changeInput(email, 'admin@example.com'); await settle();
    assert.equal(email.getAttribute('aria-invalid'), 'false');
    assert.equal(ui.host.querySelector('.billing-auth-field-warning'), null);
    assert.doesNotMatch(ui.host.textContent, /Please enter a valid work email/);
  } finally { await ui.close(); authApi.login = original; }
});

test('Login uses a centered lock header, required fields and an accessible Remember me checkbox', async () => {
  const ui = await mount(<Login />, '/login');
  try {
    const card = ui.host.querySelector('.billing-login-card'); assert.ok(card);
    assert.match(card.querySelector('.billing-auth-form-title').textContent, /Welcome Back!/);
    assert.ok(card.querySelector('.billing-login-lock-badge [data-testid="LockOutlinedIcon"]'));
    assert.equal(card.querySelector('.billing-auth-logo-badge'), null);
    assert.equal(card.querySelectorAll('.billing-auth-required').length, 2);
    assert.equal(card.querySelector('#email').required, true); assert.equal(card.querySelector('#password').required, true);
    const checkbox = card.querySelector('.billing-auth-remember-control input[type="checkbox"]');
    assert.equal(checkbox.checked, false);
    await act(async () => Simulate.change(checkbox, { target: { checked: true } }));
    assert.equal(checkbox.checked, true);
    await act(async () => Simulate.change(checkbox, { target: { checked: false } }));
    assert.equal(checkbox.checked, false);
    checkbox.focus(); assert.equal(document.activeElement, checkbox);
    const css = readFileSync('src/styles/Login.css', 'utf8');
    assert.match(css, /billing-auth-remember-control \.MuiCheckbox-root:hover[^}]*background:/);
    assert.doesNotMatch(css, /billing-auth-remember-control:hover\s*\{|billing-auth-remember-control:focus-within/);
    assert.match(css, /billing-auth-remember-control \.MuiCheckbox-root\.Mui-focusVisible[^}]*outline:/);
    assert.match(css, /billing-login-card \.billing-auth-form-title[^}]*text-align: center/);
  } finally { await ui.close(); }
});


const fillRegistration = async host => {
  for (const [id, value] of [['fullName', 'Reddy Sumanth'], ['email', 'admin@example.com'], ['password', 'Password@123'], ['confirmPassword', 'Password@123']]) await changeInput(host.querySelector(`#${id}`), value);
};
const submitRegistration = ui => act(async () => Simulate.submit(ui.host.querySelector('form')));

test('Registration defaults to explicit unchecked consent, required fields and only bottom Sign in navigation', async () => {
  const ui = await mount(<Register />, '/register');
  try {
    const card = ui.host.querySelector('.register-card');
    assert.equal(card.querySelector('#registration-consent').checked, false);
    assert.equal(card.querySelector('#registration-consent').getAttribute('aria-required'), 'true');
    assert.equal(card.querySelectorAll('.billing-auth-required').length, 4);
    for (const id of ['fullName', 'email', 'password', 'confirmPassword']) assert.equal(card.querySelector(`#${id}`).required, true);
    assert.equal(ui.host.querySelector('.register-back-link'), null);
    assert.equal(ui.host.querySelectorAll('a[href="/login"]').length, 1);
    await act(async () => ui.host.querySelector('a[href="/login"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })));
    assert.equal(ui.host.querySelector('[data-location]').textContent, '/login');
  } finally { await ui.close(); }
});

test('Legal documents open independently without changing explicit consent', async () => {
  const ui = await mount(<Register />, '/register');
  try {
    const checkbox = ui.host.querySelector('#registration-consent');
    for (const path of ['/terms', '/privacy']) {
      const legal = ui.host.querySelector(`a[href="${path}"]`); assert.ok(legal);
      assert.equal(legal.closest('label'), null); assert.equal(legal.target, '_blank');
      assert.match(legal.rel, /noopener/); assert.match(legal.rel, /noreferrer/);
      await click(legal); assert.equal(checkbox.checked, false);
    }
    await act(async () => Simulate.change(checkbox, { target: { checked: true } }));
    for (const path of ['/terms', '/privacy']) { await click(ui.host.querySelector(`a[href="${path}"]`)); assert.equal(checkbox.checked, true); }
    assert.doesNotMatch(ui.host.textContent, /Read the project policy drafts before agreeing/);
    assert.equal(checkbox.hasAttribute('aria-describedby'), false);
  } finally { await ui.close(); }
  const fresh = await mount(<Register />, '/register');
  try { assert.equal(fresh.host.querySelector('#registration-consent').checked, false); } finally { await fresh.close(); }
});

test('Registration has one independent non-submit toggle per password field with matching input type and icon', async () => {
  const ui = await mount(<Register />, '/register');
  try {
    await fillRegistration(ui.host);
    for (const [id, label] of [['password', 'password'], ['confirmPassword', 'confirm password']]) {
      const input = ui.host.querySelector(`#${id}`); const value = input.value;
      assert.equal(input.type, 'password');
      assert.equal(ui.host.querySelectorAll(`[aria-controls="${id}"]`).length, 1);
      let toggle = ui.host.querySelector(`[aria-label="Show ${label}"]`); assert.equal(toggle.type, 'button');
      assert.ok(toggle.querySelector('[data-testid="VisibilityOffIcon"]'));
      toggle.focus(); assert.equal(document.activeElement, toggle);
      await click(toggle); assert.equal(input.type, 'text'); assert.equal(input.value, value);
      toggle = ui.host.querySelector(`[aria-label="Hide ${label}"]`); assert.ok(toggle.querySelector('[data-testid="VisibilityIcon"]'));
      const other = ui.host.querySelector(id === 'password' ? '#confirmPassword' : '#password'); assert.equal(other.type, 'password');
      await click(toggle); assert.equal(input.type, 'password'); assert.equal(input.value, value);
    }
  } finally { await ui.close(); }
});

test('Registration invalid fields and missing consent block the API; corrected blur errors clear', async () => {
  const original = authApi.register; let calls = 0; authApi.register = async () => { calls++; return { success: true }; };
  const ui = await mount(<Register />, '/register');
  try {
    await submitRegistration(ui); await settle(); assert.equal(calls, 0);
    assert.match(ui.host.textContent, /Full name is required/); assert.match(ui.host.textContent, /You must agree/);
    await fillRegistration(ui.host);
    await changeInput(ui.host.querySelector('#fullName'), 'qqqqqqqqqqqqqqqqqqqq');
    await act(async () => Simulate.blur(ui.host.querySelector('#fullName'))); await settle();
    assert.match(ui.host.textContent, /Full Name contains invalid repeated characters/);
    await submitRegistration(ui); await settle(); assert.equal(calls, 0);
    await changeInput(ui.host.querySelector('#fullName'), 'Mary Anne'); await settle();
    assert.doesNotMatch(ui.host.textContent, /Full Name contains invalid repeated characters/);
    await submitRegistration(ui); await settle(); assert.equal(calls, 0);
    assert.equal(ui.host.querySelector('#registration-consent').getAttribute('aria-invalid'), 'true');
  } finally { await ui.close(); authApi.register = original; }
});

test('Changing Create Password revalidates Confirm Password without clearing current consent', async () => {
  const ui = await mount(<Register />, '/register');
  try {
    await fillRegistration(ui.host);
    await act(async () => Simulate.change(ui.host.querySelector('#registration-consent'), { target: { checked: true } }));
    await changeInput(ui.host.querySelector('#password'), 'Changed@456'); await settle();
    assert.match(ui.host.textContent, /Passwords must match/);
    assert.equal(ui.host.querySelector('#registration-consent').checked, true);
    await changeInput(ui.host.querySelector('#confirmPassword'), 'Changed@456');
    await act(async () => Simulate.blur(ui.host.querySelector('#confirmPassword'))); await settle();
    assert.doesNotMatch(ui.host.textContent, /Passwords must match/);
  } finally { await ui.close(); }
});

test('Valid registration submits the existing payload once and waits for actual server success', async () => {
  const original = authApi.register; const calls = []; let resolve;
  authApi.register = payload => { calls.push(payload); return new Promise(done => { resolve = done; }); };
  const ui = await mount(<Register />, '/register');
  try {
    await fillRegistration(ui.host);
    await act(async () => Simulate.change(ui.host.querySelector('#registration-consent'), { target: { checked: true } }));
    await act(async () => { Simulate.submit(ui.host.querySelector('form')); Simulate.submit(ui.host.querySelector('form')); }); await settle();
    assert.deepEqual(calls, [{ name: 'Reddy Sumanth', email: 'admin@example.com', password: 'Password@123', confirmPassword: 'Password@123' }]);
    assert.equal(button(ui.host, 'Create Account'), undefined); assert.ok(ui.host.querySelector('.billing-auth-submit-btn').disabled);
    assert.doesNotMatch(ui.host.textContent, /Account registered!/);
    await act(async () => resolve({ success: true })); await settle(); assert.match(document.body.textContent, /Account registered!/);
  } finally { await ui.close(); authApi.register = original; }
});

test('Registration server errors preserve values and never become fake success', async () => {
  const original = authApi.register;
  for (const response of [false, true]) {
    authApi.register = async () => { if (response) throw new Error('Registration refused'); return { success: false, message: 'Registration refused' }; };
    const ui = await mount(<Register />, '/register');
    try {
      await fillRegistration(ui.host);
      await act(async () => Simulate.change(ui.host.querySelector('#registration-consent'), { target: { checked: true } }));
      await submitRegistration(ui); await settle();
      assert.match(ui.host.textContent, /Registration refused/); assert.doesNotMatch(ui.host.textContent, /Account registered!/);
      assert.equal(ui.host.querySelector('#fullName').value, 'Reddy Sumanth'); assert.equal(ui.host.querySelector('#password').value, 'Password@123');
      assert.equal(ui.host.querySelector('#registration-consent').checked, true); assert.equal(button(ui.host, 'Create Account').disabled, false);
      assert.equal(ui.host.querySelector('[data-location]').textContent, '/register');
    } finally { await ui.close(); }
  }
  authApi.register = original;
});

test('Inline recovery centers its header and places Back to Login between email and OTP submission', async () => {
  const ui = await mount(<Login />, '/login');
  try {
    await click(button(ui.host, 'Forgot password?'));
    const card = ui.host.querySelector('.billing-recovery-card'); assert.ok(card);
    assert.equal(ui.host.querySelector('.recovery-back-link'), null);
    const form = card.querySelector('form'); const link = form.querySelector('.billing-auth-recovery-nav a');
    const send = form.querySelector('button[type="submit"]'); assert.equal(send.textContent, 'Send OTP'); assert.ok(send.querySelector('[data-testid="SendOutlinedIcon"]'));
    assert.equal(link.getAttribute('href'), '/login'); assert.equal(link.textContent, 'Back to Login');
    assert.ok(form.querySelector('#forgot-email').compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(link.compareDocumentPosition(form.querySelector('button[type="submit"]')) & Node.DOCUMENT_POSITION_FOLLOWING);
    await act(async () => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })));
    assert.ok(ui.host.querySelector('#password'));
  } finally { await ui.close(); }
});

test('Standalone recovery retains its OTP request and navigation with the centered header and small back link', async () => {
  const original = authApi.forgotPassword; const calls = [];
  authApi.forgotPassword = async payload => { calls.push(payload); return { success: true }; };
  const ui = await mount(<ForgotPassword />, '/forgot-password');
  try {
    assert.match(ui.host.querySelector('.billing-recovery-heading').textContent, /Reset password/);
    assert.equal(ui.host.querySelector('.auth-back-btn'), null);
    assert.ok(ui.host.querySelector('.billing-auth-recovery-nav a[href="/login"]'));
    assert.equal(ui.host.querySelector('button[type="submit"]').textContent, 'Send OTP');
    assert.ok(ui.host.querySelector('button[type="submit"] [data-testid="SendOutlinedIcon"]'));
    await changeInput(ui.host.querySelector('#email'), 'admin@example.com');
    await act(async () => Simulate.submit(ui.host.querySelector('form'))); await settle();
    assert.deepEqual(calls, [{ email: 'admin@example.com' }]);
    assert.match(ui.host.textContent, /Verification code dispatched/);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
    assert.equal(ui.host.querySelector('[data-location]').textContent, '/verify-otp');
  } finally { await ui.close(); authApi.forgotPassword = original; }
});

test('Landing hover and marquee clipping fixes preserve border width and motion preferences', () => {
  const css = readFileSync('src/styles/Landing.css', 'utf8');
  assert.match(css, /hero-phone-mockup[^}]*transition: transform 210ms/);
  assert.match(css, /hero-phone-mockup:hover[^}]*translateY\(-3px\)/);
  assert.match(css, /capabilities-marquee-wrapper[^}]*padding-block: 12px/);
  assert.match(css, /capabilities-marquee-track[^}]*animation: marqueeLeft 42s linear infinite/);
  assert.match(css, /capability-pill-card:active[^}]*border-color:/);
  assert.doesNotMatch(css, /capability-pill-card:(?:hover|active)[^}]*border(?:-width)?:/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});


test('Registration gates submission on current validity and shows password guidance and success indicators', async () => {
  const ui = await mount(<Register />, '/register');
  try {
    const submit = ui.host.querySelector('button[type="submit"]'); assert.equal(submit.disabled, true);
    assert.equal(ui.host.querySelector('#registration-requirements'), null);
    assert.doesNotMatch(ui.host.textContent, /Complete all fields and accept/);
    assert.equal(ui.host.querySelector('.billing-auth-password-checks'), null);
    const password = ui.host.querySelector('#password');
    await act(async () => Simulate.focus(password));
    assert.equal(ui.host.querySelector('.billing-auth-password-checks'), null);
    await changeInput(password, 'a');
    assert.equal(ui.host.querySelectorAll('.billing-auth-password-checks li').length, 5);
    await changeInput(password, '');
    assert.equal(ui.host.querySelector('.billing-auth-password-checks'), null);
    await fillRegistration(ui.host); await settle(); assert.equal(submit.disabled, true);
    const rules = ui.host.querySelector('.billing-auth-password-checks'); assert.ok(rules);
    assert.ok(password.compareDocumentPosition(rules) & Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(rules.compareDocumentPosition(ui.host.querySelector('#confirmPassword')) & Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(ui.host.querySelector('[aria-label="Password meets requirements"]'));
    assert.ok(ui.host.querySelector('[aria-label="Passwords match"]'));
    assert.equal(rules.querySelectorAll('.is-met').length, 5);
    await act(async () => Simulate.blur(password)); await settle();
    assert.equal(ui.host.querySelector('.billing-auth-password-checks'), null);
    await act(async () => Simulate.focus(password));
    assert.equal(ui.host.querySelectorAll('.billing-auth-password-checks li').length, 5);
    await act(async () => Simulate.blur(password));
    await act(async () => Simulate.change(ui.host.querySelector('#registration-consent'), { target: { checked: true } })); await settle();
    assert.equal(submit.disabled, false);
    await changeInput(ui.host.querySelector('#fullName'), 'Name123'); await settle();
    assert.equal(ui.host.querySelector('#fullName').getAttribute('aria-invalid'), 'true'); assert.equal(submit.disabled, true);
    await changeInput(ui.host.querySelector('#fullName'), 'Mary Anne');
    await changeInput(ui.host.querySelector('#email'), 'admin@example.comwrong'); await settle();
    assert.equal(ui.host.querySelector('#email').getAttribute('aria-invalid'), 'true'); assert.equal(submit.disabled, true);
    await changeInput(ui.host.querySelector('#email'), 'admin@example.com'); await settle(); assert.equal(submit.disabled, false);
    await changeInput(ui.host.querySelector('#confirmPassword'), 'Different@123'); await settle();
    assert.equal(ui.host.querySelector('[aria-label="Passwords match"]'), null); assert.equal(submit.disabled, true);
    await changeInput(ui.host.querySelector('#confirmPassword'), 'Password@123'); await settle(); assert.equal(submit.disabled, false);
  } finally { await ui.close(); }
});

test('Inline OTP keeps Change email inside the centered verification card with meaningful icons', async () => {
  const original = authApi.forgotPassword; const calls = [];
  authApi.forgotPassword = async payload => { calls.push(payload); return { success: true }; };
  const ui = await mount(<Login />, '/login');
  try {
    await click(button(ui.host, 'Forgot password?'));
    await changeInput(ui.host.querySelector('#forgot-email'), 'admin@example.com');
    await act(async () => Simulate.submit(ui.host.querySelector('form'))); await settle();
    assert.deepEqual(calls, [{ email: 'admin@example.com' }]);
    const card = ui.host.querySelector('.billing-otp-card'); assert.ok(card);
    assert.match(card.querySelector('.billing-auth-form-title').textContent, /Enter verification code/);
    const change = button(ui.host, 'Change email'); assert.ok(card.contains(change));
    assert.ok(change.querySelector('[data-testid="EditOutlinedIcon"]'));
    assert.equal(ui.host.querySelector('.recovery-back-link'), null);
    assert.ok(button(ui.host, 'Verify code').querySelector('[data-testid="VerifiedUserOutlinedIcon"]'));
    await click(change); assert.equal(ui.host.querySelector('#forgot-email').value, 'admin@example.com');
  } finally { await ui.close(); authApi.forgotPassword = original; }
});

test('Legal routes provide substantive project drafts and identify remaining operator details', () => {
  const routes = readFileSync('src/routes/AppRoutes.jsx', 'utf8');
  assert.match(routes, /path="\/terms"/); assert.match(routes, /path="\/privacy"/);
  const source = readFileSync('src/pages/Legal/LegalPages.jsx', 'utf8');
  assert.match(source, /Draft for project review/); assert.match(source, /Your billing records/);
  assert.match(source, /Retention and requests/); assert.match(source, /operator identity and privacy contact/);
});


const chooseCustomerCurrency = async (host, value) => {
  await act(async () => Simulate.mouseDown(host.querySelector('#customer-currency'), { button: 0 }));
  await click([...document.body.querySelectorAll('[role="option"]')].find(node => node.getAttribute('data-value') === value));
  await settle();
};

test('Customer creation starts with a type placeholder and marks currency as required', async () => {
  const ui = await mount(<CustomerForm initialValues={{ customerCode: 'CUST-044' }} />);
  try {
    assert.match(ui.host.querySelector('#customer-type').textContent, /Select Customer Type/);
    assert.match(ui.host.querySelector('label[for="customer-currency"]').textContent, /Currency\s*\*/);
    assert.equal(ui.host.querySelector('#customer-currency').getAttribute('aria-required'), 'true');
    assert.match(ui.host.querySelector('.cust-draft-notice').textContent, /automatically kept as a draft/);
    await act(async () => Simulate.mouseDown(ui.host.querySelector('#customer-currency'), { button: 0 }));
    const search = document.body.querySelector('[aria-label="Search currency"]');
    assert.ok(search);
    assert.ok(search.classList.contains('calling-code-search-input'));
    assert.ok(search.closest('.calling-code-search-wrap').querySelector('.calling-code-search-icon'));
    await changeInput(search, 'India');
    await click(document.body.querySelector('[aria-label="Clear currency search"]'));
    assert.equal(search.value, '');
    await changeInput(search, 'India');
    let options = [...document.body.querySelectorAll('[role="option"]')];
    assert.ok(options.some(option => option.textContent.includes('INR')));
    assert.ok(!options.some(option => option.textContent.includes('USD')));
    await changeInput(search, 'zzzz-no-currency');
    assert.match(document.body.textContent, /No currencies found/);
    await changeInput(search, 'INR');
    await click([...document.body.querySelectorAll('[role="option"]')].find(option => option.getAttribute('data-value') === 'INR'));
    assert.match(ui.host.querySelector('#customer-currency').textContent, /INR/);
    assert.match(ui.host.querySelector('#customer-type').textContent, /Select Customer Type/);
  } finally { await ui.close(); }
});

test('Customer contact values survive Back and Next with a visible draft explanation and no submit', async () => {
  let submitted = 0;
  const ui = await mount(<CustomerForm initialValues={{ customerCode: 'CUST-044', name: 'Venkat Rao', currency: 'INR' }} onSubmit={() => submitted++} />);
  try {
    await click(ui.host.querySelector('[data-customer-action="next"]')); await settle();
    await changeInput(ui.host.querySelector('#customer-email'), 'venkat@example.com');
    await changeInput(ui.host.querySelector('#customer-phone'), '9876543210');
    await click(button(ui.host, 'Back')); await settle();
    assert.match(ui.host.querySelector('.cust-draft-notice').textContent, /Back or Next/);
    await click(ui.host.querySelector('[data-customer-action="next"]')); await settle();
    assert.equal(ui.host.querySelector('#customer-email').value, 'venkat@example.com');
    assert.equal(ui.host.querySelector('#customer-phone').value, '9876543210');
    assert.equal(submitted, 0);
  } finally { await ui.close(); }
});

test('Customer address checkbox starts unchecked and copies billing only after manual selection', async () => {
  const initial = { customerCode: 'CUST-044', name: 'Venkat Rao', currency: 'INR', email: 'venkat@example.com', phoneCountryCode: '+91', phone: '9876543210', taxRegistrationType: 'non-gst', pan: 'ABCDE1234F', billingAddress: { street: '12 Main Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'India' } };
  for (const existing of [false, true]) {
    const ui = await mount(<CustomerForm mode={existing ? 'edit' : 'create'} initialValues={existing ? { ...initial, id: 44, isShippingSameAsBilling: true } : initial} />);
    try {
      for (let step = 0; step < 3; step++) { await click(ui.host.querySelector('[data-customer-action="next"]')); await settle(); }
      assert.match(ui.host.querySelector('.cust-step-title').textContent, /Address Information/);
      const checkbox = ui.host.querySelector('#same-as-billing');
      assert.equal(checkbox.checked, existing);
      if (!existing) {
        assert.equal(ui.host.querySelector('#shippingAddress-street').value, '');
        await act(async () => checkbox.click()); await settle();
        assert.equal(checkbox.checked, true);
        assert.equal(ui.host.querySelector('#shippingAddress-street'), null);
        await act(async () => checkbox.click()); await settle();
        assert.equal(ui.host.querySelector('#shippingAddress-street').value, '');
      }
    } finally { await ui.close(); }
  }
});

test('Customer Basic Info Next stays disabled until the existing step rules pass and updates as fields are cleared', async () => {
  let submitted = 0;
  const ui = await mount(<CustomerForm initialValues={{ customerCode: 'CUST-044' }} onSubmit={() => submitted++} />, '/customers/create');
  try {
    const next = () => ui.host.querySelector('[data-customer-action="next"]');
    const name = ui.host.querySelector('#customer-name');
    assert.equal(next().disabled, true);
    await changeInput(name, 'Venkat Rao'); assert.equal(next().disabled, true);
    await chooseCustomerCurrency(ui.host, 'INR'); assert.equal(next().disabled, false);
    for (const invalidName of ['', '   ', 'V', 'V'.repeat(101)]) {
      await changeInput(name, invalidName); assert.equal(next().disabled, true);
      await act(async () => next().click());
      assert.match(ui.host.querySelector('.cust-step-title').textContent, /Basic Information/);
    }
    await act(async () => Simulate.keyDown(name, { key: 'Enter', target: name })); await settle();
    assert.match(ui.host.textContent, /Customer name must not exceed/);
    assert.equal(submitted, 0);
    await changeInput(name, 'Venkat Rao'); await settle(); assert.equal(next().disabled, false);
    await chooseCustomerCurrency(ui.host, ''); assert.equal(next().disabled, true);
    await chooseCustomerCurrency(ui.host, 'INR'); assert.equal(next().disabled, false);
    await changeInput(ui.host.querySelector('#customer-company'), 'C'.repeat(257)); assert.equal(next().disabled, true);
    await changeInput(ui.host.querySelector('#customer-company'), ''); assert.equal(next().disabled, false);
    await click(next()); await settle();
    assert.match(ui.host.querySelector('.cust-step-title').textContent, /Contact Information/);
    assert.equal(submitted, 0);
    await click(button(ui.host, 'Back')); await settle(); assert.equal(next().disabled, false);
  } finally { await ui.close(); }
});

test('Customer Next waits for the generated required code and allows valid Basic Info without completing later steps', async () => {
  const original = customerApi.getNextCustomerCode; let resolve;
  customerApi.getNextCustomerCode = () => new Promise(done => { resolve = done; });
  const ui = await mount(<CustomerForm initialValues={{ name: 'Venkat Rao', currency: 'INR' }} />, '/customers/create');
  try {
    assert.equal(ui.host.querySelector('[data-customer-action="next"]').disabled, true);
    await act(async () => resolve('CUST-044')); await settle();
    assert.equal(ui.host.querySelector('[data-customer-action="next"]').disabled, false);
    await click(ui.host.querySelector('[data-customer-action="next"]')); await settle();
    assert.match(ui.host.querySelector('.cust-step-title').textContent, /Contact Information/);
  } finally { await ui.close(); customerApi.getNextCustomerCode = original; }
});

test('Customer Basic Info validity follows restored drafts and existing edit values', async () => {
  const initial = { id: 44, customerCode: 'CUST-044', name: 'Venkat Rao', currency: 'INR' };
  const ui = await mount(<FormDraftProvider><Routes>
    <Route path="/customers/44/edit" element={<><CustomerForm mode="edit" initialValues={initial} /><Link to="/away">Leave customer draft</Link></>} />
    <Route path="/away" element={<Link to="/customers/44/edit">Return to customer</Link>} />
  </Routes></FormDraftProvider>, '/customers/44/edit');
  try {
    assert.equal(ui.host.querySelector('[data-customer-action="next"]').disabled, false);
    await changeInput(ui.host.querySelector('#customer-name'), '');
    assert.equal(ui.host.querySelector('[data-customer-action="next"]').disabled, true);
    await click([...ui.host.querySelectorAll('a')].find(node => node.textContent === 'Leave customer draft'));
    await click([...ui.host.querySelectorAll('a')].find(node => node.textContent === 'Return to customer')); await settle();
    assert.equal(ui.host.querySelector('#customer-name').value, '');
    assert.equal(ui.host.querySelector('[data-customer-action="next"]').disabled, true);
    await changeInput(ui.host.querySelector('#customer-name'), 'Corrected name');
    assert.equal(ui.host.querySelector('[data-customer-action="next"]').disabled, false);
  } finally { await ui.close(); }
  const busy = await mount(<CustomerForm mode="edit" initialValues={initial} isSubmitting />);
  try { assert.equal(busy.host.querySelector('[data-customer-action="next"]').disabled, true); } finally { await busy.close(); }
});


for (const mode of ['create', 'edit']) test(`Customer ${mode} shows Indian prefix errors, blocks Contact Info progression and clears corrected errors`, async () => {
  let submitted = 0;
  const ui = await mount(<CustomerForm mode={mode} initialValues={{ id: mode === 'edit' ? 44 : undefined, customerCode: 'CUST-044', name: 'Venkat Rao', currency: 'INR', email: 'venkat@example.com', phoneCountryCode: '+91' }} onSubmit={() => submitted++} />);
  try {
    await click(ui.host.querySelector('[data-customer-action="next"]')); await settle();
    const phone = ui.host.querySelector('#customer-phone'); assert.ok(phone);
    assert.match(ui.host.querySelector('#customer-phone-code').textContent, /[+]91/);
    for (const prefix of ['0', '1', '2', '3', '4', '5']) {
      await changeInput(phone, prefix + '234556666'); await settle();
      assert.match(ui.host.querySelector('#customer-phone-err').textContent, /must start with 6, 7, 8 or 9/);
      assert.equal(phone.getAttribute('aria-invalid'), 'true');
    }
    await click(ui.host.querySelector('[data-customer-action="next"]')); await settle();
    assert.match(ui.host.querySelector('.cust-step-title').textContent, /Contact Information/); assert.equal(submitted, 0);
    for (const prefix of ['6', '7', '8', '9']) {
      await changeInput(phone, prefix + '234556666'); await settle();
      assert.equal(ui.host.querySelector('#customer-phone-err'), null);
      assert.equal(phone.getAttribute('aria-invalid'), 'false');
    }
    await changeInput(phone, '1234556666'); await settle();
    await click(ui.host.querySelector('#customer-phone-code'));
    await click([...ui.host.querySelectorAll('[role="option"]')].find(node => node.textContent.includes('United States'))); await settle();
    assert.equal(phone.value, '1234556666'); assert.equal(ui.host.querySelector('#customer-phone-err'), null);
    await click(ui.host.querySelector('#customer-phone-code'));
    await click([...ui.host.querySelectorAll('[role="option"]')].find(node => /India/.test(node.textContent) && !/Indian Ocean/.test(node.textContent))); await settle();
    assert.match(ui.host.querySelector('#customer-phone-err').textContent, /must start with 6, 7, 8 or 9/);
    await changeInput(phone, '9234556666'); await settle();
    await click(ui.host.querySelector('[data-customer-action="next"]')); await settle();
    assert.match(ui.host.querySelector('.cust-step-title').textContent, /Billing & Tax/); assert.equal(submitted, 0);
  } finally { await ui.close(); }
});


for (const interaction of ['hover', 'keyboard focus']) test(`Customer email exposes the complete truncated address on ${interaction} without changing the mailto target`, async () => {
  const email = 'a.long.customer.address.for.billing@gmail.com';
  const ui = await mount(<CustomerEmailLink email={email} />);
  try {
    const link = ui.host.querySelector('a');
    Object.defineProperty(link, 'scrollWidth', { configurable: true, value: 420 });
    Object.defineProperty(link, 'clientWidth', { configurable: true, value: 160 });
    assert.equal(link.textContent, email); assert.equal(link.getAttribute('href'), `mailto:${email}`);
    await act(async () => {
      if (interaction === 'hover') { Simulate.mouseOver(link); Simulate.mouseEnter(link); }
      else { link.focus(); Simulate.focus(link); }
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)); });
    assert.equal(document.querySelector('[role="tooltip"]').textContent, email);
    assert.equal(link.getAttribute('href'), `mailto:${email}`);
  } finally { await ui.close(); }
});

test('Customer email avoids unnecessary tooltips when the full address fits', async () => {
  const ui = await mount(<CustomerEmailLink email="short@example.com" />);
  try {
    const link = ui.host.querySelector('a');
    Object.defineProperty(link, 'scrollWidth', { configurable: true, value: 120 });
    Object.defineProperty(link, 'clientWidth', { configurable: true, value: 180 });
    await act(async () => { Simulate.mouseOver(link); Simulate.mouseEnter(link); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)); });
    assert.equal(document.querySelector('[role="tooltip"]'), null);
    assert.equal(link.getAttribute('href'), 'mailto:short@example.com');
  } finally { await ui.close(); }
});

test('Customer edit keeps PAN-only and explicit unregistered records non-GST while retaining real GST', async () => {
  const {parseCustomerResponse} = await import('billing-contracts');
  const raw = {id:44,customerCode:'CUST-044',name:'QA Tax Customer',customerType:'Business',currency:'INR',email:'qa@example.com',phone:'+91 9876543210',taxId:'ABCDE1234F'};
  const cases = [
    {values:parseCustomerResponse(raw),gst:false},
    {values:{...parseCustomerResponse(raw),gstin:'ABCDE1234F'},gst:false},
    {values:parseCustomerResponse({...raw,taxId:'36ABCDE1234F1Z8',taxRegistrationType:'non-gst'}),gst:false},
    {values:parseCustomerResponse({...raw,taxId:'36ABCDE1234F1Z8'}),gst:true},
  ];
  for (const {values,gst} of cases) {
    const ui = await mount(<CustomerForm mode="edit" initialValues={values} />);
    try {
      for(let step=0;step<2;step++){await click(ui.host.querySelector('[data-customer-action="next"]'));await settle();}
      assert.match(ui.host.querySelector('#customer-tax-type').textContent,gst?/GST Registered/:/Non-GST \/ Unregistered/);
      assert.equal(ui.host.querySelector('#customer-gstin').value,gst?'36ABCDE1234F1Z8':'');
      assert.equal(ui.host.querySelector('#customer-gstin').disabled,!gst);
      assert.equal(ui.host.querySelector('#customer-pan').value,'ABCDE1234F');
    } finally {await ui.close();}
  }
});
