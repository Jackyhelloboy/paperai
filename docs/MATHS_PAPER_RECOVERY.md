# Maths paper recovery

Reviewed the supplied nine-page `maths.pdf`: UKG, Classes I to V, with continuation pages. Source mathematical wording, operands, Indian number grouping, literal marks, question/option order and empty answers remain authoritative. This is application/prompt work, not foundation-model training.

## Repairs

- A malformed open image row must end before the next block or class header. Complete image rows, headings and tables sharing one OCR line split into separate blocks. Legacy nested source-image wrappers flatten without dropping later questions. Unrecoverable bracket damage shows a retry warning; Word export rejects it rather than printing control codes.
- Preserve the empty fifty-cell grid for an explicit 1–50 writing instruction, actual number strips (including zero), and tens/ones rows with empty cells.
- Recognizable counting groups can use reviewed embedded grape/apple/kite artwork and native editable Word stars, faces, lollipops/circles. Abacus rods and beads use editable Word geometry, with their own source labels and blank answer box. The schema bounds quantities, labels and fallback source coordinates.
- Two visual readings must agree on every encoded object kind/count or abacus rod/bead count before retaining replacement geometry. Disagreement, timeout or unavailable verification retains the complete original crop and a review flag. Never print the represented number or solve the exercise. This cannot prove perfect visual recognition.
- Keep valid saved pages. Only legacy counting/abacus pages without the new maths-review revision are reread; newly reviewed source fallbacks remain resumable.
- Protect diagram geometry/count markers from Teach spelling edits and keep internal metadata out of the extracted-text display.

## Verification

61 regression files pass. Browser checks at 320/390/768/1280px include native maths preview, fifty empty cells and no leaked markers; browser AI is stubbed. The real Word builder was rendered and visually inspected: five bunches, six apples, seven faces, four lollipops, one star and an abacus with four beads retain their quantities. This QA document combines representative exercises; it is not a claimed full nine-page OCR transcription.

Deployment checks compare the GitHub revision or, if that label is absent, an exact SHA-256 fingerprint of all Worker source and imported module/config bytes. A mismatched nonempty revision remains a failure. CI separately scans one synthetic six-star image through production, requiring a retained quantity-confirmed counting marker; report that live result separately.

No universal page-count, zero-bug, or handwriting-accuracy guarantee is made. Complex/uncertain diagrams remain original source images. All nine user pages were visually reviewed, but this work does not claim an independently verified live OCR transcript for every word of all nine pages.
