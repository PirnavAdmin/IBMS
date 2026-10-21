# Screen 4 — Delivery History and Dead-Letter Queue

Implemented 15 October 2026 at `/webhooks/deliveries`. The placeholder was replaced. Existing sidebar entries and Integration functionality were left unchanged; Webhook Configuration continues to navigate here with `?webhookId={id}`.

## Contracts and backend limitations

Inspected local `WebhooksController`, `WebhookDeliveryDtos`, `WebhookDeliveryService`, `WebhookDeliveryRepository`, and `WebhookDispatcher`, shared paging/envelope contracts, existing API client, auth/tenant handling, and prior local Module 15 verification reports. The older local invoice OpenAPI snapshot contains no delivery definitions; C# source is authoritative for this implementation. No live Swagger request was made because the server is unavailable.

- GET `/api/v1/webhooks/deliveries`: `webhookId`, `eventType`, `status`, `startDate`, `endDate`, `pageNumber`, `pageSize`. Server-side filters and paging are used; responses use `ApiResponse<PagedResult<WebhookDeliveryDto>>`.
- GET `/api/v1/webhooks/{id}/deliveries` also exists. The generic list route is used consistently with `webhookId`, allowing the same filter path for all records, one webhook, and DLQ.
- GET `/api/v1/webhooks/deliveries/{deliveryId}` loads fresh details.
- POST `/api/v1/webhooks/deliveries/{deliveryId}/replay` takes no body. It returns nested `success`, `deliveryId`, `message`, `status`, and `attemptNumber`. Outer success indicates that the operation completed, not necessarily that the webhook delivery succeeded.
- GET `/api/v1/webhooks/events` supplies event choices. Webhook choices use searchable, paginated GET `/api/v1/webhooks` and GET `/api/v1/webhooks/{id}` for a selected ID not yet loaded in choices.
- The controller permits TenantAdmin, SuperAdmin, and User. Existing shared Bearer token, tenant headers, session expiration handling, and `.env` base URL are reused without changes.

**Unavailable last-attempt timestamp:** The DTO has `createdAtUtc`, `deliveredAtUtc`, and `nextRetryUtc`, but no last-attempt field. The table uses the accurate label **Delivered At**, and details show Created/Delivered/Next Retry timestamps. DLQ omits last attempt instead of substituting creation or retry time.

**Attempt semantics:** `attemptNumber` and `maxAttempts` are shown as Attempt Number / Maximum Attempts. The dispatcher can increment `attemptNumber` when scheduling a retry, so the UI does not invent a completed-attempt count.

**Dates:** Backend filters apply to `createdAtUtc`, inclusively. UI labels specify UTC and explain creation-time filtering; dates are sent as UTC start-of-day and end-of-day values. Reversed or malformed ranges prevent the list request.

**Status values:** Success, Retrying, Failed, DeadLetter, and Pending remain unchanged. Required colors are green/yellow/red/purple; Pending is neutral. DLQ is the same list endpoint with `status=DeadLetter`, not a new endpoint.

**Global totals:** Five lightweight page-size-one requests read unfiltered and separately status-filtered backend `totalCount` values. Global totals never come from one page's rows. Total includes Pending records even though there is no separate Pending summary card. Cards are omitted when totals cannot be obtained.

## Replay behavior

The backend service does not restrict replay by delivery status; it does require the destination webhook to exist and be Active. The UI permits the known backend delivery statuses for authorized roles, fetches fresh delivery and webhook details, and disables confirmation for inactive/suspended/missing destinations. Backend authorization and eligibility errors remain authoritative if state changes afterward.

The confirmation displays: “Replaying this delivery will send the webhook request again to the configured destination.” Only Confirm Replay sends a POST. A synchronous lock and disabled controls prevent repeated pending submissions. Returned failure/retry states are displayed without assuming Success. Both list and details are refreshed afterward. A detail-refresh failure after a completed replay is reported separately to avoid suggesting that replay did not happen.

## Sensitive data handling

- List/cache mapping drops raw payloads, headers, response bodies, tenant data, and unexpected DTO fields.
- Detail payload/header/body documents are sanitized before entering state. Sensitive key names are matched case-insensitively, including authorization, cookies, API keys, client secrets, tokens, passwords, HMAC/signing secrets and signatures. Header name/value arrays, nested objects/arrays, and nested JSON strings are handled.
- Bearer/JWT text and credential assignments in strings are redacted. Entire Authorization/Cookie/signature header lines are masked, including multi-cookie content.
- Non-JSON bodies are omitted with a security notice; no untrusted HTML is rendered. Structured JSON is formatted in bounded, scrollable text viewers.
- Copy Payload copies only the sanitized representation. No payload or secret is written to localStorage/sessionStorage or logs. The shared pre-existing authentication storage is unchanged.
- Delivery API errors are reduced to sanitized messages/status before entering query error caches; raw error payloads are not retained by the new service.

## Verification

- `npm run build`: **passed**, with the existing Vite bundle-size and html2pdf static/dynamic import warnings.
- `node tests/run-deliveries-ui.mjs`: **10 tests passed** for exact contracts, filtering/date bounds, summary semantics, security redaction, unavailable/error states, URL selection/reset/paging, DLQ, detail/copy behavior, confirmation/duplicate guards, authoritative replay status, inactive destinations and roles.
- `node tests/run-webhooks-ui.mjs`: **11 tests passed**. The placeholder navigation assertion was updated to verify the real filtered delivery request and actual screen instead.
- `node tests/run-integrations-ui.mjs`: **7 tests passed**; Integration code was not changed.
- Isolated Chrome browser verification used intercepted synthetic API responses for **every** API request. Verified navigation from Configuration to `?webhookId=7`, URL filter retention, formatted/redacted details, sanitized clipboard content, DLQ, exactly one confirmed mock replay, Retrying result, fresh details/list, and simulated network failure without an empty-state claim. No runtime exceptions occurred.
- Layout checks passed at desktop widths 1280/1366/1440/1920 using viewport/device scales equivalent to 100%/90%/80%/75% zoom, and widths 320/375/390/768. Rows were consistently approximately 61px, controls stayed within the page, and horizontal overflow was contained inside the table. These are zoom-equivalent emulations, not manual browser toolbar zoom tests.
- Visually inspected the desktop screenshot for theme, badges, summary cards, filters and compact table alignment.

## Pending live verification

The backend/ngrok outage is not a frontend failure. No base URL or backend code was changed. **No live API request, replay, or mutation was attempted.** All replay operations above used isolated mocks. Authenticated tenant data, live status totals, event catalog, persistence, and external replay delivery remain unverified until the backend is available and live testing is separately authorized.

No pull, commit, or push was performed.

## Files changed in Screen 4

Created:

- `src/pages/Webhooks/DeliveryHistory.jsx`
- `src/pages/Webhooks/DeliveryDetails.jsx`
- `src/pages/Webhooks/deliveryService.js`
- `src/pages/Webhooks/deliveries.css`
- `tests/deliveries.test.jsx`
- `tests/run-deliveries-ui.mjs`
- `docs/module-15-deliveries-verification.md`

Modified:

- `src/routes/AppRoutes.jsx` — replace placeholder route component.
- `src/pages/Webhooks/Webhooks.jsx` — remove placeholder export/unused imports; Configuration UI/actions unchanged.
- `tests/webhooks.test.jsx` — test navigation into the real filtered Delivery History screen.

Pre-existing uncommitted files from Screens 1–3 were preserved. No sidebar, authentication, shared API client, environment file, or backend changes were made for Screen 4.
