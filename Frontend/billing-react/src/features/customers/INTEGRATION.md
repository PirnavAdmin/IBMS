# Customer API integration handoff

The Customer module now uses the real service exclusively. Styling, sidebar, routing architecture, Dashboard, Invoice, Payment and Login were not modified by this integration.

## Verified backend contract and remaining blockers

Source: https://pediatric-astrology-outrank.ngrok-free.dev/swagger/v1/swagger.json, inspected September 9, 2026. The exact Customer-only snapshot is in `backend-contract.json`.

The deployed GET list contract accepts **pageNumber**, **pageSize**, and **status** (`Active`, `Inactive`, `All`). It does **not** expose Search/IsActive/CustomerType/TaxId/SortBy/SortDirection, in either casing. Search, type/tax/outstanding filters and sortable headers remain in the UI but are disabled. No request pretends to implement them, and no frontend array is filtered or sorted as a substitute. The 450 ms search debounce and page reset handlers remain ready for an updated contract. Updating capability flags alone is insufficient: implement the verified parameter mapping in customerQuery when the backend adds them.

The API returned HTTP 401 to a read-only unauthenticated GET. Swagger describes 200 responses without any response schemas. Consequently, authenticated response field names and mutation behavior remain unverified. No account was created, no credentials were invented, and no customer was written or deleted to test the integration.

The defensive response adapter accepts `{ items, totalCount, pageNumber, pageSize }` or `{ data: { ... } }`. Detail responses may be an object, `data`, `customer`, or `profile`. It explicitly checks numeric `id`/`customerId` and required pagination totals. Unexpected envelopes produce a visible error rather than an empty fake result. These response mappings are provisional until a real authenticated response is available; the code comments and errors state this limitation.

## DTO mismatches

- UI `mobile` maps to documented `phone`.
- Backend has one `taxId`, not separate `gstin` and PAN fields. A GST-format taxId displays in GSTIN; other values display in PAN / Registration ID. Supplying both is rejected with a message, preventing silent loss.
- Create/update DTOs do not include customerType or creditLimit. Their existing form controls are disabled with explanatory text. Missing returned values are not fabricated.
- Status filtering uses `status=Active|Inactive|All`, not `IsActive=true|false`.
- Update allows `status` and `isActive`. The existing Activate action uses PUT with those fields; there is no invented `/activate` endpoint. Confirm this status transition in authenticated testing.
- IDs are int32 in Swagger, not browser UUIDs.
- PUT preserves the originally loaded customerCode, addresses, address/city/state/postalCode/country, website, status/isActive and rowVersion. It does not clear backend-only fields. The original rowVersion is retained so the backend can reject concurrent edits.
- Create omits customerCode, since the form does not collect it and Swagger marks it nullable. Server-generated codes need authenticated verification; no client-generated code is invented.
- No aggregate outstanding endpoint is documented. Total Outstanding displays a dash. Total/Active/Inactive counts come from three server list totals, never the current page count.
- Unknown returned statuses display Unknown and disable status/invoice actions. Missing balances display a dash, not zero.
- DELETE is documented as a soft deactivation operation. A service function is available but no Delete button was added.

## Base URL and authentication

The existing, unchanged `Frontend/billing-api-client/apiClient.js` owns the configuration:

```js
export const BACKEND_URL = 'https://pediatric-astrology-outrank.ngrok-free.dev';
export const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || BACKEND_URL;
```

Set `VITE_API_BASE_URL` in `Frontend/billing-react/.env.local` to override it, then restart Vite. No environment file was changed. The existing client attaches `Authorization: Bearer <billing_auth_token>`, `Content-Type: application/json`, and `ngrok-skip-browser-warning: true`. Customer requests also specify `Accept: application/json`. Existing response unwrapping is reused (no duplicate `.data` Axios unwrap).

No separate TenantId/ApplicationId header implementation exists in this client. No fake values were added. If the backend needs additional headers beyond JWT tenant claims, attach genuine authenticated values in this existing request interceptor after confirming their contract.

If DevTools reports CORS, configure the backend to allow the actual frontend origin (Vite currently uses port 3000), Authorization, Content-Type, Accept, the ngrok header, and the required methods. Network errors are not automatically diagnosed as CORS. React does not bypass CORS.

## Requests used

| Action | Request |
| --- | --- |
| List / status / paging | GET /api/v1/customers?pageNumber=1&pageSize=10&status=All |
| Edit load | GET /api/v1/customers/{id} |
| View | GET /api/v1/customers/{id}/details |
| Create | POST /api/v1/customers |
| Edit save | PUT /api/v1/customers/{id} |
| Deactivate | PATCH /api/v1/customers/{id}/deactivate |
| Existing Activate | GET profile, then PUT profile with status Active and isActive true |
| Delete service only | DELETE /api/v1/customers/{id} |

Create/edit return to the list, invalidate Customer queries and show a success snackbar. They do not assume the POST/PUT response contains an ID. Status changes retain the confirmation dialog and invalidate list/detail/summary caches. Existing invoice navigation still passes customerId; the Invoice module was not modified.

## Mock removal

Removed the 24 seeded customers, generated browser IDs/codes, localStorage reads/writes used for CRUD, local filtering/sorting/pagination, and sample-workspace footer. The obsolete `ibms.customers.demo.v1` browser entry is removed when the new service module loads; nothing else in localStorage is cleared. API failures never fall back to local records. Synthetic unit-test fixtures are test-only and never imported by runtime code. No unrelated module data was removed.

## Files changed or added

All are under `Frontend/billing-react/src/features/customers/`:

1. customerApi.ts — real requests using the existing shared client.
2. customerContract.ts — query/DTO/response mapping and capability flags.
3. types.ts — nullable real-data models and documented write DTO.
4. useCustomers.ts — cancellable queries, server summary counts, invalidation.
5. CustomerListPage.tsx — API states, server metadata, unavailable-control handling and success notification.
6. CustomerRecordPage.tsx — real detail/edit requests and save navigation, preserved validation.
7. customerApi.test.mjs — contract tests replacing local-store tests.
8. backend-contract.json — exact Customer subset of deployed Swagger.
9. INTEGRATION.md — this handoff.
10. FINAL_CODE.md — complete source snapshots of files 1–8, without omitted sections.

`customers.css` was not changed in this integration.

## How to test

Start the backend and sign in through the existing Login page. Open DevTools Network, filter for `customers`, and visit `/customers` without old mock search/sort parameters. If an old URL has unsupported filters, use Reset filters.

| Feature | Check |
| --- | --- |
| Customer list | GET returns 200; compare each displayed value and real ID to the response. An unsupported response shape must show a clear error and Retry. |
| Empty state | Use a tenant/status with no records; confirm the backend total is zero and the existing empty state appears. |
| Search | Currently blocked by the deployed contract. Control stays visible but disabled; no fake matching occurs. Requires a supported backend search parameter. |
| Status | Select Active/Inactive/All; verify status enum query, page reset to 1, and corresponding records. |
| Customer Type | Currently blocked; backend must add a typed query parameter and response/DTO field. |
| Tax ID filter | Currently blocked; backend must define how registration categories map to a filter. Tax ID form fields still persist through the documented taxId field. |
| Outstanding filter | Currently blocked; requires a backend parameter. |
| Pagination | With more than one page, select next/previous/page number; verify a new pageNumber request and backend totalCount. |
| Page size | Choose 25/50/100; verify pageNumber=1 and exact pageSize; no local slicing. |
| Sorting | Currently blocked; backend must define sortable fields and direction parameter. Clicking headers must not reorder only one page. |
| Create | Fill required name/email/mobile and supported billing fields; submit. Verify POST JSON uses phone/taxId, success snackbar, refreshed list, server ID/code and persistence after reload. |
| View | Click eye icon; verify GET /{real-id}/details and returned profile/financial data. |
| Edit | Open pencil icon; verify GET profile prefill. Change supported fields, save; verify PUT and persistence after reload. Check addresses/code/rowVersion are retained. |
| Deactivate | Cancel dialog first (no PATCH); confirm second time (PATCH), snackbar and refreshed server status. |
| Activate | On an inactive record, confirm the PUT-based transition is accepted and status refreshes. |
| Validation | Invalid email/mobile prevents submission. Both GSTIN and PAN produces a single-tax-field error. |
| Errors | Missing/expired auth shows sign-in guidance. Stop backend to test network error and Retry; no old customer records should appear as fallback. |

Automated checks, from `Frontend/billing-react`:

```sh
node --test src/features/customers/customerApi.test.mjs
npm.cmd run build
```

The tests verify the adapter contract using synthetic fixtures, not authenticated backend behavior. The production build checks Vite compilation; the existing project does not have a standalone TypeScript checking script.

Full acceptance of search, type/tax filtering, sorting, and authenticated CRUD remains dependent on the backend contract updates and authenticated testing described above.
