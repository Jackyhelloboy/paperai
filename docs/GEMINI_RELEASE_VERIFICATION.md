# Server-side backup release verification

Deployed application commit: `c83e6ef731562f3a14d7c0a48abf8c95ed605df6`.
Date: 11 October 2026.

The browser reader dependency, workers, layout adapter, diagnostic page and asset-staging script are removed. The deployed HTML loads document-editing/parsing libraries and no browser model. Former runtime, manifest, language-pack and worker routes return 404. The dashboard retains automatic uploads and stage-based progress without percentages, download preparation text, provider names or model switches.

Gemini `gemini-flash-latest` is implemented as a server-side backup. The original scanner stays the default. Routing preserves daily primary expiry, request-local backup selection during verification, literal source/layout rules, independent accounting and sanitized failures. Scanned PDF pages use this same image request path. All 13 regression suites pass, including the new Gemini contract/routing tests and the existing authored Word/FA2 PDF fidelity tests.

## Production checks

Both deployments and the worksheet verification workflow succeeded. The active frontend release marker matched the deployed commit. The public health/status responses were sanitized and all retired diagnostic/model routes were blocked.

| Operation | Requests | Concurrency | Failures | p95 |
| --- | ---: | ---: | ---: | ---: |
| Dashboard | 40 | 5 | 0 | 47 ms |
| Dashboard | 40 | 10 | 0 | 67 ms |
| Dashboard | 40 | 20 | 0 | 122 ms |
| Availability | 40 | 10 | 0 | 265 ms |
| Synthetic text uploads | 20 | 5 | 0 | 34 ms |

These 180 requests verify website/API/text-reader capacity. They do not measure image-model concurrency or handwriting accuracy.

A synthetic question paper was uploaded through the production interface and its actual Word download was rendered and inspected. The result was one A4 portrait page with 720-twip (0.5-inch) margins, an editable table and shapes, marks at the right, source blanks and unchanged unsolved arithmetic. The screenshot records the production editor; no actual teacher training documents were uploaded by this live check.

## Activation still required

The supplied API key was not committed, embedded in browser assets, logged or installed. The GitHub connector does not support encrypted-secret writes. Its browser settings required sign-in; the secure sign-in handoff ended without a usable signed-in settings session. The deployment log explicitly skipped live credential verification because no repository deployment secret was supplied.

A live synthetic Hindi image upload reached the backend and returned the sanitized temporary-unavailable message while the primary daily limit was active. Processing stopped and Retry controls recovered. This was a blocked scan, not a successful Gemini recognition test.

To activate the backup, save `GEMINI_API_KEY` as a secret on the existing `paperai-ocr` Worker, or add that named repository Actions secret and run **Deploy Cloudflare Worker**. The latter checks the credential/model before installing it securely. Real Gemini image/PDF recognition and its resulting Word layout require verification after activation. The implementation alone does not guarantee exact handwriting recognition or unlimited provider quota.
