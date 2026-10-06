export const blankItem = () => ({
  productId: "",
  description: "",
  quantity: "1",
  unitPrice: "",
  discountType: null,
  discountRate: null,
  taxType: "",
  taxRate: "",
  hsnsac: "",
  unit: "",
});
export const blankInvoice = () => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    customerId: "",
    invoiceDate: today,
    dueDate: today,
    currency: "",
    reference: "",
    notes: "",
    termsAndConditions: "",
    discountAmount: "0",
    chargesAmount: "0",
    items: [blankItem()],
  };
};
export function formFromInvoice(invoice) {
  return {
    customerId: String(invoice.customerId),
    invoiceDate: invoice.invoiceDate?.slice(0, 10) || "",
    dueDate: invoice.dueDate?.slice(0, 10) || "",
    currency: invoice.currency,
    reference: invoice.reference || "",
    notes: invoice.notes || "",
    termsAndConditions: invoice.termsAndConditions || "",
    discountAmount: String(invoice.discountAmount),
    chargesAmount: String(invoice.chargesAmount),
    rowVersion: invoice.rowVersion,
    items: (invoice.items || []).map((item) => ({
      ...item,
      productId: item.productId == null ? "" : String(item.productId),
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      taxRate: item.taxRate == null ? "" : String(item.taxRate),
      unit: "",
    })),
  };
}
export function validateInvoice(form) {
  const errors = {};
  if (!/^[1-9]\d*$/.test(String(form.customerId)))
    errors.customerId = "Select a customer.";
  for (const key of ["invoiceDate", "dueDate"])
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(form[key]) ||
      !Number.isFinite(Date.parse(form[key])) ||
      new Date(form[key]).toISOString().slice(0, 10) !== form[key]
    )
      errors[key] = "Enter a valid date (dd/mm/yyyy).";
  if (form.dueDate && form.invoiceDate && form.dueDate < form.invoiceDate)
    errors.dueDate = "Due date must be on or after the invoice date.";
  if (!/^[A-Z]{3}$/.test(form.currency))
    errors.currency = "Enter a valid three-letter currency code.";
  for (const key of ["discountAmount", "chargesAmount"])
    if (
      !/^\d+(?:\.\d{1,2})?$/.test(String(form[key])) ||
      Number(form[key]) > 999999999.99
    )
      errors[key] =
        "Enter a non-negative amount with at most two decimal places.";
  if (!form.items?.length)
    errors.items = "Add at least one product or service.";
  form.items?.forEach((item, index) => {
    if (!/^[1-9]\d*$/.test(String(item.productId)))
      errors[`items.${index}.productId`] = "Select a product or service.";
    if (!item.description?.trim())
      errors[`items.${index}.description`] = "Description is required.";
    if (item.taxCategory && !item.taxType)
      errors[`items.${index}.taxRate`] =
        "Select a configured tax for this product's tax category.";
    if (item.currency && item.currency !== form.currency)
      errors[`items.${index}.productId`] =
        "Product currency must match the invoice currency.";
    if (
      !/^\d+(?:\.\d{1,4})?$/.test(String(item.quantity)) ||
      Number(item.quantity) < 0.01 ||
      Number(item.quantity) > 999999
    )
      errors[`items.${index}.quantity`] =
        "Quantity must be between 0.01 and 999999.";
    if (
      !/^\d+(?:\.\d{1,2})?$/.test(String(item.unitPrice)) ||
      Number(item.unitPrice) < 0.01 ||
      Number(item.unitPrice) > 999999999.99
    )
      errors[`items.${index}.unitPrice`] =
        "Price must be between 0.01 and 999999999.99.";
    if (
      item.taxRate !== "" &&
      item.taxRate != null &&
      (!Number.isFinite(Number(item.taxRate)) ||
        Number(item.taxRate) < 0 ||
        Number(item.taxRate) > 100)
    )
      errors[`items.${index}.taxRate`] = "Select a valid tax rate.";
  });
  return errors;
}
export function invoiceDto(form, editing = false, tenantId = null) {
  const errors = validateInvoice(form);
  if (Object.keys(errors).length)
    throw new Error(Object.values(errors).join(" "));
  return {
    ...(tenantId != null && Number(tenantId) > 0 ? { tenantId: Number(tenantId) } : {}),
    customerId: Number(form.customerId),
    invoiceDate: `${form.invoiceDate}T00:00:00Z`,
    dueDate: `${form.dueDate}T00:00:00Z`,
    currency: form.currency,
    reference: form.reference.trim() || null,
    notes: form.notes.trim() || null,
    termsAndConditions: form.termsAndConditions.trim() || null,
    discountAmount: Number(form.discountAmount),
    chargesAmount: Number(form.chargesAmount),
    ...(editing ? { rowVersion: form.rowVersion } : {}),
    items: form.items.map((item, index) => ({
      productId: Number(item.productId),
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discountType: item.discountType || null,
      discountRate:
        item.discountRate == null ? null : Number(item.discountRate),
      taxType: item.taxType || null,
      taxRate: item.taxRate === "" ? null : Number(item.taxRate),
      hsnsac: item.hsnsac || null,
      sortOrder: index + 1,
    })),
  };
}
export function calculationDto(form) {
  const dto = invoiceDto(form);
  return {
    items: dto.items.map((item) => ({
      name: item.description,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineDiscountType: item.discountType,
      lineDiscountValue: item.discountRate,
      taxRatePercent: item.taxRate,
    })),
    invoiceDiscount:
      dto.discountAmount > 0
        ? { discountType: "Fixed", value: dto.discountAmount }
        : null,
    charges:
      dto.chargesAmount > 0
        ? [
            {
              name: "Other Charges",
              amount: dto.chargesAmount,
              calculationType: "Fixed",
            },
          ]
        : null,
    transactionDate: dto.invoiceDate,
    currency: dto.currency,
  };
}
export function productToItem(product, taxes = []) {
  const tax = taxes.find(
    (rate) =>
      [rate.code, rate.name].some(
        (value) => value && value === product.taxCategory,
      ) &&
      !rate.isInclusive &&
      !rate.isCompound,
  );
  return {
    ...blankItem(),
    productId: String(product.id),
    description: product.description || product.name,
    unitPrice: String(product.price),
    unit: product.unit || "",
    hsnsac: product.hsnSacCode || "",
    taxType: tax?.taxType || "",
    taxRate: tax ? String(tax.rate) : "",
    currency: product.currency,
    productName: product.name,
    taxCategory: product.taxCategory || "",
  };
}
