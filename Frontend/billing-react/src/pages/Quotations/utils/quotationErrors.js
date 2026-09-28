import { parseCustomerError } from 'billing-contracts/customer.contracts.js';

// Share the customer module's network, server, and safe validation messages.
export function quotationErrorMessage(error) {
  const message = parseCustomerError(error, 'Unable to complete the quotation request. Please try again.');
  const quotationMessages = {
    'Invalid customer ID.': 'Invalid quotation ID.',
    'Invalid customer data. Please review the highlighted fields.': 'Invalid quotation data. Please review the highlighted fields.',
    'The requested customer was not found.': 'The requested quotation was not found.',
    'This customer has changed or conflicts with another record. Reload and try again.': 'This quotation has changed or conflicts with another record. Reload and try again.',
  };
  return quotationMessages[message] || message;
}
