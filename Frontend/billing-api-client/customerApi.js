import { apiClient } from './apiClient.js';
import { API_ENDPOINTS } from './endpoints.js';
import {
  createCustomerRequest,
  createUpdateCustomerRequest,
  parseCustomerResponse,
  parseCustomerListResponse,
  parseCustomerError,
} from '../billing-contracts/index.js';

export const customerApi = {
  createCustomer: async (data) => {
    try {
      const payload = createCustomerRequest(data);
      const response = await apiClient.post(API_ENDPOINTS.CUSTOMERS.BASE, payload);
      return parseCustomerResponse(response);
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
      return parseCustomerResponse(response);
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

  fetchCustomers: async (params = {}) => customerApi.getCustomers(params),
  fetchCustomerById: async (id) => customerApi.getCustomerById(id),


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
    } catch {
      // Fallback to getCustomerById if details sub-route is not supported by backend
      return customerApi.getCustomerById(id);
    }
  },
};

export default customerApi;
