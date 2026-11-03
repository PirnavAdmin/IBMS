import React, { act } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { CustomerDetailsPage } from '../src/pages/Customers/pages/CustomerDetailsPage';

const settle = ms => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
function Location() { const location = useLocation(); const navigate = useNavigate(); return <><output data-location>{location.pathname + location.search}</output><button data-back onClick={() => navigate(-1)}>History back</button></>; }
async function mount(entries = ['/customers/8?tab=overview&source=directory']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } } });
  client.setQueryData(['customer-details', '8'], { customer: { id: 8, customerCode: 'CUST-008', name: 'sandeep', taxId: 'MOCOS6899N', status: 'Active', isActive: true, currency: 'INR' }, financialSummary: { totalInvoiced: 9821, totalPaid: 0, outstandingBalance: 9821, currency: 'INR' }, invoices: [], payments: [] });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={entries} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Location /><Routes><Route path="/customers/:customerId" element={<CustomerDetailsPage />} /></Routes></MemoryRouter></QueryClientProvider>));
  return { host, close: async () => { await act(async () => root.unmount()); client.clear(); host.remove(); Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 }); } };
}
function scroll(host) {
  const panel = host.querySelector('[role="tabpanel"]');
  panel.scrollTop = 180;
  panel.dispatchEvent(new window.Event('scroll'));
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 240 });
  window.dispatchEvent(new window.Event('scroll'));
  panel.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 80, bubbles: true }));
}
const selected = host => host.querySelector('[role="tab"][aria-selected="true"]').textContent.trim();
const url = host => host.querySelector('[data-location]').textContent;

test('scrolling Overview panel and page does not change selection or URL after the old timer delay', async () => {
  const view = await mount();
  try {
    assert.equal(selected(view.host), 'Overview');
    const before = url(view.host);
    await act(async () => scroll(view.host));
    await settle(1150);
    assert.equal(selected(view.host), 'Overview');
    assert.equal(url(view.host), before);
    assert.equal(view.host.querySelector('[role="tabpanel"]').id, 'customer-panel-Overview');
    assert.match(view.host.querySelector('[role="tabpanel"]').textContent, /Financial Summary/);
    assert.equal(view.host.querySelector('[role="tabpanel"]').scrollTop, 180);
  } finally { await view.close(); }
});

test('direct-linked Addresses also remains selected during upward/downward scrolling', async () => {
  const view = await mount(['/customers/8?tab=addresses']);
  try {
    await act(async () => scroll(view.host));
    await settle(1150);
    assert.equal(selected(view.host), 'Addresses');
    assert.equal(url(view.host), '/customers/8?tab=addresses');
    await act(async () => { view.host.querySelector('[role="tabpanel"]').scrollTop = 0; window.dispatchEvent(new window.Event('scroll')); });
    assert.equal(selected(view.host), 'Addresses');
  } finally { await view.close(); }
});

test('explicit tab activation, keyboard focus movement and browser history keep URL-driven selection', async () => {
  const view = await mount(['/customers/8?tab=payments', '/customers/8?tab=overview&source=directory']);
  try {
    const overview = view.host.querySelector('#customer-tab-Overview');
    await act(async () => { overview.focus(); Simulate.keyDown(overview, { key: 'ArrowRight' }); });
    assert.equal(document.activeElement.id, 'customer-tab-Addresses');
    assert.equal(selected(view.host), 'Overview');
    // Native keyboard activation and pointer activation both emit a click.
    await act(async () => Simulate.click(document.activeElement, { detail: 0 }));
    assert.equal(selected(view.host), 'Addresses');
    assert.equal(url(view.host), '/customers/8?tab=addresses&source=directory');
    await act(async () => Simulate.click(view.host.querySelector('[data-back]')));
    assert.equal(selected(view.host), 'Payments');
    assert.equal(url(view.host), '/customers/8?tab=payments');
  } finally { await view.close(); }
});

test('customer Overview shows the same PAN-only tax status as the editor without saving', async () => {
  const view = await mount();
  try {
    const field = [...view.host.querySelectorAll('dt')].find(node => node.textContent === 'Tax Registration');
    assert.ok(field);
    assert.equal(field.nextElementSibling.textContent, 'Non-GST / Unregistered');
    const taxId = [...view.host.querySelectorAll('dt')].find(node => node.textContent === 'Tax ID');
    assert.equal(taxId.nextElementSibling.textContent, 'MOCOS6899N');
  } finally { await view.close(); }
});