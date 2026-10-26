# Final frontend QA closure

Date: 24 October 2026 (Asia/Calcutta).

**Disposition: the named frontend test uncertainties are resolved. Complete project QA is NOT claimed to have passed. Authenticated browser E2E: NOT EXECUTED.**

This closure continued the completed audit. Only affected checks ran, with explicit name filters, per-test deadlines and process-tree deadlines. No full-project regression cycle ran. Existing user changes were preserved, no backend file was modified, no production mock financial data was introduced, no tests were deleted, and nothing was staged.

## A. Remaining defects and exact test names

No confirmed frontend runtime defect remains open within the named closure scope after the reproduced payment-precision bug was fixed. The exact current checks are:

| Concern / exact test name | Current result | Finding |
| --- | --- | --- |
| Edit loads server values; inline financial and saved preview/back preserve edits; 409 reload restores latest | PASS | Loads server values, checks inline server-calculated totals, opens the saved-document preview, navigates back, preserves the edit draft, retains edits/original RowVersion on 409, and reloads/reuses the latest version. |
| Blank draft displays required-field errors and never submits to the API | PASS | Valid dates are defaulted; an impossible typed date and cleared dates are explicitly rejected with no save request. |
| Details tabs query payment/credit/audit; draft communication requires issue and exposes no Send action | PASS | Correct draft-state wording, no Send/Resend action and no fabricated email success. |
| Invoice Send transport requires confirmed true and propagates failures (API boundary only) | PASS | False/rejected responses remain failures. No live email was sent by this test. |
| Payments load failures render once inside the table across all columns | PASS | Dedicated payment suite verifies one visible error, Retry, eight-column span, no fabricated empty success or fallback rows. |
| Payment retry clears the error/loading state after a confirmed response | PASS | Exercises Retry, payment and authentication refetch, disabled refresh while pending, and error/loading cleanup on success. |
| Validation covers amount, method details, dates and reversal limits | PASS | Rejects zero, negatives and excess precision; preserves valid fractional amounts. |
| Fresh balance, exact retry and duplicate guard are wired before mutations | PASS | Uses the exact validated amount and fresh outstanding balance; preserves idempotency and duplicate guards. |
| Record payment preserves fractions, compares the exact fresh balance and blocks duplicate submission | PASS | Rejects 0/-1/1.001 and amounts above a newly changed balance; accepts 80.25 against 80.25; submits the unchanged fractional DTO once on two confirmation clicks. Fixtures are isolated in tests. |
| PQA Unit Price sorting keeps the price field and left alignment in both directions | PASS | Verifies left-aligned cells/header, ascending/descending accessibility state, label/icon order, layout configuration and the actual price sort callback. |

Country persistence remains unavailable against the previously evidenced deployed backend; this is a backend blocker, not a currently failing frontend test. Authenticated email, export, numbering persistence and complete browser navigation remain unverified live workflows.

## B. Genuine bugs / requirement regressions fixed

**Payment precision:** the previous epsilon comparison accepted 1.00000001 even though it has more than two decimal places. The strengthened Validation covers amount, method details, dates and reversal limits test reproduced this failure in closure-payment-precision-reproduction.log (0 PASS / 1 FAIL). Validation now requires the numeric value to equal its two-decimal representation, without truncating it or accepting an epsilon. Tests reject 1.00000001 and 80.25000001 while accepting 0.01, 1.13, 2.51, 12.50 and 80.25. The final affected payment suite passes 26/26; see closure-payments-final.log.

The Dashboard displayed a visible Currency selector despite the approved hide-selector requirement. The discrepancy was reported before changing it; the user confirmed **Hide the visible selector; preserve accurate multi-currency calculations**. The selector and unused selection state were removed from DashboardFilters/Dashboard. Currency selection/calculation helpers still keep currencies separate, preserve historical INR activity, select a supported currency deterministically, and label amounts with their currency. The named Dashboard hide-selector interaction and dashboard model/radial tests pass.

No Invoice runtime change was necessary for the named historical failures: the current workflows passed after correcting outdated expectations and incomplete test fixtures. Payments received the additional precision fix described above; error rendering, retry and exact-balance submission behavior required no runtime rewrite. Existing fractional-payment, numbering, export, country-error and dashboard financial fixes were preserved.

## C. Outdated expectations corrected without dropping coverage

- The old Invoice edit test clicked a removed Preview button and expected an unsaved-document overlay. Current edit UI has an inline authoritative financial preview; saved-document preview is a separate route. The test now covers both, plus navigation/draft preservation and 409/reload behavior, instead of restoring removed UI.
- Blank Invoice dates are defaulted to today and one month later. The old assertion expected a date error without clearing those valid values. The revised test first verifies the defaults, then types 31/02/2026 and clears both dates to prove invalid/required validation still blocks saves. ISO YYYY-MM-DD payload values and displayed dd/mm/yyyy dates are unchanged.
- Draft communication correctly says it must be issued prior to dispatch. Local backend source has send/resend/deliver routes, so a blanket unavailable-server message was an outdated expectation. Draft action gating and negative API responses are tested; live Send/Resend is not declared functional.
- Previously updated payment tests already matched the current eight-column error layout and decimal-preserving fresh-balance comparison. The affected payment suite passed 26/26. Historical truncation assertions were not restored.
- Unit Price no longer requires a repeated inline/serialized flex-direction style string: Emotion can emit a reusable class in an earlier render. The revised test retains alignment and order assertions and additionally checks layout props, active direction and the price sort callback.

Two newly added checks initially exposed fixture mistakes, then passed after targeted corrections: CalculationRequest intentionally omits descriptions, and Payment Retry refetches authentication as well as payments. The former now verifies financial calculation inputs and separately verifies the saved description; the latter supplies the authentication response and asserts its URL. A new checkout-manifest assertion also required Windows path normalization; its final two-test source run passes.

## D. Exact results, historical failures and environment blocks

Do not sum these overlapping execution groups as unique project tests. PASS/FAIL below are recorded assertion executions; BLOCKED counts refer to runs, since an interrupted runner cannot enumerate unexecuted test cases.

| Closure evidence | PASS | FAIL | BLOCKED runs | Notes |
| --- | ---: | ---: | ---: | --- |
| closure-payments.log | 26 | 0 | 0 | Initial affected payment suite, before the extra precision boundary was added. |
| closure-payment-precision-reproduction.log | 0 | 1 | 0 | Reproduced the genuine excess-precision defect. |
| closure-payments-final.log | 26 | 0 | 0 | Final affected payment suite after the precision fix; latest payment status is 26 PASS / 0 FAIL. |
| closure-invoice.log | 16 | 2 | 0 | 18 named cases; the two newly introduced fixture assertions initially failed. |
| closure-invoice-followup.log | 2 | 0 | 0 | Only those two corrected cases rerun. Latest status of all 18 selected Invoice/dashboard/numbering/export/payment-interaction cases: 18 PASS / 0 FAIL. |
| closure-focused-ui.log | 4 | 0 | 0 | Unit Price and country/settings expectations only. |
| closure-contracts.log | 32 | 0 | 0 | Numbering DD/RowVersion/non-consuming preview, authenticated export transport, dashboard model/radial, CSS cascade, source/import checks. |
| closure-source.log | 2 | 0 | 0 | Final source check including the new checkout-manifest assertion; overlaps the source case in contracts. |
| closure-reproduce-invoice.log | unknown | unknown | 1 | Initial three-case reproduction exceeded 90 seconds and its owned process tree was stopped; no assertion counts were emitted. |

**Currently reproduced failing test cases: 0 in the selected closure scope.** No project-wide unique test count or complete-project PASS is inferred. Name-filtered checks did not execute unrelated tests.

Historical evidence remains historical:

- The saved 16-suite completed ledger remains **566 PASS / 9 FAIL / 0 recorded blocked cases, 575 executions** in final-evidence-counts.json. Runners overlap, and the old failed expectations remain in those logs. The quotation expectation had already been corrected and passed in the previous final-targeted.log.
- The earlier final-targeted.log remains **56 PASS / 0 FAIL**. The earlier target-numbering-export.log remains **6 PASS / 0 FAIL**. They are not new closure runs and are not added as unique cases.
- Three earlier memory-aborted diagnostic runs remain environment-blocked history: original invoice runner, targeted dashboard diagnostic, dashboard debug diagnostic. Their prevented test-case counts are unknown. The completed invoice-final-check.log superseded the initial abort for the original ledger.
- The initial closure sandbox denial occurred before test bundling; see closure-sandbox-denied.log. The bounded retry did not turn that denial into a product defect.
- The first current closure build exceeded its 120-second deadline after transforming 13,743 modules and reaching chunk rendering. See closure-build.json/log. Its owned process tree was stopped. Build status is separate from test assertions.

## E. Files changed

The complete observed working-tree inventory is CHANGED-FILES.md; it includes pre-existing frontend/user changes and does not imply audit authorship.

This closure changed exactly these eight runtime/test files, preserving their existing changes:

1. src/components/dashboard/DashboardFilters.jsx: hide the visible Currency selector.
2. src/pages/Dashboard/Dashboard.jsx: remove unused selector state/props; preserve currency calculations.
3. tests/invoice-interactions.test.jsx: replace outdated scenarios with current workflow assertions; add navigation/draft context, retry/fractional interactions and negative Send boundary coverage.
4. tests/product-ui.test.jsx: meaningful Unit Price layout/sort assertions independent of style-tag reuse.
5. tests/run-payment-ui.mjs: accept targeted Node test arguments and add test/runner deadlines.
6. src/pages/Payments/paymentValidation.js: reject tiny excess precision without truncating valid fractions.
7. tests/payments-ui.test.jsx: add tiny excess-precision failures and binary-sensitive valid fractional amounts.
8. tests/frontend-source.test.mjs: verify imports against tracked source plus the four explicitly required runtime additions; normalize Windows paths.

Closure documentation and bounded runner/evidence artifacts are also listed in the inventory. No unrelated runtime modules, backend files, dependency manifests or CSS implementations were changed by this closure. No existing files were deleted or automatically staged.

## F. Required untracked files

UNTRACKED-REVIEW.md individually classifies all original 20 untracked files: **4 runtime sources, 5 tests/fixtures, 9 useful QA reports and 2 disposable diagnostic scripts**. All were retained.

The required runtime files are:

- src/components/DateRangeDatePicker.jsx
- src/pages/Dashboard/dashboardAging.js
- src/pages/Invoices/services/invoiceExport.js
- src/pages/NumberingSettings/validation/numberingTokens.js

Include them with the tracked frontend changes for a usable checkout. The virtual clean-checkout import-manifest test and parser/import check pass across 222 runtime modules. No separate dependency install or browser run in another checkout is claimed. Existing debug-dashboard.mjs and run-all.mjs are retained diagnostic artifacts, not deployment dependencies. Logs are Git-ignored and should accompany shared QA evidence separately.

## G. Production build and git diff --check

The previous audit recorded a successful production build: exit 0, Vite 5.4.21, 13,743 transformed modules, approximately 85 seconds; final-production-build-unrestricted.log/final-build-result.json. That is historical evidence and does not establish a successful build after the selector change.

- **Final production build: PASS**, exit 0, Vite 5.4.21, 13,743 modules transformed; Vite reported approximately 80 seconds (runner 83 seconds). This build includes both the hidden-selector change and final payment-precision fix. Evidence: closure-build-final.log/json. Warnings remain for chunks larger than 500 kB and mixed static/dynamic html2pdf imports.
- **git diff --check: PASS**, exit 0. Evidence: closure-diff-check.log. A Git LF/CRLF conversion notice is informational, not a failed whitespace check. This command covers tracked diffs, not untracked file contents.
- The first current build was **BLOCKED** at its 120-second deadline, and a subsequent 4 GB bounded retry passed in approximately 40 seconds before the final payment fix. Those separate historical attempts remain in closure-build.json and closure-build-retry.json; neither is silently erased or used in place of the final build.
- Machine-readable current evidence and count scopes: closure-summary.json. No broad regression suite was rerun.

## H. Backend blockers and API evidence

No backend files were modified. Backend tests were not executed during closure and no backend test counts are invented.

- Existing deployed-contract-summary.json (24 October 2026, 13:07 IST) records Swagger HTTP 200 with 150 paths, no country-settings contract and a 404 for /api/v1/settings/country. Country load/save persistence remains blocked; the frontend reports it honestly and does not hydrate fake saved state from legacy storage.
- Existing unauthenticated export/numbering probes returned 401. The export transport tests verify shared authentication and tenant headers in an isolated adapter; they do not prove a live authenticated download or numbering save.
- Read-only local backend inspection found POST /api/v1/invoices/{id}/send, /resend and /deliver aliases plus a communications route in InvoicesController.cs. Those routes call DeliverInvoiceAsync. This is source-level capability evidence, not evidence of deployed SMTP delivery or successful authenticated Send/Resend. No live send was attempted.
- Invoice export discloses the 10,000-row cap; export completeness beyond that limit remains unverified.

## I. Authenticated browser E2E

**NOT EXECUTED.** All described UI checks are component/JSDOM or SSR tests with isolated test fixtures; no test fixture is supplied to the production application. No claim is made that authenticated Send/Resend, live financial mutations or all project workflows passed.
