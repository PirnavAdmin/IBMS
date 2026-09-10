import { apiClient } from './apiClient.js';
import { API_ENDPOINTS } from './endpoints.js';
import {
  createCustomerRequest,
  createUpdateCustomerRequest,
  parseCustomerResponse,
  parseCustomerListResponse,
  parseCustomerError,
} from '../billing-contracts/index.js';

const ensureSuccess = (response) => {
  if (response?.success === false) {
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
      throw new Error(parseCustomerError(err, 'Failed to create customer record.'));
    }
  },

  getCustomerById: async (id) => {
    try {
      const parsedId = Number(id);
      const endpoint = API_ENDPOINTS.CUSTOMERS.BY_ID(parsedId || id);
      const response = await apiClient.get(endpoint);
      const customer = parseCustomerResponse(response);
      if (!customer) {
        throw new Error(`Customer with ID ${id} not found.`);
      }
      return customer;
    } catch (err) {
      throw new Error(parseCustomerError(err, `Failed to load customer with ID ${id}.`));
    }
  },

  updateCustomer: async (id, data) => {
    try {
      const parsedId = Number(id);
      const endpoint = API_ENDPOINTS.CUSTOMERS.BY_ID(parsedId || id);
      const payload = createUpdateCustomerRequest(data);
      const response = await apiClient.put(endpoint, payload);

      // If customer is set to Inactive, ensure deactivation endpoint is invoked
      if (payload.isActive === false || payload.status === 'Inactive') {
        try {
          await apiClient.patch(API_ENDPOINTS.CUSTOMERS.DEACTIVATE(parsedId || id));
        } catch (patchErr) {
          // Handled or already persisted by PUT
          console.warn('Deactivation patch notice:', patchErr?.message || patchErr);
        }
      }

      return parseCustomerResponse(ensureSuccess(response));
    } catch (err) {
      throw new Error(parseCustomerError(err, 'Failed to update customer record.'));
    }
  },

  getCustomers: async (params = {}) => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.CUSTOMERS.BASE, { params });
      return parseCustomerListResponse(response);
    } catch (err) {
      throw new Error(parseCustomerError(err, 'Failed to retrieve customers.'));
    }
  },

  deactivateCustomer: async (id) => {
    try {
      const parsedId = Number(id);
      const endpoint = API_ENDPOINTS.CUSTOMERS.DEACTIVATE(parsedId || id);
      return await apiClient.patch(endpoint);
    } catch (err) {
      throw new Error(parseCustomerError(err, 'Failed to deactivate customer.'));
    }
  },

  deleteCustomer: async (id) => {
    try {
      const parsedId = Number(id);
      const endpoint = API_ENDPOINTS.CUSTOMERS.BY_ID(parsedId || id);
      return await apiClient.delete(endpoint);
    } catch (err) {
      throw new Error(parseCustomerError(err, 'Failed to delete customer.'));
    }
  },

  getCustomerDetails: async (id) => {
    try {
      const parsedId = Number(id);
      const endpoint = API_ENDPOINTS.CUSTOMERS.DETAILS(parsedId || id);
      const response = await apiClient.get(endpoint);
      return parseCustomerResponse(response);
    } catch (err) {
      throw new Error(parseCustomerError(err, `Failed to load details for customer with ID ${id}.`));
    }
  },
};

export default customerApi;
