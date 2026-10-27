# PaperAI coding-agent rules

Applies repository-wide. Consult `README.md`, `ARCHITECTURE.md`, and `docs/ONLINE_PICTURES.md` before altering scanning, pictures, or Word export.

## Core product behavior
- PaperAI transcribes and formats actual worksheets; it must not fabricate text, answer questions, renumber questions, alter original spelling, or infer missing marks.
- Existing source pictures, crops, layouts and counts are authoritative. Do not silently replace a scanned or uploaded illustration with online imagery.
- Preserve editable text, tables, question marks, boxes and independently selectable Word images. Ensure images are embedded in DOCX bytes, not remote links.
- Keep the deployed Cloudflare Pages gateway, Worker OCR, browser preview, and exports compatible.

## Internet picture agent
- Search individual explicit picture requests only; never send the complete worksheet or students' personal information to internet search.
- Prefer lawful, recognizable, high-resolution raster illustrations/photos rather than generating approximate SVG object drawings from paths.
- The current Commons path supports public-domain/CC0 only; verify the *individual file's* license and preserve source/creator/license attribution metadata. Avoid hotlinking, arbitrary URLs and unsafe redirects.
- A keyword/filename match is **not** image recognition. Do not mark candidates vision-verified or automatically pick visually uninspected candidates while claiming that they were validated by AI.
- A future visual verifier should check object identity, completeness, child suitability, uncluttered composition, labels/watermarks, and worksheet-appropriate style. If uncertain, offer teacher choice and retain the original image.
- Do not screenshot search-result pages to obtain images; retrieve permitted original image bytes or high-resolution raster thumbnails. Screenshot only when necessary, authorized and quality-preserving.
- Validate hosts, size, format, actual byte signatures and dimensions. Preserve ratio; avoid tiny/blurry, cropped or distorted pictures.
- Place every chosen picture with its exact intended question and preserve picture group ordering/count; never accidentally insert answers or labels.
- Keep teacher review, replacement and recoverable failure paths. Unavailable or invalid results should remain explicit pending-picture requests, not fabricated pictures.

## Quality and security gates
- No credentials in browser JavaScript, repository-tracked files, public API URLs or logs.
- Preserve strict OCR/source evidence behavior in `ARCHITECTURE.md`.
- Run `node tests/picture-search.cjs`, `node tests/default-picture-materialization.cjs`, `node tests/public-gateway.cjs` and all applicable Word/layout tests when changing picture retrieval/export.
- Test positive and negative image-match scenarios, no-results/offline behavior, licensing, input validation, file signatures, dimensions, source image preservation, Word embedded media and correct image placement.
- Never claim a live external search, real model-based image validation, successful DOCX visual comparison, or production deployment without actually verifying it.
- Prefer small, reviewable changes that preserve existing APIs. Document any unimplemented requirement explicitly rather than describing it as completed.
