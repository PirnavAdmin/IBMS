import * as yup from 'yup';
import { PAYMENT_METHODS } from './paymentService';

export const paymentSchema = yup.object({
  invoice: yup.string().required('Select an eligible invoice.'),
  date: yup.string().required('Payment Date is required.').test('date', 'Enter a valid payment date.', value => {
    if (!value) return true;
    return value >= '2000-01-01' && value <= new Date(Date.now() + 86400000).toISOString().slice(0, 10) && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }),
  amount: yup.number().transform((value, original) => original === '' ? undefined : (value != null ? Math.trunc(value) : value))
    .typeError('Enter a numeric payment amount.').required('Payment Amount is required.')
    .min(0, 'Payment Amount must be at least 0.').max(1000000000, 'Payment Amount must not exceed 1000000000.').test('finite', 'Enter a finite payment amount.', value => value == null || Number.isFinite(value)),
  method: yup.string().oneOf(PAYMENT_METHODS, 'Select a supported payment method.').required('Payment Method is required.'),
  reference: yup.string().trim().max(128).test('reference', 'Transaction reference is required.', function(value) { return !['BankTransfer','UPI','Card','Gateway'].includes(this.parent.method) || Boolean(value || (this.parent.method !== 'BankTransfer' && this.parent.providerTransactionId?.trim())); }),
  bankName: yup.string().trim().max(128), accountLabel: yup.string().trim().max(128), upiPayerMetadata: yup.string().trim().max(256),
  providerTransactionId: yup.string().trim().max(128),
  providerName: yup.string().trim().max(64).when('method', { is: 'Gateway', then: s => s.required('Provider is required.') }),
  chequeNumber: yup.string().trim().max(64).when('method', { is: 'Cheque', then: s => s.required('Cheque Number is required.') }),
  chequeDate: yup.string().when('method', { is: 'Cheque', then: s => s.required('Cheque Date is required.') }),
  customMethodName: yup.string().trim().max(64).when('method', { is: 'Custom', then: s => s.required('Custom Method Name is required.').min(2) }),
  clearingStatus: yup.string().oneOf(['', 'Cleared', 'Uncleared', 'Pending', 'Bounced']),
  callbackStatus: yup.string().oneOf(['', 'Completed', 'Captured', 'Verified', 'Pending', 'Failed']),
  // CreatePaymentRequest limits notes to 1000 characters.
  notes: yup.string().trim().max(1000, 'Notes must not exceed 1000 characters.'),
});
export const reversalSchema = yup.object({ reason: yup.string().trim().required('Reversal Reason is required.').min(3, 'Reason must contain at least 3 characters.').max(500, 'Reason must not exceed 500 characters.') });
export async function validatePayment(schema, values) {
  try { return { values: await schema.validate(values, { abortEarly: false }), errors: {} }; }
  catch (error) {
    if (!error.inner) throw error;
    return { errors: Object.fromEntries(error.inner.map(item => [item.path, item.message])) };
  }
}
