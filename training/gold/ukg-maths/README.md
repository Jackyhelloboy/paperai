# Manually reviewed UKG maths reference

Source: `training/maths.pdf`, page 1 (952 × 1348 rendered pixels).
Target: `training/out/PaperAI-UKG-Maths-Reviewed.docx` and its PDF.
The complete source and the one-page exported target were visually compared.

The target uses A4 portrait, 0.5-inch margins, 11 pt body text, right-side
marks, a native empty 10 × 5 number grid and the five original counting-drawing
groups. Number labels and blank answers align with each drawing. Pictures are
separate image objects; text and table cells remain editable. Matching rows
retain the source's unsolved pairs. No object counts or word answers are supplied.
The visible address and ANSWER SHEET label are retained; the clipped school
name is omitted rather than invented. Flower separators are editable text.

`manifest.json` records the exact source pixel boxes. The PNGs preserve source
pixels, including the photographed paper ruling. `paper.txt` is the manually
checked transcription in PaperAI's canonical layout format. This is a reviewed
target, not the result of a new automatic OCR run and not a weight-fine-tuning job.

Rebuild using the actual production exporter:

```sh
npm ci --prefix frontend
node training/build-reviewed-maths.cjs
```

Render and compare the complete page again after changing the exporter.
For a production import/export check, upload this DOCX to PaperAI, choose
Extract text, then Editable Word. It uses Word import without an OCR request.
