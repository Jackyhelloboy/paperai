# Question-paper design and PDF preservation skill

## Product goal
Recreate question papers from uploaded PDFs without changing printed text or hiding any question. Work in the existing browser preview + editable DOCX pipeline, and use screenshots/crops **from the uploaded source PDF** when original illustrations are present. Do not substitute an unrelated online picture for source evidence.

## Design operations for follow-up development
1. Page template controls: school heading, class, subject, time, marks, paper size, margins, question and answer spacing.
2. Primitive shapes: rectangle, square, circle, oval, line, arrow, answer box and underline. Keep shapes separate from question text and make their dimensions explicit.
3. Layering: support inline, floating in front, and behind-text positions. Behind-text images must use Word anchor `behindDoc="1"`, `wp:wrapNone`, and overlap enabled; ensure foreground text stays legible. Never use behind-text layout for mandatory question illustrations if it could cover the printed text.
4. Cropping: retain the original source crop, allow non-destructive crop-region changes, clamp crop coordinates to the original image bounds, and avoid distorted aspect ratios.
5. Export: preserve each source figure, editable text and table cells; verify embedded picture relationships in DOCX XML.
6. Offline and cost: do not require paid image search or secret keys to preserve illustrations already present in an uploaded PDF.
7. Python: Python-based offline tooling may use Pillow and python-docx when appropriate, but do not add browser-incompatible Python dependencies to the Cloudflare Worker; use package lockfiles and runnable tests.

## Regression cases
- A worksheet with source shapes, pictures and bilingual text exports without losing figures.
- A movable background picture exports with `wp:anchor behindDoc="1"` and `wp:wrapNone`.
- An image behind a text paragraph does not hide the text.
- Square, circle and rectangle sizes remain stable between preview and Word.
- Page crops do not exceed source page bounds or turn black-and-white printed text unreadable.

This document is engineering guidance. Features require implementation, automated tests and deployment verification before describing them as available.
