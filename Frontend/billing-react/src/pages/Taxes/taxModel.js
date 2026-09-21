export const TAX_TYPES = ['GST', 'CGST', 'SGST', 'IGST', 'VAT', 'Custom Tax'];
export const emptyTax = () => ({ name: '', code: '', type: '', rate: '', calculation: 'Exclusive', priority: '1', effectiveFrom: '', effectiveTo: '', status: 'Active' });

export function validateTax(values) {
  const errors = {};
  for (const [key, label] of [['name', 'Tax name'], ['code', 'Tax code'], ['effectiveFrom', 'Effective from']]) {
    if (!String(values[key] ?? '').trim()) errors[key] = `${label} is required.`;
  }
  if (!TAX_TYPES.includes(values.type)) errors.type = 'Select a tax type.';
  if (String(values.rate).trim() === '' || !Number.isFinite(Number(values.rate)) || Number(values.rate) < 0 || Number(values.rate) > 100) errors.rate = 'Enter a percentage from 0 to 100.';
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
  if (String(amount).trim() === '' || String(rate).trim() === '' || !Number.isFinite(Number(amount)) || Number(amount) < 0 || Number(amount) > 1e12 || !Number.isFinite(Number(rate)) || Number(rate) < 0 || Number(rate) > 100) return null;
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
