from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from typing import List, Optional
import os
import uuid
import json
from datetime import datetime
from utils.config import settings
from ocr_engine.ocr_engine import OCREngine
from exports.export_manager import ExportManager

router = APIRouter()

ocr_engine = OCREngine()
export_manager = ExportManager()

JOBS_DIR = os.path.join(os.path.dirname(__file__), "..", "jobs_data")
os.makedirs(JOBS_DIR, exist_ok=True)

def _save_job(job_id: str, job_data: dict):
    path = os.path.join(JOBS_DIR, f"{job_id}.json")
    save_data = {k: v for k, v in job_data.items() if k != "result"}
    with open(path, "w") as f:
        json.dump(save_data, f)

def _load_job(job_id: str) -> dict:
    path = os.path.join(JOBS_DIR, f"{job_id}.json")
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return None

@router.post("/upload")
async def upload_file(file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type {file_ext} not supported. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        )
    
    job_id = str(uuid.uuid4())
    file_path = os.path.join(settings.UPLOAD_DIR, f"{job_id}{file_ext}")
    
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max size: 50MB")
    
    with open(file_path, "wb") as f:
        f.write(content)
    
    job = {
        "id": job_id,
        "filename": file.filename,
        "file_path": file_path,
        "status": "processing",
        "progress": 0,
        "message": "Starting...",
        "created_at": datetime.now().isoformat(),
        "result": None
    }
    _save_job(job_id, job)
    
    if background_tasks:
        background_tasks.add_task(_process_file_task, job_id)
    
    return {
        "job_id": job_id,
        "filename": file.filename,
        "status": "processing",
        "message": "File uploaded and processing started."
    }

@router.post("/process/{job_id}")
async def process_file(job_id: str, background_tasks: BackgroundTasks):
    job = _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job["status"] = "processing"
    _save_job(job_id, job)
    
    background_tasks.add_task(_process_file_task, job_id)
    
    return {
        "job_id": job_id,
        "status": "processing",
        "message": "Processing started."
    }

@router.get("/status/{job_id}")
async def get_status(job_id: str):
    job = _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job.get("progress", 0),
        "message": job.get("message", ""),
        "error": job.get("error", None)
    }

@router.get("/result/{job_id}")
async def get_result(job_id: str):
    job = _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail=f"Job status: {job['status']}")
    
    result_path = os.path.join(JOBS_DIR, f"{job_id}_result.json")
    result = None
    if os.path.exists(result_path):
        with open(result_path, "r") as f:
            result = json.load(f)
    
    return {
        "job_id": job_id,
        "filename": job["filename"],
        "result": result,
        "created_at": job["created_at"],
        "completed_at": job.get("completed_at")
    }

@router.post("/correct/{job_id}")
async def submit_correction(job_id: str, corrections: dict):
    job = _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    correction_data = {
        "job_id": job_id,
        "filename": job["filename"],
        "corrections": corrections,
        "timestamp": datetime.now().isoformat()
    }
    
    training_dir = os.path.join(settings.TRAINING_DATA_DIR, "corrections")
    os.makedirs(training_dir, exist_ok=True)
    
    correction_file = os.path.join(training_dir, f"{job_id}.json")
    with open(correction_file, "w", encoding="utf-8") as f:
        json.dump(correction_data, f, ensure_ascii=False, indent=2)
    
    return {"status": "saved", "message": "Correction saved for future model fine-tuning."}

@router.get("/export/{job_id}/{format_type}")
async def export_result(job_id: str, format_type: str):
    job = _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job not completed yet")
    
    if format_type not in ["txt", "docx", "pdf"]:
        raise HTTPException(status_code=400, detail="Format must be txt, docx, or pdf")
    
    result_path = os.path.join(JOBS_DIR, f"{job_id}_result.json")
    result = None
    if os.path.exists(result_path):
        with open(result_path, "r") as f:
            result = json.load(f)
    
    try:
        export_path = export_manager.export(
            result=result,
            format_type=format_type,
            job_id=job_id,
            filename=job["filename"]
        )
        
        return FileResponse(
            path=export_path,
            filename=f"{os.path.splitext(job['filename'])[0]}.{format_type}",
            media_type="application/octet-stream"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

@router.delete("/job/{job_id}")
async def delete_job(job_id: str):
    job = _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if os.path.exists(job.get("file_path", "")):
        os.remove(job["file_path"])
    
    job_path = os.path.join(JOBS_DIR, f"{job_id}.json")
    result_path = os.path.join(JOBS_DIR, f"{job_id}_result.json")
    for p in [job_path, result_path]:
        if os.path.exists(p):
            os.remove(p)
    
    return {"status": "deleted", "message": "Job and file deleted."}

def _update_job(job_id: str, **kwargs):
    job = _load_job(job_id)
    if job:
        job.update(kwargs)
        _save_job(job_id, job)

async def _process_file_task(job_id: str):
    import gc
    job = _load_job(job_id)
    if not job:
        return
    
    try:
        _update_job(job_id, progress=5, message="Loading image...")
        gc.collect()
        
        import cv2
        import numpy as np
        
        ext = os.path.splitext(job["file_path"])[1].lower()
        if ext == ".pdf":
            import fitz
            doc = fitz.open(job["file_path"])
            page = doc[0]
            mat = fitz.Matrix(2, 2)
            pix = page.get_pixmap(matrix=mat)
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
            if pix.n == 4:
                img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
            elif pix.n == 1:
                img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
            doc.close()
            preprocessed = img
        else:
            image = cv2.imread(job["file_path"])
            if image is None:
                raise ValueError("Could not read image")
            h, w = image.shape[:2]
            max_dim = 2000
            if max(h, w) > max_dim:
                scale = max_dim / max(h, w)
                image = cv2.resize(image, None, fx=scale, fy=scale)
            preprocessed = image
        
        gc.collect()
        _update_job(job_id, progress=15, message="Detecting text regions...")
        
        gray = cv2.cvtColor(preprocessed, cv2.COLOR_BGR2GRAY) if len(preprocessed.shape) == 3 else preprocessed
        binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 4)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 5))
        dilated = cv2.dilate(binary, kernel, iterations=1)
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        regions = []
        h, w = preprocessed.shape[:2]
        for contour in contours:
            x, y, bw, bh = cv2.boundingRect(contour)
            if bw > 40 and bh > 12:
                padding = 5
                regions.append({
                    "bbox": [max(0, x-padding), max(0, y-padding), min(w, x+bw+padding), min(h, y+bh+padding)]
                })
        
        if not regions:
            regions = [{"bbox": [0, 0, w, h]}]
        
        _update_job(job_id, progress=30, message=f"OCR: 0/{len(regions)} regions...")
        
        ocr_results = []
        for i, region in enumerate(regions):
            bbox = region["bbox"]
            x1, y1, x2, y2 = [int(b) for b in bbox]
            crop = preprocessed[y1:y2, x1:x2]
            
            if crop.size == 0 or crop.shape[0] < 10 or crop.shape[1] < 10:
                continue
            
            try:
                result = ocr_engine.run_ocr_direct(crop, "en")
                if result and result.get("text", "").strip():
                    result["region_index"] = i
                    result["bbox"] = bbox
                    result["detected_language"] = "en"
                    result["region_type"] = "block"
                    ocr_results.append(result)
            except Exception:
                continue
            
            progress = min(90, 30 + int(60 * (i + 1) / len(regions)))
            _update_job(job_id, progress=progress, message=f"OCR: {i+1}/{len(regions)} regions...")
            gc.collect()
        
        _update_job(job_id, progress=95, message="Finalizing...")
        
        full_text = "\n\n".join(r.get("text", "") for r in ocr_results if r.get("text", "").strip())
        avg_conf = sum(r.get("confidence", 0) for r in ocr_results) / max(len(ocr_results), 1)
        
        final_result = {
            "pages": [{
                "regions": ocr_results,
                "full_text": full_text,
                "confidence": avg_conf
            }],
            "metadata": {
                "filename": job["filename"],
                "processed_at": datetime.now().isoformat(),
                "total_regions": len(ocr_results),
                "languages_detected": ["en"]
            },
            "confidence_summary": {
                "average_confidence": avg_conf,
                "total_regions": len(ocr_results),
                "total_characters": len(full_text)
            }
        }
        
        result_path = os.path.join(JOBS_DIR, f"{job_id}_result.json")
        with open(result_path, "w") as f:
            json.dump(final_result, f, ensure_ascii=False)
        
        _update_job(job_id, progress=100, message="Processing complete!",
                     status="completed", completed_at=datetime.now().isoformat())
        
    except Exception as e:
        _update_job(job_id, status="failed", error=str(e), message=f"Processing failed: {str(e)}")
    finally:
        gc.collect()

@router.get("/jobs")
async def list_jobs():
    jobs = []
    for fname in os.listdir(JOBS_DIR):
        if fname.endswith(".json") and not fname.endswith("_result.json"):
            job = _load_job(fname.replace(".json", ""))
            if job:
                jobs.append({
                    "id": job["id"],
                    "filename": job["filename"],
                    "status": job["status"],
                    "created_at": job["created_at"]
                })
    return {"jobs": jobs}
