import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, Button, CircularProgress, Collapse, Switch, useMediaQuery } from '@mui/material';
import {
  Inventory2Outlined,
  ReceiptLongOutlined,
  TuneOutlined,
  ArrowBack,
  SaveOutlined,
} from '@mui/icons-material';
import {
  productValidationSchema,
  DEFAULT_PRODUCT_VALUES,
  PRODUCT_TYPES,
  CURRENCIES,
  TAX_CATEGORIES,
  STANDARD_UNITS,
} from '../validation/productValidation';
import '../styles/product-form.css';
import { useCategories, categoryError } from '../services/categoryService';
import { productService } from '../services/productService';

const getCurrencySymbol = (currency) => {
  switch (currency) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'INR':
    default:
      return '₹';
  }
};

export const getProductInitialValues = (values) => {
  if (!values) return DEFAULT_PRODUCT_VALUES;
  return {
    productCode: values.productCode || '',
    name: values.name || '',
    description: values.description || '',
    type: values.type || 'Product',
    categoryId: values.categoryId == null ? '' : String(values.categoryId),
    unit: values.unit || 'Piece',
    price: values.price !== undefined && values.price !== null ? values.price : '',
    currency: values.currency || 'INR',
    taxCategory: values.taxCategory ?? '',
    hsnSac: values.hsnSac ?? values.hsnSacCode ?? '',
    discountPercentage: values.discountPercentage ?? values.discountPercent ?? values.DiscountPercent ?? '',
    discountAllowed: values.discountAllowed !== false,
    status: values.status || 'Active',
  };
};

export function ProductForm({
  initialValues = null,
  onSubmit,
  isSubmitting = false,
  submitError = '',
  onCancel,
  mode = 'create',
}) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [loadingNextCode, setLoadingNextCode] = useState(mode === 'create' && !initialValues?.productCode);
  const [codeError, setCodeError] = useState('');
  const [codeRevision, setCodeRevision] = useState(0);
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data || [];


  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    setError,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(productValidationSchema),
    defaultValues: getProductInitialValues(initialValues),
    mode: 'onTouched',
  });

  // Re-populate when initialValues change (edit mode async loading)
  useEffect(() => {
    if (initialValues) {
      reset(getProductInitialValues(initialValues));
    }
  }, [initialValues, reset]);

  // Auto-fetch next sequential product code for create mode
  useEffect(() => {
    let isMounted = true;
    if (mode === 'create' && !initialValues?.productCode) {
      setLoadingNextCode(true);
      setCodeError('');
      productService
        .getNextProductCode()
        .then((code) => {
          if (typeof code !== 'string' || !code.trim()) throw new Error('The backend did not return a product code. Please retry.');
          if (isMounted) {
            setValue('productCode', code, { shouldValidate: true });
          }
        })
        .catch((err) => {
          if (isMounted) setCodeError(err.message || 'Unable to generate the product code. Please retry.');
        })
        .finally(() => {
          if (isMounted) setLoadingNextCode(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [mode, initialValues?.productCode, setValue, codeRevision]);

  const selectedCurrency = watch('currency') || 'INR';
  const currencySymbol = getCurrencySymbol(selectedCurrency);
  const unitPrice = Number(watch('price'));
  const discountAllowed = watch('discountAllowed');
  const customDiscount = watch('discountPercentage');
  const discountPercent = Number(customDiscount);
  const discountError = errors.discountPercentage?.message || '';
  const discountPreview = customDiscount !== '' && customDiscount != null && discountPercent >= 0 && discountPercent <= 100 && !discountError && Number.isFinite(unitPrice) && unitPrice >= 0
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: selectedCurrency }).format(unitPrice * (1 - discountPercent / 100)) : null;

  const currentCategoryId = initialValues?.categoryId;
  const categoryOptions = categories.filter(category => category.status === 'Active' || (mode === 'edit' && String(category.id) === String(currentCategoryId)));
  if (mode === 'edit' && currentCategoryId != null && !categoryOptions.some(category => String(category.id) === String(currentCategoryId))) {
    categoryOptions.push({ id: currentCategoryId, name: initialValues.category || `Category ${currentCategoryId}`, status: 'Inactive' });
  }

  const handleValidSubmit = (data) => {
    if (isSubmitting || loadingNextCode || codeError || categoriesQuery.isPending || categoriesQuery.isError) return;
    const selected = categoryOptions.find(category => String(category.id) === String(data.categoryId));
    if (!selected || (selected.status !== 'Active' && !(mode === 'edit' && String(selected.id) === String(currentCategoryId)))) {
      setError('categoryId', { message: 'Select an active category.' });
      return;
    }
    const payload = {
      ...data,
      ...(initialValues?.rowVersion != null ? { rowVersion: initialValues.rowVersion } : {}),
      productCode: mode === 'edit' ? initialValues?.productCode : data.productCode,
      name: data.name?.trim(),
      description: data.description?.trim() || '',
      categoryId: Number(data.categoryId),
      category: selected.name,
      unit: data.unit?.trim(),
      price: Number(data.price) || 0,
      currency: data.currency || 'INR',
      taxCategory: data.taxCategory ?? '',
      hsnSac: data.hsnSac?.trim() || '',
      discountAllowed: Boolean(data.discountAllowed),
      discountPercentage: data.discountAllowed ? Number(data.discountPercentage) : 0,
      status: data.status || 'Active',
    };
    onSubmit(payload);
  };

  return (
    <div className="product-form-container">
      {categoriesQuery.isPending && <Alert severity="info">Loading categories...</Alert>}
      {codeError && <Alert severity="error" action={<Button disabled={loadingNextCode} onClick={() => setCodeRevision(value => value + 1)}>Retry</Button>}>{codeError}</Alert>}
      {categoriesQuery.isError && <Alert severity="error" action={<Button onClick={() => categoriesQuery.refetch()}>Retry</Button>}>{categoryError(categoriesQuery.error)}</Alert>}
      {!categoriesQuery.isPending && !categoriesQuery.isError && !categoryOptions.length && <Alert severity="info">No active categories are available. Activate or add a category before saving a product.</Alert>}
      {submitError && (
        <div className="product-alert product-alert-error" role="alert">
          <span>⚠️ {submitError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(handleValidSubmit)} className="product-form-panel" noValidate>
        {/* SECTION 1: Product Information */}
        <div className="product-form-section">
          <div className="product-section-header">
            <span className="product-section-icon" aria-hidden="true">
              <Inventory2Outlined fontSize="small" />
            </span>
            <div>
              <h3 className="product-section-title">Product Information</h3>
              <p className="product-section-subtitle">
                Core identification details for your product or service
              </p>
            </div>
          </div>

          <div className="product-form-grid">
            {/* Product Code */}
            <div className="product-form-field">
              <label htmlFor="productCode" className="product-field-label">
                Product Code
                {mode === 'create' && (
                  <span className="product-field-badge">
                    {loadingNextCode ? 'Generating…' : 'Auto-assigned'}
                  </span>
                )}
              </label>
              <input
                id="productCode"
                type="text"
                readOnly={mode === 'create' || Boolean(initialValues?.productCode)}
                tabIndex={-1}
                placeholder={loadingNextCode ? 'Generating code…' : 'e.g. PRD-8'}
                className={`product-input is-readonly ${errors.productCode ? 'has-error' : ''}`}
                aria-invalid={Boolean(errors.productCode)}
                aria-describedby={errors.productCode ? 'productCode-err' : undefined}
                {...register('productCode')}
              />
              {errors.productCode && (
                <span id="productCode-err" className="product-field-error" role="alert">
                  {errors.productCode.message}
                </span>
              )}
            </div>

            {/* Product Name */}
            <div className="product-form-field">
              <label htmlFor="productName" className="product-field-label">
                Product Name <span className="product-field-required">*</span>
              </label>
              <input
                id="productName"
                type="text"
                placeholder="e.g. Wireless Keyboard"
                className={`product-input ${errors.name ? 'has-error' : ''}`}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'productName-err' : undefined}
                {...register('name')}
              />
              {errors.name && (
                <span id="productName-err" className="product-field-error" role="alert">
                  {errors.name.message}
                </span>
              )}
            </div>

            {/* Product Type */}
            <div className="product-form-field">
              <label htmlFor="productType" className="product-field-label">
                Product Type <span className="product-field-required">*</span>
              </label>
              <select
                id="productType"
                className={`product-select ${errors.type ? 'has-error' : ''}`}
                aria-invalid={Boolean(errors.type)}
                {...register('type')}
              >
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {errors.type && (
                <span className="product-field-error" role="alert">
                  {errors.type.message}
                </span>
              )}
            </div>

            {/* Category */}
            <div className="product-form-field">
              <label htmlFor="productCategory" className="product-field-label">
                Category <span className="product-field-required">*</span>
              </label>
              <select
                disabled={categoriesQuery.isPending || categoriesQuery.isError}
                id="productCategory"
                className={`product-select ${errors.categoryId ? 'has-error' : ''}`}
                aria-invalid={Boolean(errors.categoryId)}
                aria-describedby={errors.categoryId ? 'productCategory-err' : undefined}
                {...register('categoryId')}
              >
                <option value="">Select Category</option>
                {categoryOptions.map((cat) => (
                  <option key={cat.id} value={String(cat.id)} disabled={cat.status !== 'Active'}>
                    {cat.name}{cat.status !== 'Active' ? ' (Inactive)' : ''}
                  </option>
                ))}
              </select>
              {errors.categoryId && (
                <span id="productCategory-err" className="product-field-error" role="alert">
                  {errors.categoryId.message}
                </span>
              )}
            </div>

            {/* Description */}
            <div className="product-form-field product-form-full">
              <label htmlFor="productDescription" className="product-field-label">
                Description
              </label>
              <textarea
                id="productDescription"
                rows={3}
                placeholder="Add product specifications, warranty details, or billing notes..."
                className={`product-textarea ${errors.description ? 'has-error' : ''}`}
                aria-invalid={Boolean(errors.description)}
                aria-describedby={errors.description ? 'productDescription-err' : undefined}
                {...register('description')}
              />
              {errors.description && (
                <span id="productDescription-err" className="product-field-error" role="alert">
                  {errors.description.message}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 2: Pricing & Tax */}
        <div className="product-form-section">
          <div className="product-section-header">
            <span className="product-section-icon" aria-hidden="true">
              <ReceiptLongOutlined fontSize="small" />
            </span>
            <div>
              <h3 className="product-section-title">Pricing &amp; Tax</h3>
              <p className="product-section-subtitle">
                Set base pricing, unit of measurement, and GST tax classifications
              </p>
            </div>
          </div>

          <div className="product-form-grid">
            {/* Unit */}
            <div className="product-form-field">
              <label htmlFor="productUnit" className="product-field-label">
                Unit of Measurement <span className="product-field-required">*</span>
              </label>
              <select
                id="productUnit"
                className={`product-select ${errors.unit ? 'has-error' : ''}`}
                aria-invalid={Boolean(errors.unit)}
                {...register('unit')}
              >
                {initialValues?.unit && !STANDARD_UNITS.includes(initialValues.unit) && <option value={initialValues.unit}>{initialValues.unit}</option>}
                {STANDARD_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              {errors.unit && (
                <span className="product-field-error" role="alert">
                  {errors.unit.message}
                </span>
              )}
            </div>

            {/* Price */}
            <div className="product-form-field">
              <label htmlFor="productPrice" className="product-field-label">
                Unit Price ({currencySymbol}) <span className="product-field-required">*</span>
              </label>
              <div className="product-input-group">
                <span className="product-input-prefix">{currencySymbol}</span>
                <input
                  id="productPrice"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  className={`product-input has-prefix ${errors.price ? 'has-error' : ''}`}
                  aria-invalid={Boolean(errors.price)}
                  aria-describedby={errors.price ? 'productPrice-err' : undefined}
                  {...register('price')}
                />
              </div>
              {errors.price && (
                <span id="productPrice-err" className="product-field-error" role="alert">
                  {errors.price.message}
                </span>
              )}
            </div>

            {/* Currency */}
            <div className="product-form-field">
              <label htmlFor="productCurrency" className="product-field-label">
                Billing Currency
              </label>
              <select
                id="productCurrency"
                className={`product-select ${errors.currency ? 'has-error' : ''}`}
                aria-invalid={Boolean(errors.currency)}
                {...register('currency')}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c} ({getCurrencySymbol(c)})
                  </option>
                ))}
              </select>
              {errors.currency && (
                <span className="product-field-error" role="alert">
                  {errors.currency.message}
                </span>
              )}
            </div>

            {/* Tax Category */}
            <div className="product-form-field">
              <label htmlFor="productTaxCategory" className="product-field-label">
                Tax Category
              </label>
              <select
                id="productTaxCategory"
                className={`product-select ${errors.taxCategory ? 'has-error' : ''}`}
                aria-invalid={Boolean(errors.taxCategory)}
                {...register('taxCategory')}
              >
                <option value="">Not set</option>
                {TAX_CATEGORIES.map((tax) => (
                  <option key={tax} value={tax}>
                    {tax}
                  </option>
                ))}
              </select>
              {errors.taxCategory && (
                <span className="product-field-error" role="alert">
                  {errors.taxCategory.message}
                </span>
              )}
            </div>

            {/* HSN/SAC */}
            <div className="product-form-field">
              <label htmlFor="productHsnSac" className="product-field-label">
                HSN / SAC Code
              </label>
              <input
                id="productHsnSac"
                type="text"
                placeholder="e.g. 84713010 or 998313"
                className={`product-input ${errors.hsnSac ? 'has-error' : ''}`}
                aria-invalid={Boolean(errors.hsnSac)}
                aria-describedby={errors.hsnSac ? 'productHsnSac-err' : undefined}
                {...register('hsnSac')}
              />
              {errors.hsnSac && (
                <span id="productHsnSac-err" className="product-field-error" role="alert">
                  {errors.hsnSac.message}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 3: Settings */}
        <div className="product-form-section">
          <div className="product-section-header">
            <span className="product-section-icon" aria-hidden="true">
              <TuneOutlined fontSize="small" />
            </span>
            <div>
              <h3 className="product-section-title">Settings</h3>
              <p className="product-section-subtitle">
                Availability, discounts, and item catalog status
              </p>
            </div>
          </div>

          <div className="product-form-grid">
            {/* Discount Allowed */}
            <div className="product-form-field">
              <div className="product-switch-field">
                <div className="product-switch-info">
                  <label htmlFor="productDiscountAllowed" className="product-switch-title">Discount Allowed</label>
                  <span id="product-discount-description" className="product-switch-desc">
                    Permit discounts on this item during invoice creation
                  </span>
                </div>
                <Controller
                  name="discountAllowed"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="productDiscountAllowed"
                      className="product-discount-switch"
                      name={field.name}
                      inputRef={field.ref}
                      onBlur={field.onBlur}
                      disabled={isSubmitting}
                      inputProps={{ 'aria-describedby': 'product-discount-description' }}
                      checked={Boolean(field.value)}
                      onChange={(e) => {
                        field.onChange(e.target.checked);
                        if (!e.target.checked) setValue('discountPercentage', 0, { shouldValidate: true, shouldDirty: true });
                      }}
                      color="primary"
                    />
                  )}
                />
              </div>
              <Collapse in={Boolean(discountAllowed)} timeout={reduceMotion ? 0 : 220} unmountOnExit>
              <div className="product-custom-discount">
                <label htmlFor="productCustomDiscount" className="product-field-label">Discount (%) <span className="product-field-required">*</span></label>
                <input id="productCustomDiscount" type="number" min="0" max="100" step="any" inputMode="decimal"
                  className={`product-input ${discountError ? 'has-error' : ''}`} placeholder="e.g. 10"
                  disabled={isSubmitting || !discountAllowed} required aria-required="true" {...register('discountPercentage')}
                  aria-invalid={Boolean(discountError)} aria-describedby="product-discount-note product-discount-feedback" />
                <span id="product-discount-note" className="product-switch-desc">Enter 0 if there is no discount. This percentage is saved with the product.</span>
                <div id="product-discount-feedback" aria-live="polite">
                  {discountError ? <span className="product-field-error">{discountError}</span>
                    : discountPreview && <span className="product-discount-total">Price after discount: <strong>{discountPreview}</strong> <span>(before tax)</span></span>}
                </div>
              </div>
              </Collapse>
            </div>

            {/* Status */}
            <div className="product-form-field">
              <label htmlFor="productStatus" className="product-field-label">
                Status
              </label>
              <select
                id="productStatus"
                className={`product-select ${errors.status ? 'has-error' : ''}`}
                aria-invalid={Boolean(errors.status)}
                {...register('status')}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
              {errors.status && (
                <span className="product-field-error" role="alert">
                  {errors.status.message}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Form Action Controls */}
        <div className="product-form-actions">
          <Button
            type="button"
            variant="outlined"
            onClick={onCancel}
            disabled={isSubmitting}
            className="product-btn-cancel"
            startIcon={<ArrowBack />}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || loadingNextCode || Boolean(codeError) || categoriesQuery.isPending || categoriesQuery.isError}
            className="product-btn-submit"
            startIcon={
              isSubmitting ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <SaveOutlined />
              )
            }
          >
            {isSubmitting
              ? mode === 'edit'
                ? 'Saving Changes...'
                : 'Creating Product...'
              : mode === 'edit'
              ? 'Update Product'
              : 'Save Product'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default ProductForm;
