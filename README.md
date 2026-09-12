# PaperAI

Extract text from question papers using advanced OCR (PaddleOCR / EasyOCR).

## Structure

```
paperai/
├── frontend/          # Static HTML/CSS/JS frontend (deployed to Cloudflare Pages)
│   └── index.html
├── backend/           # Python FastAPI backend with OCR
│   ├── main.py
│   ├── api/
│   ├── ocr_engine/
│   └── utils/
└── .github/workflows/
    └── deploy.yml     # Cloudflare Pages deployment
```

## Frontend (Cloudflare Pages)

The frontend is a static HTML site deployed automatically to Cloudflare Pages.

- **URL**: https://paperai-5up.pages.dev
- **Auto-deploys**: On push to `main` branch

## Backend

The Python backend uses FastAPI with PaddleOCR/EasyOCR for text extraction.

### Run locally

```bash
cd backend
python -m venv venv
venv\Scripts\activate      # Windows
pip install -r requirements.txt
python main.py
```

The backend runs on `http://localhost:8000`.

### Supported Languages

- English
- Hindi (Devanagari)
- Telugu

## Deployment

### Cloudflare Pages (Frontend)

Automatic via GitHub Actions. Push to `main` to deploy.

### Backend

The backend needs a separate host (Render, Railway, Fly.io, etc.).

Update `API_BASE` in `frontend/index.html` to point to your backend URL.

## License

MIT
