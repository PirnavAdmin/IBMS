import { useCallback, useEffect, useRef, useState } from 'react';
import { getDashboardData } from '../services/dashboardService';

export const useDashboard = () => {
  const [state, setState] = useState({ data: null, isLoading: true, error: null });
  const inFlight = useRef(null);
  const mounted = useRef(false);
  const loadDashboardData = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    setState((previous) => ({ ...previous, isLoading: true, error: null }));
    const request = (async () => {
      try {
        const data = await getDashboardData();
        if (!data) throw new Error('dashboard-load-failed');
        if (mounted.current) setState({ data, isLoading: false, error: null });
      } catch {
        if (mounted.current) setState({ data: null, isLoading: false, error: 'dashboard-load-failed' });
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = request;
    return request;
  }, []);
  useEffect(() => {
    mounted.current = true;
    loadDashboardData();
    return () => { mounted.current = false; };
  }, [loadDashboardData]);
  const isEmpty = !state.isLoading && !state.error && (!state.data || (
    !Object.keys(state.data.summary || {}).length &&
    !state.data.recentInvoices?.length && !state.data.recentPayments?.length
  ));
  return { ...state, isEmpty, loadDashboardData, retry: loadDashboardData };
};
