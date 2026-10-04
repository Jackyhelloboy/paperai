# Upload on PaperAI, use Kaggle for temporary GPU inference

Use `PaperAI-Website-GPU.ipynb` for this flow. The original `PaperAI-Unlimited-OCR.ipynb`
is a manual batch notebook; it does not serve the website.

The website API notebook needs **no input dataset**. Upload papers only through PaperAI.
The existing Worker forwards each embedded page image over HTTPS to the authenticated
Kaggle API, then retains its numbering/continuous-flow/Word export behavior. Uploaded
images live in a per-request temporary directory which is removed after inference.

## Setup

1. Import the website API notebook from GitHub into Kaggle, keep it private, enable GPU
   and Internet. Kaggle phone verification is required for GPU access.
2. In Kaggle **Add-ons → Secrets**, create `UNLIMITED_OCR_API_KEY` using a private random
   ASCII key of at least 32 characters. Enable access for this notebook. Never put the
   value in chat, notebook code/output, URLs or GitHub.
3. Run the cells in order. The full model loads before the API starts. The last cell
   downloads the official Cloudflare tunnel binary and checks its published SHA256.
   It prints a temporary `https://…trycloudflare.com/v1` base URL, never the secret.
4. In Cloudflare, open **Workers & Pages → paperai-ocr → Settings → Variables and Secrets**.
   Set `UNLIMITED_OCR_BASE_URL` to that printed URL including `/v1`, and set the secret
   `UNLIMITED_OCR_API_KEY` to the same private value used in Kaggle. If `OCR_PROVIDER`
   explicitly selects `cloudflare-ai`, set it to `unlimited-ocr` for this test.
5. Test a **single page upload on PaperAI**, comparing Hindi words, question numbers and
   answer blanks with the scan. Confirm the API's returned model metadata before claiming
   activation. GPU inference, network reachability and latency are unverified until this run.

The API accepts only Baidu's literal parsing prompt and one embedded JPEG/PNG/WebP page,
up to 8 MiB. It serializes model execution and returns a busy error if another request
already occupies the GPU. Start with one page at a time. Token-limit results report
`finish_reason=length`, which the Worker rejects instead of presenting incomplete output.
Failures never select a smaller model.

The tunnel and server shut down after a bounded **30-minute test** or when the cell is
interrupted. Kaggle's session/idle/GPU quotas still apply; no keepalive or quota bypass
is implemented. The next tunnel run gets a new URL. Quick Tunnels are for testing only,
not permanent hosting. This is a temporary website evaluation path, not a production
availability guarantee.

After the test, remove `UNLIMITED_OCR_BASE_URL` and any explicit `OCR_PROVIDER=unlimited-ocr`
from Cloudflare to restore the original provider. While the external provider is selected,
an ended Kaggle session produces an OCR error until the connection is restored or reset.

Sources: [Kaggle notebook limits](https://www.kaggle.com/docs/notebooks),
[Cloudflare Quick Tunnel limitations](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/),
[official model inference recipe](https://github.com/baidu/Unlimited-OCR#inference).
