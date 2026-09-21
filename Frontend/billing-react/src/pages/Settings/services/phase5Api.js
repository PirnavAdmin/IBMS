import { apiClient } from '../../../../../billing-api-client/apiClient.js';

const safeText = (value) => typeof value === 'string' && value.length <= 500 && !/[<>]|\bat System\.|\bstack trace\b/i.test(value) ? value : '';
export const phase5Error = (error) => {
  const status = error?.response?.status;
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status >= 500) return 'The server could not complete the request. Please try again.';
  const data = error?.response?.data;
  if (status === 409 && /concurrenc|expected to affect|modified or deleted/i.test(JSON.stringify(data))) return 'The server reported a conflicting update. Your changes have been kept. Refresh the record and try again.';
  const details = data?.errors && typeof data.errors === 'object' ? Object.values(data.errors).flat().map(safeText).filter(Boolean).join(' ') : '';
  return details || safeText(data?.message) || safeText(data?.title) ||
    (status === 404 ? 'The requested record was not found. Refresh and try again.' :
      status === 409 ? 'This record conflicts with an existing record. Check the code and try again.' :
        error?.message === 'Network Error' ? 'Unable to reach the backend. Check your connection and try again.' : safeText(error?.message) || 'The request failed. Please try again.');
};

const request = async (operation) => {
  try { return await operation(); } catch (error) { throw new Error(phase5Error(error), { cause: error }); }
};

const unwrap = (response) => {
  if (response?.success === false) throw new Error(phase5Error({ response: { data: response } }));
  if (!response || !Object.hasOwn(response, 'data')) throw new Error('The backend returned an unexpected response.');
  return response?.data;
};

const chargePath = '/api/v1/settings/charges';
const discountPath = '/api/v1/discounts/rules';
const discountSettingsPath = '/api/v1/settings/discounts';
const validStatus = (status) => /^(active|inactive)$/i.test(status || '');

export const chargeFromApi = (item) => ({
  id: item.id, name: item.name, code: item.code, description: item.description || '',
  type: item.chargeType, calculationType: item.calculationType, value: item.amount,
  taxable: item.isTaxable, status: normalizeStatus(item.status),
  minInvoiceAmount: item.minInvoiceAmount, maxChargeAmount: item.maxChargeAmount,
  taxCategory: item.taxCategory, rowVersion: item.rowVersion,
});

// Status is free text in the backend. Preserve unknown values so bad data remains visible.
export const normalizeStatus = (status) => /^(active|inactive)$/i.test(status || '')
  ? status.toLowerCase() === 'active' ? 'Active' : 'Inactive' : status;
export const discountTypes = { Percentage: 'Percentage', FixedAmount: 'Fixed Amount' };
export const discountScopes = { Invoice: 'Invoice Level', LineItem: 'Line Level' };
const optionalNumber = (value) => value === '' || value == null ? null : Number(value);
export const discountRuleToApi = (form, update = false) => ({
  name: form.name.trim(), description: form.description?.trim() || null, value: Number(form.value),
  minInvoiceAmount: optionalNumber(form.minInvoiceAmount), maxDiscountAmount: optionalNumber(form.maxDiscountAmount),
  startDateUtc: form.startDateUtc || null, endDateUtc: form.endDateUtc || null,
  applicableRole: form.applicableRole?.trim() || null,
  ...(update ? { status: form.status } : { code: form.code.trim().toUpperCase(), type: form.type, scope: form.scope }),
});

export const validateDiscountRule = (form) => {
  const errors = {};
  for (const [key, limit] of [['name', 128], ['code', 64]]) {
    if (!form[key]?.trim() || form[key].trim().length > limit) errors[key] = `Enter ${key} (1–${limit} characters).`;
  }
  if (!discountTypes[form.type] || !discountScopes[form.scope]) errors.type = 'Select a supported type and application level.';
  if (!Number.isFinite(Number(form.value)) || Number(form.value) <= 0 || (form.type === 'Percentage' && Number(form.value) > 100)) errors.value = form.type === 'Percentage' ? 'Enter a percentage greater than 0 and no more than 100.' : 'Enter a value greater than 0.';
  for (const key of ['minInvoiceAmount', 'maxDiscountAmount']) {
    if (form[key] != null && form[key] !== '' && (!Number.isFinite(Number(form[key])) || Number(form[key]) < 0)) errors[key] = 'Enter a non-negative amount.';
  }
  if (form.description?.length > 500) errors.description = 'Description cannot exceed 500 characters.';
  if (form.applicableRole?.length > 64) errors.applicableRole = 'Role cannot exceed 64 characters.';
  if (form.startDateUtc && !Number.isFinite(Date.parse(form.startDateUtc))) errors.startDateUtc = 'Enter a valid UTC date.';
  if (form.endDateUtc && (!Number.isFinite(Date.parse(form.endDateUtc)) || (form.startDateUtc && Date.parse(form.endDateUtc) < Date.parse(form.startDateUtc)))) errors.endDateUtc = 'End date must be valid and on or after the start date.';
  return errors;
};

export const chargeToApi = (form, update = false) => ({
  name: form.name.trim(), code: form.code.trim().toUpperCase(),
  description: form.description.trim() || null, chargeType: form.type,
  calculationType: form.calculationType, amount: Number(form.value),
  minInvoiceAmount: form.minInvoiceAmount ?? null,
  maxChargeAmount: form.maxChargeAmount ?? null,
  isTaxable: form.taxable, taxCategory: form.taxCategory ?? null,
  status: form.status,
  ...(update ? { rowVersion: form.rowVersion } : {}),
});

export const discountConfigurationFromApi = (item) => ({
  id: item.id, status: normalizeStatus(item.status), maximumType: item.maximumType,
  maximumValue: item.maximumValue, discountType: item.discountType,
  applicationLevel: item.applicationLevel, allowLineLevel: item.allowLineLevel,
  allowInvoiceLevel: item.allowInvoiceLevel, enforceMaximum: item.enforceMaximum,
  allowManualOverride: item.allowManualOverride, requireOverrideReason: item.requireOverrideReason,
  minimumReasonLength: item.minimumReasonLength, rowVersion: item.rowVersion,
});

export const discountConfigurationToApi = (form) => ({
  status: form.status, maximumType: form.maximumType, maximumValue: Number(form.maximumValue),
  discountType: form.discountType, applicationLevel: form.applicationLevel,
  allowLineLevel: form.allowLineLevel, allowInvoiceLevel: form.allowInvoiceLevel,
  enforceMaximum: form.enforceMaximum, allowManualOverride: form.allowManualOverride,
  requireOverrideReason: form.requireOverrideReason,
  minimumReasonLength: Number(form.minimumReasonLength), rowVersion: form.rowVersion,
});

export const validateDiscountConfiguration = (form) => {
  const errors = {};
  if (!validStatus(form.status)) errors.status = 'Select Active or Inactive.';
  if (!['Percentage', 'Fixed Amount', 'Fixed'].includes(form.maximumType)) errors.maximumType = 'Select a valid maximum type.';
  if (!Number.isFinite(Number(form.maximumValue)) || Number(form.maximumValue) <= 0 || (form.maximumType === 'Percentage' && Number(form.maximumValue) > 100)) errors.maximumValue = 'Enter a valid maximum value.';
  if (form.requireOverrideReason && (!Number.isInteger(Number(form.minimumReasonLength)) || Number(form.minimumReasonLength) < 1)) errors.minimumReasonLength = 'A positive minimum reason length is required.';
  return errors;
};

export const validateRolePermissions = (roles) => roles.reduce((errors, role) => {
  if (!validStatus(role.status)) errors[role.id] = 'Role status must be Active or Inactive.';
  else if (!Number.isFinite(Number(role.maximum)) || Number(role.maximum) < 0) errors[role.id] = 'Maximum must be a non-negative number.';
  return errors;
}, {});

const operations = {
  getCharges: async () => unwrap(await apiClient.get(chargePath)).map(chargeFromApi),
  createCharge: async (form) => chargeFromApi(unwrap(await apiClient.post(chargePath, chargeToApi(form)))),
  updateCharge: async (form) => chargeFromApi(unwrap(await apiClient.put(`${chargePath}/${form.id}`, chargeToApi(form, true)))),
  deleteCharge: async (id) => unwrap(await apiClient.delete(`${chargePath}/${id}`)),
  calculateCharges: async ({ subtotal, selectedChargeCodes, selectedChargeIds }) => unwrap(await apiClient.post(`${chargePath}/calculate`, { subtotal, selectedChargeCodes, selectedChargeIds })),
  getDiscountRules: async (page = 1, pageSize = 100) => unwrap(await apiClient.get(discountPath, { params: { page, pageSize } })),
  getDiscountRule: async (id) => unwrap(await apiClient.get(`${discountPath}/${id}`)),
  createDiscountRule: async (form) => unwrap(await apiClient.post(discountPath, discountRuleToApi(form))),
  updateDiscountRule: async (id, form) => unwrap(await apiClient.put(`${discountPath}/${id}`, discountRuleToApi(form, true))),
  deleteDiscountRule: async (id) => unwrap(await apiClient.delete(`${discountPath}/${id}`)),
  getDiscountConfiguration: async () => discountConfigurationFromApi(unwrap(await apiClient.get(discountSettingsPath))),
  updateDiscountConfiguration: async (form) => discountConfigurationFromApi(unwrap(await apiClient.put(discountSettingsPath, discountConfigurationToApi(form)))),
  getDiscountRolePermissions: async () => unwrap(await apiClient.get(`${discountSettingsPath}/roles`)),
  updateDiscountRolePermissions: async (roles) => unwrap(await apiClient.put(`${discountSettingsPath}/roles`, { roles: roles.map(({ id, role, canApply, maximum, canOverride, requiresReason, status }) => ({ id, role, canApply, maximum: Number(maximum), canOverride, requiresReason, status })) })),
  validateMaximumDiscount: async ({ role, value, isManualOverride = false, overrideReason = null, discountType, invoiceAmount }) => unwrap(await apiClient.post(`${discountSettingsPath}/validate-max`, { role: role || null, value: Number(value), isManualOverride, overrideReason, ...(discountType ? { discountType } : {}), ...(invoiceAmount == null ? {} : { invoiceAmount: Number(invoiceAmount) }) })),
};
export const phase5Api = Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, (...args) => request(() => operation(...args))]));
