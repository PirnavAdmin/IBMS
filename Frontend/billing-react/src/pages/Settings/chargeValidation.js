const validStatus = (status) => /^(active|inactive)$/i.test(status || '');
export const validateCharge = (charge) => {
  const errors = {};
  if (charge.name.trim().length < 2 || charge.name.trim().length > 128) errors.name = 'Charge name must be 2 to 128 characters.';
  if (charge.code.trim().length < 2 || charge.code.trim().length > 64) errors.code = 'Charge code must be 2 to 64 characters.';
  if (!charge.type) errors.type = 'Charge type is required.';
  if (!charge.calculationType) errors.calculationType = 'Calculation type is required.';
  if (charge.value === '' || !Number.isFinite(Number(charge.value)) || Number(charge.value) < 0 || Number(charge.value) > 99999999.99) errors.value = 'Enter a value from 0 to 99,999,999.99.';
  if (charge.calculationType === 'Percentage' && Number(charge.value) > 100) errors.value = 'Percentage cannot exceed 100.';
  if (!validStatus(charge.status)) errors.status = 'Select Active or Inactive.';
  if (charge.description.length > 500) errors.description = 'Description cannot exceed 500 characters.';
  for (const key of ['minInvoiceAmount', 'maxChargeAmount']) {
    if (charge[key] != null && charge[key] !== '' && (!Number.isFinite(Number(charge[key])) || Number(charge[key]) < 0 || Number(charge[key]) > 99999999.99)) errors[key] = 'Enter an amount from 0 to 99,999,999.99, or leave blank.';
  }
  if ((charge.taxCategory || '').trim().length > 64) errors.taxCategory = 'Tax category cannot exceed 64 characters.';
  return errors;
};
