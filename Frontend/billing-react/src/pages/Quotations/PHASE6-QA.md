# Phase 6 QA / backend handoff

Scope: quotation frontend and its quotation-only API adapter. No backend or Phase 1?5 source changed. The quotation route comment was corrected. Existing shared Customer, Product, Tax and Discount services are reused. Charges/invoice-discount/override persistence is not simulated.

## Verification limits

No connected browsers or authenticated session were available. No live quotation/customer/product/invoice records were created or changed. Source review and mocked frontend tests do not establish production database behavior. Sequential and simultaneous conversion must be exercised against a disposable QA database before production sign-off.

The backend supports Draft ? Sent ? Approved ? Converted; cancellation UI is limited to Draft/Sent/Approved. Alternative Pending Approval/Accepted/Rejected/Expired requirements still need clarification. Expiry is not a backend lifecycle state and is no longer rendered as one.

The frontend uses one server quotation page, a 300 ms search debounce, generation-based stale-response rejection, server filters/sorting, and paged lookups. Validity filtering is withheld because no backend parameter exists. Historical details use saved financial values. Read-only preview supports saved quotations and estimates for unsaved forms. Product selection uses the public service, loads current product detail, and rejects inactive results. Tax choices come from public Tax service; no hardcoded rate/type is supplied. Discount preflight uses public configuration and validate-max, leaving role decisions to the authenticated backend. Unsupported overrides and charges are not offered as persisted data.

## Backend issues

### 1. BACKEND ISSUE: list validity contract
Feature: quotation list validity filtering.
Endpoint: GET /api/v1/quotations.
Observed behavior: QuotationListFilterRequest and QuotationRepository have no validity parameter/filter; search supports quotation number, customer name and reference only.
Expected behavior: documented server validity filtering, independent of lifecycle status.
Frontend impact: no valid server request can implement the requested validity filter; browser filtering is deliberately removed.
Severity: MEDIUM.
Evidence: Backend/Billing.Contracts/Quotation/QuotationContracts.cs; Backend/Billing.Infrastructure/Repositories/QuotationRepository.cs.

### 2. BACKEND ISSUE: BACKEND VALIDATION GAP
Feature: product existence, tenant ownership and active status; date ordering.
Endpoint: POST /api/v1/quotations; PUT /api/v1/quotations/{id}.
Observed behavior: QuotationService copies ProductId without loading/validating the product. Nullable ProductId permits unlinked items. A database foreign key alone cannot enforce product tenant or active status. Create/update do not enforce ValidUntil >= QuotationDate.
Expected behavior: authoritative product eligibility and date validation with clean 400 errors.
Frontend impact: frontend checks cannot protect direct API requests or concurrent product deactivation.
Severity: HIGH.
Evidence: QuotationService.CreateDraftAsync/UpdateDraftAsync; CreateQuotationItemRequest.

### 3. BACKEND ISSUE: authoritative financial engine not wired into save/lifecycle
Feature: financial totals.
Endpoint: POST/PUT /api/v1/quotations; POST /api/v1/quotations/{id}/send and /approve.
Observed behavior: create/update contain standalone discount and tax formulas. CalculateAndFreezeSnapshotAsync calls the shared engine but is not invoked by create/update/send/approve. It also maps NetItemSubtotal into Subtotal alongside a separate discount total; that semantic mapping needs confirmation before wiring it in.
Expected behavior: shared authoritative engine validation/calculation on save and the required freeze transition, with consistent gross/net subtotal meanings.
Frontend impact: draft estimates cannot guarantee Phase 5 parity; saved totals are displayed exactly as returned.
Severity: HIGH.
Evidence: QuotationService; QuotationActionService.CalculateAndFreezeSnapshotAsync/SendQuotationAsync/ApproveQuotationAsync.

### 4. BACKEND ISSUE: discount contract and enforcement
Feature: fixed/percentage, line/invoice discount, maximum, role permission and manual override.
Endpoint: POST/PUT /api/v1/quotations; POST /api/v1/settings/discounts/validate-max.
Observed behavior: quotation writes support only per-item type/rate, have no invoice discount or override/reason fields, and do not call the discount engine. validate-max compares Value directly against percentage caps without using DiscountType/InvoiceAmount, so fixed amounts are not correctly normalized by that service.
Expected behavior: shared discount enforcement with typed fixed/percentage values and persisted authorized override metadata/invoice discount.
Frontend impact: public validation is reused; fixed-discount correctness and invoice/override support remain blocked. No role caps or conversion workaround is implemented in React.
Severity: HIGH.
Evidence: Create/UpdateQuotationRequest; QuotationService; DiscountSettingService.ValidateMaxDiscountAsync.

### 5. BACKEND ISSUE: tax engine validation
Feature: product tax and inclusive/configured tax calculation.
Endpoint: POST/PUT /api/v1/quotations.
Observed behavior: save accepts TaxType/TaxRate and applies a simple exclusive percentage formula without validating the configured rule, effective dates, inclusive treatment or product association.
Expected behavior: authoritative shared tax-engine calculation against configured rules.
Frontend impact: no hardcoded tax remains; inclusive selections are explicitly reported as unsupported instead of silently saved using an exclusive formula. Estimates cannot guarantee full engine parity.
Severity: HIGH.
Evidence: QuotationService item loops; quotation item DTO; shared tax service contract.

### 6. BACKEND ISSUE: BACKEND CONTRACT GAP ? quotation charges persistence/calculation missing
Feature: Shipping/Handling/Convenience/Custom charges.
Endpoint: POST/PUT /api/v1/quotations.
Observed behavior: request DTOs contain no charges; create forces ChargesAmount=0. Shared Phase 5 charge configuration/calculation exists but cannot persist selections through quotations.
Expected behavior: charge selections, authoritative calculation and saved charge breakdown in quotation DTOs.
Frontend impact: charges are shown only from saved server totals; no fake charge controls/persistence are provided.
Severity: HIGH.

### 7. BACKEND ISSUE: numbering fallback requires confirmation
Feature: quotation numbering.
Endpoint: POST /api/v1/quotations.
Observed behavior: numbering-engine failure falls back to QT-date-random GUID fragment. Create also accepts an explicit client QuoteNumber.
Expected behavior: confirmed policy: either fail cleanly or explicitly authorize this fallback; required sequence integrity must not be silently bypassed.
Frontend impact: frontend never generates/sends a number; cannot ensure configured sequence policy on backend fallback.
Severity: MEDIUM.
Evidence: QuotationService.CreateDraftAsync.

### 8. BACKEND ISSUE: Send validation/communication semantics
Feature: Send.
Endpoint: POST /api/v1/quotations/{id}/send.
Observed behavior: checks Draft and CustomerId > 0, but not actual customer eligibility, items, amount or validity date. Adds an Email/Sent communication row without invoking an email sender and can use customer@example.com as fallback.
Expected behavior: enforce required business checks and accurately distinguish recorded status from delivered communication.
Frontend impact: valid-looking actions may be accepted with invalid data; the UI displays supplied history without inventing delivery confirmation.
Severity: HIGH.
Evidence: QuotationActionService.SendQuotationAsync.

### 9. BACKEND ISSUE: BACKEND AUTHORIZATION GAP
Feature: approve and quotation actions.
Endpoint: /api/v1/quotations and lifecycle actions.
Observed behavior: controller has [Authorize] and tenant scoping, but no quotation-specific permission/policy enforcement or returned action capabilities. Current frontend auth surface has no quotation capability contract.
Expected behavior: backend action authorization with documented capability information for UI visibility.
Frontend impact: lifecycle visibility is implemented; frontend cannot infer role policy or provide security enforcement.
Severity: HIGH.
Evidence: QuotationsController; QuotationActionService.

### 10. BACKEND ISSUE: cancellation lifecycle
Feature: cancel.
Endpoint: POST /api/v1/quotations/{id}/cancel.
Observed behavior: rejects Converted only; repeated Cancelled requests append notes and audit entries.
Expected behavior: permit only Draft/Sent/Approved cancellation, reject repeat/invalid transitions.
Frontend impact: UI hides invalid actions, but direct API requests remain possible.
Severity: MEDIUM.
Evidence: QuotationActionService.CancelQuotationAsync.

### 11. BACKEND ISSUE: CRITICAL INTEGRATION GAP ? Invoice frontend is not reading converted backend invoices
Feature: converted invoice visibility.
Endpoint: POST /api/v1/quotations/{id}/convert; invoice list integration.
Observed behavior: conversion inserts an Invoice in the database and returns its numeric ID. Invoices.jsx imports getInvoices from data/billingStore.js, which reads localStorage. No small existing database-invoice list service was found to reuse.
Expected behavior: Invoice module reads the same persisted invoices created by conversion.
Frontend impact: quotation shows the resulting invoice ID, but opening the current Invoice module cannot reliably show it. That module was not rewritten.
Severity: CRITICAL.
Evidence: QuotationActionService.ConvertToInvoiceAsync; Frontend/billing-react/src/pages/Invoices/Invoices.jsx; src/data/billingStore.js.

### 12. BACKEND ISSUE: customer/address and historical snapshot contract missing
Feature: historical customer/product metadata.
Endpoint: GET/POST/PUT /api/v1/quotations and GET /{id}.
Observed behavior: detail maps current q.Customer name/email/phone/address and current Product name/code; no saved billing/shipping address snapshot contract is provided. Numeric line price/discount/tax/total fields ARE persisted and displayed without recalculation.
Expected behavior: immutable required customer/address/product metadata snapshots at the agreed lifecycle transition.
Frontend impact: no client enrichment overwrites saved quotation financial values, but live metadata can change and cannot be repaired in React.
Severity: HIGH.
Evidence: QuotationService.MapToDetailResponse; Quotation/QuotationItem entities and DTOs.

### 13. BACKEND ISSUE: audit attribution is fabricated when creation history is missing
Feature: audit history.
Endpoint: GET /api/v1/quotations/{id}/audit.
Observed behavior: controller synthesizes Created using User #2 and QuotationDate if no creation row exists. QuotationService labels every positive discount as Discount Override without validated override metadata.
Expected behavior: return actual recorded events and actors; distinguish normal discount application from authorized override.
Frontend impact: frontend cannot establish reliable attribution or override compliance from this response; no replacement history is fabricated.
Severity: HIGH.
Evidence: QuotationsController.GetAuditLogs; QuotationService create/update audit blocks.

### 14. BACKEND ISSUE: deployment timezone contract verification
Feature: communication/audit timestamps.
Endpoint: GET /api/v1/quotations/{id}/communication and /audit.
Observed behavior: earlier user-supplied API timestamp lacked a timezone suffix. Current repository has a UTC converter; the deployed API version could not be checked in an authenticated session.
Expected behavior: UTC event instants include Z or an explicit offset.
Frontend impact: explicit offsets are formatted locally; missing timezone now displays an unavailable-date indication rather than a guessed UTC conversion, as requested by this QA scope.
Severity: MEDIUM (deployment verification, not a newly proven defect in current source).

## Duplicate conversion assessment

Sequential repeat is rejected by Approved-status and ConvertedInvoiceId checks. A shared EF transaction wraps invoice creation and quotation update; Quotation.RowVersion is configured with IsRowVersion and the repository updates it. Therefore source inspection does NOT justify claiming that all concurrency protection is missing. No unique invoice-source quotation key or real-database simultaneous conversion test was found. Verify the deployed provider-generated row-version behavior and rollback with two concurrent requests before sign-off; no React-only workaround is claimed as concurrency protection.

## Build environment

Shared billing-api-client could not resolve axios from its sibling app install. An ignored local Frontend/node_modules junction to the existing billing-react/node_modules restored dependency resolution; no package manifest, lockfile, or shared Phase 1?5 implementation was changed. Fresh CI environments still need dependencies installed/resolved at the shared client's ancestor path.

## Frontend files changed / added / removed

- Frontend/billing-api-client/quotationApi.js
- Frontend/billing-react/src/pages/Quotations/PHASE6-QA.md
- Frontend/billing-react/src/pages/Quotations/QuotationManagement.jsx
- Frontend/billing-react/src/pages/Quotations/components/QuotationAudit.jsx
- Frontend/billing-react/src/pages/Quotations/components/QuotationDialogs.jsx
- Frontend/billing-react/src/pages/Quotations/components/QuotationForm.jsx
- Frontend/billing-react/src/pages/Quotations/components/QuotationLookup.jsx
- Frontend/billing-react/src/pages/Quotations/components/QuotationPreview.jsx
- Frontend/billing-react/src/pages/Quotations/components/QuotationStatusBadge.jsx
- Frontend/billing-react/src/pages/Quotations/data/quotationMockData.js
- Frontend/billing-react/src/pages/Quotations/pages/QuotationDetails.jsx
- Frontend/billing-react/src/pages/Quotations/pages/QuotationList.jsx
- Frontend/billing-react/src/pages/Quotations/styles/quotations.css
- Frontend/billing-react/src/pages/Quotations/utils/quotationCalculations.js
- Frontend/billing-react/src/pages/Quotations/utils/quotationDates.js
- Frontend/billing-react/src/pages/Quotations/utils/quotationDiscount.js
- Frontend/billing-react/src/pages/Quotations/utils/quotationQuery.js
- Frontend/billing-react/src/pages/Quotations/utils/quotationValidation.js
- Frontend/billing-react/src/routes/AppRoutes.jsx
- Frontend/billing-react/tests/quotation-contracts.test.mjs
- Frontend/billing-react/tests/quotation-dates.test.mjs
- Frontend/billing-react/tests/quotation-state.test.mjs

## Focused validation

43 tests passed; 0 failed across quotation-state, quotation-dates, quotation-contracts, tax-api and catalog-qa. Tests exercise supported frontend behavior and mocked public service contracts; no live backend lifecycle or simultaneous database conversion test ran. git diff --check passed.
