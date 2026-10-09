import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { AddressSection } from './AddressSection';
import { CustomerSelectField } from './CustomerSelectField';
import { CountryCallingCodeSelector } from '../../../components/CountryCallingCodeSelector';
import { shippingFromBilling } from 'billing-contracts';
import { customerApi } from 'billing-api-client';
import {
  customerValidationSchema,
  DEFAULT_CUSTOMER_VALUES,
  STEP_FIELDS,
  getNextCustomerCode,
  COUNTRY_PHONE_CONFIG,
} from '../validation/customerValidation';
import { useRegionalSettings } from '../../../services/regionalSettingsService';
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
  CategoryOutlined,
} from '@mui/icons-material';
import '../styles/customer-form.css';

const STEPS = [
  {
    id: 0,
    label: 'Basic Info',
    title: 'Basic Information',
    subtitle: 'Enter core identification, category, and currency settings',
    icon: BusinessOutlined,
  },
  {
    id: 1,
    label: 'Contact Info',
    title: 'Contact Information',
    subtitle: 'Provide communication details and web contacts',
    icon: EmailOutlined,
  },
  {
    id: 2,
    label: 'Billing & Tax',
    title: 'Billing & Tax',
    subtitle: 'Configure tax registration and payment terms',
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
    label: 'Review & Confirm',
    title: 'Review & Confirm',
    subtitle: 'Verify all customer details before saving',
    icon: CheckCircleOutlined,
  },
];

const QUICK_TIPS = {
  0: [
    'Customer code will be auto-generated.',
    'Select the correct customer type for tax handling.',
    'Currency will be used for invoice transactions.',
    'Keep customer name and company name as per official records.',
    'You can update these details later.',
  ],
  1: [
    'Primary email receives automated invoices and receipts.',
    'Ensure valid 10-digit mobile number for SMS / WhatsApp alerts.',
    'Adding website URL helps in automated merchant verification.',
    'Contact information can be updated anytime after creation.',
  ],
  2: [
    'PAN (10 characters) is mandatory for billing and tax compliance.',
    'GSTIN is required for GST-registered businesses.',
    'Entering GSTIN auto-fills the PAN number.',
    'Set default payment terms to reflect on newly generated invoices.',
  ],
  3: [
    'Enter 6-digit PIN code to auto-populate city, state, and locality.',
    'Enable identical shipping address if office and dispatch coincide.',
    'Disabling identical address allows entering separate warehouse details.',
    'Accurate billing address is required for GST tax invoices.',
  ],
  4: [
    'Review all customer details carefully before creating the record.',
    'Click Edit on any section to make quick adjustments.',
    'Active customers are immediately eligible for invoice creation.',
    'All customer details can be edited later from the directory.',
  ],
};

export const CustomerForm = ({
  initialValues = null,
  onSubmit,
  isSubmitting = false,
  submitError = '',
  onCancel,
  mode = 'create',
}) => {
  const {
    selectedCountries,
    availableCountries,
    defaultCountry,
    defaultCallingCode,
  } = useRegionalSettings();
  const [currentStep, setCurrentStep] = useState(0);
  const [slideDirection, setSlideDirection] = useState('forward');
  const [loadingNextCode, setLoadingNextCode] = useState(false);

  const getInitialValues = (values) => {
    const rawTax = String(values?.taxId || values?.gstin || values?.pan || '').trim();
    const isGst = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(rawTax);
    const taxType = values?.taxRegistrationType === 'non-gst' ? 'non-gst' : 'gst';

    let initialPan = values?.pan || '';
    if (!initialPan) {
      if (isGst && rawTax.length === 15) {
        initialPan = rawTax.substring(2, 12);
      } else if (/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(rawTax)) {
        initialPan = rawTax;
      }
    }

    const initialGstin = values?.gstin || (isGst ? rawTax : '');

    const rawStatus = values?.status ?? values?.Status;
    let initialStatus = 'Active';
    if (typeof values?.isActive === 'boolean') {
      initialStatus = values.isActive ? 'Active' : 'Inactive';
    } else if (typeof values?.IsActive === 'boolean') {
      initialStatus = values.IsActive ? 'Active' : 'Inactive';
    } else if (rawStatus) {
      initialStatus = String(rawStatus).trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
    }

    const KNOWN_CODES = [
      '+971', '+966', '+91', '+44', '+65', '+61', '+49', '+33', '+81', '+1',
      '+64', '+27', '+353', '+39', '+34', '+31', '+41', '+46', '+47', '+45',
      '+60', '+62', '+63', '+66', '+55', '+52', '+974', '+965', '+86', '+82'
    ];
    const defaultCallingCodeFromSettings = defaultCallingCode || '+91';
    let phoneCountryCode = values?.phoneCountryCode || (mode === 'create' ? defaultCallingCodeFromSettings : '');
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
      ''
    ).trim().toUpperCase();
    const currency = rawCurrency || '';

    const rawPaymentTerms = String(
      values?.paymentTerms ??
      values?.PaymentTerms ??
      values?.financialSummary?.paymentTerms ??
      values?.financialSummary?.PaymentTerms ??
      values?.raw?.paymentTerms ??
      ''
    ).trim();
    const paymentTerms = rawPaymentTerms || '';

    return {
      ...DEFAULT_CUSTOMER_VALUES,
      ...(values || {}),
      customerCode: values?.customerCode || '',
      customerType,
      customerCategory: values?.customerCategory || 'Enterprise',
      status: initialStatus,
      isActive: initialStatus === 'Active',
      phoneCountryCode,
      phone: phoneNumber,
      taxRegistrationType: taxType,
      pan: initialPan,
      gstin: initialGstin,
      taxId: rawTax,
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
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    trigger,
    clearErrors,
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
  const watchedPhoneCode = watch('phoneCountryCode') || '';
  const currentPhoneConfig = watchedPhoneCode && COUNTRY_PHONE_CONFIG[watchedPhoneCode]
    ? COUNTRY_PHONE_CONFIG[watchedPhoneCode]
    : { country: 'International', code: 'INTL', min: 7, max: 15, example: '98490 12345', label: '7-15 digits' };

  // Trigger phone re-validation when country dialing code changes
  useEffect(() => {
    const currentPhone = getValues('phone');
    if (currentPhone && currentPhone.trim() !== '') {
      trigger('phone');
    }
  }, [watchedPhoneCode, trigger, getValues]);

  const copyBillingToShipping = useCallback(() => {
    const billing = getValues('billingAddress') || {};
    setValue('shippingAddress.street', billing.street || '', { shouldValidate: false, shouldDirty: true });
    setValue('shippingAddress.addressLine2', billing.addressLine2 || '', { shouldValidate: false, shouldDirty: true });
    setValue('shippingAddress.city', billing.city || '', { shouldValidate: false, shouldDirty: true });
    setValue('shippingAddress.state', billing.state || '', { shouldValidate: false, shouldDirty: true });
    setValue('shippingAddress.postalCode', billing.postalCode || '', { shouldValidate: false, shouldDirty: true });
    setValue('shippingAddress.country', billing.country || '', { shouldValidate: false, shouldDirty: true });
    clearErrors([
      'shippingAddress.street',
      'shippingAddress.addressLine2',
      'shippingAddress.city',
      'shippingAddress.state',
      'shippingAddress.postalCode',
      'shippingAddress.country',
    ]);
  }, [getValues, setValue, clearErrors]);

  const clearShippingAddress = useCallback(() => {
    setValue('shippingAddress.street', '', { shouldValidate: false, shouldDirty: true });
    setValue('shippingAddress.addressLine2', '', { shouldValidate: false, shouldDirty: true });
    setValue('shippingAddress.city', '', { shouldValidate: false, shouldDirty: true });
    setValue('shippingAddress.state', '', { shouldValidate: false, shouldDirty: true });
    setValue('shippingAddress.postalCode', '', { shouldValidate: false, shouldDirty: true });
    setValue('shippingAddress.country', '', { shouldValidate: false, shouldDirty: true });
    clearErrors([
      'shippingAddress.street',
      'shippingAddress.addressLine2',
      'shippingAddress.city',
      'shippingAddress.state',
      'shippingAddress.postalCode',
      'shippingAddress.country',
    ]);
  }, [setValue, clearErrors]);

  // Derive options based on countries selected in Settings:
  // "For which countries I have selected, those countries should be visible."
  const activeCountriesList = selectedCountries.length > 0 ? selectedCountries : availableCountries;

  // Currency options (from selected countries)
  const activeCurrenciesList = [];
  const seenCurrencies = new Set();
  for (const c of activeCountriesList) {
    if (c.currency && !seenCurrencies.has(c.currency)) {
      seenCurrencies.add(c.currency);
      activeCurrenciesList.push({
        value: c.currency,
        label: `${c.currency} (${c.currencySymbol || c.currency})`,
      });
    }
  }
  const activeFormCurrency = watch('currency');
  const hasActiveCurrency = !activeFormCurrency || activeCurrenciesList.some((c) => c.value === activeFormCurrency);
  const currencyOptions = [
    { value: '', label: 'Select Currency' },
    ...activeCurrenciesList,
    ...(!hasActiveCurrency && activeFormCurrency ? [{ value: activeFormCurrency, label: activeFormCurrency }] : []),
  ];

  // Phone Country Code options (from selected countries)
  const seenPhoneCodes = new Set();
  const activePhoneCodeList = [];
  for (const c of activeCountriesList) {
    if (c.phoneCode && !seenPhoneCodes.has(c.phoneCode)) {
      seenPhoneCodes.add(c.phoneCode);
      activePhoneCodeList.push({
        value: c.phoneCode,
        label: `${c.phoneCode} (${c.code})`,
      });
    }
  }
  const hasActivePhoneCode = !watchedPhoneCode || activePhoneCodeList.some((p) => p.value === watchedPhoneCode);
  const phoneCodeOptions = [
    { value: '', label: 'Select Code' },
    ...activePhoneCodeList,
    ...(!hasActivePhoneCode && watchedPhoneCode ? [{ value: watchedPhoneCode, label: watchedPhoneCode }] : []),
  ];

  const prevIsShippingSameRef = useRef(isShippingSameAsBilling);

  // Synchronize shipping address whenever billing changes while "Same as Billing" is active
  // If user disables "Same as Billing", clear all shipping address fields so they can enter manually
  useEffect(() => {
    if (isShippingSameAsBilling) {
      copyBillingToShipping();
    } else if (prevIsShippingSameRef.current && !isShippingSameAsBilling) {
      clearShippingAddress();
    }
    prevIsShippingSameRef.current = isShippingSameAsBilling;
  }, [
    isShippingSameAsBilling,
    billingAddress?.street,
    billingAddress?.addressLine2,
    billingAddress?.city,
    billingAddress?.state,
    billingAddress?.postalCode,
    billingAddress?.country,
    copyBillingToShipping,
    clearShippingAddress,
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
      setSlideDirection('forward');
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleStepClick = async (targetStep) => {
    if (targetStep === currentStep) return;
    if (targetStep < currentStep) {
      setSlideDirection('backward');
      setCurrentStep(targetStep);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Validate steps prior to jumping forward
    let allPassed = true;
    for (let s = currentStep; s < targetStep; s++) {
      const stepFields = getStepValidationFields(s);
      const passed = await trigger(stepFields);
      if (!passed) {
        allPassed = false;
        setSlideDirection(s > currentStep ? 'forward' : 'backward');
        setCurrentStep(s);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      }
    }
    if (allPassed) {
      setSlideDirection('forward');
      setCurrentStep(targetStep);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleValidSubmit = (data) => {
    if (isSubmitting) return;

    // Derive immutable effective shipping values without cross-object mutation
    const effectiveShipping = data.isShippingSameAsBilling
      ? shippingFromBilling(data.billingAddress, data.shippingAddress)
      : { ...data.shippingAddress };

    const cleanedPan = data.pan?.trim()?.toUpperCase() || null;
    const cleanedGstin =
      data.taxRegistrationType === 'gst'
        ? data.gstin?.trim()?.toUpperCase() || null
        : null;
    const effectiveTaxId = cleanedGstin || cleanedPan || null;

    const isStatusActive = String(data.status).trim().toLowerCase() !== 'inactive';
    const normalizedStatus = isStatusActive ? 'Active' : 'Inactive';

    const cleanedPhone = data.phone?.trim();
    let fullPhone = null;
    if (cleanedPhone) {
      if (cleanedPhone.startsWith('+')) {
        fullPhone = cleanedPhone;
      } else {
        const code = data.phoneCountryCode?.trim();
        fullPhone = code ? `${code} ${cleanedPhone}` : cleanedPhone;
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
      customerCategory: data.customerCategory?.trim() || 'Enterprise',
      status: normalizedStatus,
      isActive: isStatusActive,
      email: data.email?.trim(),
      phone: fullPhone,
      phoneCountryCode: data.phoneCountryCode || '',
      taxRegistrationType: data.taxRegistrationType || 'gst',
      pan: cleanedPan,
      gstin: cleanedGstin,
      taxId: effectiveTaxId,
      currency: data.currency?.trim() || '',
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
      {/* 2-Column Master Layout (72% Unified Form + 28% Quick Tips) */}
      <div className="cust-wizard-layout">
        {/* Main Form Card */}
        <div className="cust-wizard-main">
          <form
            onSubmit={handleFormSubmit}
            onKeyDown={handleKeyDown}
            className="cust-form cust-wizard-card"
            noValidate
          >
            {/* 5-Step Stepper inside the Unified Form Card */}
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

            <div className="cust-stepper-divider" />

            {submitError && (
              <div className="cust-alert cust-alert-error" role="alert" style={{ margin: '0 0 20px 0' }}>
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

            <div key={currentStep} className={`cust-step-panel slide-${slideDirection}`}>
              {/* STEP 0: Basic Information */}
              {currentStep === 0 && (
                <div className="cust-grid cust-grid-2">
                  <div className="cust-field">
                    <label htmlFor="customer-name">
                      Customer Name <span className="cust-required">*</span>
                    </label>
                    <div className="cust-input-with-icon">
                      <span className="cust-input-icon" aria-hidden="true">
                        <PersonOutline />
                      </span>
                      <input
                        id="customer-name"
                        type="text"
                        maxLength={100}
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
                    <label htmlFor="customer-company">Company Name</label>
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

                  <div className="cust-field">
                    <label htmlFor="customer-type">Customer Type</label>
                    <CustomerSelectField
                      control={control}
                      name="customerType"
                      id="customer-type"
                      ariaLabel="Customer Type"
                      invalid={Boolean(errors.customerType)}
                      options={[
                        { value: 'business', label: 'Business (B2B)' },
                        { value: 'individual', label: 'Individual (B2C)' },
                        { value: 'organization', label: 'Organization / Non-Profit' },
                      ]}
                    />
                    {errors.customerType && (
                      <span className="cust-field-error" role="alert">
                        {errors.customerType.message}
                      </span>
                    )}
                  </div>

                  <div className="cust-field">
                    <label htmlFor="customer-status">Status</label>
                    {mode === 'create' ? (
                      <div className="cust-status-badge-static">
                        <span className="cust-status-dot active" aria-hidden="true" />
                        <span>Active</span>
                        <small className="cust-hint-inline">— New customer records default to active status.</small>
                      </div>
                    ) : (
                      <div className="cust-status-select-wrap">
                        <span
                          className={`cust-status-dot ${
                            watch('status') === 'Active' ? 'active' : 'inactive'
                          }`}
                          aria-hidden="true"
                        />
                        <CustomerSelectField
                          control={control}
                          name="status"
                          id="customer-status"
                          ariaLabel="Account status"
                          invalid={Boolean(errors.status)}
                          options={[
                            { value: 'Active', label: 'Active' },
                            { value: 'Inactive', label: 'Inactive' },
                          ]}
                        />
                      </div>
                    )}
                    {errors.status && (
                      <span className="cust-field-error" role="alert">
                        {errors.status.message}
                      </span>
                    )}
                  </div>

                  <div className="cust-field">
                    <label htmlFor="customer-currency">Currency</label>
                    <CustomerSelectField
                      control={control}
                      name="currency"
                      id="customer-currency"
                      ariaLabel="Currency"
                      invalid={Boolean(errors.currency)}
                      options={currencyOptions}
                    />
                    {errors.currency && (
                      <span className="cust-field-error" role="alert">
                        {errors.currency.message}
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
                    <CountryCallingCodeSelector
                      id="customer-phone-code"
                      name="phoneCountryCode"
                      value={watchedPhoneCode || defaultCallingCode || '+91'}
                      error={Boolean(errors.phoneCountryCode)}
                      disabled={false}
                      onChange={(newCode) => {
                        setValue('phoneCountryCode', newCode, { shouldValidate: true, shouldDirty: true });
                        const newCfg = newCode && COUNTRY_PHONE_CONFIG[newCode] ? COUNTRY_PHONE_CONFIG[newCode] : null;
                        const maxLen = newCfg?.max || 15;
                        const currentVal = getValues('phone') || '';
                        if (currentVal.length > maxLen) {
                          setValue('phone', currentVal.slice(0, maxLen), { shouldValidate: true, shouldDirty: true });
                        } else {
                          trigger('phone');
                        }
                      }}
                    />
                    <div className="cust-input-with-icon" style={{ flex: '1 1 auto' }}>
                      <span className="cust-input-icon" aria-hidden="true">
                        <PhoneOutlined />
                      </span>
                      <input
                        id="customer-phone"
                        type="tel"
                        inputMode="numeric"
                        maxLength={currentPhoneConfig.max || 15}
                        aria-required="true"
                        className="cust-phone-input"
                        placeholder="Enter mobile number"
                        aria-invalid={Boolean(errors.phone)}
                        aria-describedby={errors.phone ? 'customer-phone-err' : 'customer-phone-hint'}
                        {...register('phone', {
                          onChange: (e) => {
                            const maxLen = currentPhoneConfig.max || 15;
                            const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, maxLen);
                            setValue('phone', digitsOnly, { shouldValidate: true, shouldDirty: true });
                          },
                        })}
                        onKeyDown={(e) => {
                          const allowedKeys = [
                            'Backspace',
                            'Tab',
                            'Delete',
                            'ArrowLeft',
                            'ArrowRight',
                            'ArrowUp',
                            'ArrowDown',
                            'Home',
                            'End',
                            'Enter',
                          ];
                          if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) {
                            return;
                          }
                          if (!/^[0-9]$/.test(e.key)) {
                            e.preventDefault();
                            return;
                          }
                          const maxLen = currentPhoneConfig.max || 15;
                          const input = e.currentTarget;
                          const selectedLength = (input.selectionEnd || 0) - (input.selectionStart || 0);
                          if (input.value.length >= maxLen && selectedLength === 0) {
                            e.preventDefault();
                          }
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const pasteText = e.clipboardData?.getData('text') || '';
                          const digitsOnly = pasteText.replace(/\D/g, '');
                          if (!digitsOnly) return;
                          const maxLen = currentPhoneConfig.max || 15;
                          const currentVal = getValues('phone') || '';
                          const input = e.currentTarget;
                          const start = input.selectionStart || 0;
                          const end = input.selectionEnd || 0;
                          const combined = (currentVal.slice(0, start) + digitsOnly + currentVal.slice(end))
                            .replace(/\D/g, '')
                            .slice(0, maxLen);
                          setValue('phone', combined, { shouldValidate: true, shouldDirty: true });
                        }}
                      />
                    </div>
                  </div>
                  {errors.phone ? (
                    <span id="customer-phone-err" className="cust-field-error" role="alert">
                      {errors.phone.message}
                    </span>
                  ) : watchedPhoneCode ? (
                    <span id="customer-phone-hint" className="cust-field-hint" style={{ fontSize: '0.75rem', color: '#8c7d71', marginTop: '2px' }}>
                      Requires {currentPhoneConfig.label} for {currentPhoneConfig.country}
                    </span>
                  ) : (
                    <span id="customer-phone-hint" className="cust-field-hint" style={{ fontSize: '0.75rem', color: '#8c7d71', marginTop: '2px' }}>
                      Enter mobile number
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
                  <CustomerSelectField
                    control={control}
                    name="taxRegistrationType"
                    id="customer-tax-type"
                    ariaLabel="Tax Registration Status"
                    invalid={Boolean(errors.taxRegistrationType)}
                    onValueChange={(val) => {
                      if (val === 'non-gst') {
                        setValue('gstin', '', { shouldValidate: true, shouldDirty: true });
                      } else {
                        trigger('gstin');
                      }
                    }}
                    options={[
                      { value: 'gst', label: 'GST Registered' },
                      { value: 'non-gst', label: 'Non-GST / Unregistered' },
                    ]}
                  />
                  {errors.taxRegistrationType && (
                    <span className="cust-field-error" role="alert">
                      {errors.taxRegistrationType.message}
                    </span>
                  )}
                </div>

                <div className="cust-field">
                  <label htmlFor="customer-pan">
                    PAN (10 characters) <span className="cust-required">*</span>
                  </label>
                  <div className="cust-input-with-icon">
                    <span className="cust-input-icon" aria-hidden="true">
                      <DescriptionOutlined />
                    </span>
                    <input
                      id="customer-pan"
                      type="text"
                      placeholder="e.g. ABCDE1234F"
                      maxLength={10}
                      aria-invalid={Boolean(errors.pan)}
                      aria-describedby={errors.pan ? 'customer-pan-err' : 'customer-pan-hint'}
                      {...register('pan', {
                        onChange: (e) => {
                          const upper = (e.target.value || '').toUpperCase();
                          setValue('pan', upper, { shouldValidate: true, shouldDirty: true });
                        },
                      })}
                    />
                  </div>
                  {errors.pan ? (
                    <span id="customer-pan-err" className="cust-field-error" role="alert">
                      {errors.pan.message}
                    </span>
                  ) : (
                    <span id="customer-pan-hint" className="cust-field-hint">
                      Permanent Account Number (10 alphanumeric characters)
                    </span>
                  )}
                </div>

                <div className="cust-field">
                  <label htmlFor="customer-gstin">
                    {taxRegistrationType === 'gst' ? (
                      <>
                        GSTIN (15-Character GST Number) <span className="cust-required">*</span>
                      </>
                    ) : (
                      'GSTIN (Not Applicable)'
                    )}
                  </label>
                  <div className="cust-input-with-icon">
                    <span className="cust-input-icon" aria-hidden="true">
                      <DescriptionOutlined />
                    </span>
                    <input
                      id="customer-gstin"
                      type="text"
                      disabled={taxRegistrationType === 'non-gst'}
                      placeholder={
                        taxRegistrationType === 'gst'
                          ? 'e.g. 36AAACD1234F1Z8'
                          : 'Not required for Non-GST customers'
                      }
                      maxLength={15}
                      className={taxRegistrationType === 'non-gst' ? 'cust-input-readonly' : ''}
                      aria-invalid={Boolean(errors.gstin)}
                      aria-describedby={errors.gstin ? 'customer-gstin-err' : undefined}
                      {...register('gstin', {
                        onChange: (e) => {
                          const upper = (e.target.value || '').toUpperCase();
                          setValue('gstin', upper, { shouldValidate: true, shouldDirty: true });
                          if (upper.length >= 12) {
                            const extractedPan = upper.slice(2, 12);
                            if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(extractedPan)) {
                              const curPan = getValues('pan');
                              if (!curPan || curPan.trim() === '') {
                                setValue('pan', extractedPan, { shouldValidate: true, shouldDirty: true });
                              }
                            }
                          }
                        },
                      })}
                    />
                  </div>
                  {errors.gstin && (
                    <span id="customer-gstin-err" className="cust-field-error" role="alert">
                      {errors.gstin.message}
                    </span>
                  )}
                </div>

                <div className="cust-field">
                  <label htmlFor="customer-payment-terms">Payment Terms</label>
                  <div className="cust-input-with-icon">
                    <span className="cust-input-icon" aria-hidden="true">
                      <ReceiptLongOutlined />
                    </span>
                    <input
                      id="customer-payment-terms"
                      type="text"
                      maxLength={64}
                      placeholder="e.g. Net 30, Due on Receipt"
                      aria-invalid={Boolean(errors.paymentTerms)}
                      aria-describedby={errors.paymentTerms ? 'customer-payment-terms-err' : undefined}
                      {...register('paymentTerms')}
                    />
                  </div>
                  {errors.paymentTerms && (
                    <span id="customer-payment-terms-err" className="cust-field-error" role="alert">
                      {errors.paymentTerms.message}
                    </span>
                  )}
                </div>

              </div>
            )}

            {/* STEP 3: Address Information */}
            {currentStep === 3 && (
              <div className="cust-step-address-content">
                <div className="cust-address-group">
                  <AddressSection
                    prefix="billingAddress"
                    title="Billing Address Details"
                    register={register}
                    control={control}
                    setValue={setValue}
                    trigger={trigger}
                    getValues={getValues}
                    watch={watch}
                    errors={errors}
                    country={billingAddress?.country}
                  />
                </div>

                <div className="cust-checkbox-field">
                  <label className="cust-checkbox-label" htmlFor="same-as-billing">
                    <input
                      id="same-as-billing"
                      type="checkbox"
                      {...register('isShippingSameAsBilling', {
                        onChange: (e) => {
                          const isChecked = e.target.checked;
                          if (isChecked) {
                            copyBillingToShipping();
                          } else {
                            clearShippingAddress();
                          }
                        },
                      })}
                    />
                    <span>Shipping address is identical to billing address</span>
                  </label>
                </div>

                {!isShippingSameAsBilling && (
                  <div className="cust-address-group">
                    <AddressSection
                      key="shipping-manual-custom"
                      prefix="shippingAddress"
                      title="Shipping Address Details"
                      register={register}
                      control={control}
                      setValue={setValue}
                      trigger={trigger}
                      getValues={getValues}
                      watch={watch}
                      errors={errors}
                      disabled={false}
                      country={watchedValues.shippingAddress?.country}
                    />
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: Review & Confirm */}
            {currentStep === 4 && (
              <div className="cust-review-sections">
                {/* 1. Basic Info Review */}
                <div className="cust-review-section">
                  <div className="cust-review-section-header">
                    <h4 className="cust-review-title">Basic Information</h4>
                    <button
                      type="button"
                      className="cust-review-edit-btn"
                      onClick={() => handleStepClick(0)}
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
                      <span className="cust-review-label">Customer Type</span>
                      <span className="cust-review-value" style={{ textTransform: 'capitalize' }}>
                        {watchedValues.customerType || 'Business'}
                      </span>
                    </div>
                    <div className="cust-review-row">
                      <span className="cust-review-label">Account Status</span>
                      <span className="cust-review-value">{watchedValues.status || 'Active'}</span>
                    </div>
                    <div className="cust-review-row">
                      <span className="cust-review-label">Currency</span>
                      <span className="cust-review-value">{watchedValues.currency || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Contact Info Review */}
                <div className="cust-review-section">
                  <div className="cust-review-section-header">
                    <h4 className="cust-review-title">Contact Information</h4>
                    <button
                      type="button"
                      className="cust-review-edit-btn"
                      onClick={() => handleStepClick(1)}
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
                          ? `${watchedValues.phoneCountryCode ? watchedValues.phoneCountryCode + ' ' : ''}${watchedValues.phone}`
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
                <div className="cust-review-section">
                  <div className="cust-review-section-header">
                    <h4 className="cust-review-title">Billing &amp; Tax</h4>
                    <button
                      type="button"
                      className="cust-review-edit-btn"
                      onClick={() => handleStepClick(2)}
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
                          : 'Non-GST / Unregistered'}
                      </span>
                    </div>
                    <div className="cust-review-row">
                      <span className="cust-review-label">PAN</span>
                      <span className="cust-review-value">{watchedValues.pan || '—'}</span>
                    </div>
                    <div className="cust-review-row">
                      <span className="cust-review-label">GSTIN</span>
                      <span className="cust-review-value">
                        {watchedValues.taxRegistrationType === 'gst'
                          ? (watchedValues.gstin || '—')
                          : 'Not Applicable'}
                      </span>
                    </div>
                    <div className="cust-review-row">
                      <span className="cust-review-label">Payment Terms</span>
                      <span className="cust-review-value">{watchedValues.paymentTerms || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* 4. Address Review */}
                <div className="cust-review-section">
                  <div className="cust-review-section-header">
                    <h4 className="cust-review-title">Address Information</h4>
                    <button
                      type="button"
                      className="cust-review-edit-btn"
                      onClick={() => handleStepClick(3)}
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
                <div className="cust-field" style={{ marginTop: '12px' }}>
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
            </div>

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
                      setSlideDirection('backward');
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
                  <div className="cust-submit-group">
                    <button
                      type="button"
                      className="cust-btn cust-btn-secondary"
                      onClick={onCancel}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
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
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Right Assistant Panel */}
        <aside className="cust-wizard-aside">
          <div className="cust-quick-tips-card">
            <div className="cust-quick-tips-header">
              <div className="cust-quick-tips-icon-badge" aria-hidden="true">
                <LightbulbOutlined />
              </div>
              <div className="cust-quick-tips-header-text">
                <h3 className="cust-quick-tips-title">Quick Tips</h3>
                <span className="cust-quick-tips-badge">Step {currentStep + 1} Guidance</span>
              </div>
            </div>
            <ul className="cust-quick-tips-list">
              {(QUICK_TIPS[currentStep] || []).map((tip, idx) => (
                <li key={idx} className="cust-quick-tips-item">
                  <span className="cust-quick-tips-bullet" aria-hidden="true" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
            <div className="cust-quick-tips-spacer" />
            <div className="cust-quick-tips-footer">
              <p className="cust-quick-tips-footer-text">
                All details can be updated anytime after customer creation from the Customers directory.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CustomerForm;
