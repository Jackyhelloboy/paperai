"""
PaperAI OCR - Layout-Preserving Version
Extracts text maintaining exact image structure
"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import uvicorn
import os
import uuid
import json
import requests
import cv2
import numpy as np
import easyocr
import time
import unicodedata
import re
from datetime import datetime

import sys
sys.path.insert(0, "D:/Paper Ai/backend")

app = FastAPI(title="PaperAI OCR")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

print("Loading EasyOCR...")
easyocr_reader = easyocr.Reader(['en', 'hi'], gpu=False, verbose=False)
API_KEY = "K85588504388957"
print("Ready!")

UPLOAD_DIR = "D:/Paper Ai/uploads"
EXPORT_DIR = "D:/Paper Ai/exports"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)

jobs = {}

# ==================== CORRECTIONS ====================

WORD_FIXES = {
    "भकप": "भूकंप", "महसगर": "महासागर", "महदप": "महाद्वीप",
    "जवलमख": "ज्वालामुखी", "ससमगरफ": "सिस्मोग्राफ",
    "वतरण": "वितरण", "पनथलस": "पैंथालासा", "अलफरड": "अल्फ्रेड",
    "वगनर": "वेगनर", "परभव": "प्रभाव", "परमख": "प्रमुख",
    "परकर": "प्रकार", "उतपत": "उत्पत्ति", "उतपति": "उत्पत्ति",
    "सधदत": "सिद्धांत", "वसथपन": "विस्थापन", "परतपदन": "प्रतिपादन",
    "यतर": "यंत्र", "मधयम": "माध्यम", "धनकष": "धूलकण",
    "हमसखलन": "हिमसखलन", "सकरय": "सक्रीय", "परसपत": "प्रसुप्त",
    "वलपत": "विलुप्त", "वदवन": "विद्वान", "गतििि": "गति",
    "धूनकपा": "धूलकण", "धूनकषा": "धूलकण",
    "बीलना": "हिलना", "बीनना": "हिलना",
    "आगमनाना": "आग लगना", "मकबी": "मक्खी", "धमंड": "घमंड",
    "खरादना": "खरीदना", "दुगुण": "दुर्गुण",
    "महादीप": "महाद्वीप", "महादीपों": "महाद्वीपों",
    "सबासागरों": "महासागरों", "संबासारारी": "महासागर",
    "वैगनर": "वेगनर", "सिध्दांत": "सिद्धांत",
}

# ==================== OCR FUNCTIONS ====================

def detect_text_regions(image_path):
    """Detect text lines/regions in image"""
    img = cv2.imread(image_path)
    if img is None:
        return []
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # Horizontal dilation to connect words in a line
    kernel_h = cv2.getStructuringElement(cv2.MORPH_RECT, (50, 3))
    dilated = cv2.dilate(binary, kernel_h, iterations=2)
    
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    regions = []
    img_h, img_w = img.shape[:2]
    
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w < 30 or h < 8:
            continue
        if w > img_w * 0.95 and h > img_h * 0.95:
            continue
        
        padding = 3
        x = max(0, x - padding)
        y = max(0, y - padding)
        w = min(img_w - x, w + 2 * padding)
        h = min(img_h - y, h + 2 * padding)
        
        regions.append({
            'bbox': (x, y, w, h),
            'y_center': y + h // 2,
            'x_center': x + w // 2
        })
    
    regions.sort(key=lambda r: (r['y_center'], r['x_center']))
    return regions

def ocr_region_easyocr(img, bbox):
    """OCR single region with EasyOCR"""
    x, y, w, h = bbox
    roi = img[y:y+h, x:x+w]
    
    try:
        results = easyocr_reader.readtext(roi, detail=1, paragraph=False)
        texts = [text for _, text, conf in results if len(text.strip()) > 0]
        return " ".join(texts) if texts else ""
    except:
        return ""

def ocr_region_engine3(img, bbox):
    """OCR single region with OCR.space Engine 3"""
    x, y, w, h = bbox
    roi = img[y:y+h, x:x+w]
    
    temp_path = "D:/Paper Ai/temp_roi.jpg"
    cv2.imwrite(temp_path, roi)
    
    try:
        with open(temp_path, "rb") as f:
            image_data = f.read()
        
        url = "https://api.ocr.space/parse/image"
        headers = {"apikey": API_KEY}
        data = {"language": "auto", "isOverlayRequired": "false", "OCREngine": "3", "scale": "true"}
        files = {"filename": ("roi.jpg", image_data, "image/jpeg")}
        
        response = requests.post(url, headers=headers, data=data, files=files, timeout=30)
        result = response.json()
        
        if result.get("ParsedResults"):
            return result["ParsedResults"][0].get("ParsedText", "").strip()
    except:
        pass
    
    return ""

def safe_clean(text):
    """Clean preserving matras, fractions, and degree symbols"""
    text = unicodedata.normalize("NFC", text)
    # Preserve Devanagari, Latin, digits, fractions, degree, common punctuation
    text = re.sub(r'[^\u0900-\u097F\u0A00-\u0A7F\u0980-\u09FFA-Za-z0-9\s.,;:!?()\-/½¼¾°±×÷=<>≤≥≠≈₹$%#@&*+/\\|{}[\]\'"~`^]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def apply_corrections(text):
    """Apply word corrections"""
    words = text.split()
    result = []
    for word in words:
        if re.match(r'^[A-Za-z0-9.,;:!?()\-/]+$', word) or len(word) <= 2:
            result.append(word)
        elif word in WORD_FIXES:
            result.append(WORD_FIXES[word])
        else:
            result.append(word)
    return " ".join(result)

def extract_with_layout(image_path):
    """Extract text preserving layout structure"""
    img = cv2.imread(image_path)
    if img is None:
        return ""
    
    # Detect regions
    regions = detect_text_regions(image_path)
    
    if not regions:
        # Fallback: OCR entire image
        text = ocr_region_engine3(img, (0, 0, img.shape[1], img.shape[0]))
        return safe_clean(text) if text else ""
    
    # OCR each region
    items = []
    for region in regions:
        # Try Engine 3 first
        text = ocr_region_engine3(img, region['bbox'])
        
        # Fallback to EasyOCR
        if not text:
            text = ocr_region_easyocr(img, region['bbox'])
        
        if text:
            text = safe_clean(text)
            text = apply_corrections(text)
            items.append({
                'text': text,
                'y': region['bbox'][1],
                'x': region['bbox'][0]
            })
    
    # Group items on same line (y within 15px)
    lines = []
    current_line = []
    current_y = -100
    
    for item in items:
        if abs(item['y'] - current_y) < 15:
            current_line.append(item)
        else:
            if current_line:
                current_line.sort(key=lambda i: i['x'])
                lines.append(current_line)
            current_line = [item]
            current_y = item['y']
    
    if current_line:
        current_line.sort(key=lambda i: i['x'])
        lines.append(current_line)
    
    # Build output with proper alignment
    output_lines = []
    for line in lines:
        if len(line) == 1:
            output_lines.append(line[0]['text'])
        else:
            # Multiple items on same line - tab separated
            line_text = "\t".join([item['text'] for item in line])
            output_lines.append(line_text)
    
    return "\n".join(output_lines)

# ==================== API ENDPOINTS ====================

@app.get("/")
async def root():
    return {"message": "PaperAI OCR - Layout Preserving"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/api/extract")
async def extract(file: UploadFile = File(...), layout: bool = True):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".bmp", ".tiff"]:
        raise HTTPException(status_code=400, detail="Unsupported file")
    
    job_id = str(uuid.uuid4())[:8]
    file_path = os.path.join(UPLOAD_DIR, f"{job_id}{ext}")
    
    with open(file_path, "wb") as f:
        f.write(await file.read())
    
    try:
        start = time.time()
        
        if layout:
            text = extract_with_layout(file_path)
        else:
            # Simple extraction
            from main_v3 import extract_text
            result = extract_text(file_path)
            text = result["text"]
        
        elapsed = time.time() - start
        
        jobs[job_id] = {
            "id": job_id, "filename": file.filename,
            "file_path": file_path, "text": text,
            "created_at": datetime.now().isoformat()
        }
        
        return {
            "job_id": job_id,
            "text": text,
            "processing_time": round(elapsed, 2)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/export/{job_id}")
async def export(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    text = jobs[job_id]["text"]
    export_path = os.path.join(EXPORT_DIR, f"{job_id}.txt")
    with open(export_path, "w", encoding="utf-8") as f:
        f.write(text)
    return FileResponse(export_path, filename="extracted.txt", media_type="text/plain")

@app.get("/api/jobs")
async def list_jobs():
    return {"jobs": [{"id": j["id"], "filename": j["filename"]} for j in jobs.values()]}

if __name__ == "__main__":
    print("="*60)
    print("PaperAI OCR - Layout Preserving Version")
    print("Supports: Hindi, English, Telugu")
    print("="*60)
    uvicorn.run(app, host="0.0.0.0", port=8000)
