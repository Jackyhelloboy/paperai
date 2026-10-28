# PaperAI stability audit

Date: 28 October 2026.

## Reproduced issues and changes

| Issue | Fix and regression coverage |
| --- | --- |
| An inserted word before a cell separator/newline moved into the following question. | Use the edited separator position to choose the owning cell/line. Added browser/Node multilingual mapping cases, including an appended question's newline. |
| Malformed saved pages or lost image data prevented useful resume. | Validate checkpoints page by page; keep intact pages and reread damaged pages. A storage-warning callback cannot crash scanning. |
| Restoring a picture ID could rewrite matching visible text or an ID suffix. | Rename only source-image/banner control IDs. Preserve literal captions and question strings. |
| Failed source-PDF loads remained cached, so Retry repeated the rejected promise. Old readers also remained open. | Reset rejected promises; destroy replaced/cleared readers; invalidate cleared review generations. |
| The review loader used the old PDF library's unsafe default. | Pin patched PDF.js 4.10.38, disable evaluation in both loaders, keep the worker aligned with the reader release, and stage local character maps/font data. This also removes the old vulnerable native-build dependency chain. |
| Overlapping exports/new uploads could substitute another document's images while awaiting header loading. | Snapshot media and export mode before waiting; restore temporary export state on success/error. Snapshot the download filename too. |
| Missing source assets could become diagnostic text in directly generated Word files. | Reject required missing pictures with an actionable error instead of printing a status label. |
| Border-free arithmetic rows lost answer rules when paragraph properties were removed. | Preserve those rules as ordinary editable underscores, without hidden layout cells or calculated answers. |
| Clear data retained hidden draft text/history, and a storage clear failure could be reported as success. | Clear the current draft, preview, history, thumbnail and pending suggestion generation; report a failed persistent clear honestly. |
| Missing external fonts could render Indian-script preview text as boxes. | Stage licensed script-only Fontsource/Noto faces for supported Indian scripts, including Arabic for Urdu/Kashmiri; keep Tahoma first and leave DOCX font requests unchanged. Enable phone pinch zoom. |

## Verification

The full Node suite covers source wording, multilingual edits, OCR evidence guards, source crops, question types, literal marks, embedded Word images, upload concurrency, checkpoint recovery, provider failover, gateway protections and document parsing. New `export-stability.cjs` and `scan-restore-stability.cjs` reproduce asynchronous export and resume/review failures.

Real Chromium checks run at 390 px and 1280 px. They render a 12-page reference PDF, load all ten local script-font families while external network requests are blocked, automatically materialize five reviewed pictures, edit Hindi text, exercise Undo/Redo, export Word, verify five embedded images and no invisible layout tables, and check button bounds, horizontal overflow and uncaught errors. AI endpoints are stubbed; this is not a real handwriting-recognition benchmark.

A separate real production OCR check on the synthetic `12 + 6` image completed successfully in 10 seconds, preserved the question and did not invent its answer. This is one English fixture, not a multilingual handwriting benchmark or a throughput guarantee.

Dependency audit and browser smoke are part of the verification/deployment gates. Individual npm packages, deployed assets and font licenses remain explicit and reproducible. No OCR model, new provider credentials or GPU requirement is added.

## Remaining limits

- OCR can still misread difficult handwriting or poor scans. Current language/script tests do not prove word-perfect OCR in every language.
- Automatic universal two-/four-page fitting is not implemented; never omit questions or reduce the requested font to claim a fit.
- Tahoma requested in Word does not guarantee that every recipient has a font covering every script.
- Very large or ambiguous Teach pastes can exceed exact mapping bounds; the older fallback is not a guarantee of arbitrary structural editing.
- Browser and synthetic production checks do not establish maximum concurrent AI capacity. Provider quotas/outages still require recoverable errors and resume.

This report records tested changes and limits, not a zero-bug certification.
