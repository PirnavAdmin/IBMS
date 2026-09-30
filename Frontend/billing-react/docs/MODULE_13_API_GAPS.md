# Module 13 API verification and backend dependency report

Inspected the React API client, endpoint constants, backend API controllers, application interfaces/services, and invoice/quotation contracts on 2026-09-30. A repository search found no Module 13 PDF/specification document. No invoice-template, company-branding, template-version, invoice-detail, or PDF/document endpoint was found under another route name.

## Existing related backend functionality

- `QuotationsController` is authorized at controller level and tenant-scopes requests using the authenticated tenant claim. Its list/detail/create/update/action contracts are quotation-only.
- `POST /api/v1/quotations/{id}/convert` creates an `Invoice` through `QuotationActionService` and returns `ApiResponse<int>` with the created invoice ID. It does not expose invoice detail or a PDF.
- `QuotationListFilterRequest` supports `Search`, `Status`, `Validity`, `CustomerId`, `FromDate`, `ToDate`, `PageNumber`, `PageSize`, `SortBy`, and `SortOrder`; responses use `ApiResponse<PagedResult<QuotationResponse>>`. These are not template contracts and must not be reused to invent template filtering semantics.
- `Invoice` and `InvoiceItem` domain entities and `IInvoiceRepository.AddAsync` exist. The repository only inserts invoices; there is no invoice application service/controller query or document generation/storage contract. Invoice entity fields include tenant/customer IDs, number, invoice/due dates, reference, status, subtotal, discount, tax, charges, total, paid/balance amounts, notes, terms, quotation ID, timestamps, row version, and items. No PDF or template-version snapshot fields are present in the entity inspected.
- A shared `AuditLog` entity and repository exist. The entity contains `Id`, `TenantId`, `CustomerId?`, `EntityName`, `EntityId`, `Action`, `UserName`, `Timestamp`, and `Changes`. Repository methods include tenant/entity lookup and tenant-paged lookup, but there is no generic audit controller/API. Public audit reads found are customer-specific and quotation-specific. No template/version/invoice-document audit writer or read endpoint was found. The quotation audit endpoint can add a synthesized “Created” event with `User #2` when it finds none; that quotation-only fallback is not suitable evidence for template audit history and is not reused.
- The frontend shared `apiClient` uses the configured base URL and attaches the current bearer token. `billing-api-client/endpoints.js` and its exported services have no template, branding, invoice, or document service.
- Existing quotation details can be printed in the browser. That is a quotation view, not an invoice PDF feature, so it is not reused for invoice documents.

## Per-screen verification

| Screen | Current frontend behavior | API finding / limitation |
|---|---|---|
| Template List | Search/status/style controls, empty state, and display columns for name, style, version, status, last modified date, and last modified user. The separate Actions column has been removed per UI direction. | No list/detail API exists, so no real rows or API loading/error states can be shown. No fake rows are added. |
| Create Template | Basic template name/style/description and preview section toggles, with required-name validation. Continues to the separate Branding Settings screen while passing unsaved form values in route state. | No create/draft API or validation contract. No data is sent or persisted. |
| Edit Template | Form route and validation; warns that the selected record cannot be loaded; save disabled. | No template detail/update API, so no real record can be edited. |
| Branding Settings | Separate company/logo/color/header/payment/terms configuration screen; can pass its unsaved values to Template Preview. | No branding read/update or logo upload API. Save remains disabled; route state is temporary and does not imply persistence. |
| Template Preview | Separate Standard/Professional/Compact layout switching and short/long configuration sample. | Client-side representative preview only, clearly labeled `SAMPLE PREVIEW`. No server preview/PDF API. |
| Version History | Explicit unavailable/empty state; no local version simulation. | No version list/detail/activation API or version DTO/entity was found. |
| Invoice PDF | Reachable from invoice details; open/download/print disabled with explanation. | No invoice GET/detail, stored document retrieval, PDF generation, download, or historical-document API. |

No frontend request is made for the unsupported screens. Consequently, loading and HTTP error states are not represented as if a request were made; the UI reports the missing integration directly.

## Backend work needed for frontend integration

For each operation, Prathap should provide the actual route/method, DTO schema, tenant and permission rules, validation/error behavior, and success response. Endpoint paths below are intentionally not proposed.

| Operation needed | Frontend use | Contract information needed |
|---|---|---|
| Template list/search/filter/page | Populate Template List and its filters | Name, style (`Standard`, `Professional`, `Compact`), active status, current/active version, modified date and user, permitted searchable identifiers; supported filter/sort/page query names and paged response metadata. The UI table has no Actions column per user direction and cannot show real values until this contract exists. |
| Template detail | Load Edit Template and view actions | Template ID, all persisted configuration fields, row/version concurrency token if applicable, created/modified metadata, status and active version. |
| Create/update draft | Save Create/Edit forms | Accepted fields and required/length constraints for name, description, style, company identity, header/footer, payment instructions, terms, colors, logo reference, and layout options; response containing persisted ID/status/version; validation and conflict responses. |
| Organization branding read/update | Load/save Branding Settings | Existing company profile fields, primary/secondary colors, header/footer/payment/terms defaults, update concurrency behavior and response. Clarify whether branding is tenant- or template-scoped. |
| Logo upload/select | Upload and preview supported logo | Multipart or asset-reference contract, allowed image MIME types, byte/dimension limits, storage reference response, replacement/deletion behavior. No current project rule establishes these limits. |
| Template preview | Preview an unsaved/revised version with actual configuration | Request representation (persisted ID/version or submitted draft), response type (PDF/blob or preview model), error behavior, and whether sample invoice data is server-owned or supplied. |
| Duplicate template | List action | Source ID and copy semantics, generated name behavior, returned new draft ID/version. |
| Activate/deactivate | Deliberate status action | Target ID/version, permission requirements, confirmation/concurrency rules, response status, and audit metadata. |
| Version list/detail/activate | Version History and preview before activation | Version ID/number, active/historical status, config snapshot, created/modified by/time, activation metadata, and activation request/response. Historical versions must be immutable. |
| Template/document audit query and event recording | Audit & Traceability screen and audit stamps across template/version/PDF actions | Record tenant/entity/template/version/document IDs, action, actor, timestamp, change/result description; capture template lifecycle, invoice-version association, generation and storage outcomes; expose authorized template/document-specific reads. Existing audit model fields may help for actor/action/time/changes, but no template audit operation or version/document fields exist. |
| Invoice list/detail | Existing invoice workflow and document actions | Tenant-scoped invoice lookup, supported filters/page contract, and detail DTO. The existing entity is a storage model, not a response contract. |
| Generated PDF retrieval/download/print | Invoice PDF screen | Authorized invoice/document lookup, stored-document identifier/status, binary response and filename/content type, regeneration policy, and distinct generation versus storage failure codes if exposed. |
| Historical PDF and template snapshot | Preserve original invoice presentation | Retrieval by historical invoice/document identity, original template version metadata, immutable snapshot behavior, and response when a historical document is missing. |

Once those real contracts are provided, wire them through the existing `apiClient` and established service pattern. Until then, the frontend keeps persistence, versioning, activation, upload, and authoritative invoice documents unavailable.

## Functional specification coverage review

Compared with `Module_13_PDF_and_Invoice_Template_Functionality_Flow (1).pdf` (sections 1–25):

| Spec area | Frontend coverage now | Status / owner |
|---|---|---|
| 1–2 objectives and scope | Separate list, create/edit, branding, preview, version-history and invoice-document routes exist. | Screens exist; end-to-end lifecycle awaits backend contracts. |
| 3 template list | Search/status/style filters and empty state; displays name, style, version, status, last modified date, and last modified user. | Actions column omitted per user direction. No real records, server filtering, permission decisions, view/duplicate/activate/deactivate, version metadata, or loading/error request states without APIs. |
| 4 create | Name required validation; style and optional description; preview-section controls; branding/review are separate screens in the navigation flow. Save draft remains disabled. | Specific invoice-type/business-unit options cannot be added without supported values/contract. Save awaits create API. |
| 5 branding | Company identity, logo image preview, aspect-preserving sample rendering, position/width controls, colors, header/footer, payment/bank details and terms are editable in the unsaved branding screen and editor. | These are memory-only preview inputs. Save/reuse across templates and server logo upload await APIs. Image format and dimension/size policy is not defined in this repo, so no arbitrary size/dimension cap is enforced. |
| 6–8 layout/styles/payment | Client preview has visibility toggles for invoice identifiers, customer, line items, quantities, unit price, discount, tax and totals; styles switch among all three layouts. Payment, bank details, footer and terms appear in the sample. | Configuration field persistence/compatibility and authoritative financial presentation need backend DTO confirmation. Sample values are illustrative only. |
| 9 preview | Branding screen values are passed in route memory to the separate, clearly labeled sample preview; style switching and short/long sample modes are available. Logo aspect ratio is preserved and low primary-color contrast warns. Long mode shows a visible client-side page boundary. | No server-rendered fidelity, PDF page measurement, automatic overlap/clipping validation, or generated preview failure state without preview API. The visual page divider is only a layout guide. |
| 10 editing | Edit route validates name and has configuration controls. | Cannot load or update a real record; active edits cannot create actual versions until APIs exist. |
| 11 versioning and 17 activation | History route shows unavailable state; no versions are simulated. | Version creation/list/detail/activation and confirmation/audit behavior are backend dependencies. |
| 12, 16 historical snapshot/reproduction | Invoice document screen does not regenerate or replace historical files. | Invoice snapshot/template association, original branding, historical lookup and retrieval are backend responsibilities and absent. |
| 13–15 PDF generation/storage | Invoice PDF route has explicit unavailable state; open/download/print controls disabled. | Server generation, pagination, PDF validation, storage abstraction (local/Azure/S3), retrieval, retry/idempotency and distinct generation/storage states require backend. |
| 18 validation | Required template name checked before sample preview; style constrained to supported UI choices; image decode errors preserve other input; primary color contrast warning. | Uniqueness, company requirements before activation, allowed image dimensions/formats, required sections, finalized-invoice validation and storage rules need backend policies/contracts. |
| 19–20 PDF quality/errors | Sample UI wraps long text, and long mode illustrates a page boundary. Local image preview errors are surfaced. | Actual selectable text, stable PDF pagination, clipping validation, server preview/PDF/storage errors and retries cannot be completed client-only. |
| 21 audit | New Audit & Traceability screen lists all required event categories and clearly shows that template records are unavailable. | Shared audit model/repository and customer/quotation audit reads exist, but template/version/invoice-document writes and queries are absent. The quotation “Created” fallback is synthetic and is deliberately not reused. |
| 22–25 scenarios/completion/summary | Frontend supports unsaved layout configuration and honest sample review only. | Scenarios involving activation, duplicate/version lifecycle, issued snapshots, generated/stored PDF, historical reproduction and auditable completion remain unresolved until backend implementation. |

The document explicitly excludes API and database design. Therefore the backend dependency list above describes required behavior and fields, not proposed endpoint names or an invented transport contract.
