# Complete corpus review and live Word comparison — 11 October 2026

All 42 supplied Word/PDF documents were read. The 40 unique files produced 208 rendered source pages, all visually reviewed; all 208 page PNGs also passed file-integrity checks. Two exact duplicates are identified in `corpus-review.json`. The unrelated declaration was excluded from question-paper targets and its personal text was removed from the published audit. Supporting placeholder drawings were inspected and excluded as replacement illustrations.

The changes adapt OCR instructions, structure detection and Word layout to these references. They do not fine-tune the hosted model's weights. Previous generated Word outputs are failure examples, not verified targets.

## Latest live scan results

Every unique scan-input PDF was uploaded to the deployed PaperAI app. The first complete 28-page attempt exposed repetition, missing grids and invalid crops. Those outputs were not accepted as verified papers. A subsequent run after the loop/crop guards produced the following results:

| Input | Source pages | Automatic Word pages | Latest observation |
|---|---:|---:|---|
| `maths.pdf` | 9 | 11 | All pages processed. Original drawing pixels, native count grid, matching, comparison circles and some arithmetic survived. Several crops are wrong or duplicated; Class III/IV arithmetic was represented as unsuitable tables; handwriting and missing options require review. |
| `hindi class 1.pdf` | 3 | 4 | All pages processed. Native alphabet/barahkhadi grids and three-column matching survived. Some cell counts, red handwritten corrections and crops are wrong; picture matching includes duplicates and unwanted inferred captions. |
| `class 2 hindi.pdf` | 2 | 2 | Both pages processed without the earlier 97,000-character underscore loop. Inline continuation grids and plain matching separators exposed formatter defects, now covered by normalization regressions. The source PDF puts its continuation page before its title page; that order was retained. |
| `class 3 hindi (1).pdf` | 1 | 1 | All five physical 13-cell grids recovered as 65 native cells. OCR produced unsupported bracket annotations around Hindi text; the later worker/export guards reject these instead of printing them. Exact text still needs review. |
| `english.pdf` | 13 | None | The latest run stopped preparing page 10 with the daily free OCR limit. It was not marked complete and no final Word was exported. Several source pages contain written picture requests without actual drawings; teachers must provide those pictures. |

The four automatic DOCX downloads were rendered, and all 18 resulting pages were inspected individually. They are retained under `out/model-qa/` as **diagnostics requiring review**, not corrected final examination papers. The later normalization/validation changes passed focused regressions; a full new OCR run with all final changes was blocked by the free daily limit. The English quota failure occurred before scan-resume was deployed, so its earlier partial run cannot be recovered through that new cache.

## Fixes implemented and checked

- A4 portrait, 0.5-inch margins, 11/12/13 pt teacher controls, compact flow and explicit new-paper boundaries.
- Literal section/question marks in a fixed right column, including fractional marks. Wider marks columns avoid unwanted wrapping.
- Native editable tables, multirow letter grids, three-column matching, multiline cells, unsolved stacked arithmetic and basic outline shapes. Table headings repeat only when explicitly present.
- Actual source illustrations as separate replaceable Word image objects with preserved aspect ratio. Missing requested pictures and unresolved source images stop editable export.
- Teacher controls for cells, grids, marks, picture width/alignment/replacement and source cropping. Full source-page cropping includes a visible selectable rectangle; banners are also reviewable.
- Word import retains measured image placement widths and paragraph alignment, including separate placements of a reused image. Borderless section/marks and matching tables retain those structures.
- Repetition, invalid normalized crop bounds, malformed nested row markers and unknown annotations trigger OCR verification/retry. Residual unsupported annotations stop Word generation.
- Legacy Indic PDF glyph codes or broken text maps use visual OCR instead of publishing damaged text-layer extraction.
- Faint photographed empty-grid detection uses local background compensation and actual borders. Populated cells and ambiguous mappings are retained rather than guessed.
- Completed scanned pages and original pictures survive a failed request while the same file remains open. Retrying resumes remaining pages; language changes and different files are isolated. Refreshing clears this memory cache.
- Teacher text suggestions require a selection. No default school banner, assistant answer, invented picture or silent copyediting is inserted.

## Validation and remaining work

An additional production Word-import/edit/export check exposed picture-width
edits that had not committed on input and standalone pictures in matching cells
that ignored alignment. Width changes now commit as they are entered, and native
Word picture paragraphs honor their alignment and measured available cell width.
Picture exercises vertically center adjacent numbers and answer blanks. Matching
preview/export rows share consistent column proportions; Word reimport retains
borderless picture exercises and their unequal widths instead of adding borders.

`out/PaperAI-UKG-Maths-Reviewed.docx` and its PDF are a manually source-checked,
one-page target for the first maths scan. All five counting groups retain original
pixels, the 50-cell number grid is native, marks are on the right, and the matching
rows remain unsolved. The exact transcription/crops and a reproducible exporter
script are under `gold/ukg-maths/` and `build-reviewed-maths.cjs`. This reviewed
sample does not certify automatic OCR on the other maths pages.

After deployment `9d37695`, the reviewed Word was uploaded to the production app.
All 50 grid cells and five source pictures survived import. Editing the first
picture to 3.2 cm and right alignment survived a real browser download (1,151,890
EMU and one right-aligned picture paragraph in the DOCX). All five embedded picture
byte streams matched the reviewed source crops. Restoring its original width and
alignment produced a one-page A4 Word/PDF, rendered and visually inspected.
`out/model-qa/production-word-verification.json` records these assertions;
`UKG-Maths-Production-Roundtrip.docx` and its PDF retain the actual live export.
The complete parser audit was rerun on all 42 original records after these fixes.

Seven regression suites pass: worksheet preview/export, PDF page-image Word, measured editable PDF, Word import, editable paper, question-paper model and scan resume. The complete corpus parser audit also ran on all 42 original records. Deployment checks are recorded on GitHub Actions. The two-page layout fixture was rendered and both pages inspected; it verifies formatting mechanisms, not OCR accuracy.

Automatic illustration boundaries remain the main unresolved accuracy issue. Valid coordinates alone do not prove that the correct illustration was cropped. Dense handwritten arithmetic and handwritten corrections also remain imperfect. These need visual teacher review and a further live rerun after the daily free service becomes available. Arbitrary Word merges, complex PDF clipping and scanned diagrams are not certified as completely editable reconstructions. Complex scanned art remains an editable image object.

The earlier corrected 12-page FA2 export is retained in `out/PaperAI-FA2-Corrected.docx` with its PDF and review report. That verified case does not certify the other handwriting inputs.
