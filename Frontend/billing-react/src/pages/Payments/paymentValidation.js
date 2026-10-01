import * as yup from 'yup';

export const paymentSchema = yup.object({
  invoice: yup.string().required('Select an eligible invoice.'),
  date: yup.string().required('Payment Date is required.').test('date', 'Enter a valid payment date.', value => {
    if (!value) return true;
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }),
  amount: yup.number().transform((value, original) => original === '' ? undefined : value)
    .typeError('Enter a numeric payment amount.').required('Payment Amount is required.')
    .moreThan(0, 'Payment Amount must be greater than 0.').test('finite', 'Enter a finite payment amount.', value => value == null || Number.isFinite(value)),
  method: yup.string().required('Payment methods are awaiting backend integration.'),
  reference: yup.string().trim(),
  // Frontend limit follows Customer notes; backend limit remains pending.
  notes: yup.string().trim().max(1000, 'Notes must not exceed 1000 characters.'),
});
export const reversalSchema = yup.object({ reason: yup.string().trim().required('Reversal Reason is required.') });
export async function validatePayment(schema, values) {
  try { return { values: await schema.validate(values, { abortEarly: false }), errors: {} }; }
  catch (error) {
    if (!error.inner) throw error;
    return { errors: Object.fromEntries(error.inner.map(item => [item.path, item.message])) };
  }
}
