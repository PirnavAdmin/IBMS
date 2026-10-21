# Invoice UI polish

Only Invoice presentation files and NumberingSettings visual styles were changed for this request. Existing API adapters, routes, financial calculations, permissions, query parameters and action handlers were preserved. No backend changes or mock data were added.

| Check | Implementation status |
|---|---|
| Invoice List UI redesign | PASS |
| Create Invoice button fixed | PASS |
| KPI cards compact | PASS |
| Filter layout | PASS |
| Table alignment | PASS |
| Money columns | PASS |
| Actions menu | PASS |
| Hover visibility | PASS |
| Create/Edit consistency | PASS |
| Details/Preview consistency | PASS |
| Responsive layout | PASS (CSS implementation) |
| Functionality preserved | PASS (28 interaction tests) |

The blank primary button was caused by the page-wide anchor color overriding the contained Link button. Anchor styling now excludes MUI buttons; contained buttons explicitly retain readable white text. The List breadcrumb no longer repeats Invoices. Existing navigation remains `/invoices/new`.

KPIs use compact 116px minimum-height cards, with four/two/one columns at desktop/tablet/mobile widths. Filters use aligned 44px controls, a wider search field and a bordered Reset Filters button. The table has its own count/header, sensible column minimum widths and internal horizontal scrolling. Monetary columns remain right-aligned with tabular numbers; status and action cells are centered. Existing state/permission-based three-dot menus use warm hover and focus colors.

Forms retain the same create/edit workflow with consistent spacing, denser item rows, clear title/subtitle and action hierarchy. Issuance remains in the existing details workflow; no new direct form issue action was introduced. Details display persisted Grand Total, Paid, Outstanding and Due Date cards. Tabs have a visible active state. Preview remains a white, print-friendly document using existing data and server PDF behavior. Numbering received matching visual styles only.

## Verification

- Invoice tests: 28 passed, 0 failed. The existing empty-state assertion was updated for the requested new copy.
- Production build: PASS (Vite completed; npm exit code 0). Existing bundle-size warning remains. Result recorded in `tests/invoice-ui-polish-build.log`.
- `git diff --check`: PASS.
- Browser visual QA: NOT EXECUTED. Computer-use inventory returned no available apps or browsers. Exact browser rendering, viewport clipping and screenshots cannot be claimed visually verified.
- Backend changes: NONE.

## Files modified for this request

- `src/pages/Invoices/InvoiceList.jsx`
- `src/pages/Invoices/InvoiceForm.jsx`
- `src/pages/Invoices/InvoiceDetails.jsx`
- `src/pages/Invoices/components/InvoiceShared.jsx`
- `src/pages/Invoices/components/InvoiceActions.jsx`
- `src/pages/Invoices/styles/invoices.css`
- `src/pages/NumberingSettings/styles/numbering-settings.css`
- `tests/invoice-interactions.test.jsx` (empty-state copy assertions only)
- This report.

Earlier invoice rebuilding/deletion changes were already in the working tree before this UI request and are not part of this presentation-change list.
