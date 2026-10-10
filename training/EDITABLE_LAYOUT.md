# Editable question-paper layout

The top-level training folder supplies layout references and scan inputs. It is
not a set of verified, paired OCR targets. `layout-audit.json` records measurements
and SHA-256 hashes of the current corpus, excludes the unrelated tax declaration,
and identifies exact duplicates. Regenerate it after changing references:

```sh
python -m pip install -r training/requirements-layout.txt
python training/audit_layout.py
```

The active formatting profile is `frontend/vendor/paper-layout.js`; the active
OCR instructions are `worker/src/paper-layout-rules.js`. Both are used by the app.
This is reference-driven prompting and deterministic Word formatting, **not a
fine-tuning job that changes the hosted model's weights**. A4 portrait and 0.5-inch
margins override the Letter page sizes in some of the supplied Word references.

Questions remain editable paragraphs. Tables and letter grids are native Word
tables; headings use a right-aligned marks tab and keep with the following block.
Basic shapes use inline editable DrawingML preset geometry. Answer rectangles
are native one-cell tables. Complex drawings, maps, graphs and illustrations
retain the original source pixels in separate, replaceable inline image objects.
They are not reconstructed as guessed vector shapes or pasted as full-page images.

The OCR receives the complete preprocessed page. FIGURE and FIGURE_ROW markers
provide per-illustration bounds on a 0–1000 coordinate scale. The browser crops
that same image, assigns document-local media IDs, previews those assets, and
packages each referenced image into the DOCX. Original aspect ratios are retained.
BANNER crops move the real school banner into body flow, matching the supplied
Word references without requiring a large top margin. A source footer becomes
page furniture with a live PAGE field. Word imports also retain embedded PNG/JPEG
images instead of replacing them with placeholders. Missing or invalid crops are
flagged for review; a generic illustration is never substituted.

TABLE_WIDTHS optionally provides visible column percentages; otherwise long text
gets more width. TABLE_ROW cells may contain `<br>` to preserve multiple lines.
Empty cells are retained. Table headers repeat and rows have minimum (not fixed)
heights so text can expand. Consecutive GRID_ROW markers form one table. Repeated
and trailing page breaks are removed. An incomplete OCR page fails explicitly
rather than being silently omitted from a multipage paper.

Validation:

```sh
npm ci --prefix frontend
node tests/worksheet-layout.cjs
node tests/pdf-word-layout.cjs
node tests/docx-import.cjs
node tests/editable-paper.cjs
```

The last test checks the actual ZIP package, A4 and margins, picture bytes and
relationships, image proportions, editable shape geometry, empty/multiline cells,
repeated headers and page breaks. Render exports and compare each page with the
source before treating a sample as verified. Approximate AI crop bounds and faint
handwritten cell borders can still require teacher review; a successful structural
test does not certify OCR accuracy on every reference.
