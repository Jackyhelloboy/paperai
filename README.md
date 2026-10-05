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

The displayed PaperAI usage estimate resets at five-minute boundaries (:00, :05, :10, and so on). It is informational and does not block OCR.

Cloudflare controls its separate daily free allocation. Its documented reset is 00:00 UTC (05:30 IST). Resetting the local display does not reset Cloudflare's quota. The Worker reports provider rejections when they occur and never treats its local estimate as proof of the account's remaining allowance.

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
| `/api/usage` | GET | Informational five-minute usage estimate |
| `/api/analyze-paper` | POST | Page grouping and continuity |
| `/api/suggest-word` | POST | Capped same-model suggestions |
| `/api/drafts` and subroutes | GET/POST/PUT/PATCH/DELETE | Draft creation, photos, text, titles and ordering |
| `/api/live` | WebSocket | Current connected session count |

Drafts have a 30-minute idle expiry, best-effort discard on tab close/refresh, hourly cleanup and a one-day R2 photo expiry backstop.

## Live account diagnostics

Run **Actions → Verify Cloudflare AI quota → Run workflow** to read Worker binding metadata, account usage analytics and one small owned-image production OCR probe. It uses existing deployment credentials only against Cloudflare's API and never sends those credentials to the public OCR endpoint.

Analytics can be delayed or sampled; they do not expose the internal quota enforcement counter. See [PROJECT_AUDIT.md](PROJECT_AUDIT.md) for the restoration findings.

