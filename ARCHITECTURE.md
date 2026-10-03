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
