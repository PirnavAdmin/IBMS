import { dashboardMockData } from '../data/dashboardMockData';

// TEST ONLY
// Set to true to simulate Dashboard API failure.
// Remove when real backend APIs are integrated.
const FORCE_DASHBOARD_API_ERROR = false;

export const getDashboardData = async () => {
  // TEMPORARY MOCK DELAY
  // Remove when real backend API is connected.
  await new Promise((resolve) => setTimeout(resolve, 700));
  if (FORCE_DASHBOARD_API_ERROR) throw new Error('dashboard-load-failed');
  // Replace this mock path with the existing fetchDashboardFromApi adapter when ready.
  // For multiple required endpoints, await Promise.all and map to dashboardMockData's shape.
  // Let failures reject so the hook displays the dashboard error state.
  return dashboardMockData;
};
