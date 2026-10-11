# PaperAI question paper model

The entire supplied corpus was read and rendered: 42 Word/PDF files, 40 unique files, 208 unique rendered pages, and 28 unique scanned-input pages. Exact duplicates are recorded by SHA-256. Every unique file received a page-overview visual review. The earlier corrected FA2 received separate individual-page verification. This does not mean every scanned character or live export has passed.

## Teacher workflow

Upload handwriting or a printed source, review the extracted questions, use Correct text for wording and Paper layout for cells, grids, marks and pictures, then export Editable Word. A4 portrait uses 0.5-inch margins. Compact A4 reflows source scan boundaries while retaining new papers; Keep source pages retains source boundaries. Explicit answer rules and grid cell counts remain content.

## Rules derived from all reference families

| Reference family | Observed mechanism | App behavior |
|---|---|---|
| Science annual and SA1, FA2 | Dense sections, matching, diagrams and picture rows | Keep headings with their first block; use separate original picture assets |
| Hindi SA1 and scanned Hindi | Combining characters, multirow letter grids, picture matching and corrections | Keep graphemes in cells; preserve visible edits; do not complete blanks |
| English 6 and handwritten English | Passages, fractional marks, choices, comparative tables | Preserve wording and passage order; literal marks in a fixed right column; never fill forms |
| Social 6–10 | Multiline matching/table cells and alternatives | All original columns, multiline cells and visible column widths |
| Handwritten Maths and entrance papers | Stacked arithmetic, place-value charts, grids, outline and shaded shapes | Native editable arithmetic/tables; explicit answer-space flags; exact shaded art retained as pixels or source paths |
| Previous generated outputs | Duplicate banners, invented pictures, wasted pages, broken matching | Treat as failure examples, never desired targets |

## Fidelity constraints

- No unseen school banner, assistant answer, answer key, introductory text, encouragement or suggestion belongs in the exported paper. Source-written content is retained.
- Suggestions cannot automatically replace a teacher’s text. Replacements require selection or an explicit edit.
- Missing requested pictures block Word export until a teacher supplies them; the app does not fabricate a stock picture.
- Pictures preserve aspect ratio. Teachers can change physical width/alignment, replace an asset, or recrop it from the OCR source page.
- Basic shapes, grids, bordered tables, matching rows and arithmetic remain editable in Word. Complex scanned illustrations retain original pixels in replaceable image objects.
- Only an explicit visible header row repeats as a table header. Exercise rows remain ordinary cells.
- This is reference-driven prompting and deterministic layout, not hosted model-weight fine-tuning. The supplied folder has not been declared a set of verified scan/target pairs.
- The unrelated declaration is excluded from question-paper targets. No questions, identities or answers are copied between reference papers.

## Per-file coverage

| File | Role | Rendered pages | Parser check |
|---|---|---:|---|
| 1Class_1_Science_Annual.docx | reference | 2 | text-parser-pass |
| 1Class_2_Science_Annual.docx | reference | 3 | text-parser-pass |
| Class_3_Science_Annual.docx | reference | 3 | text-parser-pass |
| Class_4_Science_Annual.docx | reference | 2 | text-parser-pass |
| Class_5_Science_Annual.docx | reference | 3 | text-parser-pass |
| English 6.docx | reference | 2 | text-parser-pass |
| HINDI SA-1 (1).pdf | reference | 17 | OCR-or-flow-fallback-required |
| HINDI SA-1.pdf | reference | 17 | OCR-or-flow-fallback-required |
| I - SA-1 SCIENCE.pdf | reference | 4 | measured-parser-pass |
| II-SA-1 SCIENCE.pdf | reference | 4 | measured-parser-pass |
| III-SA-1 SCIENCE.pdf | reference | 4 | measured-parser-pass |
| IV SA-1 SCIENCE.pdf | reference | 4 | measured-parser-pass |
| New Microsoft Office Word Document (3).docx | reference | 7 | text-parser-pass |
| Social 10.docx | reference | 2 | text-parser-pass |
| Social 6.docx | reference | 2 | text-parser-pass |
| Social 7.docx | reference | 2 | text-parser-pass |
| Social 8.docx | reference | 2 | text-parser-pass |
| Social 9.docx | reference | 2 | text-parser-pass |
| UKG FA-1.pdf | reference | 4 | measured-parser-pass |
| V-SA-1 SCIENCE.pdf | reference | 4 | measured-parser-pass |
| class 2 hindi.pdf | scan-input | 2 | requires-live-OCR |
| class 3 hindi (1).pdf | scan-input | 1 | requires-live-OCR |
| class 3 hindi.pdf | scan-input | 1 | requires-live-OCR |
| english.pdf | scan-input | 13 | requires-live-OCR |
| entrance class 2.pdf | reference | 4 | OCR-or-flow-fallback-required |
| entrance class 3.pdf | reference | 4 | OCR-or-flow-fallback-required |
| entrance class 4.pdf | reference | 4 | OCR-or-flow-fallback-required |
| entrance class 5.pdf | reference | 4 | OCR-or-flow-fallback-required |
| entrance class UKG.pdf | reference | 3 | measured-parser-pass |
| fa-2 sci.pdf | reference | 12 | measured-parser-pass |
| fa-2-sci-1-extracted (2).docx | export-under-review | 15 | text-parser-pass |
| final PT_Form_VIII_Declaration_Updated (1).docx | non-question-document | 1 | text-parser-pass |
| hindi class 1.pdf | scan-input | 3 | requires-live-OCR |
| maths.pdf | scan-input | 9 | requires-live-OCR |
| out/Class_4_Science_Annual.docx | export-under-review | 14 | text-parser-pass |
| out/PaperAI-FA2-Corrected.docx | export-under-review | 12 | text-parser-pass |
| out/PaperAI-FA2-Corrected.pdf | export-under-review | 12 | measured-parser-pass |
| out/Social 7.docx | export-under-review | 5 | text-parser-pass |
| out/grid_sample.docx | export-under-review | 1 | text-parser-pass |
| out/multi_sample.docx | export-under-review | 2 | text-parser-pass |
| out/paper.docx | export-under-review | 2 | text-parser-pass |
| sci fa-2.pdf | reference | 12 | measured-parser-pass |

## Verification

Run `npm ci --prefix frontend`, the nine regression scripts in the deployment workflow, and `node tests/training-corpus.cjs`. For complete visual corpus review, install `training/requirements-layout.txt`, LibreOffice and Poppler, then run `training/review_corpus.py --render-root /absolute/scratch/path` using the bundled runtime. `corpus-review.json` records content, tables, picture bounds and hashes; `corpus-parser-results.json` records every parser check. Live OCR/Word rendering results are recorded separately. A structural pass does not certify handwritten OCR accuracy.

## Additional failures caught by live testing

A Hindi scan produced a repetitive underscore loop and omitted sections. The worker now rejects token loops, rechecks a bounded draft against the image, and never publishes the loop as successful OCR. Invalid illustration coordinates also trigger verification/retry rather than fabricated crops. Photographed Hindi barahkhadi grids needed local background compensation; the detector now finds all five 13-cell rows in Class 3 and preserves populated grids by refusing to classify them as empty. Legacy Indic PDF glyph codes and broken matra ordering go through visual OCR instead of trusting a damaged text layer.

The latest comparison is in [LIVE_REVIEW.md](LIVE_REVIEW.md). Unsupported annotations and missing source pictures stop editable export. PDF retries retain completed pages and their original assets while the same file remains open; refreshing the page clears this memory cache. The crop editor shows the full source page with a selectable rectangle, including source banners. Word imports retain observed picture sizes/alignments and borderless section/marks and matching columns.

## Measured formats and original Word objects

[REFERENCE_FORMAT_REVIEW.md](REFERENCE_FORMAT_REVIEW.md) records the 12 authored Word references, the 15 diagnostic DOCX/PDF pairs, font and spacing presets, original-object preservation, floating-table/banner fixes, and the remaining visual/OCR limits. The app now also supports creating and exporting a paper without a file upload.
