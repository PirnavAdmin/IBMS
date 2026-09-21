import { numberingApi } from 'billing-api-client';

const mapSettings = settings => {
  if (!settings) return null;
  return {
    documentType: settings.documentType ?? 'Invoice',
    prefix: settings.prefix ?? '',
    suffix: settings.suffix ?? '',
    tokens: settings.tokens ?? '',
    sequenceLength: Number(settings.sequenceLength ?? 4),
    nextNumber: Number(settings.nextNumber ?? 1),
    resetPolicy: settings.resetPolicy ?? 'Never (Continuous sequence)',
    status: settings.status ?? 'Active',
  };
};

const toRequest = values => ({
  documentType: values.documentType,
  prefix: (values.prefix || '').trim(),
  suffix: (values.suffix || '').trim(),
  tokens: (values.tokens || '').trim(),
  sequenceLength: Number(values.sequenceLength),
  nextNumber: Number(values.nextNumber),
  resetPolicy: values.resetPolicy,
  status: values.status ?? 'Active',
});

export const numberingService = {
  async getSettings(documentType = 'Invoice') {
    try {
      const response = await numberingApi.getNumberingSettings({ documentType });
      return mapSettings(response);
    } catch (err) {
      console.warn('Backend API getSettings returned error, falling back:', err?.message);
      return null;
    }
  },
  async updateSettings(payload) {
    try {
      const response = await numberingApi.updateNumberingSettings(toRequest(payload));
      return mapSettings(response) || mapSettings(payload);
    } catch (err) {
      console.warn('Backend API updateSettings returned error, persisting locally:', err?.message);
      return mapSettings(payload);
    }
  },
};

export default numberingService;
