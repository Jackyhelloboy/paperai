# Automatic scanning and the smaller reader

Uploads start processing automatically. The dashboard keeps the existing upload layout and shows no daily usage percentages, counters or reset dates. Paper progress uses actual stages, followed by “Ready”; duration is unknown, so no invented completion percentage is shown.

The default server scanner is unchanged. A confirmed daily limit selects the on-device reader automatically. At UTC midnight the confirmed block expires and the next scan returns to the default server scanner. Busy, network and timeout failures are not treated as quota exhaustion. Concurrent status checks share one request to `/api/usage`; the dashboard no longer downloads daily analytics.

## Smaller first-use setup

The earlier 228 MB vision model and Transformers dependency have been removed from the deployment. The replacement is Tesseract.js 6.0.1 with a pinned tessdata_fast revision `87416418657359cb625c412a48b6e1d6d41c29bd`. All scripts, embedded WASM and language files come from the PaperAI origin. The build retains upstream licenses and verifies per-file hosting limits. No inference API is needed by the backup.

Automatic script detection chooses a language pack and English for mixed headers and marks. If the script is uncertain, the reader tries English and Hindi. Explicit document-language choices use the corresponding pack; Marathi must be selected when distinction from Hindi is needed. The available packs cover English, Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia and Urdu. Kashmiri uses the Urdu script reader and requires review; it is not a dedicated Kashmiri recognizer.

The cold automatic Hindi setup totals approximately 15.4 MiB of staged JavaScript and compressed language files, compared with the previous approximately 228 MB model. Explicit Hindi skips script detection and requires approximately 6.7 MiB. HTTP compression may reduce transfer further. Language files are cached in IndexedDB; normal HTTP caching reuses runtime scripts. Cleared storage, private browsing and a different language can require another download. These are reader support files, not a downloaded copy of the uploaded paper. The interface describes preparation in plain language without displaying byte counters or provider names.

## Layout and cancellation

A known daily block skips the server-only image enhancement entirely, reducing waiting and avoiding unnecessary work. The backup reads original pixels, resized only when the longest dimension exceeds 2600 pixels; enhancement intended for the server scanner must not damage Indic strokes or alter source geometry. Sparse text detection retains isolated right-side marks. Word boxes are grouped into lines while large horizontal gaps keep marks and matching columns separate. Only recognized word rectangles are removed from the source background, preserving artwork and rules in the intervening whitespace. Native Word text uses source coordinates; A4 portrait and 0.5-inch margins remain in effect.

Source diagrams and table rules remain background pixels in the backup. This does not reconstruct every drawing or table as a native editable object. Recognition is literal and does not generate answers or apply spelling corrections. Unread text can remain in the background. Results show a review badge because difficult handwriting, numerals and language recognition can still be wrong.

The file’s remove button becomes “Cancel processing” during a scan. Cancellation stops the worker and restores retry controls; completed PDF pages remain cached while the same file stays open. A three-minute local-reader deadline prevents an indefinite preparation spinner. Old worker events cannot finish or cancel a replacement scan.

## Verification

The 13 regression suites cover quota expiry, automatic upload, cancellation, completed-page retention, all 12 authored Word references, FA2 PDF geometry, right-side marks and A4 export. Reader tests cover language selection, uncertain script fallback, same-origin assets and word-level masks. A real printed Hindi fixture detected Devanagari and retained Hindi question text and isolated `(5)`/`(2)` marks. Its first question numeral was misrecognized, demonstrating why the review badge is necessary. This is not evidence of perfect handwriting recognition or model fine-tuning.

Production browser checks and bounded load results are recorded after deployment. The load check exercises dashboard, availability and text uploads up to 20 concurrent requests; it does not measure handwriting inference throughput on arbitrary phones.

Production deployments are serialized through the tested GitHub Actions build. The competing native Git production trigger is disabled; optional native previews use the same dependency install and asset staging recipe. This prevents an unbuilt `frontend` deployment from replacing the runtime or its route protections. The configuration helper checks repository identity, preserves other settings and reads back the saved configuration before deploying.
