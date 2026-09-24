import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { AddressSection } from './AddressSection';
import { shippingFromBilling } from 'billing-contracts';
import { customerApi } from 'billing-api-client';
import {
  customerValidationSchema,
  DEFAULT_CUSTOMER_VALUES,
  STEP_FIELDS,
  getNextCustomerCode,
  COUNTRY_PHONE_CONFIG,
} from '../validation/customerValidation';
import {
  PersonOutline,
  LocalOfferOutlined,
  BusinessOutlined,
  EmailOutlined,
  PhoneOutlined,
  LanguageOutlined,
  ReceiptLongOutlined,
  HomeOutlined,
  CheckCircleOutlined,
  LightbulbOutlined,
  ArrowForward,
  ArrowBack,
  InfoOutlined,
  Check,
  EditOutlined,
  DescriptionOutlined,
} from '@mui/icons-material';
import '../styles/customer-form.css';

const STEPS = [
  {
    id: 0,
    label: 'Basic Info',
    title: 'Basic Information',
    subtitle: 'Enter the main details about your customer',
    icon: BusinessOutlined,
  },
  {
    id: 1,
    label: 'Contact Info',
    title: 'Contact Information',
    subtitle: 'Provide communication and web contacts',
    icon: EmailOutlined,
  },
  {
    id: 2,
    label: 'Billing & Tax',
    title: 'Billing & Tax Information',
    subtitle: 'Configure tax registration, billing currency, and payment terms',
    icon: ReceiptLongOutlined,
  },
  {
    id: 3,
    label: 'Address',
    title: 'Address Information',
    subtitle: 'Enter billing and shipping address details',
    icon: HomeOutlined,
  },
  {
    id: 4,
    label: 'Review',
    title: 'Review & Confirm',
    subtitle: 'Review all information before finalizing customer record',
    icon: CheckCircleOutlined,
  },
];

const QUICK_TIPS = {
  0: 'Customer code is a unique sequential identifier (e.g. CUST-001, CUST-002). It is automatically assigned in sequence order and locked from editing.',
  1: 'Ensure email and phone number are accurate. The phone number must contain the exact digit count required for the selected country.',
  2: 'Choose GST Registered to automatically validate 15-character GST numbers and ensure seamless tax compliance.',
  3: 'You can check "Shipping address is identical" to quickly mirror billing details into shipping.',
  4: 'Review all customer details before final submission. Click any "Edit" link to quickly jump back to a section.',
};

export const CustomerForm = ({
  initialValues = null,
  onSubmit,
  isSubmitting = false,
  submitError = '',
  onCancel,
  mode = 'create',
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [loadingNextCode, setLoadingNextCode] = useState(false);

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
    trigger,
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

  // Sequential code auto-generation for create mode (CUST-001, CUST-002, etc.)
  useEffect(() => {
    let isMounted = true;
    if (mode === 'create') {
      const activeCode = getValues('customerCode');
      if (!initialValues?.customerCode && (!activeCode || activeCode.trim() === '')) {
        setLoadingNextCode(true);
        customerApi
          .getNextCustomerCode()
          .then((code) => {
            if (!isMounted) return;
            if (code && typeof code === 'string' && code.trim()) {
              setValue('customerCode', code.trim(), { shouldValidate: true, shouldDirty: false });
            } else {
              return customerApi.getCustomers({ pageSize: 100 }).then((res) => {
                if (!isMounted) return;
                const items = res?.items || (Array.isArray(res) ? res : []);
                const nextCode = getNextCustomerCode(items);
                setValue('customerCode', nextCode, { shouldValidate: true, shouldDirty: false });
              });
            }
          })
          .catch(() => {
            if (isMounted) {
              customerApi
                .getCustomers({ pageSize: 100 })
                .then((res) => {
                  if (!isMounted) return;
                  const items = res?.items || (Array.isArray(res) ? res : []);
                  const nextCode = getNextCustomerCode(items);
                  setValue('customerCode', nextCode, { shouldValidate: true, shouldDirty: false });
                })
                .catch(() => {
                  if (isMounted) {
                    setValue('customerCode', 'CUST-001', { shouldValidate: true, shouldDirty: false });
                  }
                });
            }
          })
          .finally(() => {
            if (isMounted) setLoadingNextCode(false);
          });
      }
    }
    return () => {
      isMounted = false;
    };
  }, [mode, initialValues?.customerCode, setValue, getValues]);

  const isShippingSameAsBilling = watch('isShippingSameAsBilling');
  const billingAddress = watch('billingAddress');
  const taxRegistrationType = watch('taxRegistrationType');
  const watchedValues = watch();
  const watchedPhoneCode = watch('phoneCountryCode') || '+91';
  const currentPhoneConfig = COUNTRY_PHONE_CONFIG[watchedPhoneCode] || COUNTRY_PHONE_CONFIG['+91'];

  // Trigger phone re-validation when country dialing code changes
  useEffect(() => {
    const currentPhone = getValues('phone');
    if (currentPhone && currentPhone.trim() !== '') {
      trigger('phone');
    }
  }, [watchedPhoneCode, trigger, getValues]);

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

  const getStepValidationFields = (stepIndex) => {
    const fields = [...(STEP_FIELDS[stepIndex] || [])];
    if (stepIndex === 3 && !isShippingSameAsBilling) {
      fields.push(
        'shippingAddress.street',
        'shippingAddress.city',
        'shippingAddress.state',
        'shippingAddress.postalCode',
        'shippingAddress.country'
      );
    }
    return fields;
  };

  const handleNextStep = async (event) => {
    // Cancel the click's native default before validation changes the final
    // navigation button into the Review step's submit button.
    event?.preventDefault();
    const fieldsToValidate = getStepValidationFields(currentStep);
    const isValid = await trigger(fieldsToValidate);
    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleStepClick = async (targetStep) => {
    if (targetStep === currentStep) return;
    if (targetStep < currentStep) {
      setCurrentStep(targetStep);
      return;
    }

    // Validate steps prior to jumping forward
    let allPassed = true;
    for (let s = currentStep; s < targetStep; s++) {
      const stepFields = getStepValidationFields(s);
      const passed = await trigger(stepFields);
      if (!passed) {
        allPassed = false;
        setCurrentStep(s);
        break;
      }
    }
    if (allPassed) {
      setCurrentStep(targetStep);
    }
  };

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

  const handleInvalidSubmit = (formErrors) => {
    // If validation fails on submit, switch to the first step containing an error
    const errorKeys = Object.keys(formErrors);
    for (let s = 0; s < STEPS.length; s++) {
      const stepFields = getStepValidationFields(s);
      const hasErrorInStep = errorKeys.some((key) =>
        stepFields.some((f) => f === key || f.startsWith(`${key}.`))
      );
      if (hasErrorInStep) {
        setCurrentStep(s);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      // A field's Enter key must not implicitly activate the Review step's
      // submit button. Keyboard users can still activate that button directly.
      e.preventDefault();
      if (currentStep < STEPS.length - 1) {
        handleNextStep();
      }
    }
  };

  const currentStepData = STEPS[currentStep];
  const StepHeaderIcon = currentStepData.icon;
  const handleFormSubmit = (event) => {
    if (currentStep !== STEPS.length - 1 || event.nativeEvent?.submitter?.dataset?.customerAction !== 'submit') {
      event.preventDefault();
      return;
    }
    return handleSubmit(handleValidSubmit, handleInvalidSubmit)(event);
  };

  return (
    <div className="cust-wizard-container">
      {/* 5-Step Stepper Header */}
      <nav className="cust-wizard-stepper" aria-label="Customer Registration Progress">
        {STEPS.map((step, index) => {
          const isActive = step.id === currentStep;
          const isCompleted = step.id < currentStep;
          return (
            <React.Fragment key={step.id}>
              <button
                type="button"
                className={`cust-step-item ${isActive ? 'active' : ''} ${
                  isCompleted ? 'completed' : ''
                }`}
                onClick={() => handleStepClick(step.id)}
                aria-current={isActive ? 'step' : undefined}
              >
                <div className="cust-step-circle">
                  {isCompleted ? <Check fontSize="small" /> : step.id + 1}
                </div>
                <span className="cust-step-label">{step.label}</span>
              </button>
              {index < STEPS.length - 1 && (
                <div
                  className={`cust-step-line ${isCompleted ? 'completed' : ''}`}
                  aria-hidden="true"
                />
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* 2-Column Layout */}
      <div className="cust-wizard-layout">
        {/* Main Form Card */}
        <div className="cust-wizard-main">
          <form
            onSubmit={handleFormSubmit}
            onKeyDown={handleKeyDown}
            className="cust-form cust-wizard-card"
            noValidate
          >
            {submitError && (
              <div className="cust-alert cust-alert-error" role="alert" style={{ margin: '16px 20px 0' }}>
                <span className="cust-alert-icon" aria-hidden="true">⚠️</span>
                <span>{submitError}</span>
              </div>
            )}

            {/* Step Card Header */}
            <div className="cust-wizard-card-header">
              <div className="cust-wizard-header-left">
                <div className="cust-step-icon-badge" aria-hidden="true">
                  <StepHeaderIcon />
                </div>
                <div>
                  <h2 className="cust-step-title">{currentStepData.title}</h2>
                  <p className="cust-step-subtitle">{currentStepData.subtitle}</p>
                </div>
              </div>
              <div className="cust-required-pill">
                <InfoOutlined fontSize="small" />
                <span>
                  Fields marked with <strong className="cust-required">*</strong> are required
                </span>
              </div>
            </div>

            {/* STEP 0: Basic Information */}
            {currentStep === 0 && (
              <div className="cust-grid cust-grid-2">
                <div className="cust-field">
                  <label htmlFor="customer-name">
                    Contact / Customer Name <span className="cust-required">*</span>
                  </label>
                  <div className="cust-input-with-icon">
                    <span className="cust-input-icon" aria-hidden="true">
                      <PersonOutline />
                    </span>
                    <input
                      id="customer-name"
                      type="text"
                      placeholder="e.g. Venkat Rao"
                      aria-invalid={Boolean(errors.name)}
                      aria-describedby={errors.name ? 'customer-name-err' : undefined}
                      {...register('name')}
                    />
                  </div>
                  {errors.name && (
                    <span id="customer-name-err" className="cust-field-error" role="alert">
                      {errors.name.message}
                    </span>
                  )}
                </div>

                <div className="cust-field">
                  <label htmlFor="customer-code">
                    Customer Code <span className="cust-required">*</span>
                    <span className="cust-field-badge">
                      {loadingNextCode ? 'Generating…' : (mode === 'create' ? 'Auto-assigned' : 'Locked')}
                    </span>
                  </label>
                  <div className="cust-input-with-icon">
                    <span className="cust-input-icon" aria-hidden="true">
                      <LocalOfferOutlined />
                    </span>
                    <input
                      id="customer-code"
                      type="text"
                      readOnly={true}
                      tabIndex={-1}
                      placeholder={loadingNextCode ? 'Generating code…' : 'e.g. CUST-016'}
                      className={`cust-input-readonly ${errors.customerCode ? 'has-error' : ''}`}
                      aria-invalid={Boolean(errors.customerCode)}
                      aria-describedby={errors.customerCode ? 'customer-code-err' : undefined}
                      {...register('customerCode')}
                    />
                  </div>
                  {errors.customerCode && (
                    <span id="customer-code-err" className="cust-field-error" role="alert">
                      {errors.customerCode.message}
                    </span>
                  )}
                </div>

                <div className="cust-field">
                  <label htmlFor="customer-company">Company / Business Name</label>
                  <div className="cust-input-with-icon">
                    <span className="cust-input-icon" aria-hidden="true">
                      <BusinessOutlined />
                    </span>
                    <input
                      id="customer-company"
                      type="text"
                      placeholder="e.g. Deccan Tech Solutions"
                      aria-invalid={Boolean(errors.companyName)}
                      aria-describedby={errors.companyName ? 'customer-company-err' : undefined}
                      {...register('companyName')}
                    />
                  </div>
                  {errors.companyName && (
                    <span id="customer-company-err" className="cust-field-error" role="alert">
                      {errors.companyName.message}
                    </span>
                  )}
                </div>

                <div className="cust-field cust-col-span-2">
                  <label htmlFor="customer-status">Account Status</label>
                  {mode === 'create' ? <p className="cust-hint">New customers are active when created.</p> : <div className="cust-status-select-wrap">
                    <span
                      className={`cust-status-dot ${
                        watch('status') === 'Active' ? 'active' : 'inactive'
                      }`}
                      aria-hidden="true"
                    />
                    <select
                      id="customer-status"
                      aria-invalid={Boolean(errors.status)}
                      {...register('status')}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>}

                  {errors.status && (
                    <span className="cust-field-error" role="alert">
                      {errors.status.message}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* STEP 1: Contact Information */}
            {currentStep === 1 && (
              <div className="cust-grid cust-grid-2">
                <div className="cust-field">
                  <label htmlFor="customer-email">
                    Email Address <span className="cust-required">*</span>
                  </label>
                  <div className="cust-input-with-icon">
                    <span className="cust-input-icon" aria-hidden="true">
                      <EmailOutlined />
                    </span>
                    <input
                      id="customer-email"
                      type="email"
                      placeholder="e.g. venkat.rao@deccantech.in"
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? 'customer-email-err' : undefined}
                      {...register('email')}
                    />
                  </div>
                  {errors.email && (
                    <span id="customer-email-err" className="cust-field-error" role="alert">
                      {errors.email.message}
                    </span>
                  )}
                </div>

                <div className="cust-field">
                  <label htmlFor="customer-phone">
                    Mobile / Phone Number <span className="cust-required">*</span>
                  </label>
                  <div className="cust-phone-group">
                    <select
                      id="customer-phone-code"
                      className="cust-phone-code-select"
                      aria-label="Country Dialing Code"
                      {...register('phoneCountryCode', { onChange: () => trigger('phone') })}
                    >
                      {Object.entries(COUNTRY_PHONE_CONFIG).map(([code, cfg]) => (
                        <option key={code} value={code}>
                          {code} ({cfg.code})
                        </option>
                      ))}
                    </select>
                    <div className="cust-input-with-icon" style={{ flex: '1 1 auto' }}>
                      <span className="cust-input-icon" aria-hidden="true">
                        <PhoneOutlined />
                      </span>
                      <input
                        id="customer-phone"
                        type="tel"
                        aria-required="true"
                        className="cust-phone-input"
                        placeholder={`e.g. ${currentPhoneConfig.example} (${currentPhoneConfig.label})`}
                        aria-invalid={Boolean(errors.phone)}
                        aria-describedby={errors.phone ? 'customer-phone-err' : 'customer-phone-hint'}
                        {...register('phone')}
                      />
                    </div>
                  </div>
                  {errors.phone ? (
                    <span id="customer-phone-err" className="cust-field-error" role="alert">
                      {errors.phone.message}
                    </span>
                  ) : (
                    <span id="customer-phone-hint" className="cust-field-hint" style={{ fontSize: '0.75rem', color: '#8c7d71', marginTop: '2px' }}>
                      Requires {currentPhoneConfig.label} for {currentPhoneConfig.country}
                    </span>
                  )}
                </div>

                <div className="cust-field cust-col-span-2">
                  <label htmlFor="customer-website">Website URL</label>
                  <div className="cust-input-with-icon">
                    <span className="cust-input-icon" aria-hidden="true">
                      <LanguageOutlined />
                    </span>
                    <input
                      id="customer-website"
                      type="text"
                      placeholder="e.g. https://deccantech.in or www.deccantech.in"
                      aria-invalid={Boolean(errors.website)}
                      aria-describedby={errors.website ? 'customer-website-err' : undefined}
                      {...register('website')}
                    />
                  </div>
                  {errors.website && (
                    <span id="customer-website-err" className="cust-field-error" role="alert">
                      {errors.website.message}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* STEP 2: Billing & Tax Information */}
            {currentStep === 2 && (
              <div className="cust-grid cust-grid-2">
                <div className="cust-field">
                  <label htmlFor="customer-tax-type">
                    Tax Registration Status <span className="cust-required">*</span>
                  </label>
                  <select
                    id="customer-tax-type"
                    aria-invalid={Boolean(errors.taxRegistrationType)}
                    {...register('taxRegistrationType')}
                  >
                    <option value="gst">GST Registered</option>
                    <option value="pan">PAN Available</option>
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
                    {taxRegistrationType === 'gst' ? (
                      <>
                        GSTIN (15-Character GST Number) <span className="cust-required">*</span>
                      </>
                    ) : taxRegistrationType === 'pan' ? (
                      <>
                        PAN (10 characters) <span className="cust-required">*</span>
                      </>
                    ) : (
                      'Tax ID (Optional)'
                    )}
                  </label>
                  <div className="cust-input-with-icon">
                    <span className="cust-input-icon" aria-hidden="true">
                      <DescriptionOutlined />
                    </span>
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
                      maxLength={taxRegistrationType === 'gst' ? 15 : taxRegistrationType === 'pan' ? 10 : 64}
                      aria-invalid={Boolean(errors.taxId)}
                      aria-describedby={errors.taxId ? 'customer-taxid-err' : undefined}
                      {...register('taxId')}
                    />
                  </div>
                  {errors.taxId && (
                    <span id="customer-taxid-err" className="cust-field-error" role="alert">
                      {errors.taxId.message}
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

              </div>
            )}

            {/* STEP 3: Address Information */}
            {currentStep === 3 && (
              <div className="cust-step-address-content">
                <div className="cust-subcard">
                  <AddressSection
                    prefix="billingAddress"
                    title="Billing Address Details"
                    register={register}
                    errors={errors}
                    country={billingAddress?.country}
                  />
                </div>

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

                <div className="cust-subcard">
                  <AddressSection
                    prefix="shippingAddress"
                    title="Shipping Address Details"
                    register={register}
                    errors={errors}
                    disabled={isShippingSameAsBilling}
                    country={watchedValues.shippingAddress?.country}
                  />
                </div>
              </div>
            )}

            {/* STEP 4: Review & Confirm */}
            {currentStep === 4 && (
              <div className="cust-review-sections">
                {/* 1. Basic Info Review */}
                <div className="cust-review-card">
                  <div className="cust-review-card-header">
                    <h4>Basic Information</h4>
                    <button
                      type="button"
                      className="cust-review-edit-btn"
                      onClick={() => setCurrentStep(0)}
                    >
                      <EditOutlined fontSize="small" /> Edit
                    </button>
                  </div>
                  <div className="cust-review-grid">
                    <div className="cust-review-row">
                      <span className="cust-review-label">Customer Name</span>
                      <span className="cust-review-value">{watchedValues.name || '—'}</span>
                    </div>
                    <div className="cust-review-row">
                      <span className="cust-review-label">Customer Code</span>
                      <span className="cust-review-value">{watchedValues.customerCode || '—'}</span>
                    </div>
                    <div className="cust-review-row">
                      <span className="cust-review-label">Company Name</span>
                      <span className="cust-review-value">{watchedValues.companyName || '—'}</span>
                    </div>
                    <div className="cust-review-row">
                      <span className="cust-review-label">Account Status</span>
                      <span className="cust-review-value">{watchedValues.status || 'Active'}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Contact Info Review */}
                <div className="cust-review-card">
                  <div className="cust-review-card-header">
                    <h4>Contact Information</h4>
                    <button
                      type="button"
                      className="cust-review-edit-btn"
                      onClick={() => setCurrentStep(1)}
                    >
                      <EditOutlined fontSize="small" /> Edit
                    </button>
                  </div>
                  <div className="cust-review-grid">
                    <div className="cust-review-row">
                      <span className="cust-review-label">Email Address</span>
                      <span className="cust-review-value">{watchedValues.email || '—'}</span>
                    </div>
                    <div className="cust-review-row">
                      <span className="cust-review-label">Phone Number</span>
                      <span className="cust-review-value">
                        {watchedValues.phone
                          ? `${watchedValues.phoneCountryCode || '+91'} ${watchedValues.phone}`
                          : '—'}
                      </span>
                    </div>
                    <div className="cust-review-row cust-col-span-2">
                      <span className="cust-review-label">Website URL</span>
                      <span className="cust-review-value">{watchedValues.website || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* 3. Billing & Tax Review */}
                <div className="cust-review-card">
                  <div className="cust-review-card-header">
                    <h4>Billing & Tax Information</h4>
                    <button
                      type="button"
                      className="cust-review-edit-btn"
                      onClick={() => setCurrentStep(2)}
                    >
                      <EditOutlined fontSize="small" /> Edit
                    </button>
                  </div>
                  <div className="cust-review-grid">
                    <div className="cust-review-row">
                      <span className="cust-review-label">Tax Status</span>
                      <span className="cust-review-value">
                        {watchedValues.taxRegistrationType === 'gst'
                          ? 'GST Registered'
                          : watchedValues.taxRegistrationType === 'pan'
                          ? 'PAN Available'
                          : 'Non-GST / Unregistered'}
                      </span>
                    </div>
                    <div className="cust-review-row">
                      <span className="cust-review-label">Tax ID / GSTIN</span>
                      <span className="cust-review-value">{watchedValues.taxId || '—'}</span>
                    </div>
                    <div className="cust-review-row">
                      <span className="cust-review-label">Currency</span>
                      <span className="cust-review-value">{watchedValues.currency || 'INR'}</span>
                    </div>
                    <div className="cust-review-row">
                      <span className="cust-review-label">Payment Terms</span>
                      <span className="cust-review-value">{watchedValues.paymentTerms || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* 4. Address Review */}
                <div className="cust-review-card">
                  <div className="cust-review-card-header">
                    <h4>Address Information</h4>
                    <button
                      type="button"
                      className="cust-review-edit-btn"
                      onClick={() => setCurrentStep(3)}
                    >
                      <EditOutlined fontSize="small" /> Edit
                    </button>
                  </div>
                  <div className="cust-review-grid">
                    <div className="cust-review-row cust-col-span-2">
                      <span className="cust-review-label">Billing Address</span>
                      <span className="cust-review-value">
                        {[
                          watchedValues.billingAddress?.street,
                          watchedValues.billingAddress?.addressLine2,
                          watchedValues.billingAddress?.city,
                          watchedValues.billingAddress?.state,
                          watchedValues.billingAddress?.postalCode,
                          watchedValues.billingAddress?.country,
                        ]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </span>
                    </div>
                    <div className="cust-review-row cust-col-span-2">
                      <span className="cust-review-label">Shipping Address</span>
                      <span className="cust-review-value">
                        {watchedValues.isShippingSameAsBilling
                          ? 'Same as billing address'
                          : [
                              watchedValues.shippingAddress?.street,
                              watchedValues.shippingAddress?.addressLine2,
                              watchedValues.shippingAddress?.city,
                              watchedValues.shippingAddress?.state,
                              watchedValues.shippingAddress?.postalCode,
                              watchedValues.shippingAddress?.country,
                            ]
                              .filter(Boolean)
                              .join(', ') || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Internal Notes */}
                <div className="cust-field" style={{ marginTop: '8px' }}>
                  <label htmlFor="customer-notes">Internal Notes (Optional)</label>
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
            )}

            {/* Bottom Actions Bar */}
            <div className="cust-wizard-actions">
              <div className="cust-actions-left">
                {currentStep === 0 ? (
                  <button
                    type="button"
                    className="cust-btn cust-btn-secondary"
                    onClick={onCancel}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cust-btn cust-btn-secondary"
                    onClick={() => {
                      setCurrentStep((prev) => Math.max(prev - 1, 0));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={isSubmitting}
                  >
                    <ArrowBack /> Back
                  </button>
                )}
              </div>

              <div className="cust-actions-right">
                {currentStep < STEPS.length - 1 ? (
                  <button
                    key="customer-next"
                    type="button"
                    data-customer-action="next"
                    className="cust-btn cust-btn-primary"
                    onClick={handleNextStep}
                    disabled={isSubmitting}
                  >
                    Next: {STEPS[currentStep + 1].label} <ArrowForward />
                  </button>
                ) : (
                  <button
                    key="customer-submit"
                    type="submit"
                    data-customer-action="submit"
                    className="cust-btn cust-btn-primary"
                    disabled={isSubmitting}
                  >
                    {isSubmitting
                      ? mode === 'edit'
                        ? 'Saving...'
                        : 'Creating...'
                      : mode === 'edit'
                      ? 'Save Changes'
                      : 'Create Customer'}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Right Assistant Panel */}
        <aside className="cust-wizard-aside">
          {/* Card 1: Add a New Customer Info Card */}
          <div className="cust-side-card cust-guide-card">
            <div className="cust-guide-illustration" aria-hidden="true">
              <svg
                width="72"
                height="72"
                viewBox="0 0 72 72"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="12"
                  y="10"
                  width="48"
                  height="52"
                  rx="8"
                  fill="#f5ede6"
                  stroke="#e0d4c8"
                  strokeWidth="1.5"
                />
                <rect x="20" y="18" width="14" height="14" rx="4" fill="#855a3b" />
                <circle cx="27" cy="23" r="3" fill="#ffffff" />
                <path
                  d="M22 30C22 28.5 24 27.5 27 27.5C30 27.5 32 28.5 32 30"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <rect x="38" y="20" width="16" height="3" rx="1.5" fill="#c4b5a5" />
                <rect x="38" y="27" width="12" height="3" rx="1.5" fill="#c4b5a5" />
                <rect x="20" y="38" width="32" height="3" rx="1.5" fill="#d9cdbf" />
                <rect x="20" y="45" width="24" height="3" rx="1.5" fill="#d9cdbf" />
                <circle cx="52" cy="52" r="10" fill="#754d34" />
                <path
                  d="M52 47V57M47 52H57"
                  stroke="#ffffff"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h3 className="cust-guide-title">
              {mode === 'edit' ? 'Edit Customer' : 'Add a New Customer'}
            </h3>
            <p className="cust-guide-text">
              Fill in the details step by step. You can review all information before saving.
            </p>
          </div>

          {/* Card 2: Contextual Quick Tip Card */}
          <div className="cust-side-card cust-tip-card">
            <div className="cust-tip-header">
              <span className="cust-tip-icon" aria-hidden="true">
                <LightbulbOutlined />
              </span>
              <h4 className="cust-tip-title">Quick Tip</h4>
            </div>
            <p className="cust-tip-text">{QUICK_TIPS[currentStep]}</p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CustomerForm;
