"""Full-weight Unlimited-OCR compatibility for GPUs without native BF16.

Only the inference methods' explicit image/autocast dtype is changed. The
model architecture, checkpoint and decoding algorithm remain the same.
"""
import ast
import inspect
import re
import textwrap
from types import MethodType


class _FP16Inference(ast.NodeTransformer):
    def __init__(self):
        self.replacements = 0

    def visit_Attribute(self, node):
        if isinstance(node.value, ast.Name) and node.value.id == "torch" and node.attr == "bfloat16":
            self.replacements += 1
            return ast.copy_location(ast.Attribute(value=node.value, attr="float16", ctx=node.ctx), node)
        return self.generic_visit(node)


def enable_fp16_inference(model):
    """Bind patched inference methods to this instance; never mutate torch."""
    patched = {}
    for name in ("infer", "infer_multi"):
        bound = getattr(model, name, None)
        if bound is None:
            continue
        original = inspect.unwrap(bound.__func__)
        if original.__code__.co_freevars:
            raise RuntimeError("Upstream inference changed: closures need compatibility review.")
        tree = ast.parse(textwrap.dedent(inspect.getsource(original)))
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == name]
        if len(functions) != 1:
            raise RuntimeError(f"Cannot safely locate upstream {name} method.")
        functions[0].decorator_list = []
        transformer = _FP16Inference()
        tree = transformer.visit(tree)
        ast.fix_missing_locations(tree)
        if not transformer.replacements:
            raise RuntimeError(f"Upstream {name} dtype changed; review before running on FP16 GPU.")
        namespace = dict(original.__globals__)
        exec(compile(tree, original.__code__.co_filename + ":kaggle-fp16", "exec"), namespace)
        patched[name] = (MethodType(namespace[name], model), transformer.replacements)
    if "infer" not in patched:
        raise RuntimeError("The checkpoint has no compatible infer method.")
    for name, (method, _) in patched.items():
        setattr(model, name, method)
    return {name: count for name, (_, count) in patched.items()}


def clean_transcription(raw):
    """Remove model grounding markup, preserving question text and numbering."""
    text = str(raw or "")
    text = re.sub(r"<\|ref\|>(?:text|title|table|image|equation|header|footer|caption|list)\s*<\|/ref\|>\s*(?=<\|det\|>)", "", text, flags=re.I)
    text = re.sub(r"<\|det\|>.*?<\|/det\|>", "", text, flags=re.S)
    text = re.sub(r"<\|/?ref\|>", "", text)
    text = re.sub(r"<\|(?:endoftext|eos|im_end|im_start)\|>|<｜end▁of▁sentence｜>", "", text)
    text = re.sub(r"^\s*```(?:markdown|md|text)?\s*\n(.*?)\n```\s*$", r"\1", text, flags=re.I | re.S)
    return text.strip()
