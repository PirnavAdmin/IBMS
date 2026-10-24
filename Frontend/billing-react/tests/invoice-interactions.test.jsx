// Synthetic fixtures exist only in tests; production uses authenticated backend APIs.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { FormDraftProvider } from '../src/context/FormDraftContext';
import { apiClient, invoiceApi, templateApi, customerApi, authApi } from "billing-api-client";
import { Dashboard } from '../src/pages/Dashboard/Dashboard';
import { paymentService } from '../src/pages/Payments/paymentService';
import { Payments } from '../src/pages/Payments/Payments';
import { RecordPayment } from '../src/pages/Payments/RecordPayment';
import { InvoiceList } from "../src/pages/Invoices/InvoiceList";
import { InvoiceForm } from "../src/pages/Invoices/InvoiceForm";
import { InvoiceDetails } from "../src/pages/Invoices/InvoiceDetails";
import { InvoicePreview } from '../src/pages/Invoices/InvoicePreview';
import { InvoiceActions } from "../src/pages/Invoices/components/InvoiceActions";
import { InvoiceDocument } from "../src/pages/Invoices/components/InvoiceDocument";
import {
  invoiceService,
  invoiceQuery,
  invoiceActions,
  invoicePermissions,
  invoiceError,
  requirePage,
  createSubmissionGuard,
} from "../src/pages/Invoices/services/invoiceService";
import {
  blankInvoice,
  validateInvoice,
  invoiceDto,
  calculationDto,
  formFromInvoice,
  productToItem,
} from "../src/pages/Invoices/validation/invoiceValidation";
import { numberingService } from "../src/pages/NumberingSettings/services/numberingService";
import {
  validTokens,
  numberingValidationSchema,
} from "../src/pages/NumberingSettings/validation/numberingValidation";
import { NumberingSettings } from "../src/pages/NumberingSettings/pages/NumberingSettings";
import { creditNoteService } from "../src/pages/CreditNotes/services/creditNoteService";
const customer = {
  id: 2,
  name: "Test Customer",
  status: "Active",
  isActive: true,
  currency: "INR",
  address: "Test address",
};
const item = {
  id: 1,
  productId: 3,
  description: "Saved product",
  quantity: 1,
  unitPrice: 100,
  discountAmount: 0,
  discountRate: null,
  taxType: null,
  taxRate: null,
  taxAmount: 0,
  totalAmount: 100,
  hsnsac: "TEST",
};
const invoice = {
  id: 7,
  customerId: 2,
  customer,
  currency: "INR",
  invoiceNumber: "",
  status: "Draft",
  invoiceDate: "2026-10-05T00:00:00Z",
  dueDate: "2026-10-20T00:00:00Z",
  subtotal: 100,
  discountAmount: 0,
  taxAmount: 0,
  chargesAmount: 0,
  roundingAmount: 0,
  totalAmount: 100,
  paidAmount: 0,
  creditedAmount: 0,
  balanceAmount: 100,
  rowVersion: "2026-10-05T01:00:00.1234567Z",
  items: [item],
  paymentAllocations: [],
  creditNotes: [],
};
const setting = {
  documentType: "Invoice",
  prefix: "T-",
  suffix: "",
  tokens: "{YEAR}-",
  sequenceLength: 4,
  nextNumber: 1,
  resetPolicy: "Never (Continuous sequence)",
  status: "Active",
  rowVersion: "v1",
  preview: "T-2026-0001",
};
const calculation = {
  grossSubtotal: 100,
  totalLineDiscounts: 0,
  invoiceDiscountAmount: 0,
  taxableSubtotal: 100,
  totalTaxes: 0,
  chargesTotal: 0,
  taxOnChargesTotal: 0,
  grandTotal: 100,
  currency: "INR",
  items: [{ discountAmount: 0, taxAmount: 0, lineTotal: 100 }],
  appliedTaxes: [],
};
const page = (items) => ({
  items,
  totalCount: items.length,
  pageNumber: 1,
  pageSize: 20,
  totalPages: items.length ? 1 : 0,
  hasNextPage: false,
  hasPreviousPage: false,
});
async function mock(object, changes, run) {
  const old = Object.fromEntries(
    Object.keys(changes).map((key) => [key, object[key]]),
  );
  Object.assign(object, changes);
  try {
    return await run();
  } finally {
    Object.assign(object, old);
  }
}
async function flush(ms = 20) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}
async function mount(element, path = "/invoices", route = "*", extraRoutes = null) {
  let navigate;
  function NavigationProbe() { navigate = useNavigate(); return null; }
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  client.setQueryData(["auth-user"], { role: "TenantAdmin" });
  client.setQueryData(['payment-user'], { roles: ['TenantAdmin'] });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <FormDraftProvider>
        <MemoryRouter
          initialEntries={[path]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <NavigationProbe />
          <Routes>
            <Route path={route} element={element} />
            {extraRoutes}
            {!extraRoutes && route !== "/invoices/:id" && (
              <Route
                path="/invoices/:id"
                element={<div>Saved invoice route</div>}
              />
            )}
          </Routes>
        </MemoryRouter>
        </FormDraftProvider>
      </QueryClientProvider>,
    ),
  );
  await flush();
  return {
    host,
    client,
    async go(to) { await act(async () => navigate(to)); await flush(420); },
    async close() {
      await act(async () => root.unmount());
      host.remove();
      client.clear();
    },
  };
}
function button(text) {
  return [...document.querySelectorAll("button")].find(
    (el) =>
      el.textContent.trim() === text ||
      el.textContent.trim().startsWith(text + " "),
  );
}

test('Invoice summary hides AOA groups returned by the backend and preserves INR totals', async () => {
  await mock(invoiceService, {
    list: async () => page([invoice]),
    customers: async () => ({ items: [] }),
    summary: async () => ['INR', 'AOA'].map(currency => ({ currency, totalInvoiced: 100, totalPaid: 0, totalOutstanding: 100, overdueAmount: 0, overdueCount: 0, draftCount: 1, draftAmount: 50350 })),
  }, async () => {
    const mounted = await mount(<InvoiceList />);
    try {
      assert.ok(mounted.host.querySelector('[aria-label="INR invoice summary"]'));
      assert.equal(mounted.host.querySelector('[aria-label="AOA invoice summary"]'), null);
      assert.equal(mounted.host.querySelectorAll('.invoice-summary-group').length, 1);
    } finally { await mounted.close(); }
  });
});

test('Dashboard hides the currency selector and preserves historical INR invoices without mixing currencies', async () => {
  await mock(authApi, { getCurrentUser: () => ({ role: 'TenantAdmin', tenantId: 1, id: 1 }) }, async () =>
    mock(invoiceService, { list: async () => page([{ ...invoice, invoiceNumber: 'HISTORY-INR', invoiceDate: '2026-08-15' }, { ...invoice, id: 8, currency: 'AOA', invoiceNumber: 'HISTORY-AOA' }]) }, async () =>
      mock(paymentService, { getPayments: async () => page([]) }, async () => {
        const mounted = await mount(<Dashboard />, '/dashboard');
        try {
          assert.equal(mounted.host.querySelector('.premium-filters select'), null);
          assert.match(mounted.host.textContent, /HISTORY-INR/);
          assert.doesNotMatch(mounted.host.textContent, /AOA/);
        } finally { await mounted.close(); }
      })));
});
async function click(element) {
  assert.ok(element, "Expected element");
  await act(async () => element.click());
  await flush();
}
async function input(element, value) {
  assert.ok(element, "Expected input");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype,
      "value",
    ).set.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
    element.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  if (element.closest('.ant-picker')) await act(async () => element.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await flush();
}
async function defaults(changes, run) {
  return mock(
    invoiceService,
    {
      customers: async () => ({ items: [customer] }),
      customer: async () => customer,
      products: async () => ({ items: [{ id: 3, name: "Test Product" }] }),
      product: async () => ({
        id: 3,
        name: "Test Product",
        price: 100,
        currency: "INR",
        unit: "each",
      }),
      validateProduct: async () => true,
      taxes: async () => ({ taxRates: [] }),
      discountSettings: async () => ({
        status: "Active",
        allowInvoiceLevel: true,
      }),
      charges: async () => [],
      calculate: async () => calculation,
      ...changes,
    },
    () =>
      mock(
        numberingService,
        {
          getSettings: async () => setting,
          preview: async () => ({
            fullPreview: setting.preview,
            parts: {
              prefix: "T-",
              tokens: "2026-",
              sequence: "0001",
              suffix: "",
            },
          }),
        },
        run,
      ),
  );
}

test("Query maps real filters, end-of-day bounds, server pagination and sorting", () => {
  assert.deepEqual(
    invoiceQuery({
      search: " x ",
      customerId: 2,
      status: "Draft",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      currency: "usd",
      paymentState: "Outstanding",
      page: 2,
      pageSize: 10,
      sortBy: "TotalAmount",
      sortOrder: "asc",
    }),
    {
      searchTerm: "x",
      customerId: 2,
      status: "Draft",
      startDate: "2026-10-01T00:00:00Z",
      endDate: "2026-10-05T23:59:59.999Z",
      currency: "USD",
      paymentState: "Outstanding",
      page: 2,
      pageSize: 10,
      sortBy: "TotalAmount",
      sortOrder: "asc",
    },
  );
  assert.throws(() => requirePage({ items: [] }), /pagination/);
});
test("Invoice API propagates 400/401/403/404/409/422/500 with no fallback records", async () => {
  for (const status of [400, 401, 403, 404, 409, 422, 500])
    await mock(
      apiClient,
      {
        get: async () => {
          throw Object.assign(new Error("HTTP failed"), {
            response: { status },
          });
        },
      },
      async () => assert.rejects(invoiceApi.getInvoices(), /HTTP failed/),
    );
  await mock(
    apiClient,
    { post: async () => ({ success: false, message: "Rejected" }) },
    async () => assert.rejects(invoiceApi.createDraft({}), /Rejected/),
  );
});
test("Summary keeps unlike currencies separate and rejects malformed amounts", async () => {
  await mock(
    invoiceApi,
    {
      getSummary: async () => [
        {
          currency: "INR",
          totalInvoiced: 100,
          totalPaid: 0,
          totalOutstanding: 100,
          overdueAmount: 0,
        },
        {
          currency: "USD",
          totalInvoiced: 20,
          totalPaid: 10,
          totalOutstanding: 10,
          overdueAmount: 0,
        },
      ],
    },
    async () => assert.equal((await invoiceService.summary()).length, 2),
  );
  await mock(
    invoiceApi,
    { getSummary: async () => ({ totalInvoiced: 100 }) },
    async () => assert.rejects(invoiceService.summary(), /currency/),
  );
});
test("Draft DTO preserves exact RowVersion and excludes tenant, number and financial totals", () => {
  const form = formFromInvoice({ ...invoice, tenantId: 999 });
  form.invoiceNumber = "ILLEGAL";
  form.totalAmount = 99999;
  const dto = invoiceDto(form, true);
  assert.equal(dto.rowVersion, invoice.rowVersion);
  for (const key of [
    "tenantId",
    "invoiceNumber",
    "totalAmount",
    "paidAmount",
    "balanceAmount",
  ])
    assert.equal(Object.hasOwn(dto, key), false);
  assert.equal(dto.items[0].sortOrder, 1);
  assert.equal(calculationDto(form).items[0].unitPrice, 100);
});
test("Form validates required fields, negative prices, dates and multiple line quantities", () => {
  assert.ok(Object.keys(validateInvoice(blankInvoice())).length >= 5);
  const form = formFromInvoice(invoice);
  assert.deepEqual(validateInvoice(form), {});
  form.items.push({ ...form.items[0], quantity: "0", unitPrice: "-1" });
  assert.ok(validateInvoice(form)["items.1.quantity"]);
  assert.ok(validateInvoice(form)["items.1.unitPrice"]);
  form.dueDate = "2026-10-01";
  assert.ok(validateInvoice(form).dueDate);
});
test("Catalog selection populates price/unit/HSN/tax; saved invoice keeps historical price", () => {
  const mapped = productToItem(
    {
      id: 3,
      name: "Changed",
      price: 999,
      unit: "each",
      currency: "INR",
      hsnSacCode: "HSN",
      taxCategory: "TAX",
    },
    [
      {
        code: "TAX",
        taxType: "VAT",
        rate: 5,
        isInclusive: false,
        isCompound: false,
      },
    ],
  );
  assert.equal(mapped.unitPrice, "999");
  assert.equal(mapped.taxRate, "5");
  assert.equal(mapped.hsnsac, "HSN");
  assert.equal(formFromInvoice(invoice).items[0].unitPrice, "100");
});
test("Action visibility uses backend roles, actual states and discount validation", () => {
  assert.deepEqual(
    invoiceActions(invoice, invoicePermissions({ role: "Customer" })),
    [],
  );
  const perms = invoicePermissions({ role: "TenantAdmin" });
  assert.ok(invoiceActions(invoice, perms).includes("issue"));
  assert.equal(
    invoiceActions(
      { ...invoice, items: [{ ...item, discountRate: 5 }] },
      perms,
    ).includes("issue"),
    true,
  );
  assert.equal(
    invoiceActions(
      { ...invoice, items: [{ ...item, discountRate: -5 }] },
      perms,
    ).includes("issue"),
    false,
  );
  assert.equal(
    invoiceActions({ ...invoice, status: "Paid" }, perms).includes("edit"),
    false,
  );
  assert.equal(
    invoiceActions(
      { ...invoice, status: "Issued", paidAmount: 20 },
      perms,
    ).includes("cancel"),
    false,
  );
  assert.ok(
    invoiceActions({ ...invoice, status: "Issued" }, perms).includes("void"),
  );
  assert.equal(
    invoiceActions({ ...invoice, status: "Voided" }, perms).includes("payment"),
    false,
  );
});
test("Concurrency text and duplicate submission guard", () => {
  assert.equal(
    invoiceError({ response: { status: 409 } }),
    "This invoice was changed by another user. Reload the latest version before saving.",
  );
  const guard = createSubmissionGuard();
  assert.equal(guard.acquire(), true);
  assert.equal(guard.acquire(), false);
  guard.release();
  assert.equal(guard.acquire(), true);
});
test("Preview renders saved line values and authoritative persisted totals", async () => {
  const mounted = await mount(<InvoiceDocument invoice={invoice} />);
  try {
    assert.match(mounted.host.textContent, /Saved product/);
    assert.match(mounted.host.textContent, /100.00/);
    assert.match(mounted.host.textContent, /Persisted totals/);
  } finally {
    await mounted.close();
  }
});
test("List debounces first-character search and uses server paging/sorting", async () => {
  const calls = [];
  await defaults(
    {
      list: async (values) => {
        calls.push(values);
        return {
          ...page([invoice]),
          totalCount: 42,
          totalPages: 3,
          hasNextPage: values.page < 3,
        };
      },
      summary: async () => [
        {
          currency: "INR",
          totalInvoiced: 100,
          totalPaid: 0,
          totalOutstanding: 100,
          overdueAmount: 0,
        },
      ],
    },
    async () => {
      const mounted = await mount(<InvoiceList />);
      try {
        assert.match(
          mounted.host.textContent,
          /Create, issue and manage customer invoices/,
        );
        await input(document.querySelector("input[type=search]"), "q");
        await flush(320);
        assert.equal(calls.at(-1).search, "q");
        await click(button("Next"));
        assert.equal(calls.at(-1).page, 2);
        await click(button("Grand Total"));
        assert.equal(calls.at(-1).sortBy, "TotalAmount");
        assert.equal(calls.at(-1).page, 1);
      } finally {
        await mounted.close();
      }
    },
  );
});
test("List Date Range stages dates, validates order, applies existing filters and clears", async () => {
  const calls = [];
  await defaults({
    list: async (values) => { calls.push(values); return page([]); },
    summary: async () => [],
  }, async () => {
    const mounted = await mount(<InvoiceList />);
    const openRange = () => click(document.querySelector('.invoice-filter-date-range'));
    const from = () => document.querySelector('input[aria-label="From Date"]');
    const to = () => document.querySelector('input[aria-label="To Date"]');
    try {
      await openRange();
      const initialCalls = calls.length;
      await input(from(), '2026-10-10');
      await input(to(), '2026-10-09');
      assert.equal(calls.length, initialCalls, 'Draft dates must not query the backend');
      assert.equal(button('Apply').disabled, true);
      assert.notEqual(to().type, 'date');
      assert.match(document.body.textContent, /To Date must be on or after From Date/);
      await input(to(), '2026-10-14');
      await click(button('Apply'));
      assert.equal(calls.at(-1).startDate, '2026-10-10');
      assert.equal(calls.at(-1).endDate, '2026-10-14');
      assert.equal(calls.at(-1).page, 1);
      assert.match(document.querySelector('.invoice-filter-date-range').textContent, /10\/10\/2026.*14\/10\/2026/);
      await flush(250);
      assert.equal(document.querySelector('input[aria-label="From Date"]'), null);

      await openRange();
      await input(from(), '2026-10-12');
      await act(async () => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush(250);
      assert.equal(calls.at(-1).startDate, '2026-10-10', 'Dismissal must discard draft edits');
      await openRange();
      assert.equal(from().value, '2026-10-10');
      await click(button('Clear'));
      assert.equal(calls.at(-1).startDate, '');
      assert.equal(calls.at(-1).endDate, '');
      assert.equal(document.querySelector('.invoice-filter-date-range').textContent, 'Date Range');
      await flush(250);

      await openRange();
      await input(to(), '2026-10-14');
      await click(button('Apply'));
      assert.equal(calls.at(-1).startDate, '');
      assert.equal(calls.at(-1).endDate, '2026-10-14');
      await flush(250);
      await openRange();
      await input(to(), '');
      await input(from(), '2026-10-10');
      await click(button('Apply'));
      assert.equal(calls.at(-1).startDate, '2026-10-10');
      assert.equal(calls.at(-1).endDate, '');
      await click(button('Reset Filters'));
      assert.equal(document.querySelector('.invoice-filter-date-range').textContent, 'Date Range');
    } finally {
      await mounted.close();
    }
  });
});

test("List shows backend error separately from empty state", async () => {
  await defaults(
    {
      list: async () => {
        throw new Error("Invoice server failed");
      },
      summary: async () => [],
    },
    async () => {
      const mounted = await mount(<InvoiceList />);
      try {
        assert.match(mounted.host.textContent, /Invoice server failed/);
        assert.doesNotMatch(mounted.host.textContent, /No invoices found/);
      } finally {
        await mounted.close();
      }
    },
  );
  await defaults(
    { list: async () => page([]), summary: async () => [] },
    async () => {
      const mounted = await mount(<InvoiceList />);
      try {
        assert.match(mounted.host.textContent, /No invoices found/);
      } finally {
        await mounted.close();
      }
    },
  );
});
test("Edit loads server values; inline financial and saved preview/back preserve edits; 409 reload restores latest", async () => {
  let saved;
  let latest = invoice;
  const calculations = [];
  await defaults(
    {
      get: async () => latest,
      calculate: async payload => { calculations.push(payload); return calculation; },
      save: async (id, payload) => {
        saved = payload;
        throw Object.assign(new Error("Stale"), { response: { status: 409 } });
      },
    },
    async () => {
      const mounted = await mount(
        <InvoiceForm />,
        "/invoices/7/edit",
        "/invoices/:id/edit",
        <>
          <Route path="/invoices/:id/preview" element={<InvoicePreview />} />
          <Route path="/invoices/:id" element={<InvoiceDetails />} />
        </>,
      );
      try {
        await flush(400);
        const description = [...document.querySelectorAll("input")].find(
          (el) =>
            el.value === "Saved product" &&
            el.getAttribute("role") !== "combobox",
        );
        await input(description, "Unsaved description");
        await flush(420);
        // CalculationRequest carries financial inputs, not line descriptions.
        assert.equal(calculations.at(-1).items[0].unitPrice, item.unitPrice);
        assert.equal(calculations.at(-1).items[0].quantity, item.quantity);
        const totals = mounted.host.querySelector('.invoice-total-panel');
        assert.match(totals.textContent, /Authoritative Preview/);
        assert.match(totals.textContent, /100\.00/);
        await mounted.go('/invoices/7/preview');
        assert.match(mounted.host.textContent, /Review the saved invoice/);
        assert.match(mounted.host.textContent, /Saved product/);
        assert.doesNotMatch(mounted.host.textContent, /Unsaved description/);
        await click(mounted.host.querySelector('a[href="/invoices/7"]'));
        assert.match(mounted.host.textContent, /Draft #7/);
        await mounted.go(-1);
        assert.match(mounted.host.textContent, /Invoice Preview/);
        await click(mounted.host.querySelector('a[href="/invoices/7/edit"]'));
        await flush(420);
        assert.ok(document.querySelector('input[value="Unsaved description"]'));
        await click(button("Save Draft"));
        assert.equal(saved.rowVersion, invoice.rowVersion);
        assert.match(mounted.host.textContent, /changed by another user/);
        assert.equal(saved.items[0].description, 'Unsaved description');
        assert.ok(document.querySelector('input[value="Unsaved description"]'));
        latest = { ...invoice, rowVersion: 'server-reloaded-version', items: [{ ...item, description: 'Latest server description' }] };
        await click(button("Reload latest"));
        assert.ok(document.querySelector('input[value="Latest server description"]'));
        await flush(420);
        await click(button('Save Draft'));
        assert.equal(saved.rowVersion, latest.rowVersion);
      } finally {
        await mounted.close();
      }
    },
  );
});
test("Add/remove multiple item lines retains backend calculation display", async () => {
  await defaults({ get: async () => invoice }, async () => {
    const mounted = await mount(
      <InvoiceForm />,
      "/invoices/7/edit",
      "/invoices/:id/edit",
    );
    try {
      await flush(420);
      await click(button("Add Line"));
      assert.equal(
        document.querySelectorAll('[aria-label^="Remove line"]').length,
        2,
      );
      await click(document.querySelector('[aria-label="Remove line 2"]'));
      assert.equal(
        document.querySelectorAll('[aria-label^="Remove line"]').length,
        1,
      );
    } finally {
      await mounted.close();
    }
  });
});
test("Issue confirmation prevents duplicate submit and shows backend-assigned number/status", async () => {
  let count = 0;
  let resolve;
  const pending = new Promise((r) => (resolve = r));
  await defaults(
    {
      get: async () => invoice,
      issue: async () => {
        count++;
        return pending;
      },
    },
    async () => {
      const mounted = await mount(
        <InvoiceActions
          invoice={invoice}
          permissions={{ view: true, manage: true }}
        />,
      );
      try {
        await click(document.querySelector('[aria-label^="Actions for"]'));
        await click(
          [...document.querySelectorAll("[role=menuitem]")].find(
            (el) => el.textContent === "Issue Invoice",
          ),
        );
        assert.match(document.body.textContent, /Expected number/);
        assert.equal(count, 0);
        const confirm = button("Issue Invoice");
        await act(async () => {
          confirm.click();
          confirm.click();
        });
        await flush();
        assert.equal(count, 1);
        await act(async () =>
          resolve({
            ...invoice,
            status: "Issued",
            invoiceNumber: "BACKEND-0042",
          }),
        );
        await flush();
        assert.match(mounted.host.textContent, /BACKEND-0042/);
        assert.match(mounted.host.textContent, /Issued/);
      } finally {
        await mounted.close();
      }
    },
  );
});
test("Details tabs query payment/credit/audit; draft communication requires issue and exposes no Send action", async () => {
  const calls = [];
  await defaults(
    {
      get: async () => invoice,
      payments: async (id) => {
        calls.push("payments");
        return page([]);
      },
      audit: async (id) => {
        calls.push("audit");
        return page([]);
      },
    },
    () =>
      mock(
        creditNoteService,
        {
          list: async (filters) => {
            assert.equal(filters.invoiceId, "7");
            calls.push("credits");
            return page([]);
          },
        },
        async () => {
          const mounted = await mount(
            <InvoiceDetails />,
            "/invoices/7",
            "/invoices/:id",
          );
          try {
            assert.match(mounted.host.textContent, /Draft #7/);
            await click(button("Items"));
            assert.match(mounted.host.textContent, /Persisted line items/);
            await click(button("Payments"));
            await click(button("Credit Notes"));
            await click(button("Audit"));
            await click(button("Communication"));
            assert.deepEqual(calls, ["payments", "credits", "audit"]);
            assert.match(
              mounted.host.textContent,
              /Draft invoice must be issued prior to dispatch/,
            );
            assert.equal(button('Send Invoice'), undefined);
            assert.equal(button('Resend'), undefined);
            assert.doesNotMatch(mounted.host.textContent, /Email Sent Successfully/);
          } finally {
            await mounted.close();
          }
        },
      ),
  );
});
test('Invoice Send transport requires confirmed true and propagates failures (API boundary only)', async () => {
  const calls = [];
  await mock(apiClient, { post: async (url, body) => {
    calls.push([url, body]);
    return { success: true, data: false };
  } }, async () => {
    await assert.rejects(invoiceService.send(invoice.id), /not sent/);
    assert.equal(calls[0][0], '/api/v1/invoices/7/send');
  });
  const failure = Object.assign(new Error('Dispatch rejected'), { response: { status: 400 } });
  await mock(apiClient, { post: async () => { throw failure; } }, async () => {
    await assert.rejects(invoiceService.send(invoice.id), error => error === failure);
  });
});

test('Payment retry clears the error/loading state after a confirmed response', async () => {
  let calls = 0;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  await mock(apiClient, { get: async url => {
    assert.equal(url, '/api/Auth/me');
    return { roles: ['TenantAdmin'] };
  } }, () => mock(paymentService, { getPayments: async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('Unavailable'), { response: { status: 500 } });
    await pending;
    return { items: [], totalCount: 0, pageNumber: 1, pageSize: 10 };
  } }, async () => {
    const mounted = await mount(<Payments />, '/payments', '/payments');
    try {
      assert.equal(mounted.host.querySelectorAll('.bd-dashboard-error').length, 1);
      assert.match(mounted.host.textContent, /Unable to load payment data/);
      assert.doesNotMatch(mounted.host.textContent, /No payments found/);
      await click(button('Retry'));
      assert.equal(calls, 2);
      assert.equal(mounted.host.querySelector('[aria-label="Refresh payments"]').disabled, true);
      finish();
      await flush();
      assert.match(mounted.host.textContent, /No payments found/);
      assert.equal(mounted.host.querySelector('.bd-dashboard-error'), null);
      assert.equal(mounted.host.querySelector('.payment-loading'), null);
      assert.equal(mounted.host.querySelector('[aria-label="Refresh payments"]').disabled, false);
    } finally { finish(); await mounted.close(); }
  }));
});

test('Record payment preserves fractions, compares the exact fresh balance and blocks duplicate submission', async () => {
  // Isolated test fixtures; no fixture data enters runtime modules or live APIs.
  const balance = { invoiceId: invoice.id, customerId: invoice.customerId, invoiceNumber: 'TEST', customerName: customer.name, currency: invoice.currency, invoiceTotal: invoice.totalAmount, previouslyPaid: 0, currentOutstanding: 80.25, isEligibleForPayment: true };
  let freshBalance = balance;
  let balanceReads = 0;
  const sent = [];
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  await mock(paymentService, {
    getEligibleInvoices: async () => [balance],
    getInvoiceBalance: async () => { balanceReads++; return freshBalance; },
    createPayment: async dto => { sent.push(dto); await pending; return { id: 9 }; },
  }, async () => {
    const mounted = await mount(<RecordPayment />, { pathname: '/payments/new', state: { invoiceId: invoice.id } }, '/payments/new', <Route path="/payments/:id" element={<div>Persisted payment route</div>} />);
    try {
      await flush();
      const amount = mounted.host.querySelector('input[type="number"]');
      const method = [...mounted.host.querySelectorAll('[role="combobox"]')].find(el => el.tagName !== 'INPUT');
      assert.ok(method);
      await act(async () => method.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })));
      await click([...document.querySelectorAll('[role="option"]')].find(el => el.textContent === 'Cash'));
      for (const value of ['0', '-1', '1.001']) {
        await input(amount, value);
        await click(button('Review Payment'));
        assert.equal(button('Confirm Payment'), undefined);
        assert.equal(sent.length, 0);
        assert.equal(amount.getAttribute('aria-invalid'), 'true');
      }
      await input(amount, '80.26');
      await click(button('Review Payment'));
      assert.match(mounted.host.textContent, /exceeds the current outstanding/);
      freshBalance = { ...balance, currentOutstanding: 80.24 };
      await input(amount, '80.25');
      await click(button('Review Payment'));
      assert.match(mounted.host.textContent, /exceeds the current outstanding/);
      freshBalance = balance;
      await input(amount, '80.25');
      await click(button('Review Payment'));
      assert.ok(balanceReads >= 4);
      assert.equal(amount.value, '80.25');
      const confirm = button('Confirm Payment');
      assert.ok(confirm);
      await act(async () => { confirm.click(); confirm.click(); });
      assert.equal(sent.length, 1);
      assert.equal(sent[0].amount, 80.25);
      assert.ok(sent[0].idempotencyKey);
      finish(); await flush();
      assert.match(mounted.host.textContent, /Persisted payment route/);
    } finally { finish(); await mounted.close(); }
  });
});

test("Numbering validates real tokens, unknown tokens, sequence bounds and enable/disable statuses", async () => {
  assert.equal(validTokens("{YEAR}-{DD}-{FY}-"), true);
  assert.equal(validTokens("{SEQ}"), false);
  assert.equal(validTokens("(YEAR)"), false);
  assert.equal(validTokens("{UNKNOWN}"), false);
  await numberingValidationSchema.validate(setting);
  await numberingValidationSchema.validate({ ...setting, status: "Inactive" });
  await assert.rejects(
    numberingValidationSchema.validate({ ...setting, sequenceLength: 2 }),
  );
  await assert.rejects(
    numberingValidationSchema.validate({ ...setting, nextNumber: 0 }),
  );
});
test("Numbering uses preview endpoint only and never consumes sequence or sends version as fake DTO", async () => {
  const calls = [];
  await mock(
    apiClient,
    {
      post: async (path, body) => {
        calls.push([path, body]);
        return {
          success: true,
          data: { fullPreview: "SERVER-PREVIEW", parts: {} },
        };
      },
    },
    async () =>
      assert.equal(
        (await numberingService.preview(setting)).fullPreview,
        "SERVER-PREVIEW",
      ),
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/v1/settings/numbering/preview");
  assert.equal(calls[0][1].tokens, "{YEAR}-");
  assert.equal(Object.hasOwn(calls[0][1], "rowVersion"), false);
});
test("Numbering dynamically previews edits; save waits for server confirmation and prevents duplicate submits", async () => {
  const sent = []; const previews = []; let finish;
  await mock(numberingService, {
    getSettings: async () => setting,
    preview: async values => { previews.push(values); return { fullPreview: `${values.prefix}server`, parts: {} }; },
    updateSettings: values => { sent.push(values); return new Promise(resolve => { finish = resolve; }); },
  }, async () => {
    const mounted = await mount(<NumberingSettings />, "/settings/numbering");
    try {
      await flush(360);
      assert.match(mounted.host.textContent, /T-server/);
      await input(document.querySelector('input[value="T-"]'), "QA-");
      await flush(360);
      assert.equal(previews.at(-1).prefix, "QA-");
      const save = button("Save Changes");
      await act(async () => { save.click(); save.click(); });
      await flush();
      assert.equal(sent.length, 1); assert.equal(sent[0].rowVersion, 'v1');
      assert.doesNotMatch(document.body.textContent, /saved successfully/);
      await act(async () => finish({ ...sent[0], rowVersion: 'v2' }));
      await flush();
      assert.match(document.body.textContent, /saved successfully/);
      await click(button('Save Changes'));
      assert.equal(sent.length, 2); assert.equal(sent[1].rowVersion, 'v2');
      await act(async () => finish({ ...sent[1], rowVersion: 'v3' }));
    } finally { await mounted.close(); }
  });
});

test("Numbering stale RowVersion keeps edits, stops further PUTs and reloads the authoritative settings explicitly", async () => {
  let gets = 0; const sent = [];
  await mock(numberingService, {
    getSettings: async () => ({ ...setting, rowVersion: ++gets === 1 ? 'v1' : 'v2', nextNumber: gets === 1 ? 1 : 2 }),
    preview: async () => ({ fullPreview: 'SERVER', parts: {} }),
    updateSettings: async values => { sent.push(values); throw Object.assign(new Error('Concurrency error: modified by another user.'), {status: 409}); },
  }, async () => {
    const mounted = await mount(<NumberingSettings />, "/settings/numbering");
    try {
      await input(document.querySelector('input[value="T-"]'), 'MY-EDIT-');
      await click(button('Save Changes'));
      assert.equal(sent.length, 1); assert.equal(sent[0].rowVersion, 'v1');
      assert.equal(document.getElementById('prefix-input').value, 'MY-EDIT-');
      assert.match(document.body.textContent, /modified by another user/);
      assert.equal(button('Save Changes').disabled, true);
      await click(button('Reload saved settings')); await flush();
      assert.equal(document.getElementById('prefix-input').value, 'T-');
      assert.equal(document.getElementById('next-num-input').value, '2');
      assert.equal(button('Save Changes').disabled, false);
    } finally { await mounted.close(); }
  });
});

test("Issue, Cancel and Void use separate confirmed endpoints; reasons are sent only for cancel/void", async () => {
  const calls = [];
  await mock(
    apiClient,
    {
      post: async (...args) => {
        calls.push(args);
        return { success: true, data: invoice };
      },
    },
    async () => {
      await invoiceApi.issueInvoice(7);
      await invoiceApi.cancelInvoice(7, "Cancel QA");
      await invoiceApi.voidInvoice(7, "Void QA");
    },
  );
  assert.deepEqual(calls, [
    ["/api/v1/invoices/7/issue"],
    ["/api/v1/invoices/7/cancel", { reason: "Cancel QA" }],
    ["/api/v1/invoices/7/void", { reason: "Void QA" }],
  ]);
});
for (const action of ["cancel", "void"])
  test(`${action} requires a reason and backend confirmation; failure is never shown as success`, async () => {
    let count = 0;
    const issued = { ...invoice, status: "Issued", invoiceNumber: "SERVER-7" };
    await defaults(
      {
        get: async () => issued,
        [action]: async (id, reason) => {
          count++;
          assert.equal(reason, "QA reason");
          throw new Error("Backend denied transition");
        },
      },
      async () => {
        const mounted = await mount(
          <InvoiceActions
            invoice={issued}
            permissions={{ view: true, manage: true }}
          />,
        );
        try {
          await click(document.querySelector('[aria-label^="Actions for"]'));
          const label = action === "cancel" ? "Cancel Invoice" : "Void Invoice";
          await click(
            [...document.querySelectorAll("[role=menuitem]")].find(
              (el) => el.textContent === label,
            ),
          );
          assert.equal(button(label).disabled, true);
          await input(document.querySelector("textarea"), "QA reason");
          await click(button(label));
          assert.equal(count, 1);
          assert.match(document.body.textContent, /Backend denied transition/);
          assert.doesNotMatch(document.body.textContent, /confirmed:/);
        } finally {
          await mounted.close();
        }
      },
    );
  });
test("PDF download reuses server snapshot generation/download and propagates failed requests", async () => {
  const calls = [];
  let downloads = 0;
  const original = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = () => downloads++;
  try {
    await mock(
      templateApi,
      {
        generateInvoicePdf: async (id, request) => {
          calls.push(["generate", id, request.forceRegenerate]);
        },
        downloadInvoicePdf: async (id) => {
          calls.push(["download", id]);
          return new Blob(["%PDF-test"], { type: "application/pdf" });
        },
      },
      async () =>
        invoiceService.downloadPdf({
          ...invoice,
          status: "Issued",
          invoiceNumber: "SERVER-7",
        }),
    );
    assert.equal(downloads, 1);
    assert.deepEqual(calls, [
      ["generate", 7, false],
      ["download", 7],
    ]);
    await mock(
      templateApi,
      {
        generateInvoicePdf: async () => {
          throw new Error("PDF service failed");
        },
      },
      async () =>
        assert.rejects(
          invoiceService.downloadPdf(invoice),
          /PDF service failed/,
        ),
    );
  } finally {
    window.HTMLAnchorElement.prototype.click = original;
  }
});
test("Audit filters exact invoice IDs only within the real server page and preserves pagination", async () => {
  await mock(
    apiClient,
    {
      get: async (path, options) => {
        assert.equal(path, "/api/Audit");
        assert.deepEqual(options.params, {
          entityName: "Invoice",
          page: 2,
          pageSize: 20,
        });
        return {
          success: true,
          data: {
            ...page([
              { id: 1, entityId: "7" },
              { id: 2, entityId: "70" },
            ]),
            pageNumber: 2,
            totalPages: 5,
            totalCount: 88,
          },
        };
      },
    },
    async () => {
      const data = await invoiceService.audit(7, 2);
      assert.deepEqual(
        data.items.map((row) => row.id),
        [1],
      );
      assert.equal(data.totalPages, 5);
    },
  );
});
test("Successful draft save uses backend result and navigates to its actual persisted ID", async () => {
  let saved;
  await defaults(
    {
      get: async () => invoice,
      save: async (id, payload) => {
        saved = payload;
        return {
          ...invoice,
          id: 88,
          totalAmount: 125,
          rowVersion: "SERVER-NEW-VERSION",
        };
      },
    },
    async () => {
      const mounted = await mount(
        <InvoiceForm />,
        "/invoices/7/edit",
        "/invoices/:id/edit",
      );
      try {
        await flush(400);
        await click(button("Save Draft"));
        assert.equal(saved.rowVersion, invoice.rowVersion);
        assert.match(mounted.host.textContent, /Saved invoice route/);
      } finally {
        await mounted.close();
      }
    },
  );
});

test("Create selects a remote customer/product, fills real metadata and saves a draft without a final number", async () => {
  let saved;
  let productReads = 0;
  await defaults(
    {
      product: async (id) => {
        productReads++;
        return {
          id: 3,
          name: "Test Product",
          price: 100,
          currency: "INR",
          unit: "each",
          hsnSacCode: "HSN",
        };
      },
      save: async (id, body) => {
        assert.equal(id, undefined);
        saved = body;
        return { ...invoice, id: 91 };
      },
    },
    async () => {
      const mounted = await mount(
        <InvoiceForm />,
        "/invoices/new",
        "/invoices/new",
      );
      try {
        let combo = document.querySelector("input[role=combobox]");
        await input(combo, "Test");
        await flush(320);
        await click(document.querySelector("[role=option]"));
        assert.ok(document.querySelector('input[value="INR"]'));
        await input(
          document.querySelector('input[placeholder="dd/mm/yyyy"]'),
          "05/10/2026",
        );
        await input(
          document.querySelectorAll('input[placeholder="dd/mm/yyyy"]')[1],
          "20/10/2026",
        );
        combo = document.querySelectorAll("input[role=combobox]")[1];
        await input(combo, "Test");
        await flush(320);
        await click(document.querySelector("[role=option]"));
        await flush(400);
        assert.equal(productReads, 1);
        assert.ok(document.querySelector('input[value="HSN"]'));
        await click(button("Save Draft"));
        assert.equal(saved.customerId, 2);
        assert.equal(saved.items[0].productId, 3);
        assert.equal(saved.items[0].unitPrice, 100);
        assert.equal(Object.hasOwn(saved, "invoiceNumber"), false);
        assert.match(mounted.host.textContent, /Saved invoice route/);
      } finally {
        await mounted.close();
      }
    },
  );
});
test("Numbering unknown tokens remain visible and cannot be saved", async () => {
  let writes = 0;
  await mock(
    numberingService,
    {
      getSettings: async () => ({ ...setting, tokens: '{UNKNOWN}' }),
      preview: async () => ({ fullPreview: "SERVER", parts: {} }),
      updateSettings: async () => {
        writes++;
        return setting;
      },
    },
    async () => {
      const mounted = await mount(<NumberingSettings />, "/settings/numbering");
      try {
        await flush(340);
        assert.match(mounted.host.textContent, /UNKNOWN/);
        await click(button("Save Changes"));
        assert.match(mounted.host.textContent, /unsupported token/);
        assert.equal(writes, 0);
        assert.equal(button("Confirm Save"), undefined);
      } finally {
        await mounted.close();
      }
    },
  );
});

test("Blank draft displays required-field errors and never submits to the API", async () => {
  let calls = 0;
  await defaults(
    {
      save: async () => {
        calls++;
        return invoice;
      },
    },
    async () => {
      const mounted = await mount(
        <InvoiceForm />,
        "/invoices/new",
        "/invoices/new",
      );
      try {
        const dates = [...mounted.host.querySelectorAll('input')].filter(el => el.placeholder === 'dd/mm/yyyy');
        assert.equal(dates.length, 2);
        assert.ok(dates.every(el => /^\d{2}\/\d{2}\/\d{4}$/.test(el.value)));
        await click(button("Save Draft"));
        assert.equal(calls, 0);
        assert.match(mounted.host.textContent, /Select a customer/);
        assert.doesNotMatch(mounted.host.textContent, /Enter a valid date/);
        assert.match(mounted.host.textContent, /Select a product or service/);
        await input(dates[0], '31/02/2026');
        await click(button('Save Draft'));
        assert.match(mounted.host.textContent, /Enter a valid date/);
        assert.equal(calls, 0);
        await input(dates[0], '');
        await input(dates[1], '');
        await click(button('Save Draft'));
        assert.ok(dates.every(el => el.getAttribute('aria-invalid') === 'true'));
        assert.equal(calls, 0);
      } finally {
        await mounted.close();
      }
    },
  );
});


test("Invoice customer lookup adapts the shared API array to dropdown items", async () => {
  const original = customerApi.getCustomers;
  let requested;
  customerApi.getCustomers = async (params) => { requested = params; return [customer]; };
  try {
    const result = await invoiceService.customers("Test");
    assert.deepEqual(result.items, [customer]);
    assert.equal(requested.search, "Test");
    assert.equal(requested.status, "Active");
  } finally { customerApi.getCustomers = original; }
});


test('Invoice CSV export keeps current filters, guards duplicate clicks and discloses the 10,000-row cap', async () => {
  const original = { get: apiClient.get, create: URL.createObjectURL, revoke: URL.revokeObjectURL, click: HTMLAnchorElement.prototype.click };
  const calls = []; const downloads = []; let finish;
  apiClient.get = (url, options) => { calls.push({url, options}); return new Promise(resolve => {finish = resolve;}); };
  URL.createObjectURL = () => 'blob:test-export'; URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
  try {
    await mock(invoiceService, {list: async () => page([]), customers: async () => ({items: []}), summary: async () => []}, async () => {
      const mounted = await mount(<InvoiceList />, '/invoices?currency=INR&paymentState=Overdue&startDate=2026-10-01&endDate=2026-10-24');
      try {
        const exportButton = button('Export CSV');
        await act(async () => { exportButton.click(); exportButton.click(); });
        assert.equal(calls.length, 1); assert.equal(calls[0].url, '/api/v1/invoices/export');
        assert.equal(calls[0].options.params.currency, 'INR'); assert.equal(calls[0].options.params.paymentState, 'Overdue');
        assert.equal(calls[0].options.params.startDate, '2026-10-01T00:00:00Z');
        assert.equal(calls[0].options.params.endDate, '2026-10-24T23:59:59.999Z');
        assert.equal(calls[0].options.params.page, undefined);
        assert.equal(downloads.length, 0); assert.equal(button('Exporting CSV...').disabled, true);
        await act(async () => finish(new Blob(['InvoiceNumber,Date\n'], {type:'text/csv'}))); await flush();
        assert.equal(downloads.length, 1); assert.match(mounted.host.textContent, /at most the first 10,000/);
        assert.match(mounted.host.textContent, /completeness is not verified/);
        apiClient.get = async () => { throw new Error('CSV unavailable'); };
        await click(button('Export CSV')); await flush();
        assert.match(mounted.host.textContent, /CSV unavailable/); assert.equal(downloads.length, 1);
        assert.equal(button('Export CSV').disabled, false);
      } finally { await mounted.close(); }
    });
  } finally { apiClient.get = original.get; URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke; HTMLAnchorElement.prototype.click = original.click; }
});
