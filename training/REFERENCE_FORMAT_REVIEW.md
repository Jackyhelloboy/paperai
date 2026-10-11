# Reference format review — 11 October 2026

Implemented measured formats and offline Word preservation checks using all 12 authored question-paper Word references. Existing full-corpus PDF/handwriting review remains in QUESTION_PAPER_MODEL.md and LIVE_REVIEW.md. No file was uploaded to the website during this review.

## Formatting implemented

| Format | Body | Heading | Line spacing | Question indent |
|---|---|---|---|---|
| Annual science | Arial 10 pt | Arial 12 pt | Single | 0.25 inch |
| Social / English | Tahoma 11 pt | Times New Roman 13 pt | 1.5 | None |
| Science worksheet | Tahoma 12 pt | Tahoma 12 pt | Single | None |
| Compact default | Arial 11 pt | Arial 12 pt | 1.15 | None |

These are measured family defaults. References also contain inherited fonts, mixed sizes, passage-specific styling and manual spacing. A preset does not reconstruct every mixed-format run. Teachers can set body and heading fonts/sizes, line spacing, paragraph gap, question indentation and grid height.

A4 portrait uses 11906 × 16838 twips, with 720-twip margins on all sides. Marks retain their literal value in a right-aligned column. Tables retain column proportions and multiline content. Underlined question cues now export as native Word emphasis rather than becoming plain text. Shape, picture and answer-box previews use physical page units.

## Original Word export

Unchanged single Word inputs can retain their original package, fonts, styles, picture bytes, numbering, links, equations, headers, footers, native shapes, tables and merged cells. A4 changes section sizes and margins; oversized inline pictures/tables fit the page. Floating tables become inline to keep subsequent questions below them. Wide anchored objects reserve space above/below text. Headings are kept with the next question except where this would interfere with a preceding floating banner. Editing wording or layout switches to the teacher-selected formatter, so original-file preservation cannot silently discard edits. The browser preview shows extracted content rather than an exact Word render.

## Per-reference verification

| Source Word | Source pages | A4 export pages | Package check |
|---|---:|---:|---|
| 1Class_1_Science_Annual.docx | 2 | 2 | Pass |
| 1Class_2_Science_Annual.docx | 3 | 2 | Pass |
| Class_3_Science_Annual.docx | 3 | 2 | Pass |
| Class_4_Science_Annual.docx | 2 | 2 | Pass |
| Class_5_Science_Annual.docx | 3 | 2 | Pass |
| English 6.docx | 2 | 2 | Pass |
| New Microsoft Office Word Document (3).docx | 7 | 7 | Pass |
| Social 10.docx | 2 | 2 | Pass |
| Social 6.docx | 2 | 2 | Pass |
| Social 7.docx | 2 | 2 | Pass |
| Social 8.docx | 2 | 2 | Pass |
| Social 9.docx | 2 | 2 | Pass |

All 32 source reference pages informed the comparison. The 12 A4 copies contain 29 rendered pages; the three controlled formatter fixtures add 3 pages. All 32 output pages were inspected. Nine regression suites pass, including every authored Word package, source-media integrity, overflow geometry, merged cells, distinct heading fonts, emphasis, right marks, unsolved matching, grid dimensions and table edits.

Visual fixes include the Social 7 floating table wrapping a question into a narrow strip, a Class 3 heading stranded at a page bottom, and a Class 5 heading hidden by an anchored banner during margin conversion. Source science banners still show existing label overlaps in LibreOffice. The worksheet reference also retains authored large blanks, diagram composition and manually positioned option ovals in original-format mode; use the compact formatter when a teacher wants those source spacings removed.

## Evidence and limits

The DOCX/PDF pairs in out/reference-qa are diagnostic conversion/formatter artifacts. They are not new verified scan/target training pairs. Their PDFs were rendered from those exact DOCXs; hashes and page counts are in reference-format-review.json. No answers, suggestions or source questions were copied into unrelated papers.

Different assessment PDFs cannot be used as exact pixel targets for these Word papers. The earlier FA2 matched-source verification remains separate. This work uses reference-derived rules and deterministic formatting; no hosted model weights were fine-tuned. Handwritten OCR and automatic illustration crops still require separate accepted source/target comparisons. This review does not certify every handwritten character or every future paper.

## Reproduce

Run npm ci --prefix frontend and the nine scripts in the deployment workflow. To generate the diagnostic Word files:

```sh
PAPERAI_REFERENCE_OUT=training/out/reference-qa node tests/docx-reference-layout.cjs
PAPERAI_FORMAT_OUT=training/out/reference-qa node tests/reference-formats.cjs
```

Render each DOCX with the bundled documents/render_docx.py using --emit_pdf, then inspect every page. A rendering pass and an XML pass are separate checks.
