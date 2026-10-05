# PaperAI

PaperAI extracts photographed exam papers with Cloudflare Workers AI and produces editable Word documents.

## Production configuration

| Component | Implementation |
| --- | --- |
| Website | Static HTML and browser-side file readers on Cloudflare Pages |
| API proxy | `functions/api/[[path]].js` forwards to the OCR Worker |
| OCR service | JavaScript Worker in `worker/src/index.js` |
| AI model | `@cf/google/gemma-4-26b-a4b-it`, through the `AI` binding |
| Draft text and order | D1 |
| Draft page photos | R2 |
| Usage estimate and live presence | Durable Object |
| Administrative training samples | KV |

Production website: https://paperai-5up.pages.dev  
OCR Worker: https://paperai-ocr.mdjawaadkhan57.workers.dev

Images and scanned PDFs use Cloudflare AI. The browser reads embedded PDF text, modern Office files, spreadsheets and text files locally where supported. Draft photos can be saved before OCR succeeds.

The `backend/` Python PaddleOCR/EasyOCR service is legacy code, is not called by the production website. Its Render deployment and keep-alive workflows are manual only. It has not been validated as a replacement production service.

## OCR behavior

- Preserve source wording, numbering, punctuation, scripts and answer blanks.
- Use the same Cloudflare model for the initial scan and lighter retry.
- Keep the full page; add overlapping detail images for dense or structured pages.
- Enable reasoning only for hard or structured pages; the lighter retry disables it.
- Verify suspicious output against the same source image.
- Reject token-limited output rather than accepting an incomplete page.
- Keep provider errors distinct from transport failures; the Pages proxy reaches the same account and cannot supply another AI quota.
- No automatic paid model or paid-plan fallback.

## Usage and quota

The dashboard displays Cloudflare-reported, account-wide Workers AI neuron usage for the current UTC day. A credential-protected GitHub job copies Cloudflare Analytics totals into the existing D1 database on deployment and on a 15-minute schedule. The public app never receives an API token. Reports can lag or be sampled; they are not the internal enforcement ledger. The panel shows when the report was fetched.

Cloudflare's daily allowance resets at 00:00 UTC (05:30 IST). There is no local quota renewal or per-user limit. A new day with no report shows unavailable values rather than an invented full allowance. Actual provider rejections remain visible until a later inference is accepted; refreshing the dashboard never consumes AI or resets its quota.

## Deploy

Push changes to `main` in `Jackyhelloboy/paperai`.

- `Deploy to Cloudflare Pages` validates the project and deploys `./frontend` using the root `wrangler.toml`.
- `Deploy Cloudflare Worker` validates the project, resolves the D1 database ID, applies migrations, provisions R2 and deploys the Worker.
- Both workflows run the full OCR, routing, draft and Word-export regression suite.

GitHub Actions needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Keep credentials in GitHub/Cloudflare secrets.

For a manual Pages deployment from the repository root:

```bash
npx --yes wrangler@4.147.0 pages deploy --project-name=paperai --branch=main
```

Deploy the production Worker through its GitHub workflow; the checked-in D1 ID is a placeholder replaced by that workflow. Do not deploy it unchanged.

## Local checks

Use Node.js 22 or later:

```bash
npm ci --ignore-scripts
npm test
```

For local Worker development:

```bash
cd worker
npx wrangler@4 dev --local
```

Local testing does not validate the real account's AI quota or production bindings.

## Main API routes

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | Worker release, model and provider |
| `/api/ocr` | POST | File extraction or image OCR |
| `/api/usage` | GET | Cloudflare-reported daily usage and observed provider status |
| `/api/analyze-paper` | POST | Page grouping and continuity |
| `/api/suggest-word` | POST | Capped same-model suggestions |
| `/api/drafts` and subroutes | GET/POST/PUT/PATCH/DELETE | Draft creation, photos, text, titles and ordering |
| `/api/live` | WebSocket | Current connected session count |

Drafts have a 30-minute idle expiry, best-effort discard on tab close/refresh, hourly cleanup and a one-day R2 photo expiry backstop.

## Live account diagnostics

Run **Actions → Verify Cloudflare AI quota → Run workflow** to read Worker binding metadata, account usage analytics and one small owned-image production OCR probe. It uses existing deployment credentials only against Cloudflare's API and never sends those credentials to the public OCR endpoint.

Analytics can be delayed or sampled; they do not expose the internal quota enforcement counter. See [PROJECT_AUDIT.md](PROJECT_AUDIT.md) for the restoration findings.


The Worker deployment also verifies production text extraction, draft creation/renaming and owner isolation with disposable owned test data. These smoke checks do not call AI; image inference availability is reported separately by the quota diagnostics workflow.

## Extracted text and phone exports

The Extracted preview, Copy, UTF-8 TXT download and Word download all use the same corrected structured source. Matching rows retain the adjacent columns from the photo without solving them. Android controls have readable text, 44–48px touch targets and a continuous document scroll. The auto-detection explanation panel has been removed.

Handwriting scans retain the complete source image and focus close-ups on confidently detected page bounds. Hindi option and matching exercises receive one independent image verification pass to reduce anchoring to misread words. This can add inference time and neuron usage; it does not guarantee perfect handwriting recognition.


## Focused extraction and desktop Word

Selecting a file prepares its first image locally. AI inference starts only after Scan & Rebuild. Upload controls and drafts stay hidden during extraction and results; Go back cancels pending work and returns to the same file selection. Failed extraction offers Retry, and a cancelled run cannot overwrite a later result. Multi-page analysis has a bounded timeout with local ordering fallback. PDF workers, rendered canvases and temporary extraction caches are released after use.

Word exports use native editable paragraphs for ordinary questions and tab-aligned matching pairs, with explicit black text and Mangal for Hindi. Real source tables and diagrams retain their structure. Copy, TXT and Word preserve the same corrected source characters. This improves font compatibility but does not repair unreviewed recognition mistakes.


## Single-read extraction and tab exports

OCR makes one Workers AI inference request per scanned page. Verification passes, reasoning, retry loops, alternate AI routes and automatic AI batch grouping are disabled. Errors offer a manual Retry. Selecting files, ordering pages, switching tabs and typing corrections do not call AI. One optimized full-page frame is sent without additional close-up image tokens. Completed selected files and PDF page reads are reused in this tab; Back also preserves saved corrections.

The top result actions are exactly three: Copy, Word and Teach in Extracted; Copy, TXT and Teach in Plain text. AI Suggestions lives inside Teach and runs only on an explicit click for a selected word/short phrase, with cached suggestions and no automatic application. Save & apply retains the selected export tab. The progress card shows preparation/read/ready stages rather than a made-up percentage of model work.
