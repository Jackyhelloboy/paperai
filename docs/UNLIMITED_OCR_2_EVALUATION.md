# Unlimited OCR 2 evaluation before production adoption

Assessment date: 28 October 2026. The current Cloudflare/Gemini OCR remains the production engine. This change adds an **optional evaluation client and manually dispatched GitHub workflow**, not an active production-model replacement.

## What the official release supports

Baidu released Unlimited OCR 2 on 27 October 2026. Its official repository documents a CUDA Python/Transformers runtime and customized SGLang serving, tested on an NVIDIA A800-80GB. That is a tested setup, not a published minimum VRAM requirement. The model cannot be installed as Python/CUDA weights inside the existing JavaScript Cloudflare Worker. A Gemini API key does not authorize Baidu inference.

The separate Baidu cloud API provides asynchronous whole-document parsing, with PDF uploads and JSON layout output. The current documentation identifies this service as based on Unlimited OCR 2. It has no model-version pin in the documented request, so a future provider upgrade may change behavior. The cloud API requires a Baidu API Key and Secret Key. Its published trial resources are limited; open-source weights do not mean hosted inference is unlimited or free.

Sources:
- https://github.com/baidu/Unlimited-OCR
- https://huggingface.co/baidu/Unlimited-OCR-2
- https://ai.baidu.com/ai-doc/OCR/fmr1p39gb

## Safe evaluation path

1. Add `BAIDU_API_KEY` and `BAIDU_SECRET_KEY` to GitHub repository secrets. Never paste them into source, browser code, issue comments or public URLs. These are separate from `GEMINI_API_KEY`.
2. Manually run **Evaluate Baidu Unlimited OCR 2**, choosing a public repository fixture. The workflow is never run on push and never processes a private user upload automatically. Dispatch sends the selected test document to Baidu and consumes the account's resources.
3. Download the evaluation artifact. It contains the provider's original JSON pages and a task checkpoint. No automatic Word import, spelling replacement, provider switch or training is performed.
4. Compare the output with the original PDF and a teacher-approved transcription: every Hindi/Telugu/English character, question number, blank, option, mark, figure and reading-order boundary. There is no demonstrated Hindi/Telugu handwriting improvement merely because the model is tagged multilingual.

The client checks file type/size, task states, result host, result size, page count and zero-based page ordering. Those checks are structural; they do not prove text accuracy or acceptable question-paper layout. Baidu's result storage links are downloaded only from HTTPS BOS hosts with redirects rejected. OAuth credentials and provider token URLs remain inside server-side calls and are not printed or written to checkpoints.

## Local run and resume

Set the two secrets in your local environment, then run:

```sh
node scripts/evaluate-baidu-unlimited.mjs --input paper.pdf --out evaluation-output --expected-pages 22
```

If the task remains pending, the command exits with code 2 and keeps `checkpoint.json`. Rerun with the **same original file, output directory and page count** to poll the same task without uploading again. A different source hash is rejected. A missing local result can be downloaded again using its saved task. A lost submission response before a task ID is received cannot be recovered by this client; check the provider console before submitting again.

GitHub evaluation artifacts can be downloaded and resumed locally with the original file. A fresh workflow dispatch starts a new evaluation; it does not automatically restore a previous run's checkpoint. Provider task/result retention is outside the client's control. Do not commit evaluation output or upload private document results to public issues.

## Production adoption gate

- Obtain a successful real inference and independently reviewed multilingual results. Current tests mock the API protocol; they do not establish live model accuracy, cost or speed.
- Map the provider's JSON layout/table/image coordinates into PaperAI's existing editable markers while keeping the original PDF pixels. Do not replace source illustrations with remote result thumbnails or flatten question text into screenshots.
- Keep the existing source-evidence guards, Gemini verification, per-page recovery, teacher edits, image licensing and Word export behavior.
- Evaluate completion time and resource usage on the same 22-page paper. Whole-document inference is not automatically faster than the current bounded page pool.
- Verify Tahoma 11 pt body / 12 pt bold headings and marks in the real Word renderer. Count rendered pages against the 2-page ordinary / 4-page major-exam targets without shrinking text, clipping or omitting content. These page targets remain unimplemented as automatic production fit guarantees.

Until those gates pass, the current production engine and formatting pipeline remain authoritative.
