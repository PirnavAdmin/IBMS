import { useQuery } from '@tanstack/react-query';
import { authApi } from 'billing-api-client';
import { getDashboardInvoices, getDashboardPayments } from '../services/dashboardService';
import { invoicePermissions } from '../pages/Invoices/services/invoiceService';
import { paymentPermissions } from '../pages/Payments/paymentService';
export const useDashboard = filters => {
  const user = authApi.getCurrentUser();
  const scope = [user?.tenantId, user?.id, user?.email];
  const invoicesAllowed = invoicePermissions(user).view;
  const paymentsAllowed = paymentPermissions(user).view;
  // Currency filters the complete loaded ledger locally; only dates change requests.
  const range = { start: filters.start, end: filters.end };
  const invoices = useQuery({ queryKey: ['dashboard', ...scope, 'invoices', range], queryFn: ({ signal }) => getDashboardInvoices(range, signal), enabled: invoicesAllowed, retry: false, staleTime: 60000 });
  const payments = useQuery({ queryKey: ['dashboard', ...scope, 'payments', range], queryFn: ({ signal }) => getDashboardPayments(range, signal), enabled: paymentsAllowed, retry: false, staleTime: 60000 });
  return { invoices, payments, invoicesAllowed, paymentsAllowed, refresh: () => Promise.all([invoicesAllowed && invoices.refetch(), paymentsAllowed && payments.refetch()]) };
};
