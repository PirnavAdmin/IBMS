// UpdateCustomerRequest: preserve fields outside this form because PUT replaces them.
const updateFields = ['customerCode', 'name', 'email', 'phone', 'companyName', 'taxId', 'address', 'city', 'state', 'postalCode', 'country', 'website', 'notes', 'currency', 'paymentTerms', 'isActive', 'rowVersion'];
export function customerUpdatePayload(customer, values) {
  const payload = Object.fromEntries(updateFields.filter(key => customer[key] !== undefined).map(key => [key, customer[key]]));
  for (const key of ['name', 'email', 'phone', 'website']) payload[key] = (values[key] ?? '').trim();
  // Omit addresses: the backend retains them when this optional property is absent.
  return payload;
}
export function validateCustomerEdit(values) {
  const errors = {};
  const name = (values.name ?? '').trim();
  const email = (values.email ?? '').trim();
  const phone = (values.phone ?? '').trim();
  const website = (values.website ?? '').trim();
  if (name.length < 2 || name.length > 256) errors.name = 'Enter a customer name between 2 and 256 characters.';
  if (email.length > 256 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Enter a valid email address (up to 256 characters).';
  if (phone && (phone.length > 64 || !/^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$/.test(phone))) errors.phone = 'Enter a valid phone number (up to 64 characters).';
  if (website.length > 256) errors.website = 'Website must not exceed 256 characters.';
  else if (website) {
    try { if (!['http:', 'https:'].includes(new URL(website).protocol)) throw new Error(); }
    catch { errors.website = 'Enter a complete http:// or https:// website URL.'; }
  }
  return errors;
}
