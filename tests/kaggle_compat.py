"""Verify dtype isolation, fail-closed behavior and standalone notebook syntax."""
import ast
import importlib.util
import inspect
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("kaggle_compat", ROOT / "inference/kaggle/compat.py")
compat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compat)

# No GPU required: exercise the actual AST patch against a miniature dtype API.
torch = SimpleNamespace(bfloat16="BF16", float16="FP16")


class FullModel:
    def infer(self, value=1):
        return value, torch.bfloat16

    def infer_multi(self, value=2):
        return value, torch.bfloat16


class ChangedUpstream:
    def infer(self):
        return torch.bfloat16

    def infer_multi(self):
        return "upstream now chooses its own dtype"


class CompatibilityTests(unittest.TestCase):
    def test_patch_is_instance_only_and_preserves_signature(self):
        original = FullModel()
        patched = FullModel()
        signature = inspect.signature(patched.infer)
        self.assertEqual(compat.enable_fp16_inference(patched), {"infer": 1, "infer_multi": 1})
        self.assertEqual(patched.infer(7), (7, "FP16"))
        self.assertEqual(patched.infer_multi(), (2, "FP16"))
        self.assertEqual(original.infer(), (1, "BF16"))
        self.assertEqual(torch.bfloat16, "BF16")
        self.assertEqual(inspect.signature(patched.infer), signature)

    def test_changed_upstream_does_not_partially_patch_model(self):
        model = ChangedUpstream()
        with self.assertRaisesRegex(RuntimeError, "dtype changed"):
            compat.enable_fp16_inference(model)
        self.assertEqual(model.infer(), "BF16")
        self.assertNotIn("infer", model.__dict__)

    def test_cleaning_preserves_hindi_numbers_options_and_blanks(self):
        literal = "iv. प्रश्न\n(1) सही विकल्प चुनिए।\n(क) फूल\n२. ______\n3. 4 + 2 = ____"
        raw = "<|ref|>title<|/ref|><|det|>[[1,2,3,4]]<|/det|>" + literal + "<｜end▁of▁sentence｜>"
        self.assertEqual(compat.clean_transcription(raw), literal)
        self.assertEqual(compat.clean_transcription("<|det|>text [1,2,3,4]<|/det|>" + literal), literal)

    def test_notebook_is_standalone_and_compiles(self):
        notebook = json.loads((ROOT / "inference/kaggle/PaperAI-Unlimited-OCR.ipynb").read_text())
        self.assertEqual(notebook["nbformat"], 4)
        sources = []
        for number, cell in enumerate(notebook["cells"]):
            if cell["cell_type"] == "code":
                self.assertEqual(cell["outputs"], [])
                self.assertIsNone(cell["execution_count"])
                ast.parse(cell["source"], filename=f"notebook-cell-{number}")
                sources.append(cell["source"])
        helper = (ROOT / "inference/kaggle/compat.py").read_text().strip() + "\n"
        self.assertIn(helper, sources)
        self.assertIn('MODEL_ID = "baidu/Unlimited-OCR"', "\n".join(sources))


if __name__ == "__main__":
    unittest.main()
