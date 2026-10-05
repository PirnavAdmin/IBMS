import * as yup from "yup";
export const DOCUMENT_TYPES = ["Invoice", "Quotation", "CreditNote", "Payment"];
export const RESET_POLICIES = [
  "Never",
  "Yearly",
  "Financial Year",
  "Monthly",
  "Daily",
];
export const SUPPORTED_TOKENS = [
  "{YEAR}",
  "{YYYY}",
  "{YY}",
  "{MONTH}",
  "{MM}",
  "{DD}",
  "{FY}",
  "{QUARTER}",
];
export function validTokens(value = "") {
  const tokens = value.match(/\{[^{}]*\}/g) || [];
  if (tokens.some((token) => !SUPPORTED_TOKENS.includes(token.toUpperCase())))
    return false;
  return !/[{}()]/.test(value.replace(/\{[^{}]*\}/g, ""));
}
const expression = (max) =>
  yup
    .string()
    .defined()
    .max(max)
    .test(
      "tokens",
      "Use supported brace tokens only. Unknown tokens are not removed.",
      validTokens,
    );
export const numberingValidationSchema = yup.object({
  documentType: yup.string().required().oneOf(DOCUMENT_TYPES),
  prefix: expression(20),
  suffix: expression(20),
  tokens: expression(30),
  sequenceLength: yup.number().required().integer().min(3).max(10),
  nextNumber: yup.number().required().integer().min(1).max(999999999999),
  resetPolicy: yup.string().required().oneOf(RESET_POLICIES),
  status: yup.string().required().oneOf(["Active", "Inactive"]),
});
