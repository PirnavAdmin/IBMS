# Module 11 ? backend contract audit

Status: frontend screens built; API integration remains blocked by the contracts below.

Live inspection on 2026-09-30: GET https://pediatric-astrology-outrank.ngrok-free.dev/swagger/v1/swagger.json returned HTTP 200. The shared client already uses this backend base URL. No authenticated writes or QA financial transactions were attempted.

The live Swagger contains no payment resource operations and no invoice resource/eligible-invoice/balance operations. Local backend controllers agree. Invoice-related calculation endpoints are pricing calculators, not persisted invoice balances.

## Required blockers

| Feature | Required contract | Observed backend support | Frontend impact |
| --- | --- | --- | --- |
| Payment List / Details | Tenant-scoped list with query, pagination/sort and detail DTOs | No Payment controller, service, entity, or live resource endpoints | Cannot load records, filters, totals, details or real status badges |
| Record Payment | Create DTO, methods, invoice allocation, atomic balance update | No create-payment operation | Cannot submit or define method-specific fields safely |
| Invoice eligibility / balance | Eligible persisted invoices and authoritative total/paid/outstanding | No invoice resource API; CustomerService.GetCustomerDetailsAsync returns zero financial totals and empty invoice/payment lists | Cannot select eligible invoices, validate outstanding, or synchronize balances |
| Idempotency | Backend idempotency-key semantics and duplicate response contract | No payment idempotency operation or contract found | BACKEND BLOCKER ? payment create idempotency protection missing |
| Reversal | Reversibility flag, permission, reason limits, atomic reversal endpoint | No reversal operation or DTO | Cannot expose a safe Reverse action or reversal dialog |
| Audit / outbox | Payment audit retrieval and transactional payment events | Existing customer/quotation audit support; no payment audit or outbox implementation found | No real payment timeline or event guarantees |
| Authorization | Payment view/record/reverse permission contract and tenant enforcement | Existing shared bearer auth, but no payment policies/endpoints | Payment authorization and cross-tenant tests cannot be verified |

## Contract decisions (all 15 requested items)

1. Exact payment endpoints: none exposed for list, create, details or reverse. No eligible-invoice/balance endpoint exists. Related real GET endpoints are `/api/v1/customers`, `/api/v1/customers/{id}`, `/api/v1/customers/{id}/details`, and `/api/v1/customers/{id}/audit`; none substitutes for the missing payment operations.
2. Payment statuses: no supported enum/contract found. No statuses inferred from examples.
3. Payment methods: no supported enum/validation contract found. No methods exposed.
4. Partial payments: not specified or implemented in the inspected payment backend.
5. Multiple invoice allocations: no allocation contract found.
6. Overpayment/unapplied credit: no support established; cannot be enabled.
7. Cheque effective-state rule: no cheque/payment lifecycle contract found.
8. Gateway support: no payment gateway operation/metadata contract found.
9. Payment/receipt numbering: generic numbering accepts a document-type string (`GET/PUT /api/v1/settings/numbering`, `POST /api/v1/settings/numbering/preview`, `POST /api/v1/settings/numbering/generate`). No payment/receipt-specific preset or payment creation integration exists. Unrecognized types fall back to invoice defaults; this does not establish receipt support. BACKEND DEPENDENCY ? receipt/payment numbering not currently supported as a payment lifecycle contract. No sequence was generated during this audit.
10. Idempotency: no payment key/header, scope, retry or conflict semantics found.
11. Reversal eligibility: no backend eligibility field or permission contract found.
12. Partial vs full reversal: neither is specified by a payment contract.
13. Audit/outbox: shared AuditLog and customer/quotation audit exist. No payment audit endpoint, payment transactional audit or outbox support found.
14. Tenant/branch headers: shared apiClient sends `Authorization: Bearer ...` and `ngrok-skip-browser-warning`; it does not inject a tenant/branch header. CustomersController resolves `TenantId`/`tenant_id` claims, with `X-Tenant-Id` or `tenantId` query selection for SuperAdmin. No payment-specific tenant/branch contract exists; customer behavior must not be assumed for Payments.
15. Required permissions: payment view/record/reverse permissions are undefined. Existing customer roles do not establish payment permissions.

NOT IMPLEMENTED ? receipt functionality not currently supported. No receipt endpoint/project receipt integration was found.

## Reuse and safety

The existing Invoice screen imports billingStore rather than an authoritative invoice API. It must not supply payment balances or persistence. Customer summary DTO fields alone do not establish live financial support. Backend source, unrelated modules, auth, sidebar and route registration remain unchanged. Payments now has list, record, details and reversal UI with explicit unavailable states and throwing service stubs; no invented URLs, DTOs, records, amounts, statuses, persistence or balance formulas were added.

No runtime Payment mock imports, dummy APIs or payment localStorage persistence remain. The unrelated Dashboard demo source is unchanged.

Live QA (create, partial/full payment, reversal, duplicate reversal, overpayment, idempotency and cross-tenant access) is blocked by the absent contracts. Focused tests of those unavailable operations cannot meaningfully be implemented. Frontend-only route/render/navigation, validation, unavailable-state and no-mock tests cover the UI. Payment service methods accept frontend input only; their eventual request/response adapters must follow confirmed backend contracts.

## Evidence

- `Backend/Billing.API/Controllers/`: no Payments or Invoices controller.
- `Backend/Billing.Application/Services/CustomerService.cs`: GetCustomerDetailsAsync financial placeholders.
- `Backend/Billing.Contracts/Customer/CustomerDetailsDto.cs`: summary shapes only, not create-payment DTOs.
- `Backend/Billing.Application/Services/NumberGenerationService.cs` and `NumberingSettingService.cs`: generic document types and invoice default fallback.
- `Backend/Billing.Application/Interfaces/IAuditService.cs`: customer audit operations.
- `Frontend/billing-api-client/apiClient.js`: shared base URL, bearer handling and request headers.
- `Frontend/billing-react/src/pages/Invoices/Invoices.jsx`: billingStore dependency.

Live Swagger paths inspected:

- `/api/Auth/login`
- `/api/Auth/refresh-token`
- `/api/Auth/logout`
- `/api/Auth/logout-all`
- `/api/Auth/me`
- `/api/Auth/sessions`
- `/api/Auth/forgot-password`
- `/api/Auth/verify-otp`
- `/api/Auth/reset-password`
- `/api/Auth/register`
- `/api/Auth/register-company`
- `/api/Auth/company-dashboard`
- `/api/Auth/customer-dashboard`
- `/api/Auth/platform-dashboard`
- `/api/v1/categories`
- `/api/v1/categories/{id}`
- `/api/v1/categories/{id}/status`
- `/api/v1/settings/charges`
- `/api/v1/charges`
- `/api/v1/settings/charges/{id}`
- `/api/v1/charges/{id}`
- `/api/v1/settings/charges/calculate`
- `/api/v1/charges/calculate`
- `/api/v1/customers`
- `/api/v1/customers/next-code`
- `/api/v1/customers/summary`
- `/api/v1/customers/{id}`
- `/api/v1/customers/{id}/deactivate`
- `/api/v1/customers/{id}/audit`
- `/api/v1/customers/{id}/details`
- `/api/v1/discounts/calculate-line`
- `/api/v1/discounts/calculate-invoice`
- `/api/v1/discounts/rules`
- `/api/v1/discounts/rules/{id}`
- `/api/v1/settings/discounts`
- `/api/v1/settings/discounts/roles`
- `/api/v1/settings/discounts/validate-max`
- `/api/v1/financial/calculate`
- `/api/v1/settings/numbering`
- `/api/v1/settings/numbering/preview`
- `/api/v1/settings/numbering/generate`
- `/api/v1/products`
- `/api/v1/products/next-code`
- `/api/v1/products/{id}`
- `/api/v1/products/{id}/deactivate`
- `/api/v1/products/{id}/validate-invoice`
- `/api/v1/quotations`
- `/api/v1/quotations/{id}`
- `/api/v1/quotations/{id}/send`
- `/api/v1/quotations/{id}/approve`
- `/api/v1/quotations/{id}/cancel`
- `/api/v1/quotations/{id}/convert`
- `/api/v1/quotations/{id}/communication`
- `/api/v1/quotations/{id}/audit`
- `/api/v1/settings/taxes`
- `/api/v1/settings/taxes/calculate`
- `/api/v1/settings/taxes/rates/{id}`
- `/api/v1/settings/taxes/rates`
