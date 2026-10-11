# Automatic OCR fallback

The compact dashboard again says “Extract text from anything” and “Drop a file here.” Uploads still start processing automatically. No blank-paper builder or model-switch button has been added.

The default OCR model remains `@cf/google/gemma-4-26b-a4b-it`. Cloudflare models share one account-wide daily neuron allocation; choosing another Cloudflare model cannot bypass that allocation.

When the provider confirms `FREE_AI_LIMIT_REACHED`, or the same-day confirmed block is already known, PaperAI automatically reads the prepared image using Florence-2 on the user's device. No inference API or paid fallback is used. At UTC midnight the confirmed daily block expires, and the next scan uses the default model again. Busy, network and timeout errors do not masquerade as daily quota exhaustion.

## Runtime

- Transformers.js is pinned to 3.8.1 in the npm lockfile.
- Model: `onnx-community/Florence-2-base-ft`, revision `e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f`.
- Quantization: q8 image encoder and embeddings; q4 text encoder and decoder.
- The first model download is approximately 228 MB. Browser caching reduces later downloads where supported. Downloads need internet; inference runs in a dedicated browser worker using same-origin WASM assets. It depends on browser support, available memory and device speed.
- GitHub Actions stages frontend assets and the pinned runtime in `build/cloudflare-pages`; neither node_modules nor model weights are published as Pages source files.

## Layout and limits

The local model performs OCR with region boxes, not question generation. It does not intentionally answer questions, rewrite spelling or add suggestions. Overlapping source regions are deduplicated and blank regions are skipped. Dense regions are split automatically when generation reaches its reading limit. Malformed model coordinate tokens are excluded from displayed text.

Recognized text becomes editable Word text boxes at its detected source positions. Original artwork, boxes and table borders remain source pixels behind the text. Preview and Word use the existing A4 portrait, 0.5-inch-margin geometry. This fallback does not promise native editable reconstruction of every source drawing or table. Unrecognized source text can remain in the preserved background.

Local OCR is less accurate than the default model on difficult handwriting and some languages. Real tests on a printed science paper and a handwritten maths scan revealed wording and number errors. Results are explicitly marked for review. Identical recognition quality across both models cannot be guaranteed.

The usage percentage always comes from current Cloudflare analytics. Provider availability is a separate badge and explanation; a provider pause never fabricates a 100% usage total. “Reported remaining” is not a promise that the primary provider accepts another request.

## Verification

`tests/local-ocr.cjs` covers region geometry, literal text and marks, overlapping crops, A4 Word XML, worker cancellation, failure recovery and duplicate-scan rejection. Quota tests cover backup selection during a block, backup after a rejection, busy responses, expired block state, and preservation of completed scans and editing. Existing Word import, reference-format, PDF, automatic-upload and scan-resume suites remain part of deployment verification.

`/local-ocr-check.html` exercises the deployed worker and runtime with a generated test page; no personal file is uploaded and no cloud AI request is made. This diagnostic page is not linked from the dashboard and does not select the application's OCR model.

Official sources: [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Transformers.js 3.8.1 per-module dtypes](https://huggingface.co/docs/transformers.js/v3.8.1/guides/dtypes), and [the pinned Florence model](https://huggingface.co/onnx-community/Florence-2-base-ft/tree/e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f).
