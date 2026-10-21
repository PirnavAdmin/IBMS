import { apiClient } from './apiClient.js';
import { API_ENDPOINTS } from './endpoints.js';

const ensureSuccess = (response) => {
  if (response?.success === false || response?.isSuccess === false) {
    throw Object.assign(new Error(response?.message || 'Numbering settings request failed.'), {
      response: { status: 400, data: response },
    });
  }
  return response?.data ?? response;
};

export const numberingApi = {
  getNumberingSettings: async (params = {}) => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.SETTINGS.NUMBERING, { params });
      return ensureSuccess(response);
    } catch (err) {
      throw Object.assign(
        new Error(err.response?.data?.message || err.userMessage || err.message || 'Failed to load numbering settings.'),
        {
          code: err.code,
          status: err.response?.status ?? err.status,
          response: err.response,
        }
      );
    }
  },

  updateNumberingSettings: async (data) => {
    try {
      const response = await apiClient.put(API_ENDPOINTS.SETTINGS.NUMBERING, data);
      return ensureSuccess(response);
    } catch (err) {
      throw Object.assign(
        new Error(err.response?.data?.message || err.userMessage || err.message || 'Failed to update numbering settings.'),
        {
          code: err.code,
          status: err.response?.status ?? err.status,
          response: err.response,
        }
      );
    }
  },

  generateNumber: async ({ documentType = 'Invoice', transactionDate = new Date().toISOString() } = {}) => {
    try {
      const response = await apiClient.post(API_ENDPOINTS.SETTINGS.NUMBERING_GENERATE, {
        documentType,
        transactionDate,
      });
      return ensureSuccess(response);
    } catch (err) {
      throw Object.assign(
        new Error(err.response?.data?.message || err.userMessage || err.message || 'Failed to generate sequential document number.'),
        {
          code: err.code,
          status: err.response?.status ?? err.status,
          response: err.response,
        }
      );
    }
  },
};

export default numberingApi;
