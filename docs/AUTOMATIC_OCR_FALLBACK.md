# Automatic server-side scanning

The primary scanner remains the default. The recently added browser reader, workers, language-pack downloads, dependency and asset-staging script are removed. Retired reader routes return 404; no new model files are downloaded by teachers. PDF parsing, Word editing and document libraries remain because they handle the uploaded files and exports.

## Routing

The backend calls the primary provider first. A confirmed daily rejection is recorded, then the same request continues through Gemini `gemini-flash-latest`. Later pages skip the exhausted primary. The confirmed daily block expires at UTC midnight; the next request tries the primary again. Temporary busy/timeout/availability errors can also use Gemini when configured, but do not create a daily block. A request that switches keeps the backup for its verification pass. The frontend always uploads to the same-origin API, even when it remembers a primary daily block. There is no model selector.

Both providers receive the same literal transcription, no-answer, source-figure, table, shape, question-number, blank-space and right-side marks rules. Gemini image input uses inline base64 data on the server, and its response feeds the existing source-crop/editor/Word pipeline. Scanned PDFs are rendered page by page before scanning. Conditional verification rejects repetitive, incomplete and invalid layout output while retaining a usable first result if verification fails. Recognition still needs teacher review; these changes are not model fine-tuning or a guarantee of perfect handwriting recognition.

The API key comes only from `env.GEMINI_API_KEY`, sent in the Google request header. It is never stored in the repository, frontend, URL or upstream error log. Gemini token counts never become primary-provider neuron usage. Public errors and metadata hide providers and infrastructure. A final service failure reports that scanning is temporarily unavailable; editing and Word export remain available. Gemini has its own account limits.

## Secure activation

Option A: set `GEMINI_API_KEY` as a secret on the existing `paperai-ocr` Worker. The next request uses it; no code change is needed.

Option B: add a GitHub Actions repository secret named `GEMINI_API_KEY`, then run **Deploy Cloudflare Worker** from Actions. The workflow checks the configured alias and key with a tiny text request, installs the secret through Wrangler stdin, then deploys. No secret value belongs in workflow YAML or `wrangler.toml`. An absent repository secret preserves existing Worker secrets and explicitly skips the live credential check.

Local configuration may use ignored `worker/.dev.vars`; never commit that file. Changing a secret in GitHub alone does not run the deployment workflow.

## Verification

The 13 regression suites pass, covering mocked Gemini image serialization, quota fallback, sticky verification, primary recovery, separate accounting, suggestions, credential/busy/truncation failures, no browser-reader runtime, automatic uploads, scan cancellation/resume, all 12 authored Word references and FA2 PDF geometry. A4 narrow margins, editable structures and source pictures are preserved. Live credential validation and real Gemini handwriting quality must be reported separately from these fixture tests. This update could not install the supplied key because the connected GitHub tools do not write encrypted secrets and the browser is signed out.

API reference: https://ai.google.dev/api/generate-content
Key guidance: https://ai.google.dev/gemini-api/docs/api-key
