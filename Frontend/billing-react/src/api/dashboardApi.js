import { apiClient } from 'billing-api-client';

// Activate this adapter when GET /api/dashboard is available.
export const fetchDashboardFromApi = (params = {}) => apiClient.get('/api/dashboard', { params });
