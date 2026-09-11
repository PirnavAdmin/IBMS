import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCustomerById, getCustomerDetails, getCustomerAudit, getCustomers, updateCustomer, deactivateCustomer } from '../api/customerService';
const retry = (count, error) => !['INVALID_ID', 'NOT_FOUND'].includes(error.code) && ![400, 401, 403, 404, 409].includes(error.status) && count < 1;
export const useCustomers = (params) => useQuery({ queryKey: ['customers', params], queryFn: () => getCustomers(params), staleTime: 0, placeholderData: keepPreviousData, retry });
export const useCustomer = (id) => useQuery({ queryKey: ['customer-details', String(id)], queryFn: () => getCustomerDetails(id), retry });
export const useCustomerProfile = (id) => useQuery({ queryKey: ['customer', String(id)], queryFn: () => getCustomerById(id), retry });
export const useCustomerAudit = (id) => useQuery({ queryKey: ['customer-audit', String(id)], queryFn: () => getCustomerAudit(id), retry });
export function useCustomerMutation(id, operation = updateCustomer) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (args = []) => operation(id, ...args), onSuccess: async () => {
    if (operation === deactivateCustomer) {
      client.setQueryData(['customer-details', String(id)], current => current ? { ...current, customer: { ...current.customer, isActive: false, status: 'Inactive' } } : current);
    }
    await Promise.all([['customers'], ['customer', String(id)], ['customer-details', String(id)], ['customer-audit', String(id)]].map(queryKey => client.invalidateQueries({ queryKey, refetchType: 'all' })));
  } });
}
