import { apiClient } from './apiClient.js';
import { API_ENDPOINTS } from './endpoints.js';
import {
  createCustomerRequest,
  createUpdateCustomerRequest,
  parseCustomerResponse,
  parseCustomerListResponse,
  parseCustomerError,
  requireCustomerId,
} from '../billing-contracts/index.js';

const ensureSuccess = (response) => {
  if (response?.success === false || response?.isSuccess === false) {
    throw Object.assign(new Error('Customer request failed.'), { response: { status: 400, data: response } });
  }
  return response;
};

export const customerApi = {
  createCustomer: async (data) => {
    try {
      const payload = createCustomerRequest(data);
      const response = await apiClient.post(API_ENDPOINTS.CUSTOMERS.BASE, payload);
      return parseCustomerResponse(ensureSuccess(response));
    } catch (err) {
      throw Object.assign(new Error(parseCustomerError(err, 'Failed to create customer record.')), { code: err.code, status: err.response?.status ?? err.status });
    }
  },

  getCustomerById: async (id) => {
    try {
      const parsedId = requireCustomerId(id);
      const endpoint = API_ENDPOINTS.CUSTOMERS.BY_ID(parsedId);
      const response = await apiClient.get(endpoint);
      const customer = parseCustomerResponse(ensureSuccess(response));
      if (!customer) {
        throw Object.assign(new Error('Customer not found.'), { code: 'NOT_FOUND', status: 404 });
      }
      return customer;
    } catch (err) {
      throw Object.assign(new Error(parseCustomerError(err, `Failed to load customer with ID ${id}.`)), { code: err.code, status: err.response?.status ?? err.status });
    }
  },

  updateCustomer: async (id, data) => {
    try {
      const parsedId = requireCustomerId(id);
      const endpoint = API_ENDPOINTS.CUSTOMERS.BY_ID(parsedId);
      const payload = createUpdateCustomerRequest(data);
      const response = await apiClient.put(endpoint, payload);

      // UpdateCustomerRequest supports status/isActive. Deactivation actions use
      // their dedicated PATCH; an ordinary edit is a single awaited PUT.
      const parsed = parseCustomerResponse(ensureSuccess(response));
      return parsed || { id: parsedId, ...payload };
    } catch (err) {
      throw Object.assign(new Error(parseCustomerError(err, 'Failed to update customer record.')), { code: err.code, status: err.response?.status ?? err.status });
    }
  },

  getCustomers: async (params = {}) => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.CUSTOMERS.BASE, { params });
      return parseCustomerListResponse(response);
    } catch (err) {
      throw Object.assign(new Error(parseCustomerError(err, 'Failed to retrieve customers.')), { code: err.code, status: err.response?.status ?? err.status });
    }
  },

  deactivateCustomer: async (id) => {
    try {
      const parsedId = requireCustomerId(id);
      const endpoint = API_ENDPOINTS.CUSTOMERS.DEACTIVATE(parsedId);
      return ensureSuccess(await apiClient.patch(endpoint));
    } catch (err) {
      throw Object.assign(new Error(parseCustomerError(err, 'Failed to deactivate customer.')), { code: err.code, status: err.response?.status ?? err.status });
    }
  },

  deleteCustomer: async (id) => {
    try {
      const parsedId = requireCustomerId(id);
      const endpoint = API_ENDPOINTS.CUSTOMERS.BY_ID(parsedId);
      return await apiClient.delete(endpoint);
    } catch (err) {
      throw Object.assign(new Error(parseCustomerError(err, 'Failed to delete customer.')), { code: err.code, status: err.response?.status ?? err.status });
    }
  },

  getCustomerDetails: async (id) => {
    try {
      const parsedId = requireCustomerId(id);
      const endpoint = API_ENDPOINTS.CUSTOMERS.DETAILS(parsedId);
      const response = await apiClient.get(endpoint);
      return parseCustomerResponse(ensureSuccess(response));
    } catch (err) {
      throw Object.assign(new Error(parseCustomerError(err, `Failed to load details for customer with ID ${id}.`)), { code: err.code, status: err.response?.status ?? err.status });
    }
  },
};

export default customerApi;
