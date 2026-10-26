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

The Worker uses its primary AI binding and automatically falls back to Gemini when the primary service is unavailable or its daily allowance is exhausted. With a backup key, website image scans start the primary reader and Gemini together; the first usable result wins. Older clients retain the four-second fallback. Non-image inference retains a ten-second wait budget. Image OCR tries Gemini 3.5 Flash-Lite with minimal thinking before the general Flash endpoint. The first read sends one full-resolution page; overlapping enlarged crops are reserved for repairs or independent verification of a difficult primary reading. A complete backup read is not repeated merely because the page has tables. Crops retain full-page coordinates and original exported picture pixels.

Image uploads are acknowledged promptly and the browser polls a random scan ID with short requests. A dropped connection resumes that same job instead of starting another inference. Completed PDF pages remain in the open browser's cache. Individual inference chains have a 70-second budget, with optional verification capped at 18 seconds. Temporary results are isolated by scan ID and expire after ten minutes; source images are not written to job storage. Completed scanned PDF pages also receive best-effort IndexedDB checkpoints on the same device. Reopen the exact source PDF after refreshing to recover saved pages; full-file SHA-256, language and extraction version prevent accidental reuse. Checkpoints expire after 24 hours, are capped at 20 MB, and can be cleared from the upload panel. Storage failures leave normal scanning operational; oversized later pages preserve earlier checkpoints. Pending server jobs still resume by ID while the original tab remains open.

Scanned PDFs use a capacity-aware bounded pool: three page jobs when the browser reports at least 8 GB RAM and four CPU cores, one on devices reporting at most 2 GB, and two when hints are absent or reduced-data mode is enabled. Pages are prepared as a slot opens, so scanning starts before the entire document is rasterized. The pool preserves the existing image scale, JPEG quality, reader instructions and validation; it changes scheduling rather than recognition settings. Results and their original pictures are assembled in page order even when requests finish out of order. Progress shows completed pages, active pages and elapsed time. Cancellation and a page error retain every completed page for Retry / resume in the same open file. The conservative limits avoid flooding providers, since a slow page may already have both a primary and backup request running. Device hints do not guarantee provider throughput or a particular completion time.

When the initial reader exceeds its short wait, its existing request remains eligible to finish alongside the backup. The first usable result wins; a backup outage does not throw away an already-running primary scan. This also avoids a second optional verification after accepting a slow primary result.

Word output uses A4 pages, editable text, native tables and shapes, blank answer boxes, and original illustration crops. Shapes and nested answer boxes fit their containing columns. Literal source spelling, irregular numbering, isolated Indic vowel signs and mathematical operands are preserved; the scanner does not solve questions. Handwriting recognition can still differ from the source, so review the extracted text. Unclear fragments, replacement characters and missing original illustrations are flagged for review. Verification rejects substantial loss of Indic or Arabic script rather than silently accepting translation. Neither the model nor these checks guarantee 100% word accuracy.

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

The [parallel PDF verification record](docs/PARALLEL_PDF_VERIFICATION.md) documents the 21-page live timing, retry behavior, latest deployment checks and remaining recognition limits.

## Clean multi-class question papers

PDF output omits school banners and repeated administrative Name/Roll/Date/Total Marks fields, including partial tables and plain paragraphs. Class and subject remain plain headings; a changed class starts a new paper. Question wording, options, help boxes and matching tables remain literal. Administrative-looking fields in explicit card/form exercises are retained. When cleanup changes a scanned page, export uses the cleaned editable layout rather than the original-page preview containing removed furniture. Fresh scans use checkpoint version v2 so earlier recognition is not reused. This is layout cleanup, not a guarantee of handwriting recognition accuracy.

## Professional export refinements

Answer sections use one consistent writing rule per answer. Section mark equations are rendered in the right-hand score column, including equations with a missing closing scan bracket. Omitted Roman labels are restored only in exactly bounded gaps; a complete, uniquely labelled section sequence can be reordered within its own class. Visible question numbers are never guessed or renumbered. Tick alternatives use fixed column proportions and empty response brackets contain spaces instead of underscore strokes. Figure pages receive a bounded verification pass that can update only crop bounds when illustration counts and captions agree; it never replaces question wording. Fresh image scans use checkpoint version v3 so older unverified crops are not reused. The first-pass wording and pixels remain authoritative; model crop verification is not a guarantee of accuracy.
# Question-paper pictures

### Word editing layouts

The **Word layout** selector alongside Download Word offers three choices:

- **Easy to edit · stable text** (default): section headings and marks are normal Word paragraphs with a right tab stop, single pictures are inline in their own editable paragraph, and non-grid tables can be resized. Genuine answer grids and multi-picture rows stay as tables so their structure is not lost.
- **Drag pictures freely**: the same editable structure, but standalone source pictures use an unlocked floating Word anchor with top-and-bottom wrapping. This avoids pulling the next question heading beside a moved picture. Multi-picture grids remain inline and aligned.
- **Preserve original layout**: retains the layout-oriented Word export for source PDFs and pre-existing Word documents.

The question-paper preview aligns translation questions and their `A.` labels in two columns, keeps true/false answer brackets beside their statements when OCR separated them, and packs adjacent source pictures into rows of up to five. These are presentation repairs; the original OCR text is retained for review.

The Extracted view also contains **Review every page** for a scanned PDF. Each original PDF page can be rendered on demand beside the extracted text from that page, allowing teachers to inspect skipped or misread question numbers, marks, figures and continuation lines before exporting the editable Word reconstruction. These original-page views are read-only evidence, not generated illustrations. Paper AI preserves source page order and warns when a scanned page returns no text. The Word output remains reconstructed/editable, so typography and handwriting cannot be guaranteed pixel-identical to a photographed original.

Paper AI preserves source illustrations using `SOURCE_FIGURE`/`SOURCE_BANNER` markers. The **Pictures · Add / AI** control in the Extracted view now lets a teacher choose an exact question, insert a PNG/JPEG/WebP, preview the picture, and include it in the editable `.docx` export. Added pictures are converted to bounded PNGs in the browser. Original PDF pictures are not replaced by generated ones.

AI illustration generation is **optional and disabled by default**. It uses the Worker-side `GEMINI_API_KEY` secret (never expose this key in browser code) and Google's `gemini-2.5-flash-image` endpoint. To allow it, set the Worker environment variable `ENABLE_IMAGE_GENERATION=true`, and optionally set `IMAGE_GENERATION_DAILY_LIMIT` to a value from 1 to 30 (default 10). The existing `KV` binding must be configured. Calls are counted against the budget before sending requests; KV counters are eventually consistent, so apply an external hard spending cap at the provider before enabling a public deployment. If image generation is unavailable or the daily limit is reached, the manual picture upload and Word export remain available.

# Deep OCR verification

The default **Fast automatic verification** races the configured Cloudflare/Gemini readers and independently rechecks difficult or incomplete pages when possible. For unusually difficult scanned papers, turn on **Deep dual-AI OCR verification** before uploading to request a separate literal re-read of every page when time and provider capacity permit. The second result is accepted only if existing numbered questions, section headings, marks and native-language content survive comparison. Disagreements or an unavailable second pass are flagged in **Review every page**. Deep mode is slower and can use additional AI credits. Each mode has separate saved-page checkpoints, so completed scans are not mixed. Server-side completed per-page results are collectible for up to 24 hours, but processing additional PDF pages still requires the browser tab to remain open; switching apps may pause that coordination until the tab becomes active again.

**AI Print Review** checks extracted text and layout markers; it is not a pixel-perfect Word/PDF renderer. Inspect the source page alongside each extraction and use Word's Print Preview before printing. No OCR model can guarantee complete transcription of illegible handwritten pages.

## Fast-mode AI bit arrangement

After extraction, PaperAI shows the paper immediately and asks the configured Gemini model to classify the visible question bits in the background. The **AI Arrange Bits** button can retry this step without rescanning the PDF. Gemini only returns the type of each existing bit and an image-grid column count (1–5). The server and browser validate exact bit titles and allowed layout types before applying them. This can change the geometry of original, intact source images in the preview and editable Word file; it never asks the model to repaint a PDF crop, rewrite a question, add an answer or change a mark. A compact snippet of each bit keeps the request small even for long papers. Standard five-column image grids remain available when Gemini cannot respond; the public layout helper is covered by a small daily KV-backed AI budget.

