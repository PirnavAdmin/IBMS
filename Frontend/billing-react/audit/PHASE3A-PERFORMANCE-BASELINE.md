# IBMS Phase 3A performance baseline verification

27 October 2026. Scope: Dashboard, Quotations, Products & Services, Export Jobs. Audit only; no application/backend changes, business-data creation, financial/configuration writes or optimization.

**Outcome: source-only verification complete; runtime baseline NOT MEASURED. No frontend or backend/network latency bottleneck is confirmed.** The existing [Phase 3 audit](PHASE3-PERFORMANCE-AUDIT.md) and its evidence were reviewed, with bounded current-source checks of the four modules. Source risks are not measured latency.

## Runtime baseline

| Module | Samples | Median UI settle | API duration | Request count | Main-thread impact | Evidence |
|---|---|---|---|---|---|---|
| Dashboard `/dashboard` | Warm 0/3; reload 0 | NOT MEASURED | Individual/largest: NOT MEASURED | NOT MEASURED | NOT MEASURED | Prior tooling restriction; no supplied DevTools measurements |
| Quotations `/quotations` | Warm 0/3; reload 0 | NOT MEASURED | Individual/largest: NOT MEASURED | NOT MEASURED | NOT MEASURED | Same restriction; source loader review below |
| Products & Services `/products` | Warm 0/3; reload 0 | NOT MEASURED | Individual/largest: NOT MEASURED | NOT MEASURED | NOT MEASURED | Same restriction; source request/cancellation review below |
| Export Jobs `/export-jobs` | Warm 0/3; reload 0 | NOT MEASURED | Individual/largest: NOT MEASURED | NOT MEASURED | NOT MEASURED | Same restriction; authorization/load/poll review below |

Raw warm samples for each route: `[]`; cache-disabled reload samples: `[]`. No median exists for an empty sample set. Zero samples does not mean zero requests or zero latency. The user explicitly confirmed that no Chrome DevTools measurements are currently available and authorized closure using existing source evidence. All runtime metrics remain NOT MEASURED. No further profiling or full audit was restarted.

The supported in-app browser previously exposed pageAssets/webmcp but no network/Performance tracing or React profiler. Its supported Performance read returned `performance is undefined`. Windows Computer Use then stopped because it could not verify the current browser URL. [Availability record](phase3-performance/profiling-availability.json). No new browser input, alternate debugging path, token extraction, authentication changes or permission bypass was attempted in Phase 3A. Earlier visual captures do not supply performance timings.

Live development versus production mode is **NOT VERIFIED**. Source contains root StrictMode, and existing Vite production artifacts exist; neither proves how localhost:3000 is currently served. Development mount-effect probes may duplicate requests; no duplicate transfers or production difference were observed in a trace. Earlier Export Jobs **3511ms** was one controller click-to-accessibility-observation interval, not browser UI settle, API time or React rendering; it is excluded from this baseline.

## Focused source verification

All findings in this section are classified **Source-only optimization candidate**. Structural behavior is confirmed in code; its user-visible cost is not measured.

| ID | Area | Verified source behavior | Recommendation and prerequisite |
|---|---|---|---|
| A01 | Initial bundle | AppRoutes eagerly imports pages; no route lazy/Suspense boundary. CreditNoteExportPage statically imports html2pdf; the quotation action dynamically imports it, but the eager path still includes its implementation initially. | Consider route-level boundaries inside the existing authentication/permission shell and defer action-only PDF imports. Preserve providers, error/loading states, direct links, tenant isolation and CSS order. First measure production cold-load/network/CPU cost. |
| A02 | Dashboard | Independent invoice/payment queries collect pages of 100; later pages within each ledger are serial, with a 2,000-record guard per ledger and cancellation checks. Insights already use memoization. | Measure ledger waterfall and calculation work separately. Consider authoritative aggregate contracts only with full financial/currency parity; do not use current-page totals as dashboard totals. |
| A03 | Quotations | Five top-level tasks run in parallel: all quotation pages, all customer pages, all product pages, profile/template data and charge presets. Shared loading waits for all. Each all-page stream is sequential and lacks AbortSignal propagation; the generation guard suppresses stale state rather than cancelling transport. Visible list pagination is local. | Separate list from Create/Edit/print datasets only after live contract parity checks below; propagate cancellation. Customer-ID indexing can replace repeated customer.find lookups, but render savings remain unmeasured. |
| A04 | Products | Metadata performs four distinct parallel filtered GETs: all, Active, Inactive, Service, each pageSize=1. These are not identical duplicate requests. ProductList passes query signals, but getProducts/getCatalogMetadata and the shared product client discard them. | Preserve server-authoritative counts. First verify real request waterfall/cache behavior; then forward AbortSignal throughout the frontend chain. A consolidated metadata API would require a separately approved backend contract. |
| A05 | Export Jobs | auth-user query validates identity; permission enables the paged export GET (20 rows initially). Both consume signals. Refetch interval is 5 seconds only when the returned page contains Pending/Processing jobs. | Measure identity cache miss/hit, export GET, commit/paint and later polling separately. Preserve authorization gating; do not issue protected GETs prematurely or assume conditional polling caused navigation delay. |

Source-derived invocation estimates are **not wire request counts**: quotations has six logical first-page GETs, optionally seven with template detail, then additional catalog pages; products has four metadata GETs plus list and categories on an uncached module load. Global authorization, caches, retries, StrictMode and cancellations can change observed counts. Export identity and export GET are dependent on a cache miss; an identity cache hit can avoid that wait. No request duplication is runtime-confirmed.

### Quotation backend contract parity

Read-only review of `Backend/Billing.Contracts/Quotation/QuotationContracts.cs:159` and `Backend/Billing.Infrastructure/Repositories/QuotationRepository.cs:64` confirms the checked-out server implements CountAsync, sorting, Skip/Take and pageSize capped at 100. It accepts search/status/customer/date filters. **Live deployed pagination, sorting and filtering remain unverified.** No authenticated API request was made outside the permitted browser.

Parity is incomplete: server search covers quotation number/customer name/code/reference, while local search also uses customer email/mobile; Validity is declared in the DTO but not applied in the inspected repository; audit-category filtering has no established matching server filter. Local creation-time ordering and numeric quotation-number comparison differ from the documented repository sort paths; stable paging tie order must be checked. Therefore a direct switch to server paging is not yet recommended for implementation. List responses already include customer name/code and summary fields; full catalogs/profile/charges can potentially be deferred while retaining selected historical form values and partial-error behavior.

### Existing production assets, measured on disk

| Asset | Raw bytes | Prior local gzip-6 bytes |
|---|---:|---:|
| index-Bw4jWLpT.js | 3,601,221 | 1,066,207 |
| index-BoFRVS2H.css | 608,515 | 105,994 |

Current raw lengths were rechecked. [Prior bundle evidence and remaining chunks](phase3-performance/bundle-sizes.json). Local gzip sizes are not HTTP transfer measurements. The tiny html2canvas chunk imports implementation exports from the main entry; it does not demonstrate PDF isolation. No module-size map attributes the whole entry to PDF. Download, parse/evaluation and startup costs are NOT MEASURED; no new build was run.

## Prioritized implementation recommendation

1. **Measurement gate:** obtain authorized DevTools text results using [the collection template](PHASE3A-DEVTOOLS-TEMPLATE.md). Record three warm samples per route, safe cache-disabled reloads, viewport/cache/throttling/serving mode, actual per-request durations and long tasks where available. Retain raw values and calculate medians only from real comparable samples.
2. **Cancellation candidate:** product signal forwarding is a bounded frontend opportunity. Verify in-flight navigation/search cancellation before and after any later implementation; performance benefit is currently unknown.
3. **Initial payload candidate:** evaluate route splitting and action-only PDF deferral if production traces show entry load/evaluation cost. Retest authentication, permissions, direct routes and existing layouts.
4. **Quotation scaling candidate:** establish live sort/filter/paging parity first, then separate list/form loading and avoid unnecessary all-page reads. Do not silently lose search/filter behavior.
5. **Dashboard/Export Jobs:** optimize only the measured stage. Dashboard aggregate APIs and product summaries need authoritative contracts; Export Jobs identity reuse must preserve access controls. There is no evidence supporting a polling or rendering rewrite now.

Classification totals: **Confirmed frontend bottleneck: 0; Confirmed backend/network bottleneck: 0; Source-only optimization candidates: 5; Not measured: all four runtime baselines.** Priorities reflect scope/dependencies, not a ranking of measured slowness. Backend performance blockers: none established. Live quotation contract parity and any new aggregates/metadata endpoint remain contract dependencies, not latency findings.

## Unexecuted checks and integrity

Warm/reload profiling, per-request timing/size/count, request cancellation outcomes, observed duplicates, UI settle/paint, main-thread tasks, React commits, desktop/mobile performance and live serving mode were not measured. No tests, build, full-suite QA or before/after optimization comparison was run: this phase changes documentation only. Existing user changes were preserved. See [integrity verification](PHASE3A-source-integrity.json).

The earlier [computer-use skill](C:/Users/Admin/.codex/plugins/cache/openai-bundled/computer-use/26.1021.31345/skills/computer-use/SKILL.md) fallback required stopping app input when interrupted: “stop issuing app input.” The recorded URL-verification restriction remains the runtime evidence blocker; it was respected rather than bypassed.
