import { useCallback, useEffect, useRef, useState } from 'react';
import { getPayments } from '../services/paymentService';

export const usePayments = () => {
  const mounted = useRef(true);
  const [state, setState] = useState({ payments: [], loading: true, error: '' });

  const loadPayments = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const payments = await getPayments();
      if (mounted.current) setState({ payments, loading: false, error: '' });
    } catch {
      if (mounted.current) setState({ payments: [], loading: false, error: 'Network Error' });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadPayments();
    return () => { mounted.current = false; };
  }, [loadPayments]);

  return { ...state, retry: loadPayments };
};
