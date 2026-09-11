/**
 * Customer Contracts (Invoice & Billing Platform)
 * Confirmed via backend API schemas (CustomersController, CreateCustomerRequest, UpdateCustomerRequest, CustomerDto, CustomerAddressDto, ApiResponse<T>)
 */

export const validCustomerId = (id) => ['string', 'number'].includes(typeof id)
  && /^[1-9]\d*$/.test(String(id)) && Number.isInteger(Number(id)) && Number(id) <= 2147483647;

export const requireCustomerId = (id) => {
  if (!validCustomerId(id)) throw Object.assign(new Error('Invalid customer ID.'), { code: 'INVALID_ID' });
  return Number(id);
};

// Copy address content, never the billing record's identity/default flag.
export const shippingFromBilling = (billing = {}, shipping = {}) => ({
  ...shipping,
  ...Object.fromEntries(['street', 'addressLine2', 'city', 'state', 'postalCode', 'country'].map(key => [key, billing[key] ?? ''])),
});

export const createCustomerRequest = (data = {}) => {
  const billing = data.billingAddress || {};
  const shipping = data.isShippingSameAsBilling
    ? shippingFromBilling(billing, data.shippingAddress)
    : (data.shippingAddress || {});

  const addresses = [
    {
      ...(billing.id ? { id: Number(billing.id) } : {}),
      addressType: 'Billing',
      addressLine1: billing.street?.trim() || '',
      addressLine2: billing.addressLine2?.trim() || null,
      city: billing.city?.trim() || '',
      state: billing.state?.trim() || null,
      postalCode: billing.postalCode?.trim() || null,
      country: billing.country === undefined ? 'India' : billing.country?.trim() || null,
      isDefault: billing.isDefault ?? true,
    },
    {
      ...(shipping.id ? { id: Number(shipping.id) } : {}),
      addressType: 'Shipping',
      addressLine1: shipping.street?.trim() || '',
      addressLine2: shipping.addressLine2?.trim() || null,
      city: shipping.city?.trim() || '',
      state: shipping.state?.trim() || null,
      postalCode: shipping.postalCode?.trim() || null,
      country: shipping.country === undefined ? 'India' : shipping.country?.trim() || null,
      isDefault: shipping.isDefault ?? false,
    },
  ];

  let formattedWebsite = data.website?.trim() || null;
  if (formattedWebsite && !/^https?:\/\//i.test(formattedWebsite)) {
    formattedWebsite = `https://${formattedWebsite}`;
  }

  const rawCustomerType = String(
    data.customerType ?? data.CustomerType ?? 'business'
  ).trim().toLowerCase();
  const normalizedCustomerType = ['individual', 'business', 'organization'].includes(rawCustomerType)
    ? rawCustomerType
    : 'business';
  const titleCaseCustomerType =
    normalizedCustomerType.charAt(0).toUpperCase() + normalizedCustomerType.slice(1);

  return {
    customerCode: data.customerCode?.trim() || null,
    name: data.name?.trim() || '',
    email: data.email?.trim() || '',
    phone: data.phone?.trim() || null,
    companyName: data.companyName?.trim() || null,
    customerType: titleCaseCustomerType,
    taxId: (data.taxId || data.gstin)?.trim() || null,
    currency: (data.currency?.trim() || 'INR').toUpperCase(),
    notes: data.notes?.trim() || null,
    website: formattedWebsite,
    paymentTerms: data.paymentTerms?.trim() || null,
    address: billing.street?.trim() || null,
    city: billing.city?.trim() || null,
    state: billing.state?.trim() || null,
    postalCode: billing.postalCode?.trim() || null,
    country: billing.country?.trim() || 'India',
    addresses,
  };
};

export const createUpdateCustomerRequest = (data = {}) => {
  const base = createCustomerRequest(data);
  // PUT must retain addresses outside the two form sections, too. Preserve the
  // exact original value (including null) when its editable representation is unchanged.
  const originals = data.raw?.addresses ?? data.raw?.Addresses;
  if (Array.isArray(originals)) {
    const fields = ['id', 'addressType', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country', 'isDefault'];
    const pending = [...base.addresses];
    const comparable = value => typeof value === 'string' ? value.trim() : value ?? '';
    const baseline = createCustomerRequest(parseCustomerResponse(data.raw));
    base.addresses = originals.map(original => {
      const current = Object.fromEntries(fields.flatMap(key => {
        const value = original[key] !== undefined ? original[key] : original[key[0].toUpperCase() + key.slice(1)];
        return value === undefined ? [] : [[key, value]];
      }));
      const index = pending.findIndex(next => next.id != null ? next.id === current.id
        : current.id == null && next.addressType?.toLowerCase() === current.addressType?.toLowerCase());
      if (index < 0) return current;
      const next = pending.splice(index, 1)[0];
      const previous = baseline.addresses.find(address => next.id != null ? address.id === next.id : address.addressType === next.addressType);
      return Object.fromEntries(fields.flatMap(key => {
        const value = comparable(next[key]) === comparable(previous?.[key]) ? current[key] : next[key];
        return value === undefined ? [] : [[key, value]];
      }));
    });
    base.addresses.push(...pending.filter(next => {
      const previous = baseline.addresses.find(address => address.addressType === next.addressType);
      return !previous || fields.some(key => comparable(next[key]) !== comparable(previous[key]));
    }));
    for (const key of ['address', 'city', 'state', 'postalCode', 'country']) {
      if (comparable(base[key]) === comparable(baseline[key])) {
        if (data.raw[key] === undefined) delete base[key];
        else base[key] = data.raw[key];
      }
    }
  } else if (data.raw) {
    const baseline = createCustomerRequest(parseCustomerResponse(data.raw));
    // If GET omitted the collection, a name-only edit must not replace unknown
    // backend addresses with the form's empty/default address sections.
    if (JSON.stringify(base.addresses) === JSON.stringify(baseline.addresses)) delete base.addresses;
  }
  const isTargetActive =
    typeof data.isActive === 'boolean'
      ? data.isActive
      : String(data.status).trim().toLowerCase() !== 'inactive';

  const rawCustomerType = String(
    data.customerType ?? data.CustomerType ?? base.customerType ?? 'business'
  ).trim().toLowerCase();
  const normalizedCustomerType = ['individual', 'business', 'organization'].includes(rawCustomerType)
    ? rawCustomerType
    : 'business';
  const titleCaseCustomerType =
    normalizedCustomerType.charAt(0).toUpperCase() + normalizedCustomerType.slice(1);

  return {
    ...base,
    customerType: titleCaseCustomerType,
    status: isTargetActive ? 'Active' : 'Inactive',
    isActive: isTargetActive,
    rowVersion: data.rowVersion || null,
  };
};

export const parseCustomerResponse = (response) => {
  if (!response) return null;
  let raw = response;
  if (response.data !== undefined) {
    if (response.data === null) return null;
    raw = response.data;
  }
  if (!raw || typeof raw !== 'object') return null;

  // Unwrap nested customer or profile envelope
  if (raw.customer && typeof raw.customer === 'object') {
    raw = {
      ...raw.customer,
      financialSummary: raw.financialSummary || raw.customer.financialSummary,
      addresses: raw.addresses || raw.customer.addresses || raw.Addresses || raw.customer.Addresses,
    };
  } else if (raw.profile && typeof raw.profile === 'object') {
    raw = {
      ...raw.profile,
      financialSummary: raw.financialSummary || raw.profile.financialSummary,
      addresses: raw.addresses || raw.profile.addresses || raw.Addresses || raw.profile.Addresses,
    };
  }

  const addresses = Array.isArray(raw.addresses)
    ? raw.addresses
    : Array.isArray(raw.Addresses)
    ? raw.Addresses
    : [];

  const billingDto =
    addresses.find((a) => (a.addressType || a.AddressType)?.toLowerCase() === 'billing') || null;
  const shippingDto =
    addresses.find((a) => (a.addressType || a.AddressType)?.toLowerCase() === 'shipping') || null;

  const billingAddress = {
    id: billingDto?.id ?? billingDto?.Id,
    addressLine2: billingDto?.addressLine2 ?? billingDto?.AddressLine2 ?? '',
    isDefault: billingDto?.isDefault ?? billingDto?.IsDefault,
    street:
      billingDto?.addressLine1 ||
      billingDto?.AddressLine1 ||
      raw.address ||
      raw.Address ||
      '',
    city:
      billingDto?.city ||
      billingDto?.City ||
      raw.city ||
      raw.City ||
      '',
    state:
      billingDto?.state ||
      billingDto?.State ||
      raw.state ||
      raw.State ||
      '',
    postalCode:
      billingDto?.postalCode ||
      billingDto?.PostalCode ||
      raw.postalCode ||
      raw.PostalCode ||
      '',
    country:
      billingDto?.country ||
      billingDto?.Country ||
      raw.country ||
      raw.Country ||
      '',
  };

  const shippingAddress = shippingDto
    ? {
        id: shippingDto.id ?? shippingDto.Id,
        addressLine2: shippingDto.addressLine2 ?? shippingDto.AddressLine2 ?? '',
        isDefault: shippingDto.isDefault ?? shippingDto.IsDefault,
        street: shippingDto.addressLine1 || shippingDto.AddressLine1 || '',
        city: shippingDto.city || shippingDto.City || '',
        state: shippingDto.state || shippingDto.State || '',
        postalCode: shippingDto.postalCode || shippingDto.PostalCode || '',
        country: shippingDto.country ?? shippingDto.Country ?? '',
      }
    : shippingFromBilling(billingAddress);

  const isShippingSameAsBilling =
    !shippingDto ||
    (billingAddress.street === shippingAddress.street &&
      billingAddress.addressLine2 === shippingAddress.addressLine2 &&
      billingAddress.city === shippingAddress.city &&
      billingAddress.state === shippingAddress.state &&
      billingAddress.postalCode === shippingAddress.postalCode &&
      billingAddress.country === shippingAddress.country);

  const taxId = raw.taxId ?? raw.TaxId ?? '';
  const rawStatus = raw.status ?? raw.Status;
  let isActive = true;
  if (typeof raw.isActive === 'boolean') {
    isActive = raw.isActive;
  } else if (typeof raw.IsActive === 'boolean') {
    isActive = raw.IsActive;
  } else if (rawStatus !== undefined && rawStatus !== null) {
    isActive = String(rawStatus).trim().toLowerCase() !== 'inactive';
  }
  const status = isActive ? 'Active' : 'Inactive';

  const rawCustomerType = String(
    raw.customerType ?? raw.CustomerType ?? raw.type ?? raw.Type ?? 'business'
  ).trim().toLowerCase();
  const customerType = ['individual', 'business', 'organization'].includes(rawCustomerType)
    ? rawCustomerType
    : 'business';
  const customerTypeTitleCase =
    customerType.charAt(0).toUpperCase() + customerType.slice(1);
  const creditLimit = raw.creditLimit ?? raw.CreditLimit ?? null;
  const outstandingBalance = raw.outstandingBalance ?? raw.OutstandingBalance ?? null;

  return {
    id: raw.id ?? raw.Id,
    customerCode: raw.customerCode ?? raw.CustomerCode ?? '',
    name: raw.name ?? raw.Name ?? '',
    email: raw.email ?? raw.Email ?? '',
    phone: raw.phone ?? raw.Phone ?? '',
    companyName: raw.companyName ?? raw.CompanyName ?? '',
    customerType,
    CustomerType: customerTypeTitleCase,
    creditLimit,
    outstandingBalance,
    openingBalance: raw.openingBalance ?? null,
    taxId,
    gstin: taxId,
    currency: raw.currency ?? raw.Currency ?? 'INR',
    status,
    isActive,
    notes: raw.notes ?? raw.Notes ?? '',
    website: raw.website ?? raw.Website ?? '',
    paymentTerms: raw.paymentTerms ?? raw.PaymentTerms ?? '',
    billingAddress,
    shippingAddress,
    isShippingSameAsBilling,
    rowVersion: raw.rowVersion ?? raw.RowVersion ?? null,
    createdAtUtc: raw.createdAtUtc ?? raw.CreatedAtUtc ?? null,
    updatedAtUtc: raw.updatedAtUtc ?? raw.UpdatedAtUtc ?? null,
    raw,
  };
};

export const parseCustomerListResponse = (response) => {
  if (!response) return [];
  let raw = response;
  if (response?.data !== undefined && response.data !== null) {
    raw = response.data;
  }

  let items = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (Array.isArray(raw?.items)) {
    items = raw.items;
  } else if (Array.isArray(raw?.Items)) {
    items = raw.Items;
  }

  return items.map((item) => parseCustomerResponse(item)).filter(Boolean);
};

// Accept short, structured user messages only; arbitrary server bodies are never UI copy.
export const safeCustomerMessage = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) return '';
  if (/[<>]|&(?:lt|gt);|exception|stack\s*trace|traceback|\b(?:SQL|SQLSTATE|ORA-\d+|System\.|Microsoft\.)|(?:violates|violation of)[\s\S]*constraint|database error|connection string|incorrect syntax|\b(?:select\b[\s\S]*\bfrom|insert\s+into|update\s+\w+\s+set|delete\s+from)|(?:[A-Z]:\\|\bat\s+\S+\([^)]*\))/i.test(value)) return '';
  return value.trim();
};

export const parseCustomerError = (
  error,
  fallbackMessage = 'Unable to complete the customer request. Please try again.'
) => {
  if (!error) return fallbackMessage;
  if (error.code === 'INVALID_ID') return 'Invalid customer ID.';
  if (error.response) {
    const { status, data } = error.response;
    if (status >= 500) return 'Server Error. Please try again.';
    const fallbacks = {
      400: 'Invalid customer data. Please review the highlighted fields.',
      401: 'Session expired. Please sign in again.',
      403: 'You do not have permission to perform this action.',
      404: 'The requested customer was not found.',
      409: 'This customer has changed or conflicts with another record. Reload and try again.',
      422: 'Invalid customer data. Please review the highlighted fields.',
    };
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const validation = data.errors && typeof data.errors === 'object'
        ? Object.values(data.errors).flat().map(safeCustomerMessage).filter(Boolean) : [];
      const message = safeCustomerMessage(data.message) || safeCustomerMessage(data.title);
      const useful = [...new Set([...validation, message].filter(Boolean))].join(' ');
      if (useful) return useful.slice(0, 1000);
    }
    return fallbacks[status] || fallbackMessage;
  }
  if (error.request || ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code) || error.message === 'Network Error') return 'Network Error';
  return safeCustomerMessage(error.userMessage) || safeCustomerMessage(error.message) || fallbackMessage;
};
