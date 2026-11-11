const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;
const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;

// Keep the overview consistent with the editor's existing API compatibility
// rules: taxId stores either PAN or GSTIN, not necessarily a separate status.
export function customerTaxRegistrationType(values = {}) { if (!values || typeof values !== 'object') return '';
  const provided = String(values.taxRegistrationType ?? values.TaxRegistrationType ?? values.taxRegistration ?? values.TaxRegistration ?? '').trim().toLowerCase();
  if (['non-gst', 'unregistered'].includes(provided)) return 'non-gst';
  if (['gst', 'registered'].includes(provided)) return 'gst';
  if (provided) return provided;
  const rawTax = String(values.taxId || values.gstin || values.pan || '').trim();
  if (gstinPattern.test(rawTax) || gstinPattern.test(String(values.gstin || '').trim())) return 'gst';
  if (panPattern.test(rawTax) || values.pan) return 'non-gst';
  // Preserve the editor's default for an existing customer with no tax ID.
  if (!rawTax && values.id) return 'non-gst';
  return '';
}

export function customerTaxRegistrationLabel(values) {
  const type = customerTaxRegistrationType(values);
  return type === 'gst' ? 'GST Registered' : type === 'non-gst' ? 'Non-GST / Unregistered' : '—';
}
