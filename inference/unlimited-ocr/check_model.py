"""Run real Unlimited-OCR inference before enabling it in PaperAI (stdlib only)."""
import argparse
import base64
import json
import mimetypes
import os
from pathlib import Path
import urllib.request


def build_request(paths):
    content = [{"type": "text", "text": "<image>Multi page parsing." if len(paths) > 1 else "<image>document parsing."}]
    for path in paths:
        mime = mimetypes.guess_type(path.name)[0]
        if mime not in {"image/jpeg", "image/png", "image/webp"}:
            raise ValueError("Use JPEG, PNG or WebP page images")
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{encoded}"}})
    return {
        "model": "baidu/Unlimited-OCR",
        "messages": [{"role": "user", "content": content}],
        "temperature": 0,
        "max_tokens": 24576 if len(paths) > 1 else 8192,
        "stream": False,
        "skip_special_tokens": False,
        "vllm_xargs": {"ngram_size": 35, "window_size": 1024 if len(paths) > 1 else 128},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("images", type=Path, nargs="+")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    base = os.environ.get("UNLIMITED_OCR_BASE_URL", "http://127.0.0.1:8000/v1").rstrip("/")
    key = os.environ["UNLIMITED_OCR_API_KEY"]
    request = urllib.request.Request(
        base + "/chat/completions",
        data=json.dumps(build_request(args.images)).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
    )
    with urllib.request.urlopen(request, timeout=1200) as response:
        result = json.load(response)
    choice = result["choices"][0]
    text = choice["message"]["content"]
    if choice.get("finish_reason") == "length" or not text.strip():
        raise RuntimeError("Model returned truncated or empty output; inspect the serving configuration")
    args.output.write_text(text, encoding="utf-8")
    print(f"Saved model transcription to {args.output}; compare words and question numbers against the source.")


if __name__ == "__main__":
    main()
