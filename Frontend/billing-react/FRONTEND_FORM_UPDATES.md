# Frontend implementation and verification

Frontend only. No backend files or financial calculation rules changed.

## Feature status

| Item | Frontend result |
|---|---|
| Product Ant Design interactions | Implemented: scoped brown focus and warm cream options; visual live QA not executed |
| Billing Currency UI | Compact labels/search and saved-code retention implemented; tenant-enabled filtering BLOCKED |
| Tax Category | PASS automated create/edit Product and Service controls; single editable field and consistent full option list |
| Unsaved forms | PASS shared navigation/remount/save/cancel/error/entity-isolation tests |
| New Payment Date | PASS local calendar date helper and Record screen tests |
| Payments print | PASS generated-document data/structure/theme tests |
| Products print | PASS generated-document data/structure/theme tests |

## Contracts

Products submit ISO code in the existing currency field. Product API accepts a string (max 10), uppercase-normalized, without a limited enum. There is no implemented tenant billing-currency configuration read/update API. Existing Country Settings preferences use browser storage and reference an unimplemented endpoint; they are not used as a Product allowlist. See BILLING_CURRENCY_BACKEND_BLOCKER.md for inspected support and required tenant configuration contract. Full ISO options remain available until that contract exists.

Tax stays in the existing taxCategory string (max 64): predefined labels and custom text such as GST 7.5% use the same field. Selecting Other clears that field for typing, without swapping controls or reducing the option list. Choosing a predefined option replaces custom text. Existing customTaxPercentage is stripped by the existing validation. No new tax formula.

## Draft lifecycle

FormDraftContext holds a Map inside the authenticated React route tree. Keys include form type and entity ID; numbering also uses document type slots. No localStorage, sessionStorage, IndexedDB or backend persistence was added for drafts. Auth/password forms are excluded.

Integrated Products, Customers, Invoices, Payments, Credit Notes, Quotations, Categories, Taxes, discount/charge/rule settings, Numbering and template/branding forms. SPA unmount/remount restores values. Successful save and explicit Cancel/Discard clear the applicable draft; API validation failures retain it. Full provider/app remount (including browser refresh) clears memory. Payment retry payload, idempotency attempt and submission guard survive SPA navigation in memory.

## Payment Date

localCalendarDate uses local getFullYear/getMonth/getDate and zero-padding. Only a new RecordPayment form initializes it; restored user-entered dates win. Existing createPaymentDto date serialization and details flows are unchanged.

## Verification

- Production Vite build: PASS; existing large-chunk warning remains.
- git diff --check: PASS (Git line-ending conversion warnings only).
- Draft navigation: 7/7 PASS.
- Actual Product/Service create/edit control interactions: 4/4 PASS.
- Currency/tax/page-size/Product print: 10/10 PASS.
- Product UI regression: 17/20 PASS, 3 FAIL. Existing tests expect twelve table columns and unavailable tax, while unchanged table currently has eleven columns and displays tax category. Table/pricing implementation was not changed in this task.
- Payment regression: 24/25 PASS, 1 FAIL. Unchanged amount validator allows zero and truncates decimals; existing test expects positive amounts and preserved decimals. Validation was intentionally preserved.
- Invoice/Numbering regression: 22/29 PASS, 7 FAIL. Re-executed using Git HEAD versions of InvoiceForm and NumberingSettings through an in-memory build override: identical seven failures. Older preview/save/communication/numbering token/reset-policy/required-field expectations remain unresolved.
- Quotation contracts/dates/state: 29/30 PASS, 1 FAIL. Simultaneous loading failure test also fails against Git HEAD page source. Harness now understands the new draft hook and verifies successful-save clearing and failed-save retention.
- Live browser/API QA: NOT EXECUTED / BLOCKED by unavailable browser automation environment. No live create/update requests or print-preview visual verification were claimed.

## Files changed

- src/pages/CreditNotes/pages/CreditNoteForm.jsx
- src/pages/Customers/components/CustomerForm.jsx
- src/pages/Customers/pages/CreateCustomer.jsx
- src/pages/Customers/pages/EditCustomer.jsx
- src/pages/InvoiceTemplates/InvoiceTemplates.jsx
- src/pages/Invoices/InvoiceForm.jsx
- src/pages/NumberingSettings/pages/NumberingSettings.jsx
- src/pages/Payments/RecordPayment.jsx
- src/pages/Payments/paymentReports.js
- src/pages/Products/components/ProductEditableSelect.jsx
- src/pages/Products/components/ProductForm.jsx
- src/pages/Products/pages/CategoryFormPage.jsx
- src/pages/Products/pages/CreateProduct.jsx
- src/pages/Products/pages/EditProduct.jsx
- src/pages/Products/styles/product-form.css
- src/pages/Products/utils/productListReport.js
- src/pages/Products/validation/productValidation.js
- src/pages/Quotations/QuotationManagement.jsx
- src/pages/Quotations/components/QuotationForm.jsx
- src/pages/Settings/ChargesConfiguration.jsx
- src/pages/Settings/DiscountConfiguration.jsx
- src/pages/Settings/DiscountRules.jsx
- src/pages/Taxes/Taxes.jsx
- src/routes/AppRoutes.jsx
- src/utils/currencies.js
- tests/payments-ui.test.jsx
- tests/product-controls.test.jsx
- tests/product-currencies.test.mjs
- tests/product-print.test.mjs
- tests/quotation-state.test.mjs
- src/context/FormDraftContext.jsx
- src/utils/localDate.js
- tests/draft-state.test.jsx
- tests/run-draft-ui.mjs
- BILLING_CURRENCY_BACKEND_BLOCKER.md
- FRONTEND_FORM_UPDATES.md
