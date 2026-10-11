# Production scanning verification

Verified functional release: `84143bc16fb708635ec941ce4adbd841f01eb7c0`.
Date: 11 October 2026, UTC.

## Result

Production image scanning and scanned-PDF scanning now complete, and actual editable Word downloads were rendered and visually inspected. The repository secret is installed server-side; no further key setup is needed. The primary scanner remains the default, with automatic backup routing and no public model controls or browser model downloads.

Backend: https://github.com/Jackyhelloboy/paperai/actions/runs/38166542660
Frontend: https://github.com/Jackyhelloboy/paperai/actions/runs/38166542716
Deployment version: `c3af38b9-967b-4fef-b045-863c178cb4ad`.

The earlier busy result masked a production fetch TypeError before any upstream HTTP response. Portable cancellation and manual redirect handling now work in the deployed runtime. Redirect responses are rejected without following them or forwarding credentials. A real production image smoke test verified the deployed revision, preferred endpoint HTTP 503, automatic capacity endpoint HTTP 200, literal `12 + 6`, and no added answer. This smoke test is now a required backend deployment check, separate from provider metadata/text checks.

All 13 application suites and the additional backend deployment-check suite passed. The frontend bounded 180-request website/API/text workload passed. This does not establish image-model concurrency or unlimited quota.

## Live website and Word results

A generated Hindi image and an image-only PDF of the same page were independently uploaded through the live website using automatic language detection. Both completed automatically. Both actual Editable Word downloads contain all six Hindi questions, source numerals, marks, a native editable 2-by-2 table including its blank second row, and the original circle crop. Neither added answers or suggestions. Both rendered as one A4 portrait page (11906 by 16838 twips) with 720-twip margins.

The image export positions both marks on the right. The scanned-PDF export currently leaves those two marks inline. Both editable exports expand the table and place the circle below it, whereas the source places the circle beside the table. These are remaining layout limits: successful scanning is not a claim of pixel-identical editable output. The separate Word matching PDF option preserves original pages as images, with text not individually editable.

These clean synthetic checks demonstrate the live path, not accuracy on every handwritten paper or model fine-tuning. Teachers should review extracted content before exporting.

Evidence: `PaperAI-Live-Scanning-Success.jpg` shows the successful live image editor. Historical activation screenshots document earlier failures and independent text-export checks; they are not the current operational result.
