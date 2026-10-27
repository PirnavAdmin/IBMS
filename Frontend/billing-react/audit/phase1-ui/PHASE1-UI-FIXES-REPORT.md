# IBMS Phase 1 UI defect fixes: U01–U06

Date: 27 October 2026. Project: `Frontend/billing-react`.

Implemented only the six requested responsive defects. Browser checks used the existing authenticated Acme Admin session and real backend records. No financial or country configuration saves, template changes, notification delivery, backend changes, API contract changes, or financial calculation changes were performed. Cappuccino/brown theme retained. Existing user edits preserved: hashes of 275 source files were compared with the start of this phase; exactly the seven intended source files changed. See [integrity](integrity.json), [phase-only diff](phase-only.patch), and [before/after hashes](changes.json).

## Result matrix

PASS here means the targeted layout was visually reviewed in browser screenshots and supported by computed DOM measurements at the specified viewport. It does not mean the entire application or every automated suite passes.

| ID | Root cause | Files changed under src/pages | 390 × 844 | 768 × 900 | 1024 × 900 | 1440 × 900 | Result |
|---|---|---|---|---|---|---|---|
| U01 | Two-class detail grid selector overrode weaker responsive grid rules; financial text used ellipsis | Invoices/styles/invoices.css | PASS: 1 column | PASS: 2 columns | PASS: 4 columns | PASS: 4 columns | Fixed; all four cards and full amounts readable |
| U02 | Credit summary grid had no effective mobile column reduction | CreditNotes/styles/credit-notes.css | PASS: 1 column | PASS: 4 columns, values fit | PASS | PASS | Fixed; scoped 2-column intermediate breakpoint and 1-column mobile layout |
| U03 | Single-line filter flex layout shrank search/status/type fields | CreditNotes/styles/credit-notes.css | PASS: stacked, 308px fields | PASS: wrapped | PASS | PASS | Fixed; search and filter handlers unchanged |
| U04 | Fixed-layout percentage columns compressed below their content widths | InvoiceTemplates/InvoiceTemplates.jsx; InvoiceTemplates/invoice-templates.css | PASS: contained scroll | PASS: contained scroll | PASS: contained scroll | PASS | Fixed; 1080px minimum table, aligned cells, reachable action menu |
| U05 | Grid intrinsic minimum and fixed country columns expanded the page | Settings/CountryConfiguration.jsx; Settings/settings.css | PASS: page fits, list scrolls | PASS | PASS | PASS | Fixed; quick card/actions fit, data columns scroll locally |
| U06 | Header action group and equal flex children could not wrap sufficiently | Notifications/notifications.css | PASS: all four stacked | PASS: wrapped | PASS | PASS | Fixed; actions remain keyboard reachable |

## Browser evidence and measurements

[Raw before/after DOM measurements](browser-measurements.json) include routes, viewport sizes, element widths, clientWidth, scrollWidth, grid tracks and alignment. [Computed verification](browser-verification.json): **24 defect/viewport cases PASS, 0 FAIL; 108 DOM assertions passed**. Assertions cover document/content overflow, grid tracks and amounts, usable filter widths, table minimum width and header/cell geometry, local country scrolling, quick-card sizing and action bounds. Screenshot review complements these checks; width checks alone are not a complete visual test.

At 390px, affected content measurements (clientWidth/scrollWidth in CSS px):

| Area | Before | After | Additional evidence |
|---|---|---|---|
| Invoice detail KPI grid | Four tracks about 63.4px | One track 301.6px | At 768px, two tracks 333.6px; at 1024/1440px four tracks preserved. All measured card/amount scroll widths fit |
| Credit note page | 375/456 | 375/375 | Four mobile summary tracks about 76.9px become one 349.6px track; search/status/type controls 308px each |
| Invoice template viewport | Compressed cells overlap | 318/1080 local viewport | Table stays 1080px; all seven first-row cells and headings fit their column widths; each header/cell x and width match |
| Country settings page | 375/614 | 375/375 | Country viewport 350/585; quick card about 351px, quick actions about 302px |
| Notification page | 375/571 | 375/375 | Four header actions about 351px each within their group |

After checks found **zero document-level and app-content horizontal overflow** on all five affected pages at all four widths. Intentional wide-table/list scrolling remains local. Scrollbar allocation explains 375px client width inside a 390px viewport. At 1440px, sidebar and desktop grid/table arrangements remain usable; no broad desktop redesign was introduced.

### Before/after screenshots

Each link opens an actual saved browser capture. Additional AX text snapshots accompany captures in `evidence/`.

| Screen | 390px before / after | 768px before / after | 1024px before / after | 1440px before / after |
|---|---|---|---|---|
| U01 Invoice details | [Before](evidence/before-invoice-390.png) / [After](evidence/after-invoice-390.png) | [Before](evidence/before-invoice-768.png) / [After](evidence/after-invoice-768.png) | [Before](evidence/before-invoice-1024.png) / [After](evidence/after-invoice-1024.png) | [Before](evidence/before-invoice-1440.png) / [After](evidence/after-invoice-1440.png) |
| U02/U03 Credit notes | [Before](evidence/before-credit-390.png) / [After](evidence/after-credit-390.png) | [Before](evidence/before-credit-768.png) / [After](evidence/after-credit-768.png) | [Before](evidence/before-credit-1024.png) / [After](evidence/after-credit-1024.png) | [Before](evidence/before-credit-1440.png) / [After](evidence/after-credit-1440.png) |
| U04 Invoice templates | [Before](evidence/before-templates-390.png) / [After](evidence/after-templates-390.png) | [Before](evidence/before-templates-768.png) / [After](evidence/after-templates-768.png) | [Before](evidence/before-templates-1024.png) / [After](evidence/after-templates-1024.png) | [Before](evidence/before-templates-1440.png) / [After](evidence/after-templates-1440.png) |
| U05 Country settings | [Before](evidence/before-countries-390.png) / [After](evidence/after-countries-390.png) | [Before](evidence/before-countries-768.png) / [After](evidence/after-countries-768.png) | [Before](evidence/before-countries-1024.png) / [After](evidence/after-countries-1024.png) | [Before](evidence/before-countries-1440.png) / [After](evidence/after-countries-1440.png) |
| U06 Notifications | [Before](evidence/before-notifications-390.png) / [After](evidence/after-notifications-390.png) | [Before](evidence/before-notifications-768.png) / [After](evidence/after-notifications-768.png) | [Before](evidence/before-notifications-1024.png) / [After](evidence/after-notifications-1024.png) | [Before](evidence/before-notifications-1440.png) / [After](evidence/after-notifications-1440.png) |

[Mobile overview](evidence/after-overview-390.png) · [Tablet overview](evidence/after-overview-768.png) · [Laptop overview](evidence/after-overview-1024.png) · [Desktop overview](evidence/after-overview-1440.png).

### Read-only interaction checks

- U01: reviewed top and lower KPI cards; full real amounts ₹89,578.00, ₹30,000.00 and ₹59,578.00 remain readable. [Lower cards](evidence/after-invoice-kpis-390.png).
- U03: exercised credit search and status/type filter UI, then restored controls. [Filtered state](evidence/after-credit-filtered-390.png), [restored filters](evidence/after-credit-filters-restored-390.png).
- U04: focused scroll region and used ArrowRight; keyboard Enter on “Actions for Pirnav Standard Invoice” brought the action column into view and opened View/Deactivate menu. Closed with Escape; no modifying action invoked. [Keyboard/menu evidence](evidence/after-template-actions-keyboard-390.png).
- U05: searched Afghanistan and cleared the search; focused country list and used ArrowRight (observed scrollLeft 40). Reviewed quick card and both actions. Tab moved focus from Save Configuration to Back without saving. [Country search](evidence/after-country-search-390.png), [keyboard scrolling](evidence/after-country-scroll-keyboard-390.png), [quick-card actions](evidence/after-country-actions-390.png).
- U06: keyboard Enter reached Create Template and Communication History screens; Back reached Settings. Restore Missing Defaults opened its confirmation and was cancelled. No restore/create/delivery write was submitted. [Create screen](evidence/after-notification-create-keyboard-390.png), [history](evidence/after-notification-history-keyboard-390.png), [cancelled restore confirmation](evidence/after-notification-restore-confirmation-390.png).

Routes inspected: `/invoices/5` (INV-2026-10-000004), `/credit-notes`, `/templates-branding`, `/settings/countries`, `/settings/notifications`; read-only action destinations also inspected. Browser restored to Dashboard and original viewport after verification.

## Exact CSS selectors modified

All new rules are scoped to existing modules. No new `!important` and no global `overflow-x: hidden` were added. Existing clipping rules outside this scope were not removed.

### U01 — Invoices/styles/invoices.css

- `.invoice-summary-grid.invoice-detail-kpis` added to existing responsive selector groups at max-width 900px and 680px, matching the specificity of the desktop four-column rule.
- `.invoice-detail-kpis .invoice-summary-card :is(span, strong, small)` at max-width 900px: normal wrapping, visible overflow, no ellipsis, zero minimum width, emergency long-value wrapping.

### U02/U03 — CreditNotes/styles/credit-notes.css

At screen max-width 900px:
- `.cn-list-page .cn-filter-bar`
- `.cn-list-page .cn-filter-bar .cn-search`
- `.cn-list-page .cn-filter-bar .cn-status-filter`
- `.cn-list-page .cn-filter-bar > .date-range-filter`

At screen max-width 760px:
- `.cn-list-page .cn-summary-grid`
- `.cn-list-page .cn-summary-card`
- `.cn-list-page .cn-summary-card :is(strong, small, .cn-summary-label)`

At screen max-width 480px:
- `.cn-list-page .cn-summary-grid`

The register scope excludes credit document/print layouts. Between 481–760px, two minmax(0,1fr) columns are used; at 390px one is used. At 768px the four existing columns remain and real displayed values fit.

### U04 — InvoiceTemplates/invoice-templates.css

- `.template-list-card[aria-labelledby="template-list-heading"]`
- `.template-list-card[aria-labelledby="template-list-heading"] .template-table-wrap`
- `.template-list-card[aria-labelledby="template-list-heading"] .template-table-wrap:focus-visible`
- `.template-list-card[aria-labelledby="template-list-heading"] .template-table`
- `.template-list-card[aria-labelledby="template-list-heading"] .template-name-cell`
- `.template-list-card[aria-labelledby="template-list-heading"] .template-name-link`
- `.app-layout .template-list-card[aria-labelledby="template-list-heading"] .template-table thead th.template-actions-heading`

Only the main template register is affected. Its existing percentage column proportions remain; the table now has a 1080px minimum inside a bounded scroller. Name/default badge can wrap and header action alignment matches the centered cells. JSX adds a labelled `role="region"`, `tabIndex={0}` to the existing scroll viewport.

### U05 — Settings/settings.css

- `.country-config-page .country-config-layout`
- `.country-config-page .country-list-section`
- `.country-config-page .country-list-card`
- `.country-config-page .country-quick-card`
- `.country-config-page .country-list-scroll`
- `.country-config-page .country-list-scroll:focus-visible`
- `.country-config-page .country-items-header`
- `.country-config-page .country-items-list`
- `.country-config-page .country-search-field` (screen max-width 600px)
- `.country-config-page .country-list-actions` (screen max-width 600px)
- `.country-config-page .quick-card-actions .MuiButton-root` (screen max-width 600px)

The layout uses minmax(0,1fr) below 960px, with min-width:0 on grid containers/cards. The existing country row/header column geometry stays readable in a shared 585px minimum local scroll surface. Search/actions wrap on mobile. JSX adds only a labelled keyboard-focusable wrapper around the existing country header/list; GET/PUT logic is unchanged.

### U06 — Notifications/notifications.css

- `.notification-heading > .notification-actions` (max-width 900px)
- `.notification-heading > .notification-actions > a` (max-width 600px)
- `.notification-heading > .notification-actions > button` (max-width 600px)

The action group wraps with min-width:0; direct links/buttons take full-width flex bases on mobile. Existing desktop actions and handlers remain.

## Automated verification

| Check | PASS | FAIL | Result/details |
|---|---:|---:|---|
| Country scoped UI tests | 2 | 0 | `node tests/run-workspace-ui.mjs --test-name-pattern="Country confirmation|Country save failure"` |
| Invoice scoped UI test | 1 | 0 | `node tests/run-invoice-ui.mjs --test-name-pattern="Details tabs query"` |
| Notification UI runner | 28 | 2 | Invoked with pattern `Template list renders API values|History renders all statuses`; runner ignores forwarded args and ran all 30 tests once. No repeat full-suite run |
| Existing CSS cascade tests | 1 | 3 | `node --test tests/css-cascade.test.mjs`; same three files failed before phase and after |
| Production build | — | — | PASS: `npm run build`, Vite 5.4.21; 15,350 modules; completed in 1m49s |
| Whitespace check | — | — | PASS: `git diff --check` |

UI test totals: **31 PASS / 2 FAIL (33 tests)**. CSS totals: **1 PASS / 3 FAIL (4 tests)**. Combined automated test total: **32 PASS / 5 FAIL (37 tests)**. Browser cases and DOM assertions are reported separately above, not added to automated suite totals. Existing isolated test fixtures were used by existing runners; no mock records were inserted into the live backend and no new dummy data was introduced.

Notification failures:
1. History statuses/pagination test could not find its click target: assertion queries legacy `.ant-pagination-item-2`, while the current history uses shared MUI pagination. The history component/test assertion is outside these seven changes.
2. Audit/notification connection-wording test expects `connectionErrorMessage`, while the existing module error presentation supplies its friendly module message. Error handling components and tests were not changed in this phase.

These notification failures were observed after the fix; no pre-phase execution of that suite was captured, so they are not labelled baseline PASS/FAIL. Their failing paths are unchanged by this phase. No test assertions were weakened.

CSS cascade baseline and after: customer-list PASS; quotations, credit-notes, WorkspaceUI FAIL on whole-file canonical hashes. Quotations and WorkspaceUI hashes were unchanged during this phase. Credit-notes already failed before this work and its hash changed again with the requested responsive fix. Expected hashes were not updated to conceal failures. This suite remains red and needs a separate approved baseline review.

Build emitted existing-style warnings for html2pdf static/dynamic imports and a chunk above 500kB. No performance refactor was performed; successful build is not a performance PASS.

## Remaining defects, limits and backend blockers

- No remaining U01–U06 defect observed at the requested widths with available real records. Arbitrarily large unseen values/longer translations were not fabricated for testing; wrapping safeguards remain in place.
- P2 items from the original audit, including small notification touch targets and nested Link/Button semantics, were not changed. Other modules/performance work were not started.
- Production data mutations, country Save/PUT, invoice/payment/credit writes, template deactivation, restore-default submission and notification sending were intentionally not executed. Read-only reachability and existing isolated UI tests were used instead.
- Browser checks used the existing session in Chromium-based IAB; other browser engines, print/PDF, and every intermediate viewport were not tested.
- Automated suite failures above remain unresolved and must not be read as a clean regression-suite PASS.
- **Backend blockers: none encountered for the requested UI checks.** No backend or API changes were needed.
