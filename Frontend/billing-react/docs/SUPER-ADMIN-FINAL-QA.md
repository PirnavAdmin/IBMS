# SuperAdmin final integration QA — 4 November 2026

**Disposition: NOT a full live QA PASS.** Authenticated reads and the exercised UI flows pass. P0 backend settings deficiencies remain. Live mutations and negative-role API tests were NOT EXECUTED.

## Module results

Endpoints below use `/api/v1/platform/` and the existing configured authenticated client. Status evidence comes from browser CDP XHR responses; 204 CORS OPTIONS responses were excluded.

| Module | GET verification | UI | RBAC | Mutation | Remaining issue |
|---|---|---|---|---|---|
| Platform Dashboard | GET dashboard: 200, authoritative metrics rendered | Cards/status counts match; recent records rendered | Dual-role SuperAdmin live; negative roles source/tests only | N/A | TotalPlatformUsers counts all accounts, not only SuperAdmin |
| Tenant Management | GET tenants: 200, 5 records; search/status/page-size responses verified | Search Nexify → 1; Inactive → 0; restore → 5; detail/back works | Same | NOT EXECUTED | P1 backend idempotency and concurrency gaps |
| Platform Users | GET users + roles: 200; default SuperAdmin scope 1 account; 8 role options | Natural empty search, page-size request, keyboard action menu and role dropdown/cancel pass | Same | NOT EXECUTED | Negative-account API verification unavailable; live write success unverified |
| Platform Audit Logs | GET audit: 200, 20 records; page 2: 200; actor/action filters verified | Page changes, empty state, reset and detail dialog pass | Same | Read-only | P1 outcome/actor/correlation integrity gaps |
| Platform Settings | GET settings: 200, all contract fields rendered | Four grouped sections render; no saves attempted | Same | NOT EXECUTED | P0 persistence/enforcement; P1 concurrency |

Dashboard response: totalTenants=5, activeTenants=5, suspendedTenants=0, inactiveTenants=0, totalPlatformUsers=11. Tenant list totalCount=5 and all five returned tenants are Active. These counts match. Backend `GetDashboardSummaryAsync` counts all Users for TotalPlatformUsers; the default SuperAdmin directory count of 1 is a different scope, not a data mismatch.

Server paging: tenant and user `pageSize=5` requests returned 200 with matching page metadata. These filtered directories currently fit on one page, so actual next-page behavior could not be exercised there. Audit `pageNumber=2&pageSize=20` returned 20 IDs and the UI displayed 21–40. Audit totalCount changed during the session (17,769 in initial capture, 17,783 in page-2 capture); it is live data, not a fixed fixture.

## Findings

### P0 Security/Backend — settings are not durable or authoritative security controls

Checked-in evidence:

- `Backend/Billing.Infrastructure/Services/PlatformAdministrationService.cs:814` defines static `_cachedSettings`; GET at line 830 copies it. No database settings persistence exists on this code path.
- PUT at line 852 replaces the object inside an in-process lock; defaults are initialized again on process start. Restart survival therefore fails by source design. No restart was performed.
- `AuthService.cs:180` and `:351` derive expiry from `_jwtSettings.SessionTimeoutMinutes`, not PlatformSettings. Searches for `GetPlatformSettingsAsync` find only the service/controller/interface path, not enforcement consumers. Maintenance/self-registration/password flags are stored but not enforced by relevant services through this object.

Release blocker: backend needs durable storage and actual policy consumers. Successful GET/PUT contracts alone do not establish security-policy enforcement. No live settings were changed to test this.

### P1 Functional/Backend — settings concurrency and audit atomicity

`PlatformSettingsDtos.cs` has no expected-version/ETag/row-version field. `_settingsLock` serializes assignment within one process but does not detect stale client edits or coordinate multiple instances. Last writer wins. Settings memory is changed before audit persistence; the audit is written outside the lock using the shared current object (`PlatformAdministrationService.cs:864–897`). This can also produce inaccurate audit content under concurrent writes or leave changed memory after an audit-write failure. No concurrent live writes were attempted.

### P1 Functional/Backend — audit outcome and attribution are incomplete

Live sample: 20/20 records contain actorUserName, action, entityType/entityId, tenantId, timestamp and resultStatus. 0/20 contain actorUserId, actorRole or correlationId. All resultStatus values are Success. Timestamp strings in the captured sample contain explicit timezone information.

`PlatformAdministrationService.cs:773–796` does not populate actor ID/role/correlation and sets `ResultStatus = "Success"` at line 788. Thus the response cannot prove an action actually succeeded. The UI currently displays the backend-reported value; this report does not treat it as a verified outcome. Backend must return real outcome and attribution/correlation metadata.

### P1 Functional/Backend — tenant idempotency/concurrency are incomplete

Frontend retains one idempotency key per create dialog and sends the original expectedUpdatedAtUtc on edit (`PlatformTenants.jsx:10–12`). The tenant DTO declares IdempotencyKey at `PlatformTenantDtos.cs:86`, but the platform creation controller/service does not consume it; request replay is not truly idempotent. Duplicate tenant-code validation is not equivalent to replaying the original successful response.

Tenant edit concurrency (`PlatformAdministrationService.cs:321–327`) is optional and accepts timestamp differences up to one second; it is an application read/check/update, not a database compare-and-swap version operation. This is not reliable protection against close concurrent writes. No live mutation or race test was performed.

### P2 UI/UX — fixed in this QA pass

Platform horizontal table wrappers were not keyboard focus targets. Added named region + tabIndex=0 and a visible focus outline. Live mobile ArrowRight check moved scrollLeft from 0 to approximately 18.4px, retained focus on the region and showed a solid outline.

No redesign, new modules or tenant-navigation changes were made.

## Security verification and explicit limits

- Existing authenticated browser: SuperAdmin + TenantAdmin dual-role session confirmed; intended five platform menus observed.
- All five backend controllers require SuperAdminPolicy; `Backend/Program.cs:382–385` requires authenticated exact SuperAdmin role. Frontend PlatformRoute uses the same exact role; a permissions wildcard alone is insufficient.
- TenantAdmin/BillingManager/Accountant/Viewer route/navigation behavior is covered by isolated tests. No authorized negative-role account/session was supplied, so negative-role live route/API tests are NOT EXECUTED. No permissions, tokens or credentials were fabricated/modified.
- Platform query keys include authenticated user, tenant context and session epoch. ProtectedRoute clears caches on session validation. Tests cover distinct keys, stale-session submit rejection and platform-only invalidation while preserving unrelated cache fixtures. These are source/automated checks, not a live multi-account leakage proof.
- Client TenantId is not an authorization credential: platform controllers require the signed-in SuperAdmin policy independently. Tenant filters/assignment IDs remain server-authorized inputs. Live forged-header/privilege-escalation tests were NOT EXECUTED.
- Captured retained platform request methods were GET/OPTIONS, with no POST/PUT/PATCH/DELETE. The CDP buffer later reported truncation; request-method evidence is not represented as a complete immutable network audit. The executed UI workflow did not submit any mutation form.

## UI and state verification

All five real-data screens checked at 390/768/1024/1440px: 20 layout checks, no horizontal page overflow. Tables retain internal horizontal scrolling. Sidebar/logo text, KPI alignment, status/role chips, date presentation, table frames and grouped settings were visually inspected. The role menu opened with Enter; all 8 dropdown roles were visible; Cancel restored focus to Actions for Sandeep. Tenant detail Back to Tenants works.

Natural empty states were verified live through tenant Inactive filter, unmatched user search and an unmatched audit action. Loading/error/retry states and 401/403/404/409 mapping are covered by source/component tests. Live service failures/session expiry were not deliberately induced, so those live paths remain NOT EXECUTED. Settings/dashboard have no list search/pagination controls by contract.

## Mutation review — no live mutations

Frontend duplicate-submit lock, stable tenant-create idempotency key, browser-required fields, backend validation-error presentation, retained input after 409, scoped query invalidation and stale-session guards were inspected/tested. API adapters preserve tenant concurrency tokens. Audit behavior is a backend responsibility; the issues above prevent asserting audit integrity. Actual tenant/user/status/roles/settings write success is NOT EXECUTED until explicitly authorized in a disposable QA environment.

## Checks and exact changes

- 22 focused platform tests PASS.
- 18 existing protected-authentication tests PASS.
- Production build PASS (existing PDF chunk-size warning only).
- git diff --check PASS; no backend diff from this task.

Changed for THIS QA pass only:

1. `Frontend/billing-react/src/pages/Platform/PlatformShared.jsx:41` — focusable, named horizontal table region.
2. `Frontend/billing-react/src/pages/Platform/platform.css:40` — focus-visible outline.
3. `Frontend/billing-react/tests/platform-ui.test.jsx` — accessibility, changed-session submission and scoped invalidation regression tests; test helper exposes its QueryClient.
4. `Frontend/billing-react/docs/SUPER-ADMIN-FINAL-QA.md` — this report.

Prior working-copy edits were preserved. No backend, financial logic, business modules or tenant-user navigation changed.

Evidence directory: `C:/Users/Admin/Documents/ChatGPT/IBMS 3/platform-final-qa/`

- `api-evidence.json`: actual 200 envelopes, field names, counts and audit-field presence summary; no auth headers/tokens saved.
- `interactions.json`: real search/filter/pagination GET parameters, HTTP status, totals and record IDs.
- `layout-evidence.json`: all 20 responsive geometry checks.
- `request-methods.json`: retained request methods/paths (buffer limitation above).
- `platform-tests.log`, `auth-tests.log`, `build.log`.
- Module screenshots at 1440px; mobile keyboard scrolling was additionally inspected live.
