# IBMS — UI/UX Visual and Performance Audit

**Date:** 27 October 2026 (Asia/Calcutta)  
**Project:** `C:/Users/Admin/source/repos/IBMS/Frontend/billing-react`  
**Live target:** `http://localhost:3000/dashboard`  
**Session:** Existing Acme Admin / TenantAdmin session, Acme Business India.  
**Mode:** AUDIT ONLY. No application-source fixes, backend edits, financial writes, configuration saves, account changes, test records, or dummy data were introduced. No build or full test suite was run during this audit. Existing uncommitted work from earlier tasks was retained.

## Result and evidence standard

The largest confirmed problems are mobile layouts that conceal balances, filters, table content, or header actions. There are **18 UI findings: 6 P1, 10 P2, and 2 P3**, plus **2 source-confirmed frontend performance risks** rated P2. No P0 was observed in the executed checks; this is not an assertion that untested flows contain no P0 issues.

The authenticated frontend was inspected in the actual in-app browser at **1440×900, 1024×900, 768×900, and 390×844 CSS pixels**. The 21 main screens listed below have screenshots at all four widths. Additional forms, detail views, tabs, menus, and dialogs were sampled, mainly at desktop and mobile widths. This is a bounded audit, not a certification of every state or record.

Evidence types used throughout:

- **BROWSER:** Actual screenshots, accessibility/DOM snapshots, and computed layout measurements.
- **SOURCE:** Read-only component/CSS inspection. A code risk is not a measured runtime failure.
- **OBSERVED TIME:** Controller-clock time around a browser interaction and its next accessibility snapshot. Includes automation overhead and can end before all data settles. It is neither API latency nor isolated React render time.
- **NOT EXECUTED / UNMEASURED:** Explicitly withheld conclusions. No blanket visual, responsive, accessibility, or performance PASS is issued.

Evidence is local to this report and includes **170 PNG captures** of screens and interaction states. It includes real business information from the authorized session. [Browser measurements](browser-evidence.json), [screenshot dimensions](screenshot-manifest.json), [interaction timings](interaction-timing.json), [CSS scan](css-source-evidence.json), and [source integrity](source-integrity.json) support the findings. Screenshots are viewport captures; a full-page capture does not necessarily expand an independently scrolling application container. Some overview captures show loading/transition states; these are not treated as settled-state PASS evidence.

## A. Modules actually inspected

### Main screens: four requested widths

| Module | Exact route | Component / source | Executed coverage |
|---|---|---|---|
| Dashboard | `/dashboard` | `src/pages/Dashboard/Dashboard.jsx` | Header, sidebar, filters, KPI cards, charts; recent payment/invoice tables also inspected after scrolling at 1440px. |
| Invoices | `/invoices` | `src/pages/Invoices/InvoiceList.jsx` | Real five-row register, summary, filters, search, sort, pagination footer, horizontal table viewport. |
| Quotations | `/quotations` | `src/pages/Quotations/pages/QuotationList.jsx` | Recent overview at four widths; full seven-column register, filter panel and detail view additionally sampled. Twelve real quotations, five per page. |
| Payments | `/payments` | `src/pages/Payments/Payments.jsx` | Six real payments, filter bar, status badges, action menu and pagination. |
| Customers | `/customers` | `src/pages/Customers/pages/CustomerListPage.jsx` | Seven real customers, summaries, contact/tax fields, filters and table. |
| Products & Services | `/products` | `src/pages/Products/ProductList.jsx`, `components/ProductTable.jsx` | Five real products, summary cards, prices, tax/discount labels, scroll viewport and pagination. |
| Credit Notes | `/credit-notes` | `src/pages/CreditNotes/pages/CreditNoteList.jsx` | Three refunded records, summary cards, filters, sorting controls and action menu. |
| Background Jobs | `/background-jobs` | `src/pages/BackgroundJobs/BackgroundJobStatus.jsx` | Actual job cards, run information and refresh control. Displayed job-duration values were **not** used as frontend-performance measurements. |
| Export Jobs | `/export-jobs` | `src/pages/BackgroundJobs/ExportJobStatus.jsx` | Four historical jobs, filters, table and pagination. Queue export and downloads were not invoked. |
| Invoice Templates | `/templates-branding` | `src/pages/InvoiceTemplates/InvoiceTemplates.jsx` | Two real templates, search/select controls, table, default marker and footer. |
| Audit Activity | `/audit-activity` | `src/pages/AuditActivity/AuditActivity.jsx` | 133-record total; first and second 20-record pages, filter layout and event-detail dialog. |
| Integrations | `/integrations` | `src/pages/Integrations/Integrations.jsx` | Two actual integrations, table, truncation, registration dialog and footer. No app registered or credential revealed/generated. |
| Webhooks | `/webhooks` | `src/pages/Webhooks/Webhooks.jsx` | Two actual webhooks, summaries, table, action menu and creation dialog. No ping, retry, rotation, deletion or save. |
| User & Role Administration | `/user-role-administration` | `src/pages/UserRoleAdministration/UserRoleAdministration.jsx` | Three actual users, filters and table. Assignments tab and create-user form also viewed without saving. |
| Settings | `/settings` | `src/pages/Settings/SettingsLanding.jsx` | Six configuration cards, spacing and responsive column layout. |
| Taxes | `/settings/taxes` | `src/pages/Taxes/Taxes.jsx` | Seven real tax rows, search/select controls and new-tax form. No calculator input or rule changed. |
| Discounts | `/settings/discounts` | `src/pages/Settings/DiscountConfiguration.jsx`, `DiscountRules.jsx` | Existing settings, disabled save/reset states, role-rule tables. No toggle or value changed. |
| Charges | `/settings/charges` | `src/pages/Settings/ChargesConfiguration.jsx` | Four real charges, value formatting, table and new-charge dialog. |
| Numbering | `/settings/numbering` | `src/pages/NumberingSettings/pages/NumberingSettings.jsx` | Document-type cards, existing inputs, server preview/loading state and sticky action footer. No sequence or format saved. |
| Notification Management | `/settings/notifications` | `src/pages/Notifications/NotificationTemplates.jsx` | Existing templates, subject snippets, statuses, table scroll, filters and measured header controls. |
| Countries | `/settings/countries` | `src/pages/Settings/CountryConfiguration.jsx` | Real loaded selection state, country list, calling codes/currencies and quick card. No country selected or saved. |

For these rows, screenshot names follow `evidence/<module-label>-<width>.png`; the complete mapping is in [the browser evidence](browser-evidence.json). Dashboard desktop evidence includes [its top](evidence/dashboard-1440-top.png) and [its tables](evidence/dashboard-tables-1440.png).

### Additional screens and states actually opened

| Area | Route / state | Scope and evidence |
|---|---|---|
| Invoice form | `/invoices/new` | Initial unsaved form at 1440/390; real customer dropdown opened at 390. [Mobile dropdown](evidence/invoice-customer-dropdown-390.png). No customer selected or draft submitted. |
| Invoice detail | `/invoices/5` | Overview, Items, Payments, Credit Notes, Communication and Audit; mobile overview/items; desktop/mobile actions menu. [Mobile summary](evidence/invoice-summary-mobile-390.png). |
| Payment | `/payments/new`, `/payments/6` | Initial form, existing payment summary/allocation table, menu. No reversal or payment submitted. |
| Customer | `/customers/create`, `/customers/8`, `/customers/6?tab=addresses`, `?tab=invoices`, `?tab=payments`, `?tab=statement`, `?tab=audit` | Initial customer wizard and existing profiles; Devandar G account tables inspected on desktop, Haridas overview at desktop/mobile. Later wizard steps not traversed. |
| Products/categories | `/products/new`, `/products/5`, `/products/categories`, `/products/categories/new` | Initial form, actual product details, four real categories, unsaved category form. Category table captured at 390 only. |
| Credit note | `/credit-notes/new`, `/credit-notes/3` | Initial source-invoice step, calculation card, real refunded detail. No workflow advancement or refund. |
| Quotations | `/quotations`, local create/detail/items/communication states | Unsaved create form, converted `QT-2026-10-0001` detail, Items/Communication, full register and expanded filter panel. The route does not change for these local states. |
| Templates | `/templates-branding/new`, `/templates-branding/preview`, `/templates-branding/versions`, `/templates-branding/audit` | Unsaved editor and preview/version entry states; actual audit table. No PDF generated, template activated or branding saved. No selected-version table was exercised. |
| Notifications | `/settings/notifications/new`, `/settings/notifications/history` | Initial template editor and real delivery history; no template save, seed, delete or retry. |
| Administration | `/user-role-administration?tab=assignments`, `/user-role-administration/users/new` | Assignment table and initial unsaved user form at desktop/mobile. No permission or account changes. |
| Operational dialogs | `/integrations`, `/webhooks`, `/settings/charges`, `/audit-activity` | Register app, create webhook, add charge and audit-detail dialogs. Webhook dialog scrolled to its footer. |
| Webhook history | `/webhooks/deliveries?webhookId=10`, `/webhooks/deliveries?webhookId=10&status=DeadLetter` | Actual delivery/dead-letter tables; ten deliveries on a page, 14 for selected webhook, and four dead-letter rows. No retries. |
| Tax form | `/settings/taxes/new` | Initial unsaved form at desktop/mobile. |
| Help | `/support` | Actual placeholder screen at 1440. [Evidence](evidence/support-1440.png). |

### Guardrails and integrity

All records displayed were returned by the existing application. Search used an existing invoice suffix, `000004`. Opening unsaved forms may initialize the application's normal session-draft state; no business record was saved. Financial buttons, PDF generation/regeneration, communication sends/retries, secrets, and configuration writes were not executed. Temporary viewport overrides were reset and the original dashboard restored. SHA-256 comparison of **275 source files before/after found zero changed files**. No backend file was edited.

## Defect register

All UI findings below are **FRONTEND presentation or interaction findings**. They do not establish backend data defects. P01/P02 are explicitly source-confirmed performance risks with unmeasured user impact.

| ID | Module | Route | Component/File and exact selector | Defect | Severity | Frontend/Backend | Screenshot/Evidence | Suggested Fix |
|---|---|---|---|---|---|---|---|---|
| U01 | Invoice detail | `/invoices/5` | `InvoiceDetails.jsx`; `src/pages/Invoices/styles/invoices.css:255`, `:2560`, `:2597`; `.invoice-summary-grid.invoice-detail-kpis`, `.invoice-summary-card` | At 390px, four summary tracks remain ~63.4px each in a 302px grid. Cards have ~62px inner width; labels and monetary balances collapse to ellipses. The two-class desktop selector outranks the one-class mobile selectors. | P1 | FRONTEND | [Screenshot](evidence/invoice-summary-mobile-390.png), [computed dimensions](invoice-summary-metrics.json) | Match responsive specificity and use a readable one/two-column layout. Keep complete amounts visible. |
| U02 | Credit Notes | `/credit-notes` | `CreditNoteList.jsx`; `styles/credit-notes.css:36`; `.cn-summary-grid`, `.cn-summary-card`, `.cn-summary-value` | Four summary cards stay in one row at 390px. About 75px card widths cannot contain labels and amount text; text escapes cards and the summary spills beyond its container. | P1 | FRONTEND | [Screenshot](evidence/credit-notes-390.png); browser evidence: 350px summary area, 443px scroll width | Add scoped small-screen grid breakpoints; bound card text and maintain full monetary values. |
| U03 | Credit Notes filters | `/credit-notes` | `styles/credit-notes.css:61–68`; `.cn-filter-bar`, `.cn-search`, `.cn-status-filter` | Non-wrapping flex layout shrinks status/type controls to ~38px. Label viewport is ~14px. Search and filters are effectively unreadable on mobile. Dropdown itself opens, but the collapsed controls do not communicate their purpose/value. | P1 | FRONTEND | [Filter dropdown](evidence/credit-status-dropdown-390.png), [register](evidence/credit-notes-390.png) | Wrap/stack the filter controls and give each a usable minimum width. |
| U04 | Invoice template table | `/templates-branding` | `InvoiceTemplates.jsx`; `invoice-templates.css:19–31`; `.template-list-card[aria-labelledby="template-list-heading"] .template-table`, its `th/td:nth-child(...)` rules | Fixed percentage table layout compresses all seven columns into ~318px at 390px. Nowrap headers/date cells overlap adjacent content; headers concatenate and row values collide. A small overflow strip does not preserve sensible column widths. Crowding also appears at 768px. | P1 | FRONTEND | [390px](evidence/templates-390.png), [768px](evidence/templates-768.png); browser cell scroll-width measurements | Keep useful column minimums/table minimum width and scroll the table viewport; prevent cell content painting across columns. |
| U05 | Country Configuration | `/settings/countries` | `CountryConfiguration.jsx`; `settings.css:425–501`; `.country-config-layout`, `.country-items-header`, `.country-item-row`, `.country-list-card` | A 375px application content viewport grows to a 614px scroll width. Fixed country grid tracks and intrinsic sizing expand the main page; the quick card and its action labels are clipped at the right. This is whole-content overflow, not just a data-table scroll. | P1 | FRONTEND | [Top](evidence/countries-390.png), [clipped quick card/buttons](evidence/country-list-overflow-390.png); browser evidence | Set grid children to `min-width:0`; contain country-column scrolling within the list and make the quick card/actions fit the mobile width. |
| U06 | Notification header actions | `/settings/notifications` | `NotificationTemplates.jsx`; `notifications.css:10–15`; `.notification-heading`, `.notification-actions`, `.notification-actions > a` | At 390px the header action group is 351px wide with 559px of content. It forces application-content scrolling to ~571px; later actions, including Create Template, lie outside the initial mobile view. | P1 | FRONTEND | [Screenshot](evidence/notifications-390.png), browser evidence `notification-actions`/`app-layout-content` overflow | Wrap or vertically stack actions within the page width; avoid nonshrinking links in a nowrap action row. |
| U07 | Payment summary | `/payments/6` | `PaymentDetails.jsx:247`; `styles/Payments.css:90–119`; `WorkspaceResponsive.css:29–36`; `.payment-summary-totals`, `.payment-summary-totals dd` | At settled 390px width, summary stays two columns (~126px each). `₹20,000.00` renders across two lines with the last decimal digit alone; amount block is 72px high. | P2 | FRONTEND | [Screenshot](evidence/payment-summary-mobile-390.png), [computed dimensions](payment-summary-metrics.json) | Resolve media/container-query interaction and stack when full amounts cannot fit. Avoid breaking inside a monetary string. |
| U08 | Quotation navigation | `/quotations`, local list → detail | `QuotationManagement.jsx`, `pages/QuotationDetails.jsx`; `.app-layout-content`, `.quotation-page` | Opening a quotation can retain the list's internal scroll position. Confirmed detail capture has content `scrollTop≈176.8px` and its main heading at `top≈-7.5px`, above the content viewport/header. User lands partway down the record. | P2 | FRONTEND | [Desktop](evidence/quotation-detail-1440.png), [mobile](evidence/quotation-detail-390.png); observed computed geometry | Reset the application scroll container on intentional screen/record transitions; preserve list position separately for Back. |
| U09 | Table alignment conventions | `/customers`, `/products`, `/payments`, `/invoices`, `/credit-notes` | Customer `styles/customer-list.css:584–589` `.customers-page .customer-panel .customer-table .MuiTable-root .MuiTableCell-root.MuiTableCell-head/.MuiTableCell-body`; `ProductTable.jsx:30–46`; `Payments.css:40` | Customer cells/headers are centered, while most other module values are left-aligned, including financial columns. Header/cell alignment generally matches within each table, but cross-module numeric scanning is inconsistent. | P2 | FRONTEND | [Customers](evidence/customers-1440.png), [Payments](evidence/payments-1440.png), computed alignment in browser evidence | Agree on typed columns: text left, financial/numeric columns right with tabular figures, consistent action/status alignment. This is a presentation recommendation, not an arithmetic failure. |
| U10 | Template Actions alignment | `/templates-branding` | `invoice-templates.css:30–32`; `styles/WorkspaceUI.css:69`; `.template-actions-heading`, `.template-actions-cell`, `.app-layout .ibms-table-frame th:not([align="right"]):not(.MuiTableCell-alignRight):not(.numeric)` | Computed Actions header is left-aligned; body action cell is centered. Broad shared header selector overrides the table-specific header alignment. | P2 | FRONTEND | [Desktop table](evidence/templates-1440.png), header/body computed styles in browser evidence | Give Actions an explicit shared semantic class/alignment, keeping header and body consistent. |
| U11 | Date display consistency | `/quotations`, `/settings/taxes`, `/invoices`, `/webhooks/deliveries` | `QuotationList.jsx:82`, `QuotationDetails.jsx`; `Taxes.jsx`; `.quote-list-table`, `.tax-table`, `.invoice-list-table`, `.delivery-time` | Tables mix raw `YYYY-MM-DD` in quotations/taxes with `DD/MM/YYYY` in invoices/payments and named-month dates elsewhere. Audit/notification screens use IST; delivery history explicitly uses UTC. Labels reduce timezone ambiguity, but the workspace has no consistent display convention. | P2 | FRONTEND | [Quotation table](evidence/quotation-full-list-1440.png), [Taxes](evidence/taxes-1440.png), [Invoices](evidence/invoices-1440.png), delivery snapshot | Use common display helpers and an explicit timezone policy. Preserve ISO transport dates and distinguish date-only from timestamp values. No incorrect timezone conversion was proved. |
| U12 | Charge currency precision | `/settings/charges` | `ChargesConfiguration.jsx:27` `displayValue`; `.settings-table` value column | Fixed amounts show `₹100`, `₹20,000`, etc., while other billing tables display two fractional digits. Local display helper also hardcodes the rupee symbol. Current session is INR, so a wrong-currency result was not reproduced. | P2 | FRONTEND | [Charges](evidence/charges-1440.png), source helper | Reuse the established currency formatter with consistent fraction digits and confirmed currency context. |
| U13 | User table long text | `/user-role-administration` | `user-role-administration.css:71`, `:76–84`; `.ura-table td`, `.ura-user-table td:nth-child(2)` | Username email addresses wrap at arbitrary character boundaries (for example `.c` / `om`) even on desktop. Narrow fixed percentage allocation and `overflow-wrap:anywhere` create avoidable ragged rows; action columns require horizontal scrolling. | P2 | FRONTEND | [1440px](evidence/roles-1440.png), [390px](evidence/roles-390.png) | Allocate a usable username width or truncate with a keyboard-accessible full-value disclosure. Retain intentional table scrolling. |
| U14 | Notification control scale | `/settings/notifications` | `notifications.css:7`; `.notification-page .notification-actions .ant-btn` | Measured header buttons are 30px high with 11.5px text, visibly smaller than the common ~40px actions elsewhere. The rule uses `!important` for height, padding and size, preventing shared scale from applying. | P2 | FRONTEND | [Measured controls](control-metrics.json), [screenshot](evidence/notifications-controls-1440.png) | Apply the existing workspace button scale consistently. A complete target-size accessibility assessment was not executed. |
| U15 | Notification navigation semantics | `/settings/notifications`, `/settings/notifications/history` | `NotificationTemplates.jsx`, `NotificationShared.jsx`, `NotificationHistory.jsx`; `.notification-actions > a > button`, `.notification-breadcrumb a > button` | Navigation uses a button inside a link. Browser accessibility output exposes both link and nested button for the same action. This mixes interactive semantics and makes keyboard/screen-reader behavior harder to predict. | P2 | FRONTEND | Saved `notifications-1440.txt` and `notification-history-1440.txt`; rendered DOM and source | Render one interactive element per navigation action, styled with existing button classes. |
| U16 | Template pagination consistency | `/templates-branding` | `InvoiceTemplates.jsx`; `.template-actions`, `.template-list-footnote` | Custom Previous / Page 1 of 1 / Next footer and detached template count differ from the shared Rows per page + range footer used elsewhere. | P3 | FRONTEND | [Screenshot](evidence/templates-1440.png) | Reuse the existing pagination pattern if the template API/list contract supports it. |
| U17 | Help & Support | `/support` | `src/pages/ModulePlaceholder/ModulePlaceholder.jsx`; `.module-placeholder` | A visible support navigation item opens implementation placeholder copy rather than usable help or contact options. | P2 | FRONTEND | [Screenshot](evidence/support-1440.png) | Replace placeholder copy with approved help/contact content or communicate availability clearly. |
| U18 | Job labels | `/background-jobs` | `BackgroundJobStatus.jsx`; `.background-job-card h2` | Cards expose technical names such as `EmailNotificationJob` and `OperationalCleanupJob`. These are less scannable than ordinary user-facing names. | P3 | FRONTEND | [Screenshot](evidence/background-jobs-1440.png) | Map backend identifiers to readable display labels; retain identifiers in technical details where needed. |
| P01 | Initial application payload | All routes | `src/routes/AppRoutes.jsx` eager imports; `src/pages/CreditNotes/pages/CreditNoteExportPage.jsx` static `html2pdf` import | All route modules are eagerly imported. Existing production artifact's main JS is 3,599,860 bytes, CSS 604,723 bytes, and login image 710,310 bytes. Confirmed code/payload risk; no cold-load or main-thread impact was measured in this run. | P2 | FRONTEND — source risk | AppRoutes source; existing `dist/assets/index-u3O1w5yo.js`, `index-9Sh14Cf0.css`, image; artifact timestamps recorded below | Consider route-level lazy imports and on-demand export/PDF dependencies, then measure a production preview before asserting improvement. |
| P02 | Quotation initial data load | `/quotations` | `QuotationManagement.jsx:79–100`, `:167`; `fetchAllPages(...)`, `quotes.map(enrich)` | Initial list loads all quotation, customer and product pages plus tenant profile and charges before completion; visible pagination is client-side. This scales with entire datasets, not five visible rows. Row enrichment repeatedly searches customers. Real sample has only 12 quotations, so scale cost remains unmeasured. | P2 | FRONTEND — source risk | Source; real 12-record list and 5-row page in screenshots | Load list pages independently from form catalogs; defer ancillary data until needed; index lookups and profile realistic authorized datasets. |

## B. UI alignment and interaction findings

The primary shell maintained its cappuccino/brown palette. Desktop sidebar labels/icons were readable in the sampled state; long module labels wrap. Below the shell's 1179px breakpoint, navigation is a drawer opened by its labelled menu button. The mobile header becomes two rows. No claim is made about every focus/hover state or reduced-motion behavior.

Highest-impact UI defects are U01–U07. Additional consistency/semantics issues are U08 and U13–U18. The header action size measurement is based on actual computed browser values, not a visual estimate. Category creation showed an initial input focus indicator; invoice customer selection and action menus were opened; Escape dismissed sampled menus. Full keyboard order, focus trapping, screen-reader announcements and contrast testing remain unexecuted.

Dialogs sampled at desktop/mobile: Register New App, Create Webhook, Add Charge, Audit Event Details. The charge footer remained visible; the long webhook form scrolled to Cancel/Create controls ([bottom evidence](evidence/webhook-dialog-bottom-390.png)). The invoice customer dropdown fit the mobile viewport in its sampled open state. These observations do not establish a PASS for all modal/dropdown permutations, long strings or validation errors.

## C. Table alignment audit

| Table group | Actual data/state observed | Alignment / overflow result |
|---|---|---|
| Invoice register | 5 saved invoices, 15 columns | Header/body padding measured 13×16px / 12×16px; left-aligned amount columns. At 390px, table scroll area ~300px with ~1864px content. Horizontal scrolling is expected; this is not by itself clipping failure. |
| Payment register | 6 records | Headers and cells left-aligned; readable two-decimal values; sampled right-side action menu opened within viewport. |
| Customer directory | 7 customers | Centered header/cell baseline, inner contact text left-aligned. Different from other lists (U09). Contact/email content can truncate. Tooltip coverage was not exhaustively exercised. |
| Product catalog | 5 products | Left-aligned price/header cells; product/category tooltip components present in source. Bounded scroll area and outer border observed. Not all tooltips were activated. |
| Category table | 4 categories at 390px | Long real descriptions and bounded horizontal scrolling observed; desktop/tablet category screenshots not captured. |
| Credit-note register | 3 records | Action header/cells right-aligned; other columns left. Long identifiers break over several lines at narrow widths. Table scrolling is separate from the defective overflowing KPI/filter regions. |
| Quotation overview/full register | 12 total, 5 per page | Both overview and sortable full table inspected. Full list shows raw ISO dates (U11); amount values left-aligned. Some earlier overview captures are transient empty/loading states, not evidence that data is missing. |
| Invoice items/payments/audit tabs | Existing invoice 5 | Actual saved item/payment/audit data and empty credits/communication states viewed. No changes to invoice or payments. |
| Customer account tabs | Existing customer 6 | Invoice/payment/statement/audit table shells and returned data/empty states inspected; not a full ledger correctness test. |
| Payment allocation | Existing payment 6 | Linked invoice allocation table inspected. The separate summary amount wraps badly (U07). |
| Templates | 2 templates | Header/body collision at 390px, crowding at 768px (U04); Actions header/body mismatch (U10). Border exists; border presence alone does not make content usable. |
| Taxes | 7 rules | Row labels use body `<th>` elements; raw ISO date cells. Recorded header inventory includes these row headers, so raw `th` counts are not column counts. |
| Charge / discount role-rule tables | 4 charges; returned role-rule rows | Scrollable wide tables. Charge formatting inconsistent (U12). No role-rule editing. |
| Notification templates/history | Existing templates and real delivery history | Bounded Ant table body scrolling; subject snippets/variable chips; row status/action controls. History pagination available; retry was not invoked. |
| Audit Activity | 20 of 133 per page | Next page visibly became records 21–40. Nested table vertical scrolling and main-page scrolling coexist. Event detail dialog inspected. |
| Integrations / webhooks | 2 rows each | URL/client-ID truncation, dates, badges, centered numeric counts in places, bounded horizontal scrolling. No secret display or writes. |
| Delivery / dead-letter history | Selected webhook: 14 deliveries, 4 dead letters | 10 delivery rows per page; date labels explicitly UTC. No retry/payload export action executed. |
| Users / assignments | 3 users | Username wrapping and large table minimum width observed (U13). Assignments table viewed without editing access. |
| Export jobs | 4 completed jobs | Progress, requested/started/completed dates, sizes and footer viewed. No job queued/downloaded. |
| Dashboard recent tables | 6 payments / 5 invoices | Outer borders and matched header/cell padding visible. Amounts are left-aligned, consistent with much of the workspace but unlike a conventional right-aligned financial column. |

No general claim of arithmetic, tax, exchange-rate or ledger correctness is made. The apparent difference between a quotation/product fractional total and a rounded invoice total was not classified as a UI defect without business-rule evidence.

## D. Responsive QA

| Width / height | Coverage | Finding / status |
|---|---|---|
| 1440×900 | 21 main screens; additional forms/tabs/dialogs | Actual browser screenshots captured. Readable desktop structure in sampled regions; U09–U18 still apply. Not a universal PASS. |
| 1024×900 | 21 main screens | Actual screenshots captured; drawer navigation works for sampled selections. Dense tables require local horizontal scrolling. Not all offscreen rows/dialogs were exercised. |
| 768×900 | 21 main screens | Actual screenshots captured. Template columns are crowded; mobile-specific risks become more pronounced below this width. Some quotation captures are transitional. |
| 390×844 | 21 main screens; many forms/details/dialogs | Confirmed U01–U07. Content-level overflow and monetary clipping exist despite zero document-level overflow in sampled DOM checks. Responsive quality is **not acceptable as a blanket PASS**. |

Representative evidence: [invoice summary](evidence/invoice-summary-mobile-390.png), [credit cards/filters](evidence/credit-notes-390.png), [template table](evidence/templates-390.png), [country quick card](evidence/country-list-overflow-390.png), [notification actions](evidence/notifications-390.png), [payment decimal wrap](evidence/payment-summary-mobile-390.png). Full PNG dimensions are recorded in the screenshot manifest. Contact sheets are navigation aids; original screenshots are the primary visual evidence.

## E. UI performance measurements and limits

### Observed navigation timings

One desktop navigation sample per listed module. Measured with controller `Date.now()` around the UI click and first returned accessibility snapshot. **Includes locator/automation/browser communication overhead; excludes the subsequent screenshot capture. The endpoint is the first observation, not guaranteed final data paint.** These are observations, not benchmark thresholds, API timings, or performance PASS results.

| Navigation | Observed ms | Attribution |
|---|---:|---|
| Quotation Management | 780 | UNKNOWN — cannot split API/network/render/automation |
| Payments | 808 | UNKNOWN |
| Customers | 774 | UNKNOWN |
| Products | 858 | UNKNOWN |
| Credit Notes | 818 | UNKNOWN |
| Background Jobs | 789 | UNKNOWN |
| Export Jobs | 3511 | UNKNOWN — investigate; one sample does not establish cause |
| Invoice Templates | 767 | UNKNOWN |
| Audit Activity | 783 | UNKNOWN |
| Integrations | 813 | UNKNOWN |
| Webhooks | 696 | UNKNOWN |
| User Administration | 986 | UNKNOWN |
| Settings | 707 | UNKNOWN |

### Real-data interactions

| Action | Observed ms | Browser evidence / interpretation | Attribution |
|---|---:|---|---|
| Invoice search: six sequential characters `000004` | 1343 | Saved search screenshot/snapshot showed one matching saved invoice. Includes typing and first observation. Does **not** measure the debounce interval or request count. | UNKNOWN |
| Invoice Grand Total sort | 1307 | Ascending real invoice amounts subsequently visible; five rows retained. Includes controller overhead. | UNKNOWN |
| Audit Next page | 1856 | Subsequent snapshot confirmed `Showing 21–40 of 133 records`. No API/render split. | UNKNOWN |

Invoice debounce is **275ms in source** (`InvoiceShared.jsx:19`); invoice calculation debounce is **350ms in source** (`InvoiceForm.jsx:208`). These configured values are not measured end-to-end latencies. No requests were intercepted, counted, mocked or rewritten.

An attempt to read `performance.getEntriesByType` through this browser's read-only evaluation interface returned an unavailable Performance object. A single warm development reload was also attempted; the provider timed out its locator/CDP operation while reporting the target invoice link as present/visible. That run is **inconclusive**, not an application outage or a measured reload duration. No cold-navigation, FCP, LCP, INP, TBT, CPU trace, long-task, or React commit result is claimed.

### Source and existing-artifact performance inspection

| Check | Evidence | Classification / conclusion |
|---|---|---|
| Route lazy loading | All route components eagerly imported by `AppRoutes.jsx`; no route `lazy`/`Suspense` split there | FRONTEND source risk P01; actual startup cost unmeasured. |
| Existing production assets | `dist/assets/index-u3O1w5yo.js`: 3,599,860 bytes; CSS 604,723 bytes; login image 710,310 bytes. Existing files dated 27 October 2026, 11:38 as reported by filesystem | FRONTEND payload evidence only. No new build, no compressed-transfer measurement, no cache assumption, no Lighthouse result. |
| PDF dependency loading | Static `html2pdf.js` import in credit-note export route; quotation PDF path also imports it dynamically | FRONTEND source risk; inspect dependency graph before changing chunks. |
| Quotation full-list preloading | `fetchAllPages` for quotations/customers/products before list settles; five visible rows from 12 real quotations | FRONTEND scale risk P02; no large-data benchmark. |
| Render-time lookups | `quotes.map(enrich)` and customer `.find`; product row mapping calls categories `.find` | FRONTEND candidate for indexed lookup/memoization. Current small sample does not prove expensive render time. |
| Development effect duplication | `main.jsx` uses StrictMode; quotation mount effect starts requests and invalidates a generation on cleanup without cancelling those requests | FRONTEND duplicate-request candidate in development. Network count and production behavior not measured; not a confirmed production refetch loop. |
| Query refetch policies | Shared `refetchOnWindowFocus:false`, `staleTime:300000`; invoice list overrides `staleTime:0`; background jobs poll at 10000ms; pending export jobs poll at 5000ms | Intentional policies seen in source. No uncontrolled loop was proved. |
| Notification subject queries | Per-row `FriendlySubject` uses shared query keys by event type | Potential additional initial requests; query caching may deduplicate identical events. No claim of one duplicate request per row. |

**BACKEND API / NETWORK:** No isolated response-time or network waterfall measurement was available. No latency defect is assigned to backend or network based on a visual wait alone. **React rerenders / slow modals:** profiler/CPU tracing and repeated modal timing samples were not executed.

## F. CSS code audit

The scan read **41 CSS files**, found **949 lexical `!important` occurrences**, and **350 fixed-width/min-width/max-width declarations with values of at least three decimal digits in pixels**. These counts include print styles and legitimate scrollable table minima; they are not counts of visible defects. Repeated-selector extraction is lexical and does not resolve media/container/layer contexts. See [the raw CSS evidence](css-source-evidence.json).

| File | Lines | `!important` occurrences | Interpretation |
|---|---:|---:|---|
| `src/styles/Landing.css` | 276 | 153 | High override density; public landing not visually certified in this session. |
| `src/pages/Invoices/styles/invoices.css` | 2683 | 128 | Many layers and fixed column rules; confirmed specificity failure U01. |
| `src/styles/Payments.css` | 731 | 126 | Includes print overrides; summary wrapping U07 needs media/container cascade review. |
| `src/pages/CreditNotes/styles/credit-notes.css` | 479 | 99 | Many print overrides; screen summary/filter rules lack usable mobile adaptation (U02/U03). |
| `src/pages/Quotations/styles/quotations.css` | 1499 | 94 | Repeated page/list/detail overrides; distinguish hidden/print document styles from live screen styles. |
| `src/styles/Login.css` | 751 | 74 | Source-only review; no logged-out visual PASS. |
| `src/pages/Customers/styles/customer-form.css` | 1554 | 52 | Large wizard-specific cascade; only initial create step exercised. |
| `src/pages/Settings/settings.css` | 746 | 43 | Country list intrinsic sizing spills outside page (U05). |
| `src/styles/index.css` | 270 | 29 | Broad base styles plus global focus/caret rules; source existence is not an accessibility failure by itself. |

### Confirmed or actionable cascade conflicts

1. **Invoice summary specificity:** two-class `.invoice-summary-grid.invoice-detail-kpis` defeats lower-specificity breakpoint `.invoice-detail-kpis`/`.invoice-summary-grid`. Browser still computes four ~63.4px tracks at 390px (U01).
2. **Template header alignment:** shared `WorkspaceUI.css` header selector uses several `:not(...)` selectors, making it more specific than table-level alignment. Actual Actions header left/body centered (U10).
3. **Template fixed layout:** percentage widths plus nowrap headers/date fields and no useful small-screen table floor produce overlapping cells (U04).
4. **Notification action overrides:** `height`, `padding`, `font-size` use `!important`, while `.notification-actions` refuses wrapping. Confirmed 30px/11.5px controls and overflow (U06/U14).
5. **Country intrinsic track sizing:** one-column media rule does not bound the list's internal five-track grid or the intrinsic minimum of its layout children. Entire content area expands (U05).
6. **Payment query interaction:** module media rules intend one column below 600px, while shared container rules also target `.payment-summary-totals`. Actual settled grid is two columns at 390px. Inspect matched container/media rules before a scoped fix; exact winning declaration was not captured (U07).
7. **Customer global cell override:** a high-specificity selector centers all directory header/body cells, while contact and identity sub-elements independently align left. This overrides the shared table conventions (U09).

### Maintenance risks, not automatic defects

- `AppLayout.jsx` imports Dashboard, ModuleSpacing, AppTheme, WorkspaceResponsive, DropdownTheme, RowActions and WorkspaceUI CSS, alongside module CSS and MUI/Ant generated rules. Source order alone cannot explain all winners because specificity and `!important` also apply.
- `WorkspaceUI.css` declares `.app-layout .ibms-table-frame` in multiple rule blocks; later blocks refine border/background. Repetition alone does not prove conflict, and these should not be deleted automatically.
- `Dashboard.css`, component-level `sx`, MUI theme overrides in `App.jsx`, and Ant CSS set overlapping typography/control/table properties. Consolidation should preserve the current brown palette and intentional local scrolling.
- Large table `min-width` values are often necessary. Fix unwanted **page** overflow separately from intentional **table** overflow. Do not hide problems using global `overflow-x:hidden`.
- Global focus styles exist in `index.css`, with module-specific focus rules. Contrast and complete keyboard focus visibility were not audited to an accessibility standard.
- No CSS was removed, reformatted or modified.

## G. Recommended fix order

1. **Restore mobile access to information/actions:** U01 invoice balances; U02/U03 credit summaries/filters; U04 template overlap; U05 country overflow; U06 notification header actions. Verify full currency strings and reachable actions at 390px, then 768/1024/1440.
2. **Repair payment value wrapping and navigation position:** U07/U08. Keep amounts atomic; reset only the relevant scroll surface on a deliberate screen transition.
3. **Resolve scoped table consistency:** U09–U13. Use explicit semantic column classes, common date/currency display helpers, and deliberate long-text behavior. Avoid broad new global selectors.
4. **Normalize controls and navigation semantics:** U14/U15. Reuse current button styling, one focus target per navigation action, and existing palette.
5. **Profile before optimization:** P01/P02. Capture a production-preview network/CPU trace using real authorized datasets. Separate backend response, network transfer, JavaScript work and React commits before assigning latency responsibility.
6. **Polish footer/help/job copy:** U16–U18. No module redesign is required to address these findings.

Acceptance should use a scoped review with screenshot evidence and representative data. No long, repeated full-suite run is needed for this report.

## H. Areas NOT EXECUTED / not certified

- Logged-out landing/login/register/legal/recovery/OTP/reset states. A separate login visit in the existing authenticated context redirected to Dashboard; transient public content was not counted as a completed public-route audit. The existing session was not logged out or credentials changed.
- Recurring Billing, Expenses and Reports routes that exist in the source but were not exposed by the current sidebar; no route/permission bypass was attempted. Help's visible placeholder was inspected.
- Every edit screen for every entity; later customer/credit-note wizard steps; branding save flow; selected template version history; print dialogs and exported/PDF layouts. Initial forms and listed read-only details are the executed coverage.
- Financial writes, issuing/cancelling/voiding invoices, payment/reversal/refund, quotation approval/conversion/sending, credit approval/application, communications retry, webhook ping/retry, queueing exports, generating/regenerating PDFs, save/delete/seed/activation, user/role assignments and secret changes.
- Forced offline/HTTP failure injection, server shutdown, network throttling or request mocking. Existing error-state source was available, but this run did not recreate the prior connection-error screenshots. No fresh offline/error visual PASS.
- Complete hover/focus/disabled/loading/error/empty-state matrix for every module. Actual loading states, selected empty detail tabs, initial disabled form controls and sampled open overlays were observed; validation/submission states were not driven.
- Every long-text tooltip and every menu option; screen-reader use, complete tab order/focus trap, color-contrast conformance, 200% zoom, alternative browsers, device touch/keyboard, landscape and viewport heights other than the stated sizes.
- Forms/details/dialogs at 1024/768 unless specifically listed in the browser evidence. Four-width coverage applies to the 21 **main** screens, not every subordinate state.
- API timing versus rendering split; exact debounce/request counts; duplicate-request waterfall; cold production startup; React rerender/commit counts; long tasks; CPU/memory stress; realistic high-volume table benchmark; isolated modal/dropdown duration.
- Independent backend/API performance or business-rule correctness. No backend/network performance PASS/FAIL was inferred.
- Historical build/test results from earlier chats were not counted as current audit results.

## Delivery

This report is the requested first deliverable. **No fixes are implemented.** Source-integrity comparison found no application source changes during the audit. Screenshots, snapshots and metrics accompany the report; the browser was returned to Dashboard with its original viewport.
