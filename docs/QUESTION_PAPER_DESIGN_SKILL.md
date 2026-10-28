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

## Strict school paper typography and page targets
- All new editable Word exports use Tahoma exclusively, with 12 pt bold section headings, titles, labels and marks; all ordinary question content is 11 pt non-bold. Never silently insert a substitute display font in the document XML.
- Ordinary class tests, unit tests, weekly and monthly examinations target **at most 2 A4 pages**. Half-yearly and annual/final examinations target **at most 4 A4 pages**. Recognize English and common Indian-language exam names.
- Compact repeated matching pairs, multiple-choice answer options, small pictures and compatible short questions into side-by-side rows only if meaning, sequence, response spaces, bilingual text and question numbers remain clear.
- A page budget is a hard validation target, never permission to omit, shrink text below 11 pt, clip, overlap, or move source text behind a picture. Page count depends on the actual Word renderer, source length, image dimensions and tables; if it cannot be verified to fit, report the exception and preserve all contents.
- Verify page count with an actual DOCX renderer/PDF conversion in CI when available; XML-only tests cannot prove the final visual page count.

## Teacher reference layout and easy copying
The five teacher-adjusted Hindi Class 1–5 FA-3 documents supplied on 28 October 2026 are the visual references for compact front/back papers. Their stored page count is two each; their body uses ordinary paragraphs, short questions side by side, inline pictures and answer spaces. Some references also contain small tables and a heading shape, so the reference is the readable arrangement rather than reproducing every underlying Word object.

Default editable export must use body paragraphs and explicit tab stops for section marks, matching pairs, option rows and side-by-side pictures/captions. Do not use invisible tables or text boxes merely to position text. Keep genuine exercise grids as tables where the grid itself is part of the question. Original-layout mode can preserve source tables. Preserve every question, literal multilingual text and picture order. Picture answer spaces in default mode are ordinary underscores. Two pages remains a renderer-validated target, not a guarantee for arbitrary-length input.
