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
  const invoices = useQuery({ queryKey: ['dashboard', ...scope, 'invoices', filters], queryFn: ({ signal }) => getDashboardInvoices(filters, signal), enabled: invoicesAllowed, retry: false, staleTime: 60000 });
  const payments = useQuery({ queryKey: ['dashboard', ...scope, 'payments', filters], queryFn: ({ signal }) => getDashboardPayments(filters, signal), enabled: paymentsAllowed, retry: false, staleTime: 60000 });
  return { invoices, payments, invoicesAllowed, paymentsAllowed, refresh: () => Promise.all([invoicesAllowed && invoices.refetch(), paymentsAllowed && payments.refetch()]) };
};
