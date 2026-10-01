// TODO: Connect these operations through the shared apiClient only after the
// backend contract, permissions and idempotency semantics are confirmed.
export const PAYMENT_API_AVAILABLE = false;
export const unavailableMessage = 'Payment API is not available yet.';
const unavailable = () => { throw Object.assign(new Error('Payment backend contract unavailable'), { code: 'PAYMENT_CONTRACT_UNAVAILABLE' }); };
export const paymentService = {
  getPayments: unavailable,
  getPaymentById: unavailable,
  createPayment: unavailable,
  reversePayment: unavailable,
  getEligibleInvoices: unavailable,
};
