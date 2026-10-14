# Automatic Word export and language corrections

The live app has one **Download Word** action. The image-only “Word matching PDF” export, its code, and the manual layout panel are removed. Layout and editor language detection run automatically. Optional question text editing and selected spelling suggestions remain available.

Word download rebuilds the current editor snapshot. Visible token positions map repeated Hindi words to the right table cell without changing image IDs, crop coordinates or row delimiters. Hindi and Telugu runs have explicit script fonts and language tags. Contextual spelling suggestions retain English inside Hindi papers and can suggest native spellings for Romanized words. They preserve numbers/equations, never supply answers, and apply only to the selected text. Identical pending requests are shared; stale selections do not leave the AI button busy.

Native A4 tables, source-proportioned grids, attached Roman section headings, right-aligned scores, original picture crops and compact spacing remain supported. Recognized header pipe rows become editable tables. Measured title/address bands and the marks divider bound school-banner crops when sufficient evidence exists; unrelated crops are not cut by a fixed percentage. Grid flags and unwrapped score rows are canonicalized before rendering. Invalid grid dimensions are rejected rather than silently omitted. Browser script URLs carry the release identifier.

## Verification

- Deployed frontend and reader revision: `972a9ae0cb74af42ae734ba91a19eabcca502ee4`. [Frontend deployment](https://github.com/Jackyhelloboy/paperai/actions/runs/38424184987), [reader deployment](https://github.com/Jackyhelloboy/paperai/actions/runs/38424185009) and [worksheet verification](https://github.com/Jackyhelloboy/paperai/actions/runs/38424185165) passed on 2026-10-13.
- All 20 application/provider/export suites passed locally. Coverage includes dropped connections, persistent result retrieval, cancellation/resume, late primary results during backup failure, dense native shapes and exact editor-to-Word token preservation.
- The final bounded production check completed 180 requests, zero failures, up to 20 concurrent requests. This measures public routes and synthetic text uploads.
- All 12 authored Word packages retain original text/media/styles/editable objects; all 12 FA2 PDF pages pass measured editable-layout checks.
- The final real two-page Hindi PDF scan completed after deliberately cancelling during page 2 and resuming the same open file. Page 1 stayed complete. The actual Word download rendered to two A4 pages; all 205 NFC-normalized visible word/number tokens matched the editor, with no internal layout markers in Word. Both pages were visually inspected on 2026-10-14.
- The scan tab used frontend `57a47041af5e3f0ac1a5cf8b8fdc9b3751a7bf79` while the reader was updated to `972a9ae`; frontend source is identical across those two revisions. The separately deployed frontend also passed its production checks.
- A prior live dense-layout export produced 12 native editable shapes on one page, within their column widths. Its screenshot is retained with its original revision in the JSON record.
- An earlier live mixed-language editor check offered **Ginger** for **Gingre** inside a Hindi paper, changed only the selected text and returned the AI button to its enabled state.
- The corpus parser audit covers all 84 tracked Word/PDF files: 42 original inputs/references and 42 generated QA baselines. Generated outputs are not treated as clean training references.

Detailed records are in [WORD_EXPORT_PRODUCTION_CHECK.json](WORD_EXPORT_PRODUCTION_CHECK.json). The timeout and resume changes are described in [COMPLETION_VERIFICATION.md](COMPLETION_VERIFICATION.md).

## Limits of this verification

The final visual review completed, but it found remaining source-recognition and layout differences: an alphabet response was retained, some Hindi glyphs and question numbers differ, pipe characters remain in the time/marks row and some grid labels, header underscores wrap, and one label is separated from its grid at the page break. These are recorded rather than counted as fully corrected output.

Gemini's credential and both configured model endpoints validated in the latest deployment, but its independent generation check timed out. The actual two-page scan and required production image check completed through the available reader path. The synthetic image took 6.926 seconds, including a 527 ms job acknowledgement; this is one sample, not a full-PDF speed guarantee. Cancellation and manual resume prevent an uninterrupted timing claim for the PDF check.

Some handwriting recognition differences remain, including repeated consonants and separated vowel signs. Exact preservation of editor text is distinct from perfect OCR of every source. This release is not a certification of pixel-identical or error-free recognition for every handwriting file. The reference work configures rules, prompts and layout rather than fine-tuning hosted model weights. Native font rendering depends on the opening application; script fonts are declared rather than embedded.
