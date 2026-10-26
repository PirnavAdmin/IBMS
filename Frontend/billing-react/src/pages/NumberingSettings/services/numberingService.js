import { RESET_POLICIES } from '../validation/numberingValidation.js';
import { normalizeNumberingTokens } from '../validation/numberingTokens.js';
import { numberingApi } from '../../../../../billing-api-client/numberingApi.js';
import { apiClient } from '../../../../../billing-api-client/apiClient.js';

const mapSettings = settings => {
  if (!settings || typeof settings.documentType !== 'string' || !Number.isInteger(settings.sequenceLength) || !Number.isSafeInteger(settings.nextNumber)) throw new Error('The backend returned invalid numbering settings. Please retry.');
  return {
    documentType: settings.documentType ?? 'Invoice',
    prefix: normalizeNumberingTokens(settings.prefix ?? ''),
    suffix: normalizeNumberingTokens(settings.suffix ?? ''),
    tokens: normalizeNumberingTokens(settings.tokens ?? ''),
    rowVersion: settings.rowVersion ?? null,
    sequenceLength: Number(settings.sequenceLength ?? 4),
    nextNumber: Number(settings.nextNumber ?? 1),
    resetPolicy: RESET_POLICIES.find(policy => policy.split(' (')[0] === settings.resetPolicy?.split(' (')[0]) ?? settings.resetPolicy,
    status: settings.status ?? 'Active',
  };
};

const toRequest = values => ({
  documentType: values.documentType,
  prefix: normalizeNumberingTokens(values.prefix || '').trim(),
  suffix: normalizeNumberingTokens(values.suffix || '').trim(),
  tokens: normalizeNumberingTokens(values.tokens || '').trim(),
  rowVersion: values.rowVersion ?? null,
  sequenceLength: Number(values.sequenceLength),
  nextNumber: Number(values.nextNumber),
  resetPolicy: values.resetPolicy.split(' (')[0],
  status: values.status ?? 'Active',
});

export const numberingService = {
  async getSettings(documentType = 'Invoice') {
    return mapSettings(await numberingApi.getNumberingSettings({ documentType }));
  },
  async updateSettings(payload) {
    return mapSettings(await numberingApi.updateNumberingSettings(toRequest(payload)));
  },
  async preview(values) {
    const response = await apiClient.post('/api/v1/settings/numbering/preview', {
      documentType: values.documentType,
      prefix: normalizeNumberingTokens(values.prefix ?? ''),
      suffix: normalizeNumberingTokens(values.suffix ?? ''),
      tokens: normalizeNumberingTokens(values.tokens ?? ''),
      sequenceLength: Number(values.sequenceLength),
      nextNumber: Number(values.nextNumber),
      ...(values.date ? { date: values.date } : {}),
    });
    if (response?.success !== true || typeof response.data?.fullPreview !== 'string') {
      throw new Error(response?.message || 'Invalid numbering preview response.');
    }
    return response.data;
  },
};

export default numberingService;
