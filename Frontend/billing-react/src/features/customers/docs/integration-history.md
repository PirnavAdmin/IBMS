# Customer API integration status

Customer runtime reads exclusively from the configured API. There is no fixture/localStorage customer fallback. Existing .env and .env.development already contain VITE_API_BASE_URL.

## Implemented

- Shared Axios client uses billing_auth_token from existing login, strips repeated Bearer prefixes, clears invalid auth and navigates to login on protected 401. No refresh request contract is guessed.
- GET /api/v1/customers with Search, IsActive, PageNumber, PageSize, SortBy, SortOrder; server totals drive pagination.
- GET /api/v1/customers/{id} for Edit; GET /details for all supporting details.
- GET /audit when Audit mounts. Adapter accepts arrays or data.items and displays supplied fields only. Actual deployed schema remains unverified.
- PATCH /deactivate with confirmation and invalidation of list, profile, details and audit caches.
- POST and PUT service transports accept caller-supplied DTOs, but form integration is blocked below.
- Backend financialSummary is authoritative. Invoice/payment arrays remain empty when empty. Statement displays supplied invoices and payments without inventing opening balances, refunds or running balances.

## Backend blockers (2026-09-09)

The supplied ngrok endpoint returns ERR_NGROK_3200. Swagger cannot be read. This checkout's Backend contains no Customer DTOs. There is no Create Customer screen in this checkout. POST/PUT field names, validation constraints, address write format and rowVersion requirements cannot be confirmed. The existing Edit screen loads real data but Save is explicitly disabled until the contract is available. rowVersion is retained unchanged in loaded data. Do not claim complete CRUD integration.

The response supplied by the user does not expose displayName, contactName, mobile, customer type, PAN, tax treatment, preferred payment method or overdue amount. These remain unavailable, without fabricated values. Actual audit field mapping and supported sort fields beyond name require verification. Refresh tokens are not implemented; 401 ends the session.

## Changed files (relative to Frontend)

- billing-api-client/apiClient.js
- billing-api-client/authApi.js
- billing-react/src/pages/Login/Login.jsx
- billing-react/src/services/customerService.js
- billing-react/src/hooks/useCustomer.js
- billing-react/src/pages/Customers/Customers.jsx
- billing-react/src/pages/Customers/CustomerDetailsPage.jsx
- billing-react/src/pages/Customers/EditCustomer.jsx
- billing-react/src/pages/Customers/README.md
- billing-react/src/components/customers/CustomerOverview.jsx
- billing-react/src/components/customers/CustomerShared.jsx
- billing-react/src/components/customers/CustomerTable.jsx
- billing-react/src/components/customers/CustomerTransactions.jsx
- billing-react/src/components/customers/CustomerStatement.jsx
- billing-react/src/components/customers/CustomerAudit.jsx
- billing-react/tests/customers.test.mjs

New source files: none. Existing untracked Customer files were edited in place.
Removed: src/data/customerFixtures.js and components/customers/customerStatementUtils.js (both under billing-react). Fixture tests were replaced with API adapter tests.
Unrelated pre-existing changes were preserved. Sidebar, routes, styles and other modules were not edited by this task.

## Commands (repository root, Windows)

```powershell
npm.cmd run build
node --test Frontend/billing-react/tests/customers.test.mjs
npm.cmd run dev
```

## Manual testing after restoring backend

1. Login with an authorized account. In DevTools Application, check billing_auth_token exists without sharing its value. Verify Customer network requests have exactly one Bearer prefix.
2. Open /customers. Confirm GET /api/v1/customers, data.items and backend totalCount. Search a known name; inspect Search. Select Active and Inactive; inspect IsActive=true/false. Clear filters.
3. Change rows per page and navigate pages; inspect PageNumber/PageSize. Click Name twice; inspect SortBy=name and ascending/descending SortOrder. Verify response ordering.
4. View a customer; confirm numeric /customers/{id} and one /details request. Refresh the URL and confirm it still loads.
5. Compare Overview profile, currency and financial cards with /details. Check Billing/Shipping addresses, including missing address and null line2 cases.
6. Open Invoices and Payments with empty arrays and verify empty states. For populated responses, compare numbers, dates, amounts and statuses. Statement totals must match financialSummary; no synthetic opening/running balance or credits.
7. Open Audit. Confirm /audit is requested and compare action, user, timestamps and changes against actual response. Resolve schema differences when Swagger becomes available.
8. Open Edit; verify GET /customers/{id}. Save is disabled pending the write contract. Create/update end-to-end tests remain blocked; after DTO integration verify POST/PUT payloads and concurrency response.
9. On a disposable authorized customer, open Deactivate, Cancel, and confirm no PATCH. Reopen and confirm: verify PATCH /deactivate, success snackbar, refetched Inactive status, list cache refresh and preserved history.
10. Test expired session (401): auth clears and login opens, without retries. Using a suitable test account/controlled API responses, verify 403 permission error and 404 not-found state. Open /customers/invalid to verify no request is sent.
11. Set browser network Offline and retry. Verify unavailable error, no fixture rows. Restore network and retry. Test backend 400/500 and ngrok offline similarly.
12. Check DevTools console for rendering errors throughout. No live browser checks or live CRUD success can be claimed while backend is offline.

Automated tests use an isolated Axios adapter; test responses are never imported by runtime code.
