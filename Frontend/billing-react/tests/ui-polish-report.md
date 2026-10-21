# Frontend UI polish verification

## Files changed in this pass

The worktree already contained changes from earlier work. This list identifies files edited for the current table, Login, Dashboard and Date Range pass.

- `src/components/DateRangeFilter.jsx`
- `src/styles/DateRangeFilter.css`
- `src/styles/WorkspaceUI.css`
- `src/styles/DashboardPremium.css`
- `src/styles/Login.css`
- `src/components/dashboard/DashboardFilters.jsx`
- `src/components/dashboard/StatCard.jsx`
- `src/components/dashboard/DashboardCharts.jsx`
- `src/pages/Dashboard/Dashboard.jsx`
- `src/pages/Login/Login.jsx`
- `src/pages/AuditActivity/AuditActivity.jsx`
- `src/pages/Customers/components/CustomerTable.jsx`
- `src/pages/Customers/pages/CustomerListPage.jsx`
- `src/pages/Customers/pages/CustomerList.jsx`
- `src/pages/CreditNotes/pages/CreditNoteList.jsx`
- `src/pages/CreditNotes/pages/CreditNoteDetails.jsx`
- `src/pages/CreditNotes/pages/CreditNoteForm.jsx`
- `src/pages/CreditNotes/utils/creditNoteCalculations.js`
- `src/pages/Products/ProductList.jsx`
- `src/pages/Products/components/ProductTable.jsx`
- `src/pages/Products/pages/CategoryList.jsx`
- `src/pages/Payments/Payments.jsx`
- `src/pages/Payments/PaymentDetails.jsx`
- `src/pages/Invoices/InvoiceForm.jsx`
- `src/pages/Invoices/InvoiceDetails.jsx`
- `src/pages/Invoices/components/InvoiceDateRangeFilter.jsx`
- `src/pages/Invoices/styles/invoices.css`
- `src/pages/InvoiceTemplates/InvoiceTemplates.jsx`
- `src/pages/Notifications/NotificationTemplates.jsx`
- `src/pages/Notifications/NotificationHistory.jsx`
- `src/pages/Quotations/pages/QuotationList.jsx`
- `src/pages/Quotations/pages/QuotationDetails.jsx`
- `src/pages/Quotations/components/QuotationAudit.jsx`
- `src/pages/Quotations/components/QuotationForm.jsx`
- `src/pages/Settings/DiscountConfiguration.jsx`
- `tests/workspace-ui.test.jsx`
- `tests/invoice-interactions.test.jsx`
- `tests/payments-ui.test.jsx`
- `tests/run-invoice-ui.mjs`

## Table standardization

The shared `ibms-table-frame` now attaches to actual table scroll containers instead of relying on a surrounding page card. It supplies left/right/top/bottom borders, rounded corners, Invoice-style headers, horizontal separators, padding and horizontal scrolling. Nested frame border suppression was removed. Scoped selectors prevent older module CSS from overriding shared header/padding rules. Printable documents were left outside the table audit.

Coverage: Dashboard recent records and monthly breakdown; Payments and allocations; Product catalog and categories; Customer directories and detail tables; Credit Notes and line/detail tables; Quotations and audit tables; Notification Templates and Communication History; Audit Activity; Invoice items/detail tables; Invoice Templates; Settings discount permissions. Existing shared-frame Settings charges/discount rules and Tax tables inherit the revised shared rules. No standalone Reports data table was found.

## Login

One `showPassword` state selects a single presentation object for input type, action label and icon. Following the supplied reference, icons indicate the current state: initial hidden state is password/Show password/slashed eye; visible state is text/Hide password/open eye. Accessible labels continue to describe the button action. The button stays a non-submit keyboard-accessible button and preserves input focus on mouse interaction. The independent browser reveal button is suppressed only on the Login password field. Brown focus/hover states preserve red validation borders. Required email/password and invalid email submissions remain blocked; tests check error persistence and retained password values.

## Dashboard

All KPI values share a smaller responsive scale and nowrap behavior, with fewer columns at narrow widths. Summary and quick-action links share hover/focus styling; unavailable non-link summary cards receive no interactive hover. Existing routes are unchanged. Aging center amounts stay together; rows have separate bucket, percentage and amount columns and compact borders. Recent Invoice/Payment amounts are left-aligned, table boundaries are complete, and customer names can use available width. All displayed values come from existing calculations.

## Date Range migration

| Module | Old UI | New UI | Preserved state/API contract |
| --- | --- | --- | --- |
| Invoice | Invoice Date Range | Shared Date Range, compatibility export | startDate/endDate |
| Dashboard | From Date + To Date | Shared Date Range | start/end state; invoice startDate/endDate; payment fromDate/toDate and existing timestamp bounds |
| Payments | From Date + To Date | Shared Date Range | from/to state -> fromDate/toDate |
| Customer detail tables/Statement | From date + To date | Shared Date Range | local start/end filtering; no API contract added |
| Credit Notes | From date + To date | Shared Date Range | fromDate/toDate state -> FromDate/ToDate |
| Quotations | Quote date from + Quote date to | Shared Date Range | local from/to filtering; no API contract added |
| Audit Activity | From date + To date (IST) | Shared Date Range | StartDate/EndDate; existing IST day-boundary serialization |
| Communication History | Ant RangePicker | Shared Date Range | startDate/endDate; existing IST day-boundary serialization |

The control uses Ant Design with normal CSS and the existing icon library. It retains Invoice's calendar-date strings, display format, staged apply, partial ranges, invalid-order prevention and clear behavior. Multiple controls have unique dialog IDs. Portal form submissions stop propagation to surrounding filter forms. Single-date form controls are unchanged. Dashboard period/reset relationships remain unchanged.

## Automated results

| Command | Result |
| --- | --- |
| node tests/run-workspace-ui.mjs | 44 passed, 0 failed; includes Notification UI, Login, shared tables, Dashboard UI and Date Range cases |
| node tests/run-protected-routes.mjs | 11 passed, 0 failed |
| node tests/run-date-controls.mjs | 3 passed, 0 failed |
| node tests/run-product-ui.mjs | 20 passed, 0 failed |
| node tests/run-payment-ui.mjs | 25 passed, 1 failed |
| node tests/run-draft-ui.mjs | 7 passed, 0 failed |
| node --test src/pages/Dashboard/dashboardModel.test.mjs src/pages/Dashboard/dashboardPeriods.test.mjs src/pages/Dashboard/dashboardRadial.test.mjs tests/credit-note-calculations.test.mjs tests/quotation-contracts.test.mjs tests/quotation-dates.test.mjs tests/quotation-state.test.mjs | 67 passed, 1 failed (68 total) |
| node tests/run-audit-activity.mjs | 8 passed, 0 failed |
| node tests/run-invoice-ui.mjs | 23 passed, 7 failed; Date Range interaction test passed |

Total: 208 passed, 9 failed, 217 tests. The suite is not fully green.

Existing failures left unchanged: Payment amount-validation expectations differ from current validation behavior (zero and decimal handling). Seven Invoice failures concern edit conflict/reload, details communication expectations, numbering validation/save/conflict/token cases and blank-draft validation. The Quotation failure asserts older item-action and product-selector markup, unrelated to this pass's table wrapper change. Financial logic was not changed to force these tests to pass.

The Credit Note formatter re-export now includes `.js` so native Node ESM tests can resolve the existing shared date utility; calculation behavior is unchanged.

## Regression scope

No backend files, endpoints, DTOs, payload builders, financial calculations, routes, authentication verification or tenant logic were changed in this pass. Existing sorting/pagination/actions were retained. The final passing targeted tests do not establish that the entire application is regression-free while the existing failures remain.

## Live QA

NOT EXECUTED / BLOCKED: no authenticated browser session was available. Automated DOM tests are not live authenticated QA.

## Build and whitespace checks

- `npm run build`: PASS, exit 0, 13,697 modules transformed; completed in 1m 31s. Vite retains its chunk-size warning for bundles above 500 kB.
- `git diff --check`: PASS. New shared component/style/test files were also checked for trailing whitespace.
