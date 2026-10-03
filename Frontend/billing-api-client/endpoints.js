export const API_ENDPOINTS = {
  AUTH: {
    REGISTER: '/api/Auth/register',
    LOGIN: '/api/Auth/login',
    FORGOT_PASSWORD: '/api/Auth/forgot-password',
    VERIFY_OTP: '/api/Auth/verify-otp',
    RESET_PASSWORD: '/api/Auth/reset-password',
  },
  CUSTOMERS: {
    BASE: '/api/v1/customers',
    SUMMARY: '/api/v1/customers/summary',
    BY_ID: (id) => `/api/v1/customers/${id}`,
    DEACTIVATE: (id) => `/api/v1/customers/${id}/deactivate`,
    DETAILS: (id) => `/api/v1/customers/${id}/details`,
    AUDIT: (id) => `/api/v1/customers/${id}/audit`,
    NEXT_CODE: '/api/v1/customers/next-code',
  },
  PRODUCTS: {
    BASE: '/api/v1/products',
    BY_ID: (id) => `/api/v1/products/${id}`,
    DEACTIVATE: (id) => `/api/v1/products/${id}/deactivate`,
    NEXT_CODE: '/api/v1/products/next-code',
  },
  CATEGORIES: {
    BASE: '/api/v1/categories',
    BY_ID: (id) => `/api/v1/categories/${encodeURIComponent(id)}`,
    STATUS: (id) => `/api/v1/categories/${encodeURIComponent(id)}/status`,
  },
  SETTINGS: {
    NUMBERING: '/api/v1/settings/numbering',
    NUMBERING_GENERATE: '/api/v1/settings/numbering/generate',
  },
  INVOICES: {
    BASE: '/api/v1/invoices',
    BY_ID: (id) => `/api/v1/invoices/${encodeURIComponent(id)}`,
    ISSUE: (id) => `/api/v1/invoices/${encodeURIComponent(id)}/issue`,
    CANCEL: (id) => `/api/v1/invoices/${encodeURIComponent(id)}/cancel`,
    VOID: (id) => `/api/v1/invoices/${encodeURIComponent(id)}/void`,
    PDF: (id) => `/api/v1/invoices/${encodeURIComponent(id)}/pdf`,
  },
  FINANCIAL: {
    CALCULATE: '/api/v1/financial/calculate',
  },
  PAYMENTS: {
    BASE: '/api/v1/payments',
    BY_ID: (id) => `/api/v1/payments/${encodeURIComponent(id)}`,
    ELIGIBLE_INVOICES: '/api/v1/payments/eligible-invoices',
    INVOICE_BALANCE: (invoiceId) => `/api/v1/payments/invoices/${encodeURIComponent(invoiceId)}/balance`,
  },
};

export default API_ENDPOINTS;
