import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { AddressSection } from './AddressSection';
import { shippingFromBilling } from 'billing-contracts';
import {
  customerValidationSchema,
  DEFAULT_CUSTOMER_VALUES,
} from '../validation/customerValidation';
import '../styles/customer-form.css';

export const CustomerForm = ({
  initialValues = null,
  onSubmit,
  isSubmitting = false,
  submitError = '',
  onCancel,
  mode = 'create',
}) => {
  const getInitialValues = (values) => {
    const rawTax = values?.taxId || values?.gstin || '';
    const isGst = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(rawTax);
    const taxType = values?.taxRegistrationType || (isGst ? 'gst' : rawTax ? 'pan' : 'gst');

    const rawStatus = values?.status ?? values?.Status;
    let initialStatus = 'Active';
    if (typeof values?.isActive === 'boolean') {
      initialStatus = values.isActive ? 'Active' : 'Inactive';
    } else if (typeof values?.IsActive === 'boolean') {
      initialStatus = values.IsActive ? 'Active' : 'Inactive';
    } else if (rawStatus) {
      initialStatus = String(rawStatus).trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
    }

    const KNOWN_CODES = ['+971', '+966', '+91', '+44', '+65', '+61', '+49', '+33', '+81', '+1'];
    let phoneCountryCode = values?.phoneCountryCode || '+91';
    let phoneNumber = values?.phone || '';
    if (typeof phoneNumber === 'string' && phoneNumber.trim().startsWith('+')) {
      const trimmed = phoneNumber.trim();
      const parts = trimmed.split(/\s+/);
      if (parts.length > 1 && parts[0].startsWith('+')) {
        phoneCountryCode = parts[0];
        phoneNumber = parts.slice(1).join(' ');
      } else {
        const matched = KNOWN_CODES.find((c) => trimmed.startsWith(c));
        if (matched) {
          phoneCountryCode = matched;
          phoneNumber = trimmed.slice(matched.length).trim();
        }
      }
    }

    const rawCustomerType = String(
      values?.customerType ?? values?.CustomerType ?? values?.type ?? values?.Type ?? 'business'
    ).trim().toLowerCase();
    const customerType = ['individual', 'business', 'organization'].includes(rawCustomerType)
      ? rawCustomerType
      : 'business';

    const rawCurrency = String(
      values?.currency ??
      values?.Currency ??
      values?.financialSummary?.currency ??
      values?.financialSummary?.Currency ??
      values?.raw?.currency ??
      'INR'
    ).trim().toUpperCase();
    const currency = ['INR', 'USD', 'EUR', 'GBP'].includes(rawCurrency) ? rawCurrency : 'INR';

    const rawPaymentTerms = String(
      values?.paymentTerms ??
      values?.PaymentTerms ??
      values?.financialSummary?.paymentTerms ??
      values?.financialSummary?.PaymentTerms ??
      values?.raw?.paymentTerms ??
      ''
    ).trim();
    let paymentTerms = rawPaymentTerms;
    const ptClean = rawPaymentTerms.toLowerCase().replace(/[\s_-]+/g, '');
    if (ptClean === 'net15') paymentTerms = 'Net 15';
    else if (ptClean === 'net30') paymentTerms = 'Net 30';
    else if (ptClean === 'net45') paymentTerms = 'Net 45';
    else if (ptClean === 'net60') paymentTerms = 'Net 60';
    else if (ptClean === 'dueonreceipt') paymentTerms = 'Due on Receipt';
    else if (!paymentTerms) paymentTerms = 'Net 30';

    const rawCreditLimit =
      values?.creditLimit ??
      values?.CreditLimit ??
      values?.financialSummary?.creditLimit ??
      values?.financialSummary?.CreditLimit ??
      values?.raw?.creditLimit ??
      values?.raw?.CreditLimit;
    const creditLimit =
      rawCreditLimit !== undefined && rawCreditLimit !== null && rawCreditLimit !== ''
        ? Number(rawCreditLimit)
        : '';

    const rawOpeningBalance =
      values?.openingBalance ??
      values?.OpeningBalance ??
      values?.outstandingBalance ??
      values?.OutstandingBalance ??
      values?.financialSummary?.outstandingBalance ??
      values?.financialSummary?.OutstandingBalance ??
      values?.financialSummary?.openingBalance ??
      values?.raw?.openingBalance ??
      values?.raw?.outstandingBalance;
    const openingBalance =
      rawOpeningBalance !== undefined && rawOpeningBalance !== null && rawOpeningBalance !== ''
        ? Number(rawOpeningBalance)
        : 0;

    return {
      ...DEFAULT_CUSTOMER_VALUES,
      ...(values || {}),
      customerCode: values?.customerCode || '',
      customerType,
      status: initialStatus,
      isActive: initialStatus === 'Active',
      phoneCountryCode,
      phone: phoneNumber,
      taxRegistrationType: taxType,
      taxId: rawTax,
      gstin: rawTax,
      currency,
      paymentTerms,
      creditLimit: values?.creditLimit ?? '',
      openingBalance: values?.openingBalance ?? '',
      billingAddress: {
        ...DEFAULT_CUSTOMER_VALUES.billingAddress,
        ...(values?.billingAddress || {}),
      },
      shippingAddress: {
        ...DEFAULT_CUSTOMER_VALUES.shippingAddress,
        ...(values?.shippingAddress || {}),
      },
      isShippingSameAsBilling: values?.isShippingSameAsBilling ?? true,
    };
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
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
  const taxRegistrationType = watch('taxRegistrationType');

  // Synchronize shipping address whenever billing changes while "Same as Billing" is active
  useEffect(() => {
    if (isShippingSameAsBilling && billingAddress) {
      setValue(
        'shippingAddress',
        shippingFromBilling(billingAddress, getValues('shippingAddress')),
        { shouldValidate: false }
      );
    }
  }, [
    isShippingSameAsBilling,
    billingAddress?.street,
    billingAddress?.addressLine2,
    billingAddress?.city,
    billingAddress?.state,
    billingAddress?.postalCode,
    billingAddress?.country,
    setValue,
    getValues,
  ]);

  const handleValidSubmit = (data) => {
    if (isSubmitting) return;

    // Derive immutable effective shipping values without cross-object mutation
    const effectiveShipping = data.isShippingSameAsBilling
      ? shippingFromBilling(data.billingAddress, data.shippingAddress)
      : { ...data.shippingAddress };

    const effectiveTaxId =
      data.taxRegistrationType === 'non-gst'
        ? null
        : (data.taxId || data.gstin)?.trim() || null;

    const isStatusActive = String(data.status).trim().toLowerCase() !== 'inactive';
    const normalizedStatus = isStatusActive ? 'Active' : 'Inactive';

    const cleanedPhone = data.phone?.trim();
    let fullPhone = null;
    if (cleanedPhone) {
      if (cleanedPhone.startsWith('+')) {
        fullPhone = cleanedPhone;
      } else {
        const code = data.phoneCountryCode || '+91';
        fullPhone = `${code} ${cleanedPhone}`;
      }
    }

    let fullWebsite = data.website?.trim() || null;
    if (fullWebsite && !/^https?:\/\//i.test(fullWebsite)) {
      fullWebsite = `https://${fullWebsite}`;
    }

    const rawCustomerType = String(data.customerType || 'business').trim().toLowerCase();
    const normalizedCustomerType = ['individual', 'business', 'organization'].includes(rawCustomerType)
      ? rawCustomerType
      : 'business';

    const payload = {
      ...data,
      name: data.name?.trim(),
      customerCode: data.customerCode?.trim() || null,
      companyName: data.companyName?.trim() || null,
      customerType: normalizedCustomerType,
      status: normalizedStatus,
      isActive: isStatusActive,
      email: data.email?.trim(),
      phone: fullPhone,
      phoneCountryCode: data.phoneCountryCode || '+91',
      taxRegistrationType: data.taxRegistrationType || 'gst',
      taxId: effectiveTaxId,
      gstin: effectiveTaxId,
      currency: data.currency?.trim() || 'INR',
      paymentTerms: data.paymentTerms?.trim() || null,
      website: fullWebsite,
      notes: data.notes?.trim() || null,
      billingAddress: { ...data.billingAddress },
      raw: initialValues?.raw,
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

      {/* 1. Basic Information */}
      <section className="cust-card">
        <div className="cust-card-header">
          <h2>1. Basic Information</h2>
          <span className="cust-hint">* Required fields</span>
        </div>

        <div className="cust-grid cust-grid-2">
          <div className="cust-field">
            <label htmlFor="customer-name">
              Contact / Customer Name <span className="cust-required">*</span>
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
            <label htmlFor="customer-code">Customer Code</label>
            <input
              id="customer-code"
              type="text"
              placeholder="e.g. CUST-001 (auto-generated if empty)"
              aria-invalid={Boolean(errors.customerCode)}
              aria-describedby={errors.customerCode ? 'customer-code-err' : undefined}
              {...register('customerCode')}
            />
            {errors.customerCode && (
              <span id="customer-code-err" className="cust-field-error" role="alert">
                {errors.customerCode.message}
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
            <label htmlFor="customer-type">Customer Type</label>
            <select
              id="customer-type"
              aria-invalid={Boolean(errors.customerType)}
              {...register('customerType')}
            >
              <option value="business">Business</option>
              <option value="individual">Individual</option>
              <option value="organization">Organization</option>
            </select>
            {errors.customerType && (
              <span className="cust-field-error" role="alert">
                {errors.customerType.message}
              </span>
            )}
          </div>

          <div className="cust-field">
            <label htmlFor="customer-status">Account Status</label>
            <select
              id="customer-status"
              disabled={mode === 'create'}
              aria-describedby={mode === 'create' ? 'customer-status-help' : undefined}
              aria-invalid={Boolean(errors.status)}
              {...register('status')}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            {mode === 'create' && <span id="customer-status-help" className="cust-hint">Initial status is assigned when the customer is created. Status can be changed when editing.</span>}
            {errors.status && (
              <span className="cust-field-error" role="alert">
                {errors.status.message}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 2. Contact Information */}
      <section className="cust-card">
        <div className="cust-card-header">
          <h2>2. Contact Information</h2>
        </div>

        <div className="cust-grid cust-grid-2">
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
            <label htmlFor="customer-phone">Mobile / Phone Number</label>
            <div
              className="cust-phone-group"
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
              }}
            >
              <select
                id="customer-phone-code"
                className="cust-phone-code-select"
                aria-label="Country Dialing Code"
                style={{
                  width: '96px',
                  minWidth: '88px',
                  maxWidth: '105px',
                  flex: '0 0 96px',
                  padding: '9px 6px',
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                }}
                {...register('phoneCountryCode')}
              >
                <option value="+91">+91 (IN)</option>
                <option value="+1">+1 (US)</option>
                <option value="+44">+44 (UK)</option>
                <option value="+971">+971 (AE)</option>
                <option value="+65">+65 (SG)</option>
                <option value="+61">+61 (AU)</option>
                <option value="+49">+49 (DE)</option>
                <option value="+33">+33 (FR)</option>
                <option value="+81">+81 (JP)</option>
                <option value="+966">+966 (SA)</option>
              </select>
              <input
                id="customer-phone"
                type="tel"
                className="cust-phone-input"
                style={{ flex: '1 1 auto', minWidth: 0, width: 'auto' }}
                placeholder="e.g. 98490 12345"
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? 'customer-phone-err' : undefined}
                {...register('phone')}
              />
            </div>
            {errors.phone && (
              <span id="customer-phone-err" className="cust-field-error" role="alert">
                {errors.phone.message}
              </span>
            )}
          </div>

          <div className="cust-field cust-col-span-2">
            <label htmlFor="customer-website">Website URL</label>
            <input
              id="customer-website"
              type="text"
              placeholder="e.g. https://deccantech.in or www.deccantech.in"
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
        </div>
      </section>

      {/* 3. Tax Information */}
      <section className="cust-card">
        <div className="cust-card-header">
          <h2>3. Tax Information</h2>
        </div>

        <div className="cust-grid cust-grid-2">
          <div className="cust-field">
            <label htmlFor="customer-tax-type">Tax Registration Status</label>
            <select
              id="customer-tax-type"
              aria-invalid={Boolean(errors.taxRegistrationType)}
              {...register('taxRegistrationType')}
            >
              <option value="gst">GST Registered</option>
              <option value="pan">PAN / Tax ID Available</option>
              <option value="non-gst">Non-GST / Unregistered</option>
            </select>
            {errors.taxRegistrationType && (
              <span className="cust-field-error" role="alert">
                {errors.taxRegistrationType.message}
              </span>
            )}
          </div>

          <div className="cust-field">
            <label htmlFor="customer-taxid">
              {taxRegistrationType === 'gst'
                ? 'GSTIN (15-Character GST Number)'
                : taxRegistrationType === 'pan'
                ? 'PAN / Registration ID'
                : 'Tax ID (Optional)'}
            </label>
            <input
              id="customer-taxid"
              type="text"
              disabled={taxRegistrationType === 'non-gst'}
              placeholder={
                taxRegistrationType === 'gst'
                  ? 'e.g. 36AAACD1234F1Z8'
                  : taxRegistrationType === 'pan'
                  ? 'e.g. ABCDE1234F'
                  : 'Not applicable for non-GST'
              }
              maxLength={64}
              aria-invalid={Boolean(errors.taxId)}
              aria-describedby={errors.taxId ? 'customer-taxid-err' : undefined}
              {...register('taxId')}
            />
            {errors.taxId && (
              <span id="customer-taxid-err" className="cust-field-error" role="alert">
                {errors.taxId.message}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 4. Billing Address */}
      <section className="cust-card">
        <div className="cust-card-header">
          <h2>4. Billing Address</h2>
        </div>

        <AddressSection
          prefix="billingAddress"
          title="Billing Address Details"
          register={register}
          errors={errors}
        />
      </section>

      {/* 5. Shipping Address */}
      <section className="cust-card">
        <div className="cust-card-header">
          <h2>5. Shipping Address</h2>
        </div>

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

        <AddressSection
          prefix="shippingAddress"
          title="Shipping Address Details"
          register={register}
          errors={errors}
          disabled={isShippingSameAsBilling}
        />
      </section>

      {/* 6. Payment Information */}
      <section className="cust-card">
        <div className="cust-card-header">
          <h2>6. Payment Information</h2>
          <span id="customer-financial-help" className="cust-hint">Credit Limit and Opening Balance cannot be changed here because the customer service does not support saving them.</span>
        </div>

        <div className="cust-grid cust-grid-2">
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
            <label htmlFor="customer-payment-terms">Payment Terms</label>
            <select
              id="customer-payment-terms"
              aria-invalid={Boolean(errors.paymentTerms)}
              {...register('paymentTerms')}
            >
              <option value="">Select Payment Terms</option>
              <option value="Due on Receipt">Due on Receipt</option>
              <option value="Net 15">Net 15</option>
              <option value="Net 30">Net 30</option>
              <option value="Net 45">Net 45</option>
              <option value="Net 60">Net 60</option>
            </select>
            {errors.paymentTerms && (
              <span className="cust-field-error" role="alert">
                {errors.paymentTerms.message}
              </span>
            )}
          </div>

          <div className="cust-field">
            <label htmlFor="customer-credit-limit">Approved Credit Limit</label>
            <input
              id="customer-credit-limit"
              type="number"
              min="0"
              step="any"
              placeholder="Not available"
              aria-invalid={Boolean(errors.creditLimit)}
              disabled
              readOnly
              value={initialValues?.creditLimit ?? ''}
              aria-describedby="customer-financial-help"
            />
            {errors.creditLimit && (
              <span id="customer-credit-limit-err" className="cust-field-error" role="alert">
                {errors.creditLimit.message}
              </span>
            )}
          </div>

          <div className="cust-field">
            <label htmlFor="customer-opening-balance">Opening Balance</label>
            <input
              id="customer-opening-balance"
              type="number"
              step="any"
              placeholder="Not available"
              aria-invalid={Boolean(errors.openingBalance)}
              disabled
              readOnly
              value={initialValues?.openingBalance ?? ''}
              aria-describedby="customer-financial-help"
            />
            {errors.openingBalance && (
              <span id="customer-opening-balance-err" className="cust-field-error" role="alert">
                {errors.openingBalance.message}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 7. Additional Information */}
      <section className="cust-card">
        <div className="cust-card-header">
          <h2>7. Additional Information</h2>
        </div>

        <div className="cust-grid cust-grid-2">
          <div className="cust-field cust-col-span-2">
            <label htmlFor="customer-notes">Internal Notes</label>
            <textarea
              id="customer-notes"
              rows={3}
              placeholder="Add internal notes, client preferences, or delivery instructions..."
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
