# Unlimited-OCR for PaperAI

PaperAI can send its uploaded page images to **baidu/Unlimited-OCR** through a dedicated vLLM GPU server. The browser keeps the current upload, background extraction, numbered preview and Word export. Cloudflare handles the API and deterministic formatting. The model runs on the GPU host, not inside a Python Worker.

## Status and requirements

The adapter and serving recipe are implemented. Real model inference and handwritten Hindi accuracy have **not** been verified without a GPU endpoint. Until `UNLIMITED_OCR_BASE_URL` is configured, the website continues using its existing Cloudflare model. Setting this secret activates Unlimited-OCR; an upstream failure then returns an error and never silently changes to a different model.

The official recipe calls for an NVIDIA GPU with at least 8 GB VRAM for BF16 inference; longer pages, concurrency and server overhead may need more memory. Install Docker with NVIDIA Container Toolkit on the GPU host. GPU hosting is billed separately from Cloudflare's free Workers AI quota. This repo does not provision or purchase a host.

Sources:
- https://github.com/baidu/Unlimited-OCR
- https://recipes.vllm.ai/baidu/Unlimited-OCR
- https://huggingface.co/baidu/Unlimited-OCR

## Start the model server

From this directory on the GPU host, set a strong API key in the shell and start the service:

```bash
read -rs -p 'Model API key: ' UNLIMITED_OCR_API_KEY
export UNLIMITED_OCR_API_KEY
docker compose up -d
```

The model and Python inference runtime are supplied by the model's dedicated vLLM image. The required logits processor, full model ID, BF16 default and 32768 context are preserved. On Hopper GPUs requiring CUDA 12.9, replace the image with `vllm/vllm-openai:unlimited-ocr-cu129`, as documented by Baidu. A production deployment should pin the tested image digest after validating it on the chosen GPU.

Port 8000 listens on the host's loopback address. Expose it through an HTTPS reverse proxy or an existing Cloudflare Tunnel, with the `/v1` path preserved. The same API key protects requests. Do not commit the key or embed it in frontend code. This setup does not require modifying PaperAI's legacy PaddleOCR/EasyOCR Python backend.

## Test the real model first

Python 3 can test one page or multiple ordered pages using the included standard-library client:

```bash
python check_model.py page1.jpg --output single-page.txt
python check_model.py page1.jpg page2.jpg page3.jpg page4.jpg --output four-pages.txt
```

For a remote endpoint, set `UNLIMITED_OCR_BASE_URL` to its complete `https://.../v1` base URL before testing. Compare the outputs with the original photos, including every Hindi word, left-margin question number, Roman section label, matching row and answer blank. The model's multilingual label is not evidence that it will read this handwriting accurately. Do not use an unrelated public demo as the production backend.

## Activate the website

From `worker/`, using the existing Cloudflare account:

```bash
npx wrangler secret put UNLIMITED_OCR_API_KEY
npx wrangler secret put UNLIMITED_OCR_BASE_URL
```

Enter the matching model-server API key and HTTPS `/v1` URL at the prompts. Secrets stay server-side and persist across normal Worker deployments. The GitHub deployment does not need GPU credentials. `GET /health` then reports `ocr_provider: unlimited-ocr` and `model: baidu/Unlimited-OCR`; it reports selected configuration, not model-server readiness.

The website still extracts one complete source page per background job as users select files. It sends the whole frame to Unlimited-OCR; the overlapping Gemma detail crops are deliberately not sent as additional pages. Ordered aggregation, question numbering and continuous Word pagination remain in the existing frontend. Multi-page inference is available in the Python validation client; the website does not yet send an entire batch as one model request.

Requests use the official `<image>document parsing.` prompt, `skip_special_tokens: false` and `ngram_size: 35, window_size: 128`. Grounding tags and coordinate boxes are removed before preview/export while source numbers and text remain. Empty or truncated output fails explicitly instead of producing an incomplete document. A 170-second upstream timeout fits inside the existing 180-second browser request limit.

JPEG, PNG and WebP images are supported. The frontend's scanned-PDF rendering supplies page images; raw PDFs sent directly to the Worker cannot be passed as model images. Text and Office-file extraction keep their existing direct-reader path.

To return OCR to the existing Cloudflare model, set `OCR_PROVIDER` with `npx wrangler secret put OCR_PROVIDER` and enter `cloudflare-ai`. To select Unlimited-OCR explicitly, enter `unlimited-ocr`. Alternatively, remove the optional override with `npx wrangler secret delete OCR_PROVIDER`; the presence of the base URL then selects Unlimited-OCR.

The public usage graph continues to count Cloudflare Workers AI neurons only. Unlimited-OCR metadata reports `external_gpu_host_billing`; its tokens are not added to that free-neuron estimate. Existing AI word suggestions and paper analysis still use Cloudflare Workers AI separately.

## Local adapter checks

```bash
node tests/unlimited-ocr.cjs
```

These mock the upstream API to verify the request recipe, tag cleanup, routing, credentials, failure behavior and quota separation. They do not measure the model's recognition accuracy or start a GPU server.
