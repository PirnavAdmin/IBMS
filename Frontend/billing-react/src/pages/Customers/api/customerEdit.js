import { hasRecognizedEmailDomain } from "../../../utils/authValidation.js";

// UpdateCustomerRequest: preserve fields outside this form because PUT replaces them.
const updateFields = [
  "customerCode",
  "name",
  "email",
  "phone",
  "companyName",
  "taxId",
  "address",
  "city",
  "state",
  "postalCode",
  "country",
  "website",
  "notes",
  "currency",
  "paymentTerms",
  "isActive",
  "rowVersion",
];
export function customerUpdatePayload(customer, values) {
  const payload = Object.fromEntries(
    updateFields
      .filter((key) => customer[key] !== undefined)
      .map((key) => [key, customer[key]])
  );
  for (const key of ["name", "email", "phone", "website"])
    payload[key] = (values[key] ?? "").trim();
  // Omit addresses: the backend retains them when this optional property is absent.
  return payload;
}
export function validateCustomerEdit(values) {
  const errors = {};
  const name = (values.name ?? "").trim();
  const email = (values.email ?? "").trim();
  const phone = (values.phone ?? "").trim();
  const website = (values.website ?? "").trim();
  if (name.length < 2 || name.length > 256)
    errors.name = "Enter a customer name between 2 and 256 characters.";
  else if (/\d/.test(name))
    errors.name = "Customer name must not contain numbers.";
  else if (!/^[\p{L}\p{M}][\p{L}\p{M}\s'-]*$/u.test(name))
    errors.name = "Customer Name should not contain special characters.";
  if (
    email.length > 256 ||
    !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(email) ||
    !hasRecognizedEmailDomain(email)
  )
    errors.email = "Enter a valid email address (up to 256 characters).";
  if (
    phone &&
    (phone.length > 64 ||
      !/^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$/.test(phone))
  )
    errors.phone = "Enter a valid phone number (up to 64 characters).";
  if (website.length > 256)
    errors.website = "Website must not exceed 256 characters.";
  else if (website) {
    if (
      /[<>"'`\\^|{}\s]/.test(website) ||
      !/^(https?:\/\/)?(([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})(:\d{1,5})?(\/[a-zA-Z0-9\-._~%!$&'()*+,;=:@/?#]*)?$/i.test(website)
    ) {
      errors.website = "Please enter a valid website URL.";
    } else {
      try {
        const urlToTest = /^https?:\/\//i.test(website) ? website : `https://${website}`;
        const parsed = new URL(urlToTest);
        if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || !parsed.hostname.includes(".")) {
          throw new Error();
        }
        const labels = parsed.hostname.split(".");
        if (labels.some((l) => !l || l.startsWith("-") || l.endsWith("-"))) {
          throw new Error();
        }
        const tld = labels[labels.length - 1];
        if (!/^[a-zA-Z]{2,}$/.test(tld)) {
          throw new Error();
        }
      } catch {
        errors.website = "Please enter a valid website URL.";
      }
    }
  }
  return errors;
}
