import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowBack } from '@mui/icons-material';
import { customerApi } from 'billing-api-client';
import { CustomerForm } from '../components/CustomerForm';
import '../customer.css';

export const EditCustomer = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!id) {
      setLoadError('Customer ID is missing from the route.');
      setLoading(false);
      return;
    }

    let isCurrent = true;
    setLoading(true);
    setLoadError(null);

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
          setLoadError(err.userMessage || err.message || 'Failed to load customer');
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [id]);

  const handleSubmit = async (formData) => {
    if (isSubmitting || !id) return;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      await customerApi.updateCustomer(id, formData);
      navigate(`/customers/${id}`);
    } catch (err) {
      setSubmitError(err.userMessage || err.message || 'Failed to update customer');
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="cust-page">
        <div className="cust-state-box" role="status">
          <div className="cust-spinner" />
          <span>Loading customer data for editing...</span>
        </div>
      </main>
    );
  }

  if (loadError || !customer) {
    return (
      <main className="cust-page">
        <div className="cust-state-box cust-state-error" role="alert">
          <h2>Customer Not Found</h2>
          <p>{loadError || `No customer found with ID: ${id}`}</p>
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

  return (
    <main className="cust-page">
      {/* Breadcrumbs */}
      <nav className="cust-breadcrumbs" aria-label="Breadcrumb">
        <button
          type="button"
          className="cust-breadcrumb-link"
          onClick={() => navigate('/customers')}
        >
          <ArrowBack /> Customers
        </button>
        <span className="cust-breadcrumb-sep">/</span>
        <button
          type="button"
          className="cust-breadcrumb-link"
          onClick={() => navigate(`/customers/${id}`)}
        >
          {customer.name}
        </button>
        <span className="cust-breadcrumb-sep">/</span>
        <span className="cust-breadcrumb-current">Edit</span>
      </nav>

      {/* Header */}
      <header className="cust-header">
        <div>
          <span className="cust-eyebrow">Customer Management</span>
          <h1>Edit Customer: {customer.name}</h1>
          <p>Update customer details, billing records, or tax identification.</p>
        </div>
      </header>

      {/* Reusable Form populated with existing customer details */}
      <CustomerForm
        mode="edit"
        initialValues={customer}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        submitError={submitError}
        onCancel={() => navigate(`/customers/${id}`)}
      />
    </main>
  );
};

export default EditCustomer;
