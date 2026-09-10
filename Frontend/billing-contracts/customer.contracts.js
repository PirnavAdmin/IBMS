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
  const raw = response.data || response;
  if (!raw || typeof raw !== 'object') return null;

  const addresses = Array.isArray(raw.addresses) ? raw.addresses : [];
  const billingDto = addresses.find((a) => a.addressType?.toLowerCase() === 'billing') || null;
  const shippingDto = addresses.find((a) => a.addressType?.toLowerCase() === 'shipping') || null;

  const billingAddress = {
    street: billingDto?.addressLine1 || raw.address || '',
    city: billingDto?.city || raw.city || '',
    state: billingDto?.state || raw.state || '',
    postalCode: billingDto?.postalCode || raw.postalCode || '',
    country: billingDto?.country || raw.country || 'India',
  };

  const shippingAddress = shippingDto
    ? {
        street: shippingDto.addressLine1 || '',
        city: shippingDto.city || '',
        state: shippingDto.state || '',
        postalCode: shippingDto.postalCode || '',
        country: shippingDto.country || 'India',
      }
    : { ...billingAddress };

  const isShippingSameAsBilling =
    !shippingDto ||
    (billingAddress.street === shippingAddress.street &&
      billingAddress.city === shippingAddress.city &&
      billingAddress.state === shippingAddress.state &&
      billingAddress.postalCode === shippingAddress.postalCode &&
      billingAddress.country === shippingAddress.country);

  return {
    id: raw.id,
    customerCode: raw.customerCode || '',
    name: raw.name || '',
    email: raw.email || '',
    phone: raw.phone || '',
    companyName: raw.companyName || '',
    taxId: raw.taxId || '',
    gstin: raw.taxId || '',
    currency: raw.currency || 'INR',
    status: raw.isActive === false ? 'Inactive' : 'Active',
    isActive: raw.isActive ?? true,
    notes: raw.notes || '',
    website: raw.website || '',
    paymentTerms: raw.paymentTerms || '',
    billingAddress,
    shippingAddress,
    isShippingSameAsBilling,
    rowVersion: raw.rowVersion || null,
    createdAtUtc: raw.createdAtUtc || null,
    updatedAtUtc: raw.updatedAtUtc || null,
    raw,
  };
};

export const parseCustomerListResponse = (response) => {
  if (!response) return [];
  const raw = response.data || response;

  let items = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (Array.isArray(raw?.items)) {
    items = raw.items;
  } else if (Array.isArray(raw?.data)) {
    items = raw.data;
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
