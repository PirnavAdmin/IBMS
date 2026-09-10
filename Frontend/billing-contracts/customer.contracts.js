/**
 * Customer Contracts (Invoice & Billing Platform)
 * Confirmed via backend API schemas (CustomersController, CreateCustomerRequest, UpdateCustomerRequest, CustomerDto, CustomerAddressDto, ApiResponse<T>)
 */

export const createCustomerRequest = (data = {}) => {
  const billing = data.billingAddress || {};
  const shipping = data.isShippingSameAsBilling
    ? { ...billing }
    : (data.shippingAddress || {});

  const addresses = [
    {
      addressType: 'Billing',
      addressLine1: billing.street?.trim() || '',
      addressLine2: billing.addressLine2?.trim() || null,
      city: billing.city?.trim() || '',
      state: billing.state?.trim() || null,
      postalCode: billing.postalCode?.trim() || null,
      country: billing.country?.trim() || 'India',
      isDefault: true,
    },
    {
      addressType: 'Shipping',
      addressLine1: shipping.street?.trim() || '',
      addressLine2: shipping.addressLine2?.trim() || null,
      city: shipping.city?.trim() || '',
      state: shipping.state?.trim() || null,
      postalCode: shipping.postalCode?.trim() || null,
      country: shipping.country?.trim() || 'India',
      isDefault: false,
    },
  ];

  return {
    customerCode: data.customerCode?.trim() || null,
    name: data.name?.trim() || '',
    email: data.email?.trim() || '',
    phone: data.phone?.trim() || null,
    companyName: data.companyName?.trim() || null,
    taxId: (data.taxId || data.gstin)?.trim() || null,
    currency: (data.currency?.trim() || 'INR').toUpperCase(),
    notes: data.notes?.trim() || null,
    website: data.website?.trim() || null,
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
  return {
    ...base,
    isActive: typeof data.isActive === 'boolean'
      ? data.isActive
      : data.status === 'Active',
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
      'India',
  };

  const shippingAddress = shippingDto
    ? {
        street: shippingDto.addressLine1 || shippingDto.AddressLine1 || '',
        city: shippingDto.city || shippingDto.City || '',
        state: shippingDto.state || shippingDto.State || '',
        postalCode: shippingDto.postalCode || shippingDto.PostalCode || '',
        country: shippingDto.country || shippingDto.Country || 'India',
      }
    : { ...billingAddress };

  const isShippingSameAsBilling =
    !shippingDto ||
    (billingAddress.street === shippingAddress.street &&
      billingAddress.city === shippingAddress.city &&
      billingAddress.state === shippingAddress.state &&
      billingAddress.postalCode === shippingAddress.postalCode &&
      billingAddress.country === shippingAddress.country);

  const taxId = raw.taxId ?? raw.TaxId ?? '';
  const isActive = raw.isActive ?? raw.IsActive ?? true;
  const rawCustomerType = String(raw.customerType ?? raw.CustomerType ?? 'business').toLowerCase();
  const customerType = ['individual', 'business', 'organization'].includes(rawCustomerType) ? rawCustomerType : 'business';
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
    creditLimit,
    outstandingBalance,
    openingBalance: outstandingBalance,
    taxId,
    gstin: taxId,
    currency: raw.currency ?? raw.Currency ?? 'INR',
    status: isActive === false ? 'Inactive' : 'Active',
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

export const parseCustomerError = (
  error,
  fallbackMessage = 'An unexpected error occurred while processing customer data.'
) => {
  if (!error) return fallbackMessage;

  if (error.userMessage === 'Network Error' || error.message === 'Network Error') return 'Network Error';

  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;

    if (typeof data === 'string') {
      if (data.includes('ERR_NGROK') || data.toLowerCase().includes('ngrok') || data.toLowerCase().includes('offline')) {
        return 'Network Error';
      }
      return data.trim() || `Server error (${status})`;
    }

    if (Array.isArray(data?.errors)) {
      const msgs = data.errors.filter(Boolean);
      if (msgs.length > 0) return msgs.join(' ');
    }

    if (data?.errors && typeof data.errors === 'object') {
      const messages = Object.entries(data.errors).flatMap(([field, errList]) => {
        if (Array.isArray(errList)) return errList.map((m) => `${m}`);
        return [String(errList)];
      });
      if (messages.length > 0) return messages.join(' ');
    }

    if (data?.message) return data.message;
    if (data?.title) return data.title;
    if (data?.error) return typeof data.error === 'string' ? data.error : data.error?.message || fallbackMessage;

    if (status === 400) return 'Invalid customer data. Please review the highlighted fields.';
    if (status === 401) return 'Session expired. Please sign in again.';
    if (status === 403) return 'You do not have permission to perform this action.';
    if (status === 404) return 'The requested customer was not found.';
    if (status === 409) return 'A customer with this email or customer code already exists.';
    if (status >= 500) return 'Network Error';
  }

  if (error.request || error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') return 'Network Error';

  return error.userMessage || error.message || fallbackMessage;
};
