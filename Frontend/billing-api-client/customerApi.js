import { apiClient } from './apiClient.js';
import { API_ENDPOINTS } from './endpoints.js';
import {
  createCustomerRequest,
  createUpdateCustomerRequest,
  createCustomerQueryParameters,
  parseCustomerResponse,
  parseCustomerError,
} from '../billing-contracts/index.js';

export const customerApi = {
  /**
   * GET /api/v1/customers
   * Fetch paginated list of customers with search, status filter, and sorting
   */
  getCustomers: async (queryParams = {}) => {
    try {
      const params = createCustomerQueryParameters(queryParams);
      const response = await apiClient.get(API_ENDPOINTS.CUSTOMERS.BASE, { params });
      return parseCustomerResponse(response);
    } catch (err) {
      throw new Error(parseCustomerError(err, 'Failed to fetch customers list.'));
    }
  },

  /**
   * GET /api/v1/customers/:id
   * Fetch single customer by ID
   */
  getCustomerById: async (id) => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.CUSTOMERS.BY_ID(id));
      return parseCustomerResponse(response);
    } catch (err) {
      throw new Error(parseCustomerError(err, `Failed to fetch customer #${id}.`));
    }
  },

  /**
   * POST /api/v1/customers
   * Create a new customer record
   */
  createCustomer: async (customerData) => {
    try {
      const payload = createCustomerRequest(customerData);
      const response = await apiClient.post(API_ENDPOINTS.CUSTOMERS.BASE, payload);
      return parseCustomerResponse(response);
    } catch (err) {
      throw new Error(parseCustomerError(err, 'Failed to create customer.'));
    }
  },

  /**
   * PUT /api/v1/customers/:id
   * Update existing customer profile
   */
  updateCustomer: async (id, customerData) => {
    try {
      const payload = createUpdateCustomerRequest(customerData);
      const response = await apiClient.put(API_ENDPOINTS.CUSTOMERS.BY_ID(id), payload);
      return parseCustomerResponse(response);
    } catch (err) {
      throw new Error(parseCustomerError(err, `Failed to update customer #${id}.`));
    }
  },

  /**
   * PATCH /api/v1/customers/:id/deactivate
   * Soft deactivate a customer preserving historical data
   */
  deactivateCustomer: async (id, reason = null) => {
    try {
      const config = reason ? { params: { reason } } : {};
      const response = await apiClient.patch(API_ENDPOINTS.CUSTOMERS.DEACTIVATE(id), null, config);
      return parseCustomerResponse(response);
    } catch (err) {
      throw new Error(parseCustomerError(err, `Failed to deactivate customer #${id}.`));
    }
  },

  /**
   * GET /api/v1/customers/:id/audit
   * Fetch customer audit history for the audit tab (IBMSFE-013)
   */
  getCustomerAuditHistory: async (id) => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.CUSTOMERS.AUDIT(id));
      return parseCustomerResponse(response);
    } catch (err) {
      throw new Error(parseCustomerError(err, `Failed to fetch audit history for customer #${id}.`));
    }
  },
};

export default customerApi;
