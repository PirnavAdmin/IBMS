/**
 * Customer Management Contracts (IBMS Phase 3)
 * Aligned with Backend DTOs (Billing.Contracts) and OpenAPI / Swagger specs.
 * Task: IBMSBE-Int-01 (API Contract Verification)
 */

/**
 * Creates and formats a CreateCustomerRequest payload
 */
export const createCustomerRequest = ({
  name,
  email,
  customerCode,
  phone,
  companyName,
  taxId,
  address,
  city,
  state,
  postalCode,
  country = 'USA',
  website,
  notes,
  currency = 'USD',
  paymentTerms,
  addresses = [],
}) => ({
  name: name?.trim() || '',
  email: email?.trim() || '',
  customerCode: customerCode?.trim() || undefined,
  phone: phone?.trim() || undefined,
  companyName: companyName?.trim() || undefined,
  taxId: taxId?.trim() || undefined,
  address: address?.trim() || undefined,
  city: city?.trim() || undefined,
  state: state?.trim() || undefined,
  postalCode: postalCode?.trim() || undefined,
  country: country?.trim() || 'USA',
  website: website?.trim() || undefined,
  notes: notes?.trim() || undefined,
  currency: currency?.trim()?.toUpperCase() || 'USD',
  paymentTerms: paymentTerms?.trim() || undefined,
  addresses: Array.isArray(addresses) ? addresses.map(createCustomerAddressDto) : [],
});

/**
 * Creates and formats an UpdateCustomerRequest payload
 */
export const createUpdateCustomerRequest = ({
  name,
  email,
  phone,
  companyName,
  taxId,
  address,
  city,
  state,
  postalCode,
  country,
  website,
  notes,
  currency,
  paymentTerms,
  isActive,
  rowVersion,
  addresses,
}) => {
  const payload = {
    name: name?.trim() || '',
    email: email?.trim() || '',
  };

  if (phone !== undefined) payload.phone = phone?.trim() || null;
  if (companyName !== undefined) payload.companyName = companyName?.trim() || null;
  if (taxId !== undefined) payload.taxId = taxId?.trim() || null;
  if (address !== undefined) payload.address = address?.trim() || null;
  if (city !== undefined) payload.city = city?.trim() || null;
  if (state !== undefined) payload.state = state?.trim() || null;
  if (postalCode !== undefined) payload.postalCode = postalCode?.trim() || null;
  if (country !== undefined) payload.country = country?.trim() || null;
  if (website !== undefined) payload.website = website?.trim() || null;
  if (notes !== undefined) payload.notes = notes?.trim() || null;
  if (currency !== undefined) payload.currency = currency?.trim()?.toUpperCase() || null;
  if (paymentTerms !== undefined) payload.paymentTerms = paymentTerms?.trim() || null;
  if (isActive !== undefined) payload.isActive = Boolean(isActive);
  if (rowVersion !== undefined) payload.rowVersion = rowVersion;
  if (Array.isArray(addresses)) payload.addresses = addresses.map(createCustomerAddressDto);

  return payload;
};

/**
 * Formats a CustomerAddressDto
 */
export const createCustomerAddressDto = ({
  id = 0,
  customerId = 0,
  tenantId = 0,
  addressType = 'Billing',
  addressLine1 = '',
  addressLine2,
  city = '',
  state,
  postalCode,
  country = 'USA',
  isDefault = false,
}) => ({
  id,
  customerId,
  tenantId,
  addressType: addressType?.trim() || 'Billing',
  addressLine1: addressLine1?.trim() || '',
  addressLine2: addressLine2?.trim() || null,
  city: city?.trim() || '',
  state: state?.trim() || null,
  postalCode: postalCode?.trim() || null,
  country: country?.trim() || 'USA',
  isDefault: Boolean(isDefault),
});

/**
 * Formats customer query parameters for listing
 */
export const createCustomerQueryParameters = ({
  search,
  isActive,
  sortBy = 'createdat',
  sortOrder = 'desc',
  pageNumber = 1,
  pageSize = 10,
} = {}) => {
  const params = {
    pageNumber: Math.max(1, parseInt(pageNumber, 10) || 1),
    pageSize: Math.max(1, Math.min(100, parseInt(pageSize, 10) || 10)),
    sortBy: sortBy?.trim() || 'createdat',
    sortOrder: sortOrder?.toLowerCase() === 'asc' ? 'asc' : 'desc',
  };

  if (search && search.trim()) {
    params.search = search.trim();
  }

  if (isActive !== undefined && isActive !== null && isActive !== '') {
    params.isActive = Boolean(isActive);
  }

  return params;
};

/**
 * Normalizes customer responses (handles ApiResponse wrapper)
 */
export const parseCustomerResponse = (response) => {
  if (!response) return { success: false, data: null, message: 'No response received' };
  return {
    success: response.success ?? true,
    data: response.data ?? response,
    message: response.message || null,
    errors: response.errors || [],
  };
};

/**
 * Normalizes customer API errors
 */
export const parseCustomerError = (error, fallbackMessage = 'Customer operation failed.') => {
  if (!error) return fallbackMessage;

  if (error.response?.data) {
    const data = error.response.data;
    if (typeof data === 'string') return data;
    if (data.message) return data.message;
    if (data.errors && Array.isArray(data.errors)) return data.errors.join(' ');
    if (data.errors && typeof data.errors === 'object') {
      return Object.values(data.errors).flat().join(' ');
    }
  }

  return error.message || fallbackMessage;
};
