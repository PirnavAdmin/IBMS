# Phase 1 regression closure — U01–U06 preserved

Scope: resolve two notification UI assertions and three CSS cascade baseline failures. Application source was not changed during this closure. SHA-256 comparison of 275 source files found zero changes; the approved responsive fixes, existing user edits, backend/API contracts and financial logic remain intact. See [source integrity](source-integrity.json).

## Failure review

| Failure | Root cause | Classification | Resolution |
|---|---|---|---|
| Notification history pagination | Test clicked `.ant-pagination-item-2`; history uses shared MUI WorkspacePagination. The assertion failed before exercising page navigation or filter reset | Outdated assertion; no application defect found | Click the accessible Next button within the labelled notifications navigation. Return a distinct page-two response, assert server pageNumber/pageSize, rendered recipient/subject, replacement of previous rows, selected page and announced range, then verify filters reset request/data/range to page one |
| Notification connection error | Test conflated transport normalization with final DashboardErrorState wording. The shared presentation deliberately renders friendly text instead of the transport string | Outdated expectation; no application defect found | Preserve all transport-normalization assertions. For both template list and history, require role=alert, heading and visible friendly message, no infrastructure details, no empty-success table/message, enabled named Retry, exactly one recovery GET, response-backed UI rows and removal of the alert; assert no mutation calls |
| Quotations CSS hash | Snapshot predates committed compact filter sizes and consistent dropdown arrows. Multiline selector line endings also affected canonical hashes | Stale baseline and platform-sensitive snapshot | Review original baseline commit against HEAD/current source; update only this intentional snapshot and record its former hash and review metadata |
| Credit Notes CSS hash | Snapshot predates committed menu/pagination/detail/empty/refund styling and approved U02/U03 responsive summary/filter rules; mixed checkout line endings also change the hash | Stale baseline and platform-sensitive snapshot | Retain existing CSS, review committed work separately from U02/U03 working-tree additions, update the reviewed snapshot and add named responsive/value/print checks |
| WorkspaceUI CSS hash | Snapshot predates committed screen-only bounded table viewports, cappuccino scrollbars and Ant vertical-scroll compatibility override; multiline selector line endings also differ | Stale baseline and platform-sensitive snapshot | Review the committed additions; retain invoice-document exclusion and print behavior; update this snapshot while protecting scrolling, alignment, theme and focus invariants |

## Files modified

Only these four tracked files were modified by this closure:

- `tests/notifications-ui.test.jsx` — behavior-based pagination and stronger accessible error/recovery coverage.
- `tests/run-notification-ui.mjs` — forward Node test CLI arguments before the bundled test file so focused invocations actually filter tests. No flags still runs the existing notification suite.
- `tests/css-cascade.test.mjs` — normalize LF/CRLF to the existing CRLF snapshot convention; retain duplicate-declaration checks, complete ordered AST hashes and removed-declaration metadata; add six targeted tests.
- `tests/css-cascade-baseline.json` — update only the three reviewed failing canonical hashes; retain original hashes/review reasons and add independently reviewed print hashes. Existing customer-list baseline is unchanged.

Report/evidence files are added under `audit/regression-closure/`; no application CSS, JSX, services or backend files were edited.

## CSS baseline evidence

[Review evidence](css-baseline-review.json) contains previous/current hashes and complete diffs from baseline-origin commit `028d339c` to HEAD and from HEAD to working tree.

All three original expected hashes were reproduced from that commit with CRLF selectors. Normalizing checkout line endings therefore removes a demonstrated platform artifact; selectors, values, order, importance, at-rule parameters and media/print scopes remain protected. Only comments and empty rules are excluded, as in the original test.

Quotations and WorkspaceUI had no working-tree CSS changes relative to HEAD. Credit Notes had only the approved U02/U03 responsive block beyond HEAD. Committed differences are intentional styled controls, screen-local scroll bounds and presentation rules described above; none were reverted or restyled during closure. Print AST hashes match the originating commit for all three reviewed files after consistent line-ending normalization. No unintended styling edit was identified in these diffs. This is a code review finding, not a new browser-wide visual PASS.

Coverage retained and extended:

- Four whole-file hash/duplicate-declaration tests still protect complete cascade order and every declaration/media rule.
- Canonicalization test proves line-ending equivalence while detecting color, `!important` and media-scope changes.
- U01 checks exact detail-grid specificity at 900/680px and wrapping/no-ellipsis/visible-value rules.
- U02/U03 checks one/two-column breakpoints, readable credit values, tabular numerals and wrapping controls.
- Local scrolling checks preserve bounded template/workspace viewports, template minimum width, all seven header/body column proportions and action/header alignment.
- Print checks retain original reviewed print snapshots plus full invoice and credit table content overrides.
- Theme/focus checks retain cappuccino colors and visible keyboard outlines.

## Verification

| Final check | PASS | FAIL | Evidence |
|---|---:|---:|---|
| Focused notification behavior tests | 3 | 0 | [Log](notification-focused.log): pagination/filter/search, accessible friendly error recovery for list/history, existing loading/empty/network Retry test |
| CSS cascade and added invariants | 10 | 0 | [Log](css-tests.log): four retained snapshot checks plus six targeted tests |
| Production build | PASS | — | [Log](production-build.log): Vite 5.4.21, 15,350 modules, 1m56s |
| git diff --check | PASS | — | [Log](git-diff-check.log); only LF/CRLF checkout warnings, no whitespace errors |

Final focused checks total: **13 PASS / 0 FAIL**. The single earlier notification-only full run was **29 PASS / 1 FAIL** while the strengthened pagination assertion was still being corrected; its two other focused tests already passed. The final three-test run passed, covering the corrected history test and rechecking both error/loading tests. Thus all 30 distinct notification tests have passing coverage across these runs, but a second complete 30-test run was not performed. No clean single-run full-project-suite claim is made.

Commands:

```text
node tests/run-notification-ui.mjs
node tests/run-notification-ui.mjs "--test-name-pattern=History renders all statuses|Audit and notification errors|Template list loading"
node --test tests/css-cascade.test.mjs
npm run build
git diff --check
```

The first notification invocation used the old runner's actual supported invocation (no ignored filter). It ran the notification suite once, not the project suite. Subsequent runs used the updated runner's supported Node filter and executed only the three relevant tests. The final assertions query current rendered DOM and accept the valid ARIA current-page semantics used by this MUI version. No assertion was removed to bypass a failure.

Build warnings remain for html2pdf mixed static/dynamic imports and an existing chunk above 500 kB. No bundle/performance refactoring was attempted. Existing test fixture responses are isolated from the live backend; no financial, configuration, template or delivery writes were performed against real data.

## Remaining scope and blockers

No Phase 2 work was started. There is no application redesign or new browser layout change to reapprove. Browser screenshots from the approved U01–U06 verification remain in `audit/phase1-ui/evidence/`; this closure validates test behavior in the existing React/jsdom harness and reviews the cascade in PostCSS. Production/live backend failure injection and financial writes were not executed.

**Remaining blockers: none.** All five requested failures are closed. Application behavior was correct for the two notification cases; the baseline/canonicalization mechanism was stale/platform-sensitive. No backend change or live data mutation was needed.
