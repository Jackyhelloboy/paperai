# PaperAI Production Architecture v9

## Goals

PaperAI is a literal document transcription system. The primary invariant is **printer, not editor**: source spelling, dates, calculations, punctuation, handwriting, marks, symbols, blanks and visible corrections must not be silently rewritten.

The production path is designed for Cloudflare Workers Free + Workers AI Free allocation and has no paid OCR fallback.

## Request flow

1. Browser validates file type and size.
2. Digital PDF, spreadsheet, modern Office and plain-text content is extracted locally when reliable text is already embedded.
3. Photographed pages are first checked for a dominant light paper region. When reliable, PaperAI crops away background fabric/table/desk pixels before OCR.
4. Images/scanned pages are analyzed locally for:
   - contrast and sharpness
   - page density
   - text-line bands
   - multiple separated text groups on the same row
   - option/matching/two-column structure
   - simple line layout versus structured layout
5. Simple handwriting/text pages use a compact line-mosaic that preserves left-to-right content and top-to-bottom order while removing large blank vertical gaps.
6. Structured forms, tables, grids, diagrams, matching questions and option-heavy rows stay full-page so spatial relationships are not destroyed.
7. Gemma 4 vision performs literal OCR with temperature 0.
8. A second literal verification pass is used for hard/structured pages or when the first result is suspicious. It re-checks Indic graphemes, bracketed options, columns, symbols and edit marks against the pixels.
8. Deterministic post-processing only normalizes Unicode and wrapper artifacts. It never spell-corrects or fact-corrects source text.
9. API returns:
   - `full_text`: copy/download-safe literal text without PaperAI metadata labels
   - `annotated_text`: same visible content plus internal edit metadata for UI rendering of strike-throughs, replacements, circles, underlines, etc.
   - `raw_text`: raw model transcription for debugging/review
10. The browser renders visual edit metadata but copies/downloads `full_text`, so synthetic labels are not inserted into exported text.

## Anti-hallucination rules

PaperAI must not turn reverse-side show-through, embossing, shadows, ruled-paper texture, erased graphite ghosts, compression artifacts or background objects into text. Blank answer lines stay blank. Context is allowed only to break a tie between characters that are both visually plausible.

If a portion is genuinely unreadable, PaperAI keeps `[unclear]` rather than inventing an answer.

## Speed and reliability

- Clear/simple pages avoid reasoning mode and use compact line-mosaic preprocessing.
- Complex pages keep enough resolution for handwriting and symbols.
- Workers AI `rejectIfBusy` avoids waiting in long capacity queues.
- AI timeouts return a specific code so the browser can automatically retry a lighter image.
- The final browser timeout is only a network safety boundary, not the primary recovery mechanism.
- Conditional verification avoids paying the latency/quota cost of a second inference for every page.

## Live monitoring

- `/api/usage` exposes PaperAI's estimated daily Workers AI usage.
- `/api/live` is a hibernatable Durable Object WebSocket used only to show the number of currently connected browser sessions.
- The live count does not use IP addresses, fingerprinting or persistent user identifiers.

## Production security

Training/debug routes are admin-only. Without `ADMIN_TOKEN`, they return 404. Public production endpoints are limited to OCR, quota status, health and live presence.

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
