import React, { act } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { RevenueChart, OutstandingAging } from '../src/components/dashboard/DashboardCharts';

async function mount(component) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<MemoryRouter>{component}</MemoryRouter>);
  });
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

test('RevenueChart and OutstandingAging eliminate browser native SVG <title> tooltips', async () => {
  const agingData = [
    { label: 'Current', value: 478425.5 },
    { label: '1-30 Days', value: 0 },
    { label: '31-60 Days', value: 0 },
    { label: '61-90 Days', value: 0 },
    { label: '90+ Days', value: 0 },
  ];
  const invoices = [
    { id: 1, invoiceNumber: 'INV-001', currency: 'INR', status: 'Issued', balanceAmount: 478425.5, totalAmount: 478425.5, paidAmount: 0, dueDate: '2026-12-01' },
  ];
  const revenueData = [
    { label: '2026-10', invoiced: 216791, collected: 55093 },
    { label: '2026-11', invoiced: 680797.19, collected: 363669.69 },
  ];

  const agingMount = await mount(<OutstandingAging data={agingData} currency="INR" invoices={invoices} />);
  try {
    const titles = agingMount.host.querySelectorAll('svg title');
    assert.equal(titles.length, 0, 'OutstandingAging must not contain SVG <title> elements that trigger browser native unstyled tooltips');

    const ring = agingMount.host.querySelector('.premium-aging-ring');
    assert.ok(ring, 'Aging ring element exists');
    assert.equal(ring.getAttribute('tabindex'), '0', 'Aging ring must have tabindex="0" for keyboard accessibility and tooltip focus');

    const legendButtons = agingMount.host.querySelectorAll('.premium-aging-legend button');
    assert.ok(legendButtons.length > 0, 'Aging legend buttons exist');
  } finally {
    await agingMount.close();
  }

  const revenueMount = await mount(<RevenueChart data={revenueData} currency="INR" summary={[]} invoices={invoices} />);
  try {
    const amountRings = revenueMount.host.querySelectorAll('.premium-amount-ring');
    assert.equal(amountRings.length, 2, 'Invoiced and Collected rings exist');
    const monthBars = revenueMount.host.querySelectorAll('.premium-month-column');
    assert.equal(monthBars.length, 2, 'Monthly activity bar columns exist');
  } finally {
    await revenueMount.close();
  }
});
