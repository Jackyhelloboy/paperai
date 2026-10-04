"""Build the standalone Kaggle notebook from its local compatibility helper."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
cells = []


def cell(kind, source):
    value = {"cell_type": kind, "metadata": {}, "source": source.strip() + "\n"}
    if kind == "code":
        value.update(execution_count=None, outputs=[])
    cells.append(value)


cell("markdown", """
# PaperAI — full Unlimited-OCR on Kaggle

Runs `baidu/Unlimited-OCR` with its complete weights, no quantization or smaller-model fallback.
Use **Settings → Accelerator → GPU** (T4 x2 if available) and **Internet → On**.
Only GPU 0 is used; two T4s do not automatically combine memory. Keep this notebook and input
dataset private. Add your paper images using **Add Input**, then check their order below.

Kaggle notebook sessions are temporary (documented maximum 12 hours for GPU/CPU sessions).
Your account's available GPU quota and hardware must be checked in Kaggle. This notebook is
for OCR runs and accuracy checks; it does not activate an always-on PaperAI website API.

Run cells in order. Download outputs from `/kaggle/working/paperai-output` before the session ends.
Compare Hindi text, numbers and blanks with the scans; the model can still make transcription errors.
""")

cell("code", """
# Preserve Kaggle's CUDA-matched torch/torchvision rather than replacing its GPU runtime.
import subprocess, sys
subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet",
    "transformers==4.57.1", "Pillow==12.1.1", "einops==0.8.2",
    "addict==2.4.0", "easydict==1.13", "pymupdf==1.27.2.2", "psutil==7.2.2"])
""")

cell("code", (ROOT / "compat.py").read_text(encoding="utf-8"))

cell("code", """
import gc, json, time, re
from pathlib import Path
import torch, torchvision, transformers
from transformers import AutoModel, AutoTokenizer
from huggingface_hub import HfApi

if not torch.cuda.is_available():
    raise RuntimeError("Enable a Kaggle GPU accelerator before running this notebook.")
torch.cuda.set_device(0)
major, minor = torch.cuda.get_device_capability(0)
native_bf16 = major >= 8 and torch.cuda.is_bf16_supported()
DTYPE = torch.bfloat16 if native_bf16 else torch.float16
print("GPU:", torch.cuda.get_device_name(0), "compute capability:", (major, minor))
print("torch:", torch.__version__, "torchvision:", torchvision.__version__,
      "transformers:", transformers.__version__, "dtype:", DTYPE)
print("Free GPU memory (GiB):", round(torch.cuda.mem_get_info(0)[0] / 1024**3, 2))

MODEL_ID = "baidu/Unlimited-OCR"
# Resolve and pin the complete official checkpoint/code to one revision for this run.
MODEL_REVISION = HfApi().model_info(MODEL_ID).sha
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=MODEL_REVISION, trust_remote_code=True)
model = AutoModel.from_pretrained(MODEL_ID, revision=MODEL_REVISION,
    trust_remote_code=True, use_safetensors=True, torch_dtype=DTYPE).eval().cuda()
patch_counts = {} if native_bf16 else enable_fp16_inference(model)
print("Loaded full model revision:", MODEL_REVISION, "FP16 inference adjustments:", patch_counts)
""")

cell("markdown", """
## Select pages in reading order

`PAGE_PATHS` can list exact paths in the required order. Leave it empty to discover image files
and sort naturally by filename. Review the printed order before running OCR.
For a PDF, set `PDF_PATH` instead; pages will render in their original order at 300 DPI.
""")

cell("code", """
PAGE_PATHS = []  # Example: ["/kaggle/input/my-private-papers/page1.jpg", ".../page2.jpg"]
PDF_PATH = None  # Example: "/kaggle/input/my-private-papers/paper.pdf"
INPUT_ROOT = Path("/kaggle/input")
OUTPUT_DIR = Path("/kaggle/working/paperai-output")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def natural_key(path):
    return [(0, int(part)) if part.isdigit() else (1, part.casefold())
            for part in re.split(r"(\\d+)", str(path))]

if PDF_PATH:
    if PAGE_PATHS:
        raise ValueError("Select either PDF_PATH or PAGE_PATHS to avoid duplicate pages.")
    import fitz
    render_dir = Path("/kaggle/working/paperai-pdf-pages")
    render_dir.mkdir(parents=True, exist_ok=True)
    with fitz.open(PDF_PATH) as pdf:
        PAGE_PATHS = []
        for number, page in enumerate(pdf, 1):
            target = render_dir / f"page-{number:04d}.png"
            page.get_pixmap(matrix=fitz.Matrix(300/72, 300/72), alpha=False).save(str(target))
            PAGE_PATHS.append(str(target))
elif not PAGE_PATHS:
    PAGE_PATHS = [str(p) for p in sorted(INPUT_ROOT.rglob("*"), key=natural_key)
                  if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]
if not PAGE_PATHS:
    raise RuntimeError("Add your paper images as a private Kaggle input dataset first.")
if any(not Path(p).is_file() for p in PAGE_PATHS):
    raise FileNotFoundError("One or more selected page paths do not exist.")
for number, path in enumerate(PAGE_PATHS, 1):
    print(number, path)
""")

cell("code", """
# Full-page high-detail 'gundam' settings from Baidu's official Transformers recipe.
# max_length is TOTAL input + generated tokens, not an accuracy score.
MAX_LENGTH = 16384  # Increase up to 32768 if a page hits the limit and GPU memory permits.
results = []
manifest = {"model": MODEL_ID, "revision": MODEL_REVISION, "dtype": str(DTYPE),
            "gpu": torch.cuda.get_device_name(0), "accuracy_verified": False,
            "max_length": MAX_LENGTH, "complete": False, "pages": results}
report_path = OUTPUT_DIR / "run.json"

def checkpoint():
    report_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

checkpoint()
for number, path in enumerate(PAGE_PATHS, 1):
    print(f"Processing page {number}/{len(PAGE_PATHS)}: {Path(path).name}")
    started = time.monotonic()
    generation = {}
    original_generate = model.generate

    def monitored_generate(*args, **kwargs):
        output = original_generate(*args, **kwargs)
        sequences = output.sequences if hasattr(output, "sequences") else output
        length = int(sequences.shape[-1])
        eos_ids = tokenizer.eos_token_id
        eos_ids = eos_ids if isinstance(eos_ids, (list, tuple)) else [eos_ids]
        generation.update(total_tokens=length,
            reached_limit=length >= kwargs.get("max_length", MAX_LENGTH)
                          and int(sequences[0, -1]) not in eos_ids)
        return output

    # Restore the original callable even if the model raises an error.
    had_instance_generate = "generate" in model.__dict__
    previous_generate = model.__dict__.get("generate")
    model.generate = monitored_generate
    try:
        with torch.inference_mode():
            raw = model.infer(tokenizer, prompt="<image>document parsing.",
                image_file=path, output_path=str(OUTPUT_DIR / f"page-{number:04d}"),
                base_size=1024, image_size=640, crop_mode=True,
                max_length=MAX_LENGTH, no_repeat_ngram_size=35, ngram_window=128,
                temperature=0.0, eval_mode=True, save_results=False)
        if not isinstance(raw, str) or not raw.strip():
            raise RuntimeError("The full model returned no transcription.")
        (OUTPUT_DIR / f"page-{number:04d}.raw.txt").write_text(raw, encoding="utf-8")
        if generation.get("reached_limit"):
            raise RuntimeError("This page hit the token limit. Increase MAX_LENGTH and rerun with the same model.")
        text = clean_transcription(raw)
        if not text:
            raise RuntimeError("No transcription remained after removing model tags.")
        (OUTPUT_DIR / f"page-{number:04d}.md").write_text(text, encoding="utf-8")
        results.append({"page": number, "source": Path(path).name, "text": text,
                        "seconds": round(time.monotonic() - started, 2), **generation})
        checkpoint()
    except Exception as error:
        manifest["failed_page"] = number
        manifest["error"] = str(error)
        checkpoint()
        raise
    finally:
        if had_instance_generate:
            model.generate = previous_generate
        else:
            del model.generate
        gc.collect()
        torch.cuda.empty_cache()

# Natural continuation between source pages: no forced page breaks or review report.
combined = "\\n\\n".join(page["text"] for page in results) + "\\n"
(OUTPUT_DIR / "paper-continuous.md").write_text(combined, encoding="utf-8")
(OUTPUT_DIR / "paper-continuous.txt").write_text(combined, encoding="utf-8")
manifest["complete"] = True
checkpoint()
print("Saved transcription:", OUTPUT_DIR / "paper-continuous.txt")
""")

cell("markdown", """
## Verify your paper

Open each scan beside its `page-XXXX.md` output. Check every printed question number,
section label, Hindi character, option and answer line. `run.json` is a separate execution
record, never appended to the paper. Raw output is retained for investigating omissions.
This notebook preserves transcribed numbers; it does not invent missing questions or answers.

The website remains on its current provider until an authenticated, reachable GPU API is
available and verified. A Kaggle notebook session alone does not provide that permanent API.
""")

notebook = {"cells": cells, "metadata": {
    "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
    "language_info": {"name": "python", "version": "3.12"}}, "nbformat": 4, "nbformat_minor": 4}
(ROOT / "PaperAI-Unlimited-OCR.ipynb").write_text(json.dumps(notebook, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
