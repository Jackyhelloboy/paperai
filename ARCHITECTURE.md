# PaperAI Production Architecture v33

## Goals

PaperAI is a literal document transcription system. The primary invariant is **printer, not editor**: source spelling, dates, calculations, punctuation, handwriting, marks, symbols, blanks and visible corrections must not be silently rewritten.

The production path is designed for Cloudflare Workers Free + Workers AI Free allocation and has no paid OCR fallback.

## Request flow

1. Browser validates file type and size.
2. Digital PDF, spreadsheet, modern Office and plain-text content is extracted locally when reliable text is already embedded.
3. Photographed pages keep the full source frame, including margin numbers and faint headers. The full frame is never automatically cropped; confidently detected paper bounds focus only the additional close-ups.
4. Images/scanned pages are analyzed locally for:
   - contrast and sharpness
   - page density
   - text-line bands
   - multiple separated text groups on the same row
   - option/matching/two-column structure
   - simple line layout versus structured layout
5. Simple handwriting/text pages use one full-page frame, capped at a 2560-pixel long edge.
6. Dense, hard or structured pages keep a 3200-pixel full-page frame and two overlapping detail views. A lighter retry uses one 2048-pixel frame and disables reasoning.
7. Gemma 4 vision performs literal OCR with temperature 0. Literal handwriting and matching exercises skip reasoning tokens; branching diagrams retain reasoning.
8. A second literal verification pass is used for Hindi option/matching exercises or evidence of missing, unclear or degenerate text. Hindi exercise verification reads the image independently without anchoring to the first transcription. It re-checks visible text against the pixels; a usable lighter retry skips it.
9. Token-limited responses are rejected. The browser can retry once with a lighter scan of the same page and model.
10. Deterministic post-processing only normalizes wrapper artifacts. It never spell-corrects or fact-corrects source text.
11. API returns:
   - `full_text`: copy/download-safe literal text without PaperAI metadata labels
   - `annotated_text`: same visible content plus internal edit metadata for UI rendering of strike-throughs, replacements, circles, underlines, etc.
   - `raw_text`: raw model transcription for debugging/review
12. Extracted preview, Copy, UTF-8 TXT and Word use the same corrected structured source. The shared parser removes synthetic metadata from visible text while preserving rows, numbers and answer blanks.

## Anti-hallucination rules

PaperAI must not turn reverse-side show-through, embossing, shadows, ruled-paper texture, erased graphite ghosts, compression artifacts or background objects into text. Blank answer lines stay blank. Context is allowed only to break a tie between characters that are both visually plausible.

If a portion is genuinely unreadable, PaperAI keeps `[unclear]` rather than inventing an answer.

## Speed and reliability

- Literal text and handwriting pages avoid reasoning mode and preserve the full frame; actual branching diagrams can use reasoning.
- Complex pages keep enough resolution for handwriting and symbols.
- Workers AI `rejectIfBusy` avoids waiting in long capacity queues.
- AI timeouts return a specific code so the browser can automatically retry a lighter image.
- The final browser timeout is only a network safety boundary, not the primary recovery mechanism.
- Conditional verification avoids paying the latency/quota cost of a second inference for every page.

## Live monitoring

- `/api/usage` serves Cloudflare-reported account-wide daily usage from D1, plus the last actual provider response. Credentials remain in GitHub Actions. There is no app-owned quota renewal; only Cloudflare controls inference availability.
- `/api/live` is a hibernatable Durable Object WebSocket used only to show the number of currently connected browser sessions.
- The live count does not use IP addresses, fingerprinting or persistent user identifiers.

## Production security

Training/debug routes are admin-only. Without `ADMIN_TOKEN`, they return 404. Draft routes require a browser owner key; OCR, usage, health, continuity analysis, suggestions and live presence are also available publicly.

## Model

Primary model: `@cf/google/gemma-4-26b-a4b-it`.

The pipeline improves model use through preprocessing, routing, literal prompting and conditional verification. It does not claim to fine-tune or modify Gemma model weights.

## Accuracy boundary

No OCR system can guarantee 100% recovery when the source pixels do not contain enough information. PaperAI's production rule is to prefer a visible `[unclear]` over a confident-looking invention.

## v8 accuracy changes

- Automatic paper/background separation for photographed worksheets.
- Multi-column and option-row detection prevents destructive line-mosaic routing.
- Hard and structured pages receive a literal verification pass.
- Devanagari verification checks visible grapheme anatomy rather than choosing the most common word.
- Verification results are rejected when they rewrite too much of an otherwise coherent first transcription.


## v9 visual-learning changes

- Results now include a private **Teach** workflow in the browser. A user can correct OCR text and PaperAI stores small wrong→right token pairs in that browser's localStorage.
- Future scans send only the top local confusion pairs as visual hints. These hints are never automatic substitutions and never override the current image pixels.
- No user identity, IP address or global correction profile is required for this learning loop.
- The model weights are not fine-tuned; this is retrieval-style visual confusion memory layered on top of the existing OCR model.
- Visual structure metadata now includes long horizontal/vertical rule counts, multi-column rows and likely branching layouts.
- Structured OCR prompts receive those geometry hints so circles, arrows, branch diagrams, answer lines and two-column relationships are less likely to be flattened incorrectly.
- Literal verification and anti-hallucination safeguards from v8 remain in force.


## v11 layout and Teach fixes

- Legacy OCR branch diagrams that were flattened into pipe rows are reconstructed into readable arrow relationships without changing recognized words.
- The OCR prompt forbids fake "| |" connector rows and asks for actual arrows/circle metadata for visible branch diagrams.
- Circled question numbers are rendered with CSS circles in the web UI; exported plain text uses universal numbering such as "1." instead of font-dependent circled Unicode.
- Teach Hindi phonetic mode now turns on automatically when the extracted document contains Devanagari, even if OCR language was Auto.
- Teach preview is live, and Copy/Download use the current unsaved Teach text while the editor is open.
- Hindi verification explicitly rejects Roman transliteration when the image visibly contains Devanagari.


## v12 branch-layout and transliteration fixes

- Branch diagrams now use explicit OCR metadata: BRANCH_ROOT, BRANCH_ITEM and BRANCH_END.
- The verified web view renders those blocks as SVG with the root centered and real connector arrows.
- The central/root text is never concatenated into branch labels merely because the combined text forms a meaningful word.
- Teach uses a vendored offline Indic phonetic transliteration engine with candidate suggestions and local high-confidence overrides for common spellings such as allah -> अल्लाह, jawad -> जवाद and rupayaa -> रुपया.
- The Teach editor shows selectable transliteration candidates while typing and keeps all processing local to the browser.
- The OCR/Teach font stack now includes Hind, Mukta, Noto Sans Devanagari, Noto Sans Telugu and Tiro Devanagari Hindi as script-appropriate fallbacks.


## v14 automatic multilingual Teach

- The Hindi phonetic on/off control is removed. Smart typing is always active inside Teach.
- PaperAI chooses the target script from the selected document language or, in Auto mode, from the dominant script already present in the OCR result.
- Offline phonetic suggestions support Devanagari (Hindi/Marathi), Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam, Urdu and Kashmiri.
- English stays in Latin script and receives spelling/proper-name suggestions rather than transliteration.
- Local transliteration runs first. After a short typing pause, difficult/ambiguous words can receive a same-model Workers AI suggestion pass.
- AI word suggestions are cached and capped per Teach session so they do not waste the daily free AI allocation. If free AI is exhausted or unavailable, local suggestions continue working.
- Suggestion AI usage is recorded in the same daily usage tracker; there is still no paid fallback.


## v15 explicit language routing

- Teach now shows a Google-IME-style From/To bar. Source typing is English/Roman and the user can explicitly choose the target language/script.
- Auto mode is still available, but mixed school pages now prefer nearby Indian-script context instead of letting a large English header force English.
- Changing the target language while a Roman word is being composed immediately re-renders that same word in the newly selected script.
- Local phonetic candidates appear immediately; ambiguous words can add capped Workers AI candidates after a short pause.
- Canonical known spellings such as jawad, allah and rupayaa are converted across supported scripts, not only Devanagari.


## v16 smart translation

- Teach now behaves like a smart language converter instead of a pure phonetic keyboard.
- The user can choose both source and target language.
- Single names/proper nouns are transliterated into the target script.
- Multi-word phrases are translated by meaning after a short pause; PaperAI no longer converts a sentence word-by-word phonetically.
- Roman text stays visible while typing so the system can understand the full phrase before replacing it.
- Mixed-language pages remain editable because source and target routing are explicit.
- The same free Workers AI model is used for phrase suggestions; there is no paid fallback.


## v17 phonetic transliteration

- Teach is transliteration-first, not semantic translation.
- English/Roman phrases keep the same spoken words and are rewritten in the target script.
- Example: English "i love you" -> Hindi "इ लोवे योउ"; the system must not replace it with a Hindi meaning translation.
- Known names such as jawad still transliterate to जवाद.
- Full Roman phrases are handled locally first with the bundled Indic transliteration library; difficult cases can receive AI phonetic alternatives.
- AI suggestions are explicitly instructed to preserve pronunciation and never translate sentence meaning.


## v18 pronunciation-based English transliteration

- English-to-Indian-script Teach conversion now follows actual English pronunciation, not raw spelling.
- Example: "i love you" -> Hindi "आई लव यू"; "love" -> "लव"; "you" -> "यू"; "I" -> "आई".
- Known high-confidence Hindi pronunciation phrases can be applied locally.
- Unknown English phrases use the AI fallback first for pronunciation-based transliteration.
- Other Indian scripts avoid blindly converting a Hindi-script pronunciation; AI handles their pronunciation rendering directly.
- Semantic translation remains disabled in Teach.



## v19 learned suggestions and layout-preserving Teach

- Previously saved browser-local wrong→right corrections are now surfaced directly in Teach suggestions when they match the current source or a local phonetic candidate.
- Learned corrections are ranked ahead of generic local and AI candidates, but are never forced when they do not match the current spoken form.
- The AI suggestion endpoint receives both local candidates and relevant user-corrected candidates, validates returned candidates against the requested target script, and ranks learned → AI → local fallbacks.
- Teach preview/save now keeps the original OCR layout/annotation structure and applies word-level corrections onto that structure instead of replacing the extracted result with a flattened textarea.
- Branch diagrams, OCR annotations, line breaks and other extracted structure therefore remain stable while corrected words update inside the preserved layout.
- Teach save preserves surrounding whitespace; only the corrected wording is intended to change.


## v20 editable Word structure engine

PaperAI Word export now classifies extracted structure into native editable Word elements instead of flattening everything into plain text or images.

Supported major structures:
- literal editable text and headings
- editable answer/form lines and page breaks
- explicit bordered tables/grids and borderless multi-column rows
- legacy pipe-delimited tables/columns
- editable numbered/bulleted/checklist rows
- two-column worksheet/exam rows
- editable branch diagrams with Word/VML shapes and text boxes
- horizontal and vertical flow diagrams
- common geometry shapes: circle, rectangle, triangle, diamond, star, pentagon, hexagon
- native Word math (OMML), including common fractions, square roots, superscripts/powers and subscripts
- OCR formatting metadata mapped to Word formatting: underline, double underline, strike, double strike, insert, replace, boxed, highlight, margin note, stamp and signature styling
- multi-page PDF page boundaries mapped to real Word page breaks

OCR v20 structure metadata:
- `[[TABLE_START]] / [[TABLE_ROW: ... || ...]] / [[TABLE_END]]`
- `[[COLUMNS_START]] / [[COLUMN_ROW: ... || ...]] / [[COLUMNS_END]]`
These markers are internal structure metadata. Extracted view renders them visually, Word exports them as editable structures, and Plain text/Copy removes them.

This is intentionally not a clone of every Microsoft Word feature. Features such as macros/VBA, mail merge, tracked changes/review workflows, comments, citations, embedded OLE objects, SmartArt editing, themes, section-level headers/footers, and every Word AutoShape remain outside the current OCR-to-Word scope unless explicitly added later.


## v21 canonical document model + modern Word engine

### Architecture decision

PaperAI no longer treats editable Word export as a sequence of format-specific string replacements. The durable architecture is:

1. literal OCR / source extraction
2. canonical PaperAI document model
3. renderer-specific output:
   - Extracted HTML
   - Plain text / Copy
   - editable DOCX
4. export validation

The same canonical parser is used by the Extracted tab and the modern Word exporter, so branch/table/page-break classification cannot silently diverge between the browser and Word.

### Research basis

This direction follows modern document-AI systems that preserve explicit page/layout structure, reading order and typed regions rather than only a flat OCR string. Relevant design references studied for this upgrade include Docling's unified document representation, PaddleOCR PP-StructureV3's layout/table/formula/read-order pipeline, DocLayNet's diverse layout taxonomy, and PubTables-1M / Table Transformer for table-structure recognition.

### Word generation

The primary DOCX path now uses the open-source `docx` JavaScript library (pinned at 9.8.1) in the browser. Its DrawingML shape canvas and connector system replaces PaperAI's fragile hand-written VML path for supported structures. The existing manual OOXML exporter remains as a fallback.

Primary goals:
- native editable Word text/tables/shapes, never a screenshot
- branch connectors remain attached to shapes in Word
- geometry derives from the same proportions as the Extracted renderer
- editable tables and multi-column rows use native Word tables
- page boundaries use real Word page breaks

### Export quality gate

After the modern DOCX is generated, PaperAI opens the package in-browser with JSZip and verifies:
- `word/document.xml` exists
- internal PaperAI structure markers were not exposed
- required branch labels survived generation

A failed validation automatically falls back to the legacy exporter instead of returning a knowingly broken Word file.

### Files

- `frontend/vendor/paperai-document-model.js` — canonical structured document parser
- `frontend/vendor/paperai-word-engine.js` — modern DrawingML/DOCX renderer and quality gate
- `frontend/index.html` — Extracted UI, Teach, and legacy DOCX fallback



### Word-search / letter-grid layout

A bordered word-search/letter grid beside numbered answer blanks is represented as one canonical `wordSearch` node with two independent children:

- `rows`: the exact visible grid matrix, preserving row count, column count, empty cells and Indic grapheme clusters
- `answers`: the separate numbered answer list

OCR metadata:
- `[[WORDSEARCH_START]]`
- `[[WORDSEARCH_ROW: cell || cell || ...]]`
- `[[WORDSEARCH_ANSWER: 1]]`
- `[[WORDSEARCH_END]]`

Critical invariant: answer numbers and answer blanks outside the bordered grid must never become grid cells. The grid dimensions come from the visible grid itself, never from the number of answers.

Renderers:
- Extracted HTML: bordered square grid on the left + aligned answer rules on the right
- Modern DOCX: native editable nested Word tables, with the grid and answer list as separate side-by-side structures
- Legacy DOCX fallback: the same side-by-side structure in OOXML
- Plain text: readable grid rows plus numbered blanks, with no internal metadata

### Rule for future development

Do not add a new visual structure independently to HTML and DOCX. First add it to the canonical document model, then implement renderer support. Preserve literal OCR content and never infer semantic content merely to make a layout look complete.

## v22 AI paper reconstruction workflow

PaperAI now treats OCR and visual reconstruction as separate responsibilities:

1. **Literal OCR** reads the visible words/numbers/symbols without semantic correction.
2. **AI layout profile** records only visual/reconstruction information in hidden metadata:
   - paper type (question paper / worksheet / form / table / general)
   - portrait/landscape
   - compact/normal/spacious density
   - title alignment and visible boldness
   - relative title/heading/body sizes
   - column count
   - English output font fixed to Tahoma
   - layout confidence
3. **Optional line typography metadata** records clearly visible standalone title/heading style without rewriting its text:
   - role
   - left/center/right alignment
   - normal/bold
   - relative size
4. The canonical PaperAI document model consumes the hidden metadata.
5. Extracted HTML and editable DOCX render from the same model.
6. A reconstruction audit checks structural consistency before Word generation.
7. The DOCX package quality gate validates the generated Word file afterward.

### Bulk import and preview

The frontend accepts multiple files (up to 20 per batch), including images and PDFs.

Before OCR:
- image thumbnails are shown
- PDF previews render up to the first six pages plus total page count
- files can be removed or reordered
- users can choose paper type, spacing/density, title alignment, text scale, heading weight and AI-layout checking
- English output font is fixed to Tahoma

All selected inputs are processed in their chosen order and combined with real page boundaries into one editable reconstructed document.

### Post-OCR layout correction

Layout options remain editable after OCR. Changing these options updates the Extracted view immediately and is applied to the Word export without re-running text recognition. This is intentional: visual reconstruction can change while literal OCR text remains protected.

### Layout learning

PaperAI stores layout preferences locally in the browser by detected paper type (paperai_layout_learning_v1). This is preference learning, not model fine-tuning. It does not upload a user's private corrections as global training data.

### Hidden metadata

Current internal layout metadata includes:
- [[PAGE_PROFILE: ...]]
- [[LINE_STYLE: ... || literal visible text]]
- branch/table/columns/word-search structure metadata

These markers are not shown in Extracted, Plain text, Copy, or Word output.

### Invariant

Never improve document appearance by changing the source wording. Layout, alignment, font size, borders, tables, shapes and spacing may be reconstructed; visible text content remains literal unless the user explicitly edits it in Teach.

## v23 class-wise question-paper continuity engine

PaperAI now treats a bulk upload as a possible set of multiple school papers rather than blindly concatenating every uploaded page into one document.

### Multi-page continuity

Each image/PDF page is first OCR'd literally and retained as an independent page record. OCR receives only the previous page tail as a weak structural hint. The context may help identify continuation of section numbering, but it must never copy source wording from another page.

After OCR, /api/analyze-paper analyzes the page records together and returns a structural plan:
- paper grouping
- page order inside each paper
- visible class
- visible subject
- visible exam/test label
- section/bit sequence
- marks formulas
- expected item counts
- literally found item counts
- continuation relationships
- mismatch warnings

A shared school name alone is not enough to group pages. Visible class/subject/exam identity is preferred. A continuation page with no header may attach to a header page only when section progression strongly supports the match.

The continuity analyzer is structural only. It never rewrites or invents question wording.

### Safe class-wise pattern learning

The frontend stores only question-paper skeletons in paperai_question_patterns_v1:
- class
- subject
- exam
- section label
- section title
- marks formula
- expected item count

Actual private question wording is not stored in this pattern memory.

Historical patterns are weak hints. They may improve grouping/order/count checks only when the current OCR visibly supports the same class/subject/exam. They may never create a missing question or answer.

### Explicit question-paper OCR metadata

On visible question/answer sheets, OCR may emit:
- [[QUESTION_SECTION: label || exact visible instruction || exact visible marks formula]]
- [[QUESTION_ITEM: exact visible number || exact visible question text]]
- [[ANSWER_RULE]]

This solves a recurring failure mode where long ruled answer lines were preserved but the shorter numbered question directly above them was omitted.

Rules:
- never invent a question number from sequence context
- never reconstruct missing wording from marks formulas or remembered patterns
- if question text is partly unreadable, preserve the visible number and use [unclear] only for the unreadable part
- emit one ANSWER_RULE for each clearly visible blank answer rule
- marks patterns are used for count validation only

The canonical document model converts these markers into sectionHeading, questionLine, and answerRule nodes. Extracted HTML and editable Word render the same nodes.

### Question-pattern audit

The reconstruction audit now checks:
- section sequence
- numbered item count
- expected item count derived from visible marks formulas
- table/grid consistency
- answer-line count
- page/paper grouping
- class/subject/exam continuity warnings

A mismatch such as 4x1=4M with five detected numbered items is reported for review rather than silently deleting or inventing an item.


## v28 speed and reliability profile

Measured causes of multi-minute reads, and the changes made:

- **Adaptive reasoning.** `enable_thinking` was on for every request, including the "lighter" retry after a timeout. It is now on only for hard, structured, multi-column or branching pages (`ocrNeedsThinking`). Plain text and handwriting pages are perception tasks and skip reasoning tokens. A lighter retry never uses reasoning.
- **Verification is evidence-based.** A second full multimodal pass is no longer started by one or two `[unclear]` words, which are normal on handwriting. It starts when more than max(2, 3% of words) are unclear, or for the other existing risk signals. Structured pages keep the strict rule. A lighter retry keeps a usable first read instead of verifying.
- **Smaller uploads.** Easy pages are sent as one 2560px frame. Hard, dense (22+ lines) or structured pages keep the 3200px frame plus two close-ups. JPEG quality 0.97 -> 0.92. A lighter retry is one 2048px frame at 0.88 with no close-ups.
- **Fail-fast timeouts.** Per-attempt browser timeout 180s -> 100s (150s for deep-reasoning pages, 90s for the retry), so a stuck request no longer costs two full 3-minute waits.
- **Capacity retries.** Transient capacity errors retry up to 3 times with exponential backoff plus jitter instead of 2 fixed delays.

Not changed: model, prompts, the literal-transcription rules, anti-hallucination rules, post-processing, or the free-only policy.

- **Hidden preparation time.** For multi-page scans, the next page is decoded, cropped, analyzed and encoded in the browser while the current page is being read by the AI, instead of after it.

Known remaining latency source (not addressed here): scanned PDF pages are still read one after another, because each page receives the previous page's tail as a continuity hint for question numbering. Reading pages in parallel would remove that hint, so it is deliberately not done without sample pages to check the accuracy effect. A 502/503/504 from the direct endpoint is retried once through the Pages proxy after the first response has already returned, so the two requests do not overlap.
