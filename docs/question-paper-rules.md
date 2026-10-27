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

## Multilingual suggestions and translation

- The scanned paper remains the source of truth in every language. Keep the source script, exact words, section labels, option order, question numbers, marks and answer spaces; do not silently translate during OCR or formatting.
- Native-script numeral glyphs, equations and blank markers are protected in correction suggestions. If the scan is uncertain, leave text for teacher review instead of inventing missing letters.
- The correction panel offers proofreading and a separate, explicit translation action for a selected single line or paragraph. The selected destination language controls translation; a teacher must tap a suggestion before it changes the editor. Original and Undo remain available.
- Translations preserve question meaning, negation, names, numbers, equations, units, marks, answer blanks and options. They never answer questions. Translating text does not create reusable OCR spelling examples.
- Script detection is only a hint, especially when multiple languages share a script. Prefer the explicitly chosen language; uncertain wording needs human review.

## Source-grounded OCR and provider handoff

- Fast OCR may use Cloudflare AI and Gemini in parallel. A near-limit Cloudflare estimate (9,500 of 10,000 daily neurons) gives Gemini first chance while the confirmed provider quota remains authoritative; if Gemini is temporarily unavailable at that soft threshold, try the still-available Cloudflare reader. Completed PDF pages remain checkpointed.
- If a result contains `[unclear]`, a missing response position, a questionable illustration, or incomplete opening bits, compare a second reading with the same source image when the deadline allows. Keep visible source letters and words; only replace an unreadable answer-position placeholder with its blank. An unreadable question word stays flagged for teacher review.
- In Yes/No and True/False exercises, inspect every numbered question separately. Keep each printed `(   )` or `[   ]` answer position beside its own stem. A response bracket in one item is no evidence that another item has or lacks one.
- A picture crop is valid only for a genuine illustration or source banner. A crop of a printed question or multiple-choice option should become editable text. A text instruction to add a picture is not itself a picture. Bundled training placeholders are labeled boxes rather than accurate subject illustrations, so they must never be substituted for source art.
- In the source-reviewed `training/I - SA-1 SCIENCE.pdf`, page 3 contains five multiple-choice and five true/false questions, each with its own printed bracket; page 4 has rows of independent animal drawings and missing-letter illustrations. Preserve those different structures without treating text rows as images or one exercise as another.

## Attached handwritten Hindi source example

In `1000822006.pdf`, the first page Bit III contains five written picture requests: `kite pic`, `duck pic`, `fish pic`, `Tap pic`, and `fruits pic`. They are source text and must remain text or explicit picture-needed notes, never cropped as screenshots of handwriting or silently replaced with generated art. The source places items 1–4 in two columns and item 5 at the left; preserve question association without adding five tall image rows.

The second page has a genuine adjacent drawing group, followed by another bit and a lower two-by-two drawing exercise. Crop only each drawing, stop before the next instruction, and keep each lower image with its own option letters. Each row uses the available printable width in equal-size display cells with a modest gap; art is fitted proportionally within those cells. Do not stretch a narrow source crop or pad its height with blank notebook ruling. If a drawing cannot be read reliably, leave a review marker instead of cropping question text or inventing a replacement.

### Reused scan pages after a picture-rule update

A completed page may contain `SOURCE_FIGURE` markers from an earlier OCR run even after its original `FIGURE` markers are gone. Recheck those markers for literal `* pic` or `* picture` notes before preview and Word export, including pages restored from browser checkpoints. A new picture-evidence scan version starts a fresh OCR read of the original PDF so earlier wrong crop coordinates do not persist. The visible **Fresh rescan PDF** action remains available if a teacher needs to force a new read. The existing exported Word file is a static artifact and cannot repair its own old screenshots.

### Picture ownership and explicit requests

Keep picture requests in the bit that asks for them; do not reuse actual drawings from the next instruction. For the observed five explicit kite/duck/fish/tap/fruits `pic` requests with no supplied pictures, the site inserts clearly identified black-and-white defaults and retains the literal unfinished Hindi text without supplying answers. A subsequent picture-name exercise keeps its three real drawings and answer positions together. A circle-the-first-letter exercise pairs each real drawing with the letters printed beneath that drawing, preserving its source 2-by-2 arrangement and leaving uncertain letters for review. The independent visual reader may repair row grouping or missing drawings only when literal questions, marks, scripts and crop geometry pass the safety checks.
