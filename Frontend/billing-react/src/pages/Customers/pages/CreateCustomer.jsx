import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowBack } from '@mui/icons-material';
import { useQueryClient } from '@tanstack/react-query';
import { customerApi } from 'billing-api-client';
import { CustomerForm } from '../components/CustomerForm';
import '../styles/customer-form.css';

export const CreateCustomer = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const requestLock = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSubmit = async (formData) => {
    if (requestLock.current) return;
    requestLock.current = true;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      await customerApi.createCustomer(formData);
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      navigate('/customers', { state: { customerNotice: 'Customer created successfully.' } });
    } catch (err) {
      requestLock.current = false;
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
          Customers
        </button>
        <span className="cust-breadcrumb-sep">&gt;</span>
        <span className="cust-breadcrumb-current">Create Customer</span>
      </nav>

      {/* Header */}
      <header className="cust-header">
        <div>
          <h1 className="cust-page-title">Create New Customer</h1>
          <p className="cust-page-subtitle">Add customer details for billing and tax purposes.</p>
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
