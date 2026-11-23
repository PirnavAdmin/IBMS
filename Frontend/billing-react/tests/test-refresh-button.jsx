import React, { act, useState } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from 'billing-api-client';
import { Dashboard } from '../src/pages/Dashboard/Dashboard';

async function mount(component, permissions = ['invoices.view', 'payments.view', 'invoices.manage', 'payments.manage']) {
  localStorage.setItem('billing_auth_user', JSON.stringify({ id: 1, tenantId: 1, roles: ['TenantAdmin'], permissions }));
  let invoiceCalls = 0;
  let paymentCalls = 0;

  const originalGet = apiClient.get;
  apiClient.get = async (url) => {
    if (url.includes('/api/v1/invoices')) {
      invoiceCalls++;
      return { totalCount: 1, pageNumber: 1, pageSize: 100, items: [{ id: 1, invoiceNumber: 'INV-001', currency: 'INR', status: 'Issued', totalAmount: 1000, paidAmount: 0, balanceAmount: 1000, dueDate: '2026-12-01' }] };
    }
    if (url.includes('/api/v1/payments')) {
      paymentCalls++;
      return { totalCount: 0, pageNumber: 1, pageSize: 100, items: [] };
    }
    return { data: { unreadCount: 0 } };
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>{component}</MemoryRouter>
      </QueryClientProvider>
    );
  });

  return {
    host,
    client,
    getInvoiceCalls: () => invoiceCalls,
    getPaymentCalls: () => paymentCalls,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
      client.clear();
      apiClient.get = originalGet;
      localStorage.clear();
    },
  };
}

test('Clicking refresh button on Dashboard triggers refresh and displays feedback', async () => {
  const v = await mount(<Dashboard />);
  try {
    const initialInvoices = v.getInvoiceCalls();
    const initialPayments = v.getPaymentCalls();

    const refreshButton = [...v.host.querySelectorAll('button')].find(b => b.textContent.includes('Refresh'));
    assert.ok(refreshButton, 'Refresh button must be present in Dashboard');

    await act(async () => {
      Simulate.click(refreshButton);
    });

    // Wait for the minimum animation timer and state update
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 750));
    });

    assert.ok(v.getInvoiceCalls() > initialInvoices, 'Invoices should be refetched on refresh button click');
    assert.ok(v.getPaymentCalls() > initialPayments, 'Payments should be refetched on refresh button click');

    const snackbar = document.body.querySelector('.MuiSnackbar-root, [role="alert"]');
    assert.ok(snackbar, 'FeedbackSnackbar should appear after refresh');
    assert.match(document.body.textContent, /Dashboard data refreshed successfully/);
  } finally {
    await v.close();
  }
});
