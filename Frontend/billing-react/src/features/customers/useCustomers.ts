import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { activateCustomer, deactivateCustomer, getCustomers, getCustomerSummary } from './customerApi';
import type { Customer, CustomerQueryParams } from './types';
export const useCustomers = (params: CustomerQueryParams) => useQuery({ queryKey: ['customers', 'list', params], queryFn: ({ signal }) => getCustomers(params, signal), placeholderData: keepPreviousData, retry: false });
export const useCustomerSummary = () => useQuery({ queryKey: ['customers', 'summary'], queryFn: ({ signal }) => getCustomerSummary(signal), staleTime: 60000, retry: false });
export function useCustomerStatus() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (customer: Customer) => customer.status === 'active' ? deactivateCustomer(customer.id) : activateCustomer(customer.id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['customers'] }) });
}
