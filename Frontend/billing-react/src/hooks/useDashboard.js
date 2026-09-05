import { useCallback, useEffect, useState } from 'react';
import { getDashboardData } from '../services/dashboardService';

export const useDashboard = () => {
  const [state, setState] = useState({ data: null, isLoading: true, error: null });
  const load = useCallback(() => {
    try { setState({ data: getDashboardData(), isLoading: false, error: null }); }
    catch (error) { setState({ data: null, isLoading: false, error }); }
  }, []);
  useEffect(load, [load]);
  const isEmpty = !state.isLoading && !state.error && (!state.data || (
    !Object.keys(state.data.summary || {}).length &&
    !state.data.recentInvoices?.length &&
    !state.data.recentPayments?.length
  ));
  return { ...state, isEmpty, retry: load };
};
