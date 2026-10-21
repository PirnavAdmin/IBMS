import { useMemo, useState } from 'react';
import { useDraftState, useFormDraft } from '../../../context/FormDraftContext';
import { Add, ArrowBack, DeleteOutline, MoreVert } from '@mui/icons-material';
import { applyAdditionalDiscounts, applyAdditionalTaxes, currency, lineTotals, quotationTotals } from '../utils/quotationCalculations';
import { validateQuotation } from '../utils/quotationValidation';
import { SearchablePicker } from './SearchablePicker';
import { ThemedSelect } from './ThemedSelect';
import { ThemedDatePicker } from './ThemedDatePicker';

const emptyItem = () => ({ id: `new-${Date.now()}-${Math.random()}`, productId: '', productName: '', description: '', quantity: 0, unitPrice: 0, discountType: 'percentage', discountRate: 0, discountAmount: 0, taxType: '', taxRate: 0, hsnSac: '' });
const taxTypeOptions = ['GST', 'CGST', 'SGST', 'IGST', 'VAT', 'Custom Tax'].map(name => ({ id: name, name }));
const standardTaxRates = [0, 5, 12, 18, 28];
const splitTaxRates = [0, 2.5, 6, 9, 14];
const addTaxOption = '__add-tax__';
const discountTypeOptions = [{ id: 'percentage', name: '%' }, { id: 'fixed', name: 'Fixed amount' }];
export function quotationChargeSelection(configuredCharges, namePreset) {
  if (namePreset === 'custom') return { namePreset, name: '', amount: '0', type: 'fixed' };
  const config = configuredCharges.find(charge => String(charge.id) === String(namePreset))
    || configuredCharges.find(charge => charge.name.trim().toLocaleLowerCase() === String(namePreset).trim().toLocaleLowerCase());
  return {
    namePreset: config?.name || namePreset,
    name: config?.name || namePreset,
    amount: config?.value ?? '0',
    type: config?.calculationType?.toLowerCase() === 'percentage' ? 'percentage' : 'fixed',
    configuredChargeId: config?.id,
    configuredChargeCode: config?.code,
  };
}
export function newQuotation() { const date = new Date().toISOString().slice(0, 10); const until = new Date(); until.setDate(until.getDate() + 30); return { customerId: '', quotationDate: date, validUntil: until.toISOString().slice(0, 10), reference: '', items: [emptyItem()], invoiceDiscount: { type: 'percentage', value: 0 }, charges: [], notes: 'Thank you for your business.', termsAndConditions: 'Goods once sold are subject to store policy.\nPlease check quantity and products before leaving the store.\nGST is applicable as per product category.\nKeep this invoice for returns and warranty claims.\nNo exchange or refund on opened products.' }; }
export function QuotationForm({ initial, customers = [], products = [], configuredCharges = [], onSave, onCancel, onBack, readOnly = false }) {
  const draftKey = `quotation:${initial?.id || 'new'}`;
  const draft = useFormDraft(draftKey);
  const cancel = () => { draft.clear(); onCancel?.(); };
  const [form, setForm] = useDraftState(draftKey, 'form', () => {
    const defaults = newQuotation();
    return {
      ...defaults,
      ...initial,
      customerId: initial?.customerId || initial?.customer?.id || '',
      items: (initial?.items || defaults.items).map(item => ({
        ...item,
        quantity: Number.isFinite(Number(item.quantity)) ? Math.trunc(Number(item.quantity)) : item.quantity,
      })),
    };
  }); const [errors, setErrors] = useState({});
  const [itemsActionsOpen, setItemsActionsOpen] = useState(false);
  const [taxRows, setTaxRows] = useDraftState(draftKey, 'taxRows', []);
  const [discountRows, setDiscountRows] = useDraftState(draftKey, 'discountRows', []);
  const selectedCustomer = customers.find(customer => String(customer.id) === String(form.customerId)); const taxAdjustedItems = useMemo(() => applyAdditionalTaxes(form.items, taxRows), [form.items, taxRows]); const totals = useMemo(() => quotationTotals(taxAdjustedItems, form.invoiceDiscount, form.charges || [], [], discountRows), [taxAdjustedItems, form, discountRows]);
  const patch = data => setForm(current => ({ ...current, ...data }));
  const patchItem = (index, data) => {
    patch({ items: form.items.map((item, i) => i === index ? { ...item, ...data } : item) });
    setErrors(current => {
      const next = { ...current };
      delete next[`item-${index}`];
      return next;
    });
  };
  const addTax = () => setTaxRows(rows => [...rows, { id: `tax-${Date.now()}-${Math.random()}`, itemId: '', taxType: 'GST', taxRate: '', customTax: false }]);
  const removeTaxRow = rowId => setTaxRows(rows => rows.filter(item => item.id !== rowId));
  const updateTaxRow = (rowId, data) => {
    const row = taxRows.find(item => item.id === rowId);
    if (!row) return;
    const next = { ...row, ...data };
    if (data.taxType !== undefined) {
      next.taxRate = data.taxType === row.taxType ? row.taxRate : '';
      next.customTax = false;
    }
    setTaxRows(rows => rows.map(item => item.id === rowId ? next : item));
  };
  const itemTaxLabel = item => {
    if (!item.productId) return '';
    const baseTax = `${item.taxType || 'GST'} ${Number(item.taxRate) || 0}%`;
    const additionalTaxes = taxRows
      .filter(tax => String(tax.itemId) === String(item.id) && tax.taxType && tax.taxRate !== '')
      .map(tax => `${tax.taxType} ${Number(tax.taxRate) || 0}%`);
    return [baseTax, ...additionalTaxes].join(' + ');
  };
  const addDiscount = () => setDiscountRows(rows => [...rows, { id: `discount-${Date.now()}-${Math.random()}`, itemId: '', discountType: 'percentage', discountValue: '0' }]);
  const updateDiscountRow = (rowId, data) => {
    const row = discountRows.find(item => item.id === rowId);
    if (!row) return;
    const next = { ...row, ...data };
    if (data.itemId !== undefined && data.itemId) next.discountValue = '0';
    setDiscountRows(rows => rows.map(item => item.id === rowId ? next : item));
  };
  const removeDiscountRow = rowId => setDiscountRows(rows => rows.filter(item => item.id !== rowId));
  const chooseProduct = (index, productId) => {
    const product = products.find(item => String(item.id) === String(productId));
    if (!product) return patchItem(index, { productId, quantity: productId ? 1 : 0 });
    const discountAllowed = product.discountAllowed === true || product.DiscountAllowed === true;
    const configuredDiscount = product.discountPercentage ?? product.discountPercent ?? product.DiscountPercentage ?? product.DiscountPercent;
    const discountRate = discountAllowed && Number.isFinite(Number(configuredDiscount)) ? Math.max(0, Number(configuredDiscount)) : 0;
    patchItem(index, {
      productId,
      productName: product.name,
      description: product.description,
      quantity: 1,
      unitPrice: product.price,
      discountType: 'percentage',
      discountRate,
      discountAmount: 0,
      discountAllowed: discountAllowed && discountRate > 0,
      taxType: product.taxCategory || 'GST',
      taxRate: product.taxRate,
      hsnSac: product.hsnSac,
    });
  };
  const itemProductName = item => { const product = products.find(candidate => String(candidate.id) === String(item.productId)); return product?.name || product?.productName || item.productName || item.name || item.description || `Product ${form.items.indexOf(item) + 1}`; };
  const itemProductLabel = item => { const product = products.find(candidate => String(candidate.id) === String(item.productId)); const name = itemProductName(item); return product?.code ? `${name} (${product.code})` : name; };
  const itemProductSearchText = item => { const product = products.find(candidate => String(candidate.id) === String(item.productId)); return `${itemProductLabel(item)} ${product?.description || item.description || ''} ${product?.hsnSac || item.hsnSac || ''}`; };
  const productLabel = product => `${product.name || product.productName || 'Product'}${product.code ? ` (${product.code})` : ''}`;
  const save = () => { const next = validateQuotation(form); setErrors(next); if (Object.keys(next).length === 0 && typeof onSave === 'function') onSave({ ...form, items: applyAdditionalTaxes(applyAdditionalDiscounts(form.items, discountRows), taxRows), charges: form.charges || [], customer: selectedCustomer, ...totals }); };
  return <main className="quotation-page quotation-form-page"><header className="quotation-header"><div><button className="quote-back-link" type="button" onClick={onBack || onCancel}><ArrowBack /> Back to quotations</button><span className="quote-eyebrow">QUOTATION WORKSPACE</span><h1>{initial?.id ? `Edit ${initial.quoteNumber}` : 'Create Quotation'}</h1><p>{readOnly ? 'This quotation is read-only because of its current status.' : 'Create a customer-ready quotation with instant preview calculations.'}</p></div></header>

    {Object.entries(errors).filter(([key]) => ['reference','notes','termsAndConditions','discount'].includes(key)).map(([key,message]) => <p className="quote-error" key={key}>{message}</p>)}<div className="quote-form-layout"><div className="quote-form-main">
      <section className="quote-card"><h2>Customer information</h2><div className="quote-fields two"><label>Searchable customer<SearchablePicker disabled={readOnly} value={form.customerId} onChange={customerId => patch({ customerId })} items={customers} getLabel={customer => `${customer.name} · ${customer.code}`} getSearchText={customer => `${customer.name} ${customer.code} ${customer.email} ${customer.mobile}`} placeholder="Search name, code, email or mobile" />{errors.customerId && <small className="quote-error">{errors.customerId}</small>}</label></div>{selectedCustomer && <div className="quote-customer-preview"><strong>{selectedCustomer.name} <span>{selectedCustomer.code}</span></strong><span>{selectedCustomer.email} · {selectedCustomer.mobile}</span><span><b>Billing:</b> {selectedCustomer.billingAddress}</span><span><b>Shipping:</b> {selectedCustomer.shippingAddress}</span><span><b>Tax:</b> {selectedCustomer.taxInfo}</span></div>}</section>
      <section className="quote-card"><h2>Quotation details</h2><div className="quote-fields three"><label>Quote number<input value={initial?.quoteNumber || 'Auto-generated on save'} readOnly /></label><label>Quotation date<ThemedDatePicker label="Quotation date" disabled={readOnly} value={form.quotationDate} onChange={quotationDate => patch({ quotationDate })} />{errors.quotationDate && <small className="quote-error">{errors.quotationDate}</small>}</label><label>Valid until<ThemedDatePicker label="Valid until" disabled={readOnly} value={form.validUntil} onChange={validUntil => patch({ validUntil })} />{errors.validUntil && <small className="quote-error">{errors.validUntil}</small>}</label><label>Reference (Optional)<input disabled={readOnly} placeholder="REF-PO-2026-001" value={form.reference} onChange={event => patch({ reference: event.target.value })} /></label></div></section>
      <section className="quote-card">
        <div className="quote-section-heading"><div><h2>Items</h2></div>{!readOnly && <div className="quote-items-actions"><strong>Actions</strong><button type="button" className="quote-items-actions-trigger ibms-row-actions-trigger" aria-label="Items actions" aria-haspopup="menu" aria-expanded={itemsActionsOpen} onClick={() => setItemsActionsOpen(open => !open)}><MoreVert /></button>{itemsActionsOpen && <div className="quote-items-actions-menu ibms-row-actions-menu" role="menu" aria-label="Items actions"><button type="button" role="menuitem" onClick={() => { addTax(); setItemsActionsOpen(false); }}><Add /> Add tax</button><button type="button" role="menuitem" onClick={() => { addDiscount(); setItemsActionsOpen(false); }}><Add /> Add discount</button><button type="button" role="menuitem" onClick={() => { patch({ items: [...form.items, emptyItem()] }); setItemsActionsOpen(false); }}><Add /> Add item</button><button type="button" role="menuitem" onClick={() => { patch({ charges: [...(form.charges || []), { id: `charge-${Date.now()}`, itemId: '', name: "", type: "fixed", amount: 0 }] }); setItemsActionsOpen(false); }}><Add /> Add charge</button></div>}</div>}</div>
        {errors.items && <p className="quote-error">{errors.items}</p>}
        <div className="quote-table-wrap ibms-table-frame"><table className="quote-items-table">
          <thead><tr><th>Product / Service</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Discount (%)</th><th>Tax</th><th>Total</th><th>Remove</th></tr></thead>
          <tbody>{form.items.map((item, index) => {
            const calc = lineTotals(item);
            return <tr key={item.id}>
              <td><SearchablePicker className="quote-product-picker" ariaLabel="Product or service" disabled={readOnly} value={item.productId} onChange={productId => chooseProduct(index, productId)} items={products} getLabel={productLabel} getSearchText={product => `${productLabel(product)} ${product.description || ''} ${product.hsnSac || ''}`} placeholder="Select product" showSearchIcon={false} showDropdownIcon />{errors[`item-${index}`] && <small className="quote-error">{errors[`item-${index}`]}</small>}</td>
              <td className="quote-item-description"><input type="text" readOnly value={item.productId ? item.description || '' : ''} placeholder="Description" aria-label="Product description" /></td>
              <td><input min="0" step="1" type="number" disabled={readOnly} value={item.quantity} onChange={event => patchItem(index, { quantity: event.target.value })} /></td>
              <td><input min="0" type="number" step="0.01" readOnly value={item.productId ? item.unitPrice : ''} aria-label="Unit price" /></td>
              <td className="quote-item-discount"><input aria-label="Product discount" readOnly value={!item.productId ? '' : item.discountAllowed && Number(item.discountRate) > 0 ? `${Number(item.discountRate)}%` : 'N/A'} /></td>
              <td><input className="quote-item-tax" aria-label="Product tax" readOnly value={itemTaxLabel(item)} /></td>
              <td className="quote-item-total"><strong>{currency(calc.total)}</strong></td>
              <td className="quote-item-remove">{!readOnly && <button className="quote-icon-btn" aria-label="Remove item" onClick={() => patch({ items: form.items.filter((_, i) => i !== index) })}><DeleteOutline /></button>}</td>
            </tr>;
          })}</tbody>
        </table></div>
      </section>
      {taxRows.length > 0 && <section className="quote-card quote-charges"><h2>Tax</h2>{taxRows.map(row => { const eligibleItems = form.items.filter(item => item.productId && (!taxRows.some(other => other.id !== row.id && other.itemId === String(item.id)) || row.itemId === String(item.id))); const rowTaxOptions = [...taxTypeOptions, { id: addTaxOption, name: '+ Add tax' }]; const rates = row.taxType === 'CGST' || row.taxType === 'SGST' ? splitTaxRates : standardTaxRates; const customRateOption = '__custom-tax-rate__'; const rateOptions = [{ value: '', label: 'Select rate' }, ...rates.map(rate => ({ value: String(rate), label: `${rate}%` })), { value: customRateOption, label: 'Customize tax' }]; return <div className="quote-charge-row quote-tax-row" key={row.id}><SearchablePicker className="quote-charge-product-picker" ariaLabel="Tax product" showSearchIcon={false} showDropdownIcon disabled={readOnly} value={row.itemId} onChange={itemId => updateTaxRow(row.id, { itemId })} items={eligibleItems} getLabel={itemProductLabel} getSearchText={itemProductSearchText} placeholder="Select product" /><SearchablePicker className="quote-charge-tax-type-picker" ariaLabel="Tax type" showSearchIcon={false} showDropdownIcon disabled={readOnly} value={row.taxType} onChange={taxType => taxType === addTaxOption ? addTax() : updateTaxRow(row.id, { taxType })} items={rowTaxOptions} getLabel={option => option.name} getSearchText={option => option.name} placeholder="Select tax type" />{row.customTax ? <input className="quote-charge-tax-custom-rate" aria-label="Custom tax rate" type="number" min="0" max="100" step="0.01" placeholder="Enter tax rate" value={row.taxRate} disabled={readOnly} onChange={event => updateTaxRow(row.id, { taxRate: event.target.value })} /> : <ThemedSelect className="quote-charge-tax-rate-picker" label="Tax rate" disabled={readOnly || !row.taxType} value={row.taxRate} onChange={taxRate => taxRate === customRateOption ? updateTaxRow(row.id, { customTax: true, taxRate: '' }) : updateTaxRow(row.id, { taxRate, customTax: false })} options={rateOptions} />}{!readOnly && <button type="button" className="quote-icon-btn quote-tax-delete" aria-label="Remove tax" onClick={() => removeTaxRow(row.id)}><DeleteOutline /></button>}</div>; })}</section>}
      {form.charges?.length > 0 && <section className="quote-card quote-charges"><h2>Additional charges</h2>{form.charges.map((charge, index) => { const selectedConfig = configuredCharges.find(option => String(option.id) === String(charge.configuredChargeId)) || configuredCharges.find(option => option.name.trim().toLocaleLowerCase() === String(charge.name).trim().toLocaleLowerCase()); const selectedName = charge.namePreset ?? (selectedConfig ? selectedConfig.name : charge.name ? 'custom' : ''); const chargePickerValue = selectedName === 'custom' ? 'custom' : selectedConfig ? String(selectedConfig.id) : ''; const chargeNameOptions = [...configuredCharges.map(option => ({ id: String(option.id), name: option.name })), { id: 'custom', name: 'Other / custom' }]; const chargeProducts = form.items.filter(item => item.productId); return <div className="quote-charge-row quote-additional-charge-row" key={charge.id || index}><SearchablePicker className="quote-charge-product-picker" ariaLabel="Charge product" showSearchIcon={false} showDropdownIcon disabled={readOnly} value={charge.itemId || ''} onChange={itemId => patch({ charges: form.charges.map((row, i) => i === index ? { ...row, itemId } : row) })} items={chargeProducts} getLabel={itemProductLabel} getSearchText={itemProductSearchText} placeholder="Select product" /><div className="quote-charge-name"><SearchablePicker className="quote-charge-name-picker" showSearchIcon={false} showDropdownIcon disabled={readOnly} value={chargePickerValue} onChange={chargeId => patch({ charges: form.charges.map((row, i) => i === index ? { ...row, ...quotationChargeSelection(configuredCharges, chargeId) } : row) })} items={chargeNameOptions} getLabel={option => option.name} getSearchText={option => option.name} placeholder="Select charge name" />{selectedName === 'custom' && <input aria-label="Custom charge name" placeholder="Enter charge name" disabled={readOnly} value={charge.name || ''} onChange={event => patch({ charges: form.charges.map((row, i) => i === index ? { ...row, name: event.target.value, type: 'fixed' } : row) })} />}</div><div className={`quote-charge-amount${charge.type === 'percentage' ? ' quote-charge-amount-percentage' : ''}`}><span aria-hidden="true">{charge.type === 'percentage' ? '%' : '₹'}</span><input aria-label="Charge amount" type="number" min="0" step={charge.type === 'percentage' ? '0.01' : '1'} disabled={readOnly} value={typeof charge.amount === 'string' ? charge.amount : Number(charge.amount ?? 0).toFixed(2)} onChange={event => patch({ charges: form.charges.map((row, i) => i === index ? { ...row, amount: event.target.value } : row) })} /></div>{!readOnly && <button className="quote-icon-btn" aria-label="Remove charge" onClick={() => patch({ charges: form.charges.filter((_, i) => i !== index) })}><DeleteOutline /></button>}</div>; })}</section>}
      {discountRows.length > 0 && <section className="quote-card quote-charges"><h2>Discount</h2>{discountRows.map(row => { const eligibleItems = form.items.filter(item => item.productId && (!discountRows.some(other => other.id !== row.id && other.itemId === String(item.id)) || row.itemId === String(item.id))); const isPercentage = row.discountType === 'percentage'; return <div className="quote-charge-row quote-discount-row" key={row.id}><SearchablePicker className="quote-charge-product-picker" ariaLabel="Discount product" showSearchIcon={false} showDropdownIcon value={row.itemId} disabled={readOnly} onChange={itemId => updateDiscountRow(row.id, { itemId })} items={eligibleItems} getLabel={itemProductLabel} getSearchText={itemProductSearchText} placeholder="Select product" /><SearchablePicker className="quote-charge-discount-type-picker" ariaLabel="Discount type" showSearchIcon={false} showDropdownIcon value={row.discountType} disabled={readOnly} onChange={discountType => updateDiscountRow(row.id, { discountType })} items={discountTypeOptions} getLabel={option => option.name} getSearchText={option => option.name} placeholder="Discount type" /><div className={`quote-charge-amount${isPercentage ? ' quote-charge-amount-percentage' : ''}`}><span aria-hidden="true">{isPercentage ? '%' : '₹'}</span><input aria-label={isPercentage ? 'Discount percentage' : 'Discount amount'} type="number" min="0" step={isPercentage ? '1' : '0.01'} value={row.discountValue} disabled={readOnly} onChange={event => updateDiscountRow(row.id, { discountValue: event.target.value })} /></div>{!readOnly && <button type="button" className="quote-icon-btn quote-tax-delete" aria-label="Remove discount" onClick={() => removeDiscountRow(row.id)}><DeleteOutline /></button>}</div>; })}</section>}
      <section className="quote-card quote-summary quote-summary-inline"><h2>Quotation summary</h2><div className="quote-summary-rows">{[['Subtotal', totals.subtotal],['Discount', totals.discountAmount],['Taxable Amount', totals.taxableAmount],['Tax', totals.taxAmount],['Charges', totals.chargesAmount]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{currency(value)}</strong></div>)}<div className="quote-grand-total"><span>Grand Total</span><strong>{currency(totals.totalAmount)}</strong></div></div></section>
      <section className="quote-card"><h2>Notes & terms</h2><div className="quote-fields two"><label>Notes<textarea disabled={readOnly} value={form.notes} onChange={event => patch({ notes: event.target.value })} /></label><label>Terms & Conditions<textarea disabled={readOnly} value={form.termsAndConditions} onChange={event => patch({ termsAndConditions: event.target.value })} /></label></div></section>
    </div></div><div className="quote-footer-actions"><button className="quote-btn secondary" onClick={cancel}>Cancel</button>{!readOnly && <button className="quote-btn primary" onClick={save}>Save Draft</button>}</div></main>;
}
