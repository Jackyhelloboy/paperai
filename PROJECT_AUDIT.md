# PaperAI restoration audit — 5 October 2026

Baseline: `9b892635d10333273254b83c5534b6b901547fe2` on `main`.

## Scope

Inspected the complete tracked-file inventory (40 files), production frontend and vendor modules, Worker and draft storage code, Pages proxy, configuration, legacy Python service, GitHub workflows and regression tests. Read the recent commit history and the external adapter introduction/removal patches. Compared the active model and binding with the configuration immediately before the experiment.

## Production provider

Production uses `@cf/google/gemma-4-26b-a4b-it` through the `AI` binding, the same model and binding as before the external-provider experiment. The external adapter and notebook files were removed on 4 October. The unused provider configuration and the test that simulated stale settings have been removed.

At 06:01 UTC on 5 October, the cleanup successfully removed the three retired runtime bindings. Readback verified every unrelated binding's name, type and resource identity was preserved, including AI, draft storage and the usage tracker. The one-time cleanup script was then removed from the project.

The original `backend/` service is a separate legacy implementation and is not called by the production website. Its workflows are manual only.

## Issues corrected

| Finding | Correction |
| --- | --- |
| Draft title updates use PATCH, but Worker/Pages CORS omitted PATCH | Permit PATCH in Worker and Pages preflight responses, and the optional Vercel configuration |
| Known AI 502/503 responses could immediately resend the same inference through Pages | Preserve the provider response and let the bounded lighter retry handle it; retain fallback for transport errors |
| A provider's token-limited completion could be accepted as a complete transcription | Return `AI_OUTPUT_TRUNCATED` for the initial read and avoid accepting truncated verification output; allow one lighter retry using the same model |
| Paid-model errors were retried as generic 503 failures | Return the error without a lighter retry or model switch |
| Binding quota errors using alternate code 4006 appeared as a null provider code | Preserve 4006 and require daily-quota wording when classifying it |
| Several existing tests, including actual DOCX output, were missing from deployment checks | Install locked test dependencies matching the frontend versions and run every regression file before either deployment |
| README described a nonexistent Python Worker and pywrangler entrypoint | Document the actual JavaScript Worker, Pages proxy, storage, local checks and production workflows |
| A scheduled job still pinged the unused Render backend | Make legacy Render deployment and keep-alive workflows manual only |

Unrelated draft, layout, transliteration, source numbering, continuous export, full-frame OCR, adaptive reasoning and prefetch improvements are retained.

## Verification and limits

- All 11 Node regression files pass locally, including a real DOCX package check using the frontend's docx 9.8.1 and JSZip 3.10.1 versions.
- Python files compile and workflow YAML parses. The legacy Python OCR models were not installed or run.
- Live diagnostics before this change verified the deployment account and Worker subdomain match the production account.
- At 04:33 UTC on 5 October, Cloudflare analytics reported 480.18 neurons used today, while a live production OCR request returned HTTP 429 with the daily free-allocation message.
- The public website's usage panel and presence connection load successfully in the browser.

The source audit does not establish why Cloudflare's recorded usage and quota enforcement disagree. The removed Python experiment is absent from the active request path and is not an explanation for the reproduced account-level quota rejection. A code restoration cannot reset Cloudflare's internal allocation counter.

Use the latest **Verify Cloudflare AI quota** workflow output for the post-deployment inference result; a successful diagnostic job means diagnostics completed, not necessarily that the provider accepted inference.


## Extracted-view correction

The OCR prompt used singular column boundary tokens while the shared preview/Word parser expected plural boundary tokens. Both forms now normalize to one canonical block, including adjacent compact rows. Unspaced consecutive lists and attached section headings receive line boundaries without changing their source words or labels. The same normalization runs on Worker output and saved frontend results. Recognition errors in source words require a successful image inference and a visual check; formatting fixes do not establish recognition accuracy.

At 06:03 UTC, a post-cleanup production image probe returned HTTP 200 with an OCR result. The account accepted inference in this test; this does not establish the cause of the earlier quota discrepancy or guarantee every handwritten word. The production smoke test also found that JSON document uploads did not decode base64 into the reader buffer; this is now corrected and covered for plain base64, data URLs and invalid input.
