# PaperAI production architecture

## Purpose and source fidelity

PaperAI turns teachers' rough question papers into editable Word documents. Preserve literal question wording, language/script, numbers, marks, options, answer positions and actual source illustrations. Do not solve questions, translate them automatically, fill empty grids, invent numbering or silently replace a source figure. Teacher-approved suggestions are reversible edits; they do not retrain the OCR foundation models.

The current implementation is Pages + Worker. Historical iterations remain in git history; `README.md` and the production code describe the active routing rather than the former prototype architectures.

## Runtime boundaries

- `frontend/`: file selection, local document readers, image preparation, preview, Teach, checkpoints and Word export. The public build stages specific libraries and licensed assets; it never exposes `node_modules`.
- `functions/api/[[path]].js`: same-origin public gateway. It restricts routes, checks upload size and returns sanitized public errors/metadata.
- `worker/src/`: durable scan jobs, primary/backup image recognition, source-evidence checks, suggestions, layout classification and controlled picture retrieval. Credentials stay in Worker secrets.
- `.github/`: verification, staging and production deployment. Alternative Python/Vercel implementations are not the production path.

## Reading and scheduling

1. Validate file extension and size. Read reliable embedded PDF text and supported Office/spreadsheet/plain-text formats locally.
2. Use the pinned PDF.js compatibility reader and module worker to render scanned/illustrated pages. Both loading paths disable `isEvalSupported`. Character maps and standard-font data come from local assets. The worker URL carries the reader release query to reduce stale-version mismatch.
3. Analyze page geometry and prepare bounded, high-resolution images. Keep structured geometry and drawings intact; reserve compact line mosaics for suitable simple text pages.
4. Process PDF pages with a bounded, device-aware pool, rendering each bitmap only when a slot is free. Release completed bitmaps and PDF resources. Assembly always follows source-page order.
5. Submit to the same-origin scan API using a random job ID. Short polling requests recover the existing job after a transport interruption instead of blindly creating another inference.
6. The backend coordinates its primary reader and configured Gemini backup, using bounded deadlines and source-evidence checks. Provider capacity, quota and credentials remain separate concerns. No additional browser OCR model or GPU is required.
7. Validate source scripts, question/section coverage, marks, response positions, illustration geometry and supported marker syntax. Recheck difficult/incomplete readings against source pixels. These checks cannot prove perfect handwriting recognition.

Completed PDF pages receive best-effort browser checkpoints keyed by full-file SHA-256, language and extraction version. Checkpoints expire after 24 hours and share a 20 MB budget. Validate recovered pages independently: malformed data or missing illustration assets invalidates that page, while intact pages remain reusable. Reopening the same PDF is required after refresh. Storage failure must not stop ordinary scanning.

## Editing and Word

`paper-text.js` maps visible teacher edits onto protected layout markers. jsdiff keeps distant changes distinct; Unicode segmentation preserves full grapheme clusters. Insertions around line/cell separators must stay with their intended question. Large or ambiguous edits may decline exact mapping and use the existing Teach fallback; never represent this as guaranteed arbitrary-paste layout preservation.

The default Word export uses normal paragraphs and tab stops for layout columns, picture rows, captions and marks. Actual exercise grids remain editable tables. Source-layout modes can retain measured source structures. Pictures are embedded bytes, not external Word relationships. A required missing source image rejects export with an actionable error. Each asynchronous export captures its media before awaiting header work so a subsequent document cannot replace its pictures. Ordinary paragraph arithmetic rows retain their answer rules.

Word requests Tahoma, 11 pt regular body and 12 pt bold headings/marks on compact A4. Preview and Teach use locally hosted script-only Noto fallbacks when Tahoma cannot display the text; this does not alter the font requested in DOCX XML. Actual Word glyph rendering still depends on the receiving application's installed fonts. Two-/four-page budgets are design targets, not an implemented universal page fitter.

Source PDF review releases readers when the source changes or data is cleared. A failed load resets its rejected promise, allowing Retry to open the PDF again. Restoring saved pictures renames control-marker IDs only, preserving literal question and caption text.

## Pictures and privacy

Original source illustrations take precedence. Explicit missing-picture requests may use the finite reviewed local raster catalog with preserved provenance and licensing. Unreviewed online candidates require teacher choice. Never crop ordinary question text/ruling as a substitute picture or claim keyword matching is visual verification.

Teach learns only explicit teacher-approved confusion pairs locally. No unreviewed OCR guess is treated as training truth. Public screens, errors and printable papers do not expose provider credentials, private diagnostics or internal operational text.

## Verification and limits

- `npm ci --prefix frontend --ignore-scripts`
- `node --test tests/*.cjs`
- `npm audit --prefix frontend --audit-level=high`
- `node .github/scripts/build-pages.cjs`
- `node frontend/node_modules/playwright/cli.js install --with-deps --only-shell chromium`
- `node .github/scripts/browser-smoke.cjs`

Browser smoke uses real mobile/desktop Chromium, PDF parsing/rendering, local licensed pictures, script fonts, Teach Undo/Redo and Word downloads. AI endpoints are stubbed in this suite, so it makes no OCR accuracy or provider-capacity claim. Production smoke verifies the deployed release, required assets, route protections and bounded synthetic request handling. Real-model checks must be reported separately.

No test suite establishes zero bugs, perfect OCR in every language or guaranteed two-/four-page fitting. Preserve uncertain source content for teacher review and report unverified behavior explicitly.
