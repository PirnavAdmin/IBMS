import { useEffect, useReducer, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { apiClient } from 'billing-api-client';
import { queryClient } from '../queryClient';
import './protected-route.css';

const readToken = () => localStorage.getItem('billing_auth_token')?.replace(/^(?:Bearer\s+)+/i, '').trim() || '';

export function ProtectedRoute({ children }) {
  const location = useLocation();
  const [, refreshStorage] = useReducer(value => value + 1, 0);
  const [attempt, setAttempt] = useState(0);
  const [validation, setValidation] = useState(null);
  const token = readToken();

  useEffect(() => {
    const update = event => { if (!event.key || event.key === 'billing_auth_token') refreshStorage(); };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);

  useEffect(() => {
    // Protected children have not mounted yet; discard data from any prior login.
    queryClient.clear();
    if (!token) return;
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && readToken() === token;
    apiClient.get('/api/Auth/me', { signal: controller.signal, skipAuthRedirect: true })
      .then(response => {
        if (!current()) return;
        const profile = response?.data ?? response;
        if (!profile || typeof profile !== 'object' || !(profile.userId ?? profile.UserId)) {
          throw new Error('Invalid session response');
        }
        localStorage.setItem('billing_auth_user', JSON.stringify(profile));
        setValidation({ token, attempt, status: 'authenticated' });
      })
      .catch(error => {
        if (!current()) return;
        if ([401, 403, 404].includes(error?.response?.status)) {
          localStorage.removeItem('billing_auth_token');
          localStorage.removeItem('billing_auth_user');
          queryClient.clear();
          setValidation({ token, attempt, status: 'invalid' });
        } else {
          setValidation({ token, attempt, status: 'error' });
        }
      });
    return () => controller.abort();
  }, [token, attempt]);

  if (!token) return <Navigate to="/login" replace state={{ from: location }} />;
  const status = validation?.token === token && validation?.attempt === attempt ? validation.status : 'checking';
  if (status === 'authenticated') return children;
  if (status === 'invalid') return <Navigate to="/login" replace state={{ from: location }} />;
  return <main className="protected-route-state">
    {status === 'error' ? <section role="alert">
      <h1>Unable to load</h1>
      <p>Please check your connection and try again.</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button>
    </section> : <div role="status" aria-live="polite" className="protected-route-loading"><Spin size="large" /><span>Loading...</span></div>}
  </main>;
}
