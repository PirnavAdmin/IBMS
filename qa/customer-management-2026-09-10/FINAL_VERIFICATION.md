# Customer Management — final verification

Verified on 2026-09-10 against the existing working tree. This pass performed verification only: no production source fixes, refactors, route changes, redesign, or real backend mutations were made. Build output and QA evidence were regenerated.

| Check | Actual result |
|---|---|
| Build | **PASS**, exit 0, `npm.cmd run build` |
| Customer service/contract tests | **31/31 PASS**, 0 failures |
| Customer UI tests | **10/10 PASS**, 0 failures |
| QA diagnostics | **29 PASS / 0 FAIL**, exit 0 |
| Unresolved merge markers | **NONE** in scanned source |
| `git diff --check` | PASS; line-ending notices only |
| Authenticated browser E2E | **BLOCKED** — browser connection unavailable |
| IBMSFE-015 ready for Completed? | **NO** — authenticated integration sign-off remains outstanding |

The working tree contains 31 service/contract tests, including the regression for preserving an omitted address collection during a name-only edit. This explains the difference from the earlier 30-test result. All 31 were executed in this final pass.

## B01–B12 status

“FIXED” means the existing fix was inspected and its isolated regression/diagnostic checks passed. It does not mean a production browser flow or database mutation was verified.

| Defect | Status | Verified behavior |
|---|---|---|
| B01 | **FIXED** | Address IDs, line 2, defaults, nulls, extra addresses, and rowVersion survive serialization. Same as Billing preserves shipping identity/default. Missing/omitted collections are not synthesized during unchanged edits. |
| B02 | **FIXED** | Financial fields are disabled with a clear explanation; no unsupported creditLimit/openingBalance write fields are invented. |
| B03 | **FIXED** | Create-time Status is disabled and explained; Edit status remains available. POST excludes status/isActive. |
| B04 | **FIXED** | Null/undefined/invalid summary values remain unavailable; explicit API zero remains zero. |
| B05 | **FIXED** | Missing list currency renders `—`; summary no longer defaults to USD. |
| B06 | **FIXED** | Missing list code/contact/status use `—`, with no empty mailto link or displayed `unknown`. |
| B07 | **FIXED** | Generic 409 provides conflict/reload guidance; explicit safe duplicate validation is retained. |
| B08 | **FIXED** | Customer HTTP 500/502/503 produce Server Error; no-response network errors remain Network Error. Unrelated API behavior remains unchanged. |
| B09 | **FIXED** | Raw strings and tested HTML, stack, SQL/internal diagnostic messages are suppressed; safe structured validation remains usable. |
| B10 | **FIXED** | Ordinary Edit sends one awaited PUT, without an extra PATCH. Failed PUT and required explicit deactivation PATCH reject rather than report success. |
| B11 | **FIXED** | Invalid IDs are rejected before Customer GET/PUT/PATCH; positive numeric int32 IDs are required. |
| B12 | **FIXED** | SSR assertion checks the closed dropdown correctly; an additional test verifies the selected outstanding filter value. |

## Commands and evidence

Executed from the repository root:

```text
node --test Frontend/billing-react/tests/customers.test.mjs Frontend/billing-react/src/features/customers/customerApi.test.mjs Frontend/billing-react/tests/customer-regressions.test.mjs
node Frontend/billing-react/tests/run-customer-ui.mjs
node qa/customer-management-2026-09-10/run-diagnostics.mjs
npm.cmd run build
git diff --check
```

Vite/esbuild commands used approved execution outside the filesystem sandbox because directory access was blocked inside it. All final commands above completed successfully. The build transformed 11,712 modules in 1m 30s. Its JS bundle was 893.26 kB (274.55 kB gzip); the >500 kB chunk notice is a nonfatal warning, not a build failure. PowerShell formats captured stderr warnings as NativeCommandError text in the log; the actual build process returned exit 0.

Evidence:

- [Service/contract test log](service-tests-final.log)
- [Customer UI test log](ui-tests-final.log)
- [Final diagnostic log](diagnostics-final.log)
- [Diagnostic result data](diagnostics-results-after-fixes.json)
- [Final build log](build-final.log)

Merge-marker checks scanned application source, API client, contracts, and backend source, excluding dependencies/build artifacts. Matches from the broad initial search were decorative equals-sign comment separators. A precise scan for real `<<<<<<<`, standalone `=======`, `>>>>>>>`, and the supplied spaced closing marker found none. No source was modified to remove comments.

Missing-value verification inspected actual server-rendered diagnostic output. Outstanding, code, contact, and status contained Unicode U+2014 (`—`), not U+003F (`?`) or empty values. Summary diagnostics separately confirmed null/invalid values remain null and explicit zero remains zero. These checks are isolated rendering tests, not an authenticated browser observation.

## Files in the existing fix set

The diff retains Manikanta's List, Jayakrishna's Create/Edit, and Sumanth's Details ownership. No routes, sidebar, stylesheets, or unrelated module source were changed. The shared Axios change is limited to Customer endpoint error handling.

Production files modified relative to HEAD:

```text
Frontend/billing-api-client/apiClient.js
Frontend/billing-api-client/customerApi.js
Frontend/billing-contracts/customer.contracts.js
Frontend/billing-react/src/features/customer/components/AddressSection.jsx
Frontend/billing-react/src/features/customer/components/CustomerForm.jsx
Frontend/billing-react/src/features/customer/pages/EditCustomer.jsx
Frontend/billing-react/src/features/customers/CustomerListPage.tsx
Frontend/billing-react/src/features/customers/customerApi.ts
Frontend/billing-react/src/features/customers/customerContract.ts
Frontend/billing-react/src/features/customers/types.ts
Frontend/billing-react/src/services/customerService.js
```

Test files modified/added:

```text
Frontend/billing-react/tests/customer-ui.test.jsx
Frontend/billing-react/tests/customers.test.mjs
Frontend/billing-react/tests/run-customer-ui.mjs
Frontend/billing-react/tests/customer-regressions.test.mjs (new)
```

Generated/artifact changes: `Frontend/billing-react/dist/index.html`, generated build assets, and files under `qa/customer-management-2026-09-10/`. The final verification pass added this report and regenerated verification logs/results/build output; it did not rewrite the existing production fixes or tests.

## Remaining blockers and completion decision

**Frontend:** No B01–B12 failure remains in the executed suites. Actual browser rendering, interactions, responsiveness, runtime console, and authenticated integration still require verification. Broader static follow-ups from the initial report outside B01–B12 were not refactored or certified by this pass.

**Backend/integration:** No new backend defect was established. Access to the existing authenticated session and an approved disposable QA customer/tenant is still required for successful reads and safe create/edit/deactivate verification. The initial report's missing response-schema documentation and tenant-wide summary/live response checks remain outstanding. No real customer was created, edited, or deactivated in this pass.

**Browser authenticated E2E: BLOCKED.** The browser connection was retried and again returned `Browser is not available: iab`. No substitute credentials or tokens were used. Isolated API adapters and SSR tests do not count as authenticated E2E.

**IBMSFE-015 ready for Completed: NO.** The reproduced frontend fixes pass final automated verification, but the original integration acceptance criteria still require authenticated browser checks and the safe end-to-end customer lifecycle.
