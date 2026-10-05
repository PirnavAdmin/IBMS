import { apiClient } from '../../../../../billing-api-client/apiClient.js';

const creditNotesPath = '/api/v1/credit-notes';
const invoicesPath = '/api/v1/invoices';

const unwrap = (response) => {
  if (!response || response.success !== true || !Object.hasOwn(response, 'data')) {
    throw new Error(response?.message || 'The billing API returned an unsupported Credit Notes response.');
  }
  return response.data;
};

const request = async (operation) => {
  try {
    return await operation();
  } catch (error) {
    throw new Error(error?.userMessage || error?.message || 'The billing API request failed.', { cause: error });
  }
};

const statusFromApi = (status = '') => ({
  PendingApproval: 'Pending Approval',
  PartiallyRefunded: 'Partially Refunded',
}[status] || status);
const statusToApi = (status = '') => ({
  'Pending Approval': 'PendingApproval',
  'Partially Refunded': 'PartiallyRefunded',
}[status] || status);

const mapListItem = (item) => ({
  id: item.id,
  number: item.creditNoteNumber,
  invoiceId: item.invoiceId,
  invoiceNumber: item.invoiceNumber,
  customerId: item.customerId,
  customer: item.customerName,
  date: item.creditDate,
  createdAt: item.createdAtUtc,
  type: item.type,
  subtotal: Number(item.subtotal || 0),
  taxAmount: Number(item.taxAmount || 0),
  total: Number(item.totalAmount || 0),
  refunded: Number(item.refundedAmount || 0),
  remainingRefundable: Number(item.remainingRefundableAmount || 0),
  status: statusFromApi(item.status),
  reason: item.reason,
  currency: item.currency || 'INR',
});

const mapDetail = (item) => {
  const note = mapListItem(item);
  const storedNotes = item.notes || '';
  const referenceMatch = storedNotes.match(/(?:^|\n)\[Internal reference\]: (.*)(?=\n|$)/);
  const reasonNote = storedNotes.replace(/(?:^|\n)\[Internal reference\]: .*?(?=\n|$)/, '').trim();
  const timeline = [
    { label: 'Created', timestamp: item.createdAtUtc, actor: item.createdBy, newStatus: 'Draft' },
    { label: 'Approved', timestamp: item.approvedAtUtc, actor: item.approvedBy, newStatus: 'Approved' },
    { label: 'Rejected', timestamp: item.rejectedAtUtc, actor: item.rejectedBy, newStatus: 'Rejected', reason: item.rejectionReason },
    { label: 'Issued', timestamp: item.issuedAtUtc, actor: item.issuedBy, newStatus: 'Issued' },
    { label: 'Cancelled', timestamp: item.cancelledAtUtc, actor: item.cancelledBy, newStatus: 'Cancelled', reason: item.cancellationReason },
    ...(item.refunds || []).map((refund) => ({
      label: 'Refund processed', timestamp: refund.createdAtUtc, actor: refund.processedBy,
      newStatus: note.status, reason: refund.notes, referenceId: refund.refundNumber,
    })),
  ].filter((entry) => entry.timestamp);

  return {
    ...note,
    email: item.customerEmail || '',
    reasonNote,
    reference: referenceMatch?.[1] || '',
    invoiceTotal: Number(item.invoiceTotalAmount || 0),
    invoicePaid: Number(item.invoicePaidAmount || 0),
    invoiceCredited: Number(item.invoiceCreditedAmount || 0),
    invoiceBalance: Number(item.invoiceBalanceAmount || 0),
    createdBy: item.createdBy,
    createdAt: item.createdAtUtc,
    approvedBy: item.approvedBy,
    approvedAt: item.approvedAtUtc,
    rejectedBy: item.rejectedBy,
    rejectedAt: item.rejectedAtUtc,
    rejectionReason: item.rejectionReason,
    issuedBy: item.issuedBy,
    issuedAt: item.issuedAtUtc,
    cancelledBy: item.cancelledBy,
    cancelledAt: item.cancelledAtUtc,
    cancellationReason: item.cancellationReason,
    items: (item.items || []).map((line) => ({
      id: line.invoiceItemId ?? line.id,
      invoiceItemId: line.invoiceItemId,
      description: line.description,
      code: line.hsnsac || line.hsnSac || line.hsnSAC || '',
      quantity: Number(line.quantity || 0),
      unitPrice: Number(line.unitPrice || 0),
      discountAmount: Number(line.discountAmount || 0),
      taxType: line.taxType || '',
      taxMode: /igst/i.test(line.taxType || '') ? 'inter-state' : 'intra-state',
      taxRate: Number(line.taxRate || 0),
      taxAmount: Number(line.taxAmount || 0),
      totalAmount: Number(line.totalAmount || 0),
    })),
    refundHistory: (item.refunds || []).map((refund) => ({
      id: refund.id,
      refundNumber: refund.refundNumber,
      date: refund.refundDate,
      amount: Number(refund.refundAmount || 0),
      method: refund.paymentMethod,
      reference: refund.referenceNumber,
      notes: refund.notes,
      processedBy: refund.processedBy,
      processedAt: refund.createdAtUtc,
    })),
    timeline,
  };
};

const mapInvoiceSummary = (summary, invoice = {}) => ({
  id: summary.invoiceId,
  number: summary.invoiceNumber,
  date: summary.invoiceDate,
  dueDate: invoice.dueDate,
  customerId: summary.customerId,
  customer: summary.customerName,
  email: invoice.customer?.email || invoice.customer?.Email || '',
  currency: summary.currency || invoice.customer?.currency || 'INR',
  total: Number(summary.totalAmount || 0),
  paid: Number(summary.paidAmount || 0),
  previousCredits: Number(summary.creditedAmount || 0),
  currentDue: Number(summary.balanceAmount || 0),
  remainingAmount: Number(summary.remainingCreditableAmount || 0),
  eligible: Boolean(summary.isEligibleForCredit),
  ineligibilityReason: summary.ineligibilityReason || '',
  items: (summary.items || []).map((line) => ({
    id: line.invoiceItemId,
    invoiceItemId: line.invoiceItemId,
    productId: line.productId,
    description: line.description,
    code: line.hsnsac || line.hsnSac || line.hsnSAC || '',
    quantity: Number(line.originalQuantity || 0),
    originalQuantity: Number(line.originalQuantity || 0),
    previouslyCreditedQuantity: Number(line.previouslyCreditedQuantity || 0),
    remainingQuantity: Number(line.remainingEligibleQuantity || 0),
    unitPrice: Number(line.unitPrice || 0),
    discountAmount: Number(line.discountAmount || 0),
    taxType: line.taxType || '',
    taxMode: /igst/i.test(line.taxType || '') ? 'inter-state' : 'intra-state',
    taxRate: Number(line.taxRate || 0),
    taxAmount: Number(line.taxAmount || 0),
    totalAmount: Number(line.totalAmount || 0),
    previouslyCreditedAmount: Number(line.previouslyCreditedAmount || 0),
    remainingEligibleAmount: Number(line.remainingEligibleAmount || 0),
  })),
});

const unwrapList = (response) => {
  const data = unwrap(response);
  if (!Array.isArray(data?.items)) throw new Error('The Credit Notes list response did not contain a page of records.');
  return {
    items: data.items.map(mapListItem),
    totalCount: Number(data.totalCount || 0),
    pageNumber: Number(data.pageNumber || 1),
    pageSize: Number(data.pageSize || 10),
    totalPages: Number(data.totalPages || 0),
  };
};

const newIdempotencyKey = () => globalThis.crypto?.randomUUID?.();

export const creditNoteService = {
  async list(params = {}) {
    const query = {
      Page: params.page || 1,
      PageSize: params.pageSize || 10,
      SortBy: params.sortBy || 'CreditDate',
      SortDescending: params.sortDescending !== false,
      ...(params.search ? { Search: params.search } : {}),
      ...(params.status ? { Status: statusToApi(params.status) } : {}),
      ...(params.type ? { Type: params.type } : {}),
      ...(params.customerId ? { CustomerId: params.customerId } : {}),
      ...(params.invoiceId ? { InvoiceId: params.invoiceId } : {}),
      ...(params.fromDate ? { FromDate: params.fromDate } : {}),
      ...(params.toDate ? { ToDate: params.toDate } : {}),
    };
    return request(async () => unwrapList(await apiClient.get(creditNotesPath, { params: query })));
  },

  async get(id) {
    return request(async () => mapDetail(unwrap(await apiClient.get(`${creditNotesPath}/${id}`))));
  },

  async getInvoiceCreditableSummary(invoiceId) {
    return request(async () => mapInvoiceSummary(
      unwrap(await apiClient.get(`${creditNotesPath}/invoices/${invoiceId}/creditable-summary`)),
    ));
  },

  async getInvoices({ search = '' } = {}) {
    return request(async () => {
      const page = await apiClient.get(invoicesPath, { params: { Page: 1, PageSize: 100, ...(search ? { SearchTerm: search } : {}) } });
      if (!Array.isArray(page?.items)) throw new Error('The invoice API returned an invalid page.');
      const candidates = page.items.filter((invoice) => !/^(draft|cancelled|canceled|void|voided)$/i.test(invoice.status || ''));
      const summaries = await Promise.all(candidates.map((invoice) => this.getInvoiceCreditableSummary(invoice.id)));
      return summaries
        .map((summary, index) => summary ? {
          ...summary,
          dueDate: candidates[index].dueDate,
          email: candidates[index].customer?.email || candidates[index].customer?.Email || summary.email,
        } : null)
        .filter((invoice) => invoice?.eligible && invoice.remainingAmount > 0);
    });
  },

  async save(payload, id) {
    return request(async () => {
      const body = {
        creditDate: payload.creditDate || new Date().toISOString(),
        type: payload.type,
        reason: payload.reason,
        notes: [payload.reasonNote?.trim(), payload.reference?.trim() ? `[Internal reference]: ${payload.reference.trim()}` : ''].filter(Boolean).join('\n') || null,
        items: (payload.items || []).map((line) => ({
          invoiceItemId: Number(line.invoiceItemId ?? line.id),
          productId: line.productId || null,
          description: line.description,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          discountAmount: Number(line.discountAmount || 0) * Number(line.quantity) / Math.max(Number(line.originalQuantity || line.quantity), 0.000001),
          taxType: line.taxType || null,
          taxRate: Number(line.taxRate || 0),
          hsnSac: line.code || null,
        })),
      };
      let note;
      if (id) {
        note = mapDetail(unwrap(await apiClient.put(`${creditNotesPath}/${id}`, body)));
      } else {
        const idempotencyKey = newIdempotencyKey();
        note = mapDetail(unwrap(await apiClient.post(creditNotesPath, { invoiceId: Number(payload.invoiceId), ...body, ...(idempotencyKey ? { idempotencyKey } : {}) })));
      }
      if (payload.submit) note = await this.transition(note.id, 'submit');
      return note;
    });
  },

  async transition(id, action, details = {}) {
    return request(async () => {
      const endpoints = {
        submit: { method: 'post', path: `${creditNotesPath}/${id}/submit` },
        approve: { method: 'post', path: `${creditNotesPath}/${id}/approve` },
        reject: { method: 'post', path: `${creditNotesPath}/${id}/reject`, body: { reason: details.reason } },
        issue: { method: 'post', path: `${creditNotesPath}/${id}/issue` },
        cancel: { method: 'post', path: `${creditNotesPath}/${id}/cancel`, body: { reason: details.reason } },
        refund: { method: 'post', path: `${creditNotesPath}/${id}/refund`, body: {
          refundAmount: Number(details.amount),
          paymentMethod: details.method,
          referenceNumber: details.reference || null,
          notes: details.reason || null,
        } },
      };
      const endpoint = endpoints[action];
      if (!endpoint) throw new Error('This Credit Note action is not supported by the billing API.');
      const response = endpoint.body
        ? await apiClient[endpoint.method](endpoint.path, endpoint.body)
        : await apiClient[endpoint.method](endpoint.path);
      return mapDetail(unwrap(response));
    });
  },
};

export const CREDIT_NOTE_DATA_SOURCE = 'billing-api';
export const creditNoteBackendStatus = 'LIVE BILLING API';
