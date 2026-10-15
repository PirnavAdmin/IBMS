# Webhook Configuration — implementation and verification

Implemented 15 October 2026. Scope is Screen 3 only. No pull, commit, or push was performed.

## Routes and scope

- `/webhooks`: protected configuration page with compact table, summary cards, search/status/event filters, server pagination, create/edit modal, details, enable/disable, test ping, rotate secret, and delete.
- `/webhooks/deliveries?webhookId={id}`: protected placeholder preserving the selected webhook ID. It explicitly displays no delivery records; history/replay is not implemented.
- Added Webhook Configuration to the existing sidebar and route-to-module mapping. Existing Integration List, registration, and client-secret components/services were not changed.

## Backend contracts inspected

Checked `WebhooksController`, `WebhookDtos`, `WebhookService`, `WebhookRepository`, shared `ApiResponse`/`PagedResult`, and the live Swagger document. Existing `apiClient` supplies `.env` base URL, JWT Bearer token, tenant header, and session-expiry behavior. Controller permissions match TenantAdmin, SuperAdmin, and User.

| Operation | Request / response |
| --- | --- |
| List | GET `/api/v1/webhooks`; `status`, `eventType`, `searchTerm`, `pageNumber`, `pageSize`; envelope `data` is the paged result |
| Event catalog | GET `/api/v1/webhooks/events`; array of `eventType`, `category`, `description`, `samplePayload`; UI groups returned events dynamically and does not invent an event catalog |
| Associated applications | GET `/api/v1/integrations`; searchable paginated lookup with Load More, retaining the existing application if absent from loaded pages |
| Create / edit | POST `/api/v1/webhooks`; PUT `/api/v1/webhooks/{id}`; exact body `{ applicationId, name, targetUrl, subscribedEvents, status }` |
| Details | GET `/api/v1/webhooks/{id}` |
| Status | PATCH `/api/v1/webhooks/{id}/toggle-status`, no body |
| Test ping | POST `/api/v1/webhooks/{id}/ping`, no body; inner `data.success`, `statusCode`, `latencyMs`, `message` describe the actual delivery result |
| Rotate | POST `/api/v1/webhooks/{id}/rotate-secret`, no body; raw secret is `data.newSecretKey` |
| Delete | DELETE `/api/v1/webhooks/{id}`; expects confirmed envelope data `true` |

The backend ping service returns outer `success: true` even when delivery fails. The frontend explicitly uses the inner delivery success boolean and never equates HTTP 200 with successful delivery.

`WebhookDto` supplies `applicationName`, `consecutiveFailureCount`, `lastTriggeredAtUtc`, and only a masked `secretKeyPreview`. Creation does **not** return an initial raw signing secret; the UI only presents raw secrets after an explicit rotation.

No aggregate endpoint exists. Summary uses four small paginated GETs (`pageSize=1`, unfiltered and each of Active/Disabled/Suspended) and reads backend `totalCount`; it never counts current-page rows. If any summary request fails, the cards are omitted and a retry message appears.

Suspended is displayed distinctly. The backend toggle implementation can reactivate any non-active webhook, but the DTO exposes no formal manual status policy. The UI conservatively treats Suspended as backend-managed: no manual toggle, and edits preserve Suspended. It does not map Suspended to Disabled.

## Validation, lifecycle, and safety

- Requires a nonblank name, HTTP/HTTPS URL, and at least one event. Existing subscriptions absent from the current catalog are displayed separately and preserved unless explicitly removed.
- Editing retains the associated application ID and subscriptions. Application lookup is optional and server-paginated.
- Requests are guarded against duplicate submissions; pending controls are disabled. Success/refresh happens only after confirmed API responses.
- Disable, delete, and rotation require confirmation. Ping also requires Send Test Ping and displays the actual status, latency, and result message.
- Raw rotated secrets live only in component state and are cleared when the one-time dialog closes/unmounts. They are never written to storage, logs, query caches, or mutation caches. DTO mapping excludes raw secret fields. Copy is an explicit user action.
- 400/401/403/404/409/422/500 errors are surfaced with validation messages where provided. Existing shared authentication and tenant behavior remain unchanged.

## Verification results

- Frontend production build passes. Existing Vite bundle-size and html2pdf static/dynamic import warnings remain.
- `node tests/run-webhooks-ui.mjs`: **11 passing tests** covering contract mapping, real count semantics, validation, dynamic grouped events, create, edit preservation, Suspended, failed/successful ping interpretation, rotation and secret cleanup, toggle/delete confirmation, filtering/paging, role/error states, and delivery-filter navigation.
- `node tests/run-integrations-ui.mjs`: **7 passing tests**, preserving existing Module 15 functionality.
- Isolated Chrome checks against the built app use intercepted test API responses, never production mutations. Verified routing, grouped catalog, create modal submission, failed-ping reporting, rotation/secret disposal, Bearer and tenant headers, and Delivery History placeholder navigation. No runtime exceptions were observed.
- Desktop widths 1280/1366/1440/1920 were tested at CSS viewport/device scales equivalent to 100%/90%/80%/75% zoom, plus mobile widths 320/375/390/768. No page-level horizontal overflow; table overflow is contained, controls stay within the page, summary cards are responsive, and rows remain consistent at approximately 61px. These are zoom-equivalent emulations rather than manual toolbar zoom tests.
- Visually inspected the desktop layout and corrected the Suspended badge column so the complete status remains readable.

## Live API results and unverified operations

Read-only checks used the existing `.env` base URL without printing tokens or credentials:

- GET Swagger: **200**, expected routes and DTO field names confirmed.
- GET `/api/v1/webhooks?pageNumber=1&pageSize=1` without credentials: **401**.
- GET `/api/v1/webhooks/events` without credentials: **401**.

No authenticated session or explicit permission for disposable live mutations was supplied. Live create, update, toggle, ping, rotate, and delete were **not run**. Those operations passed isolated contract/UI tests only. No live webhook endpoint was contacted by a ping, and no real record or secret was changed. Actual tenant data, production event-catalog contents, persistence, and receiver delivery remain unverified.

## Files changed for Screen 3

Created:

- `src/pages/Webhooks/Webhooks.jsx`
- `src/pages/Webhooks/WebhookEditor.jsx`
- `src/pages/Webhooks/webhookService.js`
- `src/pages/Webhooks/webhooks.css`
- `tests/webhooks.test.jsx`
- `tests/run-webhooks-ui.mjs`
- `docs/module-15-webhooks-verification.md`

Modified:

- `src/routes/AppRoutes.jsx`
- `src/layouts/AppLayout.jsx`
- `src/data/dashboardNavigation.js`

Existing uncommitted Integration module files from earlier work were preserved.
