# Customer Details integration handoff — 2026-09-10

## Authenticated outstanding verification

Using the user-authorized account, login and read-only customer requests succeeded. No credentials or tokens were written to project files, and no customer records were changed.

- `GET /api/v1/customers?pageSize=10`: returned five customers. Page keys were `items`, `totalCount`, `pageNumber`, `pageSize`, `totalPages`, `hasPreviousPage`, `hasNextPage`. None of the five items contained `outstandingBalance`; no aggregate outstanding field was returned.
- `GET /api/v1/customers/{id}/details`: checked all five returned IDs. Each supplied `financialSummary.outstandingBalance: 0.00`, `currency: INR`, zero invoice/payment totals, and empty invoice/payment arrays.
- The Details balance contract is therefore verified for empty histories. This does not verify populated transaction calculations.
- The Customer List row balance and Total Outstanding card still lack fields in the verified list response. The last live Swagger inspection also had no outstanding filter parameter or documented total-outstanding contract. Do not substitute `totalCount` for an amount, assume missing balances are zero, or sum only the current page as a global total.

This supersedes earlier statements that no authenticated response had been inspected; interactive browser testing remains unperformed.

## Later update: Customer directory filters

This update supersedes the earlier search/type/tax/sorting restrictions below. Live Swagger was rechecked after the backend changed: GET customers now documents `search`, `customerType` (Business/Individual), `taxId`, `sortBy` and `sortOrder` in addition to pagination/status.

Frontend search and customer-type controls are now enabled. The Tax registration category selector is replaced with a Tax ID / GST / VAT ID text input matching the backend contract. Search and Tax ID use 450 ms debounce and return to page 1. Code/name table sorting is enabled; `customerCode` maps to API `code`. Unsupported column sorts are not offered. Reset clears pending inputs and URL filters, and also works when pagination parameters are present. Server filtering/pagination remain authoritative; no page-local filtering or mock fallback was added.

Remaining contract gaps: outstanding filtering is not documented; GST Registered/Non GST/Tax ID Available category filtering is not documented (specific Tax ID filtering is supported); customer type Organization is not documented. Aggregate outstanding totals and populated response fields still require backend response confirmation. The earlier blanket statement that search/sorting are unsupported is no longer current. Authenticated browser filtering has not been verified.

Customer Details changes for IBMSFE-009–014 are implemented. IBMSFE-015 is **partially verified**: automated transport and rendering checks passed; authenticated browser integration QA remains outstanding. Manikanta's List and Jayakrishna's Create/Edit layouts were retained. Sidebar, authentication, global styles, and other modules were not redesigned.

## Modified files

Paths are relative to the repository root.

- `Frontend/billing-api-client/customerApi.js` — reject unsuccessful Create/Edit response envelopes, including HTTP 200 failures.
- `Frontend/billing-react/src/services/customerService.js` — null/not-found handling, malformed collection validation, invoice currency fallback, explicit audit changes normalization.
- `Frontend/billing-react/src/hooks/useCustomer.js` — immediate inactive cache status after successful PATCH; invalidate/refetch customer caches.
- `Frontend/billing-react/src/pages/Customers/CustomerDetailsPage.jsx` — Back navigation, numeric Edit link, customer code/type display, preserve query parameters when switching tabs.
- `Frontend/billing-react/src/components/customers/CustomerOverview.jsx` — supported profile fields and seven financial/count cards.
- `Frontend/billing-react/src/components/customers/CustomerAddresses.jsx` — backend `isDefault` indicator.
- `Frontend/billing-react/src/components/customers/CustomerTransactions.jsx` — payment invoice number uses `invoiceNumber`.
- `Frontend/billing-react/src/components/customers/CustomerStatement.jsx` — require valid dates and amounts, retain zero amounts, remove unsupported description column, explicit empty state.
- `Frontend/billing-react/src/components/customers/CustomerAudit.jsx` — Timestamp and Changes columns.
- `Frontend/billing-react/src/components/customers/CustomerShared.jsx` — not-found title, missing-value and currency formatting, count cards.
- `Frontend/billing-react/src/components/customers/CustomerTable.jsx` — preserve zero values and configurable empty message.
- `Frontend/billing-react/src/components/customers/DeactivateCustomerDialog.jsx` — active-only action, preservation explanation, no client-supplied audit actor.
- `Frontend/billing-react/src/features/customer/pages/CreateCustomer.jsx` — duplicate-submit guard and list invalidation/notification.
- `Frontend/billing-react/src/features/customer/pages/EditCustomer.jsx` — canonical route parameter, preserve original status/rowVersion, invalidate relevant queries.
- `Frontend/billing-react/src/features/customers/CustomerListPage.tsx` — canonical Create links; remove reactivation from the active UI per task requirements. Existing filters, pagination, styling and View/Edit navigation retained.
- `Frontend/billing-react/src/features/customers/useCustomers.ts` — deactivate-only mutation and cross-page cache invalidation.
- `Frontend/billing-react/src/routes/AppRoutes.jsx` — remove duplicate `/customers/new` Create route.
- `Frontend/billing-react/tests/customers.test.mjs` — additional regression coverage.

## Created files

- `Frontend/billing-react/tests/customer-ui.test.jsx`
- `Frontend/billing-react/tests/run-customer-ui.mjs`
- `Frontend/billing-react/CUSTOMER_DETAILS_QA.md`

Temporary editing, downloaded Swagger and generated test bundle files were removed. Existing dependency-cache changes were not reverted or included as intentional source changes.

## Mock dependencies

The active Details flow already used the shared Axios client and had no fixture/localStorage fallback dependency at the start. No fixture files were deleted. Removed the unnecessary authenticated-user display-name argument from deactivation; audit actors are supplied by the server. Empty histories remain empty. Synthetic data is confined to tests. Unrouted legacy customer files remain untouched.

## Connected API and routes

Existing `.env` and `.env.development` already contain:

```env
VITE_API_BASE_URL=https://pediatric-astrology-outrank.ngrok-free.dev
```

The existing Axios client and token interceptor are reused. No credentials, tenant IDs or secrets were added.

| Method | Endpoint | Usage |
| --- | --- | --- |
| GET | `/api/v1/customers` | Existing List and summaries |
| GET | `/api/v1/customers/{id}` | Existing Edit |
| GET | `/api/v1/customers/{id}/details` | Details, Overview, Addresses, Invoices, Payments, Statement |
| GET | `/api/v1/customers/{id}/audit` | Audit |
| POST | `/api/v1/customers` | Existing Create |
| PUT | `/api/v1/customers/{id}` | Existing Edit |
| PATCH | `/api/v1/customers/{id}/deactivate` | Deactivation; never DELETE |

Exactly four customer routes remain:

- `/customers` — existing CustomerListPage
- `/customers/create` — existing CreateCustomer
- `/customers/:customerId/edit` — existing EditCustomer
- `/customers/:customerId` — CustomerDetailsPage

Details accepts `?tab=overview`, `addresses`, `invoices`, `payments`, `statement`, and `audit`. Unknown/absent tab values select Overview. Switching tabs preserves other query parameters. Direct tab rendering was tested; browser refresh and production-host SPA fallback were not tested.

## Contract gaps and intentionally omitted values

Live Swagger returned HTTP 200 on 2026-09-10. It documents the supplied customer endpoints and address `isDefault`, but **does not define Details, invoice, payment or Audit response schemas**. No authenticated response sample was available. Existing transaction mappings (`issueDate`, `totalAmount`, `amountPaid`, `balanceDue`, `paymentDate`, `paymentMethod`, `referenceNumber`, `invoiceNumber`) are retained or aligned with existing UI contracts, but require confirmation against populated live responses. Missing fields display an em dash rather than substitute data.

Swagger lists only `pageNumber`, `pageSize`, and `status` for the customer list. Existing search, sorting, customer type, tax and outstanding-filter capability restrictions were preserved. They cannot be marked working against this backend contract.

Customer Type remains visible and blank values display an em dash; Individual/Business is never inferred. Unsupported profile labels removed from Details: overdue amount, primary contact name, separate mobile, PAN, tax treatment, place of supply and preferred payment method. Statement does not invent descriptions, opening/running balances, credits, adjustments or refunds. Invoice/payment rows provide debit/payment columns, not an inferred ledger balance. Totals come directly from `financialSummary`; count values are never formatted as currency.

Statement export remains disabled as it was before this task. Legacy, unrouted modules and unused legacy API methods remain in the repository; the four active routes do not expose reactivation or deletion.

## Executed checks

| Check | Result |
| --- | --- |
| Service and List contract tests | PASS — 19 tests |
| Server-rendered component/direct-tab tests | PASS — 7 tests |
| Production Vite build | PASS — 11,712 modules; existing large-chunk warning remains |
| Exact customer route list / no duplicates | PASS — automated source assertion |
| Merge conflict marker scan | PASS — repository text files excluding `.git`, dependencies and generated build directories |
| `git diff --check` for changed source/tests/API client | PASS |
| Live Swagger GET | PASS — HTTP 200 |
| Live unauthenticated customers GET | PASS — HTTP 401 |
| Interactive browser tests | NOT RUN — in-app browser returned `Browser is not available: iab` |

Automated service tests substitute Axios responses. Render tests use synthetic data and server rendering; they do not click controls, run browser effects, authenticate, or write live customer records. Passing them is not evidence of a completed end-to-end flow.

## Requested integration checklist

| # | Flow/check | Result and scope |
| --- | --- | --- |
| 1 | Sidebar → Customers | NOT RUN in browser; sidebar unchanged |
| 2 | Customer List loads | PASS adapter mapping; live authenticated loading NOT RUN |
| 3 | Search | BLOCKED — no documented backend parameter; existing control disabled |
| 4 | Filters | PASS status query mapping; browser behavior NOT RUN; other filters unsupported |
| 5 | Pagination | PASS adapter parameter/page mapping; browser interaction NOT RUN |
| 6 | Sorting | BLOCKED — no documented backend support; existing control disabled |
| 7 | Create navigation | PASS source route assertion; browser click NOT RUN |
| 8 | Create succeeds | PASS write transport and failed-envelope tests; live creation NOT RUN |
| 9 | New customer appears in List | NOT RUN live; invalidation implemented |
| 10 | View opens numeric Details URL | PASS direct route rendering; List click NOT RUN |
| 11 | Overview loads | PASS mapped/rendered values; live authenticated GET NOT RUN |
| 12 | Addresses load | PASS mapping, missing/default render checks; live NOT RUN |
| 13 | Invoices empty/data state | PASS empty render and service transaction mapping; populated live render NOT RUN |
| 14 | Payments empty/data state | PASS empty render and service transaction mapping; populated live render NOT RUN |
| 15 | Statement real values only | PASS supplied totals, incomplete-row exclusion and zero-amount rendering |
| 16 | Audit endpoint | PASS transport/normalization and direct empty tab rendering; live NOT RUN |
| 17 | Edit navigation | PASS numeric link and route checks; browser click NOT RUN |
| 18 | Edit saves | PASS PUT transport and envelope/error tests; live save NOT RUN |
| 19 | Details refresh after Edit | NOT RUN interactively; query invalidation implemented |
| 20 | Deactivate confirmation | PASS active-only action rendering; dialog click/cancel/confirm NOT RUN |
| 21 | Customer becomes Inactive | PASS PATCH transport; live mutation/cache-effect behavior NOT RUN |
| 22 | Historical data remains | PASS mapper retains histories for inactive data; live persistence NOT RUN |
| 23 | List reflects status | NOT RUN live; cache invalidation implemented |
| 24 | 401 handling | PASS simulated token clearing and real unauthenticated HTTP 401; browser redirect NOT RUN |
| 25 | 403 handling | PASS simulated service error; live forbidden account NOT RUN |
| 26 | 404 handling | PASS simulated HTTP/null responses and not-found rendering |
| 27 | API/network failure | PASS simulated network/server errors and Retry rendering; clicking Retry NOT RUN |
| 28 | Loading has no fake content | PASS skeleton rendering |
| 29 | Refresh/direct Details URL | PASS all six direct tab server renders; browser refresh/deployment fallback NOT RUN |
| 30 | No console errors | NOT RUN in browser; final server-render checks completed without runtime errors |
| 31 | No duplicate customer routes | PASS automated assertion |
| 32 | No merge conflict markers | PASS scoped repository scan described above |

No failed automated assertions remain. Full IBMSFE-015 sign-off requires an available authenticated browser session and populated invoice/payment/audit examples. No live create/edit/deactivate requests were issued.

## Commands

From the repository root in PowerShell:

```powershell
npm.cmd run dev
```

The `.cmd` form avoids the PowerShell script-execution restriction observed for `npm.ps1` on this machine.

Reproduce checks:

```powershell
cd Frontend/billing-react
node --test tests/customers.test.mjs src/features/customers/customerApi.test.mjs
node tests/run-customer-ui.mjs
npm.cmd run build
```

Tests were executed on Node v24.16.0. The existing List contract test imports TypeScript directly and needs a Node release supporting that feature. The rendering harness uses the project's installed esbuild dependency and removes its generated bundle afterward.
