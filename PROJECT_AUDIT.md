# PaperAI restoration audit — 5 October 2026

Baseline: `9b892635d10333273254b83c5534b6b901547fe2` on `main`.

## Scope

Inspected the complete tracked-file inventory (40 files), production frontend and vendor modules, Worker and draft storage code, Pages proxy, configuration, legacy Python service, GitHub workflows and regression tests. Read the recent commit history and the Unlimited-OCR introduction/removal patches. Compared the active model and binding with the configuration immediately before the experiment.

## Provider history and current state

- Before the experiment, commit `3b220a8a40344bd8cf930c42e1556a38e6c5874f` used `@cf/google/gemma-4-26b-a4b-it` through the `AI` binding.
- `7515f4f7556de42fabff8a4d4d5ed357ce02dc0b` introduced an optional external `baidu/Unlimited-OCR` GPU adapter on 4 October.
- `51a603d9592c71fe98505b3788e254899e18cdc0` and `525806c5c972fdd6a3ee9fa975f6d902f15684be` added Kaggle notebook/API experiments.
- `10b0342296a681cfd52dbfa432256185bc843af9` removed the adapter, notebook files and their tests/workflow at **15:41 UTC on 4 October (21:11 IST)**.
- The current production OCR path calls Cloudflare `env.AI.run` directly. It uses the same model as before the experiment. Old `OCR_PROVIDER`/`UNLIMITED_OCR_*` settings cannot select a GPU endpoint in this code.
- The original `backend/` PaddleOCR/EasyOCR service is a separate legacy implementation; it is not the removed Unlimited-OCR checkpoint and is not called by the production website.

The restoration regression test passes even with legacy variables present and an exhausted local usage tracker. It fails if OCR tries to contact an external GPU server.

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

