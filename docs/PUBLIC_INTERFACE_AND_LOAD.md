# Public interface and production verification

The dashboard uses PaperAI branding. Public browser code no longer contains the backend service address. Uploads, status and presence go through same-origin `/api/` routes. The server gateway preserves live socket upgrades, keeps document content verbatim, limits public metadata, maps errors to product messages, and rejects non-public routes.

The dashboard shows a compact “Ready to scan” message. Shared daily percentages, counters and reset dates are removed. Processing shows actual stages and “Ready”, never a guessed percentage. Automatic fallback and return after the daily reset remain in place; no model selection controls were added. The large 228 MB backup is replaced with a smaller language-aware reader; see AUTOMATIC_OCR_FALLBACK.md for transfer sizes and limitations.

Diagnostic pages are excluded from production and their former routes return 404. Static assets continue through the asset cache; only API and blocked diagnostic routes run the gateway. Document readers are shipped from pinned dependencies on the same origin, including the current official spreadsheet reader. Required third-party license notices are retained.

Concurrent availability checks share one request to `/api/usage`; the dashboard does not fetch analytics snapshots. Presence retries use increasing delays with jitter. Ambiguous failed uploads never automatically resubmit to another address or repeat the same scan. Explicit incomplete-output and timeout recovery remain bounded.

## Validation

All 13 regression suites passed. A live synthetic text upload completed automatically and downloaded an editable A4 Word file with 0.5-inch margins. Visual review found bare parenthesized section marks staying inline; the formatter now places those marks in the right column without treating function operands as marks. Preview and Word regressions cover that case. They check automatic upload, cancellation and recovery, quota/reset behaviour, right-side marks, A4 narrow geometry, editable structures, source wording, Word import/export, all 12 authored Word references and all 12 FA2 PDF pages. The parser audit also processed every one of the 42 tracked training files. Parser checks are not visual or character-accuracy certification: 12 records still require OCR or source review.

After each pushed deployment, `.github/scripts/check-production.cjs` checks public routes and runs 180 bounded load requests: 120 dashboard requests across concurrency 5, 10 and 20; 40 usage requests at concurrency 10; and 20 synthetic text uploads at concurrency 5. Each lane starts at most one request per second. Three failures stop further traffic in that phase. Text uploads consume no image inference allocation and must preserve their exact text. The pipeline saves latency and error results as an artifact and a commit status. No claim is made about maximum capacity, large sustained traffic or simultaneous image inference. The former scheduled analytics deployments have been removed. Production deployments are serialized through GitHub Actions; the competing unbuilt Git production trigger is disabled.

## Limits

Brand removal is not source-code secrecy. Browser-delivered libraries, local recognition weights and their download requests are inspectable; hosting can also be inferred from domain/DNS/headers. This repository and its history remain publicly readable. Moving all recognition to private server infrastructure would change the quota-free local fallback and its operating costs.

Previous measured recognition limits remain: complex handwriting and Hindi may be transcribed inaccurately by the fallback. Some source artwork and table borders are preserved as pixels rather than editable shapes. Teachers must review the output before Word export. These are not fixed by interface cleanup or load testing.

## Measured production load

The deployment check for commit `3154829` passed all 180 load requests with zero failures, maximum concurrency 20 and worst-group p95 latency 332 ms. The detailed pipeline artifact is retained at https://github.com/Jackyhelloboy/paperai/actions/runs/38159596494. These measurements cover the stated bounded workload, not maximum capacity.
