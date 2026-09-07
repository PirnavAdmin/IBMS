import { apiClient } from 'billing-api-client';

// TEMPORARY DUMMY API
// Used only for testing Payments API integration.
// Replace this URL with the real backend Payments API later.
//
// WORKING TEST API:
// https://jsonplaceholder.typicode.com/users
//
// BROKEN API TEST:
// Replace the working URL temporarily with the following unreachable URL to
// test a real connection failure, then restore the working URL afterward:
// http://localhost:59999/api/payments
// 


export const DUMMY_PAYMENTS_API = 'https://jsonplaceholder.typicode.com/users';

// ================================================================
// TEST ONLY — CHANGE false TO true TO SIMULATE A BACKEND FAILURE.
// Change it back to false to use the working dummy API.
// Remove this switch when the real Payments API is integrated.
// ================================================================
export const FORCE_API_ERROR =  false;

export const fetchDummyPayments = async () => {
  if (FORCE_API_ERROR) throw new Error('FORCED_API_FAILURE');
  return apiClient.get(DUMMY_PAYMENTS_API);
};
