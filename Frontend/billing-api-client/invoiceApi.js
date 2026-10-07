import { apiClient } from "./apiClient.js";
import { API_ENDPOINTS } from "./endpoints.js";

export function unwrapInvoice(response) {
  if (response?.success === false || response?.isSuccess === false) {
    throw Object.assign(
      new Error(response.message || "Invoice request failed."),
      { response: { status: 400, data: response } },
    );
  }
  return response?.data ?? response;
}
function withTenantId(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.tenantId != null && Number(payload.tenantId) > 0) return payload;

  let tenantId = null;
  if (typeof localStorage !== "undefined") {
    try {
      const rawUser = localStorage.getItem("billing_auth_user");
      if (rawUser) {
        const user = JSON.parse(rawUser);
        const tid = Number(user?.tenantId ?? user?.tenant_id);
        if (tid > 0) tenantId = tid;
      }
    } catch {}
    if (!tenantId) {
      try {
        const token = localStorage.getItem("billing_auth_token");
        if (token) {
          const parts = token.split(".");
          if (parts.length >= 2) {
            const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
            const json = typeof atob === "function"
              ? atob(b64)
              : typeof Buffer !== "undefined"
                ? Buffer.from(b64, "base64").toString("utf-8")
                : null;
            if (json) {
              const claims = JSON.parse(json);
              const tid = Number(claims.TenantId ?? claims.tenant_id);
              if (tid > 0) tenantId = tid;
            }
          }
        }
      } catch {}
    }
  }

  return tenantId ? { tenantId, ...payload } : payload;
}

const base = API_ENDPOINTS.INVOICES.BASE;
export const invoiceApi = {
  getInvoices: (params = {}, { signal } = {}) =>
    apiClient.get(base, { params, signal }).then(unwrapInvoice),
  getSummary: ({ signal } = {}) =>
    apiClient.get(`${base}/summary`, { signal }).then(unwrapInvoice),
  getInvoiceById: (id, { signal } = {}) =>
    apiClient
      .get(API_ENDPOINTS.INVOICES.BY_ID(id), { signal })
      .then(unwrapInvoice),
  createDraft: (payload) =>
    apiClient.post(base, withTenantId(payload)).then(unwrapInvoice),
  updateDraft: (id, payload) =>
    apiClient
      .put(API_ENDPOINTS.INVOICES.BY_ID(id), withTenantId(payload))
      .then(unwrapInvoice),
  issueInvoice: (id) =>
    apiClient.post(API_ENDPOINTS.INVOICES.ISSUE(id)).then(unwrapInvoice),
  cancelInvoice: (id, reason) =>
    apiClient
      .post(API_ENDPOINTS.INVOICES.CANCEL(id), { reason })
      .then(unwrapInvoice),
  voidInvoice: (id, reason) =>
    apiClient
      .post(API_ENDPOINTS.INVOICES.VOID(id), { reason })
      .then(unwrapInvoice),
};
export default invoiceApi;
