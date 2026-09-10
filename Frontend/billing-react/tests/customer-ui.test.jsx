import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerAddresses } from '../src/components/customers/CustomerAddresses';
import { CustomerOverview } from '../src/components/customers/CustomerOverview';
import { CustomerInvoices, CustomerPayments } from '../src/components/customers/CustomerTransactions';
import { CustomerStatement } from '../src/components/customers/CustomerStatement';
import { CustomerState } from '../src/components/customers/CustomerShared';
import { DeactivateCustomerDialog } from '../src/components/customers/DeactivateCustomerDialog';
import { mapDetails } from '../src/services/customerService';
import { CustomerDetailsPage } from '../src/pages/Customers/CustomerDetailsPage';
import { CustomerListPage } from '../src/features/customers/CustomerListPage';

const record = () => mapDetails({ customer: { id: 7, name: 'QA Customer', isActive: true, currency: 'INR' }, financialSummary: { totalInvoiced: 100, totalPaid: 40, outstandingBalance: 60 }, invoices: [], payments: [] });
const render = component => renderToStaticMarkup(<StaticRouter location="/customers/7"><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } })}>{component}</QueryClientProvider></StaticRouter>);
test('directory enables search and exact Tax ID controls and explains outstanding limitation', () => {
  const html = render(<CustomerListPage />);
  const search = html.match(/<input\b[^>]*aria-label="Search customers"[^>]*>/)?.[0];
  assert.ok(search);
  assert.doesNotMatch(search, /disabled/);
  assert.match(html, /Tax ID \/ GST \/ VAT ID/);
  assert.match(html, /Outstanding filtering is not available yet/);
  assert.doesNotMatch(html, /Search, other filters and sorting require backend support/);
});
test('overview renders backend values without unsupported profile labels', () => {
  const html = render(<CustomerOverview record={record()} />);
  assert.match(html, /QA Customer/);
  assert.match(html, /100\.00/);
  assert.match(html, /60\.00/);
  assert.doesNotMatch(html, /Overdue Amount|Tax Treatment|Preferred Payment Method/);
});
test('address cards render missing state and supplied default indicator', () => {
  const data = record();
  assert.match(render(<CustomerAddresses customer={data.customer} />), /No billing address available/);
  data.customer.billingAddress = { line1: 'Actual address', isDefault: true };
  const html = render(<CustomerAddresses customer={data.customer} />);
  assert.match(html, /Actual address/);
  assert.match(html, /Default Address/);
  assert.match(html, />Yes</);
  assert.match(html, /No shipping address available/);
});
test('empty invoices and payments have real empty states', () => {
  assert.match(render(<CustomerInvoices rows={[]} />), /No invoices found for this customer/);
  assert.match(render(<CustomerPayments rows={[]} />), /No payments found for this customer/);
});
test('statement excludes incomplete transactions and retains zero amounts', () => {
  const data = record();
  data.invoices = [{ id: 1, invoiceNumber: 'INCOMPLETE', amount: 100 }, { id: 2, invoiceNumber: 'REAL-ZERO', amount: 0, date: '2026-09-10', currency: 'INR' }];
  const html = render(<CustomerStatement record={data} />);
  assert.doesNotMatch(html, /INCOMPLETE/);
  assert.match(html, /REAL-ZERO/);
  assert.match(html, /0\.00/);
  assert.match(render(<CustomerStatement record={record()} />), /No statement transactions/);
});
test('loading, not found and API retry states render correctly', () => {
  assert.match(render(<CustomerState query={{ isPending: true }} />), /Loading customer data/);
  assert.match(render(<CustomerState query={{ isError: true, error: { code: 'NOT_FOUND', message: 'Customer not found.' } }} />), /Customer not found/);
  assert.match(render(<CustomerState query={{ isError: true, error: { message: 'Network Error' }, refetch() {} }} />), /Retry/);
});
test('deactivate action is rendered only for active customers', () => {
  assert.match(render(<DeactivateCustomerDialog customer={record().customer} />), /Deactivate Customer/);
  assert.doesNotMatch(render(<DeactivateCustomerDialog customer={{ ...record().customer, isActive: false, status: 'Inactive' }} />), /Deactivate Customer/);
});
test('all six direct tab URLs render the matching panel and numeric edit link', () => {
  for (const tab of ['overview', 'addresses', 'invoices', 'payments', 'statement', 'audit']) {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } });
    client.setQueryData(['customer-details', '7'], record());
    client.setQueryData(['customer-audit', '7'], []);
    const html = renderToStaticMarkup(<StaticRouter location={`/customers/7?tab=${tab}`}><QueryClientProvider client={client}><Routes><Route path="/customers/:customerId" element={<CustomerDetailsPage />} /></Routes></QueryClientProvider></StaticRouter>);
    const label = tab[0].toUpperCase() + tab.slice(1);
    assert.match(html, new RegExp(`id="customer-panel-${label}"`));
    assert.match(html, /href="\/customers\/7\/edit"/);
    assert.match(html, /Back to Customers/);
  }
});
