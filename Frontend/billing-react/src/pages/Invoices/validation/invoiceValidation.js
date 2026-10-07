export const blankItem = () => ({
  productId: "",
  description: "",
  quantity: "1",
  unitPrice: "",
  discountType: "Percentage",
  discountRate: "",
  taxType: "",
  taxRate: "",
  hsnsac: "",
  unit: "",
});
export const getTodayIso = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getOneMonthLaterIso = (baseIso) => {
  let year, month, day;
  if (baseIso && /^\d{4}-\d{2}-\d{2}$/.test(baseIso)) {
    const parts = baseIso.split("-").map(Number);
    year = parts[0];
    month = parts[1] - 1;
    day = parts[2];
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth();
    day = now.getDate();
  }

  let targetYear = year;
  let targetMonth = month + 1;
  if (targetMonth > 11) {
    targetYear += Math.floor(targetMonth / 12);
    targetMonth = targetMonth % 12;
  }

  const maxDaysInTargetMonth = new Date(
    targetYear,
    targetMonth + 1,
    0,
  ).getDate();
  const targetDay = Math.min(day, maxDaysInTargetMonth);

  const yStr = String(targetYear);
  const mStr = String(targetMonth + 1).padStart(2, "0");
  const dStr = String(targetDay).padStart(2, "0");
  return `${yStr}-${mStr}-${dStr}`;
};

export const blankInvoice = () => {
  const today = getTodayIso();
  return {
    customerId: "",
    invoiceDate: today,
    dueDate: getOneMonthLaterIso(today),
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
  const lineDiscountsTotal = (invoice.items || []).reduce(
    (sum, item) => sum + Number(item.discountAmount || 0),
    0,
  );
  const invoiceDiscount = Math.max(
    0,
    Number(invoice.discountAmount || 0) - lineDiscountsTotal,
  );
  return {
    customerId: String(invoice.customerId),
    invoiceDate: invoice.invoiceDate?.slice(0, 10) || "",
    dueDate: invoice.dueDate?.slice(0, 10) || "",
    currency: invoice.currency,
    reference: invoice.reference || "",
    notes: invoice.notes || "",
    termsAndConditions: invoice.termsAndConditions || "",
    discountAmount: String(invoiceDiscount),
    chargesAmount: String(invoice.chargesAmount),
    rowVersion: invoice.rowVersion,
    items: (invoice.items || []).map((item) => ({
      ...item,
      productId: item.productId == null ? "" : String(item.productId),
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      discountType: item.discountType || "Percentage",
      discountRate:
        item.discountRate == null || item.discountRate === ""
          ? ""
          : String(item.discountRate),
      taxRate: item.taxRate == null ? "" : String(item.taxRate),
      unit: item.unit || "",
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
    if (item.currency && form.currency && item.currency !== form.currency) {
      item.currency = form.currency;
    }
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
    if (
      item.discountRate !== "" &&
      item.discountRate != null &&
      (!Number.isFinite(Number(item.discountRate)) ||
        Number(item.discountRate) < 0 ||
        (item.discountType === "Percentage" && Number(item.discountRate) > 100))
    )
      errors[`items.${index}.discountRate`] =
        item.discountType === "Percentage"
          ? "Discount % must be between 0 and 100."
          : "Discount amount must be non-negative.";
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
      discountType:
        item.discountRate !== "" && item.discountRate != null && Number(item.discountRate) > 0
          ? item.discountType || "Percentage"
          : null,
      discountRate:
        item.discountRate == null || item.discountRate === ""
          ? null
          : Number(item.discountRate),
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
export function productToItem(product, taxes = [], invoiceCurrency = "") {
  if (!product) return blankItem();

  // Extract discount from product catalog if configured
  const rawDiscount =
    product.discountPercentage ??
    product.discountPercent ??
    product.DiscountPercentage ??
    product.DiscountPercent ??
    product.discount;

  const discountNum = Number(rawDiscount);
  const hasDiscount =
    rawDiscount != null &&
    rawDiscount !== "" &&
    !Number.isNaN(discountNum) &&
    discountNum > 0;

  const discountRate = hasDiscount ? String(discountNum) : "";
  const discountType = product.discountType || "Percentage";

  // Extract rate and type from product properties or taxCategory (e.g. "GST 18%")
  let parsedRate = null;
  let parsedType = "";

  if (
    product.taxRate != null &&
    product.taxRate !== "" &&
    !Number.isNaN(Number(product.taxRate))
  ) {
    parsedRate = Number(product.taxRate);
  }

  if (product.taxType) {
    parsedType = String(product.taxType).trim();
  }

  if (product.taxCategory) {
    const catStr = String(product.taxCategory).trim();
    const match = catStr.match(/(\d+(?:\.\d+)?)/);
    if (parsedRate === null) {
      if (match) {
        parsedRate = Number(match[1]);
      } else if (/exempt|zero|nil/i.test(catStr)) {
        parsedRate = 0;
      }
    }
    if (!parsedType) {
      if (/vat/i.test(catStr)) {
        parsedType = "VAT";
      } else if (/exempt/i.test(catStr)) {
        parsedType = "Exempt";
      } else if (/gst/i.test(catStr) || match) {
        parsedType = "GST";
      }
    }
  }

  if (parsedType === "" && parsedRate !== null) {
    parsedType = "GST";
  }

  const taxList = Array.isArray(taxes) ? taxes : [];
  let tax = null;

  // 1. Direct match by taxCategory against rate.name or rate.code
  if (product.taxCategory && taxList.length > 0) {
    const catClean = String(product.taxCategory).trim().toLowerCase();
    tax = taxList.find((rate) => {
      const name = String(rate.name || "").trim().toLowerCase();
      const code = String(rate.code || "").trim().toLowerCase();
      return name === catClean || code === catClean;
    });
  }

  // 2. Match by parsedRate and parsedType
  if (!tax && parsedRate !== null && taxList.length > 0) {
    tax = taxList.find((rate) => {
      const rNum = Number(rate.rate);
      const rType = String(rate.taxType || rate.type || "").trim().toLowerCase();
      return (
        rNum === parsedRate &&
        (!parsedType || rType === parsedType.toLowerCase())
      );
    });
  }

  // 3. Fallback match by parsedRate only
  if (!tax && parsedRate !== null && taxList.length > 0) {
    tax = taxList.find((rate) => Number(rate.rate) === parsedRate);
  }

  const finalTaxRate =
    tax != null
      ? String(tax.rate)
      : parsedRate !== null
        ? String(parsedRate)
        : "";

  const finalTaxType =
    (tax ? tax.taxType || tax.type : null) ||
    parsedType ||
    (finalTaxRate !== "" ? "GST" : "");

  return {
    ...blankItem(),
    productId: String(product.id),
    description: product.description || product.name || "",
    unitPrice: String(product.price ?? ""),
    unit: product.unit || "",
    hsnsac: product.hsnSacCode || product.hsnSac || "",
    discountType,
    discountRate,
    taxType: finalTaxType,
    taxRate: finalTaxRate,
    currency: invoiceCurrency || product.currency || "",
    productName: product.name,
    taxCategory: product.taxCategory || "",
  };
}
