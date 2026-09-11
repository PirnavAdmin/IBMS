# Customer Management QA — first pass

Date: 2026-09-10. Checkout examined: `faba676c`. Backend: `https://pediatric-astrology-outrank.ngrok-free.dev`.

## A. Overall result

**Customer Management Frontend QA: FAIL — not ready for integration sign-off.**

The production build completed successfully. Existing service/contract tests passed 19/19; existing server-rendered UI tests passed 7/8. Additional isolated diagnostics produced 14 PASS and 12 FAIL results; two failing currency checks describe the same defect. The report contains 11 reproduced frontend defects and one existing test-suite defect. These are code/isolated-rendering findings, not claims that equivalent failures were observed on production customer records.

**Authenticated end-to-end QA is BLOCKED.** The in-app browser reported `Browser is not available: iab` on initial connection and recheck. The currently authenticated application session could not be accessed. No credentials, tokens, tenant IDs, or substitute login were supplied. The public Swagger was retrieved successfully. Separate unauthenticated reachability checks through the existing API client returned HTTP 401 for list and summary. Those 401s are expected authorization checks, not backend failures or authenticated-integration passes.

No safe disposable customer was designated. Real POST, PUT, PATCH, and DELETE requests were not performed. No backend customer data was changed. No application source, sidebar, theme, layout, routes, or existing functionality was changed by this QA pass. Synthetic inputs exist only in isolated QA diagnostics and existing tests; they were not introduced as application fallbacks.

Status meanings: PASS applies only to the exact executed check stated; FAIL means a reproduced defect or failing automated assertion; BLOCKED means the required runtime or safe-data prerequisite is unavailable. Static inspection alone is not an end-to-end PASS.

## B. Task status

| Task | Result | Evidence / limitation |
|---|---|---|
| IBMSFE-001 Customer List UI | FAIL | Missing currency becomes USD; missing code/contact/status do not consistently display `—` (B05–B06). Real populated list and responsive behavior blocked. |
| IBMSFE-002 Search & Filters | BLOCKED | Query serialization agrees with current Swagger in isolated tests. Server result changes, all individual selections, and combinations not verified. Existing UI assertion is defective (B12). |
| IBMSFE-003 Pagination & Sorting | BLOCKED | Mapping and query tests pass. No authenticated page counts, next/previous interactions, or server sorting observed. |
| IBMSFE-004 Customer Actions | FAIL | Edit can resolve successfully despite a failed additional deactivation PATCH (B10). Live View/Edit/Cancel interactions blocked. |
| IBMSFE-005 Customer Form UI | FAIL | Editable financial fields and create-time Status cannot be persisted by the current DTO (B02–B03). |
| IBMSFE-006 Form Validation | BLOCKED | Seven executed schema checks passed; browser field errors, focus, correction, and server validation integration remain unverified. |
| IBMSFE-007 Address Handling | FAIL | Update serialization loses address IDs/line 2 and overwrites default flags (B01). |
| IBMSFE-008 Edit Integration | FAIL | B01, B07, B10, B11. Exact rowVersion preservation passed an isolated check; successful/conflicting real PUT blocked. |
| IBMSFE-009 Details & Overview | BLOCKED | Existing supplied-value rendering test passed. Actual `/details` envelope, profile, dates, and financial values unverified. |
| IBMSFE-010 Addresses | BLOCKED | Existing address/empty/default rendering checks passed. Real backend addresses and tab behavior unverified. |
| IBMSFE-011 Invoices & Payments | BLOCKED | Empty-state rendering passed. Actual backend arrays and populated rows unverified. |
| IBMSFE-012 Statement | BLOCKED | Supplied totals, empty transactions, incomplete-row omission and zero amounts passed isolated checks. Real reconciliation unverified. |
| IBMSFE-013 Audit | BLOCKED | Adapter mapping and direct-tab SSR checks passed. Real actor/action/time/change values and interactive retry unverified. |
| IBMSFE-014 Deactivate Flow | BLOCKED | Safe record and authenticated browser absent. Actual mutation/history preservation not tested. B10 affects the separate edit-triggered status flow. |
| IBMSFE-015 Frontend Integration QA | FAIL | Reproduced frontend defects, failing existing UI test, and incomplete authenticated/mutating flow prevent completion. |

## C. API results and current contract

[Current Swagger UI](https://pediatric-astrology-outrank.ngrok-free.dev/swagger/index.html) and [OpenAPI document](https://pediatric-astrology-outrank.ngrok-free.dev/swagger/v1/swagger.json) returned HTTP 200 through read-only requests. `swagger/index.js` identified the OpenAPI URL. The downloaded document is saved in [swagger.json](swagger.json).

| Method | Endpoint | Actual HTTP result | Result for requested integration | Screen / notes |
|---|---|---|---|---|
| GET | `/api/v1/customers` | 401, unauthenticated probe | BLOCKED | Routed Customer List uses `features/customers/customerApi.ts`. Reachable; successful authenticated list not tested. |
| GET | `/api/v1/customers/summary` | 401, unauthenticated probe | BLOCKED | Summary cards; successful authenticated aggregate not tested. |
| GET | `/api/v1/customers/{id}` | Not called live | BLOCKED | Routed Edit uses shared `billing-api-client/customerApi.js`. No verified customer ID/session. |
| GET | `/api/v1/customers/{id}/details` | Not called live | BLOCKED | Details and five data tabs use `services/customerService.js`. |
| GET | `/api/v1/customers/{id}/audit` | Not called live | BLOCKED | Audit tab uses `useCustomerAudit`. |
| POST | `/api/v1/customers` | Not sent | BLOCKED | Create; exact outgoing field names checked against Swagger in isolation, persistence not tested. |
| PUT | `/api/v1/customers/{id}` | Not sent | BLOCKED | Edit; isolated DTO/address/concurrency diagnostics only. |
| PATCH | `/api/v1/customers/{id}/deactivate` | Not sent | BLOCKED | List and Details actions; safe record required. |

The live 401 checks used the existing Axios client without credentials because no browser session was available. They prove neither authenticated payload nesting nor tenant isolation. No guessed numeric customer ID was requested from the backend. There was no DELETE call.

**Exact list query comparison**

| Concern | Current Swagger | Routed frontend | Assessment |
|---|---|---|---|
| Search | `search` | Trimmed `search`; 450 ms debounce in UI | Serializer verified; real name/partial/no-match/clear behavior BLOCKED. |
| Customer type | `customerType`, description Business/Individual | Sends Business/Individual; omits parameter for All | Names match. Omission versus literal `All` semantics require authenticated behavior verification. |
| Tax registration | `taxRegistration`, string | Registered/Unregistered; omits All | Name matches; Swagger does not enumerate values. Actual behavior BLOCKED. |
| Outstanding | `outstanding`, string | Has Outstanding/No Outstanding; omits All | Name matches; actual filtering BLOCKED. |
| Status | `status`, enum Active/Inactive/All | Sends Active/Inactive/All | Matches current contract. `IsActive` is not a documented list query parameter. |
| Page | `pageNumber`, `pageSize` | Same lower-camel names | Matches Swagger. Sizes offered: 10/25/50/100. |
| Sorting | `sortBy`, `sortOrder` | Same names; name or customerCode translated to `code`; asc/desc | Matches Swagger descriptions. Real ordering BLOCKED. |

The uppercase names in the requested checklist are conceptual; the current Swagger actually documents the lower-camel names above. The routed list follows those names. The shared Axios interceptor additionally adds `ngrok-skip-browser-warning=true`; it is tunnel infrastructure metadata, not a tenant selector.

The current Create DTO has customerCode/name/email/phone/companyName/customerType/taxId, flat address fields, website/notes/currency/paymentTerms, and `addresses`. Update additionally supports `status`, `isActive`, and `rowVersion` (nullable date-time string). Address DTO supports `id`, `addressType`, both address lines, city/state/postalCode/country/isDefault; `defaultStatus` is read-only. Executed serializers did not include extra top-level fields outside these DTOs.

**Summary:** The code calls `/summary` independently of the list and reads `Number(data.totalOutstanding)`. An isolated response with 101 customers and totalOutstanding 12345 returned 12345, with one summary request and no list summation. No obsolete “Total outstanding is not provided by the API” message was found in active source. All-tenant aggregation is still BLOCKED: documentation describes aggregate metrics but there was no authenticated data or cross-page reconciliation. Missing-value handling fails B04/B05.

## D. Bugs found

Reproduce the isolated diagnostics with `node qa/customer-management-2026-09-10/run-diagnostics.mjs` from the repository root. Its transport adapter intercepts all requests; it never writes backend data. Exact observed outputs are in [diagnostics-results.json](diagnostics-results.json). The reproduction steps below were executed at serializer, adapter, schema, or server-rendered component level as stated.

### B01 — Existing address metadata is lost on edit

- **Severity / owner:** High / FRONTEND. **Screen:** Edit Customer, Billing/Shipping addresses.
- **Executed reproduction:** Parse a customer containing Billing ID 71, Shipping ID 72, nonempty addressLine2 values, and supplied default flags; feed the parsed record into `createUpdateCustomerRequest` without changing addresses.
- **Expected:** Preserve address identities, line 2, and existing defaults unless explicitly edited.
- **Actual:** Both IDs are omitted; line 2 becomes null; default flags are forced to Billing=true, Shipping=false. Confirmed payload loss; no claim of an observed production database loss.
- **Probable cause / files:** `Frontend/billing-contracts/customer.contracts.js:132` and `:165` omit metadata when parsing; writer at `:6` constructs replacement addresses and fixes defaults. `Frontend/billing-react/src/features/customer/components/CustomerForm.jsx:208` also rebuilds addresses using only five fields.
- **Recommended fix:** Preserve IDs, both lines and default flags through the active parser, form normalization, and PUT DTO; retain untouched addresses or omit the optional collection only if backend retention semantics are confirmed. Regression-test a complete address round trip before a safe live PUT.
- **API:** `GET /customers/{id}` → `PUT /customers/{id}`. Diagnostic: `ADDRESS-ROUNDTRIP`.

### B02 — Financial form inputs are silently discarded

- **Severity / owner:** High / FRONTEND, with unsupported backend write fields. **Screen:** Create/Edit, Payment Information.
- **Executed reproduction:** Server-render the active form; serialize values with creditLimit=500 and openingBalance=50.
- **Expected:** Only offer editable values that the supported request contract can save, or clearly indicate unsupported/read-only values.
- **Actual:** Both editable controls exist, but neither field is in the serialized POST/PUT DTO. The current Swagger contains neither write property. The form also labels outstanding as opening balance and labels these amounts in INR even when another currency is selected (static observation).
- **Probable cause / files:** `Frontend/billing-react/src/features/customer/components/CustomerForm.jsx:198` and the Payment Information controls are wider than `Frontend/billing-contracts/customer.contracts.js:6` / `:72`.
- **Recommended fix:** Make unsupported financial fields explicitly unavailable/read-only within the existing layout; do not invent DTO fields or infer opening balance from outstanding. Add editing only after backend support is agreed.
- **API:** POST/PUT Customer DTOs. Diagnostic: `FORM-FINANCIAL-PERSISTENCE`.

### B03 — Create-time Inactive selection cannot be submitted

- **Severity / owner:** Medium / FRONTEND. **Screen:** Create Customer, Account Status.
- **Executed reproduction:** Confirm the shared form exposes Status; serialize a create input with status=Inactive and isActive=false.
- **Expected:** Selected supported state is submitted, or create-time state is fixed/read-only according to the contract.
- **Actual:** Create DTO omits both fields. Only Update DTO documents them. No live created status is claimed.
- **Probable cause / files:** Unconditional Status select in `features/customer/components/CustomerForm.jsx`; `Frontend/billing-contracts/customer.contracts.js:6` correctly follows a Create DTO that lacks status.
- **Recommended fix:** Disable or explain create-time status according to backend behavior; do not silently create and then perform an unapproved extra status mutation.
- **API:** POST `/api/v1/customers`. Diagnostic: `CREATE-STATUS-PERSISTENCE`.

### B04 — Null summary values display as real zeros

- **Severity / owner:** Medium / FRONTEND. **Screen:** Summary cards.
- **Executed reproduction:** Return all four summary numeric fields as null to the isolated summary service.
- **Expected:** Reject malformed aggregates or display `—` as unavailable.
- **Actual:** All four become zero and pass finite-number validation.
- **Probable cause / file:** `Frontend/billing-react/src/features/customers/customerApi.ts:53` uses `Number(null)` before validating.
- **Recommended fix:** Validate presence and numeric type before conversion; do not coerce null/blank/boolean values into financial facts.
- **API:** GET `/api/v1/customers/summary`. Diagnostic: `SUMMARY-NULL-NOT-ZERO`.

### B05 — Missing currency is invented as USD

- **Severity / owner:** High / FRONTEND. **Screen:** List Outstanding and Summary Total Outstanding.
- **Executed reproduction:** Supply outstandingBalance=50 without currency and server-render the list; supply a summary without currency.
- **Expected:** Display `—` when currency is unavailable; do not invent the unit.
- **Actual:** List displays `$50.00`; summary service returns currency=`USD`.
- **Probable cause / files:** `features/customers/CustomerListPage.tsx:13` defaults/falls back to USD; `features/customers/customerApi.ts:58` also supplies USD.
- **Recommended fix:** Preserve missing currency and use the same unavailable-value policy as Details; use currency only from a confirmed backend field.
- **APIs:** GET list and summary. Diagnostics: `SUMMARY-MISSING-CURRENCY`, `LIST-MISSING-CURRENCY`.

### B06 — Missing list fields render blank or “unknown”

- **Severity / owner:** Medium / FRONTEND. **Screen:** Customer List.
- **Executed reproduction:** Map and render a row with empty code/name/email and no status.
- **Expected:** Consistent `—` placeholders, with no empty email link.
- **Actual:** Code/contact are blank, an empty `mailto:` link is present, and status displays `unknown`.
- **Probable cause / files:** `features/customers/CustomerListPage.tsx:12` and row cells at `:63` onward render mapped strings directly; `customerContract.ts` represents missing status as `unknown`.
- **Recommended fix:** Apply explicit missing-value display handling for code/name/contact/status and avoid rendering links without targets.
- **API:** GET list. Diagnostic: `LIST-MISSING-FIELDS`.

### B07 — Edit conflict fallback describes duplicates instead of concurrency

- **Severity / owner:** Medium / FRONTEND. **Screen:** Edit save errors.
- **Executed reproduction:** Pass HTTP 409 with an empty body to the active shared error parser.
- **Expected:** Conflict/reload guidance suitable for a stale rowVersion, with user input preserved.
- **Actual:** “A customer with this email or customer code already exists.”
- **Probable cause / file:** `Frontend/billing-contracts/customer.contracts.js:295` applies one duplicate-record interpretation to every 409. Routed Edit uses this path, not the better conflict message in `services/customerService.js`.
- **Recommended fix:** Preserve safe backend error codes/messages and distinguish duplicate create from stale edit; provide reload/retry guidance. Verify a real stale rowVersion on an approved record.
- **API:** PUT Customer. Diagnostic: `EDIT-CONFLICT-GUIDANCE`.

### B08 — HTTP 500 is mislabeled as a network failure

- **Severity / owner:** Medium / FRONTEND. **Screen:** Customer List and Create/Edit error handling.
- **Executed reproduction:** Feed an HTTP 500 response to the shared Axios error formatter.
- **Expected:** Server-unavailable error, distinguishable from no-response/network failure, with appropriate retry.
- **Actual:** `Network Error`.
- **Probable cause / file:** `Frontend/billing-api-client/apiClient.js:46` maps every status >=500 into network failure. Details has a separate status-aware formatter.
- **Recommended fix:** Preserve status/category in normalized errors and provide concise, consistent server versus connection messages.
- **API:** Any Customer endpoint. Diagnostic: `SERVER-ERROR-DISTINCT`. No real backend 500 was observed.

### B09 — Raw string errors can expose stack text

- **Severity / owner:** High / FRONTEND defensive handling. **Screen:** Create/Edit error banner.
- **Executed reproduction:** Feed HTTP 400 with the isolated string `System.Exception: QA stack trace at CustomersController.Save()` to `parseCustomerError`.
- **Expected:** A safe validation/error message for users.
- **Actual:** The entire string is returned unchanged, and Create/Edit render the returned message.
- **Probable cause / file:** `Frontend/billing-contracts/customer.contracts.js:267` accepts raw response strings without adequate user-message filtering.
- **Recommended fix:** Whitelist documented validation messages, constrain/sanitize arbitrary response text, and use a safe fallback for diagnostic bodies. Backend should independently avoid returning stacks.
- **API:** Customer errors. Diagnostic: `RAW-STACK-SUPPRESSION`. This does not establish that the live backend currently leaks stacks; React escaping also means this finding is not a demonstrated script-injection vulnerability.

### B10 — Edit issues an extra PATCH and swallows its failure

- **Severity / owner:** High / FRONTEND. **Screen:** Edit Customer, setting/retaining Inactive status.
- **Executed reproduction:** In the isolated adapter, resolve PUT, reject the subsequent deactivation PATCH with HTTP 500, and await `customerApi.updateCustomer`.
- **Expected:** One confirmed state-changing workflow, with required operation failures surfaced and no unsupported success claim.
- **Actual:** Requests are PUT then PATCH; PATCH failure is only `console.warn`; update resolves successfully. The caller can navigate with a success notice.
- **Probable cause / file:** `Frontend/billing-api-client/customerApi.js:51–62` always patches an inactive payload and suppresses patch failures without checking persisted state.
- **Recommended fix:** Confirm whether PUT owns status. If PUT is sufficient, remove the redundant status request in a separately reviewed fix; otherwise await/validate the required PATCH and report partial failure accurately. Test an already-inactive record and failure case safely.
- **APIs:** PUT `/customers/{id}` and PATCH `/customers/{id}/deactivate`. Diagnostic: `EDIT-PATCH-FAILURE-SURFACED`.

### B11 — Routed Edit transport sends nonnumeric IDs

- **Severity / owner:** Medium / FRONTEND. **Screen:** Direct Edit URL.
- **Executed reproduction:** Call the routed edit client's `getCustomerById('not-a-number')` using the recording adapter.
- **Expected:** Reject the invalid route ID before network access, consistent with numeric Swagger IDs and the Details service.
- **Actual:** Sends GET `/api/v1/customers/not-a-number`.
- **Probable cause / file:** `Frontend/billing-api-client/customerApi.js:31–32` uses `Number(id) || id`, preserving invalid strings. Routed Edit only checks that an ID exists.
- **Recommended fix:** Validate positive integer IDs within the API's int32 range in the shared client/route before requesting; preserve a suitable not-found/invalid-ID state.
- **API:** GET/PUT Customer-by-ID. Diagnostic: `EDIT-INVALID-ID-NO-REQUEST`.

### B12 — Existing filter UI test has an invalid SSR assertion

- **Severity / owner:** Low / FRONTEND TEST. **Screen:** Customer directory test coverage.
- **Executed reproduction:** Run `node Frontend/billing-react/tests/run-customer-ui.mjs`.
- **Expected:** Test the filter label and selection behavior appropriately.
- **Actual:** 7/8 pass; the test expects `/Has Outstanding/` in closed-select server-rendered HTML and fails. Additional rendering confirms the Outstanding label exists while the unselected option is not emitted into that HTML.
- **Probable cause / file:** `Frontend/billing-react/tests/customer-ui.test.jsx:27`. MUI's unselected menu options are not part of this static rendering.
- **Recommended fix:** Assert the closed control in SSR and add an interactive test that opens the menu/selects an option. Do not change application filtering merely to satisfy this string assertion. Real filter behavior remains BLOCKED.

## E. Backend gaps and external blockers

1. **Response contract documentation gap, verified:** All Customer operations in the fetched Swagger document expose `200: OK` without response schemas/examples. The document cannot establish list row outstandingBalance/currency, summary field types/nullability, Details nesting, audit actor/change fields, or populated transaction DTOs. Publish those response schemas or provide authorized sample responses.
2. **Write capability gap, verified in Swagger:** Create/Update have no creditLimit or openingBalance property; Create has no status/isActive. Do not extend frontend payloads speculatively. The misleading editable controls remain frontend defects B02/B03.
3. **Validation/error documentation gap:** Request strings are largely nullable without required/length/format constraints; non-status filters lack enums; errors and concurrency outcomes are not documented. Absence of Swagger constraints is not proof that the server accepts every value. Reconcile documented requirements with actual backend validation on safe data.
4. **Authenticated browser unavailable:** Prevents live Customer reads, network inspection, CORS verification, runtime console, responsive testing, and existing-session auth verification. This is a QA environment blocker, not evidence of backend failure.
5. **Safe data strategy absent:** Need an approved disposable tenant/customer, permissions for create/update/deactivate, valid field data, a record with a current rowVersion, and an agreed cleanup/retention strategy. Do not deactivate an important customer.
6. **Tenant-wide summary semantics unverified:** A reachable aggregate endpoint and correct frontend binding do not prove all-tenant aggregation or mixed-currency policy. Need authenticated cross-page values and documented currency behavior. No backend tenant-isolation failure was established.

No live backend functional defect was confirmed. The two live 401 responses are expected without authentication.

## F. Frontend pending work and static inventory

**Active route ownership — one route per requested screen, no duplicate registrations found:**

| Route | Active component | Data path |
|---|---|---|
| `/customers` | `features/customers/CustomerListPage.tsx` | `features/customers/useCustomers.ts` → `customerApi.ts` → shared Axios |
| `/customers/create` | `features/customer/pages/CreateCustomer.jsx` | Shared `billing-api-client/customerApi.js` → `billing-contracts/customer.contracts.js` |
| `/customers/:customerId/edit` | `features/customer/pages/EditCustomer.jsx` | Same shared client/contracts |
| `/customers/:customerId` | `pages/Customers/CustomerDetailsPage.jsx` | `hooks/useCustomer.js` → `services/customerService.js` → shared Axios |

All six Details tabs are owned by `CustomerDetailsPage`; no extra routes were added. Invoice/payment arrays originate from the Details response mapping, not the Payments module's dummy API. No active Customer mock-data fallback or hardcoded auth/tenant values were found in the inspected production paths. Test fixtures remain confined to QA/test code.

**Legacy/duplicate implementations present but not selected by AppRoutes:**

- `features/customers/AddCustomerPage.tsx` (placeholder) and `CustomerRecordPage.tsx` (alternate create/edit/view).
- `features/customer/pages/CustomerList.jsx` and `CustomerDetails.jsx` (exported through that feature's index, but not imported by the active router).
- `pages/Customers/Customers.jsx` and `pages/Customers/EditCustomer.jsx` (alternate list/edit).
- Unused legacy client exports include activation/deletion paths. The active list/details deactivate actions use PATCH. Their existence does not mean those legacy DELETE/reactivation flows were exercised by active routes.

No legacy files were deleted. Some existing tests exercise `services/customerEdit.js` and the alternate service path rather than the routed form/client; their passing results cannot certify the active edit pipeline.

**Exact files needing focused follow-up:**

| File | Required follow-up |
|---|---|
| `Frontend/billing-contracts/customer.contracts.js` | Preserve address metadata (B01), contextual conflict errors (B07), safe raw-error handling (B09). |
| `Frontend/billing-react/src/features/customer/components/CustomerForm.jsx` | Preserve addresses; resolve unsupported financial/status inputs without layout redesign (B01–B03). |
| `Frontend/billing-react/src/features/customer/components/AddressSection.jsx` | Support/preserve address line 2 and existing metadata as required by confirmed edit behavior. |
| `Frontend/billing-api-client/customerApi.js` | Remove/handle redundant status mutation after contract confirmation; validate numeric IDs and preserve useful error status (B10–B11). |
| `Frontend/billing-api-client/apiClient.js` | Distinguish HTTP server failure from network failure (B08). |
| `Frontend/billing-react/src/features/customers/customerApi.ts` | Validate summary values before conversion; preserve unavailable currency (B04–B05). |
| `Frontend/billing-react/src/features/customers/CustomerListPage.tsx` | Missing currency/field placeholders (B05–B06); interactive search/filter/sort/page QA. |
| `Frontend/billing-react/tests/customer-ui.test.jsx` | Replace defective SSR option assertion and add genuine dropdown interaction coverage (B12). |

**Additional static follow-up, not counted as executed runtime failures:**

- Routed `features/customer/pages/EditCustomer.jsx:98` labels every load error “Customer Not Found” and offers no retry, even for a service failure. Preserve status and use the correct error state.
- Edit navigates to Details with `customerNotice`, but `pages/Customers/CustomerDetailsPage.jsx` does not read/display it. Verify success feedback once safe saves are available.
- Auth sign-out paths clear localStorage but do not visibly clear the shared TanStack Query client; keys are not scoped by authenticated account, and global staleTime is five minutes. Test account/tenant switching for stale data and clear/scope caches as needed. No cross-tenant leak was demonstrated.
- Current form includes Active/Inactive editing. Confirm whether reactivation via PUT is supported and authorized; no reactivation was added or tested.
- Lists/Details share some unscoped `.customer-*` CSS selectors. Responsive usability and cross-screen CSS interactions require actual browser observation; do not redesign based solely on this risk.

## G. Build/test results and phase coverage

**Commands actually executed** (repository root unless a directory is stated):

| Command/check | Actual result |
|---|---|
| `git status --short`, `git rev-parse --short HEAD` | Initially clean; `faba676c`. |
| `rg --files -g AGENTS.md` | No applicable repository AGENTS file found. |
| `rg -n '^(<<<<<<<|=======|>>>>>>>)' ...` and expanded whitespace/hidden source scan | No real merge markers found in source. Comment separators were not misclassified as conflicts. |
| `npm.cmd install --ignore-scripts --package-lock=false --no-audit --no-fund` in `Frontend/billing-react` | No output during blocked registry retries; interrupted. |
| Same install plus `--fetch-retries=0 --fetch-timeout=15000` | Sandbox failed with EACCES on registry/cache; retried with escalation. |
| Escalated bounded install command | PASS, exit 0: “changed 4 packages in 58s.” Lifecycle scripts deliberately skipped and lockfile rewrite disabled; this is not a clean `npm ci` or install-script verification. |
| `npm.cmd run build` | PASS, exit 0, 11,712 modules transformed; built in 1m 38s. Largest JS asset 891.52 kB, gzip 273.64 kB. Nonfatal >500 kB chunk warning. Executed outside sandbox because prior Vite/esbuild runs were blocked by directory access. |
| `node --test Frontend/billing-react/tests/customers.test.mjs Frontend/billing-react/src/features/customers/customerApi.test.mjs` | PASS, 19/19, exit 0. Rerun after dependency installation also passed. Adapter/fixture tests, not live backend tests. |
| `node Frontend/billing-react/tests/run-customer-ui.mjs` | FAIL, 7/8, exit 1. Failure B12. Server-rendering tests, not browser interaction. |
| `node qa/customer-management-2026-09-10/run-diagnostics.mjs` | FAIL, 14/26 pass, 12 fail, exit 1, as intended for reporting reproduced defects. Initial harness attempts hit sandbox access and duplicate-React resolution; fixed only the QA harness and reran. No production invalid-hook error was established. |
| `node qa/customer-management-2026-09-10/probe-public-access.mjs` | Sandbox EACCES first; escalated run returned actual 401 for list and summary. No auth supplied, no customer data logged. |
| `npm.cmd --prefix Frontend/billing-react run preview -- --host 127.0.0.1 --port 4173 --strictPort` | Initial sandbox esbuild failure; escalated preview started successfully. Stopped after HTTP checks. |
| `node qa/customer-management-2026-09-10/check-route-shells.mjs` | PASS, 9/9 HTTP shell checks; each route and its JS asset returned 200. Does not execute React or verify a real customer. ID 17 was only a local route placeholder, never a backend customer request. |
| Browser connection and later recheck | BLOCKED: browser unavailable. No browser runtime console, screenshots, or responsive checks obtained. |
| Lint/test npm scripts | `Frontend/billing-react/package.json` has only dev/build/preview; root provides dev/build/preview/install:all. No lint/test script available. Existing test files were run directly. |

Evidence: [build log](build.log), [existing service tests](existing-service-tests.log), [existing UI tests](existing-ui-tests.log), [isolated diagnostic results](diagnostics-results.json), [diagnostic log](diagnostics.log), [HTTP authorization results](public-access-results.json), [route shell results](route-shell-results.json).

The repository tracks dependency files and `dist/index.html`; install/build changed those generated files. They were restored to the initially clean tracked state after verification. QA evidence/scripts are the intended new artifacts. Generated QA bundle is removed; no application source fixes or lockfile edits are part of this pass.

**All 21 phases — executed coverage and remaining work:**

| Phase | Executed coverage | Required work still BLOCKED / failed |
|---|---|---|
| 1 Static code | All requested routed screens, tabs, clients, hooks, filters, sorting, pagination, loading/errors inspected; route/legacy inventory above; merge-marker scan clean. | Findings B01–B11 and static follow-ups. Static review is not runtime certification. |
| 2 Build/quality | Install, build, existing tests and diagnostics executed. | B12; browser console, invalid hooks at runtime, key warnings, unhandled rejections unverified. |
| 3 List | Server-rendered supplied rows and missing-value cases; production build. | B05/B06. Actual names/codes/email/types/status/outstanding/currency/actions and responsiveness BLOCKED. |
| 4 Summary | Independent endpoint and data.totalOutstanding binding tested. | B04/B05. Live totals, tenant-wide coverage, currency and reconciliation BLOCKED. |
| 5 Search | Serializer trim/name and debounce/reset code inspected. | Complete name, partial name, no results, clear; actual request/result/page reset/console checks all BLOCKED. |
| 6 Filters | All query names inspected against current Swagger; combined serializer test. | Business/Individual/All; Registered/Unregistered/All; Has Outstanding/No Outstanding/All; Active/Inactive/All; live results all BLOCKED. |
| 7 Sorting | Correct name/code and asc/desc serialization; UI toggle code inspected. | Repeated ascending/descending clicks and server ordering, including active filters/search, BLOCKED. |
| 8 Pagination | Existing metadata mapping test passes; sizes/reset handlers inspected. | Next, previous, page-size, total/filtered count, search/sort/filter pagination BLOCKED. |
| 9 Create | Form SSR; exact DTO whitelist; schema checks. | B02/B03. Browser validation/Same as Billing interaction and actual POST/success/list appearance BLOCKED. |
| 10 Details | SSR supplied overview and all six direct tab URLs; numeric-ID service tests. | Actual list View click, `/details` response, profile and financial counts/dates BLOCKED. |
| 11 Addresses | Missing/default/address rendering tests. | Actual address contents BLOCKED; edit preservation fails B01. |
| 12 Invoices | Empty array text tested; Details-only source inspected. | Populated live invoice rows and values BLOCKED. Empty array itself is not a defect. |
| 13 Payments | Empty array text tested; Details-only source inspected. | Populated live payments BLOCKED. No dummy Payments-module data used here. |
| 14 Statement | Backend summary inputs and zero/invalid/empty transaction cases tested. | Real financial reconciliation and supported transaction semantics BLOCKED. No invented opening/credits/refunds/adjustments added. |
| 15 Audit | Adapter mapping and direct-tab SSR tested; loading/error component branches inspected. | Live success/empty/API error, actor/action/time/old-new fields and click Retry BLOCKED. |
| 16 Edit | Active serializer/adapter diagnostics, rowVersion preservation and validation. | B01/B02/B07/B10/B11. Real prefill/save/conflict/cache refresh BLOCKED. |
| 17 Deactivate | Active-only button SSR and PATCH/cache invalidation code inspection. | Name dialog/Cancel/double-submit/success/inactive/history retention all require browser/safe record. Actual PATCH BLOCKED. |
| 18 Errors | Existing adapter tests cover 400/401/403/404/409/500/network; extra active-client error diagnostics. | B07–B09; live UI handling not verified. Isolated 401 clears storage; actual browser redirect/message BLOCKED. |
| 19 Refresh/navigation | All nine local HTML shells/assets return 200; six Details tabs SSR pass. | Actual refresh, navigation, hydrated screen correctness, blank-page/console observations BLOCKED. |
| 20 API/network | Swagger 200; list/summary unauthenticated 401; configured base URL, bearer interceptor and DTOs inspected; isolated header test. | Authenticated Bearer attachment, CORS, response nesting, duplicate requests, URL encoding in browser and tenant isolation BLOCKED. B10 establishes two edit requests in isolation. |
| 21 Full flow | Read-only/isolated work continued despite unavailable mutation strategy. | Login with existing session → list/search/filter/sort/page → create → view/tabs → edit/save → deactivate/history: no authenticated end-to-end completion. |

**Combination matrix not executed against server:** Search + Customer Type; Customer Type + Tax Registration; Status + Outstanding; Search + Customer Type + Tax Registration + Outstanding; Filters + Pagination; Filters + Sorting; Search + Pagination; Sorting + Pagination. Each is BLOCKED, not PASS or evidence of backend failure. Request construction for a combined filter was verified only in isolation.

**Error status detail:** 400/401/403/404/409/500/network adapter tests passed on `services/customerService.js`; this does not override B07/B08/B09 in the different active Create/Edit/List error path. A real expired-session redirect, actual permission denial, not-found record, concurrency failure and live network-retry interaction remain unverified. No unsafe global token changes or forced production failures were made.

## H. Final conclusion

1. **Is Customer frontend development complete? No.** Reproduced address, form, currency/missing-value, error and edit-transport defects remain.
2. **Is backend integration complete? Not verified; do not mark complete.** Endpoint/query/write schema wiring is partly verified, but successful authenticated responses and write outcomes are blocked.
3. **Is IBMSFE-015 ready to mark Completed? No.** Build success and isolated tests do not meet the requested integration criteria.
4. **Blockers:** Unavailable authenticated browser/session, no designated safe test customer/tenant, undocumented successful response DTOs/validation/error details, and reproduced frontend failures.
5. **Before push/merge as completed Customer work:** Fix B01–B11 with focused regression tests; repair B12; resolve static error/feedback/cache-scope concerns; obtain authenticated browser access and safe data; execute all blocked search/filter/sort/page cases and the create→view/tabs→edit→deactivate/history flow; reconcile actual response schemas/tenant totals; rerun build and relevant tests. A QA-report-only commit can be reviewed separately, but the Customer feature should not be represented as fully verified or complete.

No large fixes were made. This report is the first-pass deliverable for review.
