# Module 15 frontend verification

Implemented on 15 October 2026. No commit or push performed.

## Scope

`/integrations` uses the existing protected application layout, header, sidebar, MUI theme, shared API client, JWT and tenant headers, and FeedbackSnackbar. `/integration-settings` redirects to it.

Includes the application list, registration modal, one-time secret dialog, feature flag modal, and the requested list actions: details, edit, status changes, and delete. No webhook configuration, delivery logs, replay, or other Module 15 screens were added.

## Verified contracts

Inspected `IntegrationsController`, `IntegrationApplicationDtos`, `IntegrationApplicationService`, `IntegrationApplicationRepository`, `ApiResponse`, and `PagedResult`, plus the live Swagger schema.

- List: `GET /api/v1/integrations` with `status`, `searchTerm`, `pageNumber`, `pageSize`. Envelope: `{ success, message, data }`; paged data: `{ items, totalCount, pageNumber, pageSize, totalPages, hasPreviousPage, hasNextPage }`.
- Details: `GET /api/v1/integrations/{id}`.
- Registration: `POST /api/v1/integrations`, body `{ name, description, featureFlags }`; credentials are `data.clientId` and `data.clientSecret`.
- Edit: `PUT /api/v1/integrations/{id}`, body `{ name, description, featureFlags, status }`.
- Feature flags: `PATCH /api/v1/integrations/{id}/feature-flags`, body `{ featureFlags }`. The backend replaces the dictionary, so the UI preserves all existing keys and values, including custom flags.
- Status: `PATCH /api/v1/integrations/{id}/toggle-status`, no request body.
- Delete: `DELETE /api/v1/integrations/{id}`; successful envelope data is `true`.
- DTO provides `webhooksCount` and `createdAtUtc`; the UI does not fabricate either. Missing values display “Not provided.”
- All controller actions authorize `TenantAdmin`, `SuperAdmin`, and `User`. The frontend uses the same roles and never supplies a tenant identifier in application request bodies.

Feature flags are an arbitrary boolean dictionary, with no discovery endpoint or backend-enforced whitelist. Registration exposes the requested `AllowAutoReplay`, `SyncInvoices`, and `BetaV2Api` keys, which are also exercised by the backend unit tests. The backend separately supplies `allowWebhooks`, `enableAutoSync`, and `readOnlyAccess` defaults. Management displays current returned keys plus the three requested keys; absent flags are not silently enabled.

## Secret lifecycle

Registration is called imperatively, outside React Query queries/mutations and form draft persistence. Only a local credentials state holds its returned secret. Closing/unmounting the dialog removes the credential state and field. List/detail response mapping uses an explicit allow-list that excludes credentials. No production code writes raw secrets to storage, logs, or query/mutation caches. Clipboard writes occur only through the explicit copy buttons.

## Automated verification

- `npm run build` in `Frontend/billing-react` passes. Vite reports bundle-size and the existing html2pdf static/dynamic import warnings.
- `node tests/run-integrations-ui.mjs`: 7 tests pass. Tests cover exact endpoint and body mapping, pagination, safe response mapping, role restrictions, 400/401/403/404/500 errors, registration validation, pending submissions, one-time credentials, clipboard button behavior, no secret persistence/caching, fresh application details, flag preservation, edit, disable/delete confirmation, server-side search/status/paging, and empty/error states.
- Isolated Chrome checks against the built app use intercepted synthetic API responses, not production data. Confirmed protected route mounting, sidebar selection, legacy redirect, registration-to-secret transition, secret removal, feature flag saving, JWT Authorization header, tenant header, and no runtime exceptions.
- Responsive checks: desktop widths 1280/1366/1440/1920 at effective CSS viewports and device scales corresponding to 100%/90%/80%/75% zoom; mobile widths 320/375/390/768. No document/panel horizontal overflow, out-of-bounds controls, or overflowing table cells. These are browser viewport/scale emulations, not manual browser toolbar zoom tests.
- Visually inspected desktop and tablet screenshots. Narrow layouts convert rows to application cards and stack filters; all flag names/client IDs wrap instead of being ellipsized.

## Live backend verification and limits

Read-only checks use `VITE_API_BASE_URL` read from the existing `.env`, without printing credentials or changing configuration.

- `GET /swagger/v1/swagger.json`: **200**. Published integration paths and DTO property names match the implementation.
- `GET /api/v1/integrations?pageNumber=1&pageSize=1` without credentials: **401**, confirming the endpoint is reachable and requires authentication.
- An authenticated backend session was unavailable. Actual authenticated tenant data, registration, edit, flag persistence, toggle, and delete were **not verified against the live backend**. Those behaviors were checked with automated contract/UI tests and isolated browser interception only. No live application was created or modified.
- Native clipboard permission behavior was simulated in automated tests; actual clipboard access depends on browser permissions and a secure context.

## Files

Created:

- `src/pages/Integrations/Integrations.jsx`
- `src/pages/Integrations/IntegrationDialogs.jsx`
- `src/pages/Integrations/integrationService.js`
- `src/pages/Integrations/integrations.css`
- `tests/integrations.test.jsx`
- `tests/run-integrations-ui.mjs`
- `docs/module-15-frontend-verification.md`

Modified:

- `src/routes/AppRoutes.jsx`
- `src/layouts/AppLayout.jsx`
- `src/data/dashboardNavigation.js`
