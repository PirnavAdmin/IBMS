import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { AddressSection } from './AddressSection';
import {
  customerValidationSchema,
  DEFAULT_CUSTOMER_VALUES,
} from '../customerValidation';

export const CustomerForm = ({
  initialValues = null,
  onSubmit,
  isSubmitting = false,
  submitError = '',
  onCancel,
  mode = 'create',
}) => {
  const getInitialValues = (values) => ({
    ...DEFAULT_CUSTOMER_VALUES,
    ...(values || {}),
    gstin: values?.gstin || values?.taxId || '',
    billingAddress: {
      ...DEFAULT_CUSTOMER_VALUES.billingAddress,
      ...(values?.billingAddress || {}),
    },
    shippingAddress: {
      ...DEFAULT_CUSTOMER_VALUES.shippingAddress,
      ...(values?.shippingAddress || {}),
    },
    isShippingSameAsBilling: values?.isShippingSameAsBilling ?? true,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(customerValidationSchema),
    defaultValues: getInitialValues(initialValues),
    mode: 'onTouched',
  });

  // Re-populate when initialValues change (e.g. edit mode after async fetch)
  useEffect(() => {
    if (initialValues) {
      reset(getInitialValues(initialValues));
    }
  }, [initialValues, reset]);

  const isShippingSameAsBilling = watch('isShippingSameAsBilling');
  const billingAddress = watch('billingAddress');

  // Synchronize shipping address whenever billing changes while "Same as Billing" is active
  useEffect(() => {
    if (isShippingSameAsBilling && billingAddress) {
      setValue(
        'shippingAddress',
        {
          street: billingAddress.street || '',
          city: billingAddress.city || '',
          state: billingAddress.state || '',
          postalCode: billingAddress.postalCode || '',
          country: billingAddress.country || 'India',
        },
        { shouldValidate: false }
      );
    }
  }, [
    isShippingSameAsBilling,
    billingAddress?.street,
    billingAddress?.city,
    billingAddress?.state,
    billingAddress?.postalCode,
    billingAddress?.country,
    setValue,
  ]);

  const handleValidSubmit = (data) => {
    if (isSubmitting) return;

    // Derive immutable effective shipping values without cross-object mutation
    const effectiveShipping = data.isShippingSameAsBilling
      ? {
          street: data.billingAddress?.street?.trim() || '',
          city: data.billingAddress?.city?.trim() || '',
          state: data.billingAddress?.state?.trim() || '',
          postalCode: data.billingAddress?.postalCode?.trim() || '',
          country: data.billingAddress?.country?.trim() || 'India',
        }
      : {
          street: data.shippingAddress?.street?.trim() || '',
          city: data.shippingAddress?.city?.trim() || '',
          state: data.shippingAddress?.state?.trim() || '',
          postalCode: data.shippingAddress?.postalCode?.trim() || '',
          country: data.shippingAddress?.country?.trim() || 'India',
        };

    const payload = {
      ...data,
      name: data.name?.trim(),
      companyName: data.companyName?.trim() || null,
      email: data.email?.trim(),
      phone: data.phone?.trim() || null,
      gstin: data.gstin?.trim() || null,
      taxId: data.gstin?.trim() || null,
      currency: data.currency?.trim() || 'INR',
      status: data.status || 'Active',
      notes: data.notes?.trim() || null,
      website: data.website?.trim() || null,
      paymentTerms: data.paymentTerms?.trim() || null,
      billingAddress: {
        street: data.billingAddress?.street?.trim() || '',
        city: data.billingAddress?.city?.trim() || '',
        state: data.billingAddress?.state?.trim() || '',
        postalCode: data.billingAddress?.postalCode?.trim() || '',
        country: data.billingAddress?.country?.trim() || 'India',
      },
      shippingAddress: effectiveShipping,
      isShippingSameAsBilling: Boolean(data.isShippingSameAsBilling),
      rowVersion: initialValues?.rowVersion || null,
    };

    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit(handleValidSubmit)} className="cust-form" noValidate>
      {submitError && (
        <div className="cust-alert cust-alert-error" role="alert">
          <span className="cust-alert-icon" aria-hidden="true">⚠️</span>
          <span>{submitError}</span>
        </div>
      )}

      {/* Primary Customer Details */}
      <section className="cust-card">
        <div className="cust-card-header">
          <h2>Customer Information</h2>
          <span className="cust-hint">* Required fields</span>
        </div>

        <div className="cust-grid cust-grid-2">
          <div className="cust-field">
            <label htmlFor="customer-name">
              Contact Name <span className="cust-required">*</span>
            </label>
            <input
              id="customer-name"
              type="text"
              placeholder="e.g. Venkat Rao"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'customer-name-err' : undefined}
              {...register('name')}
            />
            {errors.name && (
              <span id="customer-name-err" className="cust-field-error" role="alert">
                {errors.name.message}
              </span>
            )}
          </div>

          <div className="cust-field">
            <label htmlFor="customer-company">Company / Business Name</label>
            <input
              id="customer-company"
              type="text"
              placeholder="e.g. Deccan Tech Solutions"
              aria-invalid={Boolean(errors.companyName)}
              aria-describedby={errors.companyName ? 'customer-company-err' : undefined}
              {...register('companyName')}
            />
            {errors.companyName && (
              <span id="customer-company-err" className="cust-field-error" role="alert">
                {errors.companyName.message}
              </span>
            )}
          </div>

          <div className="cust-field">
            <label htmlFor="customer-email">
              Email Address <span className="cust-required">*</span>
            </label>
            <input
              id="customer-email"
              type="email"
              placeholder="e.g. venkat.rao@deccantech.in"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'customer-email-err' : undefined}
              {...register('email')}
            />
            {errors.email && (
              <span id="customer-email-err" className="cust-field-error" role="alert">
                {errors.email.message}
              </span>
            )}
          </div>

          <div className="cust-field">
            <label htmlFor="customer-phone">Phone Number</label>
            <input
              id="customer-phone"
              type="tel"
              placeholder="e.g. +91 98490 12345"
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'customer-phone-err' : undefined}
              {...register('phone')}
            />
            {errors.phone && (
              <span id="customer-phone-err" className="cust-field-error" role="alert">
                {errors.phone.message}
              </span>
            )}
          </div>

          <div className="cust-field">
            <label htmlFor="customer-gstin">GSTIN / Tax ID</label>
            <input
              id="customer-gstin"
              type="text"
              placeholder="e.g. 36AAACD1234F1Z8"
              maxLength={64}
              aria-invalid={Boolean(errors.gstin)}
              aria-describedby={errors.gstin ? 'customer-gstin-err' : undefined}
              {...register('gstin')}
            />
            {errors.gstin && (
              <span id="customer-gstin-err" className="cust-field-error" role="alert">
                {errors.gstin.message}
              </span>
            )}
          </div>

          <div className="cust-field">
            <label htmlFor="customer-currency">Billing Currency</label>
            <select
              id="customer-currency"
              aria-invalid={Boolean(errors.currency)}
              {...register('currency')}
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
            {errors.currency && (
              <span className="cust-field-error" role="alert">
                {errors.currency.message}
              </span>
            )}
          </div>

          <div className="cust-field">
            <label htmlFor="customer-status">Status</label>
            <select
              id="customer-status"
              aria-invalid={Boolean(errors.status)}
              {...register('status')}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            {errors.status && (
              <span className="cust-field-error" role="alert">
                {errors.status.message}
              </span>
            )}
          </div>

          <div className="cust-field">
            <label htmlFor="customer-website">Website URL</label>
            <input
              id="customer-website"
              type="text"
              placeholder="e.g. https://deccantech.in"
              aria-invalid={Boolean(errors.website)}
              aria-describedby={errors.website ? 'customer-website-err' : undefined}
              {...register('website')}
            />
            {errors.website && (
              <span id="customer-website-err" className="cust-field-error" role="alert">
                {errors.website.message}
              </span>
            )}
          </div>

          <div className="cust-field cust-col-span-2">
            <label htmlFor="customer-notes">Internal Notes</label>
            <textarea
              id="customer-notes"
              rows={3}
              placeholder="Add internal notes or special delivery instructions..."
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={errors.notes ? 'customer-notes-err' : undefined}
              {...register('notes')}
            />
            {errors.notes && (
              <span id="customer-notes-err" className="cust-field-error" role="alert">
                {errors.notes.message}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Address Information */}
      <section className="cust-card">
        <div className="cust-card-header">
          <h2>Addresses</h2>
        </div>

        {/* Billing Address */}
        <AddressSection
          prefix="billingAddress"
          title="Billing Address"
          register={register}
          errors={errors}
        />

        {/* Same as Billing Checkbox */}
        <div className="cust-checkbox-field">
          <label className="cust-checkbox-label" htmlFor="same-as-billing">
            <input
              id="same-as-billing"
              type="checkbox"
              {...register('isShippingSameAsBilling')}
            />
            <span>Shipping address is identical to billing address</span>
          </label>
        </div>

        {/* Shipping Address */}
        <AddressSection
          prefix="shippingAddress"
          title="Shipping Address"
          register={register}
          errors={errors}
          disabled={isShippingSameAsBilling}
        />
      </section>

      {/* Form Action Controls */}
      <div className="cust-form-actions">
        <button
          type="button"
          className="cust-btn cust-btn-secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="cust-btn cust-btn-primary"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? mode === 'edit'
              ? 'Saving...'
              : 'Creating...'
            : mode === 'edit'
            ? 'Update Customer'
            : 'Create Customer'}
        </button>
      </div>
    </form>
  );
};

export default CustomerForm;
