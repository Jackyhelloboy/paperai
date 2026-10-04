"""Exercise the temporary website API over HTTP without a GPU or credentials."""
import ast
import base64
import importlib.util
import json
from pathlib import Path
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("website_api", ROOT / "inference/kaggle/website_api.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
KEY = "unit-test-only-" + "x" * 32


class WebsiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.calls = []
        cls.truncated = False

        def predict(data, mime, budget):
            cls.calls.append((data, mime, budget))
            return "iv. प्रश्न\n1. ______\n२. फूल", cls.truncated

        cls.server = api.create_server(predict, KEY, ("127.0.0.1", 0))
        cls.origin = "http://127.0.0.1:" + str(cls.server.server_port)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, payload=None, authorized=True, path="/v1/chat/completions"):
        headers = {"Content-Type": "application/json"}
        if authorized:
            headers["Authorization"] = "Bearer " + KEY
        data = json.dumps(payload).encode() if payload is not None else None
        request = Request(self.origin + path, data=data, headers=headers)
        try:
            with urlopen(request, timeout=2) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def payload(self, url=None):
        return {"model": api.MODEL_ID, "stream": False, "max_tokens": 8192,
                "messages": [{"role": "user", "content": [
                    {"type": "text", "text": "<image>document parsing."},
                    {"type": "image_url", "image_url": {"url": url or
                        "data:image/jpeg;base64," + base64.b64encode(b"mock image").decode()}}]}]}

    def test_authentication_blocks_model_access(self):
        before = len(self.calls)
        self.assertEqual(self.request(self.payload(), authorized=False)[0], 401)
        self.assertEqual(self.request(authorized=False, path="/health")[0], 401)
        self.assertEqual(len(self.calls), before)

    def test_worker_request_recipe_and_literal_numbering(self):
        status, result = self.request(self.payload())
        self.assertEqual(status, 200)
        self.assertEqual(self.calls[-1], (b"mock image", "jpeg", 8192))
        self.assertEqual(result["model"], api.MODEL_ID)
        self.assertEqual(result["choices"][0]["message"]["content"], "iv. प्रश्न\n1. ______\n२. फूल")
        self.assertEqual(result["choices"][0]["finish_reason"], "stop")

    def test_token_limit_is_reported_for_worker_rejection(self):
        type(self).truncated = True
        try:
            self.assertEqual(self.request(self.payload())[1]["choices"][0]["finish_reason"], "length")
        finally:
            type(self).truncated = False

    def test_remote_urls_and_non_full_model_are_rejected(self):
        before = len(self.calls)
        self.assertEqual(self.request(self.payload("https://example.invalid/private"))[0], 400)
        payload = self.payload()
        payload["model"] = "a-smaller-model"
        self.assertEqual(self.request(payload)[0], 400)
        payload = self.payload()
        payload["messages"] = ["invalid"]
        self.assertEqual(self.request(payload)[0], 400)
        self.assertEqual(len(self.calls), before)

    def test_health_and_weak_key(self):
        self.assertEqual(self.request(path="/health")[1]["temporary"], True)
        with self.assertRaises(ValueError):
            api.create_server(lambda *_: ("", False), "short")

    def test_website_notebook_compiles_and_needs_no_dataset(self):
        notebook = json.loads((ROOT / "inference/kaggle/PaperAI-Website-GPU.ipynb").read_text())
        sources = []
        for number, cell in enumerate(notebook["cells"]):
            if cell["cell_type"] == "code":
                ast.parse(cell["source"], filename=f"website-cell-{number}")
                self.assertEqual(cell["outputs"], [])
                sources.append(cell["source"])
        self.assertIn((ROOT / "inference/kaggle/website_api.py").read_text().strip() + "\n", sources)
        self.assertNotIn("/kaggle/input", "\n".join(sources))


if __name__ == "__main__":
    unittest.main()
