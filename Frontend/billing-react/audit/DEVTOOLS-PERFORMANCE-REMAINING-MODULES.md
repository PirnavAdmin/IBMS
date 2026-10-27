# IBMS DevTools performance audit — remaining modules

Date: 27 October 2026. Audit only. Scope excludes Invoices: the user reports that its trace has already been recorded. That trace was not reanalysed or used to predict other modules. A bounded filename search in the project's audit folder did not locate a HAR/Performance trace for reuse; the user-reported Invoices recording is not disputed.

**Measurement attempt blocked: no actual runtime samples were captured.** This is an evidence-availability report, not a completed performance baseline or a performance PASS.

## Current capability verification

The existing authenticated in-app browser binding was reused. Current supported capability enumeration returned:

- Tab: `pageAssets`, `webmcp`.
- Browser: `visibility`, `viewport`.
- No exposed network tracing, Performance recording, React profiler, cache controls or Web Vitals API.

The supported scoped Performance read had previously failed with `performance is undefined`; it was not repeated. The previous Windows fallback stopped because the current browser URL could not be verified. No new evidence indicates that restriction has cleared; no alternate native/remote-debugging route was used. No browser navigation/reload was performed just to obtain controller timing. No authentication state, application/backend source or business records were changed. No financial, export, notification or configuration writes were triggered. No tokens, cookies, credentials or customer records were extracted.

## Requested comparison

NM = **NOT MEASURED**. Samples are successful warm-navigation/reload recordings, not capability checks.

| Module | Samples | UI Settle Time | API Count | Median API Duration | Slowest API | JS/Main Thread | LCP | CLS | Bottleneck |
|---|---|---|---|---|---|---|---|---|---| 
| Dashboard `/dashboard` | 0 warm / 0 reload | NM | NM | NM | NM | NM | NM | NM | Unknown |
| Quotations `/quotations` | 0 warm / 0 reload | NM | NM | NM | NM | NM | NM | NM | Unknown |
| Payments `/payments` | 0 warm / 0 reload | NM | NM | NM | NM | NM | NM | NM | Unknown |
| Products & Services `/products` | 0 warm / 0 reload | NM | NM | NM | NM | NM | NM | NM | Unknown |
| Customers `/customers` | 0 warm / 0 reload | NM | NM | NM | NM | NM | NM | NM | Unknown |
| Export Jobs `/export-jobs` | 0 warm / 0 reload | NM | NM | NM | NM | NM | NM | NM | Unknown |
| Notification Management `/settings/notifications` | 0 warm / 0 reload | NM | NM | NM | NM | NM | NM | NM | Unknown |

Raw samples: empty for every route. No medians can be calculated. API counts are unavailable, not zero. API endpoint/status/duration/transfer-size rows cannot be produced without a captured request. Document and static-resource timings are also NOT MEASURED. No source-derived request estimates were substituted.

## Findings requested

1. **Actual measured performance issues:** none established. All seven routes are unmeasured; absence of measurements is not evidence of fast behavior.
2. **Confirmed slow API endpoints:** none established. Request duration, TTFB, transfer size, queueing/stalled time and server execution are unavailable. Network duration alone would not isolate backend execution even if captured.
3. **Duplicate API requests:** none observed through a trace. Source invocation patterns are not evidence of actual repeated transfers. Sequential dependencies and blocked/waiting time remain unmeasured.
4. **Main-thread bottlenecks:** unknown. No task/long-task counts or durations; no separation of script evaluation, React commits, layout and paint. Controller elapsed time and navigation-minus-API arithmetic are not used as React time.
5. **Layout shifts:** CLS, shift attribution, LCP and LCP elements are unavailable. No page-load vital is presented as an SPA-navigation metric. LCP render delay is not equated to JavaScript execution time.
6. **Frontend recommendations:** retain the existing source-only candidates in [Phase 3A](PHASE3A-PERFORMANCE-BASELINE.md): product cancellation forwarding, route/action-only PDF splitting, quotation list/form dependency separation after contract parity, and Dashboard aggregate-contract assessment. These are not trace-confirmed fixes or measured savings. No new source audit was started.
7. **Backend investigation:** no endpoint is demonstrated slow. Live quotation pagination/filter/sort parity remains a contract dependency from the prior source review. Server/SQL investigation should follow request evidence and sanitized correlation identifiers, not the Invoices trace or controller timing.
8. **Optimization priority:** first obtain permitted recordings, then rank demonstrated API waits, initial payload/evaluation, React work and layout costs by measured user impact. No module-level speed ranking is justified now. Keep source-only implementation recommendations separate from this future measured ranking.
9. **Blocked checks:** all requested navigation/API/runtime/vital measurements, cache-disabled reloads, serving-mode confirmation, duplicate/cancellation observation and cross-module comparisons. Development-server and extension overhead cannot be attributed to production application behavior.

## Evidence needed to complete measurements

Use an authorized tracing-capable browser attached to the same authenticated localhost session, or supply sanitized DevTools measurements. Do not export unsanitized HAR/trace files containing credentials, customer content, response bodies, screenshots or sensitive query values.

- For each route, retain three warm browser-clock input-to-meaningful-data samples and one safe cache-disabled ordinary reload. Record viewport, cache/throttling, browser version and verified dev/production mode; do not clear site data/sign out.
- Record each actual Fetch/XHR path (redact identifiers and query values), status, duration and transferred bytes. Separate navigation-to-settle traffic from background polling and static/document resources. Keep per-sample request counts and individual durations; report each sample median and the route median of sample medians with that aggregation explicitly labelled.
- Capture Performance tasks and long tasks (>50 ms), identify script evaluation/layout/paint separately, and report React rendering only where commit/profiler evidence supports it. Avoid screenshots or content exports exposing customer information.
- Record page-load LCP/CLS with LCP element and shift attribution on reload. Report SPA metrics separately only if supported. Never infer all LCP render delay is JavaScript.
- Inspect timing/initiators for duplicates, authorization dependencies, cancellation, queueing and waiting. Preserve access checks; do not create export jobs or send notifications to generate activity.

The existing [sanitized collection template](PHASE3A-DEVTOOLS-TEMPLATE.md) can be extended to the three additional routes. No tests/build/full QA were rerun because this request changes documentation only. No improvement is claimed.
