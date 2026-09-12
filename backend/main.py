import os
import io
import gc
import json
import uuid
import base64
import tempfile
import numpy as np
import cv2
from datetime import datetime
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ocr_engine import PaperAIOCR
from preprocessor import ImagePreprocessor
from trainer import OCREvaluator

ocr_engine = None
preprocessor = None
evaluator = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ocr_engine, preprocessor, evaluator
    print("[PaperAI] Loading OCR models...")
    ocr_engine = PaperAIOCR()
    preprocessor = ImagePreprocessor()
    evaluator = OCREvaluator()
    print("[PaperAI] All models loaded!")
    yield
    print("[PaperAI] Shutting down...")

app = FastAPI(
    title="PaperAI OCR",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

JOBS = {}

class CorrectionRequest(BaseModel):
    job_id: str
    corrections: dict

class EvalRequest(BaseModel):
    text: str
    expected: str

@app.get("/")
async def root():
    return {"message": "PaperAI OCR Server v2.0", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy", "engines": ocr_engine.get_engine_info() if ocr_engine else {}}

@app.post("/api/ocr")
async def process_ocr(
    file: UploadFile = File(...),
    language: str = Form("en"),
    preprocessing: str = Form("auto"),
    engine: str = Form("auto")
):
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".pdf", ".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"]:
        raise HTTPException(400, f"Unsupported file type: {ext}")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 50MB)")

    job_id = str(uuid.uuid4())

    try:
        images = await _load_images(content, ext)

        if not images:
            raise HTTPException(400, "Could not extract images from file")

        all_results = []
        total_conf = 0

        for idx, img in enumerate(images):
            if preprocessing != "none":
                img = preprocessor.process(img, mode=preprocessing)

            result = ocr_engine.recognize(img, language=language, engine=engine)
            all_results.append({
                "page": idx + 1,
                "text": result["text"],
                "confidence": result["confidence"],
                "lines": result.get("lines", []),
                "engine_used": result.get("engine_used", "unknown")
            })
            total_conf += result["confidence"]
            del img
            gc.collect()

        full_text = "\n\n".join(r["text"] for r in all_results if r["text"].strip())
        avg_conf = total_conf / max(len(all_results), 1)

        job = {
            "id": job_id,
            "filename": file.filename,
            "status": "completed",
            "created_at": datetime.now().isoformat(),
            "result": {
                "pages": all_results,
                "full_text": full_text,
                "metadata": {
                    "filename": file.filename,
                    "total_pages": len(all_results),
                    "total_characters": len(full_text),
                    "average_confidence": round(avg_conf, 4),
                    "language": language,
                    "engine": engine
                }
            }
        }
        JOBS[job_id] = job

        return {
            "job_id": job_id,
            "status": "completed",
            "result": job["result"]
        }

    except HTTPException:
        raise
    except Exception as e:
        gc.collect()
        raise HTTPException(500, f"OCR failed: {str(e)}")

@app.get("/api/result/{job_id}")
async def get_result(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return {"job_id": job_id, "status": job["status"], "result": job.get("result")}

@app.post("/api/correct")
async def submit_correction(req: CorrectionRequest):
    job = JOBS.get(req.job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    evaluator.save_correction(
        job_id=req.job_id,
        filename=job.get("filename", ""),
        extracted=job.get("result", {}).get("full_text", ""),
        corrections=req.corrections
    )
    return {"status": "saved", "message": "Correction saved for training"}

@app.post("/api/eval")
async def evaluate(req: EvalRequest):
    metrics = evaluator.calculate_metrics(req.text, req.expected)
    return {"metrics": metrics}

@app.get("/api/stats")
async def get_stats():
    return evaluator.get_stats() if evaluator else {"total_corrections": 0}

async def _load_images(content: bytes, ext: str):
    images = []
    nparr = np.frombuffer(content, np.uint8)

    if ext == ".pdf":
        try:
            import fitz
            doc = fitz.open(stream=content, filetype="pdf")
            for page in doc:
                mat = fitz.Matrix(2, 2)
                pix = page.get_pixmap(matrix=mat)
                img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
                if pix.n == 4:
                    img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
                elif pix.n == 1:
                    img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
                images.append(img)
            doc.close()
        except Exception as e:
            print(f"PDF error: {e}")
            return []
    else:
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            h, w = img.shape[:2]
            if max(h, w) > 4000:
                scale = 4000 / max(h, w)
                img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
            elif max(h, w) < 1000:
                scale = 1500 / max(h, w)
                img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
            images.append(img)

    return images

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
