# Navbar notification bell: backend handoff

Status: frontend integrated with the implemented backend inbox APIs through the shared API client and VITE_API_BASE_URL. Public Swagger confirms all four endpoints at https://pediatric-astrology-outrank.ngrok-free.dev. Signed-in navbar verification returned an unread count of 0 and a successful empty inbox. Existing requirements below remain the contract reference; no backend files were edited during integration.

## Existing system and scope

The inspected `Backend/Billing.API/Controllers/NotificationsController.cs` exposes notification delivery history, retry, send-invoice, send-payment, send-quotation, send-credit-note and process-overdue under `/api/v1/notifications`. These are outbound delivery operations. They do not provide a per-user inbox or read status. Keep those existing contracts intact; the bell must never send email, retry delivery, or process overdue invoices simply because somebody opens it.

The bell is a personal in-app inbox available to authenticated users, independent of permission to manage email templates. Opening the dropdown does not mark anything read. Users can view All/Unread, page through results, refresh, mark one read, mark all read, and open an authorized related record. The badge is the server's total unread count across all pages, capped visually at 99+. No browser-local unread records or sample notifications are used.

## Required APIs (exact frontend integration contract)

All routes require normal bearer authentication and derive the recipient user from validated identity claims. Derive tenant scope from trusted claims/authorized tenant selection; never trust a requested recipient or arbitrary `X-Tenant-Id`. For SuperAdmin, validate selected tenant membership/access explicitly; do not default a personal inbox to tenant 1. Use current camelCase `ApiResponse<T>` envelopes. Successful write responses may instead be HTTP 204.

| Method and route | Input | Successful `data` |
|---|---|---|
| GET `/api/v1/notifications/inbox` | `unreadOnly=false`, `pageNumber=1`, `pageSize=20` | Page shape below |
| GET `/api/v1/notifications/inbox/unread-count` | None | `{ "unreadCount": 3 }` |
| PATCH `/api/v1/notifications/inbox/{id}/read` | `{}` | `true`, or HTTP 204 |
| PATCH `/api/v1/notifications/inbox/read-all` | `{ "throughCreatedAtUtc": "2026-11-03T10:00:00Z" }` | `true`, or HTTP 204 |

Example list response (illustrative contract, not seeded application data):

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": "123",
      "title": "Invoice overdue",
      "message": "Invoice INV-100 requires attention.",
      "createdAtUtc": "2026-11-03T09:00:00Z",
      "isRead": false,
      "action": { "module": "invoices", "entityId": "456" }
    }],
    "totalCount": 1,
    "pageNumber": 1,
    "pageSize": 20,
    "snapshotAtUtc": "2026-11-03T10:00:00Z"
  }
}
```

- IDs must be stable nonempty strings or numbers. `title`, `message`, `isRead`, and timezone-qualified ISO `createdAtUtc` are mandatory. Return plain text, never markup. Suggested maximum title/message lengths: 200/2000 characters.
- `action` is nullable. Supported action modules are `invoices`, `payments`, `customers`, `credit-notes`; their IDs must match `[A-Za-z0-9_-]+`. Frontend maps these to existing detail routes and checks existing view permissions. Other event types may be informational with `action: null`. Do not return arbitrary navigation URLs. Revalidate entity access at the destination API and suppress actions to deleted/inaccessible records.
- `totalCount` is the number of matching visible, unexpired recipient notifications for the current All/Unread filter. Badge count is a separate authoritative aggregate. Return the requested page number even if that page became empty, so the frontend can move to the new last page. Support bounded page sizes (frontend requests exactly 20).
- Sort newest first by immutable `createdAtUtc DESC, id DESC`; maintain a deterministic tie-breaker. Offset paging may shift under concurrent arrivals; no cross-request snapshot is assumed. `snapshotAtUtc` is server-generated on each list request and is only a bulk-read cutoff, not a pagination cursor.
- Mark-one-read must be idempotent and update only this tenant/user's receipt. Mark-all-read affects all this user's visible unread notifications, across every page, with `createdAtUtc <= throughCreatedAtUtc`, not just the 20 displayed. Use a server UTC cutoff from the list response, reject invalid/future cutoffs, and use consistent timestamps/transaction semantics so later arrivals stay unread.
- Return 400 for invalid input, 401 for expired/missing auth, 403 for denied inbox access, 404 for missing/not-owned notification IDs, and a consistent 5xx error envelope for failures. Do not leak another user's record existence. Honor request cancellation. Empty inbox: HTTP 200 with `items: []` and `totalCount: 0`, not 404.

## Persistence and delivery requirements

Implement an in-app notification entity and per-recipient receipt/read state, or an equivalent user-scoped table. Required fields: immutable notification ID, tenant ID, recipient user ID, event type, deduplication/event ID, plain-text title/message, nullable action module/entity ID, created-at UTC, nullable read-at UTC, and optional expires-at UTC. A shared event with multiple recipients still needs independent read receipts. Index tenant + recipient + creation order and tenant + recipient + unread state; enforce a unique event/recipient key.

Generate notifications from committed domain events using a transactional outbox or equivalent reliable mechanism. Duplicate retries must not create duplicate inbox entries. Define recipients explicitly by business responsibility and existing permissions, never broadcast every event to every tenant user.

| Event | Recipient rule to implement/confirm | Suggested action |
|---|---|---|
| Invoice becomes overdue | Assigned owner and permitted billing users; deduplicate per invoice/reminder cycle | Invoice detail |
| Payment recorded or payment fails | Invoice owner/permitted payment users; distinct event per payment/status transition | Payment or invoice detail |
| Credit note submitted/approved/rejected | Requester and authorized approver as applicable | Credit note detail |
| Export succeeds/fails | User who requested the export | Informational until an export destination is agreed |
| Delivery/webhook repeatedly fails | Authorized administrators responsible for delivery/integrations | Informational until a supported detail destination is agreed |

Recipient policy and rollout event selection are backend/product decisions; these events are not generated by the frontend. Respect revoked permissions, user deactivation, tenant deletion, retention and expiry. Set and document a retention duration (for example 90 days, subject to product agreement); count/list must exclude expired entries consistently.

## Frontend behavior already delivered

- Shared navbar bell, real unread count, 99+ badge, accessible dialog, keyboard Escape, outside-click dismissal, close button, focus restoration and exclusive behavior with the profile menu.
- Responsive scrollable dropdown; loading, true empty, unread-empty, error/unavailable, retry and mutation feedback states. Text renders safely as React text, with no HTML injection.
- All/Unread server filtering, page size 20, pagination and automatic page adjustment when unread items disappear. Read actions persist through the API and refresh authoritative list/count; no false optimistic success.
- Badge refresh every 60 seconds, open-list refresh every 30 seconds, refetch on window focus and manual refresh. Background-tab polling remains disabled. Polling pauses after an error until manual retry/focus; no SSE/SignalR dependency for this release.
- Query cache keys include tenant and user identity. Requests carry the existing API client's bearer/tenant handling; GET requests support AbortSignal. Existing protected-route login/logout clears query caches.
- Until the APIs exist: bell remains present; missing/invalid count shows no invented zero badge; opening it shows an unavailable state with retry. Outbound email history is not used as a fake inbox.

## Backend files/layers expected to need work (handoff only)

Add an inbox controller (or isolated inbox routes), application service/interface, DTOs/validators, domain notification/receipt entities, repository, EF mappings and migration, authorized recipient resolution, domain-event/outbox handlers and retention job. Add these through the team's normal backend process. None were changed in this task.

## Acceptance checks before enabling production notifications

1. Correct recipients receive exactly one item after a committed event; rolled-back transactions produce none; outbox retries do not duplicate.
2. Same user across two sessions shares persisted read status. Different users in one tenant have independent read status. Cross-user/cross-tenant IDs and unauthorized tenant headers cannot read or mutate another inbox.
3. Count is accurate across all pages/filters. Concurrent new arrivals after bulk-read cutoff remain unread. Repeating either PATCH is safe.
4. Empty inbox, invalid pages, expired auth, revoked permissions, deleted target records, cancellation and service failures have predictable responses.
5. Verify actual bell layout and keyboard/focus behavior on mobile/desktop, 0/1/99/100+ counts, long text, All/Unread, paging, read writes, errors and record navigation against the implemented service.

Frontend tests include isolated service/UI cases plus requests through the actual shared Axios interceptors using a test adapter. Live signed-in GET/count and empty-inbox rendering were verified. Real read/mark-all writes were not exercised because the current inbox is empty.
