import { apiClient } from "../../../../../billing-api-client/apiClient.js";
import { numberingApi } from "../../../../../billing-api-client/numberingApi.js";
function mapSettings(data) {
  if (
    !data ||
    typeof data.documentType !== "string" ||
    !Number.isInteger(data.sequenceLength) ||
    !Number.isSafeInteger(data.nextNumber)
  )
    throw new Error(
      "The backend returned invalid numbering settings. Please retry.",
    );
  return { ...data };
}
export function numberingRequest(values) {
  return {
    documentType: values.documentType,
    prefix: values.prefix,
    suffix: values.suffix,
    tokens: values.tokens,
    sequenceLength: Number(values.sequenceLength),
    nextNumber: Number(values.nextNumber),
    resetPolicy: values.resetPolicy,
    status: values.status,
  };
}
export const numberingService = {
  async getSettings(documentType = "Invoice") {
    return mapSettings(
      await numberingApi.getNumberingSettings({ documentType }),
    );
  },
  async updateSettings(values) {
    return mapSettings(
      await numberingApi.updateNumberingSettings(numberingRequest(values)),
    );
  },
  async preview(values) {
    const response = await apiClient.post(
      "/api/v1/settings/numbering/preview",
      {
        documentType: values.documentType,
        prefix: values.prefix,
        suffix: values.suffix,
        tokens: values.tokens,
        sequenceLength: Number(values.sequenceLength),
        nextNumber: Number(values.nextNumber),
        ...(values.date ? { date: values.date } : {}),
      },
    );
    if (
      response?.success !== true ||
      typeof response.data?.fullPreview !== "string"
    )
      throw new Error(
        response?.message || "Invalid numbering preview response.",
      );
    return response.data;
  },
};
export default numberingService;
