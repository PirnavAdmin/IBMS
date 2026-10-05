import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  ArrowBack,
  Add,
  DeleteOutline,
  Receipt,
  Send,
  Save,
  CheckCircle,
  Visibility,
  AccountBalance,
  PersonOutline,
  Inventory2Outlined,
} from '@mui/icons-material';
import { customerApi, productApi, numberingApi, financialApi, invoiceApi } from 'billing-api-client';
import {
  invoiceValidationSchema,
  DEFAULT_INVOICE_VALUES,
  DEFAULT_INVOICE_ITEM,
} from './validation/invoiceValidation';
import { InvoicePreviewModal } from '../Invoices/components/InvoicePreviewModal';
import '../../styles/CreateInvoice.css';

export const CreateInvoice = ({ mode = 'create' }) => {
  const navigate = useNavigate();
  const { id: editInvoiceId } = useParams();
  const isEdit = mode === 'edit' || Boolean(editInvoiceId);

  const [loadingInitial, setLoadingInitial] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [calculatingTotals, setCalculatingTotals] = useState(false);

  // Master Data
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingMasterData, setLoadingMasterData] = useState(true);

  // Authoritative Totals from Backend Calculation Engine
  const [calculatedTotals, setCalculatedTotals] = useState(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(invoiceValidationSchema),
    defaultValues: DEFAULT_INVOICE_VALUES,
    mode: 'onTouched',
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const watchedValues = watch();
  const watchedItems = watch('items');
  const watchedInvoiceDiscountType = watch('invoiceDiscountType');
  const watchedInvoiceDiscountValue = watch('invoiceDiscountValue');
  const watchedShippingFee = watch('shippingFee');
  const watchedCurrency = watch('currency') || 'INR';

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Fetch Customers & Products from Real Master Data APIs
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [custRes, prodRes] = await Promise.allSettled([
          customerApi.getCustomers ? customerApi.getCustomers({ pageSize: 100 }) : customerApi.getAll ? customerApi.getAll() : [],
          productApi.getProducts({ pageSize: 100 }),
        ]);

        if (isMounted) {
          if (custRes.status === 'fulfilled') {
            const cData = custRes.value?.items || custRes.value?.data || custRes.value || [];
            setCustomers(Array.isArray(cData) ? cData : []);
          }
          if (prodRes.status === 'fulfilled') {
            const pData = prodRes.value?.items || prodRes.value?.data || prodRes.value || [];
            setProducts(Array.isArray(pData) ? pData : []);
          }
        }
      } catch (e) {
        console.warn('Master data load warning:', e);
      } finally {
        if (isMounted) setLoadingMasterData(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Fetch Next Sequential Invoice Number for Create Mode
  useEffect(() => {
    let isMounted = true;
    if (!isEdit) {
      numberingApi
        .generateNumber({ documentType: 'Invoice' })
        .then((res) => {
          if (isMounted && res?.generatedNumber) {
            setValue('invoiceNumber', res.generatedNumber, { shouldValidate: true });
          }
        })
        .catch(() => {
          if (isMounted) {
            // Fallback default sequential candidate
            setValue('invoiceNumber', `INV-${Date.now().toString().slice(-4)}`);
          }
        });
    }
    return () => {
      isMounted = false;
    };
  }, [isEdit, setValue]);

  // 3. Load existing invoice in Edit Mode
  useEffect(() => {
    if (isEdit && editInvoiceId) {
      setLoadingInitial(true);
      invoiceApi
        .getInvoiceById(editInvoiceId)
        .then((inv) => {
          reset({
            ...DEFAULT_INVOICE_VALUES,
            ...inv,
            customerId: String(inv.customerId || (typeof inv.customer === 'object' ? inv.customer?.id : '') || ''),
            customerName: typeof inv.customerName === 'string' && inv.customerName ? inv.customerName : (typeof inv.customer === 'string' ? inv.customer : (inv.customer?.companyName || inv.customer?.name || '')),
            customerEmail: typeof inv.customerEmail === 'string' ? inv.customerEmail : (typeof inv.customer === 'object' ? (inv.customer?.email || '') : (inv.email || '')),
            customerPhone: typeof inv.customerPhone === 'string' ? inv.customerPhone : (typeof inv.customer === 'object' ? (inv.customer?.phone || '') : ''),
            customerGstin: typeof inv.customerGstin === 'string' ? inv.customerGstin : (typeof inv.customer === 'object' ? (inv.customer?.taxId || inv.customer?.gstin || '') : (inv.gstin || '')),
            billingAddress: typeof inv.billingAddress === 'string' ? inv.billingAddress : (typeof inv.customer === 'object' ? (typeof inv.customer?.billingAddress === 'string' ? inv.customer.billingAddress : (inv.customer?.billingAddress?.addressLine1 || inv.customer?.address || '')) : (inv.address || '')),
            invoiceNumber: inv.invoiceNumber || inv.id || '',
            invoiceDate: (inv.invoiceDate || inv.issueDate || '').slice(0, 10),
            dueDate: (inv.dueDate || '').slice(0, 10),
            currency: inv.currency || 'INR',
            items: Array.isArray(inv.items) && inv.items.length > 0 ? inv.items : [{ ...DEFAULT_INVOICE_ITEM }],
            shippingFee: Number(inv.chargesAmount || inv.shippingFee || 0),
            invoiceDiscountValue: Number(inv.discountAmount || 0),
          });
        })
        .catch((err) => {
          showToast(err.message || 'Failed to load invoice for editing.');
        })
        .finally(() => {
          setLoadingInitial(false);
        });
    }
  }, [isEdit, editInvoiceId, reset]);

  // 4. Handle Customer Selection & Auto-fill
  const handleCustomerChange = (e) => {
    const custId = e.target.value;
    setValue('customerId', custId, { shouldValidate: true });

    const selectedCust = customers.find((c) => String(c.id) === String(custId) || String(c.customerId) === String(custId));
    if (selectedCust) {
      setValue('customerName', selectedCust.name || selectedCust.customerName || '', { shouldValidate: true });
      setValue('customerEmail', selectedCust.email || selectedCust.customerEmail || '', { shouldValidate: true });
      setValue('customerPhone', selectedCust.phone || selectedCust.mobile || '');
      setValue('customerGstin', selectedCust.gstin || selectedCust.taxId || '');

      const addr = selectedCust.billingAddress
        ? typeof selectedCust.billingAddress === 'object'
          ? [selectedCust.billingAddress.street, selectedCust.billingAddress.city, selectedCust.billingAddress.state, selectedCust.billingAddress.postalCode].filter(Boolean).join(', ')
          : String(selectedCust.billingAddress)
        : selectedCust.address || '';
      setValue('billingAddress', addr);

      if (selectedCust.currency) setValue('currency', selectedCust.currency);
      if (selectedCust.paymentTerms) setValue('paymentTerms', selectedCust.paymentTerms);
    }
  };

  // 5. Product Selection Auto-fill on Line Item
  const handleProductSelect = (index, productId) => {
    const prod = products.find((p) => String(p.id) === String(productId));
    if (prod) {
      setValue(`items.${index}.productId`, String(prod.id));
      setValue(`items.${index}.description`, prod.name || prod.description || '');
      setValue(`items.${index}.unitPrice`, Number(prod.price || 0), { shouldValidate: true });
      setValue(`items.${index}.unit`, prod.unit || 'Piece');
      if (prod.hsnSac) setValue(`items.${index}.hsnSac`, prod.hsnSac);

      // Tax rate from taxCategory if available
      if (prod.taxCategory) {
        const rateMatch = String(prod.taxCategory).match(/\b(\d+)\s*%/);
        if (rateMatch) {
          setValue(`items.${index}.taxPercent`, Number(rateMatch[1]));
        }
      }
    }
  };

  // 6. Authoritative Totals via Backend Financial Calculation Engine
  useEffect(() => {
    const validItems = (watchedItems || []).filter(
      (item) => item && (item.description || item.unitPrice > 0)
    );

    if (validItems.length === 0) {
      setCalculatedTotals(null);
      return;
    }

    const payload = {
      currency: watchedCurrency || 'INR',
      items: validItems.map((item) => ({
        name: item.description || 'Item',
        unitPrice: Number(item.unitPrice || 0),
        quantity: Number(item.quantity || 1),
        lineDiscountType: item.discountType === 'percentage' ? 'Percentage' : 'Fixed',
        lineDiscountValue: Number(item.discountValue || 0),
        taxRatePercent: Number(item.taxPercent || 0),
      })),
      invoiceDiscount: watchedInvoiceDiscountValue > 0 ? {
        discountType: watchedInvoiceDiscountType === 'percentage' ? 'Percentage' : 'Fixed',
        value: Number(watchedInvoiceDiscountValue || 0),
      } : null,
      charges: watchedShippingFee > 0 ? [{
        name: 'Shipping & Handling',
        amount: Number(watchedShippingFee || 0),
        chargeType: 'Shipping',
        calculationType: 'Fixed',
        isTaxable: false,
      }] : null,
    };

    let isCurrent = true;
    setCalculatingTotals(true);

    financialApi
      .calculate(payload)
      .then((res) => {
        if (isCurrent && res) {
          setCalculatedTotals(res);
        }
      })
      .catch((err) => {
        // Fallback to client-side formula if calculation endpoint times out
        if (isCurrent) {
          const rawSubtotal = validItems.reduce((acc, i) => acc + (Number(i.quantity || 1) * Number(i.unitPrice || 0)), 0);
          const rawDiscount = watchedInvoiceDiscountType === 'percentage'
            ? (rawSubtotal * Number(watchedInvoiceDiscountValue || 0)) / 100
            : Number(watchedInvoiceDiscountValue || 0);
          const rawTaxable = Math.max(0, rawSubtotal - rawDiscount);
          const rawTax = validItems.reduce((acc, i) => {
            const lineSub = Number(i.quantity || 1) * Number(i.unitPrice || 0);
            return acc + (lineSub * Number(i.taxPercent || 18)) / 100;
          }, 0);
          const rawGrand = rawTaxable + rawTax + Number(watchedShippingFee || 0);

          setCalculatedTotals({
            grossSubtotal: rawSubtotal,
            totalLineDiscounts: 0,
            netItemSubtotal: rawSubtotal,
            invoiceDiscountAmount: rawDiscount,
            taxableSubtotal: rawTaxable,
            totalTaxes: rawTax,
            chargesTotal: Number(watchedShippingFee || 0),
            grandTotal: rawGrand,
          });
        }
      })
      .finally(() => {
        if (isCurrent) setCalculatingTotals(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [
    JSON.stringify(watchedItems),
    watchedInvoiceDiscountType,
    watchedInvoiceDiscountValue,
    watchedShippingFee,
    watchedCurrency,
  ]);

  // Fallback figures
  const subtotal = calculatedTotals?.grossSubtotal ?? (watchedItems || []).reduce((acc, item) => acc + (Number(item?.quantity || 1) * Number(item?.unitPrice || 0)), 0);
  const discountAmount = calculatedTotals?.invoiceDiscountAmount ?? ((subtotal * Number(watchedInvoiceDiscountValue || 0)) / 100);
  const taxAmount = calculatedTotals?.totalTaxes ?? (watchedItems || []).reduce((acc, item) => acc + ((Number(item?.quantity || 1) * Number(item?.unitPrice || 0) * Number(item?.taxPercent || 18)) / 100), 0);
  const shippingCharge = Number(watchedShippingFee || 0);
  const grandTotal = calculatedTotals?.grandTotal ?? Math.max(0, subtotal - discountAmount + taxAmount + shippingCharge);

  // Form Submission
  const processSubmit = async (formData, targetStatus) => {
    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        status: targetStatus,
        subtotal,
        discountAmount,
        taxAmount,
        chargesAmount: shippingCharge,
        totalAmount: grandTotal,
        balanceAmount: grandTotal,
        paidAmount: 0,
        items: formData.items.map((item) => ({
          ...item,
          productId: item.productId ? Number(item.productId) : null,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discountValue: Number(item.discountValue || 0),
          taxPercent: Number(item.taxPercent || 0),
        })),
      };

      if (isEdit) {
        await invoiceApi.updateInvoice(editInvoiceId, payload);
        showToast(`Invoice ${formData.invoiceNumber} updated successfully!`);
      } else {
        await invoiceApi.createInvoice(payload);
        showToast(
          targetStatus === 'Issued'
            ? `Invoice ${formData.invoiceNumber} created and issued successfully!`
            : `Invoice ${formData.invoiceNumber} saved as draft!`
        );
      }

      setTimeout(() => {
        navigate('/invoices');
      }, 1200);
    } catch (err) {
      showToast(err.message || 'Failed to save invoice. Please review your entries.');
      setIsSubmitting(false);
    }
  };

  const onSaveDraft = (e) => {
    e.preventDefault();
    handleSubmit((data) => processSubmit(data, 'Draft'))();
  };

  const onIssueInvoice = (e) => {
    e.preventDefault();
    handleSubmit((data) => processSubmit(data, 'Issued'))();
  };

  if (loadingInitial) {
    return (
      <div className="ci-page-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <CircularProgress sx={{ color: '#70472f' }} />
        <span style={{ marginLeft: '12px', color: '#543420' }}>Loading invoice details...</span>
      </div>
    );
  }

  return (
    <div className="ci-page-wrapper">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="ci-toast-alert">
          <CheckCircle sx={{ fontSize: 18, color: '#9A4F2F' }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="ci-navbar glass-card">
        <div className="ci-nav-left">
          <button className="ci-back-btn" onClick={() => navigate('/invoices')}>
            <ArrowBack sx={{ fontSize: 18 }} />
            <span>Invoices</span>
          </button>
          <div className="ci-brand-badge">
            <span className="ci-brand-symbol">◈</span>
            <span className="ci-brand-title">invoice.billing</span>
          </div>
          <span className="ci-nav-divider">/</span>
          <span className="ci-nav-current">{isEdit ? 'Edit Invoice' : 'New Invoice'}</span>
        </div>

        <div className="ci-nav-right">
          <button className="ci-btn-discard" type="button" onClick={() => navigate('/invoices')}>
            Discard
          </button>
          <button
            className="ci-btn-draft"
            type="button"
            onClick={() => setPreviewOpen(true)}
            style={{ backgroundColor: '#ffffff', color: '#70472f', border: '1px solid #ebdccb' }}
          >
            <Visibility sx={{ fontSize: 16 }} />
            <span>Preview</span>
          </button>
          <button className="ci-btn-draft" type="button" onClick={onSaveDraft} disabled={isSubmitting}>
            <Save sx={{ fontSize: 16 }} />
            <span>Save Draft</span>
          </button>
          <button className="ci-btn-send" type="button" onClick={onIssueInvoice} disabled={isSubmitting}>
            <Send sx={{ fontSize: 16 }} />
            <span>{isSubmitting ? 'Processing...' : 'Issue & Send'}</span>
          </button>
        </div>
      </header>

      {/* Form Content */}
      <main className="ci-main-content">
        <form onSubmit={(e) => e.preventDefault()} noValidate>
          {/* SECTION 1: INVOICE IDENTIFIERS & METADATA */}
          <div className="ci-card glass-card">
            <div className="ci-card-header">
              <Receipt sx={{ color: '#9A4F2F' }} />
              <h3>Invoice Details</h3>
            </div>
            <div className="ci-form-grid">
              <div className="ci-field">
                <label htmlFor="invoiceNumber">Invoice Number <span style={{ color: '#b33927' }}>*</span></label>
                <input
                  id="invoiceNumber"
                  type="text"
                  placeholder="e.g. INV-2026-0001"
                  className={errors.invoiceNumber ? 'ci-input-error' : ''}
                  {...register('invoiceNumber')}
                />
                {errors.invoiceNumber && <span className="ci-error-text">{errors.invoiceNumber.message}</span>}
              </div>

              <div className="ci-field">
                <label htmlFor="invoiceDate">Invoice Date <span style={{ color: '#b33927' }}>*</span></label>
                <input
                  id="invoiceDate"
                  type="date"
                  className={errors.invoiceDate ? 'ci-input-error' : ''}
                  {...register('invoiceDate')}
                />
                {errors.invoiceDate && <span className="ci-error-text">{errors.invoiceDate.message}</span>}
              </div>

              <div className="ci-field">
                <label htmlFor="dueDate">Due Date <span style={{ color: '#b33927' }}>*</span></label>
                <input
                  id="dueDate"
                  type="date"
                  className={errors.dueDate ? 'ci-input-error' : ''}
                  {...register('dueDate')}
                />
                {errors.dueDate && <span className="ci-error-text">{errors.dueDate.message}</span>}
              </div>

              <div className="ci-field">
                <label htmlFor="paymentTerms">Payment Terms</label>
                <select id="paymentTerms" {...register('paymentTerms')}>
                  <option value="Due on Receipt">Due on Receipt</option>
                  <option value="Net 15">Net 15</option>
                  <option value="Net 30">Net 30</option>
                  <option value="Net 45">Net 45</option>
                  <option value="Net 60">Net 60</option>
                </select>
              </div>

              <div className="ci-field">
                <label htmlFor="poNumber">PO Number (Optional)</label>
                <input
                  id="poNumber"
                  type="text"
                  placeholder="e.g. PO-8921"
                  {...register('poNumber')}
                />
              </div>

              <div className="ci-field">
                <label htmlFor="currency">Currency</label>
                <input
                  id="currency"
                  type="text"
                  readOnly
                  value="INR (₹) - Indian Rupee"
                  style={{ backgroundColor: '#fcfbf9', cursor: 'not-allowed' }}
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: CUSTOMER SELECTION */}
          <div className="ci-card glass-card">
            <div className="ci-card-header">
              <PersonOutline sx={{ color: '#9A4F2F' }} />
              <h3>Billed To (Customer)</h3>
            </div>
            <div className="ci-form-grid">
              <div className="ci-field ci-field-full">
                <label htmlFor="customerSelect">
                  Select Existing Customer <span style={{ color: '#b33927' }}>*</span>
                </label>
                <select
                  id="customerSelect"
                  value={watch('customerId') || ''}
                  onChange={handleCustomerChange}
                  className={errors.customerId ? 'ci-input-error' : ''}
                >
                  <option value="">-- Choose Customer from Directory --</option>
                  {customers.map((c) => (
                    <option key={c.id || c.customerId} value={c.id || c.customerId}>
                      {c.name || c.customerName} ({c.customerCode || c.email || 'No Code'})
                    </option>
                  ))}
                </select>
                {errors.customerId && <span className="ci-error-text">{errors.customerId.message}</span>}
                {customers.length === 0 && !loadingMasterData && (
                  <span style={{ fontSize: '0.8rem', color: '#8c7d71', marginTop: '4px' }}>
                    No customers found in master data. You can register a new customer in the Customers module.
                  </span>
                )}
              </div>

              <div className="ci-field">
                <label htmlFor="customerEmail">Email Address</label>
                <input
                  id="customerEmail"
                  type="email"
                  placeholder="billing@customer.com"
                  {...register('customerEmail')}
                />
                {errors.customerEmail && <span className="ci-error-text">{errors.customerEmail.message}</span>}
              </div>

              <div className="ci-field">
                <label htmlFor="customerPhone">Phone Number</label>
                <input
                  id="customerPhone"
                  type="text"
                  placeholder="+91 98490 12345"
                  {...register('customerPhone')}
                />
              </div>

              <div className="ci-field">
                <label htmlFor="customerGstin">GSTIN / Tax ID</label>
                <input
                  id="customerGstin"
                  type="text"
                  placeholder="e.g. 37AAAAA0000A1Z5"
                  {...register('customerGstin')}
                />
              </div>

              <div className="ci-field">
                <label htmlFor="billingAddress">Billing Address</label>
                <input
                  id="billingAddress"
                  type="text"
                  placeholder="Full business or billing address"
                  {...register('billingAddress')}
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: DYNAMIC LINE ITEMS GRID */}
          <div className="ci-card glass-card">
            <div className="ci-card-header" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Inventory2Outlined sx={{ color: '#9A4F2F' }} />
                <h3>Line Items & Services</h3>
              </div>
              <button
                type="button"
                className="ci-btn-add-item"
                onClick={() => append({ ...DEFAULT_INVOICE_ITEM, id: `item-${Date.now()}` })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: '#70472f',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                }}
              >
                <Add fontSize="small" /> Add Line Item
              </button>
            </div>

            {errors.items?.message && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {errors.items.message}
              </Alert>
            )}

            <div className="ci-table-responsive" style={{ overflowX: 'auto' }}>
              <table className="ci-items-table" style={{ width: '100%', minWidth: '780px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>Product / Description</th>
                    <th style={{ width: '12%' }}>HSN/SAC</th>
                    <th style={{ width: '10%' }}>Qty</th>
                    <th style={{ width: '14%' }}>Unit Price (₹)</th>
                    <th style={{ width: '14%' }}>Discount</th>
                    <th style={{ width: '10%' }}>Tax Rate</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>Total</th>
                    <th style={{ width: '4%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, idx) => {
                    const rowQty = Number(watchedItems?.[idx]?.quantity || 1);
                    const rowRate = Number(watchedItems?.[idx]?.unitPrice || 0);
                    const rowTax = Number(watchedItems?.[idx]?.taxPercent || 18);
                    const rowDiscVal = Number(watchedItems?.[idx]?.discountValue || 0);
                    const rowDiscType = watchedItems?.[idx]?.discountType || 'percentage';

                    const gross = rowQty * rowRate;
                    const discountAmt = rowDiscType === 'percentage' ? (gross * rowDiscVal) / 100 : rowDiscVal;
                    const taxable = Math.max(0, gross - discountAmt);
                    const lineTotal = taxable + (taxable * rowTax) / 100;

                    return (
                      <tr key={field.id}>
                        <td>
                          {products.length > 0 && (
                            <select
                              style={{ marginBottom: '6px', fontSize: '0.82rem', padding: '4px' }}
                              onChange={(e) => handleProductSelect(idx, e.target.value)}
                              defaultValue=""
                            >
                              <option value="">-- Choose from Catalog --</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} (₹{p.price})
                                </option>
                              ))}
                            </select>
                          )}
                          <input
                            type="text"
                            placeholder="Item description or service details *"
                            className={errors.items?.[idx]?.description ? 'ci-input-error' : ''}
                            {...register(`items.${idx}.description`)}
                          />
                          {errors.items?.[idx]?.description && (
                            <span className="ci-error-text">{errors.items[idx].description.message}</span>
                          )}
                        </td>

                        <td>
                          <input
                            type="text"
                            placeholder="e.g. 998311"
                            {...register(`items.${idx}.hsnSac`)}
                          />
                        </td>

                        <td>
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            className={errors.items?.[idx]?.quantity ? 'ci-input-error' : ''}
                            {...register(`items.${idx}.quantity`)}
                          />
                          {errors.items?.[idx]?.quantity && (
                            <span className="ci-error-text">{errors.items[idx].quantity.message}</span>
                          )}
                        </td>

                        <td>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            className={errors.items?.[idx]?.unitPrice ? 'ci-input-error' : ''}
                            {...register(`items.${idx}.unitPrice`)}
                          />
                          {errors.items?.[idx]?.unitPrice && (
                            <span className="ci-error-text">{errors.items[idx].unitPrice.message}</span>
                          )}
                        </td>

                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              style={{ width: '65%' }}
                              {...register(`items.${idx}.discountValue`)}
                            />
                            <select style={{ width: '35%', padding: '2px' }} {...register(`items.${idx}.discountType`)}>
                              <option value="percentage">%</option>
                              <option value="fixed">₹</option>
                            </select>
                          </div>
                        </td>

                        <td>
                          <select {...register(`items.${idx}.taxPercent`)}>
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                            <option value="28">28%</option>
                          </select>
                        </td>

                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          ₹{lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="ci-btn-delete"
                            onClick={() => remove(idx)}
                            disabled={fields.length <= 1}
                            aria-label="Remove item"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b33927' }}
                          >
                            <DeleteOutline fontSize="small" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 4: DISCOUNTS, CHARGES, AND TOTALS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', marginTop: '24px' }}>
            <div className="ci-card glass-card">
              <div className="ci-card-header">
                <h3>Notes & Terms</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="ci-field">
                  <label htmlFor="notes">Client Notes</label>
                  <textarea
                    id="notes"
                    rows={3}
                    placeholder="Enter notes visible to the customer..."
                    {...register('notes')}
                  />
                </div>
                <div className="ci-field">
                  <label htmlFor="termsAndConditions">Terms & Conditions</label>
                  <textarea
                    id="termsAndConditions"
                    rows={3}
                    placeholder="Late payment policy, warranty, disputes..."
                    {...register('termsAndConditions')}
                  />
                </div>
              </div>
            </div>

            <div className="ci-card glass-card">
              <div className="ci-card-header" style={{ justifyContent: 'space-between' }}>
                <h3>Financial Summary</h3>
                {calculatingTotals && (
                  <span style={{ fontSize: '0.75rem', color: '#70472f', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CircularProgress size={12} color="inherit" /> Synchronizing...
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>Gross Subtotal</span>
                  <strong>₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.9rem' }}>Invoice Discount</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', maxWidth: '160px' }}>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="ci-summary-input"
                      style={{ width: '85px', textAlign: 'right' }}
                      {...register('invoiceDiscountValue')}
                    />
                    <select
                      className="ci-summary-select"
                      {...register('invoiceDiscountType')}
                    >
                      <option value="percentage">%</option>
                      <option value="fixed">₹</option>
                    </select>
                  </div>
                </div>

                {discountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#2e7d32' }}>
                    <span>Discount Deducted</span>
                    <span>-₹{discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>Taxes (GST)</span>
                  <strong>₹{taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.9rem' }}>Shipping / Extra Charges</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="ci-summary-input"
                    style={{ width: '130px', textAlign: 'right' }}
                    {...register('shippingFee')}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: '2px solid #ebdccb',
                    paddingTop: '12px',
                    fontSize: '1.2rem',
                    fontWeight: 700,
                    color: '#70472f',
                  }}
                >
                  <span>Grand Total</span>
                  <span>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
        </form>
      </main>

      {/* Invoice Preview Modal */}
      <InvoicePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        invoice={{
          ...watchedValues,
          subtotal,
          discountAmount,
          taxAmount,
          chargesAmount: shippingCharge,
          grandTotal,
        }}
      />
    </div>
  );
};

export default CreateInvoice;
