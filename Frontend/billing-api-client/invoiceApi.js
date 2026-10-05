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
  createDraft: (payload) => apiClient.post(base, payload).then(unwrapInvoice),
  updateDraft: (id, payload) =>
    apiClient
      .put(API_ENDPOINTS.INVOICES.BY_ID(id), payload)
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
