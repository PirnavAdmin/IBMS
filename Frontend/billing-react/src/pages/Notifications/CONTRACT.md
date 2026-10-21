# Module 14 — Notification Management

Contract verified against repository source, not an authenticated deployment:

- `Backend/Billing.Contracts/Notification/NotificationTemplateDtos.cs`
- `Backend/Billing.Contracts/Notification/NotificationLogDtos.cs`
- `Backend/Billing.Contracts/PagedResult.cs`
- `Backend/Billing.API/Controllers/NotificationTemplatesController.cs`
- `Backend/Billing.API/Controllers/NotificationsController.cs`
- `Backend/Billing.Application/Services/NotificationTemplateService.cs`
- `Backend/Billing.Application/Services/NotificationService.cs`
- `Backend/Billing.Infrastructure/Repositories/NotificationTemplateRepository.cs`
- `Backend/Billing.Infrastructure/Repositories/NotificationLogRepository.cs`
- Notification enums, EF field limits, and ASP.NET JSON configuration.

ASP.NET serializes DTO properties in camelCase. Shared `apiClient` already unwraps Axios' response into the backend envelope. This module then checks `success` and reads `data`; failed envelopes cannot become successful saves/previews.

## Templates

`GET /api/v1/notification-templates?eventType=...&isActive=false` returns `ApiResponse<NotificationTemplateDto[]>`.

Template fields: `id`, `tenantId`, `eventType`, `channel`, `name`, `description`, `subjectTemplate`, `bodyTemplate`, `isActive`, `createdAtUtc`, `updatedAtUtc`, `createdBy`, `updatedBy`.

`GET /{id}` returns one template. `POST` creates; `PUT /{id}` updates; `DELETE /{id}` returns `ApiResponse<bool>`.

Create fields: `eventType`, `channel`, `name`, `description`, `subjectTemplate`, `bodyTemplate`, `isActive`.
Update fields: `name`, `description`, `subjectTemplate`, `bodyTemplate`, `isActive`. Event type and channel are immutable via update. No rowVersion/version field exists. TenantId is response-only and is never submitted by this frontend.

Current delivery service is email. Create explicitly submits `channel: "Email"`; no editable channel or unsupported SMS/push choices. EF limits: name 128, description 256, subject 500 characters.

Events: `InvoiceIssued`, `InvoiceSent`, `PaymentReceived`, `PaymentFailed`, `InvoiceOverdue`, `QuotationSent`, `CreditNoteIssued`.

`GET /variables/{eventType}` returns `ApiResponse<NotificationVariableDefinitionDto[]>`; each definition has `name`, `token`, `description`, `exampleValue`. Buttons insert the returned `token` unchanged. The backend remains the variable authority.

`POST /preview` accepts `eventType`, `subjectTemplate`, `bodyTemplate`, optional `customVariables`. UI sends the first three fields only. Response data: `eventType`, `renderedSubject`, `renderedBody`, `usedVariables`. No sender metadata exists. Preview uses a sandboxed iframe with restrictive CSP; external images/resources are intentionally blocked in previews.

`POST /seed-defaults` returns `ApiResponse<bool>`. Repository compares existing tenant event types case-insensitively and inserts defaults only for missing event types. It does not reset customizations or reactivate inactive templates. UI exposes **Seed Defaults**, with confirmation; never invokes POST automatically.

Backend behavior to be aware of: GET list itself automatically seeds defaults when the tenant has zero templates. Deleting every template therefore does not produce a permanently empty tenant list. This is existing backend behavior, not a frontend seed request.

Template endpoints require TenantAdmin or SuperAdmin. History/retry also permit User. Existing shared authentication, tenant headers and backend authorization remain authoritative.

## History

`GET /api/v1/notifications/history` supports `eventType`, `entityType`, `entityId`, `status`, `searchTerm`, `startDate`, `endDate`, `pageNumber`, `pageSize`.

UI implements event, status, search, date range and server pagination. Date-only inputs represent inclusive IST calendar days and are converted to UTC, following the existing audit module. No client-side history filtering is used.

Response: `ApiResponse<PagedResult<NotificationLogDto>>`, with `items`, `totalCount`, `pageNumber`, `pageSize`, `totalPages`, `hasPreviousPage`, `hasNextPage`.

History fields: `id`, `tenantId`, `eventType`, `entityType`, `entityId`, `channel`, `recipient`, `subject`, `message`, `status`, `sentAtUtc`, `retryCount`, `failureReason`, `sentBy`, `nextRetryAtUtc`.

Statuses: `Sent`, `Failed`, `Queued`. Missing dates display a dash through the existing audit date formatter.

`POST /api/v1/notifications/{id}/retry` returns `ApiResponse<NotificationLogDto>`. The service attempts delivery synchronously; successful delivery returns Sent. Failure increments retryCount, updates failureReason/nextRetryAtUtc and returns a failed envelope (HTTP 400). UI exposes retry only for Failed rows, prevents duplicate submissions and refetches history on either outcome. It never optimistically marks delivery successful and can display Queued if returned by the server.

## Drafts and verification

Create/edit reuse `FormDraftContext`, keyed per template or new form. SPA navigation retains unsaved values; successful save or Cancel / Discard clears them. Provider remount/full refresh clears memory naturally. No notification draft storage is added.

Run from `Frontend/billing-react`:

```powershell
node tests/run-notification-ui.mjs
node tests/run-protected-routes.mjs
node tests/run-draft-ui.mjs
npm.cmd run build
git diff --check
```

Automated UI tests use contract-shaped fixtures only in the tests directory. They do not establish deployed-backend compatibility or authenticated live QA.
