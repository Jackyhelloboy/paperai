"""
PaperAI OCR - Fast Multi-Engine Extraction
"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
import uvicorn
import os
import uuid
import json
import requests
import cv2
import numpy as np
import easyocr
import time
from datetime import datetime
import re
import unicodedata

import sys
sys.path.insert(0, "D:/Paper Ai/backend")

FRONTEND_DIR = "D:/Paper Ai/frontend"

app = FastAPI(title="PaperAI OCR")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def serve_frontend():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return {"message": "PaperAI OCR Server Running"}


print("Loading EasyOCR...")
easyocr_reader = easyocr.Reader(['en', 'hi'], gpu=False, verbose=False)
API_KEY = "K85588504388957"
print("Ready!")

UPLOAD_DIR = "D:/Paper Ai/uploads"
EXPORT_DIR = "D:/Paper Ai/exports"
CORRECTIONS_DIR = "D:/Paper Ai/training_data/corrections"
for d in [UPLOAD_DIR, EXPORT_DIR, CORRECTIONS_DIR]:
    os.makedirs(d, exist_ok=True)

jobs = {}


def extract_easyocr_fast(image_path):
    """Single fast EasyOCR call on original image"""
    try:
        results = easyocr_reader.readtext(
            image_path, detail=1, paragraph=False,
            text_threshold=0.3, low_text=0.2,
            canvas_size=256, mag_ratio=2.0
        )
        texts = []
        total_conf = 0
        count = 0
        for _, text, conf in results:
            cleaned = text.strip()
            if len(cleaned) > 2 and conf > 0.3:
                texts.append(cleaned)
                total_conf += conf
                count += 1

        if texts:
            combined = " ".join(texts)
            avg_conf = total_conf / count if count > 0 else 0
            return combined, avg_conf
        return "", 0
    except Exception:
        return "", 0


def extract_easyocr_enhanced(image_path):
    """Enhanced EasyOCR - only called if fast fails"""
    image = cv2.imread(image_path)
    if image is None:
        return "", 0

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    denoised = cv2.fastNlMeansDenoising(enhanced, h=15)
    _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    enhanced_path = image_path.replace(".jpg", "_enh.jpg").replace(".png", "_enh.jpg").replace(".jpeg", "_enh.jpg")
    cv2.imwrite(enhanced_path, binary)

    try:
        results = easyocr_reader.readtext(
            enhanced_path, detail=1, paragraph=False,
            text_threshold=0.2, low_text=0.1,
            canvas_size=512, mag_ratio=2.5
        )
        texts = []
        total_conf = 0
        count = 0
        for _, text, conf in results:
            cleaned = text.strip()
            if len(cleaned) > 2 and conf > 0.3:
                texts.append(cleaned)
                total_conf += conf
                count += 1

        if texts:
            combined = " ".join(texts)
            avg_conf = total_conf / count if count > 0 else 0
            return combined, avg_conf
        return "", 0
    except Exception:
        return "", 0
    finally:
        try:
            os.remove(enhanced_path)
        except Exception:
            pass


def extract_engine3(image_path):
    """OCR.space Engine 3"""
    try:
        with open(image_path, "rb") as f:
            image_data = f.read()

        url = "https://api.ocr.space/parse/image"
        headers = {"apikey": API_KEY}
        data = {
            "language": "hin",
            "isOverlayRequired": "false",
            "OCREngine": "3",
            "scale": "true",
            "isTable": "true",
            "detectOrientation": "true"
        }
        files = {"filename": (os.path.basename(image_path), image_data, "image/jpeg")}

        response = requests.post(url, headers=headers, data=data, files=files, timeout=30)
        result = response.json()

        if result.get("ParsedResults"):
            text = result["ParsedResults"][0].get("ParsedText", "")
            return text.strip(), 0.85
        return "", 0
    except Exception:
        return "", 0


def is_valid_hindi_text(text):
    """Check if text contains meaningful Hindi content"""
    if not text or len(text.strip()) < 3:
        return False

    has_hindi = any('\u0900' <= c <= '\u097F' for c in text)
    has_latin = any('a' <= c.lower() <= 'z' for c in text)

    if not has_hindi and not has_latin:
        return False

    garbage_chars = sum(1 for c in text if c in '#%&*<>={}[]|\\~`^')
    if garbage_chars > len(text) * 0.3:
        return False

    return True


def clean_text(text):
    """Clean OCR output - remove garbage, keep meaningful text"""
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()

    words = text.split()
    cleaned_words = []
    for word in words:
        word = word.strip()
        if len(word) < 2:
            continue
        if re.match(r'^[^\w\u0900-\u097F]+$', word):
            continue
        if re.match(r'^[0-9]+$', word):
            continue
        if word in ['==', '--', '##', '%%', '..', '++', '||']:
            continue
        cleaned_words.append(word)

    return ' '.join(cleaned_words)


def extract_text(image_path):
    """Extract text - fast path first, enhanced as fallback"""
    start = time.time()

    best_text = ""
    best_confidence = 0
    best_engine = "none"

    text, conf = extract_easyocr_fast(image_path)
    if text:
        best_text = text
        best_confidence = conf
        best_engine = "easyocr"

    if not best_text or best_confidence < 0.3:
        text, conf = extract_easyocr_enhanced(image_path)
        if text and (conf > best_confidence or len(text) > len(best_text)):
            best_text = text
            best_confidence = conf
            best_engine = "easyocr_enhanced"

    if not best_text:
        text, conf = extract_engine3(image_path)
        if text:
            best_text = text
            best_confidence = conf
            best_engine = "ocrspace_engine3"

    if best_text:
        best_text = clean_text(best_text)

    elapsed = time.time() - start

    return {
        "text": best_text,
        "confidence": round(min(best_confidence, 1.0), 2),
        "engine": best_engine,
        "processing_time": round(elapsed, 2)
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.post("/api/extract")
async def extract(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".bmp", ".tiff"]:
        raise HTTPException(status_code=400, detail="Unsupported file")

    job_id = str(uuid.uuid4())[:8]
    file_path = os.path.join(UPLOAD_DIR, f"{job_id}{ext}")

    with open(file_path, "wb") as f:
        f.write(await file.read())

    try:
        result = extract_text(file_path)

        jobs[job_id] = {
            "id": job_id,
            "filename": file.filename,
            "file_path": file_path,
            "result": result,
            "created_at": datetime.now().isoformat()
        }

        return {
            "job_id": job_id,
            "text": result["text"],
            "confidence": result["confidence"],
            "engine": result["engine"],
            "processing_time": result["processing_time"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/correct/{job_id}")
async def correct(job_id: str, data: dict):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    correction = {
        "job_id": job_id,
        "filename": job["filename"],
        "ocr_text": job["result"]["text"],
        "corrected_text": data.get("corrected_text", ""),
        "timestamp": time.time()
    }

    with open(os.path.join(CORRECTIONS_DIR, f"{job_id}.json"), "w", encoding="utf-8") as f:
        json.dump(correction, f, ensure_ascii=False, indent=2)

    return {"status": "saved", "message": "Correction saved"}


@app.get("/api/export/{job_id}")
async def export(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    text = jobs[job_id]["result"]["text"]
    export_path = os.path.join(EXPORT_DIR, f"{job_id}.txt")

    with open(export_path, "w", encoding="utf-8") as f:
        f.write(text)

    return FileResponse(export_path, filename="extracted.txt", media_type="text/plain")


@app.get("/api/jobs")
async def list_jobs():
    return {"jobs": [{"id": j["id"], "filename": j["filename"]} for j in jobs.values()]}


if __name__ == "__main__":
    print("=" * 60)
    print("PaperAI OCR - Fast Multi-Engine Hindi & English")
    print("Server: http://localhost:8000")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000)
