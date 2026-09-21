import { numberingApi } from 'billing-api-client';

const mapSettings = settings => ({
  documentType: settings.documentType ?? 'Invoice',
  prefix: settings.prefix ?? '',
  suffix: settings.suffix ?? '',
  tokens: settings.tokens ?? '',
  sequenceLength: Number(settings.sequenceLength ?? 4),
  nextNumber: Number(settings.nextNumber ?? 1),
  resetPolicy: settings.resetPolicy ?? 'Financial Year',
  status: settings.status ?? 'Active',
});

const toRequest = values => ({
  documentType: values.documentType,
  prefix: values.prefix.trim(),
  suffix: values.suffix.trim(),
  tokens: values.tokens.trim(),
  sequenceLength: Number(values.sequenceLength),
  nextNumber: Number(values.nextNumber),
  resetPolicy: values.resetPolicy,
  status: values.status ?? 'Active',
});

export const numberingService = {
  async getSettings(documentType = 'Invoice') {
    return mapSettings(await numberingApi.getNumberingSettings({ documentType }));
  },
  async updateSettings(payload) {
    return mapSettings(await numberingApi.updateNumberingSettings(toRequest(payload)));
  },
};

export default numberingService;
