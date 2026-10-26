# Question paper formatting contract

The uploaded page is the authority for words, letters, question numbers, marks, options and examples. Formatting rules do not train model weights or guarantee perfect handwriting recognition. Never fix an uncertain spelling, number or missing sentence by guessing.

| Section | Required output |
| --- | --- |
| Paper header | Keep visible Class, Subject and exam title. Remove school banners and administrative Name, Roll, Date, Signature and Total Marks fields. Never remove a question because it contains these words. |
| Section heading | Keep its complete instruction once, with literal marks in a right-aligned cell. Recognize English and native-script headings and Roman labels through XX and beyond. Do not invent labels or reorder source sections. |
| Written answer or rewrite | Keep each numbered question and its continuation together. Put one full-width answer line below it. Remove redundant detached dash-only rules. |
| Missing letters or inline blanks | Keep every visible blank in its original position and preserve separated letter slots. Never solve a blank, including an article, question tag or prefix. |
| Multiple choice | One numbered stem followed by its own lettered choices. Use unbordered option rows, not matching rows. Recover orphan labels only when their complete text rows establish an exact correspondence. |
| Slash alternatives | Preserve the sentence and alternatives. Remove extra empty choice brackets; keep meaningful parenthesized words. Use a tick symbol in a Tick instruction. |
| Matching | Preserve all left items and right choices in source order without solving. Keep option labels with their option text. Preserve a response column only when present. |
| Help box | Keep every given word with its section, on the left. Render real table cells instead of literal protocol pipes. |
| Comparison or other genuine table | Preserve actual columns, headings, empty cells and multiline cell contents. Notebook ruling alone does not create table borders. |
| Odd word | Separate each available word with enough horizontal space for crossing out. Never split uncertain multiword choices by guessing. |
| Letter or card | Preserve the template, instructions and original blanks. Do not remove personal-detail fields that belong to the exercise. |
| Illustrations | Use only actual source pixels. Keep whole illustration bounds and at most five independent pictures per row. Written picture requests are review placeholders, not crop coordinates or invented images. |
| Unknown exercise | Preserve source text and grouping. Request review for unsupported or uncertain structure instead of choosing matching by default. |

## Completeness and verification

- First-page output that starts partway through a paper triggers another source-image read when time remains.
- Blank-requiring sections with several questions but no response positions trigger source-image verification. Never invent the position of an omitted inline blank.
- A verifier cannot drop previously recognized section labels, erase question stems or replace substantial native-script text with English.
- Preserve Hindi vowel signs, anusvara, chandrabindu and nukta. Do not silently correct source grammar.
- Unresolved recognition and layout warnings are counted in the review indicator. They are not claims of accuracy.
- Keep completed pages in source order and retain checkpoints across interruption. New extraction-rule versions use separate checkpoints so old bad transcriptions do not bypass updated checks.
- The same deterministic formatting pass serves preview and Word export.

## Regression gate

Run `node tests/strict-section-layout.cjs`, `node tests/professional-paper.cjs`, `node tests/worksheet-layout.cjs` and `node tests/exact-word-text.cjs` before deploying. The source-reviewed Hindi fixture exercises all six section types in the supplied Class V FA III paper through the production Word exporter. `tests/render-paper-fixture.cjs` can write that DOCX for visual inspection. Structural tests cannot substitute for comparing OCR words against source pixels.
