# Open-source integrations for faithful question papers

Reviewed 28 October 2026. The objective is exact editable question text, original figures, reliable reading order, simple Word editing and compact A4 output. Adding a repository is useful only when its runtime, license and failure behavior fit the deployed Pages/Worker application.

## Implemented in this update

| Repository | Pinned package | Purpose in PaperAI | License |
| --- | --- | --- | --- |
| https://github.com/kpdecker/jsdiff | `diff@9.0.0` | Align teacher-approved edits with the original visible tokens. Keep two distant corrections separate rather than moving intervening questions into the first matching cell. | BSD-3-Clause |
| https://github.com/cometkim/unicode-segmenter | `unicode-segmenter@0.17.3` | Tokenize complete grapheme clusters before grouping words, retaining Indic conjuncts, joiners, combining vowel signs and joined symbols. Same implementation in browser and Node checks. | MIT |

`paper-text.js` uses the packages directly in Node. The Pages build uses `esbuild@0.28.2` (MIT, development only) to bundle just `diffArrays` and `graphemeSegments` into `/vendor/text-diff-engine.js`. The two APIs total 8,279 minified bytes in the tested browser build, without compression. The asset loads from PaperAI's own origin, is versioned with the deployment SHA and needs no model download, new server, paid key or GPU. The build publishes package license notices next to the bundle.

The reproduced defect used 1,600 Hindi tokens across two matching cells, with corrections at opposite ends. Previously, the quadratic diff limit replaced the entire changed interval and relocated the second cell's words into the first. Myers sequence alignment now keeps those two replacements distinct. Inputs requiring more than 512 token additions/deletions or exceeding the bounded diff work time return no exact mapping rather than one destructive whole-document interval. The existing Teach fallback is still available; this does not guarantee every wholesale paste can preserve its layout.

Only teacher-entered changes are applied. These libraries do not suggest answers, translate questions, rewrite OCR, train models or send document text anywhere. Hidden image IDs, source coordinates and marker delimiters stay outside editable token mapping. Existing preview, plain-text and Word export share this mapping.

## Other repositories examined

| Repository | Assessment for this deployment |
| --- | --- |
| https://github.com/naptha/tesseract.js | Can run image OCR in a browser using WebAssembly and language data; PDF pages must first be rendered. PaperAI previously retired its browser reader and model downloads. Not reintroduced in this change: a generic printed-text reader is not demonstrated to improve these handwritten multilingual worksheets, and extra phone downloads/processing could increase latency. |
| https://github.com/PaddlePaddle/PaddleOCR | Has a browser SDK and multilingual models, including separate Devanagari/Telugu recognition models in its documentation. A useful candidate for a separately benchmarked reader, but package/model availability, actual supported browser language combinations, asset size, mobile memory and source-picture preservation require a real fixture evaluation. Not installed or described as production-ready here. |
| https://github.com/mozilla/pdf.js | Already used for PDF text, geometry and page rendering. Keep reliable embedded text local; do not spend OCR calls on readable digital text unnecessarily. No PDF.js upgrade in this change. |
| https://github.com/hfg-gmuend/openmoji | Already supplies reviewed locally bundled raster worksheet pictures with attribution. Preserve real source figures first. No new automatic image selection in this change. |
| https://github.com/flmnt/graphemer | Archived and uses older Unicode data than the selected segmenter. Not added. |

Primary technical references:
- https://github.com/kpdecker/jsdiff#api
- https://github.com/cometkim/unicode-segmenter#apis
- https://github.com/naptha/tesseract.js#project-scope
- https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md
- https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md
- https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/module_usage/text_recognition.en.md

## Validation and limits

`node tests/multilingual-text-engine.cjs` checks distant edits on a long Hindi paper, selected repeated-word corrections in Hindi, Telugu, Tamil, Kannada, Malayalam, Bengali, Gujarati, Punjabi, Odia, Urdu, Japanese and Thai, as well as conjunct/emoji boundaries. It checks browser/Node parity, retained media IDs, rejected protocol injection, bounded large-paste behavior and a missing-bundle fallback that refuses a destructive large replacement. These are text-handling tests, not measured OCR accuracy for every language.

The standard exact-Word, source-figure, gateway, provider fallback, page-resume and layout suites remain required. Production smoke checks the new versioned asset after deployment.

Cloudflare/Gemini remain the image readers. No new OCR model was installed. Accurate handwriting recognition still needs source review. Automatic two-/four-page fitting, actual Tahoma availability on readers' devices, and full real-paper multilingual accuracy remain separate work; these integrations do not claim to solve them.
