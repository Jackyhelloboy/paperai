"""Small authenticated API for temporary full-model website OCR sessions.

The predictor runs locally, serially. No uploaded images are saved as datasets.
This module has no model or tunnel side effects when imported.
"""
import base64
import binascii
import hmac
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL_ID = "baidu/Unlimited-OCR"
MAX_BODY = 12 * 1024 * 1024
MAX_IMAGE = 8 * 1024 * 1024


def parse_page(payload):
    if not isinstance(payload, dict) or payload.get("model") != MODEL_ID:
        raise ValueError("Select the complete baidu/Unlimited-OCR model.")
    if payload.get("stream", False):
        raise ValueError("This temporary API supports non-streaming requests.")
    messages = payload.get("messages")
    if not isinstance(messages, list) or len(messages) != 1 or messages[0].get("role") != "user":
        raise ValueError("Send one user message with one full-page image.")
    content = messages[0].get("content")
    if not isinstance(content, list) or len(content) != 2:
        raise ValueError("Send the document parsing prompt and one image.")
    prompts = [item.get("text") for item in content if isinstance(item, dict) and item.get("type") == "text"]
    images = [item.get("image_url", {}).get("url") for item in content if isinstance(item, dict) and item.get("type") == "image_url" and isinstance(item.get("image_url"), dict)]
    if prompts != ["<image>document parsing."] or len(images) != 1 or not isinstance(images[0], str):
        raise ValueError("Use the literal document parsing prompt and one data-URL image.")
    match = re.fullmatch(r"data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)", images[0])
    if not match:
        raise ValueError("Only embedded JPEG, PNG or WebP images are supported.")
    try:
        data = base64.b64decode(match[2], validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("The image has invalid base64 encoding.") from None
    if not data or len(data) > MAX_IMAGE:
        raise ValueError("Image must be nonempty and at most 8 MiB.")
    budget = payload.get("max_tokens", 8192)
    if isinstance(budget, bool) or not isinstance(budget, int) or not 1 <= budget <= 8192:
        raise ValueError("max_tokens must be an integer from 1 to 8192.")
    return data, match[1], budget


def create_server(predict, api_key, address=("127.0.0.1", 8000)):
    if not isinstance(api_key, str) or len(api_key) < 32 or not api_key.isascii() or api_key.strip() != api_key:
        raise ValueError("Set a private API key of at least 32 ASCII characters.")
    expected = ("Bearer " + api_key).encode("ascii")
    gpu_lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Never print credentials or request data in notebook output.

        def reply(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def authorized(self):
            received = self.headers.get("Authorization", "").encode("utf-8")
            if not hmac.compare_digest(received, expected):
                self.reply(401, {"error": "Authentication required."})
                return False
            return True

        def do_GET(self):
            if not self.authorized():
                return
            if self.path != "/health":
                return self.reply(404, {"error": "Not found."})
            self.reply(200, {"model": MODEL_ID, "temporary": True, "gpu_busy": gpu_lock.locked()})

        def do_POST(self):
            if not self.authorized():
                return
            if self.path != "/v1/chat/completions":
                return self.reply(404, {"error": "Not found."})
            self.connection.settimeout(30)
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= MAX_BODY:
                    return self.reply(413, {"error": "Request body is empty or exceeds 12 MiB."})
                if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                    return self.reply(415, {"error": "Send application/json."})
                data, mime, budget = parse_page(json.loads(self.rfile.read(length)))
            except (ValueError, TypeError, AttributeError, TimeoutError):
                return self.reply(400, {"error": "Invalid OCR request. Send one embedded page image."})
            if not gpu_lock.acquire(blocking=False):
                return self.reply(503, {"error": "GPU is processing another page. Retry after it finishes."})
            try:
                text, truncated = predict(data, mime, budget)
                if not isinstance(text, str) or not text.strip():
                    return self.reply(502, {"error": "The full model returned no transcription."})
                self.reply(200, {"model": MODEL_ID, "choices": [{"index": 0,
                    "message": {"role": "assistant", "content": text},
                    "finish_reason": "length" if truncated else "stop"}]})
            except ValueError:
                self.reply(400, {"error": "Invalid or oversized page image."})
            except Exception:
                self.reply(502, {"error": "Unlimited-OCR could not finish this page. Check the GPU session."})
            finally:
                gpu_lock.release()

    return ThreadingHTTPServer(address, Handler)
