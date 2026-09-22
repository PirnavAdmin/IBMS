import { RESET_POLICIES } from '../validation/numberingValidation.js';
import { numberingApi } from '../../../../../billing-api-client/numberingApi.js';

const mapSettings = settings => {
  if (!settings || typeof settings.documentType !== 'string' || !Number.isInteger(settings.sequenceLength) || !Number.isSafeInteger(settings.nextNumber)) throw new Error('The backend returned invalid numbering settings. Please retry.');
  return {
    documentType: settings.documentType ?? 'Invoice',
    prefix: (settings.prefix ?? '').replace(/\{DD\}/gi, '{DAY}'),
    suffix: (settings.suffix ?? '').replace(/\{DD\}/gi, '{DAY}'),
    tokens: (settings.tokens ?? '').replace(/\{DD\}/gi, '{DAY}'),
    sequenceLength: Number(settings.sequenceLength ?? 4),
    nextNumber: Number(settings.nextNumber ?? 1),
    resetPolicy: RESET_POLICIES.find(policy => policy.split(' (')[0] === settings.resetPolicy?.split(' (')[0]) ?? settings.resetPolicy,
    status: settings.status ?? 'Active',
  };
};

const toRequest = values => ({
  documentType: values.documentType,
  prefix: (values.prefix || '').trim().replace(/\{DAY\}/gi, '{DD}'),
  suffix: (values.suffix || '').trim().replace(/\{DAY\}/gi, '{DD}'),
  tokens: (values.tokens || '').trim().replace(/\{DAY\}/gi, '{DD}'),
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
};

export default numberingService;
