export const TAX_TYPES = ['GST', 'CGST', 'SGST', 'IGST', 'VAT', 'Custom Tax'];
export const emptyTax = () => ({ name: '', code: '', type: '', rate: '', calculation: 'Exclusive', priority: '1', effectiveFrom: '', effectiveTo: '', status: 'Active' });

export const TAX_NAME_REGEX = /^[\p{L}\p{M}0-9\s\-_()]+$/u;
export const TAX_CODE_REGEX = /^[a-zA-Z0-9\-_]+$/;

export function validateTaxName(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) {
    return 'Tax name is required.';
  }
  if (trimmed.length < 2) {
    return 'Tax name must be at least 2 characters.';
  }
  if (trimmed.length > 100) {
    return 'Tax name cannot exceed 100 characters.';
  }
  if (!TAX_NAME_REGEX.test(trimmed)) {
    return 'Tax name can only contain letters, numbers, spaces, hyphens, and parentheses.';
  }
  if (!/^[\p{L}\p{M}0-9]/u.test(trimmed)) {
    return 'Tax name must start with a letter or number.';
  }
  if (/[-_]{2,}/.test(trimmed)) {
    return 'Tax name cannot contain consecutive special characters.';
  }
  return '';
}

export function validateTaxCode(code) {
  const trimmed = String(code ?? '').trim();
  if (!trimmed) {
    return 'Tax code is required.';
  }
  if (trimmed.length < 2) {
    return 'Tax code must be at least 2 characters.';
  }
  if (trimmed.length > 64) {
    return 'Tax code cannot exceed 64 characters.';
  }
  if (!TAX_CODE_REGEX.test(trimmed)) {
    return 'Tax code can only contain letters, numbers, hyphens, and underscores.';
  }
  if (!/^[a-zA-Z0-9]/.test(trimmed)) {
    return 'Tax code must start with a letter or number.';
  }
  if (/[-_]{2,}/.test(trimmed)) {
    return 'Tax code cannot contain consecutive special characters.';
  }
  return '';
}

export function validateTaxRate(rate) {
  const raw = String(rate ?? '').trim();
  if (!raw) {
    return 'Tax rate is required.';
  }
  if (/[a-zA-Z]/.test(raw)) {
    return 'Tax rate must be a valid numeric value without alphabetic characters.';
  }
  if (/^-\d+(?:\.\d+)?$/.test(raw)) {
    return 'Enter a percentage from 0 to 100.';
  }
  if (!/^\d+(?:\.\d+)?$/.test(raw)) {
    return 'Enter a valid numeric tax rate from 0 to 100.';
  }
  if (raw.includes('.') && raw.split('.')[1].length > 2) {
    return 'Tax rate can have at most 2 decimal places.';
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    return 'Enter a percentage from 0 to 100.';
  }
  if (raw.split('.')[0].length > 3) {
    return 'Enter a valid tax rate from 0 to 100.';
  }
  return '';
}

/** Validates rate while typing, deferring empty or mid-decimal ("18.") states until blur or submit. */
export function getLiveTaxRateError(rate) {
  const raw = String(rate ?? '').trim();
  if (!raw) return '';
  if (/^\d{1,3}\.$/.test(raw) && Number(raw.slice(0, -1)) <= 100) {
    return '';
  }
  return validateTaxRate(raw);
}

export function validateTax(values) {
  const errors = {};
  const nameError = validateTaxName(values.name);
  if (nameError) errors.name = nameError;
  const codeError = validateTaxCode(values.code);
  if (codeError) errors.code = codeError;
  for (const [key, label] of [['effectiveFrom', 'Effective from']]) {
    if (!String(values[key] ?? '').trim()) errors[key] = `${label} is required.`;
  }
  if (!TAX_TYPES.includes(values.type)) errors.type = 'Select a tax type.';
  const rateError = validateTaxRate(values.rate);
  if (rateError) errors.rate = rateError;
  if (String(values.priority).trim() === '' || !Number.isSafeInteger(Number(values.priority)) || Number(values.priority) < 1) errors.priority = 'Enter a whole number starting from 1.';
  if (!['Inclusive', 'Exclusive'].includes(values.calculation)) errors.calculation = 'Select a calculation method.';
  if (!['Active', 'Inactive'].includes(values.status)) errors.status = 'Select a status.';
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (values.effectiveFrom && !validDate(values.effectiveFrom)) errors.effectiveFrom = 'Enter a valid date.';
  if (values.effectiveTo && !validDate(values.effectiveTo)) errors.effectiveTo = 'Enter a valid date.';
  else if (values.effectiveTo && values.effectiveTo < values.effectiveFrom) errors.effectiveTo = 'End date cannot be earlier than start date.';
  return errors;
}

export function calculatePreview(amount, rate, calculation, type, transaction) {
  if (String(amount).trim() === '' || validateTaxRate(rate) !== '' || !Number.isFinite(Number(amount)) || Number(amount) < 0 || Number(amount) > 1e12) return null;
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const input = round(Number(amount));
  const percent = Number(rate);
  const tax = round(calculation === 'Inclusive' ? input * percent / (100 + percent) : input * percent / 100);
  const taxable = calculation === 'Inclusive' ? round(input - tax) : input;
  const total = calculation === 'Inclusive' ? input : round(input + tax);
  const split = round(tax / 2);
  const lines = type === 'GST' && transaction === 'Intra-State'
    ? [{ label: `CGST (${percent / 2}%)`, amount: split }, { label: `SGST (${percent / 2}%)`, amount: round(tax - split) }]
    : [{ label: `${type === 'GST' ? 'IGST' : type} (${percent}%)`, amount: tax }];
  return { taxable, tax, total, lines };
}
