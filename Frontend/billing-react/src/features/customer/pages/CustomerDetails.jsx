import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowBack,
  EditOutlined,
  DeleteOutline,
  Business,
  EmailOutlined,
  PhoneOutlined,
  ReceiptOutlined,
  LocationOnOutlined,
  LocalShippingOutlined,
  NotesOutlined,
} from '@mui/icons-material';
import { customerApi } from 'billing-api-client';
import { CustomerStatusBadge } from '../components/CustomerStatusBadge';
import '../customer.css';

export const CustomerDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    setError(null);

    customerApi
      .getCustomerById(id)
      .then((data) => {
        if (isCurrent) {
          setCustomer(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isCurrent) {
          setError(err.userMessage || err.message || 'Failed to load customer');
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [id]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await customerApi.deleteCustomer(id);
      navigate('/customers');
    } catch (err) {
      alert(err.userMessage || err.message || 'Failed to delete customer');
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <main className="cust-page">
        <div className="cust-state-box" role="status">
          <div className="cust-spinner" />
          <span>Loading customer details...</span>
        </div>
      </main>
    );
  }

  if (error || !customer) {
    return (
      <main className="cust-page">
        <div className="cust-state-box cust-state-error" role="alert">
          <h2>Customer Not Found</h2>
          <p>{error || `No customer found with ID: ${id}`}</p>
          <button
            type="button"
            className="cust-btn cust-btn-primary"
            onClick={() => navigate('/customers')}
          >
            <ArrowBack /> Back to Customers
          </button>
        </div>
      </main>
    );
  }

  const {
    name,
    companyName,
    email,
    phone,
    gstin,
    status,
    currency,
    notes,
    billingAddress,
    shippingAddress,
    isShippingSameAsBilling,
    createdOn,
    updatedOn,
  } = customer;

  return (
    <main className="cust-page">
      {/* Breadcrumbs & Navigation */}
      <nav className="cust-breadcrumbs" aria-label="Breadcrumb">
        <button
          type="button"
          className="cust-breadcrumb-link"
          onClick={() => navigate('/customers')}
        >
          <ArrowBack /> Customers
        </button>
        <span className="cust-breadcrumb-sep">/</span>
        <span className="cust-breadcrumb-current">{name}</span>
      </nav>

      {/* Hero Header */}
      <header className="cust-details-header">
        <div>
          <div className="cust-details-title-row">
            <h1>{name}</h1>
            <CustomerStatusBadge status={status} />
          </div>
          {companyName && (
            <p className="cust-details-company">
              <Business aria-hidden="true" /> {companyName}
            </p>
          )}
          <span className="cust-meta-id">ID: {customer.id}</span>
        </div>

        <div className="cust-header-actions">
          <button
            type="button"
            className="cust-btn cust-btn-secondary"
            onClick={() => navigate(`/customers/${id}/edit`)}
          >
            <EditOutlined /> Edit Customer
          </button>
          <button
            type="button"
            className="cust-btn cust-btn-danger-outline"
            onClick={() => setShowDeleteModal(true)}
          >
            <DeleteOutline /> Delete
          </button>
        </div>
      </header>

      {/* Details Grid */}
      <div className="cust-details-grid">
        {/* Contact & Business Info */}
        <section className="cust-card">
          <div className="cust-card-header">
            <h2>Account Details</h2>
          </div>
          <dl className="cust-dl">
            <div className="cust-dl-row">
              <dt>
                <EmailOutlined aria-hidden="true" /> Email
              </dt>
              <dd>
                <a href={`mailto:${email}`}>{email}</a>
              </dd>
            </div>
            <div className="cust-dl-row">
              <dt>
                <PhoneOutlined aria-hidden="true" /> Phone
              </dt>
              <dd>
                <a href={`tel:${phone}`}>{phone}</a>
              </dd>
            </div>
            <div className="cust-dl-row">
              <dt>
                <ReceiptOutlined aria-hidden="true" /> GSTIN / Tax ID
              </dt>
              <dd>{gstin || 'Not Provided'}</dd>
            </div>
            <div className="cust-dl-row">
              <dt>Billing Currency</dt>
              <dd>{currency || 'INR'}</dd>
            </div>
          </dl>
        </section>

        {/* Addresses */}
        <section className="cust-card">
          <div className="cust-card-header">
            <h2>Addresses</h2>
          </div>
          <div className="cust-addresses-preview">
            <div className="cust-address-card">
              <h3>
                <LocationOnOutlined aria-hidden="true" /> Billing Address
              </h3>
              <address>
                <p>{billingAddress?.street || '—'}</p>
                <p>
                  {[billingAddress?.city, billingAddress?.state, billingAddress?.postalCode]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                <p>{billingAddress?.country || 'India'}</p>
              </address>
            </div>

            <div className="cust-address-card">
              <div className="cust-address-card-header">
                <h3>
                  <LocalShippingOutlined aria-hidden="true" /> Shipping Address
                </h3>
                {isShippingSameAsBilling && (
                  <span className="cust-badge-subtle">Same as Billing</span>
                )}
              </div>
              <address>
                <p>{shippingAddress?.street || '—'}</p>
                <p>
                  {[shippingAddress?.city, shippingAddress?.state, shippingAddress?.postalCode]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                <p>{shippingAddress?.country || 'India'}</p>
              </address>
            </div>
          </div>
        </section>

        {/* Internal Notes (if any) */}
        {notes && (
          <section className="cust-card cust-col-span-2">
            <div className="cust-card-header">
              <h2>
                <NotesOutlined aria-hidden="true" /> Internal Notes
              </h2>
            </div>
            <p className="cust-notes-content">{notes}</p>
          </section>
        )}

        {/* Audit Metadata */}
        <section className="cust-card cust-col-span-2 cust-audit-card">
          <span>
            Created:{' '}
            <strong>{createdOn ? new Date(createdOn).toLocaleString() : '—'}</strong>
          </span>
          <span>
            Last Updated:{' '}
            <strong>{updatedOn ? new Date(updatedOn).toLocaleString() : '—'}</strong>
          </span>
        </section>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="cust-modal-backdrop" role="presentation">
          <div
            className="cust-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-delete-title"
          >
            <h3 id="detail-delete-title">Delete Customer</h3>
            <p>
              Are you sure you want to delete <strong>{name}</strong>? This action cannot be
              undone.
            </p>
            <div className="cust-modal-actions">
              <button
                type="button"
                className="cust-btn cust-btn-secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cust-btn cust-btn-danger"
                onClick={handleDelete}
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
