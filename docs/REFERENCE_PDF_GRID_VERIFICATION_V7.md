# Training PDF geometry verification

The reference folder is a formatting and regression corpus, not a model-weight training job. Authored Word documents supply formatting references; incoming paper pixels supply the actual questions, marks and geometry. This change does not copy answers or school identities from a different reference.

## Corrections

The curved photographed page in `training/class 2 hindi.pdf` contains two blank 13-cell strips. Earlier output guessed eight cells per strip. Physical border analysis now follows the local curve between adjacent vertical divisions. It ignores an uneven outside stroke only when both horizontal borders fail to connect it, preserves populated cells, and uses the leveled physical row height rather than the taller curved-page bounding box.

Direct pixel checks now detect both 13-by-1 strips on that page, plus the 5-by-8 answer grid and four 13-by-1 strips on the other page. The exact cropped training pixels are in `tests/fixtures/hindi-curved-grids.pgm`; the fixture uses the maximum RGB channel, matching the production detector. Crop: x=0, y=0, width=595, height=160 of the rendered first PDF page. Source PDF SHA256: 77cd18751d42052aa0ee21d6c01e8653888dad03f2572b9174d5601dde47c229.

The backend previously accepted only one-row grid measurements. It now validates and passes multi-row evidence to both recognition providers, including measured size, without permitting invalid dimensions, out-of-page rectangles, null entries or prompt text in geometry fields.

The output guard previously rejected TABLE_REGION despite the recognition prompt and Word exporter supporting it. That mismatch is fixed. Valid table bounds can now survive recognition verification and reach the side-by-side editable table/picture formatter. Off-page table bounds remain rejected. Grid reconciliation replaces stale recognition bounds instead of duplicating them.

## Verification

All 13 application suites and the additional deployment-check suite passed locally. New regressions cover the real curved training strips, physical cell count, row height, stale-bound replacement, valid and invalid table markers, passing a 5-by-8 grid to the backup request, and rejection of malformed input geometry. Existing tests still cover the 12 authored Word references, 12 FA2 PDF pages, literal marks, matching, shape/grid editing, uploads, cancellation and provider recovery.

Live release verification is recorded below after deployment. Recognition accuracy and banner crops still require visual checks; this report is not a claim that every handwritten PDF produces a pixel-identical editable Word document.

The initial deployment was verified through authenticated Worker settings because the public health response returned healthy without a revision value. The private comparison requires the exact current release SHA and never prints secret bindings. Run 38194489043 passed the required production image scan (HTTP 200, literal question, no added answer); frontend run 38194489052 passed deployment and all production checks.

The first repeated training PDF exported without visible layout markers, with eight right-side marks and editable matching. Visual inspection of all three Word pages still found transcription and geometry differences. Follow-up changes reject a partial grid subset when its horizontal borders visibly continue outside the measured bounds. For already-selected difficult-page verification, a configured backup provider now independently rechecks the primary draft instead of repeating the same reader. Primary first-pass routing, next-request primary recovery, literal-content guards and primary-only usage accounting remain intact. If verification is unavailable, a usable first draft is retained; ambiguous text is not guaranteed correct.

The banner instructions no longer provide a rectangle that could be copied mechanically. They require actual measured school-title/address/logo bounds above editable student/exam fields. Short multi-column numbered questions use native unbordered row cells in source row order, preserving numbering mistakes and blanks. Measured geometry markers no longer detach a question label from its following grid.

Release `566801952d8ec55b31ed3e7eb212bace922712ca` passed frontend run 38196346976, backend run 38196346953 and worksheet run 38196347072. The repeated two-page training PDF completed and its real editable Word downloaded. All three rendered Word pages were inspected. The conjunct श्र and the isolated vowel sign ू improved in this sample, and the export contained no layout syntax. Exact fidelity was still not achieved: source numbering and some columns differed, a final strip had an uncertain count, banner fields were partly duplicated, and the two-page source occupied three Word pages.

Visual QA also revealed duplicate grid rows when recognition inserted TABLE_REGION controls between repeated GRID markers. Reconciliation now treats those controls as metadata within an empty-grid group and removes stale controls when consolidating against physical grid evidence. A regression reproduces both duplicated 13-cell strips from the training test. Ambiguous mappings and populated cells remain untouched.

This is reference-driven extraction and layout verification, not completed supervised model-weight training. No verified source-PDF-to-authored-Word target pairs are established in the corpus manifest. The successful interface screenshot records the last live recognition/export before the duplicate-grid reconciliation fix; it is not proof of exact reference output.
