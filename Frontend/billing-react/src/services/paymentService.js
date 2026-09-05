import { fetchDummyPayments } from '../api/paymentsApi';

// TEMPORARY:
// Mapping JSONPlaceholder users into payment-shaped records.
// Remove this mapper when the real Payments API is connected.
export const mapDummyUserToPayment = (user) => ({
  id: user.id,
  customer: user.name,
  email: user.email,
  invoiceNumber: `INV-${1000 + user.id}`,
  method: ['UPI', 'Bank Transfer', 'Credit Card', 'Cheque'][user.id % 4],
  amount: 10000 + user.id * 2500,
  status: 'Completed',
});

export const getPayments = async () => {
  try {
    const users = await fetchDummyPayments();
    return Array.isArray(users) ? users.map(mapDummyUserToPayment) : [];
  } catch (error) {
    // Technical details are logged for developers and never rendered in the UI.
    console.error('Payments API Error:', error);
    throw new Error('Network Error');
  }
};
