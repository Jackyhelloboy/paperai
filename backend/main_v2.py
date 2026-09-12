"""
PaperAI FastAPI Server — High-accuracy Hindi/English OCR
"""
import os
import uuid
import time
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List
import uvicorn

from ocr_engine.paperai_engine import get_engine

app = FastAPI(
    title="PaperAI OCR",
    description="High-accuracy Hindi/English OCR engine",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

# Serve static files
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class OCRResponse(BaseModel):
    success: bool
    text: str
    post_processed: str
    confidence: float
    words: List[dict]
    variant: str
    processing_time: float
    filename: Optional[str] = None


class BatchOCRResponse(BaseModel):
    success: bool
    results: List[OCRResponse]
    total_time: float


@app.on_event("startup")
async def startup():
    engine = get_engine()
    print(f"[PaperAI] Engine ready: {type(engine).__name__}")


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the web interface."""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return {"message": "PaperAI OCR v2.0", "engine": "PaddleOCR", "status": "running"}


@app.get("/api")
async def api_info():
    return {"message": "PaperAI OCR v2.0", "engine": "PaddleOCR", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy", "version": "2.0.0"}


@app.post("/ocr", response_model=OCRResponse)
async def ocr_single(file: UploadFile = File(...)):
    """OCR a single image file."""
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(400, "File must be an image")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 50MB)")

    # Decode image
    nparr = np.frombuffer(content, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(400, "Cannot decode image")

    engine = get_engine()
    start = time.time()
    result = engine.process_image(image)
    total_time = time.time() - start

    return OCRResponse(
        success=True,
        text=result.get("text", ""),
        post_processed=result.get("post_processed", ""),
        confidence=result.get("confidence", 0.0),
        words=result.get("words", []),
        variant=result.get("variant", "unknown"),
        processing_time=round(total_time, 3),
        filename=file.filename,
    )


@app.post("/ocr/batch", response_model=BatchOCRResponse)
async def ocr_batch(files: List[UploadFile] = File(...)):
    """OCR multiple image files."""
    engine = get_engine()
    results = []
    total_start = time.time()

    for file in files:
        if not file.content_type or not file.content_type.startswith('image/'):
            continue

        content = await file.read()
        nparr = np.frombuffer(content, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            continue

        result = engine.process_image(image)
        results.append(OCRResponse(
            success=True,
            text=result.get("text", ""),
            post_processed=result.get("post_processed", ""),
            confidence=result.get("confidence", 0.0),
            words=result.get("words", []),
            variant=result.get("variant", "unknown"),
            processing_time=result.get("processing_time", 0),
            filename=file.filename,
        ))

    return BatchOCRResponse(
        success=True,
        results=results,
        total_time=round(time.time() - total_start, 3),
    )


@app.get("/wake")
async def wake():
    return {"status": "awake", "engine": "PaddleOCR"}


if __name__ == "__main__":
    uvicorn.run("main_v2:app", host="0.0.0.0", port=8000, reload=True)
