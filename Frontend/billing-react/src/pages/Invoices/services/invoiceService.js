import { unwrapInvoice } from "../../../../../billing-api-client/invoiceApi.js";
import {
  apiClient,
  invoiceApi,
  customerApi,
  productApi,
  financialApi,
  templateApi,
} from "billing-api-client";
import { mapPayment, unwrapPayment } from "../../Payments/paymentService";
import { phase5Api } from "../../Settings/services/phase5Api";
import { hasPermission } from "../../../utils/permissionUtils";
export const INVOICE_STATUSES = [
  "Draft",
  "Issued",
  "Sent",
  "Partially Paid",
  "Paid",
  "Overdue",
  "Cancelled",
  "Voided",
];
export const SORT_FIELDS = [
  "InvoiceDate",
  "InvoiceNumber",
  "TotalAmount",
  "BalanceAmount",
];
export function invoiceQuery(values) {
  return Object.fromEntries(
    Object.entries({
      searchTerm: values.search?.trim(),
      status: values.status,
      customerId: values.customerId,
      startDate: values.startDate ? `${values.startDate}T00:00:00Z` : undefined,
      endDate: values.endDate ? `${values.endDate}T23:59:59.999Z` : undefined,
      currency: values.currency?.trim().toUpperCase(),
      paymentState: values.paymentState,
      page: values.page || 1,
      pageSize: values.pageSize || 20,
      sortBy: values.sortBy || "InvoiceDate",
      sortOrder: values.sortOrder || "desc",
    }).filter(([, value]) => value !== "" && value != null),
  );
}
export function requirePage(data) {
  if (
    !data ||
    !Array.isArray(data.items) ||
    !Number.isInteger(data.totalCount) ||
    !Number.isInteger(data.pageNumber) ||
    !Number.isInteger(data.pageSize) ||
    data.pageSize < 1
  )
    throw new Error("Invalid invoice pagination response.");
  return data;
}
export function requireInvoice(data) {
  if (
    !data ||
    !Number.isInteger(data.id) ||
    !data.status ||
    !data.currency ||
    !Number.isFinite(data.totalAmount) ||
    !data.rowVersion
  )
    throw new Error("Invalid invoice response.");
  return data;
}
export function invoiceError(error) {
  if ((error?.response?.status ?? error?.status) === 409)
    return "This invoice was changed by another user. Reload the latest version before saving.";
  const data = error?.response?.data;
  const errors = data?.errors
    ? Object.values(data.errors)
        .flat()
        .filter((value) => typeof value === "string")
    : [];
  return (
    errors.join(" ") ||
    data?.message ||
    error?.userMessage ||
    error?.message ||
    "Invoice request failed. Please retry."
  );
}
export function resolveCurrentUser(user) {
  if (user?.role || user?.roles || user?.Role || user?.Roles) return user;
  if (
    user?.data?.role ||
    user?.data?.roles ||
    user?.data?.Role ||
    user?.data?.Roles
  )
    return user.data;
  if (
    user?.user?.role ||
    user?.user?.roles ||
    user?.user?.Role ||
    user?.user?.Roles
  )
    return user.user;

  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem("billing_auth_user");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.role || parsed?.roles || parsed?.Role || parsed?.Roles) {
          return parsed;
        }
      }
    } catch {}

    try {
      const token = localStorage.getItem("billing_auth_token");
      if (token) {
        const parts = token.split(".");
        if (parts.length >= 2) {
          const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
          const json =
            typeof atob === "function"
              ? atob(b64)
              : typeof Buffer !== "undefined"
                ? Buffer.from(b64, "base64").toString("utf-8")
                : null;
          if (json) {
            const claims = JSON.parse(json);
            const role =
              claims[
                "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
              ] ||
              claims.role ||
              claims.Role;
            const roles =
              claims.roles || claims.Roles || (role ? [role] : []);
            if (role || roles.length) {
              return { role, roles, ...claims };
            }
          }
        }
      }
    } catch {}
  }
  return user;
}

export function invoicePermissions(user) {
  const resolved = resolveCurrentUser(user);

  const canView = hasPermission('invoices.view', resolved) || hasPermission('invoices.manage', resolved);
  const canCreate = hasPermission('invoices.create', resolved) || hasPermission('invoices.manage', resolved);
  const canEdit = hasPermission('invoices.edit', resolved) || hasPermission('invoices.manage', resolved);
  const canIssue = hasPermission('invoices.approve', resolved) || hasPermission('invoices.issue', resolved) || hasPermission('invoices.manage', resolved);
  const canDelete = hasPermission('invoices.delete', resolved) || hasPermission('invoices.cancel', resolved) || hasPermission('invoices.manage', resolved);
  const canCancel = hasPermission('invoices.cancel', resolved) || hasPermission('invoices.delete', resolved) || hasPermission('invoices.manage', resolved);
  const canManage = hasPermission('invoices.manage', resolved);

  return {
    view: canView,
    create: canCreate,
    edit: canEdit,
    issue: canIssue,
    delete: canDelete,
    cancel: canDelete,
    manage: canManage,
    canView,
    canCreate,
    canEdit,
    canIssue,
    canDelete,
    canCancel,
    canManage,
  };
}
export function financialBlockers(invoice) {
  const blockers = [];
  if (
    invoice?.items?.some(
      (item) =>
        (Number(item.discountRate) < 0 || Number(item.discountAmount) < 0) ||
        (item.discountType === "Percentage" && Number(item.discountRate) > 100),
    )
  )
    blockers.push(
      "Line discount values must be non-negative and valid.",
    );
  return blockers;
}
export function invoiceActions(invoice, permissions = {}) {
  const canView = permissions.view ?? permissions.canView ?? true;
  if (!canView) return [];
  const actions = ["view", "preview"];
  if (invoice.status !== "Draft") actions.push("pdf");

  const canEdit = permissions.edit || permissions.canEdit || permissions.manage || permissions.canManage;
  const canIssue = permissions.issue || permissions.canIssue || permissions.manage || permissions.canManage;
  const canDelete = permissions.delete || permissions.canDelete || permissions.cancel || permissions.canCancel || permissions.manage || permissions.canManage;
  const canRecordPayment = permissions.manage || permissions.canManage || hasPermission('payments.create');
  const canCreateCredit = permissions.manage || permissions.canManage || hasPermission('creditnotes.create');

  if (invoice.status === "Draft" && !financialBlockers(invoice).length) {
    if (canEdit) actions.push("edit");
    if (canIssue) actions.push("issue");
  }

  if (
    ["Issued", "Sent", "Overdue", "Partially Paid"].includes(invoice.status) &&
    Number(invoice.balanceAmount) > 0 &&
    canRecordPayment
  ) {
    actions.push("payment");
  }

  if (
    ["Issued", "Sent", "Overdue", "Partially Paid", "Paid"].includes(invoice.status) &&
    Number(invoice.totalAmount) > 0 &&
    Number(invoice.creditedAmount) < Number(invoice.totalAmount) &&
    canCreateCredit
  ) {
    actions.push("credit");
  }

  if (
    ["Issued", "Sent", "Overdue"].includes(invoice.status) &&
    Number(invoice.paidAmount) === 0 &&
    !invoice.paymentAllocations?.some((p) => !p.isReversed) &&
    canDelete
  ) {
    actions.push("cancel", "void");
  }

  return actions;
}
export const invalidateInvoices = (client) =>
  Promise.all(
    [
      "invoices",
      "invoice",
      "numbering",
      "invoice-audit",
      "dashboard",
      "payment-invoices",
      "payment-balance",
      "customers",
      "creditNotes",
    ].map((key) => client.invalidateQueries({ queryKey: [key] })),
  );
export function createSubmissionGuard() {
  let busy = false;
  return {
    acquire() {
      if (busy) return false;
      busy = true;
      return true;
    },
    release() {
      busy = false;
    },
  };
}
export const invoiceService = {
  async list(values, options) {
    return requirePage(
      await invoiceApi.getInvoices(invoiceQuery(values), options),
    );
  },
  async summary(options) {
    const data = await invoiceApi.getSummary(options);
    const rows = Array.isArray(data) ? data : [data];
    if (
      rows.some(
        (row) =>
          !row?.currency ||
          ![
            "totalInvoiced",
            "totalPaid",
            "totalOutstanding",
            "overdueAmount",
          ].every((key) => Number.isFinite(row[key])),
      )
    )
      throw new Error("Invalid currency-scoped invoice summary.");
    return rows;
  },
  async get(id, options) {
    return requireInvoice(await invoiceApi.getInvoiceById(id, options));
  },
  async save(id, payload) {
    return requireInvoice(
      await (id
        ? invoiceApi.updateDraft(id, payload)
        : invoiceApi.createDraft(payload)),
    );
  },
  async issue(id) {
    return requireInvoice(await invoiceApi.issueInvoice(id));
  },
  async send(id) {
    const sent = await invoiceApi.sendInvoice(id);
    if (sent !== true) throw new Error("The invoice email was not sent.");
    return sent;
  },
  async cancel(id, reason) {
    return requireInvoice(await invoiceApi.cancelInvoice(id, reason));
  },
  async void(id, reason) {
    return requireInvoice(await invoiceApi.voidInvoice(id, reason));
  },
  async customers(search) {
    const items = await customerApi.getCustomers({
      search,
      status: "Active",
      pageNumber: 1,
      pageSize: 30,
    });
    if (!Array.isArray(items))
      throw new Error("Invalid customer catalog response.");
    return { items };
  },
  customer: (id) => customerApi.getCustomerById(id),
  async products(search) {
    const data = await productApi.getProducts({
      search,
      isActive: true,
      pageNumber: 1,
      pageSize: 30,
    });
    if (!Array.isArray(data?.items))
      throw new Error("Invalid product catalog response.");
    return data;
  },
  product: (id) => productApi.getProductById(id),
  validateProduct: (id) =>
    apiClient
      .get(`/api/v1/products/${encodeURIComponent(id)}/validate-invoice`)
      .then(unwrapInvoice),
  async taxes() {
    const response = await apiClient.get("/api/v1/settings/taxes", {
      params: { status: "Active", applicationLevel: "Item" },
    });
    if (response.success !== true || !response.data)
      throw new Error(response.message || "Invalid tax settings response.");
    return response.data;
  },
  discountSettings: () => phase5Api.getDiscountConfiguration(),
  validateDiscount: (value, invoiceAmount) =>
    phase5Api.validateMaximumDiscount({
      value,
      discountType: "Fixed",
      invoiceAmount,
    }),
  charges: () => phase5Api.getCharges(),
  calculateCharges: (subtotal, ids) =>
    phase5Api.calculateCharges({ subtotal, selectedChargeIds: ids }),
  calculate: (request) => financialApi.calculate(request),
  async payments(id, page = 1) {
    const response = await apiClient.get("/api/v1/payments", {
      params: { invoiceId: id, pageNumber: page, pageSize: 20 },
    });
    const data = requirePage(unwrapPayment(response));
    return { ...data, items: data.items.map(mapPayment) };
  },
  async audit(id, page = 1) {
    const response = await apiClient.get("/api/Audit", {
      params: { entityName: "Invoice", page, pageSize: 20 },
    });
    if (response.success !== true)
      throw new Error(response.message || "Audit request failed.");
    const data = requirePage(response.data);
    return {
      ...data,
      items: data.items.filter((row) => String(row.entityId) === String(id)),
    };
  },
  async downloadPdf(invoice, selectedTemplateId = null, forceRegenerate = false) {
    await templateApi.generateInvoicePdf(invoice.id, {
      invoiceId: invoice.id,
      overrideTemplateId: selectedTemplateId == null ? null : Number(selectedTemplateId),
      forceRegenerate,
    });
    const blob = await templateApi.downloadInvoicePdf(invoice.id, false);
    if (!(blob instanceof Blob) || !blob.size || !blob.type.includes("pdf"))
      throw new Error("The server did not return an invoice PDF.");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(invoice.invoiceNumber || `invoice-${invoice.id}`).replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
