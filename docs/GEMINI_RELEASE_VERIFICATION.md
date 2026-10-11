# Server-side backup activation verification

Deployed application commit: `9eccdd6df08339677edfaa44e363edd3be3fb148`.
Date: 11 October 2026, UTC.

## Activation result

The owner added the `GEMINI_API_KEY` repository Actions secret. The workflow detected it and Google accepted the configured model-metadata request. Wrangler installed the secret on the existing `paperai-ocr` Worker through stdin, and the backend deployment completed. The key was not read through the connector, placed in source/frontend/URLs or printed in logs. The original scanner remains the default, with automatic Gemini fallback and primary recovery after its recorded daily block expires. There are no public model switches or browser OCR/language-pack downloads.

Backend workflow: https://github.com/Jackyhelloboy/paperai/actions/runs/38164455478
Frontend workflow: https://github.com/Jackyhelloboy/paperai/actions/runs/38164455409
Backend deployment version: `85c1dd45-e106-4fb1-9b23-0a14e7f2f9af`.

The initial generation check timed out. A bounded IPv4 metadata/generation diagnostic then verified credential/model access but generation returned HTTP 503; one retry also timed out. The final workflow therefore validates credentials before installing the secret and checks generation after deployment. Only explicitly classified transient failures produce a warning at that final stage; invalid credentials, redirects and incomplete generation still fail. Metadata validation remains a required gate.

The final generation check again returned HTTP 503 and the workflow recorded its warning. **Deployment succeeded; live Gemini recognition is not verified.** A green deployment job must not be interpreted as passing handwriting recognition when that warning exists.

## Application and deployment regression checks

All 13 application suites passed in frontend CI, including Word/reference/PDF fidelity, automatic uploads, cancellation/resume, quota routing, public gateway privacy and mocked Gemini request/routing tests. The additional deployment-check suite passed in backend CI, covering header-only credentials, bounded IPv4 requests, separate metadata/generation stages, redirect rejection, sanitized failure messages and transient-error classification. Mocked tests do not measure real model accuracy.

The active frontend release marker matched the deployed commit, public health/status responses were sanitized, and retired browser-reader/diagnostic routes returned 404.

| Operation | Requests | Concurrency | Failures | p95 |
| --- | ---: | ---: | ---: | ---: |
| Dashboard | 40 | 5 | 0 | 65 ms |
| Dashboard | 40 | 10 | 0 | 82 ms |
| Dashboard | 40 | 20 | 0 | 119 ms |
| Availability | 40 | 10 | 0 | 324 ms |
| Synthetic text uploads | 20 | 5 | 0 | 32 ms |

These 180 requests verify website/API/text-reader capacity. They do not measure image-model concurrency or handwriting accuracy. The production report is attached to the frontend workflow.

## Live interface and Word checks

A generated Hindi image and an image-only PDF of the same synthetic page were uploaded independently through the production interface with automatic language detection. Both started automatically, showed stage-based progress without a displayed percentage, then recovered to a sanitized busy message. PDF retry/resume controls remained usable with 0/1 pages completed. The source contained Hindi numerals, right-side marks, a table and a circle. No actual teacher/training document was uploaded by these checks. No successful recognized Word output exists for these two scans, so their content and layout cannot yet be compared to the source.

A separate synthetic text question paper completed automatically and its real Word download was rendered and visually inspected. It produced one A4 portrait page (`11906 x 16838` twips), 720-twip (0.5-inch) margins, a native editable 3-by-2 table, native ellipse/rectangle drawing geometry, two right-aligned marks paragraphs, unchanged blanks and unsolved `12 + 6`. The file contains no rasterized table or shape media. Editing/export works independently of model availability; this successful text export is not a Gemini recognition test.

Evidence:
- `PaperAI-Backup-Activation-PDF-Check.jpg`: actual scanned-PDF busy result.
- `PaperAI-Activation-Word-Export.jpg`: production editor for the independent text/export test.
- `PaperAI-Activation-Export.docx`: actual synthetic production Word download.

The secret is installed and needs no further setup action for automatic routing. Google's generation availability is the remaining blocker. Exact handwriting recognition, live image/PDF layout fidelity and unlimited quota are not claimed.
