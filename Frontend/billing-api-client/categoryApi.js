import { apiClient } from './apiClient.js';
import { API_ENDPOINTS } from './endpoints.js';

export const categoryApi = {
  /**
   * GET /api/v1/categories
   * Retrieve list of product categories with optional search and status filters
   */
  getCategories: async (queryParams = {}) => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.CATEGORIES.BASE, { params: queryParams });
      return response.data;
    } catch (err) {
      throw new Error(err?.response?.data?.message || err.message || 'Failed to fetch categories.');
    }
  },

  /**
   * GET /api/v1/categories/:id
   * Retrieve single category details by ID
   */
  getCategoryById: async (id) => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.CATEGORIES.BY_ID(id));
      return response.data;
    } catch (err) {
      throw new Error(err?.response?.data?.message || err.message || `Failed to fetch category #${id}.`);
    }
  },

  /**
   * POST /api/v1/categories
   * Create a new product category
   */
  createCategory: async (categoryData) => {
    try {
      const response = await apiClient.post(API_ENDPOINTS.CATEGORIES.BASE, categoryData);
      return response.data;
    } catch (err) {
      throw new Error(err?.response?.data?.message || err.message || 'Failed to create category.');
    }
  },

  /**
   * PUT /api/v1/categories/:id
   * Edit/update existing category information
   */
  updateCategory: async (id, categoryData) => {
    try {
      const response = await apiClient.put(API_ENDPOINTS.CATEGORIES.BY_ID(id), categoryData);
      return response.data;
    } catch (err) {
      throw new Error(err?.response?.data?.message || err.message || `Failed to update category #${id}.`);
    }
  },

  /**
   * PATCH /api/v1/categories/:id/status?status=Active|Inactive
   * Update category status (Active or Inactive)
   */
  updateCategoryStatus: async (id, status = 'Active') => {
    try {
      const response = await apiClient.patch(API_ENDPOINTS.CATEGORIES.STATUS(id), null, {
        params: { status },
      });
      return response.data;
    } catch (err) {
      throw new Error(err?.response?.data?.message || err.message || `Failed to update status for category #${id}.`);
    }
  },
};

export default categoryApi;
