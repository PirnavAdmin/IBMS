import { Button } from '@mui/material';
import { Link, useOutletContext } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useCustomers } from '../../hooks/useCustomer';
import { CustomerState, StatusBadge } from '../../components/customers/CustomerShared';
import { CustomerTable } from '../../components/customers/CustomerTable';
import '../../styles/Customers.css';

export function Customers() {
  const { searchQuery = '' } = useOutletContext() || {};
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(5);
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' });
  useEffect(() => { setPage(0); }, [searchQuery]);
  const query = useCustomers({ Search: searchQuery.trim() || undefined, IsActive: filters.status ? filters.status === 'Active' : undefined, PageNumber: page + 1, PageSize: size, SortBy: sort.key, SortOrder: sort.direction });
  const columns = [{ key: 'customerCode', label: 'Customer ID', sortable: false }, { key: 'name', label: 'Customer Name' }, { key: 'email', label: 'Email' }, { key: 'type', label: 'Customer Type', sortable: false }, { key: 'status', label: 'Status', sortable: false, render: (c) => <StatusBadge value={c.status} /> }, { key: 'actions', label: 'Actions', sortable: false, render: (c) => <div className="customer-actions"><Button component={Link} to={`/customers/${c.id}`}>View Customer</Button><Button component={Link} to={`/customers/${c.id}/edit`}>Edit</Button></div> }];
  return <main className="customer-page"><header className="customer-heading"><div><h1>Customers</h1><p>Customer accounts, billing information and transaction history.</p></div></header><CustomerState query={query} />{<CustomerTable title="Customers" rows={query.data?.items || []} filters={filters} onFiltersChange={next => { setFilters(next); setPage(0); }} server={{ loading: query.isFetching, unavailable: !query.isSuccess, page, size, sort, totalCount: query.data?.totalCount || 0, onPage: setPage, onSize: setSize, onSort: setSort }} columns={columns} dates={false} defaultSort="name" searchKeys={['name', 'displayName', 'id', 'email', 'contactName']} selects={[{ key: 'status', label: 'Status', options: ['Active', 'Inactive'] }]} />}</main>;
}
