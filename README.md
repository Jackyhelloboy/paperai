# PaperAI

Scan question papers into editable Word documents. Upload images, scanned or digital PDFs, Word files, PowerPoint, spreadsheets, or text. Processing starts automatically; extracted wording can be reviewed and edited before downloading Word.

Live application: https://paperai-5up.pages.dev/

## Current architecture

| Component | Location | Deployment |
|---|---|---|
| Dashboard, document readers, preview and Word export | `frontend/` | Cloudflare Pages |
| Public API gateway | `functions/api/[[path]].js` | Cloudflare Pages Functions |
| Image recognition, verification and spelling suggestions | `worker/src/` | Cloudflare Worker |
| Reference inputs and export checks | `training/`, `tests/` | GitHub Actions and local verification |

The Worker uses its primary AI binding and automatically falls back to Gemini when the primary service is unavailable or its daily allowance is exhausted. With a backup key, the primary has a ten-second wait budget. Image OCR tries Gemini 3.5 Flash-Lite with minimal thinking before the general Flash endpoint. The first read sends one full-resolution page; overlapping enlarged crops are reserved for repairs or independent verification of a difficult primary reading. A complete backup read is not repeated merely because the page has tables. Crops retain full-page coordinates and original exported picture pixels.

Image uploads are acknowledged promptly and the browser polls a random scan ID with short requests. A dropped connection resumes that same job instead of starting another inference. Completed PDF pages remain in the open browser's cache. Individual inference chains have a 70-second budget, with optional verification capped at 18 seconds. Temporary results are isolated by scan ID and expire after ten minutes; source images are not written to job storage. A closed or refreshed browser tab still requires reopening the source file.

Scanned PDFs use a bounded pool of two page jobs. Pages are prepared as a slot opens, so scanning starts before the entire document is rasterized. The pool preserves the existing image scale, JPEG quality, reader instructions and validation; it changes scheduling rather than recognition settings. Results and their original pictures are assembled in page order even when requests finish out of order. Progress shows completed pages, active pages and elapsed time. Cancellation and a page error retain every completed page for Retry / resume in the same open file. Two slots avoid flooding the providers, since a slow page may already have both a primary and backup request running.

When the initial reader exceeds its short wait, its existing request remains eligible to finish alongside the backup. The first usable result wins; a backup outage does not throw away an already-running primary scan. This also avoids a second optional verification after accepting a slow primary result.

Word output uses A4 pages, editable text, native tables and shapes, blank answer boxes, and original illustration crops. Shapes and nested answer boxes fit their containing columns. Literal source spelling, irregular numbering, isolated Indic vowel signs and mathematical operands are preserved; the scanner does not solve questions. Handwriting recognition can still differ from the source, so review the extracted text.

The `backend/` Python server and Vercel/Render workflows remain alternative implementations. Production uses the Pages and Worker workflows.

## Deployment secrets

Set these **GitHub Actions repository secrets**, not values in tracked source files:

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Deploy the existing Pages project and Worker |
| `CLOUDFLARE_ACCOUNT_ID` | Select the Cloudflare account |
| `GEMINI_API_KEY` | Enable automatic server-side backup recognition and verification |

On a Worker deployment, the workflow validates Gemini model access, installs `GEMINI_API_KEY` as a Worker secret when supplied, and checks generation and one synthetic production image. An omitted repository key preserves an existing Worker secret. Changing a repository secret alone does not start a deployment; run **Deploy Cloudflare Worker** or push a Worker change to `main` to install the updated value.

No AI credential is included in browser JavaScript or sent in a URL. Gemini requests use a credential header and reject redirects.

## Verify and develop

Use Node.js 22 or newer:

```bash
npm ci --prefix frontend --ignore-scripts
for test in tests/*.cjs; do node "$test" || exit; done
node --input-type=module --check < worker/src/index.js
node .github/scripts/build-pages.cjs
```

Run the Worker locally with credentials in an ignored `worker/.dev.vars` file:

```bash
cd worker
npx wrangler@4 dev
```

Pushing to `main` runs the production Pages deployment. Worker changes also run the Worker deployment. These workflows check the deployed revision and public routes; the Worker workflow separately checks actual image recognition. Verification records in `docs/` distinguish regression results, real exports and remaining recognition differences.
