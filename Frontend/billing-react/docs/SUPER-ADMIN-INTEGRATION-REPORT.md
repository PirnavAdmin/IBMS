# Super Admin integration report — 4 November 2026

> Latest live review: the original 404 deployment blocker is now resolved for GET operations. See [Platform UI review](PLATFORM-UI-REVIEW.md) for current successful live checks and UI improvements. The findings below record the initial integration audit.

Status: frontend implementation completed against the checked-in contracts; full live integration remains BLOCKED by the configured backend deployment. Limitations below are documented, not assumed approved.

## A. Existing implementation and audit inventory

The existing React shell, DashboardSidebar, DashboardHeader, authenticated Axios client, permission helpers, ProtectedRoute, QueryClient, business Dashboard, UserRoleAdministration, AuditActivity and tenant Settings were inspected. No dedicated platform frontend screens/services or tenant-management frontend were present. The old SuperAdmin experience used the tenant dashboard and received all tenant navigation through the existing administrator permission shortcut. These tenant screens and their routes remain in place.

Backend reviewed READ-ONLY: five controllers under Backend/Billing.API/Controllers/Platform; Platform DTOs; PagedResult; SuperAdminPolicy in Program.cs; PlatformAdministrationService; platform audit repository; AuthController; user administration contracts. Role names SuperAdmin/TenantAdmin and BillingManager/Accountant/Viewer seed migrations were checked. SuperAdminPolicy requires the exact SuperAdmin role; a permissions wildcard alone does not grant platform frontend access.

| Module | Before | Source backend | Implementation action |
|---|---|---|---|
| Platform Dashboard | Tenant business Dashboard only | PlatformDashboardController / PlatformDashboardDto | Separate platform content in the same shell; authoritative metrics only |
| Tenant Management | No dedicated frontend | PlatformTenantsController / PlatformTenantDtos | List, detail, create/edit/status forms and paginated API integration |
| Platform Users | Tenant UserRoleAdministration existed | PlatformUsersController / PlatformUserDtos | Reuse existing shell/service patterns; separate platform-authorized directory |
| Platform Audit Logs | Tenant AuditActivity existed | PlatformAuditController / PlatformAuditDtos | Read-only platform API directory, filters, local detail dialog |
| Platform Settings | Tenant settings existed | PlatformSettingsController / PlatformSettingsDtos | Genuine platform configuration only |

## B. Navigation and access

SuperAdmin primary navigation now contains exactly: Platform Dashboard; Tenant Management; Platform Users; Platform Audit Logs; Platform Settings. A user with both SuperAdmin and TenantAdmin roles gets the platform experience.

Hidden ONLY from SuperAdmin default sidebar: Invoices, Quotations, Payments, Customers, Products & Services, Credit Notes, Background Jobs, Export Jobs, Templates & Branding, tenant Audit Log, Integrations, Webhooks, Users & Roles, tenant Settings. Tenant operational source files, endpoints, permissions and deep links are preserved. No tenant impersonation or tenant-context switch was implemented. TenantAdmin/BillingManager/Accountant/Viewer still use the existing permission-filtered tenant navigation.

Login destination helper routes SuperAdmin to /platform/dashboard; tenant users to /dashboard. The authenticated /dashboard route also redirects an existing SuperAdmin session to the platform Dashboard without fetching tenant financial metrics. Existing ProtectedRoute server validation remains authoritative. New platform routes require the verified exact role. The navbar Settings shortcut is platform-specific for SuperAdmin; the tenant notification-settings shortcut stays available only in tenant mode.

Platform query keys isolate authenticated user, tenant context and session epoch; raw tokens are not query-key data. Existing ProtectedRoute cache clearing on token validation remains unchanged. Query requests propagate AbortSignal. Mutation dialogs reject a changed session, lock duplicate submissions, preserve values on errors and invalidate platform queries after successful server writes.

## C. Integration status and contract gaps

All paths below are relative to the existing environment-configured authenticated API client. No backend URL was added to application code.

| Module | Verified checked-in endpoints | Frontend | Authenticated browser result | Blocker |
|---|---|---|---|---|
| Platform Dashboard | GET /api/v1/platform/dashboard | Integrated DTO metrics, recent tenants/events, status definitions and quick links | Opened as SuperAdmin; 404 | Endpoint absent from deployed OpenAPI |
| Tenant Management | GET/POST /api/v1/platform/tenants; GET/PUT /{id}; PATCH /{id}/status; backend also has GET /{id}/admins | List/search/status/server paging; detail includes assignedAdmins; create/edit/status integrated | List opened; 404. Detail and writes not live verified | Platform endpoints not deployed |
| Platform Users | GET/POST /api/v1/platform/users; PATCH /{id}/status; POST /{id}/roles; PUT /{id}/assignment; GET /api/v1/platform/roles | Default SuperAdmin scope; explicit cross-tenant directory option; server filters/paging, create, status, role replacement, TenantAdmin assignment | Users and roles requests unavailable; 404 | Platform endpoints not deployed |
| Platform Audit Logs | GET /api/v1/platform/audit | Actor/action/entity/tenant/date filters, server paging, details from returned record; read-only | Opened; 404 | Platform endpoint not deployed |
| Platform Settings | GET/PUT /api/v1/platform/settings | Genuine platform fields and update DTO; no tenant tax/country/numbering/template settings | Opened; 404 | Platform endpoint not deployed; persistence/enforcement gaps below |

Deployed Swagger was fetched from the configured backend on 4 November 2026. It contains no /api/v1/platform/* routes. Its only platform-named route is GET /api/Auth/platform-dashboard. Checked-in AuthController shows that legacy route returns a welcome message and role only, not metrics, so it is not used as a misleading fallback. All five real browser screens correctly expose the 404 error rather than dummy records or zero-valued cards.

Additional source-contract limitations:

- Tenant list has no sorting parameter. No misleading sort UI or page-local sorting is offered; backend ordering is retained.
- Tenant list DTO has no assigned-admin field; administrators are displayed on tenant detail from assignedAdmins. Details have counts/metadata but no dedicated tenant configuration-summary endpoint. No invoices, customer records or payments are fetched for a tenant detail view.
- Tenant edit sends expectedUpdatedAtUtc unchanged, including the server's full timestamp precision. Status changes require a minimum five-character reason. Create requests retain a single idempotency key across retries. Optional contact fields serialize as null when blank. Duplicate/409 errors retain input.
- User endpoint explicitly authorizes cross-tenant directory access. Default role is SuperAdmin; cross-tenant scope is an explicit selector option. Platform roles come from the backend. No dedicated platform user profile-edit PUT exists; status/roles/assignment are integrated instead. User creation requires a manually entered masked password by contract; passwords are not generated, listed, logged, persisted to localStorage or sent outside the create request. No invitation-without-password contract was found.
- Audit detail uses data from the paged response: no separate detail endpoint exists. The platform repository defines a platform-wide authorized audit scope. ActorUserId, ActorRole and CorrelationId exist in DTO but are not populated by the current service; ResultStatus is currently set to Success by that service. UI does not invent those missing values. Backend should populate real actor/correlation/outcome metadata.
- Platform settings are backed by a static in-memory _cachedSettings object. They may reset on restart and are not a durable multi-instance configuration store. The UI discloses this limitation. Session expiry in AuthService uses JwtSettings, not this object; full enforcement of the displayed operational/security settings must be confirmed/implemented by backend. No claim of live security-policy enforcement is made. No optimistic-concurrency token exists for the settings PUT.

Required backend next step: deploy/expose the checked-in Platform controllers and service implementation at the configured base URL, verify SuperAdminPolicy, then repeat authenticated read verification and explicitly authorized disposable tenant/user write tests. Confirm settings durability/enforcement and fill audit metadata gaps. No backend files were changed for this task.

## D. Exact frontend code changes

Modified existing files (paths relative to Frontend/billing-react):

- src/components/dashboard/DashboardSidebar.jsx — role-specific navigation data; existing sidebar/keyboard behavior reused; dark-surface logo contrast.
- src/components/dashboard/DashboardHeader.jsx — platform Settings shortcut; tenant notification shortcut hidden only in platform mode.
- src/layouts/AppLayout.jsx — platform route-to-active-menu mapping and scoped theme class.
- src/pages/Login/Login.jsx — role-aware success destination.
- src/routes/AppRoutes.jsx — lazy platform pages and dedicated role guard; tenant route preservation.

New files:

- src/pages/Platform/platformAccess.js — verified role check, five menu definitions, login destination.
- src/pages/Platform/platformService.js — authenticated endpoint adapters, envelope/pagination validation, errors.
- src/pages/Platform/PlatformShared.jsx — shared platform content controls, scoped queries, mutation dialog, pagination/table wrappers.
- src/pages/Platform/PlatformRoute.jsx — exact-role guard and DashboardEntry redirect.
- src/pages/Platform/PlatformDashboard.jsx — authoritative non-financial overview.
- src/pages/Platform/PlatformTenants.jsx — list/detail/editor/status.
- src/pages/Platform/PlatformUsers.jsx — platform-authorized user management.
- src/pages/Platform/PlatformAudit.jsx — read-only audit filters/detail.
- src/pages/Platform/PlatformSettings.jsx — source-supported platform configuration.
- src/pages/Platform/platform.css — responsive content styles and SuperAdmin-only cappuccino palette; shell geometry unchanged.
- tests/platform-ui.test.jsx — focused platform integration/RBAC/error/cache tests; fixtures are test-only.
- tests/run-platform-ui.mjs — existing esbuild/JSDOM test runner pattern.
- docs/SUPER-ADMIN-INTEGRATION-REPORT.md — this audit and verification report.

Reused: AppLayout, DashboardSidebar, DashboardHeader, authenticated apiClient, ProtectedRoute, QueryClient, useCurrentUser, useSearchDebounce, WorkspacePagination, existing permission names, MUI controls/dialogs, existing font/date conventions. Prior UI fixes and unrelated working-copy edits were preserved.

## E. Verification

- Platform tests: 17 PASS (role/login destination, five-item sidebar, all four tenant roles, route denial, endpoint/DTO mapping, mutation adapters, 401/403/404/409 handling, cache separation, directory empty/error/loading states, duplicate locks, tenant concurrency, nullable creation fields/idempotency, user directory default scope, read-only audit details and settings update mapping).
- Existing navbar/notifications/profile/logout regression tests: 16 PASS.
- Existing protected-session tests: 18 PASS.
- Existing customer/product navbar-search and customer sorting regression tests: 5 PASS.
- Total focused automated checks: 56 PASS. These isolated tests do not prove deployed API success.
- Production build: PASS; existing PDF bundle-size warning remains.
- git diff --check: PASS. Backend diff: empty.
- Browser: authenticated SuperAdmin with SuperAdmin + TenantAdmin roles confirmed. /dashboard resolved to /platform/dashboard. Exactly five platform sidebar entries confirmed. Every primary platform page opened.
- Responsive browser QA: all five screens checked at 390, 768, 1024 and 1440 pixels (20 checks); no horizontal page overflow in available error-state layouts. Sidebar uses existing desktop/mobile behavior. Viewport override reset afterward.
- Real authenticated API-backed record display/search/filter results: BLOCKED by deployed 404s. No records were fabricated; no financial aggregation was performed. Data-rich table layouts cannot be live verified until endpoints are deployed.
- Real tenant/user create/edit/activate/suspend/role assignment and platform settings changes: NOT EXECUTED, as live write-test authorization was not provided.
- Login form submission was not repeated because the user supplied an existing authenticated SuperAdmin session. Destination behavior is automated-tested, and existing-session dashboard redirect was observed live.

Evidence/logs: C:/Users/Admin/Documents/ChatGPT/IBMS 3/platform-stage contains tests.log, navbar-regression.log, auth-regression.log, tenant-search-regression.log, build.log, deployed-contract-check.json, all-screen-qa.json and viewport screenshots. platform-dashboard-desktop.png shows the five-item platform navigation and the genuine deployed API blocker.
