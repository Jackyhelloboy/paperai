# Automatic clean question-paper output — 12 October 2026

Production implementation: f7b133e51bc16b3cf7bb5042b77162994f10a0c1.

## Changes
- Resolve visibly edited question wording to the final replacement; omit cancelled drafts, correction arrows, insertion highlighting and grading notes.
- Request unsolved question papers. Remove completed responses and restore blank answer positions while preserving question operands, examples, word banks, multiple-choice and matching choices.
- Apply balanced cleanup to backend OCR, preview, copy and editable Word export, including nested and multiline annotations.
- Normalize malformed single-pipe row delimiters before rendering/export; the actual first Hindi test exposed an export-blocking SECTION_ROW delimiter.
- Move explicit mark labels found left or mid-question into the right marks cell. Preserve functions, coordinates and lowercase metre measurements.
- Require native table/grid row output instead of plain pipe-separated table text.

## Verification
All 15 local application/deployment suites passed across these changes; the affected clean-paper, reference-format and routing suites were rerun after follow-up edits. Production frontend, worksheet and backend workflows succeeded for the implementation commit. The frontend workflow also checks bounded public route/API load; this is not an image-model capacity guarantee.

Actual production upload: training/class 2 hindi.pdf, two scanned pages. The first run retained a completed alphabet response and malformed row delimiter; these were fixed and the same PDF rerun automatically without using correction or layout controls. The rerun exported editable Word successfully. Both rendered A4 pages were visually inspected. Word XML contains zero strike/double-strike runs, zero leaked double-bracket annotations, eight right-aligned mark paragraphs and sixteen native tables. The completed alphabet response was removed and the answer grid remained empty. The preview screenshot is PaperAI-Clean-Question-Paper.jpg.

The final follow-up changes to native-row prompt wording and metric-unit protection passed CI; the recorded two-page live Hindi export precedes that final follow-up deployment.

## Remaining accuracy limits
This is formatting/extraction adaptation, not provider model-weight training. The live Hindi output still misreads some source words and reorders some question items; the Duck question stem becomes a blank. The banner crop also includes part of the exam fields. Therefore this release is not evidence of exact source fidelity, all handwriting problems being solved, or guaranteed removal of every unlabelled answer. Automatic cleanup and export are verified for this case, but complete extraction fidelity remains unresolved. Never replace missing source text with a guessed answer or a question copied from another reference.
