import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowBack } from '@mui/icons-material';
import { customerApi } from 'billing-api-client';
import { CustomerForm } from '../components/CustomerForm';
import '../customer.css';

export const CreateCustomer = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSubmit = async (formData) => {
    setIsSubmitting(true);
    setSubmitError('');

    try {
      await customerApi.createCustomer(formData);
      navigate('/customers');
    } catch (err) {
      setSubmitError(err.userMessage || err.message || 'Failed to create customer');
      setIsSubmitting(false);
    }
  };

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
        <span className="cust-breadcrumb-current">New Customer</span>
      </nav>

      {/* Header */}
      <header className="cust-header">
        <div>
          <span className="cust-eyebrow">Customer Registration</span>
          <h1>Add New Customer</h1>
          <p>Create a customer record with billing details and tax identification.</p>
        </div>
      </header>

      {/* Reusable Form */}
      <CustomerForm
        mode="create"
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        submitError={submitError}
        onCancel={() => navigate('/customers')}
      />
    </main>
  );
};

export default CreateCustomer;
