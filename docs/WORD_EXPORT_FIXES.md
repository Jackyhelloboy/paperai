# Automatic Word export and language corrections

The live app has one **Download Word** action. The image-only “Word matching PDF” export, its code, and the manual layout panel are removed. Layout and editor language detection run automatically. Optional question text editing and selected spelling suggestions remain available.

Word download rebuilds the current editor snapshot. Visible token positions map repeated Hindi words to the right table cell without changing image IDs, crop coordinates or row delimiters. Hindi and Telugu runs have explicit script fonts and language tags. Contextual spelling suggestions retain English inside Hindi papers and can suggest native spellings for Romanized words. They preserve numbers/equations, never supply answers, and apply only to the selected text. Identical pending requests are shared; stale selections do not leave the AI button busy.

Native A4 tables, source-proportioned grids, attached Roman section headings, right-aligned scores, original picture crops and compact spacing remain supported. Recognized header pipe rows become editable tables. Measured title/address bands and the marks divider bound school-banner crops when sufficient evidence exists; unrelated crops are not cut by a fixed percentage. Grid flags and unwrapped score rows are canonicalized before rendering. Invalid grid dimensions are rejected rather than silently omitted. Browser script URLs carry the release identifier.

## Verification

- Frontend revision: `5b248adfba6a936dddfdca19825c6887831e8e7b`; deployment workflow [38231223502](https://github.com/Jackyhelloboy/paperai/actions/runs/38231223502) passed.
- Reader revision: `eaddbc1f0dc26b4aa05ffd96158c7c6b3dca06ea`; its backend deployment and image smoke check passed.
- All 16 application/provider/export suites passed locally and in the final frontend deployment.
- The final bounded production check completed 180 requests, zero failures, up to 20 concurrent requests. This measures public routes and synthetic text uploads.
- All 12 authored Word packages retain original text/media/styles/editable objects; all 12 FA2 PDF pages pass measured editable-layout checks.
- Two actual Hindi PDF Word downloads were rendered and both pages inspected. All 194 visible word/number tokens matched the editor in the automatic case and in a deliberate one-word edit case.
- The live mixed-language editor offered **Ginger** for **Gingre** inside a Hindi paper. The corrected request handling returned the AI button to its enabled state.
- The corpus parser audit covers all 84 tracked Word/PDF files: 42 original inputs/references and 42 generated QA baselines. Generated outputs are not treated as clean training references.

Detailed records are in [WORD_EXPORT_PRODUCTION_CHECK.json](WORD_EXPORT_PRODUCTION_CHECK.json).

## Limits of this verification

The browser transport disconnected and its reset timed out during the final visual check. The latest grid/score decoder revision passed regression and deployment checks, but its final live Word render could not be completed in this session. Earlier real downloads and the live suggestion interaction were verified before the disconnect.

Some handwriting recognition differences remain, including repeated consonants and separated vowel signs. Exact preservation of editor text is distinct from perfect OCR of every source. This release is not a certification of pixel-identical or error-free recognition for every handwriting file. The reference work configures rules, prompts and layout rather than fine-tuning hosted model weights. Native font rendering depends on the opening application; script fonts are declared rather than embedded.
