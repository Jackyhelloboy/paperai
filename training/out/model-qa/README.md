# Formatting checks and automatic OCR diagnostics

`UKG-Maths-Production-Roundtrip.docx` and its PDF are the actual production
import/export of the manually reviewed `../PaperAI-UKG-Maths-Reviewed.docx`.
Its complete one-page render was visually checked. The grid remains 50 native
cells, all five source image byte streams are unchanged, marks remain on the
right and matching stays unsolved. `production-word-verification.json` also
records a separate live test of the 3.2 cm/right picture controls.
`PaperAI-Production-Verified.png` and `PaperAI-Production-Pictures.png` show
the production result. This Word-import check made no new OCR request.

`Question-Paper-Layout-Check.docx` and its PDF are a controlled two-page layout fixture. Both pages were visually checked. It exercises fractional right-side marks, three-column matching, a partially filled comparison table, unsolved arithmetic, basic shapes with different answer-space flags and a separate second paper. It is not a transcription of a particular scan.

`Hindi-Class-1-Automatic.docx`, `Hindi-Class-2-Automatic.docx`, `Hindi-Class-3-Automatic.docx` and `Maths-Automatic.docx` are actual uncorrected browser downloads from the scan tests. Their 18 rendered pages were compared with the source scans. They contain the failures described in [LIVE_REVIEW.md](../../LIVE_REVIEW.md); do not use them as reference targets or print-ready papers. They were produced before the final marker and import fixes. The final guards now block unsupported marker leakage.

English has no accepted final export: the latest run hit the daily free OCR limit. No answers or stock pictures were inserted to manufacture a successful result.
