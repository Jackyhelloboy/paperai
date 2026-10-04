"""Build a website API notebook; no Kaggle image dataset is required."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
source = json.loads((ROOT / "PaperAI-Unlimited-OCR.ipynb").read_text(encoding="utf-8"))
cells = []


def cell(kind, text):
    value = {"cell_type": kind, "metadata": {}, "source": text.strip() + "\n"}
    if kind == "code":
        value.update(execution_count=None, outputs=[])
    cells.append(value)


cell("markdown", """
# PaperAI — upload on your website, run OCR on Kaggle

This is a temporary authenticated API for testing the full `baidu/Unlimited-OCR` model
from your existing PaperAI website. **No paper dataset needs to be uploaded to Kaggle.**
The website sends each page through its Cloudflare Worker to this model, then formats
the returned text and exports Word as before.

Enable **GPU T4 x2** and **Internet**. Keep this notebook private. In **Add-ons → Secrets**,
create `UNLIMITED_OCR_API_KEY` with a private random key of at least 32 ASCII characters
and enable access for this notebook. Use the same value in the Cloudflare Worker's secret
of that name. Never publish the key in code, notebook output, GitHub or chat.

Run cells in order. The last cell starts a test connection for up to 30 minutes.
It prints a temporary API base URL. In Cloudflare Worker settings, set
`UNLIMITED_OCR_BASE_URL` to that URL (including `/v1`). The existing Worker adapter
will use Unlimited-OCR. If `OCR_PROVIDER` was explicitly set to `cloudflare-ai`, change
it to `unlimited-ocr`. Test one upload on the website and compare it with the scan.

Kaggle sessions and GPU quota are limited. The URL changes each time the tunnel starts.
This notebook does not provide permanent production hosting and does not bypass idle,
session or quota limits. Cloudflare Quick Tunnels are intended for testing only.
""")

# Reuse the exact tested full-checkpoint setup and GPU dtype compatibility.
cells.extend(source["cells"][1:4])
cell("code", (ROOT / "website_api.py").read_text(encoding="utf-8"))

cell("code", """
import tempfile
from io import BytesIO
from PIL import Image

def predict_website_page(image_bytes, mime, requested_tokens):
    # Verify locally; never fetch an arbitrary remote image URL.
    with Image.open(BytesIO(image_bytes)) as probe:
        if probe.format not in {"JPEG", "PNG", "WEBP"} or probe.width * probe.height > 25000000:
            raise ValueError("Invalid image type or size.")
        probe.verify()
    generation = {}
    original_generate = model.generate
    had_instance_generate = "generate" in model.__dict__
    previous_generate = model.__dict__.get("generate")

    def budgeted_generate(*args, **kwargs):
        ids = kwargs.get("input_ids")
        if ids is None and args:
            ids = args[0]
        if ids is None:
            raise RuntimeError("Upstream generation interface changed.")
        input_length = int(ids.shape[-1])
        budget = min(requested_tokens, 32768 - input_length)
        if budget <= 0:
            raise ValueError("Page exceeds the model context window.")
        kwargs.pop("max_length", None)
        kwargs["max_new_tokens"] = budget
        output = original_generate(*args, **kwargs)
        sequences = output.sequences if hasattr(output, "sequences") else output
        generated = int(sequences.shape[-1]) - input_length
        eos = tokenizer.eos_token_id
        eos = eos if isinstance(eos, (list, tuple)) else [eos]
        generation["truncated"] = generated >= budget and int(sequences[0, -1]) not in eos
        return output

    model.generate = budgeted_generate
    try:
        with tempfile.TemporaryDirectory(prefix="paperai-page-") as directory:
            page = Path(directory) / ("page." + ("jpg" if mime == "jpeg" else mime))
            page.write_bytes(image_bytes)
            with torch.inference_mode():
                raw = model.infer(tokenizer, prompt="<image>document parsing.",
                    image_file=str(page), output_path=directory,
                    base_size=1024, image_size=640, crop_mode=True, max_length=32768,
                    no_repeat_ngram_size=35, ngram_window=128, temperature=0.0,
                    eval_mode=True, save_results=False)
            if not generation:
                raise RuntimeError("Generation did not return an output budget result.")
            return clean_transcription(raw), generation["truncated"]
    finally:
        if had_instance_generate:
            model.generate = previous_generate
        else:
            del model.generate
        gc.collect()
        torch.cuda.empty_cache()
""")

cell("code", """
# This cell exposes an authenticated OCR test API, never a notebook/Jupyter service.
# It closes the server and tunnel after 30 minutes or when this cell is interrupted.
import hashlib, os, platform, subprocess, threading, urllib.request, time
from kaggle_secrets import UserSecretsClient

api_key = UserSecretsClient().get_secret("UNLIMITED_OCR_API_KEY")
website_server = create_server(predict_website_page, api_key)
del api_key
website_thread = threading.Thread(target=website_server.serve_forever, daemon=True)
website_thread.start()
tunnel = None
try:
    # Download only the official Cloudflare release and verify its published SHA256.
    if platform.machine() not in {"x86_64", "AMD64"}:
        raise RuntimeError("This tunnel setup expects Kaggle's Linux amd64 runtime.")
    request = urllib.request.Request("https://api.github.com/repos/cloudflare/cloudflared/releases/latest",
                                     headers={"User-Agent": "PaperAI-Kaggle-Test"})
    with urllib.request.urlopen(request, timeout=30) as response:
        release = json.load(response)
    asset = next(item for item in release["assets"] if item["name"] == "cloudflared-linux-amd64")
    digest = asset.get("digest", "")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
        raise RuntimeError("The official release has no verifiable SHA256; stop and review the release.")
    asset_url = asset["browser_download_url"]
    if not asset_url.startswith("https://github.com/cloudflare/cloudflared/releases/download/"):
        raise RuntimeError("Unexpected Cloudflare release download origin.")
    with urllib.request.urlopen(asset_url, timeout=60) as response:
        binary = response.read(100 * 1024 * 1024 + 1)
    if len(binary) > 100 * 1024 * 1024 or hashlib.sha256(binary).hexdigest() != digest[7:]:
        raise RuntimeError("Cloudflare binary checksum verification failed.")
    binary_path = Path("/kaggle/working/cloudflared")
    binary_path.write_bytes(binary)
    binary_path.chmod(0o700)
    log_path = Path("/kaggle/working/paperai-tunnel.log")
    with log_path.open("w") as log:
        tunnel = subprocess.Popen([str(binary_path), "tunnel", "--url", "http://127.0.0.1:8000",
            "--protocol", "http2", "--no-autoupdate"], stdout=log, stderr=log)
    deadline = time.monotonic() + 60
    public_url = None
    while time.monotonic() < deadline:
        match = re.search(r"https://[a-z0-9-]+\\.trycloudflare\\.com", log_path.read_text())
        if match:
            public_url = match[0]
            break
        if tunnel.poll() is not None:
            raise RuntimeError("Cloudflare tunnel stopped; check the tunnel log.")
        time.sleep(1)
    if not public_url:
        raise RuntimeError("No temporary tunnel URL appeared. Kaggle network access may block tunnels.")
    print("Temporary UNLIMITED_OCR_BASE_URL:", public_url + "/v1", flush=True)
    print("Set the matching API key privately in Cloudflare Worker secrets, then test a website upload.", flush=True)
    print("This test connection stops in 30 minutes. Interrupt this cell to stop sooner.", flush=True)
    # Serve only during this bounded test; no activity spoofing or quota bypass.
    stop_at = time.monotonic() + 30 * 60
    while time.monotonic() < stop_at:
        if tunnel.poll() is not None:
            raise RuntimeError("The tunnel stopped. Website OCR is no longer reachable.")
        time.sleep(1)
finally:
    if tunnel is not None:
        tunnel.terminate()
        try:
            tunnel.wait(timeout=10)
        except subprocess.TimeoutExpired:
            tunnel.kill()
            tunnel.wait(timeout=10)
    website_server.shutdown()
    website_server.server_close()
    print("Temporary website OCR connection stopped.", flush=True)
""")

cell("markdown", """
## After the test

Clear `UNLIMITED_OCR_BASE_URL` (and any explicit `OCR_PROVIDER=unlimited-ocr`) in Cloudflare
to restore the original provider after the Kaggle session ends. While Unlimited-OCR is
selected, an unavailable GPU returns an error; no smaller model is silently substituted.
Question numbering and continuous Word formatting are handled by the existing website.
Actual GPU latency and handwriting accuracy must be verified with a real website upload.
""")

notebook = {"cells": cells, "metadata": source["metadata"], "nbformat": 4, "nbformat_minor": 4}
(ROOT / "PaperAI-Website-GPU.ipynb").write_text(json.dumps(notebook, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
