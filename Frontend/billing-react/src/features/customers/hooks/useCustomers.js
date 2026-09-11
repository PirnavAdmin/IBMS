import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deactivateCustomer, getCustomers, getCustomerSummary } from '../api/customerApi';

export const useCustomers = (params) => useQuery({ queryKey: ['customers', 'list', params], queryFn: ({ signal }) => getCustomers(params, signal), placeholderData: keepPreviousData, retry: false });
export const useCustomerSummary = () => useQuery({ queryKey: ['customers', 'summary'], queryFn: ({ signal }) => getCustomerSummary(signal), staleTime: 60000, retry: false });
export function useCustomerStatus() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (customer) => deactivateCustomer(customer.id),
    onSuccess: (_, customer) => Promise.all([['customers'], ['customer', customer.id], ['customer-details', customer.id], ['customer-audit', customer.id]].map(queryKey => client.invalidateQueries({ queryKey }))) });
}
