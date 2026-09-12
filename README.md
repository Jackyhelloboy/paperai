# PaperAI

Extract text from question papers — Python OCR on Cloudflare Workers.

## Architecture

```
paperai/
├── frontend/              # Static HTML → Cloudflare Pages
│   ├── index.html
│   └── vercel.json
├── worker/                # Python Worker → Cloudflare Workers
│   ├── src/entrypoint.py  # FastAPI + OpenCV OCR
│   ├── pyproject.toml
│   └── wrangler.toml
├── backend/               # Standalone Python server (alternative)
│   ├── main.py
│   ├── ocr_engine.py
│   ├── preprocessor.py
│   ├── trainer.py
│   └── requirements.txt
└── .github/workflows/
    ├── deploy.yml            # Frontend → Cloudflare Pages
    ├── deploy-worker.yml     # Worker → Cloudflare Workers
    ├── deploy-frontend.yml   # Frontend → Vercel (alt)
    └── deploy-backend.yml    # Backend → Render (alt)
```

## Cloudflare Stack (Primary)

| Component | Platform | Tech |
|-----------|----------|------|
| Frontend | Cloudflare Pages | Static HTML |
| Backend | Cloudflare Workers | Python + FastAPI + OpenCV |

### Worker Features
- **OpenCV** preprocessing (deskew, shadow removal, contrast)
- **Adaptive binarization** for text detection
- **Region detection** with contour analysis
- **Multi-variant processing** for accuracy
- Runs on Cloudflare's edge (330+ locations)

## Deploy

### Frontend (Cloudflare Pages)
```bash
npx wrangler pages deploy frontend --project-name=paperai
```

### Worker (Cloudflare Workers)
```bash
cd worker
pip install pywrangler
pywrangler deploy
```

## Local Development

### Worker
```bash
cd worker
pip install pywrangler
pywrangler dev
# Worker runs at http://localhost:8787
```

### Backend (Alternative)
```bash
cd backend
pip install -r requirements.txt
python main.py
# Server runs at http://localhost:8000
```

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ocr` | POST | Upload file for OCR |
| `/api/eval` | POST | Evaluate accuracy |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
