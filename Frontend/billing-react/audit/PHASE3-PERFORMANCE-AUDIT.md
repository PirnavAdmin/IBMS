# IBMS Phase 3 performance audit

Date: 27 October 2026. Project: `Frontend/billing-react`. **Audit only; no application, test, backend, API, financial or configuration changes.** No mock business data, live writes, export jobs, downloads or synthetic volume datasets were created. Existing dirty worktree changes and Phase 1/2 fixes remain intact.

**Result: runtime profiling is BLOCKED; no route is classified as slow and no performance improvement is claimed.** Source and existing production-artifact inspection is complete for the requested scope. Bundle sizes are measured from disk; navigation/API/CPU/React timings are UNMEASURED.

## Measurement availability and method

The existing authenticated in-app browser was considered first. Its listed capabilities were `pageAssets` and `webmcp`; no network, trace or React profiler interface was exposed. A read-only attempt to read browser Performance entries failed because `performance` is undefined in the supported evaluation environment. No instrumentation, fetch interception or application source was injected.

The Windows computer-use fallback was then initialized and an existing Chrome window was selected from the returned inventory. It stopped before exposing page state because it could not identify the current browser URL reliably enough to enforce policy. Browser input stopped; no alternative automation/remote-debugging bypass was attempted. [Tooling record](phase3-performance/profiling-availability.json).

Therefore:

- Runtime routes actually profiled: **none**. Source-inspected routes: the eight listed below.
- Successful navigation samples: **0 warm / 0 cold per route**. No medians were calculated from missing data. Three repeats were not attempted after the tooling blocker.
- Actual API request counts, response sizes, durations, cancellation outcomes, paints, long tasks, JS self-time, React commits and meaningful-content settling: **UNMEASURED**.
- Desktop 1440px versus mobile 390px runtime comparison: **NOT EXECUTED**. Prior Phase 2 visual verification is not reused as performance evidence.
- Automation-controller elapsed time is not used as UI response time.

### Route measurement matrix

| Module | Route | Warm samples | Cold samples | Median navigation/settle | API duration/count | Frontend execution/render |
|---|---|---:|---:|---|---|---|
| Dashboard | `/dashboard` | 0 | 0 | UNMEASURED | UNMEASURED | UNMEASURED |
| Invoices | `/invoices` | 0 | 0 | UNMEASURED | UNMEASURED | UNMEASURED |
| Quotations | `/quotations` | 0 | 0 | UNMEASURED | UNMEASURED | UNMEASURED |
| Payments | `/payments` | 0 | 0 | UNMEASURED | UNMEASURED | UNMEASURED |
| Products & Services | `/products` | 0 | 0 | UNMEASURED | UNMEASURED | UNMEASURED |
| Customers | `/customers` | 0 | 0 | UNMEASURED | UNMEASURED | UNMEASURED |
| Export Jobs | `/export-jobs` | 0 | 0 | UNMEASURED | UNMEASURED | UNMEASURED |
| Notification Management | `/settings/notifications` | 0 | 0 | UNMEASURED | UNMEASURED | UNMEASURED |

[Machine-readable measurement matrix](phase3-performance/measurement-matrix.json). Null values mean unavailable, not zero latency or zero requests. Warm reloads, cache-disabled cold loads and production-versus-development traces were not captured.

## Findings

The “issue” column distinguishes measured bytes from source-confirmed behavior. P2/P3 severities below are **engineering/scaling risk priorities**, not a measured user-latency classification. API and frontend times remain unmeasured for every row.

| ID | Module | Measured issue / evidence status | API time | Frontend time | Evidence | Severity | Recommended fix |
|---|---|---|---|---|---|---|---|
| P3-01 | Initial bundle | Measured existing main JS: 3,601,221 bytes; CSS: 608,515 bytes. Eager route graph includes PDF implementation. Startup delay unmeasured. | UNMEASURED | UNMEASURED | [AppRoutes.jsx:14](C:/Users/Admin/source/repos/IBMS/Frontend/billing-react/src/routes/AppRoutes.jsx:14), [CreditNoteExportPage.jsx:6](C:/Users/Admin/source/repos/IBMS/Frontend/billing-react/src/pages/CreditNotes/pages/CreditNoteExportPage.jsx:6), [bundle evidence](phase3-performance/bundle-evidence.json) | P2 payload risk | Baseline production load first; then route boundaries and on-demand PDF imports. |
| P3-02 | Quotations | Source confirms all quotation/customer/product pages plus tenant/template/charge data before the shared loading state settles. Visible paging is local. | UNMEASURED | UNMEASURED | [QuotationManagement.jsx:94](C:/Users/Admin/source/repos/IBMS/Frontend/billing-react/src/pages/Quotations/QuotationManagement.jsx:94), [quotationApi.js:56](C:/Users/Admin/source/repos/IBMS/Frontend/billing-api-client/quotationApi.js:56) | P2 scaling risk | Load a server list page independently; defer form catalogs after verifying filter/sort parity. |
| P3-03 | Quotations | Generation guard ignores stale results but does not abort the underlying page streams; StrictMode can repeat the mount effect in development. | UNMEASURED | UNMEASURED | [quotationApi.js:56](C:/Users/Admin/source/repos/IBMS/Frontend/billing-api-client/quotationApi.js:56), [main.jsx:6](C:/Users/Admin/source/repos/IBMS/Frontend/billing-react/src/main.jsx:6) | P2 cancellation risk | Propagate AbortSignal end-to-end and stop later pages on unmount; distinguish dev probes from production duplicates. |
| P3-04 | Quotation detail | Source calls GET detail in open(), then GET the same detail again inside refreshDetails(), followed by parallel communication/audit calls. Runtime duplicate transfers not captured. | UNMEASURED | UNMEASURED | [QuotationManagement.jsx:141](C:/Users/Admin/source/repos/IBMS/Frontend/billing-react/src/pages/Quotations/QuotationManagement.jsx:141), [QuotationManagement.jsx:116](C:/Users/Admin/source/repos/IBMS/Frontend/billing-react/src/pages/Quotations/QuotationManagement.jsx:116) | P3 redundant-work candidate | Reuse the already-fetched detail when valid and independently load histories; preserve freshness and partial-error handling. |
| P3-05 | Dashboard | Source collects full invoice/payment pages of 100 for local analytics, with a 2,000-record guard per stream. | UNMEASURED | UNMEASURED | [dashboardService.js:4](C:/Users/Admin/source/repos/IBMS/Frontend/billing-react/src/services/dashboardService.js:4), [dashboardModel.js:9](C:/Users/Admin/source/repos/IBMS/Frontend/billing-react/src/pages/Dashboard/dashboardModel.js:9) | P2 scaling risk | Evaluate equivalent server analytics/aggregate contracts; never replace totals with one page or merge currencies. |
| P3-06 | Products & Services | Source metadata query performs four distinct filtered product GETs in parallel, in addition to page and categories; these are fan-out, not proven duplicate requests. | UNMEASURED | UNMEASURED | [productService.js:63](C:/Users/Admin/source/repos/IBMS/Frontend/billing-react/src/pages/Products/services/productService.js:63) | P2 request fan-out risk | Measure the waterfall; consider an authoritative summary endpoint or appropriate metadata reuse. |
| P3-07 | Products & Services | queryFn supplies signal, but getProducts/getCatalogMetadata wrappers discard it and shared productApi does not forward cancellation. | UNMEASURED | UNMEASURED | [productApi.js:13](C:/Users/Admin/source/repos/IBMS/Frontend/billing-api-client/productApi.js:13) | P2 cancellation risk | Add signal forwarding through the frontend/shared-client chain; verify cancelled search/navigation requests. |
| P3-08 | Identity across modules | ProtectedRoute validates /api/Auth/me separately; modules use auth-user, payment-user or imperative identity calls. Redundant wire requests remain unmeasured. | UNMEASURED | UNMEASURED | [source excerpts](phase3-performance/source-evidence.json) | P3 cache coordination candidate | Use a canonical validated-session profile while retaining token/tenant isolation, permission checks and cache clearing. |
| P3-09 | Notification Management | Source fetches a complete template array and slices it for visible pages; metadata query is keyed by event type and can be deduplicated by React Query. | UNMEASURED | UNMEASURED | [NotificationTemplates.jsx:68](C:/Users/Admin/source/repos/IBMS/Frontend/billing-react/src/pages/Notifications/NotificationTemplates.jsx:68) | P3 scale candidate | Measure template payload sizes; add server paging only if contract/scale requires it. Do not mistake shared query observers for duplicate requests. |
| P3-10 | React list work | Source shows repeated customer/category lookups and derived arrays. Actual render duration, commit counts and long tasks are unavailable. | UNMEASURED | UNMEASURED | [QuotationManagement.jsx:114](C:/Users/Admin/source/repos/IBMS/Frontend/billing-react/src/pages/Quotations/QuotationManagement.jsx:114), [source excerpts](phase3-performance/source-evidence.json) | P3 profiling candidate | Profile before memoizing. Consider indexed identity/category maps and stable derived rows; avoid arithmetic changes. |
| P3-11 | Export Jobs | Earlier 3511ms was controller click-to-first-accessibility-observation, one sample. Not reproduced as a browser-side performance measurement. | UNMEASURED | UNMEASURED | [ExportJobStatus.jsx:44](C:/Users/Admin/source/repos/IBMS/Frontend/billing-react/src/pages/BackgroundJobs/ExportJobStatus.jsx:44), [original timing definition](UI-UX-PERFORMANCE-AUDIT.md) | UNRATED / UNKNOWN | Trace identity gating, export GET, paint and conditional polling before proposing a fix. |
| P3-12 | Invoices / query policy | Source sets list and summary staleTime=0; fresh mount can refetch both. This may be intentional financial freshness, not an unnecessary loop. | UNMEASURED | UNMEASURED | [source excerpts](phase3-performance/source-evidence.json) | P3 policy review | Observe real remount traffic before changing freshness. Preserve accuracy and permission gating. |

No backend latency bottleneck, dropped-frame issue, unnecessary React commit or active refetch loop was confirmed by a runtime trace. “Source-confirmed” is not interchangeable with “measured slow”.

## Initial bundle and lazy-loading review

The existing `dist/index.html` directly references one application JS entry and one CSS asset. `AppRoutes.jsx` contains **49 static page-import declarations and 76 Route declarations**, with no `lazy()` or `Suspense` boundary there. Authenticated modules, forms and administration screens therefore share an eager import graph; this does not mean every route component renders on every navigation.

Exact artifact sizes were read from disk. Gzip figures below were computed locally with Python gzip level 6; **they are not observed HTTP Content-Encoding or network transfer sizes**. Asset hashes are retained in [bundle sizes](phase3-performance/bundle-sizes.json).

| Existing asset | Raw bytes | Local gzip bytes | Load interpretation |
|---|---:|---:|---|
| `index-Bw4jWLpT.js` | 3,601,221 | 1,066,207 | Direct HTML module entry; actual fetch/evaluate duration unavailable. |
| `login_office_bg-C9Yr8Sbv.jpg` | 710,310 | 707,583 | Login asset; presence on disk does not prove it downloads on authenticated routes. |
| `index-BoFRVS2H.css` | 608,515 | 105,994 | Direct HTML stylesheet; CSS loading/layout cost unavailable. |
| `index.es-Bo4CNV7W.js` | 150,415 | 51,275 | Separate generated JS chunk; live load timing unavailable. |
| `purify.es-BYftNTi7.js` | 29,398 | 11,278 | Separate optional sanitizer chunk; startup fetch not established. |
| `html2canvas-cuC0PbNg.js` | 464 | 339 | 464-byte wrapper imports implementation exports from main entry; not evidence of an isolated heavy renderer. |

The direct JS+CSS assets total **4,209,736 raw bytes**. This excludes HTML, fonts and any additional demand-loaded resources; it is not a measured startup transfer total. External font links exist in HTML but their request duration, cache behavior and layout impact were not measured.

`CreditNoteExportPage.jsx` statically imports `html2pdf.js` and is eagerly imported by AppRoutes. QuotationDetails dynamically imports that same library on PDF download, but this does not isolate the shared dependency from the initial graph. The emitted main entry contains actual html2pdf/jsPDF implementation markers; the html2canvas wrapper imports from that entry. Individual package byte attribution is unavailable without a module-size map, so the entire entry is not attributed to PDF code.

Safe splitting candidates are route pages and action-only PDF/export libraries. Keep ThemeProvider, QueryClientProvider, BrowserRouter, the validated session, permission gates and shared shell stable. Put loading/error handling inside the protected/permission boundary; test expired sessions, direct links, denied permissions, navigation cancellation, chunk-load failure and Phase 1/2 CSS order. Do not remove auth validation, hide loading indefinitely or reorder theme/cascade rules merely to lower bundle size.

The existing production output was inspected; no build, preview server, bundle analyzer installation or deployment was run during this audit. Runtime serving mode at localhost:3000 was not verified. Configured development port and StrictMode source alone are not proof of production behavior.

## Network and API structure — not observed request counts

No HAR, Resource Timing trace, response byte sizes, server processing timings or cancellation events were captured. The following are **conditional code-path GET invocations on an uncached mount**, excluding the shared session gate and browser caching. They are not measured network counts or median request totals.

| Module | Source request pattern | Cancellation / caching observation from code |
|---|---|---|
| Dashboard | Two independent page streams, invoice and payment; each requests pages of 100 until complete | Both query functions propagate signal; 60s staleTime; each ledger guarded above 2,000 records |
| Invoices | Identity if needed, then list, currency summary and active customer catalog/search | List/summary consume signal; customer catalog path does not. List/summary staleTime=0; identity 60s |
| Quotations | Three page streams + identity + template list + charges; optional active-template detail | At one page per stream, six GET invocations, seven if template detail is needed. Imperative loading lacks abort propagation/cache coordination |
| Payments | Paginated list plus separate payment-user identity query when stale/missing | Payment list and identity signal forwarded; shared 300ms search timer; global query staleTime applies unless overridden |
| Products | One page + four differently filtered count queries + categories: six invocations if all need data | Metadata 60s; categories use their shared key; product list/metadata signal is discarded in wrappers |
| Customers | Server page + summary | Both consume signal; keepPreviousData for page transitions; summary 60s; shared search timer |
| Export Jobs | Identity query if uncached, then permitted export page; one page request if identity already fresh | Signal consumed; query starts only when allowed; polling only for returned Pending/Processing jobs |
| Notifications | Template array plus queries for distinct event types visible on the page | Query key per event type shares/deduplicates in-flight metadata requests; 60s metadata cache; server filters trigger list queries |

Parallel/sequential distinctions:

- QuotationManagement already starts its five top-level loader tasks together with Promise.allSettled. The issue is completion being gated by all ancillary datasets, not that these five tasks are serial.
- Each fetchAllPages stream requests later pages serially. Prefer eliminating unnecessary all-page reads before adding parallel page fan-out.
- Active-template detail depends on the template list finding an ID. Do not blindly parallelize a dependent request.
- Quotation detail is fetched twice sequentially before histories settle; this is a reuse candidate, not proof of two wire transfers under all cache policies.
- Export access gating is a security dependency. Reuse validated identity if safe; do not issue protected work before permission is known.
- Product summary queries are already parallel and have different filters; count fan-out is not identical-request duplication.

React StrictMode is present at the root. In development, mount-effect probes can repeat imperative quotation loading; its generation counter suppresses stale state, not transport. Signal-aware React Query requests can instead show cancellation/restart behavior. Actual duplicate counts and development-versus-production differences require traces. Do not disable StrictMode as a performance fix based only on source inspection.

The shared Axios client has a configured API base URL and 15-second timeout; Vite also has a configurable proxy. The effective live URL/path and DNS/TLS/tunnel contribution were not established, so no network/back-end attribution is made from that configuration.

## Quotation list and scaling

The inspected server source supports paginated quotation GETs: [QuotationsController.cs:49](C:/Users/Admin/source/repos/IBMS/Backend/Billing.API/Controllers/QuotationsController.cs:49), filter DTO [QuotationContracts.cs:159](C:/Users/Admin/source/repos/IBMS/Backend/Billing.Contracts/Quotation/QuotationContracts.cs:159), and repository [QuotationRepository.cs:64](C:/Users/Admin/source/repos/IBMS/Backend/Billing.Infrastructure/Repositories/QuotationRepository.cs:64). The repository performs CountAsync, applies ordering, then Skip/Take with page size capped at 100. The controller returns a paged result. **This confirms checked-out implementation capability, not the behavior/version of a live deployed API.** No new live GET was made.

The list response includes customer name/code and stored quotation summary fields. A list page therefore need not inherently wait for every product, full customer record, charge preset or printable company profile. Those form/detail datasets can be considered separately, but safe implementation needs behavior parity:

- Current local search includes customer email/mobile. The inspected server search covers quote number, customer name/code and reference; it does not establish equivalent email/mobile search.
- DTO declares Validity, but the inspected repository filtering path does not apply it. Audit-category filtering is local and has no demonstrated matching server parameter.
- Client creation-time ordering and numeric quote-number comparison must be reconciled with the repository's supported sort cases/default date ordering and stable paging ties.
- Preserve selected historical customers/products and saved values when loading Create/Edit lookups on demand. Never derive a financial total from a partial page.

`fetchAllPages` accumulates records at 100 per page and has no cancellation argument or explicit maximum-page guard. The visible quotation table slices a locally filtered/sorted array. `quotes.map(enrich)` uses `customers.find` for each quote when Management renders: O(Q×C) lookup work. A customer-ID Map can make that join linear after loading/indexing; analogous product/category maps avoid repeated `.find` lookups. This is a structural complexity observation, not a measured millisecond saving.

Quotation search is immediate local filtering, not debounced API search. Its filter/sort memoization recomputes when search/filter dependencies change. Large-data scaling is plausible, but no artificial records or 100k-row benchmark was created. Database index effectiveness and substring-search execution plans are UNMEASURED; adding indexes without the real SQL plan is not justified by this audit.

## React/rendering observations

React DevTools/profiling builds were unavailable, so commit counts, wasted renders, JavaScript self-time and long tasks are all UNMEASURED. The code review supports these limited statements:

- Dashboard billingInsights is already memoized by ledger data and currency. Its currency options are rebuilt from loaded ledgers on Dashboard renders; recent-record search filters only the six returned recent rows per ledger, not the entire ledger for those tables.
- ProductList decorates visible products using categories.find and passes a fresh mapped array during parent renders. Consider indexed/memoized derived rows only after a trace identifies material work.
- QuotationList already memoizes filter/sort/recent subsets. Parent busy/data changes can provide a new enriched array; child-only input changes do not automatically rerender the parent.
- QuotationForm memoizes totals but depends on the whole form object. Narrowing dependency identity may avoid recomputation, but arithmetic and backend authority must remain untouched and this form was not live-profiled.
- Payments, Products and Customers use the shared **300ms configured debounce**. Invoice useDebounced defaults to **275ms**. These are source constants, not measured typing-to-paint latency. Quotation local search has no timer.
- Equivalent React Query keys are hashed by query content; a new filter object does not alone prove a duplicate GET. Invoice search's page-reset effect is a potential sequencing case to trace, not an established request loop.
- No runtime refetch-loop or unnecessary React rerender was confirmed. Do not add React.memo, virtualization or debounce everywhere without commit/interaction evidence.

## Export Jobs: 3.5-second investigation

The original audit explicitly defined the **3511ms** observation as controller Date.now() around a UI click and first accessibility snapshot. It includes automation/browser communication and does not guarantee final data paint. It was one sample, not a median, and cannot be treated as backend or frontend latency.

This run could not reproduce it with browser-side timing. API time, JS/module load time, paint/settling time and controller overhead contribution remain **UNMEASURED / UNKNOWN**. The source shows an identity-gated paginated GET and 5,000ms refetch only while returned jobs are Pending/Processing. Completed/Failed-only pages disable that interval. Five seconds is a policy constant, not a measured navigation delay or evidence of an endless polling bug. Queue export, downloads and synthetic pending jobs were not triggered.

## Prioritized Phase 3 implementation plan — not executed

1. **Restore profiling access and collect the baseline first.** Use an authorized browser with network/performance tooling whose URL is verifiable. Separate development and existing production output; record cache and throttling settings. Take three warm and three genuine cold samples for each of the eight desktop routes, then three representative mobile interactions for Dashboard, Quotations and Export Jobs. Cap the run count and retain every raw sample, not just the median.
2. **Define timings in the browser clock.** Start from the actual navigation input/event timestamp, record API start/response-end/transfer sizes, trace main-thread tasks, and mark the first meaningful populated/explicit-empty/error view plus stable paint. Capture React commits where the profiler supports them. Do not subtract summed API durations from navigation time: requests and CPU work overlap.
3. **Split route/action payloads if traces confirm initial-load cost.** Keep session/permissions/providers/loading/error behavior stable; defer the static PDF/export path as well as route pages. Compare the same cold/warm production samples and exact entry/chunk sizes afterward; rerun Phase 1/2 CSS and accessibility checks.
4. **Separate quotation list/form dependencies.** Verify live pagination/filter/sort contracts and resolve parity gaps first. Load a list page without all product/customer/profile data, add cancellation through the real client chain, and reuse the first fetched detail where fresh. Keep failures and tenant isolation explicit.
5. **Address measured request fan-out/cancellation.** Prioritize the confirmed lost product AbortSignal chain, then evaluate count-summary aggregation and validated identity reuse. Do not introduce undocumented summary endpoints or remove access checks.
6. **Optimize React work only where commits show cost.** Index lookups, stabilize derived arrays and consider bounded table rendering if real authorized datasets justify it. Preserve financial math and approved layout.
7. **Verify Export Jobs separately.** Measure identity cache-hit/miss, export GET, main-thread/paint and active-job polling with existing authorized jobs. Change polling or loading behavior only if measured evidence identifies the cause.

Acceptance requires before/after distributions under the same data, browser mode, cache and viewport, no extra/uncancelled requests, retained financial correctness/accessibility, and no Phase 1/2 layout regression. No improvement has yet been measured.

## Blockers and areas not measured

- **Tooling blocker:** in-app Performance/network interfaces unavailable; Windows Computer Use could not verify the browser URL and ended. Browser input was not continued.
- **Backend latency blocker:** none established. There is no live request/server/SQL timing evidence. Quotation filter/sort parity and any new aggregate/summary contract need separate live validation before implementation.
- **Not measured:** all eight route navigation medians, API counts/sizes/durations, cold versus warm cache behavior, request cancellation in flight, production startup, JS execution/long tasks, React commit counts/durations, actual search/sort/pagination response, menu latency, desktop/mobile performance, font loading, database plans, HTTP compression and active export polling.
- No tests/build/full-suite reruns, server profiling, financial/configuration writes or source fixes were performed. Existing production files were read only. Prior visual results are not current performance PASS evidence.

[Source excerpts](phase3-performance/source-evidence.json) and [source integrity](phase3-performance/source-integrity.json) document the bounded review. The working tree's existing changes were preserved.

Computer-use skill: [SKILL.md](C:/Users/Admin/.codex/plugins/cache/openai-bundled/computer-use/26.1021.31345/skills/computer-use/SKILL.md), [guidance](C:/Users/Admin/.codex/plugins/cache/openai-bundled/computer-use/26.1021.31345/docs/guidance.md). Its explicit interruption instruction is: “If Computer Use reports that the turn ended or that the user stopped Computer Use, stop issuing app input.” This required stopping the browser fallback; it did not provide permission to bypass URL verification.
