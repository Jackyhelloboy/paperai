# PaperAI

Extract text from question papers using advanced OCR (PaddleOCR + EasyOCR).

## Architecture

```
paperai/
├── frontend/          # Static HTML → Vercel
│   ├── index.html
│   └── vercel.json
├── backend/           # Python FastAPI → Render
│   ├── main.py
│   ├── ocr_engine.py
│   ├── preprocessor.py
│   ├── trainer.py
│   └── requirements.txt
└── .github/workflows/
    ├── deploy-frontend.yml  # Vercel auto-deploy
    └── deploy-backend.yml   # Render auto-deploy
```

## Frontend (Vercel)

- Auto-deploys on push to `main`
- Connects to Python backend API
- Supports: PDF, JPG, PNG, BMP, TIFF

## Backend (Render)

Python server with:
- **PaddleOCR** — Best for Devanagari/Hindi
- **EasyOCR** — Multi-language support
- **Image preprocessing** — Auto contrast, denoise, deskew, shadow removal
- **Multi-engine voting** — Consensus scoring for accuracy
- **Training pipeline** — Corrections saved for model improvement

### Run locally

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

Backend runs on `http://localhost:8000`

## Deployment

### Frontend (Vercel)
1. Connect repo to Vercel
2. Set root directory to `frontend`
3. Deploy

### Backend (Render)
1. Connect repo to Render
2. Set root directory to `backend`
3. Runtime: Python 3.11
4. Build: `pip install -r requirements.txt`
5. Start: `python main.py`

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ocr` | POST | Upload file for OCR |
| `/api/result/{job_id}` | GET | Get OCR result |
| `/api/correct` | POST | Submit correction |
| `/api/eval` | POST | Evaluate accuracy |
| `/api/stats` | GET | Get training stats |
