# Run full Unlimited-OCR on Kaggle's free GPU

**To upload papers on your website instead**, use [the website API notebook](WEBSITE.md).
That flow needs no Kaggle input dataset and connects through the existing Worker adapter
for a temporary authenticated GPU test. This guide describes the separate manual batch flow.

Import `PaperAI-Unlimited-OCR.ipynb` into a new Kaggle notebook. Choose a GPU accelerator,
enable Internet, add the paper images as a **private** input dataset, and run the cells
in order. Check the printed page sequence before running inference. GPU eligibility,
remaining quota and available hardware depend on the Kaggle account; no paid service
is provisioned by this setup.

The notebook downloads Baidu's complete `baidu/Unlimited-OCR` checkpoint (about 6.67 GB
of weights). It uses the official full-page gundam mode, sliding-window repetition
processor and literal document parsing prompt. It retains Kaggle's CUDA-compatible
PyTorch runtime and pins Transformers to Baidu's tested version. Actual Kaggle runtime
compatibility and OCR accuracy still require a GPU run.

T4 and P100 GPUs do not provide native BF16. On those GPUs the same full weights load
in FP16, and `compat.py` adjusts only the inference methods' explicit image/autocast
dtype. It leaves Torch globals and the model architecture unchanged. No quantization,
smaller checkpoint or model fallback is used. A single GPU is used even with T4 x2.
The helper fails explicitly if upstream inference changes instead of silently changing
behavior. The actual checkpoint revision and GPU are saved in `run.json`.

Outputs live in `/kaggle/working/paperai-output`:

- `paper-continuous.txt` and `.md`: combined paper in reading order, without forced page
  breaks or the AI reconstruction/marks review report.
- `page-XXXX.md`: per-page transcription with grounding tags removed.
- `page-XXXX.raw.txt`: original model text for checking omissions.
- `run.json`: separate execution record, errors and completeness status; no invented
  accuracy score. Token-limit failures stop the run so partial text is not reported as complete.

Compare every question number, Hindi word, option and blank with the original scans.
Numbers are preserved from the transcription, never inferred from marks formulas.

Kaggle documents a maximum 12-hour CPU/GPU session and idle termination for interactive
notebooks. Download outputs before the session ends. Free GPU sessions support manual
OCR and evaluation; they do not establish an always-on production endpoint for PaperAI.
The existing website provider remains active until a reachable authenticated inference
API is tested and configured in Cloudflare. This notebook is not evidence that the
website has switched to Unlimited-OCR.

Sources: [Kaggle notebook documentation](https://www.kaggle.com/docs/notebooks),
[Baidu's inference recipe](https://github.com/baidu/Unlimited-OCR#inference),
[official checkpoint](https://huggingface.co/baidu/Unlimited-OCR).

To regenerate the notebook after changing compatibility code:

```bash
python inference/kaggle/build_notebook.py
python tests/kaggle_compat.py
```
