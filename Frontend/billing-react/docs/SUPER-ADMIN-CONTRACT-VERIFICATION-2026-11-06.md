# Super Admin deployed contract verification — 6 November 2026

Result: PARTIAL / SETTINGS DEPLOYMENT BLOCKED. This is not a complete production QA pass.

## Live deployment and contract

Configured base URL: https://pediatric-astrology-outrank.ngrok-free.dev (existing frontend .env).
Public Swagger GET /swagger/v1/swagger.json: HTTP 200. Checked authenticated session: SuperAdmin + TenantAdmin. Read checks completed at 2026-11-06T11:44:15Z.

The latest deployed Swagger now includes PlatformSettingsDto.version and updatedAtUtc, UpdatePlatformSettingsRequest.version and expectedUpdatedAtUtc, and a settings PUT 409 response. These properties match checked-in Billing.Contracts/Platform/PlatformSettingsDtos.cs. This supersedes the earlier observation of an older Swagger contract. All five Platform API groups are present. Swagger reports only API version v1; no commit/build identifier is exposed. Source HEAD was 7a946f467a4ded06e81492076b44577bea553dfa. Exact deployed binary/source parity is unverified.

| Module | Deployed contract | Frontend compatibility | Verification | Remaining issue |
|---|---|---|---|---|
| Platform Dashboard | GET /api/v1/platform/dashboard, 200 | Existing metric mapping retained | Authenticated live GET PASS; 5 total / 5 active / 0 suspended / 0 inactive tenants; 11 total users | Dashboard activity statuses remain server-reported; no live mutation provenance proof |
| Tenant Management | GET /api/v1/platform/tenants and /tenants/5, 200; create idempotencyKey, edit expectedUpdatedAtUtc, status/reason schemas present | Existing DTO mapping, stable retry key, original timestamp forwarding retained | Live list/detail/back navigation PASS; focused concurrency/idempotency/error tests PASS | Tenant 5 returns updatedAtUtc:null, so no effective timestamp precondition for this existing record; live replay/race tests NOT EXECUTED |
| Platform Users | GET /api/v1/platform/users and /roles, 200 | Existing default SuperAdmin directory scope retained | Authenticated live GET PASS; 1 platform-admin result, distinct from 11 total platform accounts | Live role/account mutations and negative-account security tests NOT EXECUTED |
| Platform Audit Logs | GET /api/v1/platform/audit, 200; actorUserId/actorRole/correlationId/resultStatus available in schema | Details expose provenance; incomplete provenance displays Unknown while preserving Reported Result | Live records/detail rendering PASS; 20/20 sampled rows lack actor ID/role/correlation | Latest sampled records are automated UserSession mutations, not proof of post-remediation admin writes; backend provenance incomplete for these records |
| Platform Settings | Swagger supports new concurrency fields; authenticated GET returns 500 on initial request and recheck | Editor/adapter concurrency integration deliberately deferred pending a successful live GET with original tokens | BLOCKED; shared server error UI rendered correctly | Cannot confirm live version/updatedAtUtc, persistence, restart behavior or enforcement; do not submit unsupported/unverified preconditions |

No live settings saves, tenant creates/edits/status changes, role assignments, DB resets or database inspection/writes were performed.

## Environment identity

This remote deployment still reports 5 tenants / 11 users. The backend team's reported QA used local MySQL database invoice with 2 tenants / 13 users. These are different observed dataset profiles; neither Swagger nor Platform responses expose a database/server/build identity that proves their relationship. They may be separate environments or snapshots. No records are assumed deleted. Exact database identity and remediation build correlation require backend deployment evidence.

## Source verification (backend read-only)

- Settings are represented by PlatformSetting and BillingDbContext.PlatformSettings; the administration service queries database state, not static in-memory configuration. This is source evidence only, not proof the deployed migration is applied. Settings GET 500 needs server-side exception/migration investigation; its cause was not inferred from the HTTP status.
- PlatformAdministrationService.cs:1003 checks ExpectedUpdatedAtUtc before update; :1050 generates the next stored Version. In the checked-in service, request.Version is not checked. PlatformSetting has no concurrency annotation and no PlatformSetting IsConcurrencyToken mapping was found in BillingDbContext. An application-level timestamp precheck alone does not establish atomic concurrent-writer safety. P0 backend concurrency assurance remains open.
- Settings update code uses a relational transaction and records an audit entry with actor fields; actual commit/audit atomicity on the deployed database remains unverified. No live writes were executed.
- Tenant create code looks up a stored IdempotencyKey and rejects reuse with a mismatched payload; tenant edit forwards an expected timestamp into EF OriginalValue. This is source inspection, not proof of a live MySQL replay/race result.
- PlatformMaintenanceMiddleware consumes MaintenanceMode, and platform provisioning consumes password rules. Full security/session/registration policy enforcement has not been established end-to-end.
- All five platform controllers use SuperAdminPolicy; Backend/Program.cs:397-400 requires the exact SuperAdmin role. No frontend role/permission rules were changed.
- The available PlatformRemediationIntegrationTests uses EF InMemory for its simulated restart check. Its LiveAuthorization_NonSuperAdminRoles_ForbiddenFromPlatformAdminApis test constructs a controller/principal and checks authorization attributes; it is not an actual HTTP negative-role request. The reported 510/510 PASS and new HTTP/MySQL remediation evidence were not independently provided or reproduced.

## Frontend changes and regression verification

Modified:
- src/pages/Platform/PlatformAudit.jsx: show Actor User ID and Actor Role; retain Correlation ID even when unknown; label an incomplete-provenance outcome Unknown, retain the raw Reported Result, and use existing date formatting.
- tests/platform-ui.test.jsx: regression coverage for unknown audit provenance, preserved reported outcomes, original seven-digit tenant timestamp forwarding and successful query invalidation.
- docs/SUPER-ADMIN-CONTRACT-VERIFICATION-2026-11-06.md: this report.

No settings adapter/editor fields were added while live settings GET is failing. Existing tenant navigation, Invoice/Payment/Customer/Product modules, financial logic, layout and responsive styles are unchanged. Existing settings text claiming restart volatility was not reworded as a persistence guarantee without live evidence.

| Check | Result |
|---|---|
| node tests/run-platform-ui.mjs | PASS 37/37 |
| node tests/run-navbar-module-search.mjs | PASS 8/8 |
| node tests/run-auth-forms.mjs | PASS 7/7 |
| node tests/run-protected-routes.mjs | PASS 18/18 |
| Production Vite build | PASS; existing >500kB chunk warning |
| git diff --check | PASS |
| Exact five platform menus; dual-role workspace priority | Automated PASS; authenticated platform navigation observed |
| TenantAdmin/BillingManager/Accountant/Viewer menus and platform route denial | Automated PASS; live negative-account testing NOT EXECUTED, no authorized accounts supplied |
| Cache separation by user/tenant/session | Automated PASS; no live account switch tested |
| Responsive regression | No layout/CSS changes; full four-width browser sweep NOT EXECUTED in this contract check |
| Live mutations, restart persistence, real concurrency races | NOT EXECUTED (explicit scope restriction) |

Tests use isolated test fixtures only; no application records were created. Frontend tests do not establish backend HTTP authorization or production persistence.

## Remaining priorities

- P0 Backend: verify atomic settings concurrency, including actual Version validation and database compare-and-swap/concurrency-token enforcement. Supply real HTTP role-negative evidence and relational persistence/concurrency evidence.
- P1 Deployment: fix settings GET 500 and provide a successful token-bearing response. Then complete settings editor token capture, 409 reload/review flow and regression tests against the confirmed deployed response.
- P1 Backend: confirm timestamp strategy for existing tenants returning null; complete provenance for relevant new administration/audit events; correlate deployed build and database environment.

Evidence artifacts (outside repository): C:/Users/Admin/Documents/ChatGPT/IBMS 3/platform-contract-final-qa contains swagger-live.json, live-summary.json, audit-provenance.png, test logs and build.log. No auth tokens or request credentials were exported.
