# Phase 3A sanitized DevTools measurements

Use the existing authenticated session and real records. Do not create jobs, export/download data, change settings or perform financial actions. Supply text only; omit cookies, authentication headers, tokens, query values and response bodies. Do not send an unsanitized HAR.

Record browser version, viewport, confirmed dev/production mode (or unknown), network/CPU throttling and cache settings. Keep these and data volume comparable. Do not clear site data or sign out. DevTools Disable cache with an ordinary reload is optional; label it cache-disabled reload, not a genuinely cold machine/network start.

For each of `/dashboard`, `/quotations`, `/products`, `/export-jobs`, record three warm navigations (maximum three; no automation loop). Start timing at the actual navigation input in the browser Performance recording. Stop at the first populated or explicit empty/error view after its loading indicator ends and layout settles; note the outcome. Do not wait for polling/network idle as the settle definition. If the exact settle point cannot be determined, report unavailable.

| Route | Sample | Warm/reload | UI settle ms | API count | Request label: duration ms (each) | Largest request ms | Long-task count/total ms, if available | Outcome/evidence |
|---|---|---|---|---|---|---|---|---|
| /dashboard | 1 / 2 / 3 separately | | | | | | | |
| /quotations | 1 / 2 / 3 separately | | | | | | | |
| /products | 1 / 2 / 3 separately | | | | | | | |
| /export-jobs | 1 / 2 / 3 separately | | | | | | | |

Use sanitized path labels without identifiers/query values. Note response status, cache/cancel state and overlapping requests; distinguish identity checks, list requests, metadata/catalogs and later export polling. Record whether any identical request actually repeats, with initiator information if available. Count API requests during navigation-to-settle separately from subsequent polling and static assets. Largest request means maximum observed request duration, not the sum. Network request duration includes network and server time; it alone does not isolate backend execution.

Where Performance is available, report main-thread JS/task durations and long tasks (>50ms); do not call the controller stopwatch or navigation-minus-API time React render time. React commit timings require React profiler evidence. For Export Jobs distinguish checking access, export GET completion, visible rows and later conditional polling. For quotations inspect live pagination/filter/sort behavior through permitted read-only UI; source contract support alone is insufficient parity proof.

Median of three comparable times is the middle sorted value. Keep raw samples; do not combine dev/production, warm/reload or different viewport conditions into one median. Unavailable fields remain NOT MEASURED.
