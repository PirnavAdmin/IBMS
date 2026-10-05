import { apiClient } from './apiClient.js';
import { API_ENDPOINTS } from './endpoints.js';

export function unwrap(response) {
  if (response?.success === false || response?.isSuccess === false) {
    throw new Error(response.message || 'Request failed.');
  }
  return response && Object.hasOwn(response, 'data') ? response.data : response;
}

export const templateApi = {
  /**
   * Fetch paginated list of invoice templates with search, status, and style filters.
   */
  list: async (params = {}) => {
    const res = await apiClient.get(API_ENDPOINTS.TEMPLATES.BASE, { params });
    return unwrap(res);
  },

  /**
   * Fetch single template by ID including active version visual styling configurations.
   */
  get: async (id) => {
    const res = await apiClient.get(API_ENDPOINTS.TEMPLATES.BY_ID(id));
    return unwrap(res);
  },

  /**
   * Fetch complete version history for a template (Version History tab).
   */
  getVersions: async (id) => {
    const res = await apiClient.get(API_ENDPOINTS.TEMPLATES.VERSIONS(id));
    return unwrap(res);
  },

  /**
   * Create a new custom invoice presentation template.
   */
  create: async (data) => {
    const res = await apiClient.post(API_ENDPOINTS.TEMPLATES.BASE, data);
    return unwrap(res);
  },

  /**
   * Update template details or styling.
   */
  update: async (id, data) => {
    const res = await apiClient.put(API_ENDPOINTS.TEMPLATES.BY_ID(id), data);
    return unwrap(res);
  },

  /**
   * Duplicate existing template styling into a new draft.
   */
  duplicate: async (id, data) => {
    const res = await apiClient.post(API_ENDPOINTS.TEMPLATES.DUPLICATE(id), data);
    return unwrap(res);
  },

  /**
   * Activate template (and publish specified or latest version).
   */
  activate: async (id, version = null) => {
    const params = version ? { version } : {};
    const res = await apiClient.patch(API_ENDPOINTS.TEMPLATES.ACTIVATE(id), null, { params });
    return unwrap(res);
  },

  /**
   * Deactivate template.
   */
  deactivate: async (id) => {
    const res = await apiClient.patch(API_ENDPOINTS.TEMPLATES.DEACTIVATE(id));
    return unwrap(res);
  },

  /**
   * Archive / delete template.
   */
  delete: async (id) => {
    const res = await apiClient.delete(API_ENDPOINTS.TEMPLATES.BY_ID(id));
    return unwrap(res);
  },

  /**
   * Render dynamic live PDF preview binary stream from JSON customization options.
   * Returns a Blob suitable for URL.createObjectURL() or an iframe/embed viewer.
   */
  preview: async (previewRequest) => {
    const res = await apiClient.post(API_ENDPOINTS.TEMPLATES.PREVIEW, previewRequest, {
      responseType: 'blob',
    });
    return res.data || res;
  },

  /**
   * Render preview PDF for an existing template by ID.
   */
  previewById: async (id) => {
    const res = await apiClient.get(API_ENDPOINTS.TEMPLATES.PREVIEW_BY_ID(id), {
      responseType: 'blob',
    });
    return res.data || res;
  },

  /**
   * Upload logo image (PNG/JPEG/WebP, max 2MB).
   */
  uploadLogo: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post(API_ENDPOINTS.TEMPLATES.LOGO_UPLOAD, formData, {
      // Let Axios/browser set the multipart boundary for FormData.
    });
    return unwrap(res);
  },

  /**
   * Generate official PDF document and immutable snapshot for an invoice.
   */
  generateInvoicePdf: async (invoiceId, request = {}) => {
    const res = await apiClient.post(API_ENDPOINTS.TEMPLATES.GENERATE_PDF(invoiceId), request);
    return unwrap(res);
  },

  /**
   * Download or stream the official finalized PDF for an issued invoice.
   */
  downloadInvoicePdf: async (invoiceId, inline = false) => {
    const res = await apiClient.get(API_ENDPOINTS.TEMPLATES.DOWNLOAD_PDF(invoiceId), {
      params: { inline },
      responseType: 'blob',
    });
    return res.data || res;
  },

  /**
   * Fetch audit trail activity logs for templates and invoice documents (Audit & Traceability screen).
   */
  getAudit: async (params = {}) => {
    const res = await apiClient.get(API_ENDPOINTS.TEMPLATES.AUDIT, { params });
    return unwrap(res);
  },
};

export default templateApi;
