# IBMS Phase 2 — U07–U13 UI alignment and consistency

Project: `Frontend/billing-react`. Date: 27 October 2026.

Scope completed with one contract limitation: U07, U08, U09, U11 and U13 are fixed; U10 was already fixed and is retained; U12 precision and presentation are fixed, but authoritative currency identification is pending. No backend files, API contracts or financial calculations were modified. Existing user changes and approved U01–U06 rules were preserved. No live financial/configuration writes or mock application records were introduced. No Phase 3/performance work was started.

## Findings and results

| ID | Root cause | Exact source files changed (relative to frontend root) | Browser verification | Result |
|---|---|---|---|---|
| U07 | A more-specific shared container grid overrode the mobile payment summary rule; amounts allowed character wrapping | `src/styles/Payments.css` | 390/768/1024/1440px. Real ₹20,000.00 fits on one line; amount height 72px before → 36px after at 390px | FIXED |
| U08 | Local list/detail transitions replaced content without resetting the actual app scroll container; browser anchoring could also interfere with Back restoration | `src/pages/Quotations/QuotationManagement.jsx` | Four widths; details scrollTop 0 and visible heading. Final mobile round trip 116.8px list → 0px details → 116.8px Back. Preview state retained 140.8px | FIXED |
| U09 | Register-specific customer rules forced centered cells and independently centered inner blocks. Other main tables already followed the approved conventions | `src/pages/Customers/styles/customer-list.css` | Five modules at four widths, every main-table column checked against body rows. Existing customer cards retained at narrow widths | FIXED; other module layouts retained |
| U10 | Original shared-header specificity mismatch had already been corrected in Phase 1 | None in this phase | Actions header/body remain center/center at all four widths; mobile keyboard menu opens within the local table scroller | VERIFIED EXISTING FIX |
| U11 | Quotation/tax date-only output used raw ISO or local formats; delivery calendar dates used named months; quotation communication timestamps lacked a consistent explicit zone | `src/pages/Quotations/pages/QuotationList.jsx`; `src/pages/Quotations/pages/QuotationDetails.jsx`; `src/pages/Quotations/utils/quotationDates.js`; `src/pages/Taxes/Taxes.jsx`; `src/pages/Webhooks/DeliveryDetails.jsx` | Quotation list/detail, taxes, invoices and deliveries at four widths; actual communication timestamp additionally reviewed. Date-only DD/MM/YYYY; quotation timestamps IST; deliveries retain UTC | FIXED |
| U12 | Charge view hardcoded ₹ and omitted fixed decimal precision; the charge contract has no currency | `src/pages/Settings/ChargesConfiguration.jsx`; `src/pages/Settings/chargeDisplay.js` | Four widths: 100.00, 20,000.00, 45.00 and 2,500.00 with “Currency not provided”. Supported-currency helper path and unchanged percentage rates tested separately | PARTIAL: currency identity pending contract |
| U13 | Percentage column widths gave username only about 138px; `overflow-wrap:anywhere` split email addresses and left unused space in Actions | `src/pages/UserRoleAdministration/UserRoleAdministration.jsx`; `src/pages/UserRoleAdministration/user-role-administration.css` | Four widths, 280px username/email columns, matching header/body geometry, local scrolling, keyboard-focus full-value tooltip and reachable mobile action menu | FIXED |

## Measurements and behavior

[Raw browser measurements](browser-measurements.json), [verification results](browser-verification.json), [table alignment](table-alignment.json) and [customer card measurements](customer-card-measurements.json) contain the evidence.

- **52 screen/viewport cases PASS, 0 FAIL**: 13 affected/reference screens × 390, 768, 1024 and 1440px. Heights were 844px at mobile and 900px otherwise. Selected after-evidence has matching viewport dimensions and complete rendered frames.
- **252 table-column geometry/alignment cases PASS**: header and measured body cells have matching x/width, with maximum recorded differences of 0 CSS px; text-align matches in each column. Measurements cover up to ten current-page rows, encompassing all returned rows in the seven measured main tables.
- **16 customer-card field cases PASS** at 390/768px. The pre-existing responsive card layout hides the table header, so table-column geometry is N/A there. Card labels/values are left-aligned and fit. Existing compact labels “Code” and “Tax ID” correspond to desktop “Customer code” and “Tax ID / GSTIN”.
- **No unintended document or app-content horizontal overflow** was measured in the 52 cases. Wide tables retain contained scrolling.

| Main table | Columns | Header/body text alignment after fix |
|---|---:|---|
| Customers | 8 | Left/left at desktop/laptop; left-aligned labelled cards at narrow widths |
| Products & Services | 11 | Left/left |
| Payments | 8 | Left/left |
| Invoices | 15 | Left/left |
| Credit Notes | 9 | Financial/text columns left/left; existing Actions right/right retained |
| Invoice Templates | 7 | Actions center/center; other columns left/left |
| User Administration | 9 | Actions center/center; other columns left/left |

Approved amount alignment was preserved. No global right-alignment rule, broad overflow hiding, new global table rewrite or new `!important` was added. U13 uses local text ellipsis with full DOM text and keyboard-focus tooltip disclosure, not page-level clipping.

Read-only behavior checks:

- Customers: ascending customer-code sort; search CUST-001 returned the single matching row; five-row pagination reached “Showing 6–7 of 7 customers” with CUST-006/CUST-007, then returned to page one.
- Products: ascending PRD-1 through PRD-6 and `aria-sort=ascending`; existing laptop View/Edit menu remained reachable. No edit was submitted.
- Payments: existing mobile action menu opened Payment Details; actual payment/allocation amounts remained readable. Existing focused tests retain query/filter/sort and money precision coverage.
- Templates: keyboard Enter opened View/Deactivate menu after scrolling to Actions at 390px; Escape closed it. No deactivation was invoked.
- Users: keyboard focus disclosed full identity text; mobile action menu was reached and closed without changing users/roles.
- Quotations: real list/detail/Back transitions and ordinary preview state were measured. The effect is restricted to screen transitions or a changed detail record; selecting a record while remaining in the list does not reset scroll. One animation-frame correction prevents browser scroll anchoring from undoing restoration, with cleanup on the next transition/unmount. Shorter content can still cause normal browser scroll clamping; no forced reset is applied to ordinary tab/state updates.

## Date and currency checks

Date-only values reuse `src/utils/localDate.js` `displayDate`: supplied calendar days remain DD/MM/YYYY. Quotation list/detail/document and tax list/detail use it. Invoice display was already compliant and its source was left unchanged. Raw ISO form fields, comparison/sorting values, API parameters and persisted dates remain unchanged.

Quotation timestamps reuse the existing explicit-zone parser. The display convention is now numeric dates with explicit Asia/Kolkata/IST; explicit offsets retain the instant, and missing/invalid API timezone remains reported as unavailable rather than guessed. Real communication evidence displayed `26/10/2026, 06:07 pm IST`.

Webhook delivery timestamps retain the existing UTC instant and legacy timezone-less-as-UTC behavior. The date line uses the UTC ISO calendar day with the shared date-only formatter, and the clock still says UTC. Component tests verify an offset crossing midnight becomes the correct preceding UTC day, preserving the ISO datetime attribute.

For U12, `ChargeConfigurationDto` in `Backend/Billing.Contracts/Charges/ChargeContracts.cs` supplies Amount but no Currency; the inspected TenantDto also has no authoritative charge currency. Those files were read only. The existing frontend adapter likewise exposes no charge currency. A Dashboard filter or country selection does not establish the currency of a globally configured charge.

The view therefore removes the rupee assumption, displays fixed numeric values with two decimals, and explicitly says “Currency not provided”; its fixed-value form label says “amount”. Percentage values and saved amounts are unchanged. The helper reuses the existing `formatProductPrice` when an authoritative supported currency is supplied. The current screen cannot bind that context yet. **Backend/contract blocker:** provide a documented charge currency or authoritative tenant charge-currency context. No API/contract changes were attempted in this frontend task.

## Exact CSS selectors

U07 (`Payments.css`, screen max-width 600px):

- `.payments-page .payment-summary-card .payment-summary-totals` — one-column grid with sufficient specificity.
- `.payments-page .payment-summary-totals dd` — nowrap monetary text and normal overflow wrapping.

U09 (existing screen-scoped customer register rules):

- `.customers-page .customer-panel .customer-table .MuiTable-root .MuiTableCell-root.MuiTableCell-head`
- `.customers-page .customer-panel .customer-table .MuiTable-root .MuiTableCell-root.MuiTableCell-body`
- `.customers-page .customer-panel .customer-table .MuiTableCell-body .customer-contact`
- `.customers-page .customer-panel .customer-table .customer-identity`
- `.customers-page .customer-panel .customer-table :is(.customer-name-heading, .customer-contact-heading)`
- `.customers-page .customer-panel .customer-table .customer-row-actions`
- `.customers-page .customer-panel .customer-table .customer-status-details`

U13:

- `.ura-user-table:not(.ura-assignment-table)` and its paired `th:nth-child(n)` / `td:nth-child(n)` for n=1–9. Widths: 160, 280, 280, 130, 120, 120, 110, 110, 80px; minimum table width 1390px. Assignment-specific column rules are retained.
- `.ura-user-identity-text`, `.ura-user-identity-text:focus-visible`
- `.ura-page .ura-table-wrap`, `.ura-page .ura-table-wrap:focus-visible`

U10 had no CSS edits in this phase. Other theme, table-border, print and responsive rules were preserved.

## Automated verification

| Check | PASS | FAIL | Command/result |
|---|---:|---:|---|
| CSS cascade and scoped Phase 2 guards | 13 | 0 | `node --test tests/css-cascade.test.mjs` |
| Quotation timestamps | 4 | 0 | `node --test tests/quotation-dates.test.mjs` |
| Presentation components/formatters | 6 | 0 | `node tests/run-phase2-presentation.mjs` |
| Existing payment details/query/precision tests | 3 | 0 | `node tests/run-payment-ui.mjs --test-name-pattern="Payment details maps actual|Payment money preserves|Payment query preserves"` |
| Production build | PASS | — | Final `npm run build`: Vite 5.4.21, 15,352 modules, 1m15s; main asset `index-Bw4jWLpT.js` |
| `git diff --check` | PASS | — | Exit 0; checkout LF/CRLF warnings only |

**Final targeted tests: 26 PASS / 0 FAIL.** [Machine-readable results](verification-results.json). Tests use isolated formatting inputs/existing component fixtures; no application mock data or live backend writes were introduced. No full project suite was run.

Only the customer CSS baseline was updated in this phase. The script first reproduced the pre-phase canonical hash and compared unchanged print AST rules, then accepted the specific U09 alignment/inner-offset changes. Prior hashes/review reasons are recorded in the baseline. Existing quotation, credit and WorkspaceUI snapshots were not replaced. All earlier cascade, theme, print, value, focus and local-scroll protections remain, with three new Phase 2 guards. The quotation date test expectation was updated for the approved display while retaining offset/midnight/missing-timezone checks.

The production build still warns about mixed static/dynamic html2pdf imports and a chunk above 500 kB. Those warnings were not treated as a performance PASS and no optimization was started.

Test files changed/added:

- `tests/css-cascade.test.mjs`
- `tests/css-cascade-baseline.json`
- `tests/quotation-dates.test.mjs`
- `tests/phase2-presentation.test.jsx` (new)
- `tests/run-phase2-presentation.mjs` (new, supports forwarded Node test arguments)

## Before/after evidence

The interrupted run's baselines were reused, not recaptured. Some saved before frames were incomplete during viewport resizing: **21/52 are full frames, 31/52 are partial or have stale image dimensions**. They remain preserved and are flagged in [screenshot quality](screenshot-quality.json); partial before frames are not presented as complete visual proof. Root-cause evidence also remains in the original `audit/UI-UX-PERFORMANCE-AUDIT.md`. All selected after frames are complete and match the tested dimensions.

Two extra quotation-labelled observations landed on Products rather than Quotations and were excluded; see [excluded observations](excluded-observations.json). Verification uses route-matched captures only.

A † marks an incomplete before image. Original measurements remain available for every baseline. Full-size images are primary evidence; overviews are navigation aids.

| Screen | 390px before / after | 768px before / after | 1024px before / after | 1440px before / after |
|---|---|---|---|---|
| U07 Payment details | [Before](evidence/before-payment-details-390.png) / [After](evidence/after-payment-details-390.png) | [Before†](evidence/before-payment-details-768.png) / [After](evidence/after-payment-details-768.png) | [Before†](evidence/before-payment-details-1024.png) / [After](evidence/after-payment-details-1024.png) | [Before†](evidence/before-payment-details-1440.png) / [After](evidence/after-payment-details-1440.png) |
| Quotation list | [Before†](evidence/before-quotations-390.png) / [After](evidence/after-quotations-390.png) | [Before](evidence/before-quotations-768.png) / [After](evidence/after-quotations-768.png) | [Before†](evidence/before-quotations-1024.png) / [After](evidence/after-quotations-1024.png) | [Before](evidence/before-quotations-1440.png) / [After](evidence/after-quotations-1440.png) |
| U08/U11 Quotation details | [Before](evidence/before-quotation-details-390.png) / [After](evidence/after-quotation-details-390.png) | [Before†](evidence/before-quotation-details-768.png) / [After](evidence/after-quotation-details-768.png) | [Before†](evidence/before-quotation-details-1024.png) / [After](evidence/after-quotation-details-1024.png) | [Before†](evidence/before-quotation-details-1440.png) / [After](evidence/after-quotation-details-1440.png) |
| U09 Customers | [Before†](evidence/before-customers-390.png) / [After](evidence/after-customers-390.png) | [Before†](evidence/before-customers-768.png) / [After](evidence/after-customers-768.png) | [Before†](evidence/before-customers-1024.png) / [After](evidence/after-customers-1024.png) | [Before](evidence/before-customers-1440.png) / [After](evidence/after-customers-1440.png) |
| Products | [Before](evidence/before-products-390.png) / [After](evidence/after-products-390.png) | [Before†](evidence/before-products-768.png) / [After](evidence/after-products-768.png) | [Before†](evidence/before-products-1024.png) / [After](evidence/after-products-1024.png) | [Before†](evidence/before-products-1440.png) / [After](evidence/after-products-1440.png) |
| Payments | [Before](evidence/before-payments-390.png) / [After](evidence/after-payments-390.png) | [Before†](evidence/before-payments-768.png) / [After](evidence/after-payments-768.png) | [Before†](evidence/before-payments-1024.png) / [After](evidence/after-payments-1024.png) | [Before†](evidence/before-payments-1440.png) / [After](evidence/after-payments-1440.png) |
| Invoices | [Before†](evidence/before-invoices-390.png) / [After](evidence/after-invoices-390.png) | [Before](evidence/before-invoices-768.png) / [After](evidence/after-invoices-768.png) | [Before†](evidence/before-invoices-1024.png) / [After](evidence/after-invoices-1024.png) | [Before](evidence/before-invoices-1440.png) / [After](evidence/after-invoices-1440.png) |
| Credit notes | [Before†](evidence/before-credit-390.png) / [After](evidence/after-credit-390.png) | [Before](evidence/before-credit-768.png) / [After](evidence/after-credit-768.png) | [Before](evidence/before-credit-1024.png) / [After](evidence/after-credit-1024.png) | [Before](evidence/before-credit-1440.png) / [After](evidence/after-credit-1440.png) |
| U10 Templates | [Before](evidence/before-templates-390.png) / [After](evidence/after-templates-390.png) | [Before†](evidence/before-templates-768.png) / [After](evidence/after-templates-768.png) | [Before†](evidence/before-templates-1024.png) / [After](evidence/after-templates-1024.png) | [Before†](evidence/before-templates-1440.png) / [After](evidence/after-templates-1440.png) |
| U11 Taxes | [Before](evidence/before-taxes-390.png) / [After](evidence/after-taxes-390.png) | [Before](evidence/before-taxes-768.png) / [After](evidence/after-taxes-768.png) | [Before†](evidence/before-taxes-1024.png) / [After](evidence/after-taxes-1024.png) | [Before](evidence/before-taxes-1440.png) / [After](evidence/after-taxes-1440.png) |
| U12 Charges | [Before](evidence/before-charges-390.png) / [After](evidence/after-charges-390.png) | [Before†](evidence/before-charges-768.png) / [After](evidence/after-charges-768.png) | [Before†](evidence/before-charges-1024.png) / [After](evidence/after-charges-1024.png) | [Before†](evidence/before-charges-1440.png) / [After](evidence/after-charges-1440.png) |
| U13 Users | [Before](evidence/before-users-390.png) / [After](evidence/after-users-390.png) | [Before](evidence/before-users-768.png) / [After](evidence/after-users-768.png) | [Before†](evidence/before-users-1024.png) / [After](evidence/after-users-1024.png) | [Before](evidence/before-users-1440.png) / [After](evidence/after-users-1440.png) |
| U11 Deliveries | [Before](evidence/before-deliveries-390.png) / [After](evidence/after-deliveries-390.png) | [Before†](evidence/before-deliveries-768.png) / [After](evidence/after-deliveries-768.png) | [Before†](evidence/before-deliveries-1024.png) / [After](evidence/after-deliveries-1024.png) | [Before†](evidence/before-deliveries-1440.png) / [After](evidence/after-deliveries-1440.png) |

Additional evidence: [exact list position](evidence/after-quotation-list-position-stable-390.png), [detail at top](evidence/after-quotation-detail-position-stable-390.png), [restored Back position](evidence/after-quotation-back-position-stable-390.png), [ordinary preview before](evidence/after-quotation-preview-before-390.png) / [after](evidence/after-quotation-preview-after-390.png), [communication timezone](evidence/after-quotation-communication-390.png), [customer page two](evidence/after-customers-page-two-1440.png), [customer cards](evidence/after-customers-card-layout-390.png), [user keyboard disclosure](evidence/after-users-keyboard-1440.png), [user mobile actions](evidence/after-users-actions-mobile-390.png), [template mobile menu](evidence/after-template-menu-mobile-390.png).

[Mobile layout overview](evidence/after-overview-layout-390.png) · [Desktop layout overview](evidence/after-overview-layout-1440.png) · [Desktop date/charge overview](evidence/after-overview-dates-1440.png).

## Preservation, pending work and unexecuted checks

[Source integrity](source-integrity.json) confirms exactly the intended 12 source files changed from the pre-Phase-2 snapshot (275 files before, 276 after due to the new charge presentation helper). Other existing user edits and Phase 1 source files remain unchanged. [Phase-only patch](phase-only.patch) separates this work from earlier dirty Git changes. The browser was returned to Products and its original viewport.

- **Pending defect:** U12 authoritative currency identity, blocked by the missing backend contract. Numeric precision and honest missing-context presentation are complete.
- **Frontend blockers:** none for the implemented changes. No remaining U07/U08/U09/U10/U11/U13 defect was observed in the requested viewports and available real records.
- **Not executed:** live saves, financial writes, cancellations/approvals, webhook replay, notifications, role/access changes, backend contract changes, complete project regression suite, other browser engines, full screen-reader testing, browser print/PDF output, all filter/menu permutations or fabricated long-text datasets. Existing print rules are protected by scoped/AST tests, not a new print-browser PASS.
- The earlier interrupted commands were resumed as reviewed, small commands. No completed baseline audit was restarted. Phase 3 and performance refactoring remain unstarted.
