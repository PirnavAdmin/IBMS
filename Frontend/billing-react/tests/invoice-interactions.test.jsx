// Synthetic fixtures exist only in tests; production uses authenticated backend APIs.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { apiClient, invoiceApi, templateApi, customerApi } from "billing-api-client";
import { InvoiceList } from "../src/pages/Invoices/InvoiceList";
import { InvoiceForm } from "../src/pages/Invoices/InvoiceForm";
import { InvoiceDetails } from "../src/pages/Invoices/InvoiceDetails";
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
  resetPolicy: "Never",
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
async function mount(element, path = "/invoices", route = "*") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  client.setQueryData(["auth-user"], { role: "TenantAdmin" });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[path]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path={route} element={element} />
            {route !== "/invoices/:id" && (
              <Route
                path="/invoices/:id"
                element={<div>Saved invoice route</div>}
              />
            )}
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await flush();
  return {
    host,
    client,
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
test("Action visibility uses backend roles, actual states and unsafe discount blocker", () => {
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
test("Edit preserves input on 409; preview/back preserves edits; reload restores latest", async () => {
  let saved;
  await defaults(
    {
      get: async () => invoice,
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
        await click(button("Preview"));
        assert.match(document.body.textContent, /Unsaved draft preview/);
        await click(button("Back to Edit"));
        assert.ok(document.querySelector('input[value="Unsaved description"]'));
        await click(button("Save Draft"));
        assert.equal(saved.rowVersion, invoice.rowVersion);
        assert.match(mounted.host.textContent, /changed by another user/);
        await click(button("Reload latest"));
        assert.ok(document.querySelector('input[value="Saved product"]'));
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
test("Details tabs query payment/credit/audit and expose communication blocker", async () => {
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
              /unavailable on the current billing server/,
            );
          } finally {
            await mounted.close();
          }
        },
      ),
  );
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
test("Numbering dynamically previews edits; save requires confirmation", async () => {
  let calls = 0;
  const previews = [];
  await mock(
    numberingService,
    {
      getSettings: async () => setting,
      preview: async (values) => {
        previews.push(values);
        return { fullPreview: `${values.prefix}server`, parts: {} };
      },
      updateSettings: async (values) => {
        calls++;
        return { ...values, rowVersion: "v2" };
      },
    },
    async () => {
      const mounted = await mount(<NumberingSettings />, "/settings/numbering");
      try {
        await flush(360);
        assert.match(mounted.host.textContent, /T-server/);
        await input(document.querySelector('input[value="T-"]'), "QA-");
        await flush(360);
        assert.equal(previews.at(-1).prefix, "QA-");
        await click(button("Save Changes"));
        assert.equal(calls, 0);
        await click(button("Confirm Save"));
        assert.equal(calls, 1);
        assert.match(mounted.host.textContent, /saved by the billing server/);
      } finally {
        await mounted.close();
      }
    },
  );
});
test("Numbering detects changed sequence before PUT and offers Reload latest", async () => {
  let gets = 0;
  let writes = 0;
  await mock(
    numberingService,
    {
      getSettings: async () => ({
        ...setting,
        nextNumber: ++gets === 1 ? 1 : 2,
      }),
      preview: async () => ({ fullPreview: "SERVER", parts: {} }),
      updateSettings: async () => {
        writes++;
        return setting;
      },
    },
    async () => {
      const mounted = await mount(<NumberingSettings />, "/settings/numbering");
      try {
        await flush(360);
        await click(button("Save Changes"));
        await click(button("Confirm Save"));
        assert.equal(writes, 0);
        assert.match(document.body.textContent, /changed by another user/);
        assert.ok(button("Reload latest"));
      } finally {
        await mounted.close();
      }
    },
  );
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
          document.querySelectorAll("input[type=date]")[0],
          "2026-10-05",
        );
        await input(
          document.querySelectorAll("input[type=date]")[1],
          "2026-10-20",
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
      getSettings: async () => setting,
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
        await input(
          document.querySelector('input[value="{YEAR}-"]'),
          "{UNKNOWN}",
        );
        await flush(340);
        assert.ok(document.querySelector('input[value="{UNKNOWN}"]'));
        assert.match(mounted.host.textContent, /unsupported token/);
        await click(button("Save Changes"));
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
        await click(button("Save Draft"));
        assert.equal(calls, 0);
        assert.match(mounted.host.textContent, /Select a customer/);
        assert.match(mounted.host.textContent, /Enter a valid date/);
        assert.match(mounted.host.textContent, /Select a product or service/);
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
