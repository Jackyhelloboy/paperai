# Picture ownership and responsive review

The supplied Class 1 Hindi teacher reference establishes five picture/letter prompts, three colouring/name pictures and four picture/initial-letter option groups. The later screenshot showed a ChatGPT document viewer collapsing custom tab alignment; it was not a screenshot of the PaperAI page.

## Implementation

- Every exercise source illustration receives a display ordinal within its current bit when a visible ordinal is absent. Existing image ordinals remain unchanged. These are picture labels, not automatic renumbering of source question/section numbers.
- Each cell carries its own number, image and caption/letter choices. Explicit caption line breaks remain inside that cell in preview and Word.
- Centered editable Word picture rows use measured inline widths and literal fixed-width spacing rather than depending on custom center-tab rendering. Inline image distances are zero; images preserve their ratio. Ordinary source text remains editable paragraphs. Actual exercise grids still use visible tables.
- Once a reviewed default picture fulfils an exact written picture request, its display caption retains the item number and trailing exercise prompt, without printing the author’s `kite pic`-style instruction again. Canonical request data remains available; this does not replace actual source drawings.
- Desktop Teach and live preview appear alongside each other. Small screens default to readable, internally scrollable paper width; Fit page restores the whole-paper view. No page-wide overflow is required. Buttons have 44px minimum touch height, wrapping labels and larger text; the textarea uses 16px text to avoid forced mobile focus zoom. Undo/Redo/Clear data remain available.
- Contextual AI suggestions receive detected class/subject, the current bit instruction even in a long paper, and the selected item. The backend is instructed to preserve each option, blank and item number. Teacher approval still controls edits; this is not foundation-model training or a guarantee of intent understanding.

## Verification and limits

57 automated regression files pass. Real Chromium checks cover 320, 390, 768 and 1280px widths: five numbered pictures, their own Hindi prompts, live edits before Save, Undo/Redo, zoom/fit, internal scrolling, button bounds, Word download and all 12 reference PDF pages. AI responses are stubbed in browser checks. Production deployment separately runs existing configured Gemini and synthetic OCR checks.

The teacher reference Word file was separately corrected and rendered as two A4 pages with 5/3/4 complete exercise illustrations and separately spaced number/option groups. This single sample does not establish universal two-page fitting. Different Word/document viewers may still substitute fonts; no claim of identical rendering in every viewer is made. OCR can still misread a crop or label; geometry cannot recover text/images that the reader failed to extract.

## Compact answer lines and actions

Full-width response rules are limited to written Q&A bits. Completion, opposites, gender changes, matching, sentence usage, rewrite and yes/no bits no longer retain these rules. Inline blanks, brackets, source words and visible exercise grids remain intact. Boolean instructions are classified before broad answer instructions so “Answer yes or no” cannot acquire descriptive response lines.

The Find pictures action and its search/upload panel are removed from the teacher interface. Source pictures and automatic reviewed defaults remain supported. Download Word, Teach / Edit and Clear data use a single three-column row, checked at 320, 390, 768 and 1280px without label clipping or horizontal page overflow. Undo/Redo remain in Teach. The regression suite now has 58 passing files.

## Compact question labels

Within written Q&A bits, generic “प्रश्न:”, “Question:” and “Q:” item prefixes display as sequential numbers; existing explicit item numbers remain unchanged. In completion/meaning/opposite bits, a plain row containing two to four explicitly numbered questions separated by `||` becomes a layout row. The separators do not print in preview or Word, and literal operators outside that bounded pattern are preserved. The compact two-column arrangement is retained. Verified by 59 regression files plus browser preview/Word checks at four widths.
