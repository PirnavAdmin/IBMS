import { apiClient } from './apiClient.js';
import { API_ENDPOINTS } from './endpoints.js';
import { quotationApi } from './quotationApi.js';

const LOCAL_STORAGE_KEY = 'invoice_billing_invoices_v1';

export const seedInvoices = [
  {
    id: 'INV-2026-0039',
    invoiceNumber: 'INV-2026-0039',
    customerId: '1',
    customer: 'ABC Traders Logistics',
    customerName: 'ABC Traders Logistics',
    email: 'invoicing@abctraders.com',
    customerEmail: 'invoicing@abctraders.com',
    customerGstin: '27AABCT8821Q1Z3',
    billingAddress: 'Unit 402, Trade Link Hub, Senapati Bapat Marg, Lower Parel, Mumbai, Maharashtra 400013',
    poNumber: 'PO-2026-8812',
    paymentTerms: 'Net 15',
    issueDate: '2026-08-15',
    invoiceDate: '2026-08-15',
    dueDate: '2026-08-30',
    subtotal: 151.12,
    tax: 27.20,
    taxAmount: 27.20,
    total: 178.32,
    totalAmount: 178.32,
    paidAmount: 0,
    balanceAmount: 178.32,
    status: 'Overdue',
    paymentStatus: 'Overdue',
    currency: 'INR',
    notes: 'Payment overdue. Please remit balance immediately to avoid interest penalties.',
    termsAndConditions: 'Late payments attract 18% per annum statutory interest under MSMED Act.',
    items: [
      {
        id: 'item-39-1',
        description: 'Global Real-time Logistics Telemetry API',
        specification: 'Monthly enterprise telemetry dispatch endpoint & event streaming tier',
        hsnSac: '998313',
        quantity: 1,
        unitPrice: 151.12,
        taxPercent: 18,
        discountValue: 0,
      },
    ],
  },
  {
    id: 'INV-2026-0040',
    invoiceNumber: 'INV-2026-0040',
    customerId: '2',
    customer: 'Nova Cloud Services',
    customerName: 'Nova Cloud Services',
    email: 'accounts@novacloud.com',
    customerEmail: 'accounts@novacloud.com',
    customerGstin: '29AABCN9941M1ZN',
    billingAddress: 'Level 5, Embassy TechVillage, Devarabisanahalli, Outer Ring Road, Bengaluru, Karnataka 560103',
    poNumber: 'PO-2026-9043',
    paymentTerms: 'Net 10',
    issueDate: '2026-08-23',
    invoiceDate: '2026-08-23',
    dueDate: '2026-09-02',
    subtotal: 2567.80,
    tax: 462.20,
    taxAmount: 462.20,
    total: 3030,
    totalAmount: 3030,
    paidAmount: 0,
    balanceAmount: 3030,
    status: 'Overdue',
    paymentStatus: 'Overdue',
    currency: 'INR',
    notes: 'Charges billed as per Master Cloud Services Framework SLA Agreement.',
    termsAndConditions: 'All payments must be made to IBMS Enterprise HDFC Virtual Account.',
    items: [
      {
        id: 'item-40-1',
        description: 'Dedicated Cloud Compute Cluster (v1.30)',
        specification: '32 vCPU / 128GB RAM Dedicated Managed Node Instance with 99.99% SLA',
        hsnSac: '998315',
        quantity: 1,
        unitPrice: 1800.00,
        taxPercent: 18,
        discountValue: 0,
      },
      {
        id: 'item-40-2',
        description: 'High-Throughput NVMe Block Storage (1 TB)',
        specification: 'Sub-millisecond persistent block storage volume with automated snapshots',
        hsnSac: '998316',
        quantity: 1,
        unitPrice: 767.80,
        taxPercent: 18,
        discountValue: 0,
      },
    ],
  },
  {
    id: 'INV-2026-0041',
    invoiceNumber: 'INV-2026-0041',
    customerId: '3',
    customer: 'Bill winter',
    customerName: 'Bill winter',
    email: 'billing@winterglobal.com',
    customerEmail: 'billing@winterglobal.com',
    customerGstin: '36WINTG4321P1Z9',
    billingAddress: 'Tower B, Cyber Pearl, Hitec City, Hyderabad, Telangana 500081',
    poNumber: 'PO-2026-9214',
    paymentTerms: 'Net 15',
    issueDate: '2026-09-01',
    invoiceDate: '2026-09-01',
    dueDate: '2026-09-16',
    subtotal: 3200,
    tax: 574,
    taxAmount: 574,
    total: 3774,
    totalAmount: 3774,
    paidAmount: 0,
    balanceAmount: 3774,
    status: 'Issued',
    paymentStatus: 'Pending',
    currency: 'INR',
    notes: 'Professional consulting hours verified and approved by client project lead.',
    termsAndConditions: 'Deliverables accepted under Consulting Services Agreement.',
    items: [
      {
        id: 'item-41-1',
        description: 'Enterprise Security Architecture Advisory',
        specification: 'Zero-trust infrastructure posture evaluation & automated SOC review (Hourly)',
        hsnSac: '998311',
        quantity: 8,
        unitPrice: 400.00,
        taxPercent: 17.9375,
        discountValue: 0,
      },
    ],
  },
  {
    id: 'INV-2026-0038',
    invoiceNumber: 'INV-2026-0038',
    customerId: '4',
    customer: 'Apex Engineering Corp',
    customerName: 'Apex Engineering Corp',
    email: 'finance@apexeng.com',
    customerEmail: 'finance@apexeng.com',
    customerGstin: '37AAACE5520D1ZW',
    billingAddress: 'Sector 3, Autonagar Industrial Area, Visakhapatnam, Andhra Pradesh 530012',
    poNumber: 'PO-2026-7731',
    paymentTerms: 'Immediate',
    issueDate: '2026-07-11',
    invoiceDate: '2026-07-11',
    dueDate: '2026-07-26',
    subtotal: 10508.47,
    tax: 1891.53,
    taxAmount: 1891.53,
    total: 12400,
    totalAmount: 12400,
    paidAmount: 12400,
    balanceAmount: 0,
    status: 'Paid',
    paymentStatus: 'Paid',
    currency: 'INR',
    notes: 'Thank you for your business. Payment received and settled in full.',
    termsAndConditions: 'Standard 3-Year Hardware Warranty & Rapid Replacement Guarantee applies.',
    items: [
      {
        id: 'item-38-1',
        description: 'Industrial Edge IoT Gateway Appliances (TX-400)',
        specification: 'Ruggedized DIN-rail industrial computer with dual Gigabit Ethernet & CANbus',
        hsnSac: '851762',
        quantity: 2,
        unitPrice: 4000.00,
        taxPercent: 18,
        discountValue: 0,
      },
      {
        id: 'item-38-2',
        description: 'Precision Sensor Calibration & Diagnostics Suite',
        specification: 'NIST-traceable thermal, vibration & strain gauge calibration kit',
        hsnSac: '903180',
        quantity: 1,
        unitPrice: 2508.47,
        taxPercent: 18,
        discountValue: 0,
      },
    ],
  },
];

export const getLocalInvoices = () => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter(Boolean).map((inv) => {
        const seed = seedInvoices.find((s) => s.id === inv.id);
        if (seed && (!inv.items || inv.items.length === 0)) {
          return {
            ...seed,
            ...inv,
            items: seed.items,
            customerGstin: inv.customerGstin || seed.customerGstin,
            billingAddress: inv.billingAddress || seed.billingAddress,
            poNumber: inv.poNumber || seed.poNumber,
            notes: inv.notes || seed.notes,
            termsAndConditions: inv.termsAndConditions || seed.termsAndConditions,
          };
        }
        return inv;
      });
    }
    return seedInvoices;
  } catch {
    return seedInvoices;
  }
};

export const saveLocalInvoices = (invoices) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(invoices));
    }
  } catch (e) {
    console.warn('Unable to persist invoice to localStorage:', e);
  }
};

const ensureSuccess = (response) => {
  if (response?.success === false || response?.isSuccess === false) {
    throw Object.assign(new Error(response?.message || 'Invoice operation failed.'), {
      response: { status: 400, data: response },
    });
  }
  return response?.data ?? response;
};

export const invoiceApi = {
  getLocalInvoices,
  saveLocalInvoices,

  getInvoices: async (params = {}) => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.INVOICES.BASE, {
        params,
        skipAuthRedirect: true,
      });
      const data = ensureSuccess(response);
      const items = Array.isArray(data) ? data : data?.items || [];
      return {
        items,
        totalCount: data?.totalCount ?? items.length,
        isBackendConnected: true,
      };
    } catch {
      // Gracefully fall back to local preview data for any error (401, 404, 500, network error)
      let local = getLocalInvoices();

      // Check if converted quotations exist
      try {
        const converted = await quotationApi.list({ status: 'Converted', pageSize: 50 });
        const items = Array.isArray(converted) ? converted : converted?.items;
        if (Array.isArray(items)) {
          let updated = false;
          items.forEach((q) => {
            const invId = q.quoteNumber ? q.quoteNumber.replace(/^QT-?/i, 'INV-') : `INV-${q.id}`;
            if (!local.some((item) => String(item.id) === String(invId))) {
              local.push({
                id: invId,
                invoiceNumber: invId,
                customerId: String(q.customerId || ''),
                customer: q.customerName || 'Customer',
                customerName: q.customerName || 'Customer',
                email: q.customerEmail || '',
                customerEmail: q.customerEmail || '',
                issueDate: (q.updatedAtUtc || q.quotationDate || new Date().toISOString()).slice(0, 10),
                invoiceDate: (q.updatedAtUtc || q.quotationDate || new Date().toISOString()).slice(0, 10),
                dueDate: (q.validUntil || new Date(Date.now() + 30 * 86400000).toISOString()).slice(0, 10),
                currency: 'INR',
                subtotal: Number(q.subtotal || q.totalAmount || 0),
                discount: Number(q.discountAmount || 0),
                discountAmount: Number(q.discountAmount || 0),
                tax: Number(q.taxAmount || 0),
                taxAmount: Number(q.taxAmount || 0),
                charges: Number(q.chargesAmount || 0),
                total: Number(q.totalAmount || 0),
                totalAmount: Number(q.totalAmount || 0),
                paidAmount: 0,
                balanceAmount: Number(q.totalAmount || 0),
                status: 'Draft',
                paymentStatus: 'Not Paid',
                notes: `Converted from quotation ${q.quoteNumber}`,
                items: q.items || [],
                createdAtUtc: q.createdAtUtc || new Date().toISOString(),
              });
              updated = true;
            }
          });
          if (updated) {
            saveLocalInvoices(local);
          }
        }
      } catch {
        // Ignore quotation list errors
      }

      // Filter in-memory
      let filtered = [...local];
      if (params.search) {
        const s = params.search.toLowerCase();
        filtered = filtered.filter(
          (inv) =>
            String(inv.id || inv.invoiceNumber || '').toLowerCase().includes(s) ||
            String(inv.customer || inv.customerName || '').toLowerCase().includes(s) ||
            String(inv.email || inv.customerEmail || '').toLowerCase().includes(s)
        );
      }
      if (params.status && params.status !== 'All Invoices') {
        filtered = filtered.filter(
          (inv) => String(inv.status || '').toLowerCase() === params.status.toLowerCase()
        );
      }
      if (params.customerId) {
        filtered = filtered.filter((inv) => String(inv.customerId) === String(params.customerId));
      }

      const pageSize = Number(params.pageSize) || 10;
      const pageNumber = Number(params.pageNumber) || 1;
      const totalCount = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      const pagedItems = filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

      return {
        items: pagedItems,
        totalCount,
        pageNumber,
        pageSize,
        totalPages,
        isBackendConnected: false,
      };
    }
  },

  getInvoiceById: async (id) => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.INVOICES.BY_ID(id), {
        skipAuthRedirect: true,
      });
      return {
        ...ensureSuccess(response),
        isBackendConnected: true,
      };
    } catch {
      const local = getLocalInvoices();
      const found = local.find(
        (inv) => String(inv.id) === String(id) || String(inv.invoiceNumber) === String(id)
      );
      if (found) {
        return {
          ...found,
          isBackendConnected: false,
        };
      }
      throw Object.assign(new Error(`Invoice with ID ${id} not found.`), { status: 404 });
    }
  },

  createInvoice: async (data) => {
    try {
      const response = await apiClient.post(API_ENDPOINTS.INVOICES.BASE, data, {
        skipAuthRedirect: true,
      });
      return {
        ...ensureSuccess(response),
        isBackendConnected: true,
      };
    } catch {
      const local = getLocalInvoices();
      const newInvoice = {
        ...data,
        id: data.invoiceNumber || `INV-${Date.now()}`,
        invoiceNumber: data.invoiceNumber || `INV-${Date.now()}`,
        customerName: data.customerName || data.customer || 'Unnamed Customer',
        customer: data.customerName || data.customer || 'Unnamed Customer',
        status: data.status || 'Draft',
        createdAtUtc: new Date().toISOString(),
        updatedAtUtc: new Date().toISOString(),
        rowVersion: new Date().toISOString(),
        paidAmount: 0,
        balanceAmount: data.totalAmount || data.grandTotal || 0,
        total: data.totalAmount || data.grandTotal || 0,
        totalAmount: data.totalAmount || data.grandTotal || 0,
      };
      const updated = [newInvoice, ...local.filter((i) => i.id !== newInvoice.id)];
      saveLocalInvoices(updated);
      return {
        ...newInvoice,
        isBackendConnected: false,
      };
    }
  },

  updateInvoice: async (id, data) => {
    try {
      const response = await apiClient.put(API_ENDPOINTS.INVOICES.BY_ID(id), data, {
        skipAuthRedirect: true,
      });
      return {
        ...ensureSuccess(response),
        isBackendConnected: true,
      };
    } catch {
      const local = getLocalInvoices();
      const index = local.findIndex((i) => String(i.id) === String(id) || String(i.invoiceNumber) === String(id));
      if (index >= 0) {
        local[index] = { ...local[index], ...data, updatedAtUtc: new Date().toISOString() };
        saveLocalInvoices(local);
        return { ...local[index], isBackendConnected: false };
      }
      throw Object.assign(new Error(`Invoice with ID ${id} not found.`), { status: 404 });
    }
  },

  issueInvoice: async (id) => {
    try {
      const response = await apiClient.post(API_ENDPOINTS.INVOICES.ISSUE(id), {}, {
        skipAuthRedirect: true,
      });
      return {
        ...ensureSuccess(response),
        isBackendConnected: true,
      };
    } catch {
      const local = getLocalInvoices();
      const index = local.findIndex((i) => String(i.id) === String(id) || String(i.invoiceNumber) === String(id));
      if (index >= 0) {
        local[index] = {
          ...local[index],
          status: 'Issued',
          paymentStatus: local[index].paidAmount > 0 ? 'Partially Paid' : 'Pending',
          updatedAtUtc: new Date().toISOString(),
        };
        saveLocalInvoices(local);
        return { ...local[index], isBackendConnected: false };
      }
      throw Object.assign(new Error(`Invoice with ID ${id} not found.`), { status: 404 });
    }
  },

  cancelInvoice: async (id, reason = '') => {
    try {
      const response = await apiClient.post(API_ENDPOINTS.INVOICES.CANCEL(id), { reason }, {
        skipAuthRedirect: true,
      });
      return {
        ...ensureSuccess(response),
        isBackendConnected: true,
      };
    } catch {
      const local = getLocalInvoices();
      const index = local.findIndex((i) => String(i.id) === String(id) || String(i.invoiceNumber) === String(id));
      if (index >= 0) {
        local[index] = {
          ...local[index],
          status: 'Cancelled',
          paymentStatus: 'Cancelled',
          cancellationReason: reason,
          updatedAtUtc: new Date().toISOString(),
        };
        saveLocalInvoices(local);
        return { ...local[index], isBackendConnected: false };
      }
      throw Object.assign(new Error(`Invoice with ID ${id} not found.`), { status: 404 });
    }
  },

  getInvoicePayments: async (invoiceId) => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.PAYMENTS.BASE, {
        params: { invoiceId },
        skipAuthRedirect: true,
      });
      const data = ensureSuccess(response);
      return Array.isArray(data) ? data : data?.items || [];
    } catch {
      return [];
    }
  },

  recordPayment: async (paymentData) => {
    try {
      const response = await apiClient.post(API_ENDPOINTS.PAYMENTS.BASE, paymentData, {
        skipAuthRedirect: true,
      });
      return ensureSuccess(response);
    } catch (err) {
      // If backend payments fails or is unavailable, update local invoice balance
      const local = getLocalInvoices();
      const targetId = paymentData.invoiceId;
      const index = local.findIndex(
        (i) => String(i.id) === String(targetId) || String(i.invoiceNumber) === String(targetId)
      );
      if (index >= 0) {
        const inv = local[index];
        const prevPaid = Number(inv.paidAmount || 0);
        const total = Number(inv.totalAmount || inv.total || 0);
        const newPaid = prevPaid + Number(paymentData.amount || 0);
        const newBalance = Math.max(0, total - newPaid);
        local[index] = {
          ...inv,
          paidAmount: newPaid,
          balanceAmount: newBalance,
          status: newBalance === 0 ? 'Paid' : 'Partially Paid',
          paymentStatus: newBalance === 0 ? 'Paid' : 'Partially Paid',
          updatedAtUtc: new Date().toISOString(),
        };
        saveLocalInvoices(local);
      }
      return { success: true, isLocal: true };
    }
  },
};

export default invoiceApi;
