import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Add,
  Search,
  PeopleOutline,
  CheckCircleOutline,
  HighlightOff,
  VisibilityOutlined,
  EditOutlined,
  DeleteOutline,
  Refresh,
} from '@mui/icons-material';
import { customerApi } from 'billing-api-client';
import { CustomerStatusBadge } from '../components/CustomerStatusBadge';
import '../customer.css';

export const CustomerList = () => {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch customers on mount with cancellation flag for safety
  const loadCustomers = async (activeCheck = { current: true }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await customerApi.fetchCustomers();
      if (activeCheck.current) {
        setCustomers(data);
      }
    } catch (err) {
      if (activeCheck.current) {
        setError(err.userMessage || err.message || 'Failed to load customers');
      }
    } finally {
      if (activeCheck.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const activeCheck = { current: true };
    loadCustomers(activeCheck);
    return () => {
      activeCheck.current = false;
    };
  }, []);

  const handleDelete = async (id) => {
    setIsDeleting(true);
    try {
      await customerApi.deleteCustomer(id);
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      setDeleteConfirmId(null);
    } catch (err) {
      alert(err.userMessage || err.message || 'Failed to delete customer');
    } finally {
      setIsDeleting(false);
    }
  };

  // State Management Principle 3: Derived values calculated during render
  const totalCount = customers.length;
  const activeCount = customers.filter((c) => c.status === 'Active').length;
  const inactiveCount = totalCount - activeCount;

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredCustomers = customers.filter((cust) => {
    const matchesStatus =
      statusFilter === 'All' || cust.status === statusFilter;

    if (!matchesStatus) return false;

    if (!normalizedSearch) return true;

    const nameMatch = cust.name?.toLowerCase().includes(normalizedSearch);
    const companyMatch = cust.companyName?.toLowerCase().includes(normalizedSearch);
    const emailMatch = cust.email?.toLowerCase().includes(normalizedSearch);
    const phoneMatch = cust.phone?.toLowerCase().includes(normalizedSearch);
    const gstinMatch = cust.gstin?.toLowerCase().includes(normalizedSearch);

    return nameMatch || companyMatch || emailMatch || phoneMatch || gstinMatch;
  });

  return (
    <main className="cust-page">
      {/* Header */}
      <header className="cust-header">
        <div>
          <span className="cust-eyebrow">Billing Workspace</span>
          <h1>Customers</h1>
          <p>Manage client accounts, billing addresses, and tax identifiers.</p>
        </div>
        <div className="cust-header-actions">
          <button
            type="button"
            className="cust-btn cust-btn-secondary"
            onClick={() => loadCustomers()}
            disabled={loading}
            aria-label="Refresh customer list"
          >
            <Refresh /> Refresh
          </button>
          <button
            type="button"
            className="cust-btn cust-btn-primary"
            onClick={() => navigate('/customers/new')}
          >
            <Add /> Add Customer
          </button>
        </div>
      </header>

      {/* KPI Summary Cards */}
      <section className="cust-kpis" aria-label="Customer statistics">
        <article className="cust-kpi-card">
          <span className="cust-kpi-icon total">
            <PeopleOutline />
          </span>
          <div>
            <span className="cust-kpi-label">Total Customers</span>
            <strong className="cust-kpi-value">{totalCount}</strong>
          </div>
        </article>

        <article className="cust-kpi-card">
          <span className="cust-kpi-icon active">
            <CheckCircleOutline />
          </span>
          <div>
            <span className="cust-kpi-label">Active Accounts</span>
            <strong className="cust-kpi-value">{activeCount}</strong>
          </div>
        </article>

        <article className="cust-kpi-card">
          <span className="cust-kpi-icon inactive">
            <HighlightOff />
          </span>
          <div>
            <span className="cust-kpi-label">Inactive Accounts</span>
            <strong className="cust-kpi-value">{inactiveCount}</strong>
          </div>
        </article>
      </section>

      {/* Main Table Card */}
      <section className="cust-card">
        {/* Filters */}
        <div className="cust-filters-bar">
          <div className="cust-search-box">
            <Search aria-hidden="true" />
            <input
              type="search"
              placeholder="Search by name, company, email, phone or GSTIN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search customers"
            />
          </div>

          <div className="cust-filters-right">
            <label htmlFor="cust-status-filter" className="cust-sr-only">
              Filter by Status
            </label>
            <select
              id="cust-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by customer status"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>

            {(searchTerm || statusFilter !== 'All') && (
              <button
                type="button"
                className="cust-btn cust-btn-secondary cust-btn-sm"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('All');
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="cust-state-box" role="status">
            <div className="cust-spinner" />
            <span>Loading customers...</span>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="cust-state-box cust-state-error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="cust-btn cust-btn-secondary"
              onClick={() => loadCustomers()}
            >
              <Refresh /> Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredCustomers.length === 0 && (
          <div className="cust-state-box">
            <PeopleOutline className="cust-state-icon" />
            <h3>No customers found</h3>
            <p>
              {customers.length === 0
                ? 'Get started by creating your first customer profile.'
                : 'No customer records match your filter criteria.'}
            </p>
            {customers.length === 0 ? (
              <button
                type="button"
                className="cust-btn cust-btn-primary"
                onClick={() => navigate('/customers/new')}
              >
                <Add /> Add Customer
              </button>
            ) : (
              <button
                type="button"
                className="cust-btn cust-btn-secondary"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('All');
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        )}

        {/* Customer Data Table */}
        {!loading && !error && filteredCustomers.length > 0 && (
          <div className="cust-table-wrap">
            <table className="cust-table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Contact Info</th>
                  <th scope="col">GSTIN / Tax ID</th>
                  <th scope="col">Billing City</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="cust-text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="cust-cell-primary">
                        <button
                          type="button"
                          className="cust-link-btn"
                          onClick={() => navigate(`/customers/${customer.id}`)}
                        >
                          <strong>{customer.name}</strong>
                        </button>
                        {customer.companyName && (
                          <span className="cust-subtext">{customer.companyName}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="cust-cell-contact">
                        <span>{customer.email}</span>
                        <small>{customer.phone}</small>
                      </div>
                    </td>
                    <td>
                      <span className="cust-code">{customer.gstin || '—'}</span>
                    </td>
                    <td>
                      <span>{customer.billingAddress?.city || '—'}</span>
                    </td>
                    <td>
                      <CustomerStatusBadge status={customer.status} />
                    </td>
                    <td className="cust-text-right">
                      <div className="cust-actions-group">
                        <button
                          type="button"
                          className="cust-action-icon"
                          onClick={() => navigate(`/customers/${customer.id}`)}
                          aria-label={`View details for ${customer.name}`}
                          title="View Details"
                        >
                          <VisibilityOutlined />
                        </button>
                        <button
                          type="button"
                          className="cust-action-icon"
                          onClick={() => navigate(`/customers/${customer.id}/edit`)}
                          aria-label={`Edit ${customer.name}`}
                          title="Edit Customer"
                        >
                          <EditOutlined />
                        </button>
                        <button
                          type="button"
                          className="cust-action-icon cust-action-delete"
                          onClick={() => setDeleteConfirmId(customer.id)}
                          aria-label={`Delete ${customer.name}`}
                          title="Delete Customer"
                        >
                          <DeleteOutline />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="cust-modal-backdrop" role="presentation">
          <div
            className="cust-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
          >
            <h3 id="delete-dialog-title">Delete Customer Account</h3>
            <p>
              Are you sure you want to delete this customer? This action cannot be undone.
            </p>
            <div className="cust-modal-actions">
              <button
                type="button"
                className="cust-btn cust-btn-secondary"
                onClick={() => setDeleteConfirmId(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cust-btn cust-btn-danger"
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
