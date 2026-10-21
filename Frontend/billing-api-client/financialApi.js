import { apiClient } from './apiClient.js';
import { API_ENDPOINTS } from './endpoints.js';

const ensureSuccess = (response) => {
  if (response?.success === false || response?.isSuccess === false) {
    throw Object.assign(new Error(response?.message || 'Financial calculation failed.'), {
      response: { status: 400, data: response },
    });
  }
  return response?.data ?? response;
};

export const financialApi = {
  calculate: async (payload) => {
    try {
      const response = await apiClient.post(API_ENDPOINTS.FINANCIAL.CALCULATE, payload);
      return ensureSuccess(response);
    } catch (err) {
      throw Object.assign(
        new Error(err.response?.data?.message || err.userMessage || err.message || 'Failed to compute authoritative financial totals.'),
        {
          code: err.code,
          status: err.response?.status ?? err.status,
          response: err.response,
        }
      );
    }
  },
};

export default financialApi;
