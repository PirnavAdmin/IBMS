# Modules 9 and 10 - contract audit (5 October 2026)

Audited backend controllers, domain entities, repositories, services, financial/numbering contracts, shared frontend clients, routing, settings, payments and credit notes. Live Swagger was fetched successfully from the configured VITE_API_BASE_URL (93 paths); saved as invoice-live-openapi.json. No backend writes or financial test transactions performed during audit.

## Confirmed endpoints
| Method | Endpoint | Contract |
|---|---|---|
| GET | /api/v1/invoices | InvoiceFilterRequest -> PagedResult<Invoice> (raw) |
| GET | /api/v1/invoices/summary | Actual repository returns InvoiceSummaryDto[] grouped by currency, although Swagger advertises one DTO |
| GET | /api/v1/invoices/{id} | Raw Invoice, including Customer, ordered Items, PaymentAllocations, CreditNotes |
| POST | /api/v1/invoices | Invoice -> ApiResponse<Invoice> |
| PUT | /api/v1/invoices/{id} | Invoice with exact date-time RowVersion -> ApiResponse<Invoice>; stale version 409 |
| POST | /api/v1/invoices/{id}/issue | No body -> ApiResponse<Invoice>, backend allocates final number |
| POST | /api/v1/invoices/{id}/cancel | {reason} -> ApiResponse<Invoice> |
| POST | /api/v1/invoices/{id}/void | {reason} -> ApiResponse<Invoice> |
| POST | /api/v1/invoices/{id}/generate-pdf | GenerateInvoicePdfRequest -> ApiResponse<InvoicePdfResponse> |
| GET | /api/v1/invoices/{id}/pdf | Actual persisted PDF blob; inline query optional |
| POST | /api/v1/financial/calculate | FinancialCalculationRequest -> ApiResponse<FinancialCalculationResultDto> |
| GET | /api/v1/settings/numbering?documentType=Invoice | ApiResponse<NumberingSettingDto>, includes RowVersion and Preview |
| PUT | /api/v1/settings/numbering | UpdateNumberingSettingRequest -> ApiResponse<NumberingSettingDto> |
| POST | /api/v1/settings/numbering/preview | NumberPreviewRequest -> ApiResponse<NumberPreviewResponseDto>; pure formatting, no repository write |
| GET | /api/v1/customers | pageNumber/pageSize/search/status, authenticated tenant-scoped customer list |
| GET | /api/v1/customers/{id} | Persisted customer, address/currency/payment terms |
| GET | /api/v1/products | pageNumber/pageSize/search/isActive, tenant-scoped product list |
| GET | /api/v1/products/{id} | Price/currency/unit/description/HSN/tax category snapshot at selection |
| GET | /api/v1/products/{id}/validate-invoice | Real product eligibility validation |
| GET | /api/v1/settings/taxes | TaxSettingsDto with taxRates |
| GET | /api/v1/settings/discounts | Discount configuration and role policy |
| POST | /api/v1/settings/discounts/validate-max | ValidateDiscountRequest -> ValidateDiscountResultDto |
| GET | /api/v1/settings/charges | Configured charges |
| POST | /api/v1/settings/charges/calculate | Backend configured charge calculation |
| GET | /api/v1/payments?InvoiceId={id} | PaymentFilter -> paged PaymentDto list (reuse payment mapping) |
| GET | /api/v1/credit-notes/invoices/{invoiceId}/creditable-summary | Existing credit-note eligibility API |
| GET | /api/Audit | Tenant paged audit log; EntityName supported, EntityId filter absent |
| GET | /api/Auth/me | Existing authenticated user role/profile |

The generation endpoint POST /api/v1/settings/numbering/generate exists but MUST NOT be called by invoice forms/previews. Issuance owns allocation.

## Contracts and rules
InvoiceFilterRequest: searchTerm (number/customer name/reference only), customerId, status, startDate/endDate (invoice date), currency, paymentState, min/maxOutstandingAmount, min/maxTotalAmount, sortBy, sortOrder, page, pageSize. Sorting: InvoiceNumber, InvoiceDate, TotalAmount, BalanceAmount. PagedResult: items,totalCount,pageNumber,pageSize,totalPages,hasPreviousPage,hasNextPage. No due-date range/email/PO filter or export endpoint.

Invoice input: customerId,invoiceDate,dueDate,currency,reference,notes,termsAndConditions,discountAmount (fixed invoice discount),chargesAmount (scalar),items. Items: productId,description,quantity,unitPrice,discountType,discountRate,taxType,taxRate,hsnsac,sortOrder. RowVersion is a date-time string, not a binary token. No tenantId/client totals/client final number should be sent. Backend entity binding has no dedicated draft DTO or strong minimum-field validation; frontend applies FinancialLineItemRequest bounds: price 0.01..999999999.99, quantity 0.01..999999, plus required customer/item/date/currency.

Statuses: Draft, Issued, Sent, Paid, Partially Paid, Overdue, Cancelled, Voided. Only Draft editable/issuable. Cancel and Void independently accept Issued/Sent/Overdue and reject active payments. All invoice-controller access requires TenantAdmin or SuperAdmin. Numbering read/preview authenticated; PUT TenantAdmin/SuperAdmin. Tenant comes from authentication claims/shared client; no tenant selection added.

Numbering tokens actually supported (case-insensitive braces): {YEAR},{YYYY},{YY},{MONTH},{MM},{DD},{FY},{QUARTER}. Sequence is appended by backend, no {SEQ} token. Prefix/suffix <=20, tokens <=30, sequenceLength integer 3..10, nextNumber integer 1..999999999999. Reset policies Never, Yearly, Financial Year, Monthly, Daily. Status persisted Active/Inactive. Preview formats supplied counter and date without consuming sequence; it does not forecast reset.

## BACKEND BLOCKERS
1. Feature: Send/communication. Required: exposed authenticated send/recipient/message and communication history endpoints. Existing: InvoiceService.DeliverInvoiceAsync and communication repository, but no controller/Swagger route. Observed: inaccessible service. Impact: no send/resend success simulation; Communication tab explains unavailable capability.
2. Feature: Export. Required: filtered CSV/Excel endpoint. Existing: list only. Observed: absent from source/Swagger. Impact: export unavailable; no current-page export presented as full export.
3. Feature: Stable line discounts. Required: separate invoice-discount input and line-discount total. Existing: RecalculateInvoiceTotalsAsync writes total line+invoice discounts into DiscountAmount and feeds that aggregate back as invoice discount on Issue. Observed: recalculation can double apply line discounts. Impact: new UI disables line discounts and blocks editing/issuance of drafts with nonzero persisted line discounts; fixed invoice discounts only.
4. Feature: Full tax/charges model. Required: persisted tax IDs/inclusive flags/compound breakdown, charge IDs/calculation types/tax context. Existing: InvoiceItem has only taxType/taxRate and Invoice has scalar chargesAmount. Observed: persistence recalculation drops inclusive context and named charge metadata. Impact: exclusive single item tax and configured non-tax charges only; other choices unavailable. Unit, billing/shipping snapshots, PO and payment terms are absent from invoice contract; display customer information separately without claiming invoice snapshots.
5. Feature: Draft currency update. Required: persist changed Currency in UpdateDraftAsync. Existing: update method never assigns Currency. Impact: draft edit currency read-only.
6. Feature: Numbering concurrency/disable/reset. Required: PUT concurrency compare, inactive generation rejection, dedicated guarded reset. Existing: response RowVersion, PUT request has no version; generation has no Status/IsActive check; no reset route. Impact: retain version as metadata, report missing protection, no fake reset or claimed issuance block. PUT status is real persistence but cannot guarantee disabled issuance. Editing next number is a sequence change and requires confirmation.
7. Feature: Backend issuance validation/tenant safety. Required: validate customer/product ownership/active state and propagate financial calculation failure before persistence/issue. Existing: InvoiceService Create/Update binds entity directly; recalculation silently ignores a failed calculation; no customer/product tenant checks in that path. Impact: frontend selects from authenticated tenant APIs and revalidates selected products/customer, but cross-tenant write protection is a backend blocker. No claimed tenant-isolation PASS without live verification.
8. Feature: Audit by invoice. Required: EntityId server filter. Existing: GET /api/Audit supports EntityName but no EntityId. Impact: fetch actual paginated Invoice audit and filter the received page by exact entityId, clearly label partial history and expose paging; never fabricate or imply complete invoice history.
9. Feature: Historical branding/address/tax breakdown. Required: complete persisted invoice snapshot contract accessible for display. Existing: invoice GET includes current Customer relationship, item financial values; PDF snapshot functionality exists. Impact: items display persisted values; customer address clearly current; authoritative visual document is server PDF, not local printable layout.
10. Feature: Numbering reset forecast. Required: preview next allocatable sequence under reset policy. Existing: preview/GET use stored NextNumber; generation applies reset separately; LastResetDate starts null and ShouldReset returns false for null. Impact: preview marked advisory, reset progression cannot be claimed verified.

Backend source must remain unchanged. Supported UI work proceeds while blockers are explicit. Live financial writes require disposable QA records and an authenticated session.

Verified numbering document types used by backend workflows: Invoice (InvoiceService), Quotation (QuotationService/QuotationActionService), CreditNote (CreditNoteService), Payment (PaymentService). UI passes these exact strings; unsupported legacy labels/types are removed.
